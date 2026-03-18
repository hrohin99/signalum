import { storage } from "./storage";
import {
  searchCompetitorNews,
  searchTopicUpdates,
  deduplicateFindings,
  findingsToCaptures,
} from "./perplexityService";
import { runJinaCompetitorEnrichment } from "./jinaSearchService";
import type { ExtractedCategory, ExtractedEntity, InsertNotification } from "@shared/schema";

async function researchEntity(entity: { name: string }, categoryContext: string = ''): Promise<{ funding: any; geo_presence: string[]; products: any[] } | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  const systemPrompt = 'You are a competitive intelligence researcher. Return only valid JSON with no prose, no markdown, no code fences.';
  const userPrompt = `Research the company "${entity.name}" and return a JSON object with exactly this structure:${categoryContext ? ` Context: ${categoryContext}.` : ''}
{
  "funding": {
    "total_raised": "string or null",
    "latest_round": "string or null",
    "latest_round_date": "string or null",
    "key_investors": ["array of investor name strings"]
  },
  "geo_presence": ["array of country or region name strings"],
  "products": [
    { "name": "string", "description": "one sentence string" }
  ]
}
Only include information you are confident about. Use null for unknown fields. Return JSON only.`;
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
    }),
  });
  if (!response.ok) {
    console.error(`[research] Perplexity error for ${entity.name}: ${response.status}`);
    return null;
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try {
    const cleanedText = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    return JSON.parse(cleanedText);
  } catch (err) {
    console.error(`[research] Failed to parse response for ${entity.name}:`, err);
    return null;
  }
}

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
      if (entity.auto_search_enabled === false) {
        console.log(`[ambient-search] Skipping ${entity.name} (auto search disabled)`);
        continue;
      }

      try {
        await perplexityRateLimiter.waitForSlot();

        const topicType = (entity.topic_type || "general").toLowerCase();
        const lookbackDays = 7;
        const entityType = entity.entity_type_detected;
        const pricingModel = entity.pricing_model_detected;
        const websiteUrl = entity.website_url;

        const isLocalBusiness = entityType === "local_business" || pricingModel === "per_service";
        const isCommodity = entityType === "commodity";
        const isRegulation = entityType === "regulation";

        const categoryFocus = category.focus || category.description || undefined;

        let findings;
        if (isCommodity) {
          findings = await searchTopicUpdates(entity.name, topicType, lookbackDays, { websiteUrl, entityType: "commodity", categoryFocus });
        } else if (isRegulation) {
          findings = await searchTopicUpdates(entity.name, topicType, lookbackDays, { websiteUrl, entityType: "regulation", categoryFocus });
        } else if (topicType === "competitor") {
          findings = await searchCompetitorNews(entity.name, category.name, lookbackDays, {
            websiteUrl,
            skipHiring: isLocalBusiness,
            skipFinancial: isLocalBusiness,
            categoryFocus,
          });
        } else {
          findings = await searchTopicUpdates(entity.name, topicType, lookbackDays, { websiteUrl, categoryFocus });
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

          if (entity.alert_on_high_signal === true) {
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
        }
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const needsResearch = !entity.last_researched_at ||
          (Date.now() - new Date(entity.last_researched_at).getTime()) > THIRTY_DAYS_MS;
        if (entity.topic_type === 'competitor' && needsResearch) {
          await perplexityRateLimiter.waitForSlot();
          const researchResult = await researchEntity(entity, category.focus || category.description || '');
          if (researchResult !== null) {
            entity.funding = researchResult.funding;
            entity.geo_presence = researchResult.geo_presence;
            entity.products = researchResult.products;
            entity.last_researched_at = new Date().toISOString();
            console.log(`[research] Enriched ${entity.name} with funding/geo/products`);
          }
        }

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const needsJina = entity.topic_type === 'competitor' && (
          !entity.last_jina_searched_at ||
          (Date.now() - new Date(entity.last_jina_searched_at).getTime()) > SEVEN_DAYS_MS
        );
        if (needsJina) {
          const jinaResult = await runJinaCompetitorEnrichment(entity.name, entity.website_url);
          if (jinaResult !== null) {
            const existingGeo: string[] = Array.isArray(entity.geo_presence) ? entity.geo_presence : [];
            const mergedGeo = Array.from(new Set([...existingGeo, ...jinaResult.geo_presence]));
            const existingProducts: { name: string; description: string }[] = Array.isArray(entity.products) ? entity.products : [];
            const existingProductNames = new Set(existingProducts.map((p: any) => p.name?.toLowerCase()));
            const newProducts = jinaResult.products.filter((p) => !existingProductNames.has(p.name?.toLowerCase()));
            entity.geo_presence = mergedGeo;
            entity.products = [...existingProducts, ...newProducts];
            entity.jina_customers = jinaResult.customers;
            entity.jina_customer_verticals = jinaResult.customer_verticals;
            entity.last_jina_searched_at = new Date().toISOString();
            console.log(`[jina] Enriched ${entity.name}: ${jinaResult.products.length} products, ${jinaResult.geo_presence.length} geo, ${jinaResult.customers.length} customers`);
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
    await storage.updateWorkspaceCategories(userId, categories);
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
