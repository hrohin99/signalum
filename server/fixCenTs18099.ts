import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";

interface ExtractedEntity {
  name: string;
  disambiguation_context?: string;
  disambiguation_confirmed?: boolean;
  needs_aspect_review?: boolean;
  aiSummary?: string;
  aiSummaryUpdatedAt?: string;
  [key: string]: any;
}

interface ExtractedCategory {
  name: string;
  entities: ExtractedEntity[];
  [key: string]: any;
}

export async function fixCenTs18099Entity() {
  const targetEntityName = "CEN/TS 18099";
  const correctContext = "Technical standard for injection attack detection in document verification systems";
  const targetUserId = "14b5f356-7042-461f-8e9f-6ecb5329f980";

  console.log(`[FixCenTs18099] Looking for entity "${targetEntityName}"...`);

  const workspace = await storage.getWorkspaceByUserId(targetUserId);
  if (!workspace) {
    console.log("[FixCenTs18099] Workspace not found. Skipping.");
    return;
  }

  const categories = workspace.categories as ExtractedCategory[];
  let foundEntity: ExtractedEntity | null = null;
  let foundCategoryName: string | null = null;

  for (const category of categories) {
    for (const entity of category.entities) {
      if (entity.name === targetEntityName) {
        foundEntity = entity;
        foundCategoryName = category.name;
        break;
      }
    }
    if (foundEntity) break;
  }

  if (!foundEntity) {
    console.log(`[FixCenTs18099] Entity "${targetEntityName}" not found. Skipping.`);
    return;
  }

  if (foundEntity.disambiguation_context === correctContext && foundEntity.disambiguation_confirmed === true) {
    console.log(`[FixCenTs18099] Entity "${targetEntityName}" already fixed. Skipping.`);
    return;
  }

  console.log(`[FixCenTs18099] Fixing entity "${targetEntityName}" in category "${foundCategoryName}"...`);

  foundEntity.disambiguation_context = correctContext;
  foundEntity.disambiguation_confirmed = true;
  foundEntity.needs_aspect_review = false;

  await storage.updateWorkspaceCategories(targetUserId, categories);
  console.log(`[FixCenTs18099] Updated disambiguation_context and confirmed.`);

  try {
    const allCaptures = await storage.getCapturesByUserId(targetUserId);
    const entityCaptures = allCaptures.filter(c => c.matchedEntity === targetEntityName);

    if (entityCaptures.length > 0) {
      const contentSnippets = entityCaptures
        .slice(0, 10)
        .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
        .join("\n\n");

      const client = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are an intelligence analyst. Based on the captured intel items below about "${targetEntityName}" (context: "${correctContext}"), write a concise 2-3 sentence intelligence summary. Focus on what is known, key developments, and any notable patterns. Be direct and analytical — no filler.

Captured intel:
${contentSnippets}

Return only the summary paragraph, no JSON, no formatting.`
          }
        ]
      });

      const textContent = message.content.find(block => block.type === "text");
      if (textContent && textContent.type === "text") {
        await storage.updateEntityAiSummary(targetUserId, targetEntityName, textContent.text.trim());
        console.log(`[FixCenTs18099] AI summary regenerated successfully.`);
      }
    } else {
      console.log(`[FixCenTs18099] No captures found for summary regeneration.`);
    }
  } catch (error) {
    console.error(`[FixCenTs18099] Summary regeneration failed:`, error);
  }

  console.log(`[FixCenTs18099] Fix complete.`);
}
