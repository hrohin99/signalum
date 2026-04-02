import { storage, pool, db } from "./storage";
import {
  searchCompetitorNews,
  searchTopicUpdates,
  deduplicateFindings,
  findingsToCaptures,
} from "./perplexityService";
import { runJinaCompetitorEnrichment } from "./jinaSearchService";
import type { ExtractedCategory, ExtractedEntity, InsertNotification } from "@shared/schema";
import { sql } from "drizzle-orm";

type FindingWithFocusArea = Awaited<ReturnType<typeof searchTopicUpdates>>[number] & { focus_area?: string };

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

async function extractMilestonesForEntity(
  entityName: string,
  workspaceId: string,
  categoryFocus?: string
): Promise<void> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return;

  const systemPrompt =
    'You are a research analyst. Return only valid JSON with no prose, no markdown, no code fences.';
  const contextClause = categoryFocus ? ` in the context of ${categoryFocus}` : '';
  const userPrompt = `List 3-5 significant milestones for "${entityName}"${contextClause}. Include key past events (launches, policy changes, deadlines, funding rounds, major announcements) and any known upcoming scheduled events or deadlines. Return as a JSON array only:
[
  {"date": "YYYY-MM-DD", "event": "brief one-sentence description", "note": "optional extra context or null"}
]
Use YYYY-MM-DD for the date (use -01 for unknown day/month). Return only the JSON array, no other text.`;

  let rawData: { choices: Array<{ message: { content: string } }> };
  try {
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
        max_tokens: 800,
      }),
    });
    if (!response.ok) {
      console.error(`[milestones] Perplexity error for ${entityName}: ${response.status}`);
      return;
    }
    rawData = await response.json();
  } catch (fetchErr) {
    console.error(`[milestones] Fetch error for ${entityName}:`, fetchErr);
    return;
  }

  const content = rawData?.choices?.[0]?.message?.content || '';
  let milestones: Array<{ date: string; event: string; note?: string | null }>;
  try {
    const cleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.error(`[milestones] Expected array for ${entityName}`);
      return;
    }
    milestones = parsed;
  } catch (parseErr) {
    console.error(`[milestones] Failed to parse response for ${entityName}:`, parseErr);
    return;
  }

  let inserted = 0;
  for (const ms of milestones) {
    if (typeof ms.date !== 'string' || typeof ms.event !== 'string') continue;
    if (!ms.date.trim() || !ms.event.trim()) continue;

    let normalizedDate = ms.date.trim();
    if (/^\d{4}$/.test(normalizedDate)) {
      normalizedDate = `${normalizedDate}-01-01`;
    } else if (/^\d{4}-\d{2}$/.test(normalizedDate)) {
      normalizedDate = `${normalizedDate}-01`;
    }

    try {
      const ins = await db.execute(sql`
        INSERT INTO topic_milestones (workspace_id, entity_id, date, event_text, source)
        VALUES (${workspaceId}, ${entityName}, ${normalizedDate}::date, ${ms.event.trim()}, 'perplexity')
        ON CONFLICT (workspace_id, entity_id, date, event_text) DO NOTHING
        RETURNING id
      `) as unknown as { rows: { id: string }[] };
      if (ins.rows.length > 0) inserted++;
    } catch (insertErr) {
      console.error(`[milestones] Error inserting milestone for ${entityName}:`, insertErr);
    }
  }

  console.log(`[milestones] ${entityName}: ${inserted}/${milestones.length} milestones upserted (source=perplexity)`);
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

export async function researchEntityDimensions(
  entityName: string,
  disambiguationContext: string,
  categoryFocus: string,
  workspaceId: string
): Promise<Array<{ dimension_name: string; items: Array<{ name: string; status: string; evidence: string }> }>> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('[dimensions-research] No PERPLEXITY_API_KEY set');
    return [];
  }

  const dimsResult = await db.execute(
    sql`SELECT * FROM competitive_dimensions WHERE workspace_id = ${workspaceId}::uuid ORDER BY display_order ASC`
  );
  const dimensions = dimsResult.rows as any[];
  if (dimensions.length === 0) {
    console.log(`[dimensions-research] No competitive dimensions found for workspace ${workspaceId}`);
    return [];
  }

  const results: Array<{ dimension_name: string; items: Array<{ name: string; status: string; evidence: string }> }> = [];

  for (const dim of dimensions) {
    const dimItems: any[] = Array.isArray(dim.items) ? dim.items : JSON.parse(dim.items || '[]');
    const dimensionName = dim.name;
    const dimensionId = dim.id;
    const resultItems: Array<{ name: string; status: string; evidence: string }> = [];

    for (const rawItem of dimItems) {
      const itemName = typeof rawItem === 'string' ? rawItem : rawItem.name;

      const perplexityPrompt = `You are a competitive intelligence researcher specialising in biometric identity verification (IDV) software and government digital identity systems.

Research whether ${entityName} has the following capability: "${itemName}" (within the dimension: "${dimensionName}").

Search for evidence in:
- Official product documentation and datasheets
- Independent lab certifications (iBeta, BixeLab, Ingenium, TÜV, BSI, NIST)
- Government tender awards and accreditations
- Press releases and announcements from the last 3 years
- Third-party reviews and analyst reports

Return ONLY a JSON object with no markdown, no preamble, no explanation:
{
  "verdict": "yes" | "partial" | "no" | "unknown",
  "confidence": "high" | "medium" | "low",
  "evidence": "1-2 sentence summary of what you found and why you reached this verdict",
  "source_url": "most authoritative URL found, or null",
  "source_date": "Month YYYY of the most relevant source, or null"
}

Verdict guide:
- "yes" = clear confirmed evidence the capability exists
- "partial" = capability exists but limited, outdated, or only partially meets the criterion
- "no" = explicitly confirmed the capability does not exist or competitor has not pursued it
- "unknown" = insufficient public evidence found to make a determination
- "confidence: high" = primary source or official certification found
- "confidence: medium" = secondary source or indirect evidence
- "confidence: low" = inference only, no direct source
`;

      let itemResult = { verdict: 'unknown', confidence: 'low', evidence: 'Could not parse research response', source_url: null as string | null, source_date: null as string | null };

      try {
        await perplexityRateLimiter.waitForSlot();

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [
              { role: 'user', content: perplexityPrompt },
            ],
            max_tokens: 300,
          }),
        });

        if (!response.ok) {
          console.error(`[dimensions-research] Perplexity error for ${entityName} / ${itemName}: ${response.status}`);
        } else {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content || '';
          try {
            const cleanedText = content.replace(/```json|```/g, '').trim();
            itemResult = JSON.parse(cleanedText);
          } catch (parseErr) {
            console.error(`[dimensions-research] Failed to parse response for ${entityName} / ${itemName}:`, parseErr);
          }
        }
      } catch (fetchErr) {
        console.error(`[dimensions-research] Fetch error for ${entityName} / ${itemName}:`, fetchErr);
      }

      const status = itemResult.verdict || 'unknown';
      const evidence = itemResult.evidence || '';

      try {
        const existing = await db.execute(sql`
          SELECT id, source, status FROM competitor_dimension_status
          WHERE workspace_id = ${workspaceId}::uuid
          AND dimension_id = ${dimensionId}::uuid
          AND entity_name = ${entityName}
          AND item_name = ${itemName}
          LIMIT 1
        `);
        const existingRow = existing.rows[0] as any;

        if (existingRow) {
          if (existingRow.source === 'manual' && ['yes', 'partial', 'no'].includes(existingRow.status)) {
            console.log(`[dimensions-research] Skipping deliberate manual override for ${entityName} / ${itemName}`);
          } else {
            await db.execute(sql`
              UPDATE competitor_dimension_status
              SET status = ${status},
                  source = 'perplexity',
                  evidence = ${evidence || null},
                  last_updated = NOW()
              WHERE id = ${existingRow.id}::uuid
            `);
          }
        } else {
          await db.execute(sql`
            INSERT INTO competitor_dimension_status
              (workspace_id, dimension_id, entity_name, item_name, status, source, evidence, last_updated)
            VALUES
              (${workspaceId}::uuid, ${dimensionId}::uuid, ${entityName},
               ${itemName}, ${status}, 'perplexity', ${evidence || null}, NOW())
          `);
        }
      } catch (err) {
        console.error(`[dimensions-research] Error upserting ${entityName} / ${itemName}:`, err);
      }

      resultItems.push({ name: itemName, status, evidence });

      await new Promise(r => setTimeout(r, 500));
    }

    results.push({ dimension_name: dimensionName, items: resultItems });
  }

  console.log(`[dimensions-research] Completed for ${entityName}: ${results.length} dimensions processed`);
  return results;
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

        let findings: FindingWithFocusArea[];
        if (topicType === "competitor") {
          findings = await searchCompetitorNews(entity.name, category.name, lookbackDays, {
            websiteUrl,
            skipHiring: isLocalBusiness,
            skipFinancial: isLocalBusiness,
            categoryFocus,
          });
        } else {
          const baseOptions = isCommodity
            ? { websiteUrl, entityType: "commodity" as const, categoryFocus }
            : isRegulation
              ? { websiteUrl, entityType: "regulation" as const, categoryFocus }
              : { websiteUrl, categoryFocus };

          const intentResult = await db.execute(sql`
            SELECT selected_focuses, custom_focus FROM entity_tracking_intent
            WHERE workspace_id = ${workspace.id}::uuid AND entity_name = ${entity.name}
            LIMIT 1
          `);
          const intentRow = intentResult.rows[0] as { selected_focuses: string[]; custom_focus: string | null } | undefined;
          const intentFocuses: string[] = intentRow
            ? [...(Array.isArray(intentRow.selected_focuses) ? intentRow.selected_focuses : []), ...(intentRow.custom_focus ? [intentRow.custom_focus] : [])]
            : [];

          if (intentFocuses.length > 0) {
            const maxFocuses = intentFocuses.slice(0, 5);
            findings = [];
            for (const focus of maxFocuses) {
              await perplexityRateLimiter.waitForSlot();
              const focusFindings = await searchTopicUpdates(`${entity.name} ${focus} 2025`, topicType, lookbackDays, baseOptions);
              const taggedFindings = focusFindings.map(f => ({ ...f, focus_area: focus }));
              findings = [...findings, ...taggedFindings];
            }
          } else {
            findings = await searchTopicUpdates(entity.name, topicType, lookbackDays, baseOptions);
          }
        }

        result.entitiesSearched++;

        const existingCaptures = await storage.getCapturesByEntitySince(
          userId,
          entity.name,
          thirtyDaysAgo
        );
        const deduplicated = deduplicateFindings(findings, existingCaptures) as FindingWithFocusArea[];

        let relevantFindings: FindingWithFocusArea[] = deduplicated;
        if (topicType === "competitor") {
          const entityLower = entity.name.toLowerCase();
          relevantFindings = deduplicated.filter((f) => {
            const contentLower = (f.summary || "").toLowerCase();
            if (!contentLower.includes(entityLower)) {
              console.log(`[ambient] Skipping irrelevant result for ${entity.name}: ${f.summary.substring(0, 60)}...`);
              return false;
            }
            return true;
          });
        }

        if (relevantFindings.length > 0) {
          const findingsWithFocus = relevantFindings.filter((f): f is FindingWithFocusArea & { focus_area: string } => !!f.focus_area);
          const findingsWithoutFocus = relevantFindings.filter((f) => !f.focus_area);

          const captureIds: number[] = [];

          if (findingsWithFocus.length > 0) {
            for (const finding of findingsWithFocus) {
              const rawContent = finding.source_url
                ? `${finding.summary}\n\nSource: ${finding.source_url}`
                : finding.summary;
              const signalTag = finding.signal_type === "hiring_signal" ? " [signal_type:hiring_signal]" : "";
              const dateTag = finding.approximate_date ? ` [news_date:${finding.approximate_date}]` : "";
              const matchReason = `Automatically discovered via Perplexity web search [${finding.signal_strength}]${signalTag}${dateTag}`;
              const insertResult = await db.execute(sql`
                INSERT INTO captures (user_id, type, content, matched_entity, matched_category, match_reason, focus_area, created_at)
                VALUES (${userId}, 'web_search', ${rawContent}, ${entity.name}, ${category.name}, ${matchReason}, ${finding.focus_area}, NOW())
                RETURNING id
              `);
              const newId = (insertResult.rows[0] as { id: number }).id;
              captureIds.push(newId);
            }
          }

          if (findingsWithoutFocus.length > 0) {
            const captureRecords = findingsToCaptures(findingsWithoutFocus, entity.name, userId, category.name);
            const created = await storage.createCaptures(captureRecords);
            captureIds.push(...created.map((c) => c.id));
          }

          result.newCapturesCreated += captureIds.length;

          await storage.flagCapturesForBrief(captureIds);

          const summaryParts = relevantFindings.map((f) => f.summary);
          const aiSummary = `Latest updates (${new Date().toLocaleDateString()}): ${summaryParts.slice(0, 3).join("; ")}`;
          await storage.updateEntityAiSummary(userId, entity.name, aiSummary);

          if (entity.alert_on_high_signal === true) {
            const highSignalFindings = relevantFindings.filter(
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
        if (topicType !== 'competitor') {
          await perplexityRateLimiter.waitForSlot();
          await extractMilestonesForEntity(entity.name, workspace.id, categoryFocus);
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

            if (jinaResult.pricing && jinaResult.pricing.length > 0) {
              const JINA_TENANT_ID = "00000000-0000-0000-0000-000000000000";
              const today = new Date().toISOString().split("T")[0];
              const existingPricing = await storage.getCompetitorPricing(JINA_TENANT_ID, entity.name);
              const existingPlanNames = new Set(existingPricing.map((p) => p.planName.toLowerCase()));
              for (const plan of jinaResult.pricing) {
                if (!existingPlanNames.has(plan.planName.toLowerCase())) {
                  await storage.createCompetitorPricing({
                    tenantId: JINA_TENANT_ID,
                    entityId: entity.name,
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

            console.log(`[jina] Enriched ${entity.name}: ${jinaResult.products.length} products, ${jinaResult.geo_presence.length} geo, ${jinaResult.customers.length} customers, ${jinaResult.pricing.length} pricing plans`);
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
