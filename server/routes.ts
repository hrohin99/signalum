import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHmac } from "crypto";
import multer from "multer";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { sendVerificationEmail, getAppUrl } from "./email";
import type { ExtractionResult, ExtractedCategory } from "@shared/schema";

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
        model: "claude-sonnet-4-6",
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
        return `- ${e.entityName} (${e.entityType}, topic_type: ${topicType}) in category "${e.categoryName}"`;
      }).join("\n");

      const client = getAnthropicClient();

      const categories = workspace.categories as ExtractedCategory[];
      const categoryList = categories.map(c => `- "${c.name}": ${c.description}`).join("\n");

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `You are an intelligence routing assistant. A user captured the following ${type} content. Match it to the most relevant entity from their workspace, but ONLY if the match is genuinely appropriate.

Available entities (with their current topic_type):
${entityList}

Available categories:
${categoryList}

Captured content:
${content}

IMPORTANT: Evaluate how well the content fits any existing entity and category. Assign a confidence score from 0 to 100.

Additionally, evaluate whether the matched entity's current topic_type is still the best fit given this new content. The valid topic_type values are: competitor, project, regulation, person, trend, account, technology, event, deal, risk, general.

If your confidence is 70 or above, return this JSON:
{
  "matched": true,
  "confidence": <number>,
  "matchedEntity": "Entity Name",
  "matchedCategory": "Category Name",
  "reason": "One sentence explaining why this content matches this entity.",
  "suggested_type_change": "new_type_key or null"
}

Set "suggested_type_change" to a new topic_type key ONLY if the content strongly suggests the entity's current type is wrong. Set it to null if the current type is fine.

If your confidence is below 70 — meaning no existing category or entity is a genuinely good fit — do NOT force a match. Instead, suggest a new category. Return this JSON:
{
  "matched": false,
  "confidence": <number>,
  "reason": "One sentence explaining why no existing category fits.",
  "suggestedCategory": {
    "name": "Suggested Category Name",
    "description": "A short description of what this category would track."
  },
  "suggestedEntity": {
    "name": "Suggested Topic Name",
    "type": "topic",
    "topic_type": "inferred_type_key"
  }
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

      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

      const validTopicTypes = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      const suggestedTypeChange = (typeof parsed.suggested_type_change === "string" && validTopicTypes.includes(parsed.suggested_type_change)) ? parsed.suggested_type_change : null;

      if (parsed.matched === true && confidence >= 70 && parsed.matchedEntity && parsed.matchedCategory) {
        return res.json({
          matched: true,
          confidence,
          matchedEntity: parsed.matchedEntity,
          matchedCategory: parsed.matchedCategory,
          reason: parsed.reason || "",
          suggested_type_change: suggestedTypeChange,
        });
      }

      if (parsed.suggestedCategory?.name && parsed.suggestedEntity?.name) {
        return res.json({
          matched: false,
          confidence,
          reason: parsed.reason || "No existing category is a strong match for this content.",
          suggestedCategory: parsed.suggestedCategory,
          suggestedEntity: parsed.suggestedEntity,
        });
      }

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
      });
    } catch (error: any) {
      console.error("Classify error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
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
        model: "claude-sonnet-4-6",
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

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are an intelligence analyst. Based on the captured intel items below about "${entityName}" (category: "${categoryName}"), write a concise 2-3 sentence intelligence summary. Focus on what is known, key developments, and any notable patterns. Be direct and analytical — no filler.

Captured intel:
${contentSnippets}

Return only the summary paragraph, no JSON, no formatting.`
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
      const { categoryName, entityName, entityType } = req.body;

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

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const category = categories.find(c => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const exists = category.entities.some(e => e.name.toLowerCase() === entityName.toLowerCase());
      if (exists) {
        return res.status(400).json({ message: "Entity already exists in this category" });
      }

      category.entities.push({ name: entityName, type: safeEntityType, topic_type: 'general', related_topic_ids: [], priority: 'medium' });

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated });
    } catch (error: any) {
      console.error("Add entity error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
  });

  app.post("/api/add-category", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, categoryDescription, entityName, entityType, topicType } = req.body;

      if (!categoryName || typeof categoryName !== "string" || categoryName.length > 200) {
        return res.status(400).json({ message: "Invalid or missing category name" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const categories = workspace.categories as ExtractedCategory[];
      const exists = categories.some(c => c.name.toLowerCase() === categoryName.toLowerCase());
      if (exists) {
        return res.status(400).json({ message: "Category already exists" });
      }

      const allowedEntityTypes = ["person", "company", "topic", "technology", "regulation", "event", "location", "other"];
      const safeEntityType = (typeof entityType === "string" && allowedEntityTypes.includes(entityType)) ? entityType : "topic";

      const validTopicTypesForCategory = ["competitor", "project", "regulation", "person", "trend", "account", "technology", "event", "deal", "risk", "general"];
      const safeTopicType = (typeof topicType === "string" && validTopicTypesForCategory.includes(topicType)) ? topicType : "general";

      const newCategory: ExtractedCategory = {
        name: categoryName,
        description: typeof categoryDescription === "string" ? categoryDescription : "",
        entities: entityName ? [{ name: entityName, type: safeEntityType, topic_type: safeTopicType, related_topic_ids: [], priority: 'medium' as const }] : [],
      };

      categories.push(newCategory);
      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated, newCategory });
    } catch (error: any) {
      console.error("Add category error:", error);
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
        if (typeof topic_type !== "string" || !validTopicTypes.includes(topic_type)) {
          return res.status(400).json({ message: "Invalid topic_type" });
        }
        entity.topic_type = topic_type;
      }

      const validPriorities = ["high", "medium", "low", "watch"];
      if (priority !== undefined) {
        if (typeof priority !== "string" || !validPriorities.includes(priority)) {
          return res.status(400).json({ message: "Invalid priority" });
        }
        entity.priority = priority as 'high' | 'medium' | 'low' | 'watch';
      }

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated });
    } catch (error: any) {
      console.error("Update entity error:", error);
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
      const { categories } = req.body;

      if (!categories) {
        return res.status(400).json({ message: "Missing categories" });
      }

      const existing = await storage.getWorkspaceByUserId(userId);
      if (existing) {
        return res.json({ success: true, workspace: existing });
      }

      const categoriesWithDefaults = categories.map((cat: any) => ({
        ...cat,
        entities: (cat.entities || []).map((entity: any) => ({
          ...entity,
          topic_type: entity.topic_type || 'general',
          related_topic_ids: entity.related_topic_ids || [],
          priority: entity.priority || 'medium',
        })),
      }));

      const workspace = await storage.createWorkspace({
        id: randomUUID(),
        userId,
        categories: categoriesWithDefaults,
      });

      return res.json({ success: true, workspace });
    } catch (error: any) {
      console.error("Create workspace error:", error);
      return res.status(500).json({ message: sanitizeErrorMessage(error) });
    }
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

      const entitySummaries = entities.map(e => {
        const entityCaptures = allCaptures.filter(c => c.matchedEntity === e.entityName);
        if (entityCaptures.length === 0) return null;
        const snippets = entityCaptures
          .slice(0, 5)
          .map((c, i) => `  [${i + 1}] (${c.type}) ${c.content.slice(0, 300)}`)
          .join("\n");
        return `Entity: ${e.entityName} (${e.entityType}) — Category: ${e.categoryName}\nRecent intel (${entityCaptures.length} items):\n${snippets}`;
      }).filter(Boolean);

      const briefingContext = entitySummaries.length > 0
        ? entitySummaries.join("\n\n")
        : allCaptures.slice(0, 20).map((c, i) => `[${i + 1}] (${c.type}, entity: ${c.matchedEntity || "unmatched"}) ${c.content.slice(0, 300)}`).join("\n\n");

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `You are a senior intelligence analyst preparing a morning briefing for a decision-maker. Based on the intel items and entity data below, write a narrative daily intelligence brief.

Structure the brief as follows:
1. **Executive Summary** — A 2-3 sentence high-level overview of the most important developments.
2. **Key Developments** — A section for each category/entity that has notable activity. Use clear headers. For each, provide a short analytical paragraph synthesizing the captured intel.
3. **Watch Items** — Any emerging patterns, risks, or items that deserve continued attention.

Be direct, analytical, and concise. Write in a professional intelligence briefing style. Do not include any JSON or metadata — write pure narrative prose with markdown formatting. Do NOT use horizontal rules or separator lines (---) anywhere in the output. Use headings and spacing to separate sections instead.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Categories being tracked:
${categories.map(c => `- ${c.name}: ${c.description}`).join("\n")}

Intel data:
${briefingContext}

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

      return res.json(brief);
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
        model: "claude-sonnet-4-6",
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
        model: "claude-sonnet-4-6",
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

  app.get("/api/workspace/current", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const workspace = await storage.getWorkspaceByUserId(userId);

    if (workspace) {
      return res.json({ exists: true, workspace });
    }

    return res.json({ exists: false });
  });

  app.get("/api/workspace/:userId", requireAuth, async (req: Request, res: Response) => {
    const authenticatedUserId = (req as any).userId;
    const { userId } = req.params;

    if (authenticatedUserId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const workspace = await storage.getWorkspaceByUserId(userId);

    if (workspace) {
      return res.json({ exists: true, workspace });
    }

    return res.json({ exists: false });
  });

  return httpServer;
}
