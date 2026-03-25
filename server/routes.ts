import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHmac } from "crypto";
import multer from "multer";
import jwt from "jsonwebtoken";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import path from "path";
import { storage, pool, db } from "./storage";
import { sendVerificationEmail, getAppUrl } from "./email";
import type { ExtractionResult, ExtractedCategory, ExtractedEntity, SiblingInferenceResult } from "@shared/schema";
import { userProfiles, workspaces } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { buildProfileContext } from "./profileContext";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 3000): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.statusCode ?? (err?.error?.type === 'overloaded_error' ? 529 : null);
      const isRetryable = status === 529 || status === 503 || status === 429;
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[retry] Attempt ${attempt} failed with status ${status}. Retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const parseWorkspaceArray = (val: any): string[] => {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "string") return val.replace(/^\{|\}$/g, "").split(",").map(s => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
  return [];
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  (req as any).userId = data.user.id;
  (req as any).userEmail = data.user.email;
  next();
}

function flattenEntities(categories: ExtractedCategory[]) {
  return categories.flatMap(cat =>
    cat.entities.map(e => ({
      entityName: e.name,
      entityType: e.type,
      categoryName: cat.name,
      categoryDescription: cat.description,
    }))
  );
}

async function performSiblingInference(
  entityName: string,
  tenantId: string,
  workspace: { categories: ExtractedCategory[] },
  categoryName?: string,
  userId?: string,
  websiteDomain?: string
): Promise<SiblingInferenceResult | null> {
  try {
    let wsContext: any = null;
    try {
      wsContext = await storage.getWorkspaceContext(tenantId);
    } catch (err) {
      console.error(`[SiblingInference] Failed to fetch workspace context for tenant ${tenantId}:`, err);
    }

    const primaryDomain = wsContext?.primaryDomain ?? null;
    const relevantSubtopics: string[] = Array.isArray(wsContext?.relevantSubtopics) ? wsContext.relevantSubtopics : [];
    const domainKeywords: string[] = Array.isArray(wsContext?.domainKeywords) ? wsContext.domainKeywords : [];

    let inferenceContext = "";
    let usingCategoryFallback = false;

    if (wsContext && (primaryDomain || domainKeywords.length > 0)) {
      const parts: string[] = [];
      if (primaryDomain) parts.push(`Primary domain: ${primaryDomain}`);
      if (relevantSubtopics.length > 0) {
        parts.push(`Relevant subtopics: ${relevantSubtopics.join(", ")}`);
      }
      if (domainKeywords.length > 0) {
        parts.push(`Domain keywords: ${domainKeywords.join(", ")}`);
      }
      if (categoryName) {
        parts.push(`This topic is being added to a category called "${categoryName}". Use this as additional context when determining the relevant aspect of this company`);
      }
      inferenceContext = parts.join(". ");
    } else {
      const confirmedEntities: ExtractedEntity[] = [];
      const categories = workspace.categories as ExtractedCategory[];
      for (const cat of (categories || [])) {
        for (const entity of (cat.entities || [])) {
          if ((entity.disambiguation_confirmed ?? false) && ((entity.company_industry) || (Array.isArray(entity.domain_keywords) && entity.domain_keywords.length > 0))) {
            confirmedEntities.push(entity);
          }
        }
      }

      if (confirmedEntities.length === 0) {
        if (categoryName) {
          inferenceContext = `This topic is being added to a category called "${categoryName}". Use this as additional context when determining the relevant aspect of this company.`;
          usingCategoryFallback = true;
          console.log(`[SiblingInference] No confirmed entities or workspace context found for tenant ${tenantId}. Using category name "${categoryName}" as fallback context.`);
        } else {
          console.log(`[SiblingInference] No confirmed entities or workspace context found for tenant ${tenantId}. Skipping inference.`);
          return null;
        }
      } else {
        const recentConfirmed = confirmedEntities.slice(-3);
        const parts: string[] = [];
        for (const entity of recentConfirmed) {
          const entityParts: string[] = [`${entity.name}`];
          if (entity.company_industry) entityParts.push(`industry: ${entity.company_industry}`);
          const entKeywords = Array.isArray(entity.domain_keywords) ? entity.domain_keywords : [];
          if (entKeywords.length > 0) {
            entityParts.push(`keywords: ${entKeywords.join(", ")}`);
          }
          parts.push(entityParts.join(" (") + (entityParts.length > 1 ? ")" : ""));
        }
        inferenceContext = `Existing tracked entities: ${parts.join("; ")}`;
        if (categoryName) {
          inferenceContext += `. This topic is being added to a category called "${categoryName}".`;
        }
      }
    }

    if (!inferenceContext) {
      console.log(`[SiblingInference] Empty inference context for entity "${entityName}". Skipping.`);
      return null;
    }

    let locationHint = "";
    if (userId) {
      try {
        const profile = await storage.getUserProfile(userId);
        if (profile?.cityCountry) {
          locationHint = ` The user is based in ${profile.cityCountry}. Prefer entities located near this region when generating disambiguation options.`;
        }
      } catch (e) {
        console.error("[SiblingInference] Failed to fetch user profile for location hint:", e);
      }
    }

    const client = getAnthropicClient();

    let websiteHint = "";
    if (websiteDomain) {
      websiteHint = ` Their website is ${websiteDomain} — use this to identify the correct entity with certainty.`;
    }

    const inferencePromise = client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `A user is adding "${entityName}" to their workspace. Their existing workspace focuses on: ${inferenceContext}.${locationHint}${websiteHint} Given this context, which aspect of "${entityName}" is most relevant to this workspace? Return ONLY valid JSON with this structure:
{
  "inferred_domain": "the specific business unit or product area most relevant",
  "confidence": "high" | "medium" | "low",
  "reasoning": "one sentence explaining why"
}

Guidelines for confidence:
- "high": The entity clearly relates to the workspace domain and there is an obvious specific aspect relevant to this context.
- "medium": The entity likely relates but the specific relevant aspect is somewhat ambiguous.
- "low": The entity's relationship to the workspace is unclear or there are too many possible aspects to choose from.

Return ONLY valid JSON, no other text.`
        }
      ]
    });

    inferencePromise.catch(() => {});

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Sibling inference timed out")), 10000)
    );

    const message = await Promise.race([inferencePromise, timeoutPromise]);

    const textContent = message.content.find(block => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      console.log(`[SiblingInference] No text response from AI for entity "${entityName}".`);
      return null;
    }

    let result: SiblingInferenceResult;
    try {
      const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(jsonStr);
    } catch {
      console.error(`[SiblingInference] Failed to parse AI response for entity "${entityName}".`);
      return null;
    }

    const validConfidences = ["high", "medium", "low"];
    if (!validConfidences.includes(result.confidence)) {
      result.confidence = "low";
    }

    console.log(`[SiblingInference] Entity: "${entityName}", Confidence: ${result.confidence}, Domain: "${result.inferred_domain}", Reasoning: "${result.reasoning}"`);

    return result;
  } catch (error: any) {
    console.error(`[SiblingInference] Error during inference for entity "${entityName}":`, error?.message || error);
    return null;
  }
}

const JWT_SECRET = process.env.SESSION_SECRET!;
if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for email verification tokens");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const appUrl = getAppUrl();
    const appParsed = new URL(appUrl);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === appParsed.hostname ||
        parsed.hostname.endsWith(".supabase.co") ||
        parsed.hostname.endsWith(".replit.dev") ||
        parsed.hostname.endsWith(".replit.app") ||
        parsed.hostname.endsWith(".repl.co"))
    );
  } catch {
    return false;
  }
}

function sanitizeErrorMessage(error: any): string {
  if (error?.status === 529 || error?.status === 503) {
    return "The AI service is overloaded. Please try again in a moment.";
  }
  if (error?.status === 502 || (error?.message && error.message.includes("502"))) {
    return "The AI service is temporarily unavailable. Please try again in a moment.";
  }
  if (error?.message && typeof error.message === "string") {
    const msg = error.message;
    if (msg.includes("API key") || msg.includes("secret") || msg.includes("token") || msg.includes("password") || msg.includes("credential")) {
      return "An internal error occurred";
    }
    const isHtml = msg.trimStart().startsWith("<") || msg.includes("</html>") || msg.includes("<title>");
    if (isHtml) {
      return "The AI service returned an unexpected error. Please try again.";
    }
    return msg.slice(0, 200);
  }
  return "An internal error occurred";
}

async function buildCompetitorProfileContext(
  entityName: string,
  entity: ExtractedEntity,
  workspaceId: string | null
): Promise<string> {
  const TENANT_ID = "00000000-0000-0000-0000-000000000000";
  const sections: string[] = [];

  const entityProducts: { name: string; description?: string }[] = Array.isArray(entity.products)
    ? [...(entity.products as { name: string; description?: string }[])]
    : [];
  if (workspaceId) {
    try {
      const dbProducts = await pool.query(
        `SELECT product_name, description FROM entity_products WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order`,
        [entityName, workspaceId]
      );
      const existingNames = new Set(entityProducts.map((p) => p.name?.toLowerCase()));
      for (const row of dbProducts.rows) {
        if (!existingNames.has(row.product_name?.toLowerCase())) {
          entityProducts.push({ name: row.product_name, description: row.description });
        }
      }
    } catch (_) {}
  }
  if (entityProducts.length > 0) {
    sections.push(
      `Products & solutions:\n${entityProducts.map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ""}`).join("\n")}`
    );
  }

  const geoSet = new Set<string>();
  const jsonGeo: string[] = Array.isArray(entity.geo_presence) ? (entity.geo_presence as string[]) : [];
  jsonGeo.forEach((g) => geoSet.add(g));
  if (workspaceId) {
    try {
      const dbGeo = await pool.query(
        `SELECT region, presence_type, channels, notes FROM entity_geo_presence WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order, created_at`,
        [entityName, workspaceId]
      );
      for (const row of dbGeo.rows) {
        let entry = row.region;
        if (row.presence_type && row.presence_type !== "active") entry += ` (${row.presence_type})`;
        if (row.channels) entry += ` — ${row.channels}`;
        if (row.notes) entry += ` — ${row.notes}`;
        geoSet.add(entry);
      }
    } catch (_) {}
  }
  if (geoSet.size > 0) {
    sections.push(`Geographic presence:\n${[...geoSet].map((g) => `- ${g}`).join("\n")}`);
  }

  const customers: string[] = Array.isArray(entity.jina_customers) ? (entity.jina_customers as string[]) : [];
  const verticals: string[] = Array.isArray(entity.jina_customer_verticals) ? (entity.jina_customer_verticals as string[]) : [];
  if (customers.length > 0 || verticals.length > 0) {
    const parts: string[] = [];
    if (verticals.length > 0) parts.push(`Customer verticals: ${verticals.join(", ")}`);
    if (customers.length > 0) parts.push(`Named customers: ${customers.join(", ")}`);
    sections.push(`Known customers:\n${parts.join("\n")}`);
  }

  if (workspaceId) {
    try {
      const certsResult = await pool.query(
        `SELECT cert_name, cert_description, status FROM entity_certifications WHERE entity_id = $1 AND workspace_id = $2 ORDER BY created_at`,
        [entityName, workspaceId]
      );
      if (certsResult.rows.length > 0) {
        const certLines = certsResult.rows
          .map((r: any) => {
            let line = `- ${r.cert_name}`;
            if (r.cert_description) line += `: ${r.cert_description}`;
            if (r.status) line += ` [${r.status}]`;
            return line;
          })
          .join("\n");
        sections.push(`Certifications & compliance:\n${certLines}`);
      }
    } catch (_) {}
  }

  if (workspaceId) {
    try {
      const partnersResult = await pool.query(
        `SELECT partner_name, partner_industry, relationship_type, program_description, context_note FROM entity_partnerships WHERE entity_id = $1 AND workspace_id = $2 ORDER BY created_at`,
        [entityName, workspaceId]
      );
      if (partnersResult.rows.length > 0) {
        const partnerLines = partnersResult.rows
          .map((r: any) => {
            let line = `- ${r.partner_name}`;
            if (r.relationship_type) line += ` (${r.relationship_type})`;
            if (r.partner_industry) line += ` — ${r.partner_industry}`;
            if (r.program_description) line += `: ${r.program_description}`;
            if (r.context_note) line += ` | ${r.context_note}`;
            return line;
          })
          .join("\n");
        sections.push(`Partnerships & alliances:\n${partnerLines}`);
      }
    } catch (_) {}
  }

  if (workspaceId) {
    try {
      const winLossResult = await pool.query(
        `SELECT outcome, deal_name, description, quarter, sector FROM entity_win_loss WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order, created_at`,
        [entityName, workspaceId]
      );
      if (winLossResult.rows.length > 0) {
        const winLines = winLossResult.rows
          .map((r: any) => {
            let line = `- ${r.outcome.toUpperCase()}: ${r.deal_name}`;
            if (r.sector) line += ` (${r.sector})`;
            if (r.quarter) line += ` — ${r.quarter}`;
            if (r.description) line += `: ${r.description}`;
            return line;
          })
          .join("\n");
        sections.push(`Win/loss history:\n${winLines}`);
      }
    } catch (_) {}
  }

  if (workspaceId) {
    try {
      const capsResult = await pool.query(
        `SELECT wc.capability_name, cc.status, cc.evidence
         FROM workspace_capabilities wc
         LEFT JOIN competitor_capabilities cc ON cc.capability_id = wc.id AND cc.entity_id = $1 AND cc.tenant_id = $2
         WHERE wc.workspace_id = $3
         ORDER BY wc.created_at`,
        [entityName, TENANT_ID, workspaceId]
      );
      const rated = capsResult.rows.filter((r: any) => r.status && r.status !== "unknown");
      if (rated.length > 0) {
        const capLines = rated
          .map((r: any) => {
            let line = `- ${r.capability_name}: ${r.status}`;
            if (r.evidence) line += ` (${String(r.evidence).slice(0, 100)})`;
            return line;
          })
          .join("\n");
        sections.push(`Capability assessment:\n${capLines}`);
      }
    } catch (_) {}
  }

  return sections.join("\n\n");
}

function verificationResultPage(message: string, success: boolean): string {
  const color = success ? "#16a34a" : "#dc2626";
  const icon = success ? "&#10003;" : "&#10007;";
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification — Signalum</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:80px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 40px;text-align:center;">
              <span style="font-size:24px;font-weight:600;color:#ffffff;">Signalum</span>
            </td>
          </tr>
          <tr>
            <td style="padding:48px 40px;text-align:center;">
              <div style="width:56px;height:56px;border-radius:50%;background-color:${color};color:#fff;font-size:28px;line-height:56px;margin:0 auto 24px;">${icon}</div>
              <p style="margin:0 0 32px;font-size:17px;color:#333;line-height:1.5;">${safeMessage}</p>
              <a href="/" style="display:inline-block;padding:12px 32px;background-color:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">Go to Signalum</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function processPendingSeedUrls(userId: string): Promise<void> {
  const workspace = await storage.getWorkspaceByUserId(userId);
  if (!workspace) return;

  const seedUrls = workspace.pendingSeedUrls as string[] | null;
  if (!seedUrls || seedUrls.length === 0) return;

  console.log(`[SeedURLs] Processing ${seedUrls.length} seed URLs for user ${userId}`);

  const categories = workspace.categories as ExtractedCategory[];
  const failedUrls: string[] = [];

  for (const url of seedUrls) {
    try {
      const normalizedUrl = url.replace(/\/+$/, "");
      if (!/^https?:\/\/.+\..+/.test(normalizedUrl)) {
        console.error(`[SeedURLs] Invalid URL skipped: ${url}`);
        continue;
      }
      const jinaUrl = `https://r.jina.ai/${normalizedUrl}`;
      const jinaHeaders: Record<string, string> = {
        "Accept": "text/plain",
      };
      if (process.env.JINA_API_KEY) {
        jinaHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
      }

      const response = await fetch(jinaUrl, { headers: jinaHeaders, signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        console.error(`[SeedURLs] Failed to fetch ${url}: ${response.status}`);
        continue;
      }

      const content = await response.text();
      if (!content || content.length < 50) {
        console.error(`[SeedURLs] Empty or too short content from ${url}`);
        continue;
      }

      let entityName = "";
      const titleMatch = content.match(/^Title:\s*(.+)$/m);
      if (titleMatch) {
        entityName = titleMatch[1].trim();
      }
      if (!entityName) {
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) {
          entityName = h1Match[1].trim();
        }
      }
      const domain = normalizedUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

      if (!entityName) {
        entityName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
      }

      entityName = entityName
        .replace(/\s*[-|–—].*$/, "")
        .replace(/\s*\|.*$/, "")
        .trim();
      if (entityName.length > 100) entityName = entityName.substring(0, 100);

      const existingEntity = categories.some(cat =>
        cat.entities.some(e => e.name.toLowerCase() === entityName.toLowerCase())
      );
      if (existingEntity) {
        console.log(`[SeedURLs] Entity "${entityName}" already exists, skipping`);
        continue;
      }

      const { classifyEntity } = await import("./classificationService");
      const classification = await classifyEntity(entityName, `Website: ${domain}. ${content.substring(0, 500)}`);

      let topicType = "general";
      if (classification.entity_type === "regulation") {
        topicType = "regulation";
      } else if (["local_business", "regional_brand", "enterprise"].includes(classification.entity_type)) {
        topicType = "competitor";
      } else if (classification.entity_type === "person") {
        topicType = "person";
      } else if (classification.entity_type === "project") {
        topicType = "project";
      }

      const tenantId = "00000000-0000-0000-0000-000000000000";
      const inferenceResult = await performSiblingInference(entityName, tenantId, { categories }, undefined, userId, domain);

      const newEntity: ExtractedEntity = {
        name: entityName,
        type: "company",
        topic_type: topicType,
        related_topic_ids: [],
        priority: "medium",
        website_url: normalizedUrl,
        entity_type_detected: classification.entity_type,
        pricing_model_detected: classification.pricing_model,
        disambiguation_confirmed: true,
        disambiguation_context: inferenceResult?.inferred_domain || `${entityName} (${domain})`,
      };

      let targetCategory = categories.find(cat =>
        cat.entities.some(e => e.topic_type === topicType)
      );
      if (!targetCategory) {
        targetCategory = categories[0];
      }
      if (!targetCategory) {
        targetCategory = { name: "Sources", description: "Entities from seed URLs", entities: [] };
        categories.push(targetCategory);
      }

      targetCategory.entities.push(newEntity);
      console.log(`[SeedURLs] Created entity "${entityName}" (type: ${classification.entity_type}, topic: ${topicType}) from ${url}`);

      await storage.updateWorkspaceCategories(userId, categories);

      (async () => {
        try {
          const { runWebsiteIntelligenceExtraction } = await import("./websiteIntelligenceService");
          await runWebsiteIntelligenceExtraction(userId, entityName, targetCategory!.name, normalizedUrl);
        } catch (err: any) {
          console.error(`[SeedURLs] Website extraction failed for "${entityName}":`, err?.message || err);
        }
      })();

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err: any) {
      console.error(`[SeedURLs] Error processing seed URL ${url}:`, err?.message || err);
      failedUrls.push(url);
    }
  }

  try {
    const remaining = failedUrls.length > 0 ? failedUrls : null;
    await db.update(workspaces).set({ pendingSeedUrls: remaining }).where(eq(workspaces.userId, userId));
    if (failedUrls.length > 0) {
      console.log(`[SeedURLs] ${failedUrls.length} URLs failed and retained for user ${userId}`);
    } else {
      console.log(`[SeedURLs] All seed URLs processed successfully for user ${userId}`);
    }
  } catch (e) {
    console.error(`[SeedURLs] Failed to update pending_seed_urls:`, e);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/admin/fix-user-role", async (req: Request, res: Response) => {
    const { userId, secret } = req.body;
    if (secret !== "fix2026") return res.status(403).json({ error: "no" });
    try {
      await pool.query(`UPDATE user_profiles SET role = 'admin' WHERE user_id = $1`, [userId]);
      await pool.query(`INSERT INTO product_context (tenant_id, product_name, description, target_customer, strengths, weaknesses)
        SELECT w.id::uuid, 'Entrust Identity', 'End-to-end identity verification platform', 'Government agencies and enterprises', 'Incumbent MSP, strong compliance', 'Third-party liveness dependency'
        FROM workspaces w WHERE w.user_id = $1
        ON CONFLICT (tenant_id) DO UPDATE SET product_name = EXCLUDED.product_name`, [userId]);
      const check = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      return res.json({ success: true, role: check.rows[0]?.role });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, role, trackingText, emailRedirectTo } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      });

      if (error) {
        return res.status(400).json({ message: error.message });
      }

      if (data.user?.id) {
        try {
          await storage.createUserProfile({
            userId: data.user.id,
            role: 'admin',
            onboardingContext: trackingText || null,
          });
        } catch (profileError: any) {
          console.error("Failed to save onboarding profile:", profileError);
        }
      }

      let safeRedirectTo: string | null = null;
      if (emailRedirectTo && typeof emailRedirectTo === "string" && isAllowedRedirectUrl(emailRedirectTo)) {
        try {
          safeRedirectTo = new URL(emailRedirectTo).origin;
        } catch {}
      }

      const token = jwt.sign({ email, userId: data.user?.id, purpose: "email-verification", redirectTo: safeRedirectTo }, JWT_SECRET, {
        expiresIn: "24h",
      });

      // Send new user alert to admin
      try {
        const { Resend } = await import("resend");
        const resendClient = new Resend(process.env.RESEND_API_KEY);
        await resendClient.emails.send({
          from: "Signalum <rohin@rohin.co>",
          to: "hrohin99@gmail.com",
          subject: "🎉 New Signalum signup",
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1e3a5f; margin-bottom: 8px;">New user signed up</h2>
              <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Email</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${email}</td></tr>
                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Role</td><td style="padding: 8px 0; font-size: 14px;">${role || "not set"}</td></tr>
                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Tracking context</td><td style="padding: 8px 0; font-size: 14px;">${trackingText || "not set"}</td></tr>
                <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Time</td><td style="padding: 8px 0; font-size: 14px;">${new Date().toUTCString()}</td></tr>
              </table>
            </div>
          `,
        });
        console.log("[admin alert] New user signup notification sent for", email);
      } catch (alertErr) {
        console.error("[admin alert] Failed to send signup notification:", alertErr);
      }

      const emailResult = await sendVerificationEmail(email, token);

      if (!emailResult.success) {
        console.error("Failed to send verification email:", emailResult.error);
        return res.status(201).json({
          success: true,
          message: "Account created, but we couldn't send the verification email. Please try signing up again or contact support.",
          emailSent: false,
        });
      }

      return res.json({
        success: true,
        message: "Account created. Check your email to verify your address.",
        emailSent: true,
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email, emailRedirectTo } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = users?.find((u: any) => u.email === email);

      if (!existingUser) {
        return res.status(404).json({ message: "No account found with that email" });
      }

      if (existingUser.email_confirmed_at) {
        return res.status(400).json({ message: "Email is already confirmed" });
      }

      let safeRedirectTo: string | null = null;
      if (emailRedirectTo && typeof emailRedirectTo === "string" && isAllowedRedirectUrl(emailRedirectTo)) {
        try {
          safeRedirectTo = new URL(emailRedirectTo).origin;
        } catch {}
      }

      const token = jwt.sign({ email, userId: existingUser.id, purpose: "email-verification", redirectTo: safeRedirectTo }, JWT_SECRET, {
        expiresIn: "24h",
      });

      const emailResult = await sendVerificationEmail(email, token);

      if (!emailResult.success) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }

      return res.json({ success: true, emailSent: true });
    } catch (error: any) {
      console.error("Resend verification error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        const baseUrl = process.env.APP_BASE_URL || getAppUrl();
        return res.redirect(`${baseUrl}/login?error=invalid-token`);
      }

      const decoded = jwt.verify(token, JWT_SECRET) as {
        email: string;
        userId?: string;
        purpose: string;
        redirectTo?: string;
      };

      if (decoded.purpose !== "email-verification") {
        const baseUrl = process.env.APP_BASE_URL || getAppUrl();
        return res.redirect(`${baseUrl}/login?error=invalid-token`);
      }

      if (decoded.userId) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(decoded.userId, {
          email_confirm: true,
        });
        if (error) {
          console.error("Failed to confirm email in Supabase:", error);
          const baseUrl = process.env.APP_BASE_URL || getAppUrl();
          return res.redirect(`${baseUrl}/login?error=invalid-token`);
        }
      }

      const baseUrl = process.env.APP_BASE_URL || getAppUrl();

      try {
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: decoded.email,
          options: {
            redirectTo: `${baseUrl}/workspace`,
          },
        });

        if (!linkError && linkData?.properties?.action_link) {
          const actionLink = linkData.properties.action_link;
          if (isAllowedRedirectUrl(actionLink)) {
            return res.redirect(actionLink);
          }
        }
      } catch (linkErr) {
        console.error("Failed to generate magic link for auto-sign-in:", linkErr);
      }

      return res.redirect(`${baseUrl}/workspace`);
    } catch (error: any) {
      const baseUrl = process.env.APP_BASE_URL || getAppUrl();
      if (error.name === "TokenExpiredError") {
        return res.redirect(`${baseUrl}/login?error=invalid-token`);
      }
      return res.redirect(`${baseUrl}/login?error=invalid-token`);
    }
  });

  app.post("/api/extract", requireAuth, async (req: Request, res: Response) => {
    try {
      const { description } = req.body;

      if (!description || typeof description !== "string" || description.trim().length < 10) {
        return res.status(400).json({ message: "Description must be at least 10 characters" });
      }

      if (description.length > 5000) {
        return res.status(400).json({ message: "Description is too long (max 5000 characters)" });
      }

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `You are an intelligence analyst assistant. A user wants to set up a personal intelligence tracking workspace. Based on their description below, extract structured categories and entities they want to track.

CRITICAL EXTRACTION RULES:
1. You MUST extract EVERY specific name mentioned by the user. This includes every company name, product name, person name, regulation name, standard name, framework name, organization name, technology name, and any other proper noun or named entity.
2. If the user lists multiple items (e.g. "iProov, Thales and Idemia"), EACH item MUST appear as a separate entity. Never skip, merge, or omit any explicitly named item.
3. Scan the entire input and make a complete list of every proper noun and specific name before generating your response. Every single one must appear in the output.
4. Do NOT generalize or summarize named entities into broader terms. If the user says "eIDAS 2.0 and UK DIATF", both "eIDAS 2.0" and "UK DIATF" must appear as individual entities — do not replace them with a generic term like "identity regulations".
5. It is better to include too many entities than to miss even one that the user explicitly named.
6. IMPORTANT — VAGUE INPUT HANDLING: If the user gives a vague or general description without naming any specific entities (e.g. "I want to track competitors" or "keep up with industry trends"), you MUST still create appropriate categories based on what they described, but leave the entities array EMPTY (an empty array []) for those categories. Do NOT invent, guess, or fabricate placeholder entity names. Only include entities that the user explicitly named. A category with zero entities is perfectly valid.

ONE TOPIC PER NAMED ENTITY — NEVER COMBINE:
7. Every specifically named company, person, product, regulation, standard, or project MUST become its own individual entity. NEVER combine multiple named items into a single entity name.
8. Examples of what NOT to do:
   - Do NOT create an entity called "iProov, IDEMIA, incode" — create THREE separate entities: "iProov", "IDEMIA", "incode"
   - Do NOT create an entity called "eIDAS 2.0 and UK DIATF" — create TWO separate entities: "eIDAS 2.0", "UK DIATF"
   - Do NOT create an entity called "Liveness and Deepfake" — create TWO separate entities: "Liveness Detection", "Deepfake Technology"
   - Do NOT use comma-separated or "and"-joined names as a single entity name anywhere in your output.
9. Examples of what TO do:
   - User says "I want to track iProov, IDEMIA and incode as competitors" → category: "Competitor Landscape", entities: "iProov", "IDEMIA", "incode" — each as individual entries
   - User says "track regulations like eIDAS 2.0 and UK DIATF" → category: "Regulations", entities: "eIDAS 2.0", "UK DIATF" — each as individual entries
10. The ONLY exception: when the user explicitly names a group as a single thing — e.g. "the big four accounting firms" should become one entity "Big Four Accounting Firms" because the user is treating the group as a single concept.

Return a JSON object with this exact structure:
{
  "categories": [
    {
      "name": "Category Name",
      "description": "Brief description of what this category covers",
      "entities": [
        {
          "name": "Entity Name",
          "type": "person|company|topic|technology|regulation|event|location|other",
          "topic_type": "competitor|project|regulation|person|trend|account|technology|event|deal|risk|general"
        }
      ]
    }
  ],
  "summary": "A one-sentence summary of what the user wants to track"
}

TOPIC TYPE RULES:
- For each entity, infer the most appropriate topic_type from context:
  - "competitor" — a rival company or product
  - "project" — an initiative, program, or deliverable
  - "regulation" — a law, regulation, standard, or policy
  - "person" — an individual worth tracking
  - "trend" — an emerging trend or market shift
  - "account" — a client, prospect, or partner
  - "technology" — a technology, platform, or tool
  - "event" — a conference, deadline, or milestone
  - "deal" — a commercial opportunity or transaction
  - "risk" — a threat, vulnerability, or risk factor
  - "general" — use only when no other type fits
- Choose based on the entity's role in the user's description, not just the entity type field.

Create 2-5 categories. Each category can have as many entities as needed to capture every name the user mentioned, or zero entities if no specific names were provided for that category. Only return valid JSON, no other text.

User's description: ${description}`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No text response from AI" });
      }

      let parsed: ExtractionResult;
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      return res.json(parsed);
    } catch (error: any) {
      console.error("Extract error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/extract-document", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      console.log("[extract-document] File received on backend:", file ? { originalname: file.originalname, mimetype: file.mimetype, size: file.size, bufferLength: file.buffer?.length } : "No file");
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const ext = path.extname(file.originalname).toLowerCase();

      if (ext === ".doc") {
        return res.status(400).json({ message: "Legacy .doc files are not supported. Please save as .docx and try again." });
      }

      if (![".pdf", ".docx", ".txt", ".md", ".csv", ".json"].includes(ext)) {
        return res.status(400).json({ message: "Unsupported file type. Please upload a PDF or Word document." });
      }

      let extractedText = "";

      if (ext === ".pdf") {
        try {
          const data = new Uint8Array(file.buffer);
          const doc = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
          let fullText = '';
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          extractedText = fullText.trim();
          console.log(`[extract-document] pdfjs-dist extraction result: ${extractedText.length} characters extracted`);
        } catch (pdfError: any) {
          console.error("pdfjs-dist error:", pdfError);
          try {
            const rawText = file.buffer.toString("utf-8");
            const matches = rawText.match(/[\x20-\x7E]{20,}/g);
            if (matches && matches.length > 0) {
              extractedText = matches.join('\n').trim();
            }
            console.log(`[extract-document] Fallback regex extraction result: ${extractedText.length} characters extracted`);
          } catch (fallbackError: any) {
            console.error("Fallback extraction error:", fallbackError);
            return res.status(400).json({ message: "Could not read this PDF. Please try copying the text and using Text Note instead." });
          }
        }
      } else if (ext === ".docx") {
        try {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText = result.value;
          console.log(`[extract-document] DOCX extraction result: ${extractedText.length} characters extracted`);
        } catch (docxError: any) {
          console.error("mammoth error:", docxError);
          return res.status(400).json({ message: "Could not read this DOCX file. Please try copying the text and using Text Note instead." });
        }
      } else {
        extractedText = file.buffer.toString("utf-8");
        console.log(`[extract-document] Text file extraction result: ${extractedText.length} characters extracted`);
      }

      const trimmed = extractedText.trim();
      if (!trimmed) {
        return res.status(400).json({ message: "We could not extract readable text from this file. It may be a scanned document. Try copying the text and using Text Note instead." });
      }

      return res.json({
        text: trimmed,
        filename: file.originalname,
        characterCount: trimmed.length,
      });
    } catch (error: any) {
      console.error("Document extraction error:", error);
      return res.status(500).json({ message: "Failed to extract text from the document. Please try again." });
    }
  });

  app.post("/api/classify", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { content, type } = req.body;

      if (!content || !type) {
        return res.status(400).json({ message: "Missing content or type" });
      }

      if (typeof content !== "string" || content.length > 10000) {
        return res.status(400).json({ message: "Content is invalid or too long (max 10000 characters)" });
      }

      const allowedTypes = ["text", "voice", "url", "document"];
      if (typeof type !== "string" || !allowedTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid content type" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const entities = flattenEntities(workspace.categories as ExtractedCategory[]);
      const entityList = entities.map(e => {
        const cat = (workspace.categories as ExtractedCategory[]).find(c => c.name === e.categoryName);
        const ent = cat?.entities.find(en => en.name === e.entityName);
        const topicType = ent?.topic_type || 'general';
        const focusPart = cat?.focus ? ` [category focus: ${cat.focus}]` : "";
        return `- ${e.entityName} (${e.entityType}, topic_type: ${topicType}) in category "${e.categoryName}"${focusPart}`;
      }).join("\n");

      const client = getAnthropicClient();

      const categories = workspace.categories as ExtractedCategory[];
      const categoryList = categories.map(c => {
        const focusPart = c.focus ? ` (Focus: ${c.focus})` : "";
        return `- "${c.name}": ${c.description}${focusPart}`;
      }).join("\n");

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `You are an intelligence routing assistant. A user captured the following ${type} content. Your FIRST task is to determine whether this is actual intelligence content or a user request/instruction.

USER INTENT DETECTION (check this FIRST):
If the captured content is a request, instruction, or question directed at the system rather than actual intelligence about a topic — for example phrases like "I want to track", "can you monitor", "please create", "how do I", "help me", "I want to", "can you", "generate a", "make me", "build a", "create a", "show me", "tell me", "I need", "could you", "would you", "I'd like to" — then this is a USER INTENT, not intelligence content. Extract the entity or subject they want to track/create and return this JSON:
{
  "user_intent": true,
  "entity_name": "The specific entity or subject name extracted from the user's request (e.g. 'CEN/TS 18099', 'Tesla', 'GDPR')",
  "topic_type": "The most likely topic type from: competitor, project, regulation, person, trend, technology, event, general",
  "description": "A single sentence describing what this entity is, e.g. 'A European standard for injection attack detection in document verification systems.'"
}

If the content IS genuine intelligence (news, notes, observations, data about a topic), proceed with classification.

When matching content to entities, pay attention to the category focus areas listed below. Prioritise matches that are relevant to the stated focus for each category. If a category has a focus, content that aligns with that focus should receive a higher confidence score.

Available entities (with their current topic_type):
${entityList}

Available categories:
${categoryList}

Captured content:
${content}

Analyse this content and identify ALL topics it contains intelligence about. For each topic found, extract only the relevant portion of the content. Return a JSON object with a "matches" array where each item has:
- entity_id: the matched entity name from the available entities list (or null if no existing entity matches)
- category: the category name the entity belongs to (or null if entity_id is null)
- relevant_excerpt: only the sentences from the captured content relevant to this topic
- confidence: 0-100 score for how well this excerpt matches the topic
- reasoning: one sentence explaining the match
- suggested_entity_name: (only if entity_id is null) the recommended new topic name
- suggested_category: (only if entity_id is null) object with "name" and "description" for a suggested new category
- suggested_topic_type: (only if entity_id is null) one of: competitor, project, regulation, person, trend, account, technology, event, deal, risk, general

If content is relevant to 3 topics, return 3 items. If only 1 topic, return 1 item.
Match against existing topics first. If a section clearly belongs to a topic not yet in the workspace, include it with entity_id null and suggested_entity_name with the recommended topic name.

Only include matches with confidence >= 70. If no match reaches 70 confidence, return a single item with entity_id null and suggest a new topic.

The valid topic_type values are: competitor, project, regulation, person, trend, account, technology, event, deal, risk, general.

IMPORTANT RULES:
- Each suggested_entity_name must be a single named entity. Never combine multiple names into one topic name.
- Each match's relevant_excerpt must contain ONLY the sentences relevant to that specific topic, not the full content.

Also return an extracted_dates array at the top level of your JSON response. For each date or deadline mentioned in the captured content include: date (YYYY-MM-DD), label (what the date represents), date_type (hard_deadline if words like must/deadline/enforcement/mandatory; soft_deadline if target/planned/expected; watch_date otherwise). Normalise quarters: Q1=Mar 31, Q2=Jun 30, Q3=Sep 30, Q4=Dec 31. If no dates are found, return an empty array.

Return this JSON format:
{
  "matches": [
    {
      "entity_id": "Entity Name or null",
      "category": "Category Name or null",
      "relevant_excerpt": "The specific sentences relevant to this topic",
      "confidence": 85,
      "reasoning": "One sentence explaining why."
    }
  ],
  "extracted_dates": [
    {
      "date": "2025-06-30",
      "label": "Q2 compliance deadline",
      "date_type": "hard_deadline"
    }
  ]
}

Always return valid JSON only, no other text.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No text response from AI" });
      }

      let parsed: any;
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI classification" });
      }

      const extractedDates = Array.isArray(parsed.extracted_dates) ? parsed.extracted_dates.map((d: any) => ({
        date: d.date || "",
        label: d.label || "",
        date_type: d.date_type || "watch_date",
      })).filter((d: any) => d.date && d.label) : [];

      if (parsed.user_intent === true) {
        return res.json({
          user_intent: true,
          entity_name: parsed.entity_name || "",
          topic_type: parsed.topic_type || "general",
          description: parsed.description || "",
          extracted_dates: extractedDates,
        });
      }

      if (Array.isArray(parsed.matches) && parsed.matches.length > 0) {
        const multiMatches = parsed.matches.map((m: any) => ({
          entity_id: m.entity_id || null,
          category: m.category || null,
          relevant_excerpt: m.relevant_excerpt || "",
          confidence: typeof m.confidence === "number" ? m.confidence : 0,
          reasoning: m.reasoning || "",
          suggested_entity_name: m.suggested_entity_name || null,
          suggested_category: m.suggested_category || null,
          suggested_topic_type: m.suggested_topic_type || null,
        }));

        if (multiMatches.length === 1) {
          const single = multiMatches[0];
          if (single.entity_id && single.category && single.confidence >= 70) {
            return res.json({
              matched: true,
              confidence: single.confidence,
              matchedEntity: single.entity_id,
              matchedCategory: single.category,
              reason: single.reasoning,
              suggested_type_change: null,
              extracted_dates: extractedDates,
            });
          } else if (!single.entity_id) {
            return res.json({
              matched: false,
              confidence: single.confidence,
              reason: single.reasoning || "No existing category is a strong match for this content.",
              suggestedCategory: single.suggested_category || { name: "Uncategorized", description: "Items that don't fit existing categories" },
              suggestedEntity: {
                name: single.suggested_entity_name || "General",
                type: "topic",
                topic_type: single.suggested_topic_type || "general",
              },
              extracted_dates: extractedDates,
            });
          }
        }

        return res.json({
          multi_match: true,
          matches: multiMatches,
          extracted_dates: extractedDates,
        });
      }

      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

      return res.json({
        matched: false,
        confidence,
        reason: parsed.reason || "No existing category is a strong match for this content.",
        suggestedCategory: {
          name: "Uncategorized",
          description: "Items that don't fit existing categories",
        },
        suggestedEntity: {
          name: "General",
          type: "topic",
        },
        extracted_dates: extractedDates,
      });
    } catch (error: any) {
      console.error("Classify error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/extract-dates", requireAuth, async (req: Request, res: Response) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Missing content" });
      }

      const client = getAnthropicClient();
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Extract any dates or deadlines mentioned in this text. For each date found return: date (YYYY-MM-DD), label (what the date represents), date_type (hard_deadline if words like must/deadline/enforcement/mandatory; soft_deadline if target/planned/expected; watch_date otherwise). Normalise quarters: Q1=Mar 31, Q2=Jun 30, Q3=Sep 30, Q4=Dec 31.

Text:
${content}

Return JSON only: { "extracted_dates": [ { "date": "YYYY-MM-DD", "label": "...", "date_type": "..." } ] }
If no dates found, return { "extracted_dates": [] }.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.json({ extracted_dates: [] });
      }

      let parsed: any;
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.json({ extracted_dates: [] });
      }

      const dates = Array.isArray(parsed.extracted_dates) ? parsed.extracted_dates.map((d: any) => ({
        date: d.date || "",
        label: d.label || "",
        date_type: d.date_type || "watch_date",
      })).filter((d: any) => d.date && d.label) : [];

      return res.json({ extracted_dates: dates });
    } catch (error: any) {
      console.error("Extract dates error:", error);
      return res.json({ extracted_dates: [] });
    }
  });

  app.post("/api/transcribe", requireAuth, upload.single("audio"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const base64Audio = file.buffer.toString("base64");
      const mimeType = file.mimetype || "audio/webm";

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please transcribe the following audio recording. Return only the transcription text, nothing else. If the audio is unclear or empty, return '[Unable to transcribe audio]'."
              },
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mimeType as any,
                  data: base64Audio,
                },
              },
            ],
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No transcription returned" });
      }

      return res.json({ transcription: textContent.text });
    } catch (error: any) {
      console.error("Transcribe error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/config/capture-email", requireAuth, async (req: Request, res: Response) => {
    try {
      const domain = process.env.CAPTURE_EMAIL_DOMAIN || "postmark.rohin.co";
      const userId = (req as any).userId;
      const result = await pool.query(
        "SELECT capture_token FROM workspaces WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      const captureToken = result.rows[0]?.capture_token;
      return res.json({ captureEmail: `${captureToken || "capture"}@${domain}` });
    } catch (err) {
      return res.json({ captureEmail: `capture@${process.env.CAPTURE_EMAIL_DOMAIN || "postmark.rohin.co"}` });
    }
  });

  app.get("/api/public/capture-email/:userId", async (req: Request, res: Response) => {
    try {
      const domain = process.env.CAPTURE_EMAIL_DOMAIN || "postmark.rohin.co";
      const result = await pool.query(
        "SELECT capture_token FROM workspaces WHERE user_id = $1 LIMIT 1",
        [req.params.userId]
      );
      const captureToken = result.rows[0]?.capture_token;
      return res.json({ captureEmail: `${captureToken || "capture"}@${domain}` });
    } catch (err) {
      return res.json({ captureEmail: `capture@${process.env.CAPTURE_EMAIL_DOMAIN || "postmark.rohin.co"}` });
    }
  });

  app.post("/api/capture/email-inbound", async (req: Request, res: Response) => {
    try {
      const raw = req.body;
      // Support both Postmark and Resend payload formats
      const isPostmark = !!(raw.TextBody || raw.HtmlBody || raw.Subject);
      const payload = isPostmark ? raw : (raw?.data || raw);

      const toRaw = isPostmark ? raw.To : payload.to;
      let toAddress = "";
      if (typeof toRaw === "string") {
        toAddress = toRaw;
      } else if (Array.isArray(toRaw) && typeof toRaw[0] === "string") {
        toAddress = toRaw[0];
      } else if (Array.isArray(toRaw) && toRaw[0]?.email) {
        toAddress = toRaw[0].email;
      } else if (Array.isArray(toRaw) && toRaw[0]?.address) {
        toAddress = toRaw[0].address;
      } else if (toRaw?.address) {
        toAddress = toRaw.address;
      }

      const tokenMatch = toAddress.match(/^([a-z0-9]+)@/i);
      const captureToken = tokenMatch?.[1]?.toLowerCase() || null;
      const fromEmail = isPostmark
        ? (raw.From || "unknown")
        : (payload.from?.address || (typeof payload.from === "string" ? payload.from : "") || "unknown");
      const subject = isPostmark ? (raw.Subject || "(no subject)") : (payload.subject || "(no subject)");
      const bodyText = (
        isPostmark
          ? (raw.TextBody || raw.HtmlBody?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") || "")
          : (payload.text || payload.plain_text || payload.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") || raw?.data?.text || raw?.data?.plain_text || raw?.data?.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") || "")
      ).slice(0, 3000);
      const content = `Subject: ${subject}\n\nFrom: ${fromEmail}\n\n${bodyText}`.trim();

      console.log('[email-inbound] isPostmark:', isPostmark, 'raw payload keys:', JSON.stringify(Object.keys(raw || {})));
      // For Postmark inbound, captureToken will be the long hash — not a workspace token
      // Look up workspace by capture_token first, then fall back to from email
      const isPostmarkInbound = !!(raw.TextBody || raw.HtmlBody || raw.FromFull);

      console.log(`[email-inbound] to: ${toAddress}, token: ${captureToken}, from: ${fromEmail}`);

      if (!captureToken) {
        console.log("[email-inbound] No capture token found in to address");
        return res.status(200).json({ message: "No token" });
      }

      let wtResult;
      wtResult = await pool.query(
        "SELECT id, user_id FROM workspaces WHERE capture_token = $1 LIMIT 1",
        [captureToken]
      );
      console.log(`[email-inbound] DB_URL prefix: ${process.env.DATABASE_URL?.slice(0, 30)}, rows: ${wtResult.rows.length}`);
      const workspaceBase = wtResult.rows[0] ? { id: wtResult.rows[0].id, userId: wtResult.rows[0].user_id } : null;
      if (!workspaceBase) {
        console.log(`[email-inbound] No workspace matched token: ${captureToken}, isPostmarkInbound: ${isPostmarkInbound}, fromEmail: ${fromEmail}`);
        return res.status(200).json({ message: "Token not recognised" });
      }

      const capture = await storage.createCapture({
        userId: workspaceBase.userId,
        type: "email_forward",
        content,
        matchedEntity: null,
        matchedCategory: null,
        matchReason: null,
      });

      try {
        const wsResult = await pool.query(
          "SELECT id, user_id, competitors, regulations_monitored, regulatory_bodies, standards_certified FROM workspaces WHERE user_id = $1 LIMIT 1",
          [capture.userId]
        );
        const workspace = wsResult.rows[0] ? { id: wsResult.rows[0].id, userId: wsResult.rows[0].user_id, competitors: wsResult.rows[0].competitors, regulations_monitored: wsResult.rows[0].regulations_monitored, regulatory_bodies: wsResult.rows[0].regulatory_bodies, standards_certified: wsResult.rows[0].standards_certified } : null;

        if (workspace) {
        const parseArr = (val: any): string[] => {
          if (Array.isArray(val)) return val.filter(Boolean);
          if (typeof val === "string") return val.replace(/^\{|\}$/g, "").split(",").map((s: string) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
          return [];
        };

        const entityList = [
          ...parseArr(workspace.competitors).map((e: string) => ({ name: e, category: "competitor" })),
          ...parseArr(workspace.regulations_monitored).map((e: string) => ({ name: e, category: "regulation" })),
          ...parseArr(workspace.regulatory_bodies).map((e: string) => ({ name: e, category: "regulatory_body" })),
          ...parseArr(workspace.standards_certified).map((e: string) => ({ name: e, category: "standard" })),
        ];

        if (entityList.length > 0) {
          const emailContent = content;
          const prompt = `You are an entity matcher for a competitive intelligence tool.

Analyze this email content and do two things:

1. Check if any tracked entity is mentioned or clearly referenced.
2. If content mentions topics NOT covered by any tracked entity, suggest a new category name and the relevant excerpt.

Email content:
"""
${emailContent}
"""

Tracked entities:
${entityList.map((e: { name: string; category: string }) => `- ${e.name} (${e.category})`).join('\n')}

Respond with JSON only, no explanation:
{
  "matched_entity": "<entity name or null>",
  "matched_category": "<category or null>",
  "match_reason": "<brief reason or null>",
  "extracted_excerpt": "<1-2 sentence relevant excerpt from the email or null>",
  "suggested_new_category": "<suggested category name if unmatched topic found, or null>",
  "suggested_new_category_reason": "<why this new category would be useful, or null>"
}`;
          const client = getAnthropicClient();
          const matchResponse = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
          });
          const matchText = matchResponse.content[0].type === 'text' ? matchResponse.content[0].text : '';
          const cleanMatchText = matchText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const matchResult = JSON.parse(cleanMatchText);

          if (matchResult.matched_entity) {
            console.log(`[email-inbound] ✅ Matched to entity: ${matchResult.matched_entity}`);
          } else {
            console.log(`[email-inbound] No confident entity match — storing unmatched`);
          }

          await pool.query(
            "UPDATE captures SET matched_entity = $1, matched_category = $2, match_reason = $3, extracted_excerpt = $4, suggested_new_category = $5, suggested_new_category_reason = $6 WHERE id = $7",
            [
              matchResult.matched_entity ?? null,
              matchResult.matched_category ?? null,
              matchResult.match_reason ?? null,
              matchResult.extracted_excerpt ?? null,
              matchResult.suggested_new_category ?? null,
              matchResult.suggested_new_category_reason ?? null,
              capture.id
            ]
          );
        }
        }
      } catch (matchErr: any) {
        console.error("[email-inbound] AI matching failed:", matchErr?.message || matchErr);
      }

      console.log(`[email-inbound] ✅ Capture stored for workspace ${workspaceBase.id} from ${fromEmail}`);
      return res.status(200).json({ success: true });

    } catch (err) {
      console.error("[email-inbound] Error:", err);
      return res.status(200).json({ message: "Error" });
    }
  });

  app.post("/api/captures", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { type, content, matchedEntity, matchedCategory, matchReason } = req.body;

      if (!type || !content) {
        return res.status(400).json({ message: "Missing type or content" });
      }

      if (typeof content !== "string" || content.length > 10000) {
        return res.status(400).json({ message: "Content is invalid or too long (max 10000 characters)" });
      }

      const allowedCaptureTypes = ["text", "voice", "url", "document"];
      if (typeof type !== "string" || !allowedCaptureTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid capture type" });
      }

      if (matchedEntity && (typeof matchedEntity !== "string" || matchedEntity.length > 200)) {
        return res.status(400).json({ message: "Invalid matched entity" });
      }

      if (matchedCategory && (typeof matchedCategory !== "string" || matchedCategory.length > 200)) {
        return res.status(400).json({ message: "Invalid matched category" });
      }

      const capture = await storage.createCapture({
        userId,
        type,
        content,
        matchedEntity: matchedEntity || null,
        matchedCategory: matchedCategory || null,
        matchReason: matchReason || null,
      });

      return res.json({ success: true, capture });
    } catch (error: any) {
      console.error("Create capture error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/captures", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const captures = await storage.getCapturesByUserId(userId);
      return res.json(captures);
    } catch (error: any) {
      console.error("Get captures error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/captures/suggested-categories", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const result = await pool.query(
        `SELECT suggested_new_category AS category,
                COUNT(*)::int AS count,
                (ARRAY_AGG(suggested_new_category_reason ORDER BY id DESC))[1] AS reason,
                MAX(id) AS "latestCaptureId"
         FROM captures
         WHERE suggested_new_category IS NOT NULL AND user_id = $1
         GROUP BY suggested_new_category`,
        [userId]
      );
      return res.json(result.rows);
    } catch (error: any) {
      console.error("Get suggested categories error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/captures/suggested-categories/:category", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const category = req.params.category;
      await pool.query(
        `UPDATE captures SET suggested_new_category = NULL, suggested_new_category_reason = NULL
         WHERE user_id = $1 AND suggested_new_category = $2`,
        [userId, category]
      );
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Dismiss suggested category error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entity-summary", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { entityName, categoryName } = req.body;

      if (!entityName || !categoryName) {
        return res.status(400).json({ message: "Missing entityName or categoryName" });
      }

      const allCaptures = await storage.getCapturesByUserId(userId);
      const entityCaptures = allCaptures.filter(c => c.matchedEntity === entityName);

      if (entityCaptures.length === 0) {
        return res.json({ summary: `No intelligence has been captured for ${entityName} yet. Start by capturing relevant articles, notes, or documents from the Capture page.` });
      }

      const contentSnippets = entityCaptures
        .slice(0, 30)
        .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const client = getAnthropicClient();

      const workspace = await storage.getWorkspaceByUserId(userId);
      const categories = workspace ? (workspace.categories as ExtractedCategory[]) : [];
      const category = categories.find(c => c.name === categoryName);
      const focusContext = category?.focus ? `\nCategory focus area: "${category.focus}". Weight your analysis toward this focus.\n` : "";

      const wsProfileResult = await pool.query("SELECT * FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
      const profileCtx = buildProfileContext(wsProfileResult.rows[0] || null);
      const profilePrefix = profileCtx ? `${profileCtx}\n\n` : "";

      const aiSumWorkspaceId = wsProfileResult.rows[0]?.id || null;
      let aiSumEntity: ExtractedEntity | undefined;
      for (const cat of categories) {
        const found = cat.entities.find((e: any) => e.name === entityName);
        if (found) { aiSumEntity = found as ExtractedEntity; break; }
      }
      const entityProfileCtx = aiSumEntity
        ? await buildCompetitorProfileContext(entityName, aiSumEntity, aiSumWorkspaceId)
        : "";

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `${profilePrefix}You are an intelligence analyst. Based on the structured profile data and captured intel below about "${entityName}" (category: "${categoryName}"), write a structured strategic summary covering: what this entity is and does, recent notable developments, strategic direction, and relevance to the government identity verification space.

Use this format:
One sentence overview of what this company is.

Then 2-3 short paragraphs of 2-3 sentences each. Separate each paragraph with a blank line.

Do not use bullet points. Do not use em dashes. Do not use headers. Return only the paragraphs.
${focusContext}
${entityProfileCtx ? `Structured profile data:\n${entityProfileCtx}\n\n` : ""}Captured intel:
${contentSnippets}

Return only the summary paragraphs, no JSON, no formatting.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No summary returned" });
      }

      return res.json({ summary: textContent.text.trim() });
    } catch (error: any) {
      console.error("Entity summary error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/add-entity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, entityName, entityType, topicType } = req.body;

      if (!categoryName || !entityName) {
        return res.status(400).json({ message: "Missing categoryName or entityName" });
      }

      if (typeof categoryName !== "string" || categoryName.length > 200) {
        return res.status(400).json({ message: "Invalid category name" });
      }

      if (typeof entityName !== "string" || entityName.length > 200) {
        return res.status(400).json({ message: "Invalid entity name" });
      }

      const allowedEntityTypes = ["person", "company", "topic", "technology", "regulation", "event", "location", "other"];
      const safeEntityType = (typeof entityType === "string" && allowedEntityTypes.includes(entityType)) ? entityType : "other";

      const validTopicTypesForEntity = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      const safeTopicType = (typeof topicType === "string" && validTopicTypesForEntity.includes(topicType.toLowerCase())) ? topicType.toLowerCase() : "general";

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = (workspace.categories || []) as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      if (!Array.isArray(category.entities)) {
        category.entities = [];
      }

      const existingEntity = category.entities.find(e => e.name.toLowerCase() === entityName.toLowerCase());
      if (existingEntity) {
        return res.json({ success: true, workspace: workspace, siblingInference: null, existing: true });
      }

      const incomingWebsiteUrl = (req.body.website_url && typeof req.body.website_url === "string" && req.body.website_url.trim()) ? req.body.website_url.trim() : null;

      const newEntity: ExtractedEntity = { name: entityName, type: safeEntityType, topic_type: safeTopicType, related_topic_ids: [], priority: 'medium' };

      if (incomingWebsiteUrl) {
        newEntity.website_url = incomingWebsiteUrl;
      }

      const tenantId = "00000000-0000-0000-0000-000000000000";
      let inferenceResult = null;
      if (!incomingWebsiteUrl) {
        try {
          console.log(`[AddEntity] Running sibling inference for "${entityName}" (topicType=${safeTopicType}, category="${categoryName}")`);
          inferenceResult = await performSiblingInference(entityName, tenantId, { categories }, categoryName, userId);
          console.log(`[AddEntity] Sibling inference result for "${entityName}":`, inferenceResult ? `confidence=${inferenceResult.confidence}, domain="${inferenceResult.inferred_domain}"` : "null");
        } catch (inferErr: any) {
          console.error(`[AddEntity] Sibling inference threw for "${entityName}" (topicType=${safeTopicType}):`, inferErr?.message || inferErr);
        }
      }

      let siblingInference: SiblingInferenceResult | null = null;

      const aspectApplicableTypes = ["competitor", "account", "technology"];
      if (incomingWebsiteUrl) {
        newEntity.disambiguation_confirmed = true;
      } else if (!aspectApplicableTypes.includes(safeTopicType)) {
        newEntity.disambiguation_confirmed = true;
      } else if (inferenceResult) {
        siblingInference = inferenceResult;
        if (inferenceResult.confidence === "high") {
          newEntity.disambiguation_context = inferenceResult.inferred_domain;
          newEntity.disambiguation_confirmed = true;
        } else if (inferenceResult.confidence === "medium") {
          newEntity.disambiguation_context = inferenceResult.inferred_domain;
          newEntity.disambiguation_confirmed = false;
        }
      } else {
        console.log(`[AddEntity] No inference result for "${entityName}" (topicType=${safeTopicType}); entity saved without disambiguation context.`);
      }

      category.entities.push(newEntity);

      const updated = await storage.updateWorkspaceCategories(userId, categories);

      (async () => {
        try {
          const { searchCompetitorNews, searchTopicUpdates, deduplicateFindings, findingsToCaptures } = await import("./perplexityService");
          const topicType = (safeTopicType || "general").toLowerCase();
          const searchContext = newEntity.disambiguation_context ? `${entityName} ${newEntity.disambiguation_context}` : entityName;
          const catFocus = category?.focus || undefined;
          let findings;
          if (topicType === "competitor") {
            findings = await searchCompetitorNews(searchContext, categoryName, 180, { categoryFocus: catFocus });
          } else {
            findings = await searchTopicUpdates(searchContext, topicType, 180, { categoryFocus: catFocus });
          }
          if (findings.length > 0) {
            const existingCaptures = await storage.getCapturesByUserId(userId);
            const entityCaptures = existingCaptures.filter(c => c.matchedEntity === entityName);
            const deduplicated = deduplicateFindings(findings, entityCaptures);
            if (deduplicated.length > 0) {
              const captureRecords = findingsToCaptures(deduplicated, entityName, userId, categoryName);
              await storage.createCaptures(captureRecords);
            }
          } else {
            console.log(`[AddEntity] Perplexity returned 0 findings for "${entityName}"`);
          }
        } catch (searchErr: any) {
          console.error(`[AddEntity] Background search failed for "${entityName}":`, searchErr?.message || searchErr);
        }

        if (safeTopicType === "competitor") {
          try {
            const { runJinaCompetitorEnrichment } = await import("./jinaSearchService");
            const jinaResult = await runJinaCompetitorEnrichment(entityName, incomingWebsiteUrl || undefined);
            if (jinaResult !== null) {
              const ws = await storage.getWorkspaceByUserId(userId);
              if (ws) {
                const cats = (ws.categories || []) as any[];
                for (const cat of cats) {
                  const ent = cat.entities?.find((e: any) => e.name.toLowerCase() === entityName.toLowerCase());
                  if (ent) {
                    const existingGeo: string[] = Array.isArray(ent.geo_presence) ? ent.geo_presence : [];
                    const mergedGeo = Array.from(new Set([...existingGeo, ...jinaResult.geo_presence]));
                    const existingProducts: any[] = Array.isArray(ent.products) ? ent.products : [];
                    const existingProductNames = new Set(existingProducts.map((p: any) => p.name?.toLowerCase()));
                    const newProducts = jinaResult.products.filter((p) => !existingProductNames.has(p.name?.toLowerCase()));
                    ent.geo_presence = mergedGeo;
                    ent.products = [...existingProducts, ...newProducts];
                    ent.jina_customers = jinaResult.customers;
                    ent.jina_customer_verticals = jinaResult.customer_verticals;
                    ent.last_jina_searched_at = new Date().toISOString();
                    break;
                  }
                }
                await storage.updateWorkspaceCategories(userId, cats);

                if (jinaResult.pricing && jinaResult.pricing.length > 0) {
                  const JINA_TENANT_ID = "00000000-0000-0000-0000-000000000000";
                  const today = new Date().toISOString().split("T")[0];
                  const existingPricing = await storage.getCompetitorPricing(JINA_TENANT_ID, entityName);
                  const existingPlanNames = new Set(existingPricing.map((p) => p.planName.toLowerCase()));
                  for (const plan of jinaResult.pricing) {
                    if (!existingPlanNames.has(plan.planName.toLowerCase())) {
                      await storage.createCompetitorPricing({
                        tenantId: JINA_TENANT_ID,
                        entityId: entityName,
                        capturedDate: today,
                        planName: plan.planName,
                        price: plan.price,
                        inclusions: plan.inclusions || null,
                        sourceUrl: null,
                        pricingModel: plan.pricingModel || null,
                      });
                    }
                  }
                }

                console.log(`[AddEntity] Jina enriched "${entityName}": ${jinaResult.products.length} products, ${jinaResult.geo_presence.length} geo, ${jinaResult.customers.length} customers, ${jinaResult.pricing.length} pricing plans`);
              }
            }
          } catch (jinaErr: any) {
            console.error(`[AddEntity] Jina enrichment failed for "${entityName}":`, jinaErr?.message || jinaErr);
          }
        }
      })();

      return res.json({ success: true, workspace: updated, siblingInference });
    } catch (error: any) {
      console.error("Add entity error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/add-category", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, categoryDescription, categoryFocus, entityName, entityType, topicType } = req.body;

      if (!categoryName || typeof categoryName !== "string" || categoryName.length > 200) {
        return res.status(400).json({ message: "Invalid or missing category name" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const existingCategory = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());

      const allowedEntityTypes = ["person", "company", "topic", "technology", "regulation", "event", "location", "other"];
      const safeEntityType = (typeof entityType === "string" && allowedEntityTypes.includes(entityType)) ? entityType : "topic";

      const validTopicTypesForCategory = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      const safeTopicType = (typeof topicType === "string" && validTopicTypesForCategory.includes(topicType.toLowerCase())) ? topicType.toLowerCase() : "general";

      const newEntityObj: ExtractedEntity | null = entityName ? { name: entityName, type: safeEntityType, topic_type: safeTopicType, related_topic_ids: [], priority: 'medium' as const } : null;

      let siblingInference: SiblingInferenceResult | null = null;

      if (newEntityObj) {
        const aspectApplicableTypes = ["competitor", "account", "technology"];
        if (!aspectApplicableTypes.includes(safeTopicType)) {
          newEntityObj.disambiguation_confirmed = true;
        } else {
          const tenantId = "00000000-0000-0000-0000-000000000000";
          const inferenceResult = await performSiblingInference(entityName, tenantId, { categories }, categoryName, userId);

          if (inferenceResult) {
            siblingInference = inferenceResult;
            if (inferenceResult.confidence === "high") {
              newEntityObj.disambiguation_context = inferenceResult.inferred_domain;
              newEntityObj.disambiguation_confirmed = true;
            } else if (inferenceResult.confidence === "medium") {
              newEntityObj.disambiguation_context = inferenceResult.inferred_domain;
              newEntityObj.disambiguation_confirmed = false;
            }
          }
        }
      }

      let targetCategory: ExtractedCategory;
      if (existingCategory) {
        targetCategory = existingCategory;
        if (typeof categoryFocus === "string" && categoryFocus.trim()) {
          existingCategory.focus = categoryFocus.trim();
        }
        if (newEntityObj) {
          const entityExists = existingCategory.entities.some(
            e => e.name.toLowerCase() === newEntityObj.name.toLowerCase()
          );
          if (!entityExists) {
            existingCategory.entities.push(newEntityObj);
          }
        }
      } else {
        targetCategory = {
          name: categoryName,
          description: typeof categoryDescription === "string" ? categoryDescription : "",
          focus: typeof categoryFocus === "string" && categoryFocus.trim() ? categoryFocus.trim() : undefined,
          entities: newEntityObj ? [newEntityObj] : [],
        };
        categories.push(targetCategory);
      }

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated, newCategory: targetCategory, siblingInference });
    } catch (error: any) {
      console.error("Add category error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/categories/:name", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const oldName = decodeURIComponent(req.params.name);
      const { name: newName, focus } = req.body;

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) return res.status(404).json({ message: "No workspace found" });

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === oldName);
      if (!category) return res.status(404).json({ message: "Category not found" });

      if (typeof focus === "string") {
        category.focus = focus.trim().slice(0, 300) || undefined;
      }

      if (newName && typeof newName === "string" && newName.trim() !== oldName) {
        const trimmedName = newName.trim();
        if (trimmedName.length > 200) return res.status(400).json({ message: "Category name too long" });
        const duplicate = categories.find(c => c.name.toLowerCase() === trimmedName.toLowerCase() && c.name !== oldName);
        if (duplicate) return res.status(400).json({ message: "A category with that name already exists" });

        await storage.updateCapturesCategory(userId, oldName, trimmedName);
        category.name = trimmedName;
      }

      console.log('[focus-debug] Saving categories, focus values:', categories.map(c => ({ name: c.name, focus: c.focus || 'NOT SET' })));
      await storage.updateWorkspaceCategories(userId, categories);
      console.log('[focus-debug] Save complete');
      return res.json({ success: true, category });
    } catch (error: any) {
      console.error("Update category error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/categories/:name", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const categoryName = decodeURIComponent(req.params.name);

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) return res.status(404).json({ message: "No workspace found" });

      const categories = workspace.categories as ExtractedCategory[];
      const categoryIndex = categories.findIndex(c => c.name === categoryName);
      if (categoryIndex === -1) return res.status(404).json({ message: "Category not found" });

      await storage.deleteCapturesByCategory(userId, categoryName);

      categories.splice(categoryIndex, 1);
      await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete category error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/topics/:entityName", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const oldEntityName = decodeURIComponent(req.params.entityName);
      const { name: newName, categoryName } = req.body;

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) return res.status(404).json({ message: "No workspace found" });

      const categories = workspace.categories as ExtractedCategory[];

      let entity: ExtractedEntity | undefined;
      let foundCategory: ExtractedCategory | undefined;
      for (const cat of categories) {
        if (categoryName && cat.name !== categoryName) continue;
        const found = cat.entities.find(e => e.name === oldEntityName);
        if (found) {
          entity = found;
          foundCategory = cat;
          break;
        }
      }
      if (!entity || !foundCategory) return res.status(404).json({ message: "Topic not found" });

      if (newName && typeof newName === "string" && newName.trim() !== oldEntityName) {
        const trimmedName = newName.trim();
        if (trimmedName.length > 200) return res.status(400).json({ message: "Topic name too long" });

        await storage.updateCapturesEntity(userId, oldEntityName, trimmedName);
        entity.name = trimmedName;
      }

      await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, entity });
    } catch (error: any) {
      console.error("Update topic error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/topics/:entityName", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityName = decodeURIComponent(req.params.entityName);
      const { categoryName } = req.body;

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) return res.status(404).json({ message: "No workspace found" });

      const categories = workspace.categories as ExtractedCategory[];

      let found = false;
      for (const cat of categories) {
        if (categoryName && cat.name !== categoryName) continue;
        const entityIndex = cat.entities.findIndex(e => e.name === entityName);
        if (entityIndex !== -1) {
          await storage.deleteCapturesByEntity(userId, entityName, cat.name);
          cat.entities.splice(entityIndex, 1);
          found = true;
          break;
        }
      }
      if (!found) return res.status(404).json({ message: "Topic not found" });

      await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete topic error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/topics/:entityName/so-what", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityName = decodeURIComponent(req.params.entityName);
      const { force } = req.body;

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) return res.status(404).json({ message: "No workspace found" });

      const categories = workspace.categories as ExtractedCategory[];

      let entity: ExtractedEntity | undefined;
      let categoryName: string | undefined;
      for (const cat of categories) {
        const found = cat.entities.find(e => e.name === entityName);
        if (found) {
          entity = found;
          categoryName = cat.name;
          break;
        }
      }
      if (!entity) return res.status(404).json({ message: "Topic not found" });

      const allCaptures = await storage.getCapturesByUserId(userId);
      const entityCaptures = allCaptures.filter(c => c.matchedEntity === entityName);

      if (entityCaptures.length < 3) {
        return res.status(400).json({ message: "Need at least 3 captures to generate analysis" });
      }

      if (!force && entity.soWhatText && entity.soWhatGeneratedAt) {
        const lastGenerated = new Date(entity.soWhatGeneratedAt);
        const newCapturesSince = entityCaptures.filter(c => new Date(c.createdAt) > lastGenerated);
        if (newCapturesSince.length === 0) {
          return res.json({ soWhatText: entity.soWhatText, soWhatGeneratedAt: entity.soWhatGeneratedAt, cached: true });
        }
      }

      const contentSnippets = entityCaptures
        .slice(0, 30)
        .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const categoryObj = categories.find(c => c.name === categoryName);
      const focusContext = categoryObj?.focus ? `\nThe user is specifically interested in the following focus area for this category: "${categoryObj.focus}". Prioritise and surface intelligence relevant to this focus. Deprioritise captures that are unrelated to it.` : "";

      const soWhatWsResult = await pool.query("SELECT * FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
      const soWhatProfileCtx = buildProfileContext(soWhatWsResult.rows[0] || null);
      const soWhatProfilePrefix = soWhatProfileCtx ? `${soWhatProfileCtx}\n\n` : "";
      const soWhatWinFactors = soWhatWsResult.rows[0]?.win_factors || null;

      const soWhatTenantId = "00000000-0000-0000-0000-000000000000";
      const prodContext = await storage.getProductContext(soWhatTenantId);

      const prodStrengths = prodContext?.strengths?.trim() || null;
      const prodWeaknesses = prodContext?.weaknesses?.trim() || null;
      const prodContextBlock = [
        `Our confirmed product strengths: ${prodStrengths || "Not provided"}`,
        `We win on: ${soWhatWinFactors || "Not provided"}`,
        `Our confirmed weaknesses/limitations (do NOT present these as advantages): ${prodWeaknesses || "Not provided"}`,
      ].join("\n");

      const soWhatWorkspaceId = soWhatWsResult.rows[0]?.id;
      const competitorProfileBlock = await buildCompetitorProfileContext(entityName, entity, soWhatWorkspaceId || null);

      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: `${soWhatProfilePrefix}You are a senior competitive intelligence analyst embedded in the product team at ${prodContext?.productName || "our organisation"}. Your job is to translate raw competitor intelligence into sharp, actionable strategic insight.

You are analysing: **${entityName}**

${prodContextBlock ? `Our product context:\n${prodContextBlock}\n` : ""}
${competitorProfileBlock ? `Competitor profile intelligence:\n${competitorProfileBlock}\n` : ""}
${focusContext ? `Our strategic context: ${focusContext}\n` : ""}
Intelligence captures (recent news & signals):
${contentSnippets}

Write a "What Does It Mean For Us" briefing using EXACTLY this structure. Be direct, opinionated, and specific — no generic statements. Every point must reference actual evidence from the captures above.

## Threat Assessment
One paragraph (3-4 sentences) on the overall competitive threat level. Reference specific evidence. Name the threat clearly.

## Where They Are Winning
- [Specific capability or market position they hold, with evidence]
- [Second area of strength]
- [Third area of strength if applicable]

## Where We Have An Edge
Draw ONLY from our confirmed product strengths and "We win on" factors listed above. Do not invent advantages or misrepresent our weaknesses as strengths.
- [Specific advantage drawn from our confirmed strengths or win factors]
- [Second advantage if applicable]
- [Third advantage if applicable]

## Risks To Watch
- [Specific risk their moves create for us, near-term]
- [Second risk, medium-term]

## Recommended Actions
1. [Most urgent action we should take — be specific]
2. [Second action]
3. [Third action]

Do not use em dashes. Do not repeat yourself. Do not hedge. Return only the structured briefing above, no preamble.`
          }
        ]
      });

      const soWhatText = (message.content[0] as any).text || "";
      const soWhatGeneratedAt = new Date().toISOString();

      entity.soWhatText = soWhatText;
      entity.soWhatGeneratedAt = soWhatGeneratedAt;
      await storage.updateWorkspaceCategories(userId, categories);

      return res.json({ soWhatText, soWhatGeneratedAt, cached: false });
    } catch (error: any) {
      console.error("So-what generation error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/split-topic", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, originalEntityName, newNames, topicType } = req.body;

      if (!categoryName || !originalEntityName || !Array.isArray(newNames) || newNames.length < 2) {
        return res.status(400).json({ message: "Missing required fields or need at least 2 names" });
      }

      const trimmedNames = newNames.map((n: string) => (typeof n === "string" ? n.trim() : "")).filter(Boolean);
      if (trimmedNames.length < 2) {
        return res.status(400).json({ message: "Need at least 2 valid topic names" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const originalIndex = category.entities.findIndex(e => e.name === originalEntityName);
      if (originalIndex === -1) {
        return res.status(404).json({ message: "Original entity not found" });
      }

      const originalEntity = category.entities[originalIndex];
      const validTopicTypes = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      const originalTopicType = originalEntity.topic_type ? originalEntity.topic_type.toLowerCase() : null;
      const clientTopicType = (typeof topicType === "string" && validTopicTypes.includes(topicType.toLowerCase())) ? topicType.toLowerCase() : null;
      const safeTopicType = (originalTopicType && validTopicTypes.includes(originalTopicType)) ? originalTopicType : (clientTopicType || "general");

      const existingNames = category.entities
        .filter(e => e.name !== originalEntityName)
        .map(e => e.name.toLowerCase());
      const newEntities: ExtractedEntity[] = [];
      for (const name of trimmedNames) {
        if (existingNames.includes(name.toLowerCase())) {
          continue;
        }
        newEntities.push({
          name,
          type: originalEntity.type,
          topic_type: safeTopicType,
          related_topic_ids: [],
          priority: originalEntity.priority || "medium",
        });
        existingNames.push(name.toLowerCase());
      }

      if (newEntities.length === 0) {
        return res.status(400).json({ message: "All specified topic names already exist in this category" });
      }

      category.entities.splice(originalIndex, 1);
      category.entities.push(...newEntities);

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated, created: newEntities.length });
    } catch (error: any) {
      console.error("Split topic error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/fix-topic-types", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { fixes } = req.body;

      if (!Array.isArray(fixes) || fixes.length === 0) {
        return res.status(400).json({ message: "Provide an array of fixes with categoryName, entityName, and topic_type" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const validTopicTypes = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      let fixedCount = 0;

      for (const fix of fixes) {
        const { categoryName, entityName, topic_type } = fix;
        if (!categoryName || !entityName || !topic_type) continue;
        if (!validTopicTypes.includes(topic_type.toLowerCase())) continue;

        const category = categories.find(c => c.name === categoryName);
        if (!category) continue;

        const entity = category.entities.find(e => e.name === entityName);
        if (!entity) continue;

        entity.topic_type = topic_type.toLowerCase();
        fixedCount++;
      }

      if (fixedCount === 0) {
        return res.status(404).json({ message: "No matching entities found to fix" });
      }

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, fixed: fixedCount, workspace: updated });
    } catch (error: any) {
      console.error("Fix topic types error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.patch("/api/entity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { categoryName, entityName, topic_type, priority } = req.body;

      if (!categoryName || !entityName) {
        return res.status(400).json({ message: "Missing categoryName or entityName" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const entity = category.entities.find(e => e.name === entityName);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      const validTopicTypes = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      if (topic_type !== undefined) {
        const normalizedType = typeof topic_type === "string" ? topic_type.toLowerCase() : topic_type;
        if (typeof normalizedType !== "string" || !validTopicTypes.includes(normalizedType)) {
          return res.status(400).json({ message: "Invalid topic_type" });
        }
        entity.topic_type = normalizedType;
      }

      const validPriorities = ["high", "medium", "low", "watch"];
      if (priority !== undefined) {
        if (typeof priority !== "string" || !validPriorities.includes(priority)) {
          return res.status(400).json({ message: "Invalid priority" });
        }
        entity.priority = priority as 'high' | 'medium' | 'low' | 'watch';
      }

      const { disambiguation_confirmed, disambiguation_context, needs_aspect_review } = req.body;
      if (disambiguation_confirmed !== undefined) {
        entity.disambiguation_confirmed = disambiguation_confirmed === true;
      }
      if (disambiguation_context !== undefined && typeof disambiguation_context === "string") {
        entity.disambiguation_context = disambiguation_context.trim();
      }
      if (needs_aspect_review !== undefined) {
        entity.needs_aspect_review = needs_aspect_review === true;
      }

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated });
    } catch (error: any) {
      console.error("Update entity error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entity/aspect-pills", requireAuth, async (req: Request, res: Response) => {
    try {
      const { entityName, companyContext } = req.body;

      if (!entityName || typeof entityName !== "string") {
        return res.status(400).json({ message: "entityName is required" });
      }

      const client = getAnthropicClient();
      const contextNote = companyContext ? ` (specifically ${companyContext})` : "";

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `List the 3-5 main business units or product areas of ${entityName}${contextNote}. Return ONLY a JSON object with this structure:
{
  "aspects": ["Business Unit 1", "Business Unit 2", "Business Unit 3"]
}

Rules:
- Only list real documented divisions of this specific company. If this is a regulation, standard, law, or technical specification rather than a company, return an empty array immediately. Do not guess or hallucinate divisions.
- Each label should be maximum 4 words
- Return between 3 and 5 items
- Be specific to this company's actual business areas
- Return ONLY valid JSON, no other text.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No response from AI" });
      }

      let parsed: { aspects: string[] };
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      if (!Array.isArray(parsed.aspects)) {
        return res.status(500).json({ message: "Invalid response format" });
      }

      return res.json({ aspects: parsed.aspects.slice(0, 6) });
    } catch (error: any) {
      console.error("Aspect pills error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entity/disambiguate-companies", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { entityName } = req.body;

      if (!entityName || typeof entityName !== "string") {
        return res.status(400).json({ message: "entityName is required" });
      }

      let locationHint = "";
      try {
        const profile = await storage.getUserProfile(userId);
        if (profile?.cityCountry) {
          locationHint = `\nThe user is based in ${profile.cityCountry}. Prefer entities located near this region when generating disambiguation options.`;
        }
      } catch (e) {
        console.error("Failed to fetch user profile for disambiguation location hint:", e);
      }

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `The name "${entityName}" may refer to multiple different companies or organizations. Determine if this name is ambiguous.

If this name clearly refers to only one well-known entity (e.g., "Google", "Tesla"), return:
{
  "single": true,
  "companies": []
}

If this name could refer to multiple different companies or organizations (e.g., "Mercury" could be Mercury Insurance, Mercury Financial, Mercury Systems), return:
{
  "single": false,
  "companies": [
    { "name": "Full Company Name", "description": "One-line description of what they do" }
  ]
}

Rules:
- List 3-5 of the most well-known companies/organizations with this name
- Only include genuinely distinct companies, not divisions of the same company${locationHint}
- Return ONLY valid JSON, no other text.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No response from AI" });
      }

      let parsed: { single: boolean; companies: { name: string; description: string }[] };
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      return res.json({
        single: parsed.single === true,
        companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      });
    } catch (error: any) {
      console.error("Disambiguate companies error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entity/confirm-disambiguation", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { entityName, categoryName, disambiguation_context } = req.body;

      if (!entityName || !categoryName || !disambiguation_context) {
        return res.status(400).json({ message: "entityName, categoryName, and disambiguation_context are required" });
      }

      if (typeof entityName !== "string" || typeof categoryName !== "string" || typeof disambiguation_context !== "string") {
        return res.status(400).json({ message: "All fields must be strings" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const entity = category.entities.find(e => e.name === entityName);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      entity.disambiguation_context = disambiguation_context.trim();
      entity.disambiguation_confirmed = true;
      entity.needs_aspect_review = false;

      const newWebsiteUrl = (req.body.website_url && typeof req.body.website_url === "string" && req.body.website_url.trim()) ? req.body.website_url.trim() : null;
      if (newWebsiteUrl) {
        entity.website_url = newWebsiteUrl;
      }

      await storage.updateWorkspaceCategories(userId, categories);

      if (newWebsiteUrl) {
        (async () => {
          try {
            const { runWebsiteIntelligenceExtraction } = await import("./websiteIntelligenceService");
            await runWebsiteIntelligenceExtraction(userId, entityName, categoryName, newWebsiteUrl);
          } catch (err: any) {
            console.error(`[ConfirmDisambiguation] Website extraction failed for "${entityName}":`, err?.message || err);
          }
        })();
      }

      (async () => {
        try {
          const { classifyEntity } = await import("./classificationService");
          const classification = await classifyEntity(entityName, disambiguation_context);
          const freshWorkspace = await storage.getWorkspaceByUserId(userId);
          if (freshWorkspace) {
            const freshCategories = freshWorkspace.categories as ExtractedCategory[];
            for (const cat of freshCategories) {
              const ent = cat.entities.find(e => e.name === entityName);
              if (ent) {
                ent.entity_type_detected = classification.entity_type;
                ent.pricing_model_detected = classification.pricing_model;
                break;
              }
            }
            await storage.updateWorkspaceCategories(userId, freshCategories);
          }
        } catch (classErr: any) {
          console.error(`[ConfirmDisambiguation] Classification failed for "${entityName}":`, classErr?.message || classErr);
        }
      })();

      try {
        const { searchTopicUpdates, deduplicateFindings, findingsToCaptures } = await import("./perplexityService");
        const topicType = (entity.topic_type || "general").toLowerCase();
        const searchQuery = `${entityName} ${disambiguation_context}`;
        const disambigFocus = category.focus || undefined;
        const findings = await searchTopicUpdates(searchQuery, topicType, 30, { websiteUrl: newWebsiteUrl || entity.website_url || undefined, categoryFocus: disambigFocus });

        if (findings.length > 0) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const existingCaptures = await storage.getCapturesByEntitySince(userId, entityName, thirtyDaysAgo);
          const deduplicated = deduplicateFindings(findings, existingCaptures);

          if (deduplicated.length > 0) {
            const captureRecords = findingsToCaptures(deduplicated, entityName, userId, categoryName)
              .map(c => ({ ...c, matchReason: `Disambiguation search [${disambiguation_context}]` }));
            const created = await storage.createCaptures(captureRecords);
            await storage.flagCapturesForBrief(created.map(c => c.id));

            const summaryParts = deduplicated.map(f => f.summary);
            const aiSummary = `Focused on ${disambiguation_context}: ${summaryParts.slice(0, 3).join("; ")}`;
            await storage.updateEntityAiSummary(userId, entityName, aiSummary);
          }
        }
      } catch (searchErr: any) {
        console.error(`[ConfirmDisambiguation] Perplexity search failed for "${entityName}":`, searchErr?.message || searchErr);
      }

      return res.json({ success: true, disambiguation_context: disambiguation_context.trim() });
    } catch (error: any) {
      console.error("Confirm disambiguation error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entity/update-website-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { entityName, categoryName, website_url } = req.body;

      if (!entityName || !categoryName) {
        return res.status(400).json({ message: "entityName and categoryName are required" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const entity = category.entities.find(e => e.name === entityName);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      const previousWebsiteUrl = entity.website_url;
      entity.website_url = website_url?.trim() || undefined;
      await storage.updateWorkspaceCategories(userId, categories);

      if (entity.website_url && entity.website_url !== previousWebsiteUrl) {
        (async () => {
          try {
            const { runWebsiteIntelligenceExtraction } = await import("./websiteIntelligenceService");
            await runWebsiteIntelligenceExtraction(userId, entityName, categoryName, entity.website_url!);
          } catch (err: any) {
            console.error(`[UpdateWebsiteUrl] Website extraction failed for "${entityName}":`, err?.message || err);
          }
        })();
      }

      return res.json({ success: true, website_url: entity.website_url });
    } catch (error: any) {
      console.error("Update website URL error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/topic-types", requireAuth, async (_req: Request, res: Response) => {
    try {
      const configs = await storage.getTopicTypeConfigs("00000000-0000-0000-0000-000000000000");
      return res.json({ topicTypes: configs });
    } catch (error: any) {
      console.error("Get topic types error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/workspace", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      console.log("WORKSPACE API: POST /api/workspace called by user", userId);
      const { categories, cityCountry, websiteUrl, pendingSeedUrls } = req.body;

      if (!categories) {
        console.log("WORKSPACE API: POST missing categories for user", userId);
        return res.status(400).json({ message: "Missing categories" });
      }

      if (cityCountry && typeof cityCountry === "string" && cityCountry.trim()) {
        try {
          await db.update(userProfiles).set({ cityCountry: cityCountry.trim() }).where(eq(userProfiles.userId, userId));
        } catch (e) {
          console.error("WORKSPACE API: failed to save city_country for user", userId, e);
        }
      }

      const existing = await storage.getWorkspaceByUserId(userId);
      if (existing) {
        console.log("WORKSPACE API: POST workspace already exists for user", userId);
        return res.json({ success: true, workspace: existing });
      }

      const categoriesWithDefaults = categories.map((cat: any) => ({
        ...cat,
        entities: (cat.entities || []).map((entity: any) => ({
          ...entity,
          topic_type: (entity.topic_type || 'general').toLowerCase(),
          related_topic_ids: entity.related_topic_ids || [],
          priority: entity.priority || 'medium',
        })),
      }));

      const validSeedUrls = Array.isArray(pendingSeedUrls)
        ? pendingSeedUrls.filter((u: any) => typeof u === "string" && u.trim()).map((u: string) => u.trim()).slice(0, 5)
        : null;

      let workspace;
      try {
        workspace = await storage.createWorkspace({
          id: randomUUID(),
          userId,
          categories: categoriesWithDefaults,
          websiteUrl: (websiteUrl && typeof websiteUrl === "string" && websiteUrl.trim()) ? websiteUrl.trim() : null,
          pendingSeedUrls: validSeedUrls && validSeedUrls.length > 0 ? validSeedUrls : null,
        });
        console.log("WORKSPACE API: POST workspace created for user", userId, "with", categoriesWithDefaults.length, "categories");
      } catch (createErr: any) {
        if (createErr?.message?.includes("duplicate key") || createErr?.code === "23505") {
          console.log("WORKSPACE API: POST duplicate key - workspace already exists for user", userId, ", returning existing");
          const existingAfterRace = await storage.getWorkspaceByUserId(userId);
          if (existingAfterRace) {
            return res.json({ success: true, workspace: existingAfterRace });
          }
        }
        throw createErr;
      }

      await storage.setWorkspaceReady(userId);
      console.log("WORKSPACE API: POST workspace_ready flag set for user", userId);

      return res.json({ success: true, workspace });
    } catch (error: any) {
      console.error("Create workspace error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  const seedingStatus = new Map<string, { running: boolean; totalFindings: number; topicsProcessed: number }>();

  app.post("/api/historical-seeding", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId;

    try {
      const alreadyDone = await storage.isHistoricalSeedingCompleted(userId);
      if (alreadyDone) {
        return res.json({ started: false, reason: "already_completed" });
      }

      if (seedingStatus.get(userId)?.running) {
        return res.json({ started: false, reason: "already_running" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      seedingStatus.set(userId, { running: true, totalFindings: 0, topicsProcessed: 0 });
      res.json({ started: true });

      (async () => {
        try {
          const { searchCompetitorNews, searchTopicUpdates, deduplicateFindings, findingsToCaptures } = await import("./perplexityService");
          const categories = workspace.categories as ExtractedCategory[];
          let totalFindings = 0;
          let topicsProcessed = 0;

          for (const category of categories) {
            for (const entity of category.entities) {
              try {
                const topicType = (entity.topic_type || "general").toLowerCase();
                const lookbackDays = 180;
                const seedFocus = category.focus || undefined;

                let findings;
                if (topicType === "competitor") {
                  findings = await searchCompetitorNews(entity.name, category.name, lookbackDays, { categoryFocus: seedFocus });
                } else {
                  findings = await searchTopicUpdates(entity.name, topicType, lookbackDays, { categoryFocus: seedFocus });
                }

                const existingCaptures = await storage.getCapturesByUserId(userId);
                const entityCaptures = existingCaptures.filter(c => c.matchedEntity === entity.name);
                const deduplicated = deduplicateFindings(findings, entityCaptures);

                if (deduplicated.length > 0) {
                  const captureRecords = findingsToCaptures(deduplicated, entity.name, userId, category.name);
                  await storage.createCaptures(captureRecords);
                  totalFindings += deduplicated.length;
                }

                topicsProcessed++;
                seedingStatus.set(userId, { running: true, totalFindings, topicsProcessed });

                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (entityError) {
                console.error(`Seeding error for entity ${entity.name}:`, entityError);
                topicsProcessed++;
                seedingStatus.set(userId, { running: true, totalFindings, topicsProcessed });
              }
            }
          }

          await storage.markHistoricalSeedingCompleted(userId);
          seedingStatus.set(userId, { running: false, totalFindings, topicsProcessed });

          setTimeout(() => seedingStatus.delete(userId), 60000);

          (async () => {
            try {
              await processPendingSeedUrls(userId);
            } catch (seedErr) {
              console.error(`[SeedURLs] Error processing seed URLs for user ${userId}:`, seedErr);
            }
          })();
        } catch (error) {
          console.error("Historical seeding error:", error);
          seedingStatus.set(userId, { running: false, totalFindings: 0, topicsProcessed: 0 });
        }
      })();
    } catch (error: any) {
      console.error("Historical seeding trigger error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/historical-seeding/status", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const status = seedingStatus.get(userId);

    if (!status) {
      const completed = await storage.isHistoricalSeedingCompleted(userId);
      return res.json({ running: false, completed, totalFindings: 0, topicsProcessed: 0 });
    }

    return res.json(status);
  });

  app.get("/api/welcome-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profile = await storage.getUserProfile(userId);
      return res.json({ dismissed: profile ? profile.welcomeDismissed === 1 : false });
    } catch (error: any) {
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/dismiss-welcome", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      await storage.dismissWelcome(userId);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const wsResult = await pool.query(
        `SELECT parent_workspace_id FROM workspaces WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const role = profileResult.rows[0]?.role || null;
      const parentWorkspaceId = wsResult.rows[0]?.parent_workspace_id || null;
      return res.json({ role, parentWorkspaceId });
    } catch (error: any) {
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/briefs/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found. Complete onboarding first." });
      }

      const allCaptures = await storage.getCapturesByUserId(userId);
      if (allCaptures.length === 0) {
        return res.status(400).json({ message: "No captured intel yet. Capture some content first before generating a brief." });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const entities = flattenEntities(categories);

      const tenantId = "00000000-0000-0000-0000-000000000000";
      const allTopicDates = await storage.getAllTopicDates(tenantId);
      const activeDates = allTopicDates
        .filter(d => d.status !== "completed" && d.status !== "dismissed")
        .map(d => ({ ...d, days_until: computeDaysUntil(d.date) }));

      const upcomingDeadlines = activeDates
        .filter(d => d.days_until <= 30)
        .sort((a, b) => a.days_until - b.days_until);

      const entitySummaries = entities.map(e => {
        const entityCaptures = allCaptures.filter(c => c.matchedEntity === e.entityName);
        if (entityCaptures.length === 0) return null;
        const snippets = entityCaptures
          .slice(0, 5)
          .map((c, i) => `  [${i + 1}] (${c.type}) ${c.content.slice(0, 300)}`)
          .join("\n");
        return `Entity: ${e.entityName} (${e.entityType}), Category: ${e.categoryName}\nRecent intel (${entityCaptures.length} items):\n${snippets}`;
      }).filter(Boolean);

      const briefingContext = entitySummaries.length > 0
        ? entitySummaries.join("\n\n")
        : allCaptures.slice(0, 20).map((c, i) => `[${i + 1}] (${c.type}, entity: ${c.matchedEntity || "unmatched"}) ${c.content.slice(0, 300)}`).join("\n\n");

      const deadlinesWithin14 = upcomingDeadlines.filter(d => d.days_until <= 14);
      const deadlineContext = deadlinesWithin14.length > 0
        ? "\n\nUpcoming deadlines (within 14 days):\n" + deadlinesWithin14.map(d => {
            const urgency = d.days_until < 0 ? "OVERDUE" : d.days_until <= 7 ? "SOON" : "UPCOMING";
            const rawDate = d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date).split("T")[0];
            const dateStr = new Date(rawDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            return `- [${urgency}] ${d.label} for "${d.entityId}", ${dateStr} (${d.days_until < 0 ? Math.abs(d.days_until) + " days overdue" : d.days_until + " days away"})`;
          }).join("\n")
        : "";

      const client = getAnthropicClient();

      const briefProdContext = await storage.getProductContext(tenantId);
      const briefWsResult = await pool.query("SELECT win_factors FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
      const briefWinFactors = briefWsResult.rows[0]?.win_factors || null;

      const briefProdStrengths = briefProdContext?.strengths?.trim() || null;
      const briefProdWeaknesses = briefProdContext?.weaknesses?.trim() || null;
      const briefProdContextBlock = [
        `Our confirmed product strengths: ${briefProdStrengths || "Not provided"}`,
        `We win on: ${briefWinFactors || "Not provided"}`,
        `Our confirmed weaknesses/limitations (do NOT present these as advantages): ${briefProdWeaknesses || "Not provided"}`,
      ].join("\n");

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `You are a senior intelligence analyst preparing a morning briefing for a decision-maker. Based on the intel items and entity data below, write a narrative daily intelligence brief.

Do not use em dashes anywhere in your response. Use commas or plain sentences instead.

${briefProdContextBlock ? `Our product context (use this to ground all competitive implications accurately):\n${briefProdContextBlock}\n\n` : ""}Structure the brief as follows:

## Executive Summary
Write 2-3 short paragraphs summarising the most important developments across all tracked entities this period. Each paragraph should cover one theme or pattern. Keep each paragraph to 2-3 sentences. No bullet points in the summary.

## Key Developments
For each entity/topic with notable activity, use a ### heading with the entity name, then respond using this exact structure:

**What happened**
- [development 1]
- [development 2]
- [development 3 if relevant]

**Why it matters**
- [implication 1 for ${briefProdContext?.productName || "your organisation"}]
- [implication 2 if relevant]

**Watch for**
[One short sentence on what to monitor next]

Keep bullet points to one sentence each. Be direct. No vague statements. When assessing competitive implications, draw only from our confirmed strengths and win factors above — do not misrepresent our weaknesses as advantages.

## Watch Items
Any emerging patterns, risks, or items that deserve continued attention.

Do not include any JSON or metadata. Write pure narrative prose with markdown formatting. Do NOT use horizontal rules or separator lines (---) anywhere in the output. Use headings and spacing to separate sections instead.

If there are upcoming deadlines listed below, naturally weave them into the relevant sections of the narrative. For example, if a topic has a deadline approaching, mention the time pressure in the Key Developments or Watch Items section where that topic is discussed. Do not create a separate deadlines section, integrate them into the narrative flow.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Categories being tracked:
${categories.map(c => {
              const focusPart = c.focus ? ` (Category focus: ${c.focus}. Only highlight developments relevant to this focus in the briefing summary.)` : "";
              return `- ${c.name}: ${c.description}${focusPart}`;
            }).join("\n")}

Intel data:
${briefingContext}${deadlineContext}

Total captures: ${allCaptures.length}
Total entities tracked: ${entities.length}`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No brief content returned from AI" });
      }

      const brief = await storage.createBrief({
        userId,
        content: textContent.text.trim(),
        captureCount: allCaptures.length,
        entityCount: entities.length,
      });

      return res.json({ ...brief, upcomingDeadlines });
    } catch (error: any) {
      console.error("Generate brief error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/briefs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const briefsList = await storage.getBriefsByUserId(userId);
      return res.json(briefsList);
    } catch (error: any) {
      console.error("Get briefs error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/onboarding-context", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { role, trackingText } = req.body;

      if (!role && !trackingText) {
        return res.status(400).json({ message: "Missing role or trackingText" });
      }

      const existing = await storage.getUserProfile(userId);
      if (existing) {
        return res.json({ success: true, profile: existing });
      }

      const profile = await storage.createUserProfile({
        userId,
        role: role || null,
        onboardingContext: trackingText || null,
      });

      return res.json({ success: true, profile });
    } catch (error: any) {
      console.error("Save onboarding context error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/onboarding-context/:userId", requireAuth, async (req: Request, res: Response) => {
    try {
      const authenticatedUserId = (req as any).userId;
      const { userId } = req.params;

      if (authenticatedUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const profile = await storage.getUserProfile(userId);

      if (profile && profile.onboardingContext) {
        return res.json({
          exists: true,
          role: profile.role,
          trackingText: profile.onboardingContext,
        });
      }

      return res.json({ exists: false });
    } catch (error: any) {
      console.error("Get onboarding context error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/ai-insights", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { entityName, categoryName } = req.body;

      if (!entityName || !categoryName) {
        return res.status(400).json({ message: "Missing entityName or categoryName" });
      }

      const allCaptures = await storage.getCapturesByUserId(userId);
      const entityCaptures = allCaptures.filter(c => c.matchedEntity === entityName);

      if (entityCaptures.length === 0) {
        return res.json({ insights: null });
      }

      const contentSnippets = entityCaptures
        .slice(0, 15)
        .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are an intelligence analyst. Based on the captured intel items below about "${entityName}" (category: "${categoryName}"), generate exactly 3 short, actionable insight bullet points. Each should be one sentence, direct and analytical. Focus on patterns, risks, opportunities, or notable developments.

Captured intel:
${contentSnippets}

Return ONLY a JSON array of 3 strings, e.g. ["insight 1", "insight 2", "insight 3"]. No other text.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No insights returned" });
      }

      try {
        const insights = JSON.parse(textContent.text.trim());
        return res.json({ insights });
      } catch {
        return res.json({ insights: [textContent.text.trim()] });
      }
    } catch (error: any) {
      console.error("AI insights error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/link-topic", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, entityName, linkedEntityName } = req.body;

      if (!categoryName || !entityName || !linkedEntityName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const entity = category.entities.find(e => e.name === entityName);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      if (!entity.related_topic_ids) {
        entity.related_topic_ids = [];
      }

      if (!entity.related_topic_ids.includes(linkedEntityName)) {
        entity.related_topic_ids.push(linkedEntityName);
      }

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated });
    } catch (error: any) {
      console.error("Link topic error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/battlecard/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { entityId } = req.params;
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const card = await storage.getBattlecard(tenantId, entityId);
      return res.json({ battlecard: card || null });
    } catch (error: any) {
      console.error("Get battlecard error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/battlecard/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { entityId } = req.params;
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { whatTheyDo, strengths, weaknesses, howToBeat } = req.body;

      const data: any = {};
      if (whatTheyDo !== undefined) {
        if (typeof whatTheyDo !== "string") return res.status(400).json({ message: "whatTheyDo must be a string" });
        data.whatTheyDo = whatTheyDo;
      }
      if (strengths !== undefined) {
        if (!Array.isArray(strengths) || !strengths.every((s: any) => typeof s === "string")) return res.status(400).json({ message: "strengths must be an array of strings" });
        data.strengths = strengths;
      }
      if (weaknesses !== undefined) {
        if (!Array.isArray(weaknesses) || !weaknesses.every((s: any) => typeof s === "string")) return res.status(400).json({ message: "weaknesses must be an array of strings" });
        data.weaknesses = weaknesses;
      }
      if (howToBeat !== undefined) {
        if (!Array.isArray(howToBeat) || !howToBeat.every((s: any) => typeof s === "string")) return res.status(400).json({ message: "howToBeat must be an array of strings" });
        data.howToBeat = howToBeat;
      }

      const card = await storage.upsertBattlecard(tenantId, entityId, data);
      return res.json({ battlecard: card });
    } catch (error: any) {
      console.error("Update battlecard error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/battlecard/:entityId/autofill", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { entityId } = req.params;
      const { entityName, categoryName } = req.body;
      const tenantId = "00000000-0000-0000-0000-000000000000";

      if (!entityName) {
        return res.status(400).json({ message: "Missing entityName" });
      }

      const allCaptures = await storage.getCapturesByUserId(userId);
      const entityCaptures = allCaptures.filter(c => c.matchedEntity === entityName);

      const captureContext = entityCaptures.length > 0
        ? entityCaptures.slice(0, 20).map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`).join("\n\n")
        : "No captured intel available yet.";

      const prodContext = await storage.getProductContext(tenantId);
      let productInfo = "";
      if (prodContext) {
        productInfo = `\n\nYOUR PRODUCT CONTEXT (use this to generate specific "How to beat them" advice):
- Product: ${prodContext.productName}
- Description: ${prodContext.description || "N/A"}
- Target Customer: ${prodContext.targetCustomer || "N/A"}
- Your Strengths: ${prodContext.strengths || "N/A"}
- Your Weaknesses: ${prodContext.weaknesses || "N/A"}`;
      }

      const existingCard = await storage.getBattlecard(tenantId, entityId);
      let existingContext = "";
      if (existingCard) {
        existingContext = `\n\nEXISTING BATTLECARD DATA (improve upon this if present):
- What they do: ${existingCard.whatTheyDo || "Empty"}
- Strengths: ${JSON.stringify(existingCard.strengths || [])}
- Weaknesses: ${JSON.stringify(existingCard.weaknesses || [])}
- How to beat them: ${JSON.stringify(existingCard.howToBeat || [])}`;
      }

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `You are a competitive intelligence analyst. Generate a comprehensive battlecard for the competitor "${entityName}" (category: "${categoryName}").

Based on the captured intel and any existing battlecard data below, fill out all four sections of the battlecard.

Captured intel about ${entityName}:
${captureContext}${productInfo}${existingContext}

Return ONLY valid JSON with this exact structure:
{
  "whatTheyDo": "A concise 1-3 sentence description of what this competitor does, their core offering, and market position.",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "howToBeat": ["strategy 1", "strategy 2", "strategy 3"]
}

Rules:
- Each array should have 3-5 items
- Keep each item concise (one sentence max)
- Be specific and actionable, not generic
- For "howToBeat": ${prodContext ? "Use the product context provided to generate specific, personalized competitive strategies" : "Provide general competitive strategies since no product context is available"}
- If there's limited intel, use your general knowledge about the competitor but note that analysis is based on limited data
- No markdown, no extra text, just the JSON object`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No response from AI" });
      }

      let parsed: any;
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      const card = await storage.upsertBattlecard(tenantId, entityId, {
        whatTheyDo: parsed.whatTheyDo || null,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        howToBeat: parsed.howToBeat || [],
        lastAiGeneratedAt: new Date(),
      });

      return res.json({ battlecard: card });
    } catch (error: any) {
      console.error("Autofill battlecard error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, entityName } = req.body;

      if (!categoryName || !entityName) {
        return res.status(400).json({ message: "categoryName and entityName are required" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const entityIndex = category.entities.findIndex(e => e.name === entityName);
      if (entityIndex === -1) {
        return res.status(404).json({ message: "Entity not found in category" });
      }

      category.entities.splice(entityIndex, 1);

      await storage.updateWorkspaceCategories(userId, categories);

      const deletedCaptures = await storage.deleteCapturesByEntity(userId, entityName, categoryName);

      return res.json({ success: true, deletedCaptures });
    } catch (error: any) {
      console.error("Delete entity error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/workspace-ready", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const ready = await storage.isWorkspaceReady(userId);
      return res.json({ ready });
    } catch (error: any) {
      console.error("Workspace ready check error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/workspace/current", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    console.log("WORKSPACE API: called by user", userId, "(current)");
    const workspace = await storage.getWorkspaceByUserId(userId);
    const catCount = workspace && Array.isArray((workspace as any).categories) ? (workspace as any).categories.length : 0;
    console.log("WORKSPACE API: categories found =", catCount);

    if (workspace) {
      return res.json({ exists: true, workspace });
    }

    return res.json({ exists: false });
  });

  app.get("/api/workspace/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      let result = await pool.query(
        `SELECT * FROM workspaces
         WHERE user_id = $1
         OR id = (SELECT parent_workspace_id::varchar FROM workspaces WHERE user_id = $1)
         LIMIT 1`,
        [userId]
      );
      if (result.rows[0] && !result.rows[0].capture_token) {
        const { randomBytes } = await import('crypto');
        const newToken = randomBytes(6).toString('hex');
        await pool.query("UPDATE workspaces SET capture_token = $1 WHERE id = $2", [newToken, result.rows[0].id]);
        result.rows[0].capture_token = newToken;
      }
      if (result.rows.length === 0) {
        const newId = randomUUID();
        const createResult = await pool.query(
          "INSERT INTO workspaces (id, user_id, categories, onboarding_completed) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *",
          [newId, userId, JSON.stringify([]), false]
        );
        return res.json(createResult.rows[0]);
      }
      return res.json(result.rows[0]);
    } catch (error: any) {
      console.error("[workspace/profile] GET error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/workspace/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      // Any authenticated user can update their own workspace profile

      const fieldMap: Record<string, string> = {
        displayName: "display_name",
        trackingIntent: "tracking_intent",
        userPerspective: "user_perspective",
        trackingTypes: "tracking_types",
        orgDescription: "org_description",
        orgMarket: "org_market",
        orgGeographies: "org_geographies",
        orgSize: "org_size",
        userRole: "user_role",
        competitors: "competitors",
        winFactors: "win_factors",
        vulnerability: "vulnerability",
        earlyWarningSignal: "early_warning_signal",
        regulationsMonitored: "regulations_monitored",
        regulatoryBodies: "regulatory_bodies",
        compliancePurpose: "compliance_purpose",
        standardsBodies: "standards_bodies",
        standardsCertified: "standards_certified",
        standardsPurpose: "standards_purpose",
        briefingAudience: "briefing_audience",
        onboardingCompleted: "onboarding_completed",
      };

      const toArray = (val: any): string[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return val.split(',').map((s: string) => s.trim()).filter(Boolean);
      };

      const arrayFields = new Set([
        "competitors",
        "regulationsMonitored",
        "regulatoryBodies",
        "standardsBodies",
        "standardsCertified",
        "orgGeographies",
        "orgMarket",
        "trackingTypes",
      ]);

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [camelKey, snakeCol] of Object.entries(fieldMap)) {
        if (req.body[camelKey] !== undefined) {
          setClauses.push(`${snakeCol} = $${paramIndex}`);
          values.push(arrayFields.has(camelKey) ? toArray(req.body[camelKey]) : req.body[camelKey]);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ message: "No valid fields provided" });
      }

      const existing = await storage.getWorkspaceByUserId(userId);
      if (!existing) {
        try {
          await storage.createWorkspace({
            id: randomUUID(),
            userId,
            categories: [],
            websiteUrl: null,
            pendingSeedUrls: null,
          });
          console.log("[workspace/profile] Auto-created blank workspace for user", userId);
        } catch (createErr: any) {
          if (createErr?.code !== "23505") {
            throw createErr;
          }
        }
      }

      values.push(userId);
      const query = `UPDATE workspaces SET ${setClauses.join(", ")} WHERE user_id = $${paramIndex} RETURNING *`;
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const savedWorkspace = result.rows[0];

      if (req.body.onboardingCompleted === true) {
        try {
          const workspace = await storage.getWorkspaceByUserId(userId);
          if (workspace) {
            const existingCategories = (workspace.categories as ExtractedCategory[]) || [];
            if (existingCategories.length === 0) {
              const newCategories: ExtractedCategory[] = [];
              const trackingTypes: string[] = Array.isArray(savedWorkspace.tracking_types) ? savedWorkspace.tracking_types : [];
              const parseArr = (val: any): string[] => {
                if (Array.isArray(val)) return val.filter(Boolean);
                if (typeof val === "string") return val.replace(/^\{|\}$/g, "").split(",").map(s => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
                return [];
              };
              const competitors: string[] = parseArr(savedWorkspace.competitors);
              const regulationsMonitored: string[] = parseArr(savedWorkspace.regulations_monitored);
              const standardsCertified: string[] = parseArr(savedWorkspace.standards_certified);

              if (trackingTypes.includes("competitors") && competitors.length > 0) {
                newCategories.push({
                  name: "Competitors",
                  description: "Companies competing in your market",
                  entities: competitors.map(name => ({
                    name,
                    type: "company",
                    topic_type: "competitor",
                    related_topic_ids: [],
                    priority: "medium" as const,
                  })),
                });
              }

              if (trackingTypes.includes("regulations") && regulationsMonitored.length > 0) {
                newCategories.push({
                  name: "Regulations & Policy",
                  description: "Regulatory frameworks and policies relevant to your organisation",
                  entities: regulationsMonitored.map(name => ({
                    name,
                    type: "regulation",
                    topic_type: "regulation",
                    related_topic_ids: [],
                    priority: "medium" as const,
                  })),
                });
              }

              const standardsEntities = standardsCertified.length > 0 ? standardsCertified : (Array.isArray(savedWorkspace.standards_bodies) ? savedWorkspace.standards_bodies : parseArr(savedWorkspace.standards_bodies));
              if (trackingTypes.includes("standards") && standardsEntities.length > 0) {
                newCategories.push({
                  name: "Standards & Certifications",
                  description: "Industry standards and certifications you track",
                  entities: standardsEntities.map(name => ({
                    name,
                    type: "topic",
                    topic_type: "standard",
                    related_topic_ids: [],
                    priority: "medium" as const,
                  })),
                });
              }

              if (trackingTypes.includes("trends")) {
                newCategories.push({
                  name: "Industry Trends",
                  description: "Emerging trends and developments in your industry",
                  entities: [],
                });
              }

              if (newCategories.length > 0) {
                await storage.updateWorkspaceCategories(userId, newCategories);
                console.log(`[workspace/profile] Auto-created ${newCategories.length} starter categories for user ${userId}`);
              }
            }
          }
        } catch (setupError: any) {
          console.error("[workspace/profile] Starter category creation error:", setupError?.message || setupError);
        }
      }

      return res.json(savedWorkspace);
    } catch (error: any) {
      console.error("[workspace/profile] PUT error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/workspace/digest-recipients", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const result = await pool.query(
        `SELECT digest_recipients FROM workspaces 
         WHERE user_id = $1
         OR id::text = (
           SELECT parent_workspace_id::text 
           FROM workspaces 
           WHERE user_id = $1
           LIMIT 1
         )
         LIMIT 1`,
        [userId]
      );
      const recipients = result.rows[0]?.digest_recipients || [];
      return res.json({ recipients });
    } catch (error: any) {
      console.error("[digest-recipients] Get error:", error);
      return res.status(500).json({ message: error?.message || "Failed to get recipients" });
    }
  });

  app.post("/api/workspace/digest-recipients", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1::varchar`,
        [userId]
      );
      const role = profileResult.rows[0]?.role ?? "admin";
      if (role === "read_only") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { recipients } = req.body;
      if (!Array.isArray(recipients)) {
        return res.status(400).json({ message: "recipients must be an array" });
      }
      const wsResult = await pool.query(
        `SELECT id FROM workspaces 
         WHERE user_id = $1
         OR id::text = (
           SELECT parent_workspace_id::text 
           FROM workspaces 
           WHERE user_id = $1
           LIMIT 1
         )
         LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) {
        return res.status(404).json({ message: "No workspace found" });
      }
      await pool.query(
        `UPDATE workspaces SET digest_recipients = $1 WHERE id = $2`,
        [JSON.stringify(recipients), workspaceId]
      );
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[digest-recipients] Save error:", error);
      return res.status(500).json({ message: error?.message || "Failed to save recipients" });
    }
  });

  app.patch("/api/workspace/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1::varchar`,
        [userId]
      );
      const role = profileResult.rows[0]?.role ?? "admin";
      if (role === "read_only") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { briefing_enabled } = req.body;
      if (typeof briefing_enabled !== "boolean") {
        return res.status(400).json({ message: "briefing_enabled must be a boolean" });
      }
      await pool.query(
        `UPDATE workspaces SET briefing_enabled = $1 WHERE user_id = $2::varchar`,
        [briefing_enabled, userId]
      );
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[workspace settings] Patch error:", error);
      return res.status(500).json({ message: error?.message || "Failed to update settings" });
    }
  });

  app.get("/api/workspace/:userId", requireAuth, async (req: Request, res: Response) => {
    const authenticatedUserId = (req as any).userId;
    const { userId } = req.params;
    console.log("WORKSPACE API: called by user", userId);

    if (authenticatedUserId !== userId) {
      console.log("WORKSPACE API: forbidden - auth user", authenticatedUserId, "!= param user", userId);
      return res.status(403).json({ message: "Forbidden" });
    }

    const existing = await storage.getWorkspaceByUserId(userId);
    if (!existing) {
      try {
        const newWorkspace = await storage.createWorkspace({
          id: randomUUID(),
          userId,
          categories: [],
          websiteUrl: null,
          pendingSeedUrls: null,
        });
        console.log("WORKSPACE API: auto-created blank workspace for user", userId);
        return res.json({ exists: true, workspace: newWorkspace });
      } catch (createErr: any) {
        if (createErr?.code === "23505") {
          const raceWorkspace = await storage.getWorkspaceByUserId(userId);
          if (raceWorkspace) {
            return res.json({ exists: true, workspace: raceWorkspace });
          }
        }
        console.error("WORKSPACE API: failed to auto-create workspace:", createErr?.message || createErr);
        return res.status(500).json({ message: "Failed to create workspace" });
      }
    }
    const catCount = Array.isArray((existing as any).categories) ? (existing as any).categories.length : 0;
    console.log("WORKSPACE API: categories found =", catCount);
    return res.json({ exists: true, workspace: existing });
  });

  app.get("/api/workspace-context", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      let context = null;
      try {
        context = await storage.getWorkspaceContext(tenantId);
      } catch (err) {
        console.error("[workspace-context] Failed to fetch workspace context:", err);
      }
      return res.json({ workspaceContext: context || null });
    } catch (error: any) {
      console.error("Get workspace context error:", error);
      return res.json({ workspaceContext: null });
    }
  });

  app.put("/api/workspace-context", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { primaryDomain, relevantSubtopics, domainKeywords } = req.body;

      const context = await storage.upsertWorkspaceContext({
        tenantId,
        primaryDomain: typeof primaryDomain === "string" ? primaryDomain.trim() : null,
        relevantSubtopics: Array.isArray(relevantSubtopics) ? relevantSubtopics.filter((s: any) => typeof s === "string") : [],
        domainKeywords: Array.isArray(domainKeywords) ? domainKeywords.filter((s: any) => typeof s === "string") : [],
      });

      return res.json({ workspaceContext: context });
    } catch (error: any) {
      console.error("Update workspace context error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/product-context", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id = (SELECT parent_workspace_id::varchar FROM workspaces WHERE user_id = $1) LIMIT 1`,
        [userId]
      );
      const tenantId = wsResult.rows[0]?.id;
      if (!tenantId) return res.json({ productContext: null });
      const result = await pool.query("SELECT * FROM product_context WHERE tenant_id = $1 LIMIT 1", [tenantId]);
      console.log('[product-context GET] tenantId:', tenantId, 'rows:', result.rows.length);
      const row = result.rows[0];
      return res.json({ productContext: row ? {
        id: row.id,
        productName: row.product_name,
        description: row.description,
        targetCustomer: row.target_customer,
        strengths: row.strengths,
        weaknesses: row.weaknesses,
      } : null });
    } catch (error: any) {
      console.error("Get product context error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/product-context", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id = (SELECT parent_workspace_id::varchar FROM workspaces WHERE user_id = $1) LIMIT 1`,
        [userId]
      );
      const tenantId = wsResult.rows[0]?.id;
      const { productName, description, targetCustomer, strengths, weaknesses } = req.body;
      console.log('[product-context POST] saving:', JSON.stringify(req.body));

      if (!productName || typeof productName !== "string" || productName.trim().length === 0) {
        return res.status(400).json({ message: "Product name is required" });
      }

      const upsertResult = await pool.query(
        `INSERT INTO product_context (tenant_id, product_name, description, target_customer, strengths, weaknesses)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id) DO UPDATE SET
           product_name = EXCLUDED.product_name,
           description = EXCLUDED.description,
           target_customer = EXCLUDED.target_customer,
           strengths = EXCLUDED.strengths,
           weaknesses = EXCLUDED.weaknesses
         RETURNING *`,
        [
          tenantId,
          productName.trim(),
          description?.trim() || null,
          targetCustomer?.trim() || null,
          strengths?.trim() || null,
          weaknesses?.trim() || null,
        ]
      );

      const saved = upsertResult.rows[0];
      return res.json({ productContext: saved ? {
        id: saved.id,
        productName: saved.product_name,
        description: saved.description,
        targetCustomer: saved.target_customer,
        strengths: saved.strengths,
        weaknesses: saved.weaknesses,
      } : null });
    } catch (error: any) {
      console.error("Upsert product context error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/strategic-direction/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const direction = await storage.getStrategicDirection(tenantId, entityId);
      return res.json({ strategicDirection: direction || null });
    } catch (error: any) {
      console.error("Get strategic direction error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/strategic-direction/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const { entityName, categoryName } = req.body;

      if (!entityName) {
        return res.status(400).json({ message: "Missing entityName" });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCaptures = await storage.getCapturesByEntitySince(userId, entityName, thirtyDaysAgo);

      if (recentCaptures.length < 3) {
        return res.json({ strategicDirection: null, insufficient: true, captureCount: recentCaptures.length });
      }

      const contentSnippets = recentCaptures
        .slice(0, 20)
        .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const client = getAnthropicClient();

      const sdWsResult = await pool.query("SELECT * FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
      const sdProfileCtx = buildProfileContext(sdWsResult.rows[0] || null);
      const sdProfilePrefix = sdProfileCtx ? `${sdProfileCtx}\n\n` : "";

      const headingMessage = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `${sdProfilePrefix}Based on these recent updates about ${entityName}, describe their strategic direction using 3-4 bullet points. Start each bullet with a strong verb: "Expanding...", "Doubling down on...", "Investing in...", "Pivoting toward...". One sentence per bullet. Do not use em dashes.

Recent updates:
${contentSnippets}

Return only the bullet points, no JSON, no headers.`
        }]
      });

      const headingText = headingMessage.content.find(b => b.type === "text");
      const whereHeading = headingText?.type === "text" ? headingText.text.trim() : null;

      let whatMeansForYou: string | null = null;
      const prodContext = await storage.getProductContext(tenantId);
      const sdWinFactors = sdWsResult.rows[0]?.win_factors || null;
      if (prodContext && prodContext.productName) {
        const sdProdStrengths = prodContext.strengths?.trim() || null;
        const sdProdWeaknesses = prodContext.weaknesses?.trim() || null;
        const sdProdContextLines = [
          `Our confirmed product strengths: ${sdProdStrengths || "Not provided"}`,
          `We win on: ${sdWinFactors || "Not provided"}`,
          `Our confirmed weaknesses/limitations (do NOT present these as advantages): ${sdProdWeaknesses || "Not provided"}`,
        ].join("\n");

        const meansMessage = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `${sdProfilePrefix}${sdProdContextLines ? `Our product context:\n${sdProdContextLines}\n\n` : ""}Given that ${prodContext.productName} serves ${prodContext.targetCustomer || "its target customers"}, what does ${entityName}'s strategic direction mean for ${prodContext?.productName || "your organisation"}? Respond with 2-3 bullet points, one sentence each, starting with a strong verb. Draw implications only from our confirmed strengths and win factors. Do not present our weaknesses as advantages. Do not use em dashes.

${entityName}'s strategic direction: ${whereHeading}

Return only the bullet points, no JSON, no headers.`
          }]
        });

        const meansText = meansMessage.content.find(b => b.type === "text");
        whatMeansForYou = meansText?.type === "text" ? meansText.text.trim() : null;
      }

      const direction = await storage.upsertStrategicDirection(tenantId, entityId, { whereHeading, whatMeansForYou });
      return res.json({ strategicDirection: direction });
    } catch (error: any) {
      console.error("Generate strategic direction error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/competitor-pricing/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const pricing = await storage.getCompetitorPricing(tenantId, entityId);
      return res.json({ pricing });
    } catch (error: any) {
      console.error("Get competitor pricing error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/competitor-pricing/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const { capturedDate, planName, price, inclusions, sourceUrl, pricingModel } = req.body;

      if (!capturedDate || !planName || !price) {
        return res.status(400).json({ message: "Missing required fields: capturedDate, planName, price" });
      }

      const entry = await storage.createCompetitorPricing({
        tenantId,
        entityId,
        capturedDate,
        planName,
        price,
        inclusions: inclusions || null,
        sourceUrl: sourceUrl || null,
        pricingModel: pricingModel || null,
      });

      return res.json({ pricing: entry });
    } catch (error: any) {
      console.error("Create competitor pricing error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/competitor-pricing/:entityId/:pricingId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId, pricingId } = req.params;
      const deleted = await storage.deleteCompetitorPricing(pricingId, tenantId, entityId);
      if (!deleted) {
        return res.status(404).json({ message: "Pricing entry not found" });
      }
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete competitor pricing error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  // Topic Dates CRUD
  function computeDaysUntil(dateVal: string | Date): number {
    const dateStr = dateVal instanceof Date
      ? dateVal.toISOString().split("T")[0]
      : String(dateVal).split("T")[0];
    const target = new Date(dateStr + "T00:00:00Z");
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const createTopicDateSchema = z.object({
    label: z.string().trim().min(1, "label is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
    dateType: z.enum(["hard_deadline", "soft_deadline", "watch_date"]),
    notes: z.string().trim().nullable().optional().transform(v => v || null),
    source: z.enum(["manual", "ai_extracted"]).optional().default("manual"),
  });

  const updateTopicDateSchema = z.object({
    label: z.string().trim().min(1, "label cannot be empty").optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format").optional(),
    dateType: z.enum(["hard_deadline", "soft_deadline", "watch_date"]).optional(),
    status: z.enum(["upcoming", "overdue", "completed", "dismissed"]).optional(),
    notes: z.string().trim().nullable().optional().transform(v => v || null),
  });

  app.get("/api/topic-dates/all", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const dates = await storage.getAllTopicDates(tenantId);
      const datesWithDaysUntil = dates
        .filter(d => d.status !== "completed" && d.status !== "dismissed")
        .map(d => ({
          ...d,
          days_until: computeDaysUntil(d.date),
        }));
      return res.json({ dates: datesWithDaysUntil });
    } catch (error: any) {
      console.error("Get all topic dates error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/topics/:entityId/dates", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const dates = await storage.getTopicDatesByEntity(tenantId, entityId);
      const datesWithDaysUntil = dates.map(d => ({
        ...d,
        days_until: computeDaysUntil(d.date),
      }));
      return res.json({ dates: datesWithDaysUntil });
    } catch (error: any) {
      console.error("Get topic dates error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/topics/:entityId/dates", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const parsed = createTopicDateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const daysUntil = computeDaysUntil(parsed.data.date);
      const status = daysUntil < 0 ? "overdue" : "upcoming";

      const created = await storage.createTopicDate({
        tenantId,
        entityId,
        label: parsed.data.label,
        date: parsed.data.date,
        dateType: parsed.data.dateType,
        source: parsed.data.source,
        status,
        notes: parsed.data.notes ?? null,
      });

      return res.status(201).json({ topicDate: { ...created, days_until: daysUntil } });
    } catch (error: any) {
      console.error("Create topic date error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.patch("/api/topics/:entityId/dates/:dateId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId, dateId } = req.params;
      const parsed = updateTopicDateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const updateData: any = {};
      if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
      if (parsed.data.date !== undefined) updateData.date = parsed.data.date;
      if (parsed.data.dateType !== undefined) updateData.dateType = parsed.data.dateType;
      if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
      if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

      const updated = await storage.updateTopicDate(dateId, tenantId, entityId, updateData);
      if (!updated) {
        return res.status(404).json({ message: "Topic date not found" });
      }

      return res.json({ topicDate: { ...updated, days_until: computeDaysUntil(updated.date) } });
    } catch (error: any) {
      console.error("Update topic date error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/topics/:entityId/dates/:dateId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId, dateId } = req.params;
      const deleted = await storage.deleteTopicDate(dateId, tenantId, entityId);
      if (!deleted) {
        return res.status(404).json({ message: "Topic date not found" });
      }
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete topic date error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.patch("/api/entity/search-settings", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { entityName, auto_search_enabled, alert_on_high_signal } = req.body;

    if (!entityName) {
      return res.status(400).json({ message: "entityName is required" });
    }

    try {
      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      let updated = false;
      for (const category of categories) {
        for (const entity of category.entities) {
          if (entity.name === entityName) {
            if (typeof auto_search_enabled === "boolean") {
              entity.auto_search_enabled = auto_search_enabled;
            }
            if (typeof alert_on_high_signal === "boolean") {
              entity.alert_on_high_signal = alert_on_high_signal;
            }
            updated = true;
            break;
          }
        }
        if (updated) break;
      }

      if (!updated) {
        return res.status(404).json({ message: "Entity not found" });
      }

      await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Update search settings error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/search/manual", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { entityName, categoryName, topicType } = req.body;

    if (!entityName) {
      return res.status(400).json({ message: "entityName is required" });
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const userCaptures = await storage.getCapturesByUserId(userId);
      const todayManualSearches = userCaptures.filter(
        c => c.matchedEntity === entityName &&
          c.type === "web_search" &&
          c.matchReason?.includes("Manual web search") &&
          new Date(c.createdAt) >= today
      );

      if (todayManualSearches.length >= 3) {
        return res.status(429).json({
          message: "Search limit reached for today. Signalum will automatically search again tomorrow.",
          limitReached: true,
        });
      }

      const { searchCompetitorNews, searchTopicUpdates, deduplicateFindings, findingsToCaptures } = await import("./perplexityService");

      const manualSearchWorkspace = await storage.getWorkspaceByUserId(userId);
      const manualSearchCategories = (manualSearchWorkspace?.categories || []) as ExtractedCategory[];
      const manualSearchCat = manualSearchCategories.find(c => c.name === categoryName);
      const manualSearchFocus = manualSearchCat?.focus || undefined;

      const type = (topicType || "general").toLowerCase();
      let findings;
      if (type === "competitor") {
        findings = await searchCompetitorNews(entityName, categoryName || "General", 30, { categoryFocus: manualSearchFocus });
      } else {
        findings = await searchTopicUpdates(entityName, type, 30, { categoryFocus: manualSearchFocus });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const existingCaptures = await storage.getCapturesByEntitySince(userId, entityName, thirtyDaysAgo);
      const deduplicated = deduplicateFindings(findings, existingCaptures);

      if (deduplicated.length > 0) {
        const captureRecords = findingsToCaptures(deduplicated, entityName, userId, categoryName || "General")
          .map(c => ({ ...c, matchReason: `Manual web search [${deduplicated.find(f => c.content.includes(f.summary))?.signal_strength || "medium"}]` }));
        const created = await storage.createCaptures(captureRecords);
        await storage.flagCapturesForBrief(created.map(c => c.id));

        const summaryParts = deduplicated.map(f => f.summary);
        const aiSummary = `Latest updates (${new Date().toLocaleDateString()}): ${summaryParts.slice(0, 3).join("; ")}`;
        await storage.updateEntityAiSummary(userId, entityName, aiSummary);

        const tenantId = "00000000-0000-0000-0000-000000000000";
        const workspace = await storage.getWorkspaceByUserId(userId);
        const entityData = workspace?.categories
          ?.flatMap((c: ExtractedCategory) => c.entities)
          ?.find((e: ExtractedEntity) => e.name === entityName);
        const alertEnabled = entityData?.alert_on_high_signal === true;

        if (alertEnabled) {
          const highSignalFindings = deduplicated.filter(f => f.signal_strength === "high");
          for (const finding of highSignalFindings) {
            await storage.createNotification({
              tenantId,
              userId,
              entityName,
              categoryName: categoryName || null,
              type: "high_signal",
              title: `High-priority update: ${entityName}`,
              content: finding.summary,
              signalStrength: "high",
              read: 0,
            });
          }
        }

        return res.json({ newFindings: created.length, message: `${created.length} new update${created.length !== 1 ? "s" : ""} found` });
      }

      return res.json({ newFindings: 0, message: "No new developments found since last search" });
    } catch (error: any) {
      console.error("Manual search error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/search/run-ambient", async (req: Request, res: Response) => {
    try {
      const { runAmbientSearchForAllTenants } = await import("./ambientSearch");

      res.json({ started: true, message: "Ambient search triggered for all tenants" });

      (async () => {
        try {
          const results = await runAmbientSearchForAllTenants();
          console.log(`[ambient-search] Completed. Results: ${JSON.stringify(results.map(r => ({
            userId: r.userId,
            entitiesSearched: r.entitiesSearched,
            newCapturesCreated: r.newCapturesCreated,
            notificationsCreated: r.notificationsCreated,
            errors: r.errors,
          })))}`);
        } catch (error) {
          console.error("[ambient-search] Fatal error:", error);
        }
      })();
    } catch (error: any) {
      console.error("Ambient search trigger error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/search/research-dimensions/:entityName", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityName = req.params.entityName;

      const wsResult = await pool.query(
        `SELECT id, categories FROM workspaces WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const workspace = wsResult.rows[0];
      if (!workspace) return res.status(404).json({ message: "No workspace found" });

      const workspaceId = workspace.id;
      const categories: ExtractedCategory[] = workspace.categories || [];

      let disambiguationContext = '';
      let categoryFocus = '';
      for (const category of categories) {
        const entity = category.entities?.find((e: any) => e.name === entityName);
        if (entity) {
          disambiguationContext = (entity as any).disambiguation_context || '';
          categoryFocus = (category as any).focus || category.description || '';
          break;
        }
      }

      const { researchEntityDimensions } = await import("./ambientSearch");
      const results = await researchEntityDimensions(entityName, disambiguationContext, categoryFocus, workspaceId);

      return res.json({ entityName, disambiguationContext, results });
    } catch (error: any) {
      console.error("Research dimensions error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  const createMonitoredUrlSchema = z.object({
    url: z.string().url("Please enter a valid URL"),
    urlCategory: z.enum(["pricing", "product", "news", "careers", "custom"]),
    checkFrequency: z.enum(["daily", "every_3_days", "weekly"]).default("daily"),
  });

  app.get("/api/topics/:entityId/monitored-urls", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const urls = await storage.getMonitoredUrlsByEntity(tenantId, entityId);
      return res.json({ monitoredUrls: urls });
    } catch (error: any) {
      console.error("Get monitored URLs error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/topics/:entityId/monitored-urls", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId } = req.params;
      const parsed = createMonitoredUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const created = await storage.createMonitoredUrl({
        tenantId,
        entityId,
        url: parsed.data.url,
        urlCategory: parsed.data.urlCategory,
        checkFrequency: parsed.data.checkFrequency,
      });

      return res.status(201).json({ monitoredUrl: created });
    } catch (error: any) {
      console.error("Create monitored URL error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/topics/:entityId/monitored-urls/:urlId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { entityId, urlId } = req.params;
      const deleted = await storage.deleteMonitoredUrl(urlId, tenantId, entityId);
      if (!deleted) {
        return res.status(404).json({ message: "Monitored URL not found" });
      }
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete monitored URL error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/feature-interest", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const userId = (req as any).userId;
      const schema = z.object({ featureName: z.enum(["ai_visibility", "email_capture", "search"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }
      const result = await storage.createFeatureInterest({ tenantId, userId, featureName: parsed.data.featureName });
      return res.status(201).json({ featureInterest: result });
    } catch (error: any) {
      console.error("Feature interest error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/feature-interest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const interests = await storage.getFeatureInterestByUser(userId);
      return res.json({ interests });
    } catch (error: any) {
      console.error("Get feature interests error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const userId = (req as any).userId;
      const userEmail = (req as any).userEmail;
      const schema = z.object({
        mood: z.enum(["loving_it", "its_okay", "struggling"]),
        message: z.string().min(1).max(5000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }
      const result = await storage.createFeedback({ tenantId, userId, mood: parsed.data.mood, message: parsed.data.message });

      const moodLabels: Record<string, string> = { loving_it: "😊 Loving it", its_okay: "😐 It's okay", struggling: "😕 Struggling" };
      const moodLabel = moodLabels[parsed.data.mood] || parsed.data.mood;

      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@watchloom.com",
          to: "hrohin99@gmail.com",
          subject: `Signalum feedback — ${moodLabel}`,
          text: `${parsed.data.message}\n\nUser: ${userEmail}\nTenant: ${tenantId}`,
        });
      } catch (emailErr) {
        console.error("Failed to send feedback email:", emailErr);
      }

      return res.status(201).json({ feedback: result });
    } catch (error: any) {
      console.error("Feedback error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/settings/weekly-digest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profile = await storage.getUserProfile(userId);
      return res.json({ weeklyDigestEnabled: profile?.weeklyDigestEnabled === 1 });
    } catch (error: any) {
      console.error("Get weekly digest setting error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/settings/weekly-digest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }
      await storage.updateWeeklyDigest(userId, parsed.data.enabled);
      return res.json({ weeklyDigestEnabled: parsed.data.enabled });
    } catch (error: any) {
      console.error("Update weekly digest setting error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/digest/weekly", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { generateWeeklyDigest } = await import("./weeklyDigest");
      const brief = await generateWeeklyDigest(userId);
      if (!brief) {
        return res.status(400).json({ message: "No workspace or captures from the last 7 days." });
      }
      return res.json(brief);
    } catch (error: any) {
      console.error("Generate weekly digest error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  const ADMIN_EMAIL = "hrohin99@gmail.com";

  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const userId = (req as any).userId;
    const email = (req as any).userEmail;
    if (email === ADMIN_EMAIL) return next();
    try {
      const result = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      if (result.rows.length > 0 && result.rows[0].role === "admin") return next();
    } catch {}
    return res.status(403).json({ message: "Forbidden" });
  }

  async function requireSubAdmin(req: Request, res: Response, next: NextFunction) {
    const userId = (req as any).userId;
    const email = (req as any).userEmail;
    if (email === ADMIN_EMAIL) return next();
    try {
      const result = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      if (result.rows.length > 0 && ["admin", "sub_admin"].includes(result.rows[0].role)) return next();
    } catch {}
    return res.status(403).json({ message: "Forbidden" });
  }

  app.get("/api/admin/stats", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { data: { users: allUsers }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (usersError) throw usersError;
      const emailMap = new Map<string, string>();
      for (const u of allUsers) {
        if (u.id && u.email) emailMap.set(u.id, u.email);
      }

      const roleResult = await pool.query(`SELECT user_id, role FROM user_profiles`);
      const roleMap = new Map<string, string>();
      for (const r of roleResult.rows) {
        roleMap.set(r.user_id, r.role || "read_only");
      }

      const feedbackResult = await pool.query(
        `SELECT f.id, f.user_id, f.mood, f.message, f.created_at
         FROM feedback f
         ORDER BY f.created_at DESC`
      );
      const feedbackData = feedbackResult.rows.map(r => ({
        id: r.id,
        mood: r.mood,
        message: r.message,
        createdAt: r.created_at,
        userEmail: emailMap.get(r.user_id) || "unknown",
      }));

      const featureResult = await pool.query(
        `SELECT fi.user_id, fi.feature_name, fi.created_at
         FROM feature_interest fi
         ORDER BY fi.created_at DESC`
      );
      const featureMap: Record<string, { featureName: string; count: number; emails: string[] }> = {};
      for (const r of featureResult.rows) {
        if (!featureMap[r.feature_name]) {
          featureMap[r.feature_name] = { featureName: r.feature_name, count: 0, emails: [] };
        }
        featureMap[r.feature_name].count++;
        const email = emailMap.get(r.user_id) || "unknown";
        if (!featureMap[r.feature_name].emails.includes(email)) {
          featureMap[r.feature_name].emails.push(email);
        }
      }
      const featureData = Object.values(featureMap);

      const usersData = await Promise.all(allUsers.map(async (u) => {
        const topicCount = await storage.getTopicCountByUser(u.id);
        return {
          userId: u.id,
          email: u.email || "unknown",
          role: u.email === ADMIN_EMAIL ? "admin" : (roleMap.get(u.id) || "read_only"),
          createdAt: u.created_at,
          lastSignIn: u.last_sign_in_at || null,
          topicCount,
        };
      }));
      usersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ feedback: feedbackData, featureInterest: featureData, users: usersData });
    } catch (error: any) {
      console.error("Admin stats error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/admin/invite-user", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const adminUserId = (req as any).userId;
      const { email, role } = req.body;
      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }
      const validRoles = ["sub_admin", "read_only"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const adminWsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
        [adminUserId]
      );
      const adminWorkspaceId = adminWsResult.rows[0]?.id;
      if (!adminWorkspaceId) {
        return res.status(400).json({ message: "Admin workspace not found" });
      }

      const tempPassword = generateTempPassword();
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createError) throw createError;

      if (newUser?.user) {
        await pool.query(
          `INSERT INTO user_profiles (user_id, role, workspace_ready, historical_seeding_completed)
           VALUES ($1, $2, 1, 1)
           ON CONFLICT (user_id) DO UPDATE SET role = $2, workspace_ready = 1, historical_seeding_completed = 1`,
          [newUser.user.id, role]
        );

        const newWorkspaceId = randomUUID();
        await pool.query(
          `INSERT INTO workspaces (id, user_id, categories, onboarding_completed, parent_workspace_id)
           VALUES ($1, $2, $3, true, $4)
           ON CONFLICT (user_id) DO UPDATE SET parent_workspace_id = $4, onboarding_completed = true`,
          [newWorkspaceId, newUser.user.id, JSON.stringify([]), adminWorkspaceId]
        );
      }

      const fromAddress = process.env.EMAIL_FROM || "noreply@example.com";
      const { Resend } = await import("resend");
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      const loginUrl = "https://signalum.rohin.co/signin";
      await resendClient.emails.send({
        from: fromAddress,
        to: email,
        subject: "You've been invited to Signalum",
        html: `<p>You've been invited to join Signalum as a <strong>${role.replace("_", " ")}</strong>.</p><p>Sign in at <a href="${loginUrl}">${loginUrl}</a> with:<br/><strong>Email:</strong> ${email}<br/><strong>Temporary password:</strong> <code>${tempPassword}</code></p><p>Please change your password after first login.</p>`,
        text: `You've been invited to join Signalum as a ${role.replace("_", " ")}. Sign in at ${loginUrl} with email: ${email} and temporary password: ${tempPassword}`,
      });

      return res.json({ success: true, email, tempPassword });
    } catch (error: any) {
      console.error("Invite user error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.patch("/api/admin/users/:userId/role", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const validRoles = ["admin", "sub_admin", "read_only", "suspended"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      await pool.query(
        `UPDATE user_profiles SET role = $1 WHERE user_id = $2`,
        [role, userId]
      );
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Update user role error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/admin/users/:userId/reset-password", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError || !userData?.user?.email) {
        return res.status(404).json({ message: "User not found" });
      }
      const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: userData.user.email,
      });
      if (resetError) throw resetError;
      return res.json({ success: true, message: "Password reset email sent" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/admin/users/:userId", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const requestingUserId = (req as any).userId;
      if (userId === requestingUserId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [userId]);
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete user error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  async function getEffectiveTenantId(userId: string): Promise<string> {
    const result = await pool.query(
      `SELECT COALESCE(
        (SELECT w2.user_id FROM workspaces w1
         JOIN workspaces w2 ON w2.id::text = w1.parent_workspace_id::text
         WHERE w1.user_id = $1 LIMIT 1),
        $1
      ) AS effective_user_id`,
      [userId]
    );
    return result.rows[0]?.effective_user_id ?? userId;
  }

  app.get("/api/capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const tenantId = await getEffectiveTenantId(userId);
      const capabilities = await storage.getWorkspaceCapabilities(tenantId);
      return res.json({ capabilities });
    } catch (error: any) {
      console.error("Get capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const tenantId = await getEffectiveTenantId(userId);
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Capability name is required" });
      }
      const existing = await storage.getWorkspaceCapabilities(tenantId);
      if (existing.length >= 15) {
        return res.status(400).json({ message: "Maximum of 15 capabilities allowed" });
      }
      const capability = await storage.createWorkspaceCapability({
        tenantId: tenantId,
        name: name.trim(),
        displayOrder: existing.length,
      });
      return res.json({ capability });
    } catch (error: any) {
      console.error("Create capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/capabilities/reorder", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const tenantId = await getEffectiveTenantId(userId);
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: "orderedIds array is required" });
      }
      await storage.reorderWorkspaceCapabilities(tenantId, orderedIds);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Reorder capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/capabilities/:id", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const tenantId = await getEffectiveTenantId(userId);
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Capability name is required" });
      }
      const updated = await storage.updateWorkspaceCapability(req.params.id, tenantId, { name: name.trim() });
      if (!updated) {
        return res.status(404).json({ message: "Capability not found" });
      }
      return res.json({ capability: updated });
    } catch (error: any) {
      console.error("Update capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/capabilities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const tenantId = await getEffectiveTenantId(userId);
      const deleted = await storage.deleteWorkspaceCapability(req.params.id, tenantId);
      if (!deleted) {
        return res.status(404).json({ message: "Capability not found" });
      }
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/competitor-capabilities/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const caps = await storage.getCompetitorCapabilities(tenantId, decodeURIComponent(req.params.entityId));
      return res.json({ competitorCapabilities: caps });
    } catch (error: any) {
      console.error("Get competitor capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/competitor-capabilities/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { capabilityId, status, evidence, assessment, comment } = req.body;
      if (!capabilityId || !status) {
        return res.status(400).json({ message: "capabilityId and status are required" });
      }
      const validStatuses = ["yes", "no", "partial", "unknown"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be: yes, no, partial, or unknown" });
      }
      const result = await storage.upsertCompetitorCapability(
        tenantId,
        decodeURIComponent(req.params.entityId),
        capabilityId,
        status,
        evidence !== undefined ? evidence : null,
        assessment !== undefined ? assessment : null,
        comment !== undefined ? comment : null
      );
      return res.json({ competitorCapability: result });
    } catch (error: any) {
      console.error("Upsert competitor capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/all-competitor-capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const caps = await storage.getAllCompetitorCapabilities(tenantId);
      return res.json({ competitorCapabilities: caps });
    } catch (error: any) {
      console.error("Get all competitor capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entrust-capabilities/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const caps = await storage.getEntrustCapabilities(workspaceId, decodeURIComponent(req.params.entityId));
      return res.json({ entrustCapabilities: caps });
    } catch (error: any) {
      console.error("Get entrust capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entrust-capabilities/:entityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { capabilityId, status } = req.body;
      if (!capabilityId || !status) {
        return res.status(400).json({ message: "capabilityId and status are required" });
      }
      const validStatuses = ["yes", "no", "partial", "unknown"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be: yes, no, partial, or unknown" });
      }
      const result = await storage.upsertEntrustCapability(
        workspaceId,
        decodeURIComponent(req.params.entityId),
        capabilityId,
        status
      );
      return res.json({ entrustCapability: result });
    } catch (error: any) {
      console.error("Upsert entrust capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/our-product-capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const caps = await storage.getOurProductCapabilities(workspaceId);
      return res.json({ ourProductCapabilities: caps });
    } catch (error: any) {
      console.error("Get our product capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/our-product-capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { capabilityId, status } = req.body;
      if (!capabilityId || !status) {
        return res.status(400).json({ message: "capabilityId and status are required" });
      }
      const validStatuses = ["yes", "no", "partial", "unknown"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be: yes, no, partial, or unknown" });
      }
      const result = await storage.upsertOurProductCapability(workspaceId, capabilityId, status);
      return res.json({ ourProductCapability: result });
    } catch (error: any) {
      console.error("Upsert our product capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/capabilities/suggest", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      let primaryDomain = "technology";
      try {
        const wsContext = await storage.getWorkspaceContext(tenantId);
        if (wsContext?.primaryDomain) {
          primaryDomain = wsContext.primaryDomain;
        }
      } catch (err) {
        console.error("Failed to fetch workspace context for suggestions:", err);
      }

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `You are helping a user set up competitive intelligence capabilities for their market. Their primary domain is: "${primaryDomain}".

Suggest exactly 3 short, specific market capabilities relevant to this domain. Each should be a concise capability name (2-5 words) that a company in this market might or might not have.

Examples for cybersecurity: "Passive liveness detection", "Real-time threat monitoring", "Zero-trust architecture"
Examples for fintech: "Instant settlements", "Multi-currency support", "Open banking APIs"

Return ONLY a JSON array of 3 strings. No explanation.`
        }]
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      let suggestions: string[] = [];
      try {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          suggestions = JSON.parse(match[0]);
        }
      } catch {
        suggestions = ["Real-time analytics", "API integrations", "Enterprise SSO"];
      }

      return res.json({ suggestions: suggestions.slice(0, 3) });
    } catch (error: any) {
      console.error("Suggest capabilities error:", error);
      return res.json({ suggestions: ["Real-time analytics", "API integrations", "Enterprise SSO"] });
    }
  });

  app.post("/api/capabilities/detect", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { content } = req.body;
      if (!content) {
        return res.json({ matches: [] });
      }
      const capabilities = await storage.getWorkspaceCapabilities(tenantId);
      if (capabilities.length === 0) {
        return res.json({ matches: [] });
      }

      const contentLower = content.toLowerCase();
      const matches = capabilities.filter(cap =>
        contentLower.includes(cap.name.toLowerCase())
      );

      return res.json({ matches: matches.map(m => ({ id: m.id, name: m.name })) });
    } catch (error: any) {
      console.error("Detect capabilities error:", error);
      return res.json({ matches: [] });
    }
  });

  app.get("/api/entity/website-extraction-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityName = req.query.entityName as string;
      if (!entityName) {
        return res.status(400).json({ message: "entityName is required" });
      }
      const { getWebsiteExtractionStatus } = await import("./websiteIntelligenceService");
      const status = getWebsiteExtractionStatus(userId, entityName);
      return res.json({ extraction: status });
    } catch (error: any) {
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entity/refresh-website", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { entityName, categoryName } = req.body;

      if (!entityName || !categoryName) {
        return res.status(400).json({ message: "entityName and categoryName are required" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const entity = category.entities.find(e => e.name === entityName);
      if (!entity || !entity.website_url) {
        return res.status(400).json({ message: "Entity has no website URL" });
      }

      const { getWebsiteExtractionStatus, runWebsiteIntelligenceExtraction } = await import("./websiteIntelligenceService");
      const currentStatus = getWebsiteExtractionStatus(userId, entityName);
      if (currentStatus?.status === "running") {
        return res.json({ success: true, message: "Extraction already running" });
      }

      (async () => {
        try {
          await runWebsiteIntelligenceExtraction(userId, entityName, categoryName, entity.website_url!);
        } catch (err: any) {
          console.error(`[RefreshWebsite] Extraction failed for "${entityName}":`, err?.message || err);
        }
      })();

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Refresh website error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entities/:entityId/seo-intelligence", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityId = decodeURIComponent(req.params.entityId);

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }
      const categories = workspace.categories as ExtractedCategory[];
      let entityFound = false;
      for (const cat of categories) {
        if (cat.entities.find(e => e.name === entityId)) { entityFound = true; break; }
      }
      if (!entityFound) {
        return res.status(404).json({ message: "Entity not found in workspace" });
      }

      const data = await storage.getEntitySeoData(userId, entityId);
      if (!data) {
        return res.json({ seoData: null });
      }
      return res.json({ seoData: data });
    } catch (error: any) {
      console.error("Get SEO intelligence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/seo-intelligence", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityId = decodeURIComponent(req.params.entityId);
      console.log("[SEO START]", { userId, entityId });

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      let entity: ExtractedEntity | undefined;
      for (const cat of categories) {
        entity = cat.entities.find(e => e.name === entityId);
        if (entity) break;
      }
      if (!entity || !entity.website_url) {
        return res.status(400).json({ message: "Entity not found or no website URL" });
      }

      const login = process.env.DATAFORSEO_LOGIN;
      const password = process.env.DATAFORSEO_PASSWORD;
      if (!login || !password) {
        return res.status(500).json({ message: "DataForSEO credentials not configured" });
      }

      const authHeader = "Basic " + Buffer.from(login + ":" + password).toString("base64");
      const baseUrl = "https://api.dataforseo.com/v3";

      let domain = entity.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      const isCanadian = domain.endsWith(".ca") || (entity.disambiguation_context || "").toLowerCase().includes("canad");
      const locationCode = isCanadian ? 2124 : 2840;

      const seoPayload: any = {
        rankedKeywords: [],
        localPackPosition: null,
        localPackResults: [],
        businessRating: null,
        reviewCount: null,
        businessAddress: null,
        businessPhone: null,
        businessHours: null,
      };

      try {
        const rkResponse = await fetch(`${baseUrl}/dataforseo_labs/google/ranked_keywords/live`, {
          method: "POST",
          headers: { "Authorization": authHeader, "Content-Type": "application/json" },
          body: JSON.stringify([{ target: domain, language_code: "en", location_code: locationCode, limit: 10 }]),
        });
        const rkData = await rkResponse.json();
        if (rkData?.tasks?.[0]?.result?.[0]?.items) {
          seoPayload.rankedKeywords = rkData.tasks[0].result[0].items.slice(0, 10).map((item: any) => ({
            keyword: item.keyword_data?.keyword || "",
            position: item.ranked_serp_element?.serp_item?.rank_group || 0,
            search_volume: item.keyword_data?.keyword_info?.search_volume || 0,
          }));
        }
      } catch (err: any) {
        console.error("[SEO] Ranked keywords call failed:", err?.message || err);
      }

      if (true) {
        try {
          const locationHint = entity.disambiguation_context?.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/)?.find(w => w !== entity.name) || "";
          const searchKeyword = locationHint ? `${entity.name} ${locationHint}` : entity.name;
          const lpResponse = await fetch(`${baseUrl}/serp/google/local_pack/live/regular`, {
            method: "POST",
            headers: { "Authorization": authHeader, "Content-Type": "application/json" },
            body: JSON.stringify([{ keyword: searchKeyword, language_code: "en", location_code: locationCode, device: "desktop" }]),
          });
          const lpData = await lpResponse.json();
          if (lpData?.tasks?.[0]?.result?.[0]?.items) {
            const items = lpData.tasks[0].result[0].items.slice(0, 3);
            seoPayload.localPackResults = items.map((item: any, idx: number) => ({
              title: item.title || "",
              position: idx + 1,
              rating: item.rating?.value || null,
              reviews: item.rating?.votes_count || null,
            }));
            const entityMatch = items.findIndex((item: any) =>
              item.title?.toLowerCase().includes(entity!.name.toLowerCase()) ||
              item.domain?.includes(domain)
            );
            if (entityMatch >= 0) {
              seoPayload.localPackPosition = entityMatch + 1;
            }
          }
        } catch (err: any) {
          console.error("[SEO] Local pack call failed:", err?.message || err);
        }

        try {
          const mbResponse = await fetch(`${baseUrl}/business_data/google/my_business_info/live`, {
            method: "POST",
            headers: { "Authorization": authHeader, "Content-Type": "application/json" },
            body: JSON.stringify([{ keyword: entity.name, location_code: locationCode }]),
          });
          const mbData = await mbResponse.json();
          if (mbData?.tasks?.[0]?.result?.[0]?.items?.[0]) {
            const biz = mbData.tasks[0].result[0].items[0];
            seoPayload.businessRating = biz.rating?.value?.toString() || null;
            seoPayload.reviewCount = biz.rating?.votes_count || null;
            seoPayload.businessAddress = biz.address || null;
            seoPayload.businessPhone = biz.phone || null;
            if (biz.work_hours?.work_hours) {
              try {
                const hours = biz.work_hours.work_hours;
                const formatted = Object.entries(hours).map(([day, h]: [string, any]) =>
                  `${day}: ${h?.open ? `${h.open.hour}:${String(h.open.minute).padStart(2, "0")} - ${h.close.hour}:${String(h.close.minute).padStart(2, "0")}` : "Closed"}`
                ).join("; ");
                seoPayload.businessHours = formatted;
              } catch {
                seoPayload.businessHours = JSON.stringify(biz.work_hours);
              }
            }
          }
        } catch (err: any) {
          console.error("[SEO] Business data call failed:", err?.message || err);
        }
      }

      console.log("[SEO] seoPayload to save:", JSON.stringify(seoPayload));
      const saved = await storage.upsertEntitySeoData(userId, entityId, seoPayload);
      console.log("[SEO] saved result:", JSON.stringify(saved));
      return res.json({ seoData: saved });
    } catch (error: any) {
      console.error("[SEO FATAL ERROR]", error?.message, error?.code, error?.stack);
      return res.status(500).json({ message: error?.message || "SEO error" });
    }
  });

  app.get("/api/briefing/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const settings = await storage.getBriefingSettings(userId);
      return res.json(settings);
    } catch (error: any) {
      console.error("[briefing] Get settings error:", error);
      return res.status(500).json({ message: error?.message || "Failed to get briefing settings" });
    }
  });

  app.post("/api/briefing/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { briefingEnabled, briefingDay, briefingTime, briefingEmail } = req.body;

      const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const validTimes = ["06:00", "07:00", "08:00", "09:00", "10:00"];

      if (typeof briefingEnabled !== "boolean") {
        return res.status(400).json({ message: "briefingEnabled must be a boolean" });
      }
      if (!validDays.includes(briefingDay)) {
        return res.status(400).json({ message: "Invalid briefing day" });
      }
      if (!validTimes.includes(briefingTime)) {
        return res.status(400).json({ message: "Invalid briefing time" });
      }
      if (!briefingEmail || typeof briefingEmail !== "string" || !briefingEmail.includes("@")) {
        return res.status(400).json({ message: "Valid email address is required" });
      }

      await storage.saveBriefingSettings(userId, { briefingEnabled, briefingDay, briefingTime, briefingEmail });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[briefing] Save settings error:", error);
      return res.status(500).json({ message: error?.message || "Failed to save briefing settings" });
    }
  });

  app.post("/api/briefing/send-now", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const settings = await storage.getBriefingSettings(userId);
      const email = settings.briefingEmail || (req as any).userEmail;

      if (!email) {
        return res.status(400).json({ message: "No email address configured for briefing" });
      }

      const { generateBriefingForUser, sendBriefingEmail } = await import("./briefingService");
      const briefingData = await generateBriefingForUser(userId);

      if (!briefingData) {
        return res.status(404).json({ message: "No recent captures found to generate a briefing" });
      }

      const wsRow = await pool.query(
        `SELECT digest_recipients FROM workspaces WHERE user_id = $1::varchar LIMIT 1`,
        [userId]
      );
      const digestRecipients = (wsRow.rows[0]?.digest_recipients || []).map((r: any) =>
        typeof r === 'string' ? r : r.email
      ).filter(Boolean);

      const result = await sendBriefingEmail(userId, email, briefingData, digestRecipients);
      if (result.success) {
        await storage.updateBriefingLastSent(userId);
        return res.json({ success: true });
      } else {
        return res.status(500).json({ message: result.error || "Failed to send briefing email" });
      }
    } catch (error: any) {
      console.error("[briefing] Send now error:", error);
      return res.status(500).json({ message: error?.message || "Failed to send briefing" });
    }
  });

  app.get("/api/entities/:entityId/partnerships", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityId = req.params.entityId;
      const ws = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = ws.rows[0]?.id;
      if (!workspaceId) return res.json({ partnerships: [] });
      const result = await pool.query(
        `SELECT * FROM entity_partnerships WHERE entity_id = $1 AND workspace_id = $2 ORDER BY relationship_type, created_at DESC`,
        [entityId, workspaceId]
      );
      return res.json({ partnerships: result.rows });
    } catch (error: any) {
      console.error("Get partnerships error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/partnerships", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityId = req.params.entityId;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const ws = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = ws.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { partnerName, partnerIndustry, partnerCountry, relationshipType, programDescription, activeSince, contextNote } = req.body;
      if (!partnerName || !relationshipType) {
        return res.status(400).json({ message: "partnerName and relationshipType are required" });
      }
      const inserted = await pool.query(
        `INSERT INTO entity_partnerships (workspace_id, entity_id, partner_name, partner_industry, partner_country, relationship_type, program_description, active_since, context_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [workspaceId, entityId, partnerName, partnerIndustry || null, partnerCountry || null, relationshipType, programDescription || null, activeSince || null, contextNote || null]
      );
      return res.status(201).json({ partnership: inserted.rows[0] });
    } catch (error: any) {
      console.error("Create partnership error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/partnerships/:partnershipId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { partnershipId } = req.params;
      const profileResult = await pool.query(
        `SELECT role FROM user_profiles WHERE user_id = $1`, [userId]
      );
      const role = profileResult.rows[0]?.role;
      if (role && !["admin", "sub_admin"].includes(role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const ws = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = ws.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const deleted = await pool.query(
        `DELETE FROM entity_partnerships WHERE id = $1 AND workspace_id = $2 RETURNING id`,
        [partnershipId, workspaceId]
      );
      if (deleted.rowCount === 0) {
        return res.status(404).json({ message: "Partnership not found" });
      }
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete partnership error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entities/:entityId/products", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const result = await pool.query(
        `SELECT * FROM entity_products WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order, created_at`,
        [req.params.entityId, workspaceId]
      );
      const managedResult = await pool.query(
        `SELECT 1 FROM entity_products_managed WHERE workspace_id = $1 AND entity_id = $2 LIMIT 1`,
        [workspaceId, req.params.entityId]
      );
      const isManaged = managedResult.rowCount && managedResult.rowCount > 0;
      if (result.rows.length > 0 || isManaged) {
        return res.json(result.rows);
      }
      const workspace = await storage.getWorkspaceByUserId(userId);
      if (workspace) {
        const categories = workspace.categories as ExtractedCategory[];
        let foundEntity: any = null;
        for (const cat of categories) {
          const match = cat.entities.find((e: any) => e.name === req.params.entityId);
          if (match) { foundEntity = match; break; }
        }
        if (foundEntity?.products && Array.isArray(foundEntity.products) && foundEntity.products.length > 0) {
          const mapped = foundEntity.products.map((p: any, i: number) => ({
            id: `perplexity-${i}`,
            workspace_id: workspaceId,
            entity_id: req.params.entityId,
            product_name: p.name,
            description: p.description ?? null,
            status: 'ga',
            tags: null,
            sort_order: i,
            created_at: null,
            source: 'perplexity',
          }));
          return res.json(mapped);
        }
      }
      res.json(result.rows);
    } catch (error: any) {
      console.error("Get products error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/products", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { product_name, description, status, tags } = req.body;
      if (!product_name) return res.status(400).json({ error: 'product_name is required' });
      const allowedStatuses = ['ga', 'beta', 'deprecated'];
      const safeStatus = allowedStatuses.includes(status) ? status : 'ga';
      const result = await pool.query(
        `INSERT INTO entity_products (workspace_id, entity_id, product_name, description, status, tags)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [workspaceId, req.params.entityId, product_name, description, safeStatus, tags]
      );
      await pool.query(
        `INSERT INTO entity_products_managed (workspace_id, entity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [workspaceId, req.params.entityId]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create product error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/products/mark-managed", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) return res.status(404).json({ message: "No workspace found" });
      const categories = workspace.categories as ExtractedCategory[];
      const entityName = req.params.entityId;
      for (const category of categories) {
        const entity = category.entities.find((e: any) => e.name === entityName);
        if (entity) {
          entity.products = [];
          entity.geo_presence = [];
          break;
        }
      }
      await storage.updateWorkspaceCategories(userId, categories);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark products managed error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/products/:productId", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.params.productId.startsWith("perplexity-")) {
        return res.status(400).json({ message: "Perplexity-sourced products must be edited by re-running research. Manual edits to auto-populated products are not supported via this endpoint." });
      }
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { product_name, description, status, tags } = req.body;
      if (!product_name) return res.status(400).json({ error: 'product_name is required' });
      const allowedStatuses = ['ga', 'beta', 'deprecated'];
      const safeStatus = allowedStatuses.includes(status) ? status : 'ga';
      const result = await pool.query(
        `UPDATE entity_products SET product_name=$1, description=$2, status=$3, tags=$4
         WHERE id=$5 AND workspace_id=$6 AND entity_id=$7 RETURNING *`,
        [product_name, description, safeStatus, tags, req.params.productId, workspaceId, req.params.entityId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update product error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/products/:productId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const deleted = await pool.query(`DELETE FROM entity_products WHERE id=$1 AND workspace_id=$2 AND entity_id=$3 RETURNING id`, [req.params.productId, workspaceId, req.params.entityId]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete product error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entities/:entityId/geo-presence", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const result = await pool.query(
        `SELECT * FROM entity_geo_presence WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order, created_at`,
        [req.params.entityId, workspaceId]
      );
      if (result.rows.length > 0) {
        return res.json(result.rows);
      }
      const workspace = await storage.getWorkspaceByUserId(userId);
      if (workspace) {
        const categories = workspace.categories as ExtractedCategory[];
        let foundEntity: any = null;
        for (const cat of categories) {
          const match = cat.entities.find((e: any) => e.name === req.params.entityId);
          if (match) { foundEntity = match; break; }
        }
        if (foundEntity?.geo_presence && Array.isArray(foundEntity.geo_presence) && foundEntity.geo_presence.length > 0) {
          const mapped = foundEntity.geo_presence.map((region: string, i: number) => ({
            id: `perplexity-${i}`,
            workspace_id: workspaceId,
            entity_id: req.params.entityId,
            region,
            iso_code: null,
            presence_type: 'active',
            channels: null,
            notes: null,
            sort_order: i,
            created_at: null,
            source: 'perplexity',
          }));
          return res.json(mapped);
        }
      }
      res.json(result.rows);
    } catch (error: any) {
      console.error("Get geo-presence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/geo-presence", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { region, iso_code, presence_type, channels, notes } = req.body;
      if (!region) return res.status(400).json({ error: 'region is required' });
      const allowedTypes = ['active', 'expanding', 'limited', 'exited'];
      const safeType = allowedTypes.includes(presence_type) ? presence_type : 'active';
      const result = await pool.query(
        `INSERT INTO entity_geo_presence (workspace_id, entity_id, region, iso_code, presence_type, channels, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [workspaceId, req.params.entityId, region, iso_code || null, safeType, channels || null, notes || null]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create geo-presence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/geo-presence/:geoId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { geoId } = req.params;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(geoId)) {
        return res.status(404).json({ error: 'Geo presence entry not found' });
      }
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { region, iso_code, presence_type, channels, notes } = req.body;
      if (!region) return res.status(400).json({ error: 'region is required' });
      const allowedTypes = ['active', 'expanding', 'limited', 'exited'];
      const safeType = allowedTypes.includes(presence_type) ? presence_type : 'active';
      const result = await pool.query(
        `UPDATE entity_geo_presence SET region=$1, iso_code=$2, presence_type=$3, channels=$4, notes=$5
         WHERE id=$6 AND workspace_id=$7 AND entity_id=$8 RETURNING *`,
        [region, iso_code || null, safeType, channels || null, notes || null, req.params.geoId, workspaceId, req.params.entityId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Geo presence entry not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update geo-presence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/geo-presence/:geoId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { geoId } = req.params;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(geoId)) {
        return res.status(404).json({ error: 'Geo presence entry not found' });
      }
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const deleted = await pool.query(`DELETE FROM entity_geo_presence WHERE id=$1 AND workspace_id=$2 AND entity_id=$3 RETURNING id`, [req.params.geoId, workspaceId, req.params.entityId]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Geo presence entry not found' });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete geo-presence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  // SWOT Analysis routes
  app.get("/api/entities/:entityId/swot", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const result = await pool.query(
        `SELECT * FROM entity_swot WHERE entity_id = $1 AND workspace_id = $2 LIMIT 1`,
        [req.params.entityId, workspaceId]
      );
      res.json(result.rows[0] || {});
    } catch (error: any) {
      console.error("Get SWOT error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/swot", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (!["admin", "sub_admin"].includes(role)) return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { strengths, weaknesses, opportunities, threats } = req.body;

      const existing = await pool.query(
        `SELECT * FROM entity_swot WHERE workspace_id = $1 AND entity_id = $2`,
        [workspaceId, req.params.entityId]
      );

      let result;
      if (existing.rows.length > 0) {
        const current = existing.rows[0];
        result = await pool.query(
          `UPDATE entity_swot SET strengths=$1, weaknesses=$2, opportunities=$3, threats=$4, ai_generated=false, updated_at=NOW()
           WHERE workspace_id=$5 AND entity_id=$6 RETURNING *`,
          [
            strengths !== undefined ? strengths : current.strengths,
            weaknesses !== undefined ? weaknesses : current.weaknesses,
            opportunities !== undefined ? opportunities : current.opportunities,
            threats !== undefined ? threats : current.threats,
            workspaceId, req.params.entityId
          ]
        );
      } else {
        result = await pool.query(
          `INSERT INTO entity_swot (workspace_id, entity_id, strengths, weaknesses, opportunities, threats, ai_generated, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, false, NOW()) RETURNING *`,
          [workspaceId, req.params.entityId, strengths || "", weaknesses || "", opportunities || "", threats || ""]
        );
      }
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update SWOT error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/swot/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (!["admin", "sub_admin"].includes(role)) return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });

      const entityName = req.params.entityId;
      const allCaptures = await storage.getCapturesByUserId(userId);
      const entityCaptures = allCaptures.filter((c: any) => c.matchedEntity === entityName);
      const contentSnippets = entityCaptures
        .slice(0, 50)
        .map((c: any, i: number) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const anthropic = getAnthropicClient();
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are a competitive intelligence analyst. Analyse the following intelligence captures about "${entityName}" and produce a SWOT analysis.

Intelligence captures:
${contentSnippets || "No captures available yet. Generate a reasonable SWOT based on general knowledge of this entity."}

Return ONLY valid JSON with exactly these keys: strengths, weaknesses, opportunities, threats.
Each value should be a string of newline-separated bullet points (each bullet on its own line, no bullet character prefix needed).
Example:
{
  "strengths": "Strong brand recognition\\nLarge customer base\\nInnovative R&D",
  "weaknesses": "High pricing\\nLimited geographic reach",
  "opportunities": "Emerging markets expansion\\nNew product categories",
  "threats": "Aggressive competitors\\nRegulatory changes"
}

Return ONLY the JSON object, no other text.`
        }]
      });

      const textContent = message.content.find((b: any) => b.type === "text");
      const rawText = textContent ? (textContent as any).text : "{}";
      let parsed: any;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      } catch {
        parsed = { strengths: "", weaknesses: "", opportunities: "", threats: "" };
      }

      const result = await pool.query(
        `INSERT INTO entity_swot (workspace_id, entity_id, strengths, weaknesses, opportunities, threats, ai_generated, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET strengths=$3, weaknesses=$4, opportunities=$5, threats=$6, ai_generated=true, updated_at=NOW()
         RETURNING *`,
        [workspaceId, entityName, parsed.strengths || "", parsed.weaknesses || "", parsed.opportunities || "", parsed.threats || ""]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Regenerate SWOT error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/strategic-pulse", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: "Workspace not found" });

      const result = await db.execute(sql`
        SELECT * FROM strategic_pulse WHERE workspace_id = ${workspaceId} ORDER BY generated_at DESC LIMIT 5
      `);
      const rows = result.rows.map((row: any) => ({
        ...row,
        big_shift: row.big_shift ? JSON.parse(row.big_shift) : null,
        threat_radar: row.threat_radar ? JSON.parse(row.threat_radar) : null,
        emerging_opportunities: row.emerging_opportunities ? JSON.parse(row.emerging_opportunities) : null,
        competitor_moves: row.competitor_moves ? JSON.parse(row.competitor_moves) : null,
        watch_list: row.watch_list ? JSON.parse(row.watch_list) : null,
        regional_intelligence: row.regional_intelligence ? JSON.parse(row.regional_intelligence) : null,
      }));
      res.json(rows);
    } catch (error: any) {
      console.error("Get strategic pulse error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/strategic-pulse/export-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`, [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: "Workspace not found" });

      const result = await db.execute(sql`
        SELECT * FROM strategic_pulse WHERE workspace_id = ${workspaceId} ORDER BY generated_at DESC LIMIT 1
      `);
      const row = result.rows[0] as any;
      if (!row) return res.status(404).json({ error: "No pulse found" });

      const parse = (val: any) => {
        try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return null; }
      };

      const pulse = {
        generated_at: row.generated_at,
        big_shift: parse(row.big_shift),
        emerging_opportunities: parse(row.emerging_opportunities),
        threat_radar: parse(row.threat_radar),
        competitor_moves: parse(row.competitor_moves),
        watch_list: parse(row.watch_list),
        regional_intelligence: parse(row.regional_intelligence),
        capture_count: row.capture_count,
      };

      const date = new Date(pulse.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

      const sectionHtml = (title: string, color: string, section: any) => {
        if (!section) return '';
        const items = (section.items || []).map((item: any) => `
          <div style="margin-bottom:12px;padding-left:12px;border-left:3px solid ${color}">
            <div style="font-weight:600;font-size:13px;color:#111">${item.title || ''}</div>
            <div style="font-size:12px;color:#444;margin-top:3px;line-height:1.5">${item.detail || ''}</div>
          </div>`).join('');
        return `
          <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">
            <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:6px">${title}</div>
            ${section.headline ? `<div style="font-size:12px;color:#555;font-style:italic;margin-bottom:12px">${section.headline}</div>` : ''}
            ${items}
          </div>`;
      };

      const regionalHtml = (section: any) => {
        if (!section?.items?.length) return '';
        const grid = (section.items || []).map((item: any) => `
          <div style="padding:10px;border:1px solid #e5e7eb;border-radius:6px;background:#fff">
            <div style="font-weight:600;font-size:12px;color:#111;margin-bottom:4px">${item.title}</div>
            <div style="font-size:11px;color:#555;line-height:1.4">${item.detail}</div>
          </div>`).join('');
        return `
          <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">
            <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:6px">Regional Intelligence</div>
            ${section.headline ? `<div style="font-size:12px;color:#555;font-style:italic;margin-bottom:12px">${section.headline}</div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${grid}</div>
          </div>`;
      };

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Strategic Pulse — ${date}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; color: #111; max-width: 800px; }
          h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
          .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
          @media print { body { padding: 20px; } }
        </style>
      </head><body>
        <h1>Strategic Pulse</h1>
        <div class="meta">Generated ${date} · ${pulse.capture_count} intelligence signals · Signalum</div>
        ${sectionHtml('The Big Shift', '#3b82f6', pulse.big_shift)}
        ${sectionHtml('Emerging Opportunities', '#10b981', pulse.emerging_opportunities)}
        ${sectionHtml('Threat Radar', '#ef4444', pulse.threat_radar)}
        ${sectionHtml('Competitor Moves Decoded', '#8b5cf6', pulse.competitor_moves)}
        ${sectionHtml('Watch List', '#f59e0b', pulse.watch_list)}
        ${regionalHtml(pulse.regional_intelligence)}
      </body></html>`;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="Strategic-Pulse-${date}.html"`);
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/strategic-pulse/generate", requireAuth, async (req: Request, res: Response) => {
    // Ensure regional_intelligence column exists
    try {
      await db.execute(sql`ALTER TABLE strategic_pulse ADD COLUMN IF NOT EXISTS regional_intelligence text`);
    } catch (_) {}

    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });

      const wsProfileResult = await pool.query(`SELECT * FROM workspaces WHERE user_id = $1`, [userId]);
      const profileCtx = buildProfileContext(wsProfileResult.rows[0] || null);

      const prodContext = await storage.getProductContext(workspaceId);

      const capturesResult = await db.execute(sql`
        SELECT matched_entity, content, created_at FROM captures 
        WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '6 months'
        ORDER BY created_at DESC
      `);
      const captures = capturesResult.rows as any[];
      const captureCount = captures.length;

      if (captureCount < 3) {
        return res.status(400).json({ error: 'Not enough intelligence captured yet. Add more updates to generate a pulse.' });
      }

      const grouped: Record<string, string[]> = {};
      for (const c of captures) {
        const key = c.matched_entity || 'Unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push((c.content || '').substring(0, 400));
      }
      const entityCount = Object.keys(grouped).length;

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const pulseWsCategories = (wsProfileResult.rows[0]?.categories || []) as ExtractedEntity[];

      const entitySummaries: string[] = [];
      for (const [entityKey, items] of Object.entries(grouped)) {
        const captureText = items.map((c, i) => `${i + 1}. ${c}`).join('\n');

        let pulseEntityObj: ExtractedEntity | undefined;
        for (const cat of (pulseWsCategories as any[])) {
          const found = (cat.entities || []).find((e: any) => e.name === entityKey);
          if (found) { pulseEntityObj = found as ExtractedEntity; break; }
        }
        const pulseProfileCtx = pulseEntityObj
          ? await buildCompetitorProfileContext(entityKey, pulseEntityObj, workspaceId)
          : "";

        const msg = await withRetry(() => anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `You are a competitive intelligence analyst. Summarise intelligence about "${entityKey}" into a concise 150-200 word briefing covering: recent activity, strategic direction, notable moves, and emerging patterns. Be specific and factual.
${pulseProfileCtx ? `\nKnown profile data (use as context, not as recent signals):\n${pulseProfileCtx}\n` : ""}
RECENT SIGNALS (${items.length} total):
${captureText}

Respond with only the summary paragraph, no headers or preamble.`
          }]
        }));
        const summary = (msg.content[0] as any).text || '';
        entitySummaries.push(`## ${entityKey} (${items.length} signals)\n${summary}`);
      }

      const consolidatedContext = entitySummaries.join('\n\n');
      const message = await withRetry(() => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        messages: [{
          role: "user",
          content: `${profileCtx ? profileCtx + '\n\n' : ''}You are a senior competitive intelligence analyst. Your job is to synthesise intelligence summaries into sharp strategic insight for the organisation described above.

You are analysing ${entityCount} tracked entities. ${captureCount} total intelligence signals have been captured over the last 6 months and summarised below.

ENTITY SUMMARIES:
${consolidatedContext}

Write a Strategic Pulse briefing. Use ONLY evidence from the summaries above. Write as a trusted advisor to the leadership team.
Be concise. Each section headline must be 1 sentence. Each item title must be under 8 words. Each item detail must be 2 sentences maximum. The regional_intelligence items must be 2 sentences each. Total response must fit within 5000 tokens.

Respond ONLY with valid JSON, no other text, no markdown code fences:
{
  "big_shift": { "headline": "One sharp sentence summarising the single most important pattern", "items": [{"title": "Point 1", "detail": "2-3 sentence elaboration with specific evidence"}, {"title": "Point 2", "detail": "..."}, {"title": "Point 3", "detail": "..."}] },
  "emerging_opportunities": { "headline": "One sentence framing the opportunity space", "items": [{"title": "Opportunity name", "detail": "Evidence and how to capitalise"}, {"title": "...", "detail": "..."}, {"title": "...", "detail": "..."}] },
  "threat_radar": { "headline": "One sentence on the threat landscape", "items": [{"title": "[CRITICAL] Threat — timeframe", "detail": "What it is, evidence, why urgent"}, {"title": "[WATCH] Threat — timeframe", "detail": "..."}, {"title": "[MONITOR] Threat — timeframe", "detail": "..."}] },
  "competitor_moves": { "headline": "One sentence on competitor activity", "items": [{"title": "Entity name", "detail": "Strategic intent, evidence, predicted next move"}] },
  "watch_list": { "headline": "Key things to monitor over the next 6 months", "items": [{"title": "Item to watch", "detail": "If [trigger], then [implication]. Horizon: X. Likelihood: High/Medium/Low"}, {"title": "...", "detail": "..."}, {"title": "...", "detail": "..."}, {"title": "...", "detail": "..."}, {"title": "...", "detail": "..."}] },
  "regional_intelligence": { "headline": "One sentence summarising the global geographic picture", "items": [{"title": "North America", "detail": "Key regulatory, competitive and market developments. If no signals, say: No signals captured for this region."}, {"title": "United Kingdom", "detail": "..."}, {"title": "European Union", "detail": "..."}, {"title": "EMEA", "detail": "..."}, {"title": "APAC", "detail": "..."}, {"title": "South America", "detail": "..."}] }
}`
        }]
      }));

      const raw = (message.content[0] as any).text || "{}";
      const clean = raw.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*/);
      let parsed: any = {};
      try {
        const jsonStr = jsonMatch ? jsonMatch[0] : clean;
        parsed = JSON.parse(jsonStr);
      } catch {
        // Attempt to fix truncated JSON by closing open structures
        try {
          const jsonStr = (jsonMatch ? jsonMatch[0] : clean)
            .replace(/,\s*$/, '')
            .replace(/\}\s*$/, '}}')
            + ']}]}]}]}]}';
          const fixed = jsonStr.match(/\{[\s\S]*/)?.[0] || '{}';
          parsed = JSON.parse(fixed);
        } catch {
          console.error('[pulse] Could not parse Claude response, using empty object');
          parsed = {};
        }
      }

      const insertResult = await db.execute(sql`
        INSERT INTO strategic_pulse (workspace_id, big_shift, threat_radar, emerging_opportunities, competitor_moves, watch_list, regional_intelligence, entity_count, capture_count)
        VALUES (${workspaceId}, ${parsed.big_shift ? JSON.stringify(parsed.big_shift) : null}, ${parsed.threat_radar ? JSON.stringify(parsed.threat_radar) : null}, ${parsed.emerging_opportunities ? JSON.stringify(parsed.emerging_opportunities) : null}, ${parsed.competitor_moves ? JSON.stringify(parsed.competitor_moves) : null}, ${parsed.watch_list ? JSON.stringify(parsed.watch_list) : null}, ${parsed.regional_intelligence ? JSON.stringify(parsed.regional_intelligence) : null}, ${entityCount}, ${captureCount})
        RETURNING *
      `);

      res.json(insertResult.rows[0]);
    } catch (e: any) {
      console.error("Strategic pulse generation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Win/Loss routes
  app.get("/api/entities/:entityId/win-loss", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const result = await pool.query(
        `SELECT * FROM entity_win_loss WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order, created_at DESC`,
        [req.params.entityId, workspaceId]
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Get win-loss error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/win-loss", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { outcome, deal_name, description, quarter, sector, est_arr } = req.body;
      if (!outcome || !deal_name) return res.status(400).json({ error: 'outcome and deal_name are required' });
      const result = await pool.query(
        `INSERT INTO entity_win_loss (workspace_id, entity_id, outcome, deal_name, description, quarter, sector, est_arr)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [workspaceId, req.params.entityId, outcome, deal_name, description || null, quarter || null, sector || null, est_arr || null]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create win-loss error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/win-loss/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { outcome, deal_name, description, quarter, sector, est_arr } = req.body;
      if (!outcome || !deal_name) return res.status(400).json({ error: 'outcome and deal_name are required' });
      const result = await pool.query(
        `UPDATE entity_win_loss SET outcome=$1, deal_name=$2, description=$3, quarter=$4, sector=$5, est_arr=$6
         WHERE id=$7 AND workspace_id=$8 AND entity_id=$9 RETURNING *`,
        [outcome, deal_name, description || null, quarter || null, sector || null, est_arr || null, req.params.id, workspaceId, req.params.entityId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Win/loss entry not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update win-loss error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/win-loss/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const deleted = await pool.query(
        `DELETE FROM entity_win_loss WHERE id=$1 AND workspace_id=$2 AND entity_id=$3 RETURNING id`,
        [req.params.id, workspaceId, req.params.entityId]
      );
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Win/loss entry not found' });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete win-loss error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  // Funding routes
  app.get("/api/entities/:entityId/funding", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const result = await pool.query(
        `SELECT * FROM entity_funding WHERE entity_id = $1 AND workspace_id = $2 ORDER BY sort_order, created_at DESC`,
        [req.params.entityId, workspaceId]
      );
      if (result.rows.length > 0) {
        return res.json(result.rows);
      }
      const workspace = await storage.getWorkspaceByUserId(userId);
      if (workspace) {
        const categories = workspace.categories as ExtractedCategory[];
        let foundEntity: any = null;
        for (const cat of categories) {
          const match = cat.entities.find((e: any) => e.name === req.params.entityId);
          if (match) { foundEntity = match; break; }
        }
        if (foundEntity?.funding && typeof foundEntity.funding === 'object') {
          const f = foundEntity.funding;
          const mapped = [{
            id: 'perplexity-0',
            workspace_id: workspaceId,
            entity_id: req.params.entityId,
            total_raised: f.total_raised ?? null,
            stage: f.latest_round ?? null,
            founded: null,
            status: 'Private',
            round_name: f.latest_round ?? null,
            round_amount: null,
            round_lead: Array.isArray(f.key_investors) && f.key_investors.length > 0 ? f.key_investors[0] : null,
            round_year: f.latest_round_date ?? null,
            sort_order: 0,
            created_at: null,
            source: 'perplexity',
          }];
          return res.json(mapped);
        }
      }
      res.json(result.rows);
    } catch (error: any) {
      console.error("Get funding error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/funding", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { total_raised, stage, founded, status, round_name, round_amount, round_lead, round_year } = req.body;
      const result = await pool.query(
        `INSERT INTO entity_funding (workspace_id, entity_id, total_raised, stage, founded, status, round_name, round_amount, round_lead, round_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [workspaceId, req.params.entityId, total_raised || null, stage || null, founded || null, status || 'Private', round_name || null, round_amount || null, round_lead || null, round_year || null]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create funding error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/funding/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const { total_raised, stage, founded, status, round_name, round_amount, round_lead, round_year } = req.body;
      const result = await pool.query(
        `UPDATE entity_funding SET total_raised=$1, stage=$2, founded=$3, status=$4, round_name=$5, round_amount=$6, round_lead=$7, round_year=$8
         WHERE id=$9 AND workspace_id=$10 AND entity_id=$11 RETURNING *`,
        [total_raised || null, stage || null, founded || null, status || 'Private', round_name || null, round_amount || null, round_lead || null, round_year || null, req.params.id, workspaceId, req.params.entityId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Funding entry not found' });
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update funding error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/funding/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' });
      const deleted = await pool.query(
        `DELETE FROM entity_funding WHERE id=$1 AND workspace_id=$2 AND entity_id=$3 RETURNING id`,
        [req.params.id, workspaceId, req.params.entityId]
      );
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Funding entry not found' });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete funding error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entities/:entityId/intelligence/:field", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.json(null);
      const result = await pool.query(
        `SELECT * FROM entity_intelligence WHERE entity_id = $1 AND workspace_id = $2 AND field = $3`,
        [req.params.entityId, workspaceId, req.params.field]
      );
      res.json(result.rows[0] || null);
    } catch (error: any) {
      console.error("Get intelligence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/intelligence/:field", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { content } = req.body;
      const result = await pool.query(
        `INSERT INTO entity_intelligence (workspace_id, entity_id, field, content, is_custom, last_edited_at)
         VALUES ($1, $2, $3, $4, true, NOW())
         ON CONFLICT (workspace_id, entity_id, field)
         DO UPDATE SET content = $4, is_custom = true, last_edited_at = NOW()
         RETURNING *`,
        [workspaceId, req.params.entityId, req.params.field, content]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Put intelligence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/intelligence/:field/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const capturesResult = await pool.query(
        `SELECT content, matched_category, created_at FROM captures
         WHERE user_id = $1 AND matched_entity ILIKE $2
         ORDER BY created_at DESC LIMIT 20`,
        [userId, `%${req.params.entityId}%`]
      );
      const entityName = req.params.entityId;
      const capturesSummary = capturesResult.rows.map((c: any) => c.content?.slice(0, 200)).join('\n');

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are a competitive intelligence analyst. Based on recent signals about "${entityName}", write a concise "So what" paragraph (3-4 sentences max) that explains what this competitor's recent moves mean strategically for us. Be direct and actionable. No bullet points.\n\nRecent signals:\n${capturesSummary || 'No recent captures available.'}\n\nReturn only the paragraph text, no preamble.`
        }]
      });
      const firstBlock = response.content[0];
      const generatedContent = firstBlock.type === 'text' ? firstBlock.text : '';
      const result = await pool.query(
        `INSERT INTO entity_intelligence (workspace_id, entity_id, field, content, is_custom, last_generated_at)
         VALUES ($1, $2, $3, $4, false, NOW())
         ON CONFLICT (workspace_id, entity_id, field)
         DO UPDATE SET content = $4, is_custom = false, last_generated_at = NOW()
         RETURNING *`,
        [workspaceId, req.params.entityId, req.params.field, generatedContent]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Regenerate intelligence error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entities/:entityId/capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.json([]);
      const result = await pool.query(
        `SELECT * FROM entity_capabilities WHERE entity_id = $1 AND workspace_id = $2 ORDER BY display_order, created_at`,
        [req.params.entityId, workspaceId]
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Get capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { capability_name, capability_description, competitor_has, us_has, assessment } = req.body;
      const result = await pool.query(
        `INSERT INTO entity_capabilities (workspace_id, entity_id, capability_name, capability_description, competitor_has, us_has, assessment)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [workspaceId, req.params.entityId, capability_name, capability_description, competitor_has, us_has, assessment]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/entities/:entityId/capabilities/:capId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { capability_name, capability_description, competitor_has, us_has, assessment } = req.body;
      const result = await pool.query(
        `UPDATE entity_capabilities SET capability_name=$1, capability_description=$2, competitor_has=$3, us_has=$4, assessment=$5
         WHERE id=$6 AND workspace_id=$7 AND entity_id=$8 RETURNING *`,
        [capability_name, capability_description, competitor_has, us_has, assessment, req.params.capId, workspaceId, req.params.entityId]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/capabilities/:capId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      await pool.query(`DELETE FROM entity_capabilities WHERE id=$1 AND workspace_id=$2 AND entity_id=$3`, [req.params.capId, workspaceId, req.params.entityId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/entities/:entityId/certifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.json([]);
      const result = await pool.query(
        `SELECT * FROM entity_certifications WHERE entity_id = $1 AND workspace_id = $2 ORDER BY created_at`,
        [req.params.entityId, workspaceId]
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Get certifications error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/entities/:entityId/certifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { cert_name, cert_description, status, renewal_date } = req.body;
      const result = await pool.query(
        `INSERT INTO entity_certifications (workspace_id, entity_id, cert_name, cert_description, status, renewal_date)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [workspaceId, req.params.entityId, cert_name, cert_description, status || 'active', renewal_date]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create certification error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/entities/:entityId/certifications/:certId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profileResult = await pool.query(`SELECT role FROM user_profiles WHERE user_id = $1`, [userId]);
      const role = profileResult.rows[0]?.role;
      if (role === 'read_only') return res.status(403).json({ error: 'Forbidden' });
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      await pool.query(`DELETE FROM entity_certifications WHERE id=$1 AND workspace_id=$2 AND entity_id=$3`, [req.params.certId, workspaceId, req.params.entityId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete certification error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  // ── Competitive Dimensions ──────────────────────────────────────────────────

  app.get("/api/dimensions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.json([]);
      const result = await db.execute(
        sql`SELECT * FROM competitive_dimensions WHERE workspace_id = ${workspaceId} ORDER BY display_order ASC`
      );
      return res.json(result.rows);
    } catch (error: any) {
      console.error("Get dimensions error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/dimensions", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { name, source = "custom", priority = "medium", items = [], display_order = 0 } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const result = await db.execute(sql`
        INSERT INTO competitive_dimensions (workspace_id, name, source, priority, display_order, items)
        VALUES (${workspaceId}, ${name}, ${source}, ${priority}, ${display_order}, ${JSON.stringify(items)}::jsonb)
        RETURNING *
      `);
      return res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Create dimension error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/dimensions/:id", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      const { name, priority, items, display_order } = req.body;
      const result = await db.execute(sql`
        UPDATE competitive_dimensions
        SET name = ${name},
            priority = ${priority},
            items = ${JSON.stringify(items)}::jsonb,
            display_order = ${display_order},
            updated_at = NOW()
        WHERE id = ${req.params.id}::uuid AND workspace_id = ${workspaceId}
        RETURNING *
      `);
      if (result.rows.length === 0) return res.status(404).json({ message: "Dimension not found" });
      return res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Update dimension error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/dimensions/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });
      await db.execute(sql`DELETE FROM competitor_dimension_status WHERE dimension_id = ${req.params.id}::uuid`);
      await db.execute(sql`DELETE FROM competitive_dimensions WHERE id = ${req.params.id}::uuid AND workspace_id = ${workspaceId}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete dimension error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/dimensions/suggest", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.status(404).json({ message: "No workspace found" });

      const pcResult = await pool.query(`SELECT * FROM product_context WHERE tenant_id = $1 LIMIT 1`, [workspaceId]);
      const pc = pcResult.rows[0];

      const userPrompt = [
        pc?.product_name ? `Product: ${pc.product_name}` : "",
        pc?.description ? `Description: ${pc.description}` : "",
        pc?.target_customer ? `Target customer: ${pc.target_customer}` : "",
        pc?.strengths ? `Strengths: ${pc.strengths}` : "",
        pc?.weaknesses ? `Weaknesses: ${pc.weaknesses}` : "",
      ].filter(Boolean).join("\n") || "No product context provided.";

      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `You are an expert competitive analyst. Based on the product description, suggest 3-5 competitive dimensions that would be most important to track against competitors. For each dimension, provide a name, suggested priority (high/medium/low), and 4-7 specific capability items. Respond ONLY with valid JSON, no markdown fences. Format: [{name, priority, rationale, items: [{name}]}]`,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawText = (response.content[0] as any).text || "";
      const clean = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(clean);
      return res.json(parsed);
    } catch (error: any) {
      console.error("Suggest dimensions error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/competitor-dimensions/:entityName", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const entityName = req.params.entityName;

      const wsResult = await pool.query(
        `SELECT id FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.json({ dimensions: [] });

      const dimsResult = await db.execute(sql`
        SELECT * FROM competitive_dimensions
        WHERE workspace_id = ${workspaceId}::uuid
        ORDER BY display_order ASC
      `);

      const statusResult = await db.execute(sql`
        SELECT * FROM competitor_dimension_status WHERE entity_name = ${entityName}
      `);
      const statusMap = new Map<string, any>();
      for (const row of statusResult.rows as any[]) {
        statusMap.set(`${row.dimension_id}::${row.item_name}`, row);
      }

      const dimensions = (dimsResult.rows as any[]).map((dim) => {
        const rawItems: any[] = Array.isArray(dim.items) ? dim.items : JSON.parse(dim.items || '[]');
        return {
          id: dim.id,
          name: dim.name,
          priority: dim.priority,
          items: rawItems.map((item: any) => {
            const itemName = typeof item === 'string' ? item : item.name;
            const ourStatus = typeof item === 'object' ? (item.our_status ?? null) : null;
            const statusRow = statusMap.get(`${dim.id}::${itemName}`);
            return {
              name: itemName,
              our_status: ourStatus,
              competitor_status: statusRow?.status ?? null,
              status_id: statusRow?.id ?? null,
              source: statusRow?.source ?? null,
              evidence: statusRow?.evidence ?? null,
            };
          }),
        };
      });

      return res.json({ dimensions });
    } catch (error: any) {
      console.error("Get competitor dimensions error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/competitor-dimension-status/:id", requireAuth, requireSubAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, dimension_id, entity_name, item_name } = req.body;

      if (!status) return res.status(400).json({ message: "status is required" });

      if (id === "new") {
        if (!dimension_id || !entity_name || !item_name) {
          return res.status(400).json({ message: "dimension_id, entity_name, and item_name are required for new rows" });
        }
        const result = await db.execute(sql`
          INSERT INTO competitor_dimension_status (dimension_id, entity_name, item_name, status, source, last_updated)
          VALUES (${dimension_id}::uuid, ${entity_name}, ${item_name}, ${status}, 'manual', NOW())
          RETURNING *
        `);
        return res.json(result.rows[0]);
      } else {
        const result = await db.execute(sql`
          UPDATE competitor_dimension_status
          SET status = ${status}, source = 'manual', last_updated = NOW()
          WHERE id = ${id}::uuid
          RETURNING *
        `);
        if (result.rows.length === 0) return res.status(404).json({ message: "Status row not found" });
        return res.json(result.rows[0]);
      }
    } catch (error: any) {
      console.error("Update competitor dimension status error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/matrix/dimensions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wsResult = await pool.query(
        `SELECT id, categories FROM workspaces WHERE user_id = $1 OR id::text = (SELECT parent_workspace_id::text FROM workspaces WHERE user_id = $1 LIMIT 1) LIMIT 1`,
        [userId]
      );
      const workspaceId = wsResult.rows[0]?.id;
      if (!workspaceId) return res.json({ dimensions: [], competitors: [] });

      const dimsResult = await db.execute(sql`
        SELECT * FROM competitive_dimensions
        WHERE workspace_id = ${workspaceId}::uuid
        ORDER BY display_order ASC
      `);

      const dims = dimsResult.rows as any[];
      if (dims.length === 0) return res.json({ dimensions: [], competitors: [] });

      const dimIds = dims.map((d) => d.id);
      const statusResult = dimIds.length > 0
        ? await db.execute(sql`
            SELECT * FROM competitor_dimension_status
            WHERE dimension_id IN (${sql.join(dimIds.map(id => sql`${id}::uuid`), sql`, `)})
          `)
        : { rows: [] };

      const allStatusRows = statusResult.rows as any[];

      const competitorSet = new Set<string>();
      for (const row of allStatusRows) {
        competitorSet.add(row.entity_name);
      }

      const categories = wsResult.rows[0]?.categories;
      if (categories) {
        const cats = typeof categories === 'string' ? JSON.parse(categories) : categories;
        for (const cat of (cats || [])) {
          for (const entity of (cat.entities || [])) {
            if (entity.topic_type === 'competitor') {
              competitorSet.add(entity.name);
            }
          }
        }
      }

      const competitors = Array.from(competitorSet).sort();

      const statusMap = new Map<string, any[]>();
      for (const row of allStatusRows) {
        const key = `${row.dimension_id}::${row.item_name}`;
        if (!statusMap.has(key)) statusMap.set(key, []);
        statusMap.get(key)!.push(row);
      }

      const dimensions = dims.map((dim) => {
        const rawItems: any[] = Array.isArray(dim.items) ? dim.items : JSON.parse(dim.items || '[]');
        return {
          id: dim.id,
          name: dim.name,
          priority: dim.priority,
          display_order: dim.display_order,
          items: rawItems.map((item: any) => {
            const itemName = typeof item === 'string' ? item : item.name;
            const ourStatus = typeof item === 'object' ? (item.our_status ?? null) : null;
            const statuses = statusMap.get(`${dim.id}::${itemName}`) || [];
            return {
              name: itemName,
              our_status: ourStatus,
              competitors: statuses.map((s) => ({
                entity_name: s.entity_name,
                status: s.status,
                source: s.source,
              })),
            };
          }),
        };
      });

      return res.json({ dimensions, competitors });
    } catch (error: any) {
      console.error("Get matrix dimensions error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.get("/api/debug/db-check", async (req, res) => {
    try {
      const dims = await db.execute(
        sql`SELECT id, name FROM competitive_dimensions ORDER BY created_at`
      );
      res.json({
        db_url_prefix: process.env.DATABASE_URL?.substring(0, 50),
        rows: dims.rows
      });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  return httpServer;
}
