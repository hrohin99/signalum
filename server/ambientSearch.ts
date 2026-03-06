import { storage } from "./storage";
import {
  searchCompetitorNews,
  searchTopicUpdates,
  deduplicateFindings,
  findingsToCaptures,
} from "./perplexityService";
import type { ExtractedCategory, ExtractedEntity, InsertNotification } from "@shared/schema";

class RateLimiter {
  private timestamps: number[] = [];
  private maxCalls: number;
  private windowMs: number;

  constructor(maxCalls: number, windowMs: number) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

      if (this.timestamps.length < this.maxCalls) {
        this.timestamps.push(now);
        return;
      }

      const oldest = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldest) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

const perplexityRateLimiter = new RateLimiter(10, 60000);

interface AmbientSearchResult {
  tenantId: string;
  userId: string;
  entitiesSearched: number;
  newCapturesCreated: number;
  notificationsCreated: number;
  errors: number;
  timestamp: string;
}

export async function runAmbientSearchForUser(
  userId: string,
  tenantId: string
): Promise<AmbientSearchResult> {
  const result: AmbientSearchResult = {
    tenantId,
    userId,
    entitiesSearched: 0,
    newCapturesCreated: 0,
    notificationsCreated: 0,
    errors: 0,
    timestamp: new Date().toISOString(),
  };

  const workspace = await storage.getWorkspaceByUserId(userId);
  if (!workspace) {
    console.log(`[ambient-search] No workspace found for user ${userId}`);
    return result;
  }

  const categories = workspace.categories as ExtractedCategory[];
  if (!categories || categories.length === 0) {
    console.log(`[ambient-search] No categories found for user ${userId}`);
    return result;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const category of categories) {
    for (const entity of category.entities) {
      try {
        await perplexityRateLimiter.waitForSlot();

        const topicType = (entity.topic_type || "general").toLowerCase();
        const lookbackDays = 7;

        let findings;
        if (topicType === "competitor") {
          findings = await searchCompetitorNews(entity.name, category.name, lookbackDays);
        } else {
          findings = await searchTopicUpdates(entity.name, topicType, lookbackDays);
        }

        result.entitiesSearched++;

        const existingCaptures = await storage.getCapturesByEntitySince(
          userId,
          entity.name,
          thirtyDaysAgo
        );
        const deduplicated = deduplicateFindings(findings, existingCaptures);

        if (deduplicated.length > 0) {
          const captureRecords = findingsToCaptures(
            deduplicated,
            entity.name,
            userId,
            category.name
          );
          const createdCaptures = await storage.createCaptures(captureRecords);
          result.newCapturesCreated += createdCaptures.length;

          const captureIds = createdCaptures.map((c) => c.id);
          await storage.flagCapturesForBrief(captureIds);

          const summaryParts = deduplicated.map((f) => f.summary);
          const aiSummary = `Latest updates (${new Date().toLocaleDateString()}): ${summaryParts.slice(0, 3).join("; ")}`;
          await storage.updateEntityAiSummary(userId, entity.name, aiSummary);

          const highSignalFindings = deduplicated.filter(
            (f) => f.signal_strength === "high"
          );
          for (const finding of highSignalFindings) {
            const notification: InsertNotification = {
              tenantId,
              userId,
              entityName: entity.name,
              categoryName: category.name,
              type: "high_signal",
              title: `High-priority update: ${entity.name}`,
              content: finding.summary,
              signalStrength: "high",
              read: 0,
            };
            await storage.createNotification(notification);
            result.notificationsCreated++;
          }
        }
      } catch (entityError) {
        console.error(
          `[ambient-search] Error searching entity ${entity.name}:`,
          entityError
        );
        result.errors++;
      }
    }
  }

  await storage.createAmbientSearchLog({
    tenantId,
    userId,
    entitiesSearched: result.entitiesSearched,
    newCapturesCreated: result.newCapturesCreated,
    notificationsCreated: result.notificationsCreated,
    errors: result.errors,
  });

  console.log(
    `[ambient-search] Completed for user ${userId}: ${result.entitiesSearched} entities searched, ${result.newCapturesCreated} new captures, ${result.notificationsCreated} notifications, ${result.errors} errors`
  );

  return result;
}

export async function runAmbientSearchForAllTenants(): Promise<AmbientSearchResult[]> {
  const results: AmbientSearchResult[] = [];
  const allWorkspaces = await storage.getAllWorkspaces();

  console.log(
    `[ambient-search] Starting ambient search for ${allWorkspaces.length} workspace(s)`
  );

  const tenantId = "00000000-0000-0000-0000-000000000000";

  for (const workspace of allWorkspaces) {
    try {
      const searchResult = await runAmbientSearchForUser(
        workspace.userId,
        tenantId
      );
      results.push(searchResult);
    } catch (error) {
      console.error(
        `[ambient-search] Failed for user ${workspace.userId}:`,
        error
      );
      results.push({
        tenantId,
        userId: workspace.userId,
        entitiesSearched: 0,
        newCapturesCreated: 0,
        notificationsCreated: 0,
        errors: 1,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log(
    `[ambient-search] All tenants complete. Total workspaces: ${results.length}`
  );
  return results;
}
