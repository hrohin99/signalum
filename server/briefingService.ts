import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { storage, db, pool } from "./storage";
import { captures } from "@shared/schema";
import type { ExtractedCategory } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { buildProfileContext } from "./profileContext";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface BriefingEntity {
  name: string;
  category: string;
  whatHappened: string[];
  whyItMatters: string[];
  watchFor: string;
  captureCount: number;
}

interface BriefingData {
  executiveSummary: string;
  entities: BriefingEntity[];
  flaggedCaptures: any[];
}

export async function generateBriefingForUser(userId: string): Promise<BriefingData | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentCaptures = await db
    .select()
    .from(captures)
    .where(and(eq(captures.userId, userId), gte(captures.createdAt, sevenDaysAgo)));

  if (recentCaptures.length === 0) return null;

  const filtered = recentCaptures.filter((c) => {
    const reason = (c.matchReason || "").toLowerCase();
    if (reason.includes("[medium]") || reason.includes("[high]")) return true;
    if (["text", "document", "url"].includes(c.type)) return true;
    return false;
  });

  if (filtered.length === 0) return null;

  const flaggedCaptures = recentCaptures.filter((c) =>
    (c.matchReason || "").includes("FLAGGED_FOR_BRIEF")
  );

  const grouped: Record<string, { entity: string; category: string; captures: typeof filtered }> = {};
  for (const cap of filtered) {
    const key = `${cap.matchedEntity || "Unknown"}::${cap.matchedCategory || "Uncategorized"}`;
    if (!grouped[key]) {
      grouped[key] = {
        entity: cap.matchedEntity || "Unknown",
        category: cap.matchedCategory || "Uncategorized",
        captures: [],
      };
    }
    grouped[key].captures.push(cap);
  }

  for (const key of Object.keys(grouped)) {
    const group = grouped[key];
    if (group.captures.length > 1) {
      const deduplicated: typeof filtered = [];
      for (const cap of group.captures) {
        const isDuplicate = deduplicated.some((existing) => {
          const similarity = contentSimilarity(existing.content, cap.content);
          return similarity > 0.7;
        });
        if (!isDuplicate) {
          deduplicated.push(cap);
        } else {
          const existingIdx = deduplicated.findIndex((existing) => contentSimilarity(existing.content, cap.content) > 0.7);
          if (existingIdx >= 0) {
            const existingReason = (deduplicated[existingIdx].matchReason || "").toLowerCase();
            const newReason = (cap.matchReason || "").toLowerCase();
            if (newReason.includes("[high]") && !existingReason.includes("[high]")) {
              deduplicated[existingIdx] = cap;
            }
          }
        }
      }
      group.captures = deduplicated;
    }
  }

  const workspace = await storage.getWorkspaceByUserId(userId);
  const workspaceCategories = (workspace?.categories || []) as ExtractedCategory[];
  const categoryFocusMap: Record<string, string> = {};
  for (const cat of workspaceCategories) {
    if (cat.focus) categoryFocusMap[cat.name] = cat.focus;
  }

  const groupedForPrompt = Object.values(grouped).map((g) => ({
    entity: g.entity,
    category: g.category,
    categoryFocus: categoryFocusMap[g.category] || undefined,
    captureCount: g.captures.length,
    captures: g.captures.map((c) => ({
      type: c.type,
      content: c.content?.slice(0, 200) ?? '',
      matchReason: c.matchReason,
      createdAt: c.createdAt,
    })),
  }));

  const focusSummary = Object.entries(categoryFocusMap).map(([name, focus]) => `- ${name}: Category focus: ${focus}. Only highlight developments relevant to this focus in the briefing summary.`).join("\n");
  const focusPromptSection = focusSummary ? `\n\nThe user is specifically interested in the following focus areas for these categories. Prioritise and surface intelligence relevant to each focus. Deprioritise captures that are unrelated to them:\n${focusSummary}` : "";

  const briefingWsResult = await pool.query("SELECT * FROM workspaces WHERE user_id = $1 LIMIT 1", [userId]);
  const briefingProfileCtx = buildProfileContext(briefingWsResult.rows[0] || null);
  const briefingProfilePrefix = briefingProfileCtx ? `${briefingProfileCtx}\n\n` : "";

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `${briefingProfilePrefix}You are an intelligence analyst writing a weekly briefing for a product manager at Entrust, a company in the government identity verification space.${focusPromptSection}

Do not use em dashes anywhere in your response. Use commas or plain sentences instead.

Here is this week's captured intelligence grouped by entity:
${JSON.stringify(groupedForPrompt, null, 2)}

Return a JSON object with this exact structure:
{
  "executiveSummary": "Write 2-3 short paragraphs summarising the most important developments across all tracked entities this period. Each paragraph should cover one theme or pattern. Keep each paragraph to 2-3 sentences. No bullet points in the summary.",
  "entities": [
    {
      "name": "string",
      "category": "string",
      "whatHappened": ["one sentence per bullet, 2-3 bullets, highest signal first"],
      "whyItMatters": ["one sentence per bullet, 1-2 implications for Entrust"],
      "watchFor": "one short sentence on what to monitor next",
      "captureCount": "number"
    }
  ]
}
Return only valid JSON, no markdown, no preamble.`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") return null;

  const responseText = textContent.text;
  let parsed: any;
  try {
    const clean = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error('[briefing] JSON parse failed, raw response:', responseText.slice(0, 500));
    throw new Error('Failed to parse briefing from AI response');
  }

  return {
    executiveSummary: parsed.executiveSummary,
    entities: parsed.entities,
    flaggedCaptures,
  };
}

function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export async function sendBriefingEmail(
  userId: string,
  toEmail: string,
  briefingData: BriefingData
): Promise<{ success: boolean; error?: string }> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const now = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dateRange = `${formatDate(weekAgo)} to ${formatDate(now)}`;
  const totalSignals = briefingData.entities.reduce((sum, e) => sum + e.captureCount, 0);

  const workspace = await storage.getWorkspaceByUserId(userId);
  const allEntities = workspace?.categories?.flatMap((c) => c.entities.map((e) => e.name)) || [];
  const activeEntities = new Set(briefingData.entities.map((e) => e.name));
  const quietEntities = allEntities.filter((name) => !activeEntities.has(name));

  const categoryBadge = (category: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      "Competitors": { bg: "#fee2e2", text: "#dc2626" },
      "Standards & Regulations": { bg: "#dbeafe", text: "#1d4ed8" },
      "Industry Topics": { bg: "#dcfce7", text: "#16a34a" },
      "Threat Intelligence": { bg: "#ffedd5", text: "#ea580c" },
    };
    const c = colors[category] || { bg: "#f1f5f9", text: "#475569" };
    return `<span style="display:inline-block;padding:4px 10px;font-size:11px;border-radius:999px;background:${c.bg};color:${c.text};font-weight:500;">${category}</span>`;
  };

  const sourceEmoji = (type: string) => {
    const map: Record<string, string> = {
      web_search: "🔍",
      document: "📄",
      url: "🔗",
      text: "✍️",
    };
    return map[type] || "📌";
  };

  const entityCardsHtml = briefingData.entities
    .sort((a, b) => b.captureCount - a.captureCount)
    .map((entity) => {
      const whatHappenedHtml = (entity.whatHappened || [])
        .map(
          (b) =>
            `<div style="font-size:14px;color:#374151;margin-bottom:6px;">${sourceEmoji("web_search")} ${escapeHtml(b)}</div>`
        )
        .join("");
      const whyItMattersHtml = (entity.whyItMatters || [])
        .map(
          (b) =>
            `<div style="font-size:13px;color:#4b5563;margin-bottom:4px;">• ${escapeHtml(b)}</div>`
        )
        .join("");
      const watchForHtml = entity.watchFor
        ? `<div style="font-size:13px;color:#6b7280;margin-top:8px;">Watch for: ${escapeHtml(entity.watchFor)}</div>`
        : "";
      return `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <span style="font-weight:bold;font-size:16px;color:#1e293b;">${escapeHtml(entity.name)}</span>
          ${categoryBadge(entity.category)}
        </div>
        <div style="font-weight:600;font-size:13px;color:#1e293b;margin-bottom:6px;">What happened</div>
        ${whatHappenedHtml}
        <div style="font-weight:600;font-size:13px;color:#1e293b;margin-top:10px;margin-bottom:6px;">Why it matters</div>
        ${whyItMattersHtml}
        ${watchForHtml}
        <div style="text-align:right;margin-top:8px;">
          <a href="https://watchloom.rohin.co/topic/${encodeURIComponent(entity.name)}" style="font-size:12px;color:#3b82f6;text-decoration:none;">View full profile</a>
        </div>
      </div>`;
    })
    .join("");

  let flaggedHtml = "";
  if (briefingData.flaggedCaptures.length > 0) {
    const flaggedBullets = briefingData.flaggedCaptures
      .map(
        (c) =>
          `<div style="font-size:14px;color:#92400e;margin-bottom:6px;">• ${escapeHtml(c.content.substring(0, 200))}</div>`
      )
      .join("");
    flaggedHtml = `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-weight:bold;font-size:16px;color:#92400e;margin-bottom:8px;">⚠️ Worth Your Attention</div>
      ${flaggedBullets}
    </div>`;
  }

  let quietHtml = "";
  if (quietEntities.length > 0) {
    quietHtml = `<div style="font-size:13px;color:#9ca3af;margin:12px 0;">No updates this week: ${quietEntities.map(escapeHtml).join(", ")}</div>`;
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:#1e293b;padding:20px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#ffffff;font-size:20px;font-weight:bold;">Watchloom</span>
        <span style="color:#94a3b8;font-size:13px;">${dateRange}</span>
      </div>

      <div style="padding:20px;">
        <div style="background:#f1f5f9;border-radius:8px;padding:12px;margin-bottom:20px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:6px;font-weight:600;">This Week</div>
          <div style="font-size:14px;color:#1e293b;line-height:1.5;">${briefingData.executiveSummary}</div>
        </div>

        ${entityCardsHtml}
        ${flaggedHtml}
        ${quietHtml}
      </div>

      <div style="background:#f8fafc;padding:20px;text-align:center;">
        <div style="font-size:12px;color:#6b7280;">
          <a href="https://watchloom.rohin.co/settings/briefing" style="color:#3b82f6;text-decoration:none;">Manage briefing preferences</a>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:8px;">
          Sent by Watchloom · <a href="https://watchloom.rohin.co/settings/briefing" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
        </div>
      </div>
    </div>
  </body>
  </html>`;

  try {
    await resend.emails.send({
      from: "rohin@rohin.co",
      to: toEmail,
      subject: `Your Watchloom Brief, ${totalSignals} signals this week`,
      html,
    });
    return { success: true };
  } catch (err: any) {
    console.error("[briefing] Email send failed:", err);
    return { success: false, error: err.message };
  }
}
