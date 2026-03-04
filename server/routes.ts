import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import multer from "multer";
import { storage } from "./storage";
import type { ExtractionResult, ExtractedCategory } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/extract", requireAuth, async (req: Request, res: Response) => {
    try {
      const { description } = req.body;

      if (!description || typeof description !== "string" || description.trim().length < 10) {
        return res.status(400).json({ message: "Description must be at least 10 characters" });
      }

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `You are an intelligence analyst assistant. A user wants to set up a personal intelligence tracking workspace. Based on their description below, extract structured categories and entities they want to track.

Return a JSON object with this exact structure:
{
  "categories": [
    {
      "name": "Category Name",
      "description": "Brief description of what this category covers",
      "entities": [
        {
          "name": "Entity Name",
          "type": "person|company|topic|technology|regulation|event|location|other"
        }
      ]
    }
  ],
  "summary": "A one-sentence summary of what the user wants to track"
}

Be thorough but concise. Create 2-5 categories. Each category should have 1-5 relevant entities. Only return valid JSON, no other text.

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
      return res.status(500).json({ message: error.message || "Failed to analyze input" });
    }
  });

  app.post("/api/classify", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { content, type } = req.body;

      if (!content || !type) {
        return res.status(400).json({ message: "Missing content or type" });
      }

      const workspace = await storage.getWorkspaceByUserId(userId);
      if (!workspace) {
        return res.status(404).json({ message: "No workspace found" });
      }

      const entities = flattenEntities(workspace.categories as ExtractedCategory[]);
      const entityList = entities.map(e => `- ${e.entityName} (${e.entityType}) in category "${e.categoryName}"`).join("\n");

      const client = getAnthropicClient();

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `You are an intelligence routing assistant. A user captured the following ${type} content. Match it to the most relevant entity from their workspace.

Available entities:
${entityList}

Captured content:
${content}

Return a JSON object with this exact structure (no other text):
{
  "matchedEntity": "Entity Name",
  "matchedCategory": "Category Name",
  "reason": "One sentence explaining why this content matches this entity."
}

If no entity is a good match, pick the closest one and explain why. Always return valid JSON only.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        return res.status(500).json({ message: "No text response from AI" });
      }

      let parsed: { matchedEntity: string; matchedCategory: string; reason: string };
      try {
        const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI classification" });
      }

      return res.json(parsed);
    } catch (error: any) {
      console.error("Classify error:", error);
      return res.status(500).json({ message: error.message || "Failed to classify content" });
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
      return res.status(500).json({ message: error.message || "Failed to transcribe audio" });
    }
  });

  app.post("/api/captures", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { type, content, matchedEntity, matchedCategory, matchReason } = req.body;

      if (!type || !content) {
        return res.status(400).json({ message: "Missing type or content" });
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
      return res.status(500).json({ message: error.message || "Failed to save capture" });
    }
  });

  app.get("/api/captures", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const captures = await storage.getCapturesByUserId(userId);
      return res.json(captures);
    } catch (error: any) {
      console.error("Get captures error:", error);
      return res.status(500).json({ message: error.message || "Failed to get captures" });
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
      return res.status(500).json({ message: error.message || "Failed to generate summary" });
    }
  });

  app.post("/api/add-entity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryName, entityName, entityType } = req.body;

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

      const exists = category.entities.some(e => e.name.toLowerCase() === entityName.toLowerCase());
      if (exists) {
        return res.status(400).json({ message: "Entity already exists in this category" });
      }

      category.entities.push({ name: entityName, type: entityType || "other" });

      const updated = await storage.updateWorkspaceCategories(userId, categories);
      return res.json({ success: true, workspace: updated });
    } catch (error: any) {
      console.error("Add entity error:", error);
      return res.status(500).json({ message: error.message || "Failed to add entity" });
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

      const workspace = await storage.createWorkspace({
        id: randomUUID(),
        userId,
        categories,
      });

      return res.json({ success: true, workspace });
    } catch (error: any) {
      console.error("Create workspace error:", error);
      return res.status(500).json({ message: error.message || "Failed to create workspace" });
    }
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
