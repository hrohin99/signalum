import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cron from "node-cron";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    const safeMessage = status < 500
      ? (err.message || "Bad request")
      : "Internal Server Error";

    return res.status(status).json({ message: safeMessage });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      (async () => {
        try {
          const { ensureDatabaseSchema } = await import("./dbSafety");
          await ensureDatabaseSchema();
        } catch (error) {
          console.error("[startup] Database schema safety check failed:", error);
        }

        try {
          const { runRetroactiveMigration } = await import("./retroactiveMigration");
          await runRetroactiveMigration();
        } catch (error) {
          console.error("[startup] Retroactive migration failed:", error);
        }

        try {
          const { fixCenTs18099Entity } = await import("./fixCenTs18099");
          await fixCenTs18099Entity();
        } catch (error) {
          console.error("[startup] CEN/TS 18099 fix failed:", error);
        }
      })();

      cron.schedule("0 6 * * *", async () => {
        log("Daily ambient search triggered by cron", "cron");
        try {
          const { runAmbientSearchForAllTenants } = await import("./ambientSearch");
          const results = await runAmbientSearchForAllTenants();
          log(`Ambient search complete: ${results.length} tenant(s) processed`, "cron");
        } catch (error) {
          console.error("[cron] Ambient search failed:", error);
        }
      }, {
        timezone: "UTC",
      });

      log("Ambient search cron scheduled for 6:00 AM UTC daily", "cron");

      cron.schedule("0 8 * * 1", async () => {
        log("Weekly digest triggered by cron", "cron");
        try {
          if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            log("Skipping weekly digest: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set", "cron");
            return;
          }

          const { storage, pool } = await import("./storage");
          const { generateWeeklyDigest } = await import("./weeklyDigest");
          const { sendWeeklyDigestEmail } = await import("./email");
          const { createClient } = await import("@supabase/supabase-js");

          const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          );

          const users = await storage.getUsersWithWeeklyDigest();
          log(`Found ${users.length} user(s) with weekly digest enabled`, "cron");

          for (const user of users) {
            try {
              const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.userId);
              if (!authUser?.user?.email) {
                log(`No email found for user ${user.userId}, skipping`, "cron");
                continue;
              }

              const digest = await generateWeeklyDigest(user.userId);
              if (!digest) {
                log(`No digest generated for user ${user.userId} (no workspace or recent captures)`, "cron");
                continue;
              }

              const wsResult = await pool.query(
                `SELECT digest_recipients FROM workspaces WHERE user_id = $1 LIMIT 1`,
                [user.userId]
              );
              const digestRecipients = (wsResult.rows[0]?.digest_recipients || []) as any[];
              const extraEmails = digestRecipients
                .map((r: any) => (typeof r === "string" ? r : r.email))
                .filter(Boolean) as string[];

              const allRecipients = [...new Set([authUser.user.email, ...extraEmails].filter(Boolean))];

              for (const recipientEmail of allRecipients) {
                const emailResult = await sendWeeklyDigestEmail(recipientEmail, digest.content);
                if (emailResult.success) {
                  log(`Weekly digest sent to ${recipientEmail}`, "cron");
                } else {
                  log(`Failed to email digest to ${recipientEmail}: ${emailResult.error}`, "cron");
                }
              }
            } catch (userError) {
              console.error(`[cron] Weekly digest failed for user ${user.userId}:`, userError);
            }
          }

          log(`Weekly digest processing complete`, "cron");
        } catch (error) {
          console.error("[cron] Weekly digest failed:", error);
        }
      }, {
        timezone: "UTC",
      });

      log("Weekly digest cron scheduled for Monday 8:00 AM UTC", "cron");

      cron.schedule("0 * * * *", async () => {
        log("Hourly briefing check triggered", "cron");
        try {
          const { storage } = await import("./storage");
          const workspacesWithBriefing = await storage.getWorkspacesWithBriefingEnabled();

          const now = new Date();
          const currentDay = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
          const currentHour = now.getUTCHours().toString().padStart(2, "0") + ":00";

          for (const ws of workspacesWithBriefing) {
            try {
              if (ws.briefingDay !== currentDay) continue;
              if (ws.briefingTime !== currentHour) continue;

              if (ws.briefingLastSent) {
                const sixDaysAgo = new Date();
                sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
                if (ws.briefingLastSent > sixDaysAgo) continue;
              }

              const { generateBriefingForUser, sendBriefingEmail } = await import("./briefingService");
              const briefingData = await generateBriefingForUser(ws.userId);
              if (!briefingData) {
                log(`No briefing data for user ${ws.userId}, skipping`, "cron");
                continue;
              }

              const result = await sendBriefingEmail(ws.userId, ws.briefingEmail, briefingData);
              if (result.success) {
                await storage.updateBriefingLastSent(ws.userId);
                log(`Briefing sent to ${ws.briefingEmail} for user ${ws.userId}`, "cron");
              } else {
                log(`Failed to send briefing to ${ws.briefingEmail}: ${result.error}`, "cron");
              }
            } catch (userError) {
              console.error(`[cron] Briefing failed for user ${ws.userId}:`, userError);
            }
          }

          log("Hourly briefing check complete", "cron");
        } catch (error) {
          console.error("[cron] Briefing scheduler failed:", error);
        }
      }, {
        timezone: "UTC",
      });

      log("Briefing cron scheduled to check every hour UTC", "cron");
    },
  );
})();
