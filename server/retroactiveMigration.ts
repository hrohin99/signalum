import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { ExtractedCategory, ExtractedEntity } from "@shared/schema";

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface EntityWithLocation {
  entity: ExtractedEntity;
  categoryName: string;
  workspaceUserId: string;
  siblingEntities: ExtractedEntity[];
  allCategories: ExtractedCategory[];
}

function findEntitiesNeedingMigration(
  categories: ExtractedCategory[],
  userId: string
): EntityWithLocation[] {
  const results: EntityWithLocation[] = [];
  const allEntities = categories.flatMap(c => c.entities);

  for (const category of categories) {
    for (const entity of category.entities) {
      if ((entity.disambiguation_confirmed ?? false) && !entity.disambiguation_context && !(entity.needs_aspect_review ?? false)) {
        results.push({
          entity,
          categoryName: category.name,
          workspaceUserId: userId,
          siblingEntities: allEntities.filter(e => e.name !== entity.name),
          allCategories: categories,
        });
      }
    }
  }

  return results;
}

async function inferDomainForEntity(
  entityName: string,
  categoryName: string,
  siblingEntities: ExtractedEntity[],
  workspaceContextData: any
): Promise<{ inferred_domain: string; confidence: "high" | "medium" | "low"; reasoning: string } | null> {
  try {
    let inferenceContext = "";

    const wsPrimaryDomain = workspaceContextData?.primaryDomain ?? null;
    const wsSubtopics: string[] = Array.isArray(workspaceContextData?.relevantSubtopics) ? workspaceContextData.relevantSubtopics : [];
    const wsKeywords: string[] = Array.isArray(workspaceContextData?.domainKeywords) ? workspaceContextData.domainKeywords : [];

    if (workspaceContextData && (wsPrimaryDomain || wsKeywords.length > 0)) {
      const parts: string[] = [];
      if (wsPrimaryDomain) parts.push(`Primary domain: ${wsPrimaryDomain}`);
      if (wsSubtopics.length > 0) {
        parts.push(`Relevant subtopics: ${wsSubtopics.join(", ")}`);
      }
      if (wsKeywords.length > 0) {
        parts.push(`Domain keywords: ${wsKeywords.join(", ")}`);
      }
      parts.push(`This topic is in a category called "${categoryName}".`);
      inferenceContext = parts.join(". ");
    } else {
      const confirmedSiblings = (siblingEntities || []).filter(
        e => (e.disambiguation_confirmed ?? false) && ((e.company_industry) || (Array.isArray(e.domain_keywords) && e.domain_keywords.length > 0))
      );

      if (confirmedSiblings.length > 0) {
        const recentConfirmed = confirmedSiblings.slice(-3);
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
        inferenceContext = `Existing tracked entities: ${parts.join("; ")}. This topic is in a category called "${categoryName}".`;
      } else {
        inferenceContext = `This topic is in a category called "${categoryName}". Use this as the primary context when determining the relevant aspect of this entity.`;
      }
    }

    if (!inferenceContext) {
      return null;
    }

    const client = getAnthropicClient();

    const inferencePromise = client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `A user is tracking "${entityName}" in their workspace. Their existing workspace focuses on: ${inferenceContext}. Given this context, which aspect of "${entityName}" is most relevant to this workspace? Return ONLY valid JSON with this structure:
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
      setTimeout(() => reject(new Error("Retroactive inference timed out")), 15000)
    );

    const message = await Promise.race([inferencePromise, timeoutPromise]);

    const textContent = message.content.find(block => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return null;
    }

    const jsonStr = textContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(jsonStr);

    const validConfidences = ["high", "medium", "low"];
    if (!validConfidences.includes(result.confidence)) {
      result.confidence = "low";
    }

    return result;
  } catch (error: any) {
    console.error(`[RetroactiveMigration] Inference failed for "${entityName}":`, error?.message || error);
    return null;
  }
}

async function regenerateCompetitorSummary(
  userId: string,
  entityName: string,
  disambiguationContext: string,
  categoryName: string
): Promise<void> {
  try {
    const client = getAnthropicClient();

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `Generate a comprehensive strategic summary of 150-200 words for the competitor "${entityName}" in the category "${categoryName}". Focus specifically on their "${disambiguationContext}" business area. Cover: what this entity is doing, recent notable developments, strategic direction, and relevance to the government identity verification space. Use plain paragraphs, no bullet points. Return ONLY the summary text, no JSON or formatting.`
        }
      ]
    });

    const textContent = message.content.find(block => block.type === "text");
    if (textContent && textContent.type === "text") {
      const summary = `Focused on ${disambiguationContext}: ${textContent.text.trim()}`;
      await storage.updateEntityAiSummary(userId, entityName, summary);
      console.log(`[RetroactiveMigration] Regenerated summary for competitor "${entityName}"`);
    }
  } catch (error: any) {
    console.error(`[RetroactiveMigration] Summary regeneration failed for "${entityName}":`, error?.message || error);
  }
}

export async function runRetroactiveMigration(): Promise<void> {
  console.log("[RetroactiveMigration] Starting one-time background migration...");

  try {
    const allWorkspaces = await storage.getAllWorkspaces();

    if (allWorkspaces.length === 0) {
      console.log("[RetroactiveMigration] No workspaces found. Skipping migration.");
      return;
    }

    let totalProcessed = 0;
    let totalHighConfidence = 0;
    let totalNeedsReview = 0;
    let totalSkipped = 0;
    const competitorEntities: Array<{ userId: string; entityName: string; context: string; categoryName: string }> = [];

    for (const workspace of allWorkspaces) {
      const categories = workspace.categories as ExtractedCategory[];
      if (!categories || categories.length === 0) continue;

      const entitiesToMigrate = findEntitiesNeedingMigration(categories, workspace.userId);
      if (entitiesToMigrate.length === 0) continue;

      console.log(`[RetroactiveMigration] Found ${entitiesToMigrate.length} entities needing migration for user ${workspace.userId}`);

      const tenantId = workspace.id;
      let wsContext = null;
      try {
        wsContext = await storage.getWorkspaceContext(tenantId);
      } catch (err) {
        console.error(`[RetroactiveMigration] Failed to fetch workspace context for tenant ${tenantId}:`, err);
      }

      for (const item of entitiesToMigrate) {
        try {
          const result = await inferDomainForEntity(
            item.entity.name,
            item.categoryName,
            item.siblingEntities,
            wsContext
          );

          if (!result) {
            item.entity.needs_aspect_review = true;
            totalNeedsReview++;
            console.log(`[RetroactiveMigration] No inference result for "${item.entity.name}" — flagged for review`);
          } else if (result.confidence === "high") {
            item.entity.disambiguation_context = result.inferred_domain;
            totalHighConfidence++;
            console.log(`[RetroactiveMigration] High confidence for "${item.entity.name}" → "${result.inferred_domain}"`);

            if ((item.entity.type || "").toLowerCase() === "competitor" ||
                (item.entity.topic_type || "").toLowerCase() === "competitor") {
              competitorEntities.push({
                userId: workspace.userId,
                entityName: item.entity.name,
                context: result.inferred_domain,
                categoryName: item.categoryName,
              });
            }
          } else if (result.confidence === "medium") {
            item.entity.disambiguation_context = result.inferred_domain;
            item.entity.needs_aspect_review = true;
            totalNeedsReview++;
            console.log(`[RetroactiveMigration] Medium confidence for "${item.entity.name}" → "${result.inferred_domain}" (flagged for review)`);
          } else {
            item.entity.needs_aspect_review = true;
            totalNeedsReview++;
            console.log(`[RetroactiveMigration] Low confidence for "${item.entity.name}" — flagged for review`);
          }

          totalProcessed++;

          await delay(500);
        } catch (error: any) {
          console.error(`[RetroactiveMigration] Error processing "${item.entity.name}":`, error?.message || error);
          item.entity.needs_aspect_review = true;
          totalNeedsReview++;
          totalProcessed++;
        }
      }

      await storage.updateWorkspaceCategories(workspace.userId, categories);
      console.log(`[RetroactiveMigration] Saved updated categories for user ${workspace.userId}`);
    }

    console.log(`[RetroactiveMigration] Entity migration complete: ${totalProcessed} processed, ${totalHighConfidence} high confidence, ${totalNeedsReview} need review, ${totalSkipped} skipped`);

    if (competitorEntities.length > 0) {
      console.log(`[RetroactiveMigration] Regenerating AI summaries for ${competitorEntities.length} competitor entities...`);

      for (const competitor of competitorEntities) {
        await regenerateCompetitorSummary(
          competitor.userId,
          competitor.entityName,
          competitor.context,
          competitor.categoryName
        );
        await delay(1000);
      }

      console.log(`[RetroactiveMigration] Competitor summary regeneration complete.`);
    }

    console.log("[RetroactiveMigration] One-time migration complete.");
  } catch (error: any) {
    console.error("[RetroactiveMigration] Migration failed:", error?.message || error);
  }
}
