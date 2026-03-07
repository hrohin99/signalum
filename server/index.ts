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

          const { storage } = await import("./storage");
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

              const emailResult = await sendWeeklyDigestEmail(authUser.user.email, digest.content);
              if (emailResult.success) {
                log(`Weekly digest sent to ${authUser.user.email}`, "cron");
              } else {
                log(`Failed to email digest to ${authUser.user.email}: ${emailResult.error}`, "cron");
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
    },
  );
})();
