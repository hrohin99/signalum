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

  const tenantId = "00000000-0000-0000-0000-000000000000";
  const prodContext = await storage.getProductContext(tenantId);

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `${briefingProfilePrefix}You are an intelligence analyst writing a weekly briefing for a product manager${prodContext?.productName ? ` at ${prodContext.productName}` : ""}${prodContext?.targetCustomer ? `, focused on ${prodContext.targetCustomer}` : ""}.${focusPromptSection}

Do not use em dashes anywhere in your response. Use commas or plain sentences instead.

Here is this week's captured intelligence grouped by entity:
${JSON.stringify(groupedForPrompt, null, 2)}

Return a JSON object with this exact structure:
{
  "executiveSummary": "2-3 sentences maximum, summarising the most important developments across all tracked entities this period. No bullet points.",
  "entities": [
    {
      "name": "string",
      "category": "string",
      "whatHappened": ["one sentence per bullet, 2-3 bullets, highest signal first"],
      "whyItMatters": ["max 1 implication, one short sentence only"],
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
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');
    parsed = JSON.parse(jsonMatch[0]);
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
  briefingData: BriefingData,
  extraRecipients?: string[]
): Promise<{ success: boolean; error?: string }> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const COLOR_PALETTES = [
    { bg: "#FAECE7", border: "#D85A30", label: "#993C1D" },
    { bg: "#E6F1FB", border: "#378ADD", label: "#185FA5" },
    { bg: "#EAF3DE", border: "#639922", label: "#3B6D11" },
    { bg: "#EEEDFE", border: "#7F77DD", label: "#3C3489" },
    { bg: "#FAEEDA", border: "#EF9F27", label: "#854F0B" },
    { bg: "#FBEAF0", border: "#D4537E", label: "#72243E" },
    { bg: "#E1F5EE", border: "#1D9E75", label: "#085041" },
    { bg: "#F1EFE8", border: "#888780", label: "#5F5E5A" },
  ];

  function getCategoryColor(categoryName: string): { bg: string; border: string; label: string } {
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
      hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLOR_PALETTES.length;
    return COLOR_PALETTES[index];
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentCaptures = await db
    .select()
    .from(captures)
    .where(and(eq(captures.userId, userId), gte(captures.createdAt, sevenDaysAgo)));

  const allUpdates = recentCaptures.map((cap) => ({
    created_at: cap.createdAt,
    category: cap.matchedCategory || "General",
    content: cap.content,
    title: null as string | null,
    entity_name: cap.matchedEntity || null,
  }));

  const MAX_TOTAL = 40;
  const MAX_PER_CATEGORY = 7;

  const topUpdates = allUpdates
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, MAX_TOTAL);

  const grouped: Record<string, any[]> = {};
  for (const update of topUpdates) {
    const cat = update.category || "General";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(update);
  }

  const subject = `Your Weekly Signalum Intelligence Brief — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  const categorySections = Object.entries(grouped).map(([category, items]) => {
    const colors = getCategoryColor(category);
    const visibleItems = items.slice(0, MAX_PER_CATEGORY);
    const overflow = items.length - visibleItems.length;

    const itemRows = visibleItems.map(item => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #F1EFE8;">
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #1a1a2e; line-height: 1.5;">
          ${item.content || item.title || ""}
        </p>
        <p style="margin: 0; font-size: 11px; color: #888780;">
          ${item.entity_name ? `<strong>${item.entity_name}</strong> · ` : ""}${new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      </td>
    </tr>
  `).join("");

    const overflowRow = overflow > 0 ? `
    <tr>
      <td style="padding: 8px 0;">
        <p style="margin: 0; font-size: 12px; color: #888780;">+ ${overflow} more signals this week</p>
      </td>
    </tr>
  ` : "";

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px; border-radius: 8px; overflow: hidden; border: 1px solid ${colors.border};">
      <tr>
        <td style="background: ${colors.bg}; padding: 10px 16px;">
          <span style="font-size: 11px; font-weight: 700; color: ${colors.label}; text-transform: uppercase; letter-spacing: 0.06em;">${category}</span>
        </td>
      </tr>
      <tr>
        <td style="background: #ffffff; padding: 0 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${itemRows}
            ${overflowRow}
          </table>
        </td>
      </tr>
    </table>
  `;
  }).join("");

  let emailHtml = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background: #f8f8f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f8f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background: #1a1a2e; border-radius: 10px 10px 0 0; padding: 24px 32px;">
              <p style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff;">Signalum</p>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.6);">Your weekly intelligence brief</p>
            </td>
          </tr>
          <tr>
            <td style="background: #534AB7; padding: 12px 32px;">
              <p style="margin: 0; font-size: 13px; color: #ffffff;">
                <strong>${topUpdates.length} signals</strong> across <strong>${Object.keys(grouped).length} categories</strong> · Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; padding: 32px; border-radius: 0 0 10px 10px;">
              ${categorySections}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px; border-top: 1px solid #F1EFE8; padding-top: 16px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; color: #888780;">You're receiving this because you're a Signalum user. Log in to see the full picture.</p>
                    <p style="margin: 8px 0 0 0; font-size: 12px; color: #888780;">— The Signalum team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  emailHtml = emailHtml.replace(/https?:\/\/youtu\.be\/[^\s"'<>]*/g, '[video link removed]');
  emailHtml = emailHtml.replace(/https?:\/\/(www\.)?youtube\.com\/shorts\/[^\s"'<>]*/g, '[video link removed]');

  const allRecipients = [...new Set([toEmail, ...(extraRecipients || [])].filter(Boolean))];

  for (const recipient of allRecipients) {
    try {
      await resend.emails.send({
        from: "rohin@rohin.co",
        to: recipient,
        subject,
        html: emailHtml,
      });
    } catch (err: any) {
      console.error(`[briefing] Failed to send to ${recipient}:`, err.message);
    }
  }
  return { success: true };
}
