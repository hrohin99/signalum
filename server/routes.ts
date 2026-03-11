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
import { eq } from "drizzle-orm";
import { z } from "zod";
import { buildProfileContext } from "./profileContext";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
  if (error?.message && typeof error.message === "string") {
    const msg = error.message;
    if (msg.includes("API key") || msg.includes("secret") || msg.includes("token") || msg.includes("password") || msg.includes("credential")) {
      return "An internal error occurred";
    }
    return msg.slice(0, 200);
  }
  return "An internal error occurred";
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
  <title>Email Verification — Watchloom</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:80px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 40px;text-align:center;">
              <span style="font-size:24px;font-weight:600;color:#ffffff;">Watchloom</span>
            </td>
          </tr>
          <tr>
            <td style="padding:48px 40px;text-align:center;">
              <div style="width:56px;height:56px;border-radius:50%;background-color:${color};color:#fff;font-size:28px;line-height:56px;margin:0 auto 24px;">${icon}</div>
              <p style="margin:0 0 32px;font-size:17px;color:#333;line-height:1.5;">${safeMessage}</p>
              <a href="/" style="display:inline-block;padding:12px 32px;background-color:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">Go to Watchloom</a>
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

      if (data.user?.id && (role || trackingText)) {
        try {
          await storage.createUserProfile({
            userId: data.user.id,
            role: role || null,
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
        .slice(0, 10)
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

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${profilePrefix}You are an intelligence analyst. Based on the captured intel items below about "${entityName}" (category: "${categoryName}"), write a structured strategic summary covering: what this entity is and does, recent notable developments, strategic direction, and relevance to the government identity verification space.

Use this format:
One sentence overview of what this company is.

Then 2-3 short paragraphs of 2-3 sentences each. Separate each paragraph with a blank line.

Do not use bullet points. Do not use em dashes. Do not use headers. Return only the paragraphs.
${focusContext}
Captured intel:
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

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
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
      const inferenceResult = incomingWebsiteUrl ? null : await performSiblingInference(entityName, tenantId, { categories }, categoryName, userId);

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
            findings = await searchCompetitorNews(searchContext, categoryName, 30, { categoryFocus: catFocus });
          } else {
            findings = await searchTopicUpdates(searchContext, topicType, 30, { categoryFocus: catFocus });
          }
          if (findings.length > 0) {
            const existingCaptures = await storage.getCapturesByUserId(userId);
            const entityCaptures = existingCaptures.filter(c => c.matchedEntity === entityName);
            const deduplicated = deduplicateFindings(findings, entityCaptures);
            if (deduplicated.length > 0) {
              const captureRecords = findingsToCaptures(deduplicated, entityName, userId, categoryName);
              await storage.createCaptures(captureRecords);
            }
          }
        } catch (searchErr: any) {
          console.error(`[AddEntity] Background search failed for "${entityName}":`, searchErr?.message || searchErr);
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

  app.put("/api/categories/:name", requireAuth, async (req: Request, res: Response) => {
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

      await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, category });
    } catch (error: any) {
      console.error("Update category error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.delete("/api/categories/:name", requireAuth, async (req: Request, res: Response) => {
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

  app.put("/api/topics/:entityName", requireAuth, async (req: Request, res: Response) => {
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

  app.delete("/api/topics/:entityName", requireAuth, async (req: Request, res: Response) => {
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
        .slice(0, 15)
        .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const categoryObj = categories.find(c => c.name === categoryName);
      const focusContext = categoryObj?.focus ? `\nThe user is specifically interested in the following focus area for this category: "${categoryObj.focus}". Prioritise and surface intelligence relevant to this focus. Deprioritise captures that are unrelated to it.` : "";

      const soWhatWsResult = await pool.query("SELECT * FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
      const soWhatProfileCtx = buildProfileContext(soWhatWsResult.rows[0] || null);
      const soWhatProfilePrefix = soWhatProfileCtx ? `${soWhatProfileCtx}\n\n` : "";

      const soWhatTenantId = "00000000-0000-0000-0000-000000000000";
      const prodContext = await storage.getProductContext(soWhatTenantId);

      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `${soWhatProfilePrefix}You are a strategic analyst. Given the following intelligence captures about "${entityName}", provide a structured analysis of what this means for an organisation like ${prodContext?.productName || "the user's organisation"}.

Use this exact format:

**Threat level:** [one sentence on the competitive risk]

**Key concerns:**
- [concern 1]
- [concern 2]
- [concern 3]

**Opportunities:**
- [opportunity 1]
- [opportunity 2]

**Recommended action:** [one direct sentence on what ${prodContext?.productName || "your organisation"} should do]

Do not use em dashes. Be direct and opinionated.${focusContext}\n\nCaptures:\n${contentSnippets}\n\nReturn only the structured analysis above, no JSON.`
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
                const lookbackDays = 90;
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

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `You are a senior intelligence analyst preparing a morning briefing for a decision-maker. Based on the intel items and entity data below, write a narrative daily intelligence brief.

Do not use em dashes anywhere in your response. Use commas or plain sentences instead.

Structure the brief as follows:

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

Keep bullet points to one sentence each. Be direct. No vague statements.

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
      const result = await pool.query("SELECT * FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
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

      const fieldMap: Record<string, string> = {
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

          const userEmail = (req as any).userEmail || (req as any).email || null;
          try {
            const { Resend } = await import("resend");
            const resendClient = new Resend(process.env.RESEND_API_KEY);
            await resendClient.emails.send({
              from: "Watchloom <notifications@watchloom.rohin.co>",
              to: "hrohin99@gmail.com",
              subject: "🎉 New Watchloom signup",
              html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
                  <h2 style="color: #1e3a5f; margin-bottom: 8px;">New user signed up</h2>
                  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Email</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${userEmail || userId}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Perspective</td><td style="padding: 8px 0; font-size: 14px;">${req.body.userPerspective || "not set"}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Organisation</td><td style="padding: 8px 0; font-size: 14px;">${req.body.orgDescription?.slice(0, 100) || "not set"}</td></tr>
                    <tr><td style="padding: 8px 0; color: #666; font-size: 14px;">Time</td><td style="padding: 8px 0; font-size: 14px;">${new Date().toUTCString()}</td></tr>
                  </table>
                </div>
              `,
            });
          } catch (alertErr) {
            console.error("[admin alert] Failed to send new user notification:", alertErr);
          }
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
              const competitors: string[] = Array.isArray(savedWorkspace.competitors) ? savedWorkspace.competitors : [];
              const regulationsMonitored: string[] = Array.isArray(savedWorkspace.regulations_monitored) ? savedWorkspace.regulations_monitored : [];
              const standardsCertified: string[] = Array.isArray(savedWorkspace.standards_certified) ? savedWorkspace.standards_certified : [];

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

              if (trackingTypes.includes("standards") && standardsCertified.length > 0) {
                newCategories.push({
                  name: "Standards & Certifications",
                  description: "Industry standards and certifications you track",
                  entities: standardsCertified.map(name => ({
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
      const tenantId = (req as any).tenantId;
      const context = await storage.getProductContext(tenantId);
      return res.json({ productContext: context || null });
    } catch (error: any) {
      console.error("Get product context error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/product-context", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { productName, description, targetCustomer, strengths, weaknesses } = req.body;

      if (!productName || typeof productName !== "string" || productName.trim().length === 0) {
        return res.status(400).json({ message: "Product name is required" });
      }

      const context = await storage.upsertProductContext({
        tenantId,
        productName: productName.trim(),
        description: description?.trim() || null,
        targetCustomer: targetCustomer?.trim() || null,
        strengths: strengths?.trim() || null,
        weaknesses: weaknesses?.trim() || null,
      });

      return res.json({ productContext: context });
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
      if (prodContext && prodContext.productName) {
        const meansMessage = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `${sdProfilePrefix}Given that ${prodContext.productName} serves ${prodContext.targetCustomer || "its target customers"} with strengths in ${prodContext.strengths || "its key areas"}, what does ${entityName}'s strategic direction mean for ${prodContext?.productName || "your organisation"}? Respond with 2-3 bullet points, one sentence each, starting with a strong verb. Do not use em dashes.

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
          message: "Search limit reached for today. Watchloom will automatically search again tomorrow.",
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
          subject: `Watchloom feedback — ${moodLabel}`,
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

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const email = (req as any).userEmail;
    if (email !== ADMIN_EMAIL) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  }

  app.get("/api/admin/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { data: { users: allUsers }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (usersError) throw usersError;
      const emailMap = new Map<string, string>();
      for (const u of allUsers) {
        if (u.id && u.email) emailMap.set(u.id, u.email);
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

  app.get("/api/capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const capabilities = await storage.getWorkspaceCapabilities(userId);
      return res.json({ capabilities });
    } catch (error: any) {
      console.error("Get capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/capabilities", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Capability name is required" });
      }
      const existing = await storage.getWorkspaceCapabilities(userId);
      if (existing.length >= 15) {
        return res.status(400).json({ message: "Maximum of 15 capabilities allowed" });
      }
      const capability = await storage.createWorkspaceCapability({
        tenantId: userId,
        name: name.trim(),
        displayOrder: existing.length,
      });
      return res.json({ capability });
    } catch (error: any) {
      console.error("Create capability error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/capabilities/reorder", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: "orderedIds array is required" });
      }
      await storage.reorderWorkspaceCapabilities(userId, orderedIds);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Reorder capabilities error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.put("/api/capabilities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Capability name is required" });
      }
      const updated = await storage.updateWorkspaceCapability(req.params.id, userId, { name: name.trim() });
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
      const deleted = await storage.deleteWorkspaceCapability(req.params.id, userId);
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
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const { capabilityId, status, evidence } = req.body;
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
        evidence !== undefined ? evidence : null
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

      const result = await sendBriefingEmail(userId, email, briefingData);
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

  return httpServer;
}
