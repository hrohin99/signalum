import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { ExtractedCategory, Brief } from "@shared/schema";

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

function flattenEntities(categories: ExtractedCategory[]) {
  return categories.flatMap(cat =>
    cat.entities.map(e => ({
      entityName: e.name,
      entityType: e.type,
      categoryName: cat.name,
      categoryDescription: cat.description,
      categoryFocus: cat.focus || undefined,
    }))
  );
}

function computeDaysUntil(dateValue: string | Date): number {
  const rawDate = dateValue instanceof Date ? dateValue.toISOString().split("T")[0] : String(dateValue).split("T")[0];
  const target = new Date(rawDate + "T00:00:00Z");
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function generateWeeklyDigest(userId: string): Promise<Brief | null> {
  const workspace = await storage.getWorkspaceByUserId(userId);
  if (!workspace) return null;

  const allCaptures = await storage.getCapturesByUserId(userId);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCaptures = allCaptures.filter(c => new Date(c.createdAt) >= sevenDaysAgo);

  if (recentCaptures.length === 0) return null;

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

  const hiringSignalCaptures = recentCaptures.filter(c => c.matchReason?.includes("[signal_type:hiring_signal]"));

  const entitySummaries = entities.map(e => {
    const entityCaptures = recentCaptures.filter(c => c.matchedEntity === e.entityName);
    if (entityCaptures.length === 0) return null;
    const highSignalCaptures = entityCaptures.filter(c =>
      c.matchReason?.includes("[high]") || c.matchReason?.includes("[signal_type:hiring_signal]")
    );
    const snippetSource = highSignalCaptures.length > 0 ? highSignalCaptures : entityCaptures;
    const snippets = snippetSource
      .slice(0, 5)
      .map((c, i) => `  [${i + 1}] (${c.type}) ${c.content.slice(0, 300)}`)
      .join("\n");
    const focusLine = e.categoryFocus ? ` [Focus: ${e.categoryFocus}]` : "";
    return `Entity: ${e.entityName} (${e.entityType}) — Category: ${e.categoryName}${focusLine}\nRecent intel (${entityCaptures.length} items, ${highSignalCaptures.length} high-signal):\n${snippets}`;
  }).filter(Boolean);

  const categoryFocusSummary = categories
    .filter(c => c.focus)
    .map(c => `- ${c.name}: ${c.focus}`)
    .join("\n");
  const focusPromptSection = categoryFocusSummary ? `\n\nCategory focus areas (prioritise signals relevant to these):\n${categoryFocusSummary}` : "";

  const briefingContext = entitySummaries.length > 0
    ? entitySummaries.join("\n\n")
    : recentCaptures.slice(0, 20).map((c, i) => `[${i + 1}] (${c.type}, entity: ${c.matchedEntity || "unmatched"}) ${c.content.slice(0, 300)}`).join("\n\n");

  const deadlineContext = upcomingDeadlines.length > 0
    ? "\n\nUpcoming deadlines (within 30 days):\n" + upcomingDeadlines.map(d => {
        const urgency = d.days_until < 0 ? "OVERDUE" : d.days_until <= 7 ? "SOON" : "UPCOMING";
        const rawDate = d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date).split("T")[0];
        const dateStr = new Date(rawDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return `- [${urgency}] ${d.label} for "${d.entityId}" — ${dateStr} (${d.days_until < 0 ? Math.abs(d.days_until) + " days overdue" : d.days_until + " days away"})`;
      }).join("\n")
    : "";

  const hiringContext = hiringSignalCaptures.length > 0
    ? "\n\nHiring signals detected this week:\n" + hiringSignalCaptures.map(c =>
        `- ${c.matchedEntity}: ${c.content.slice(0, 200)}`
      ).join("\n")
    : "";

  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a senior intelligence analyst preparing a weekly digest for a decision-maker. This covers the last 7 days. Based on the intel items and entity data below, write a narrative weekly intelligence digest.${focusPromptSection}

Structure the digest as follows:
1. **Week in Review** — A 3-4 sentence high-level overview of the most important developments this week.
2. **Key Developments** — A section for each category/entity that has notable activity. Use clear headers. For each, provide a short analytical paragraph synthesizing the captured intel. Prioritize high-signal updates.
3. **Hiring Signals** — If any hiring signals were detected, summarize what they suggest about competitors' strategic direction.
4. **Deadlines & Watch Items** — Any upcoming deadlines within 30 days and emerging patterns or risks that deserve continued attention.

Be direct, analytical, and concise. Write in a professional intelligence briefing style. Do not include any JSON or metadata — write pure narrative prose with markdown formatting. Do NOT use horizontal rules or separator lines (---) anywhere in the output.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Categories being tracked:
${categories.map(c => `- ${c.name}: ${c.description}`).join("\n")}

Intel data (last 7 days):
${briefingContext}${deadlineContext}${hiringContext}

Total captures this week: ${recentCaptures.length}
Total entities tracked: ${entities.length}`
      }
    ]
  });

  const textContent = message.content.find(block => block.type === "text");
  if (!textContent || textContent.type !== "text") return null;

  const brief = await storage.createBrief({
    userId,
    content: textContent.text.trim(),
    captureCount: recentCaptures.length,
    entityCount: entities.length,
  });

  return brief;
}
