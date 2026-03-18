import type { InsertCapture, Capture } from "@shared/schema";

interface PerplexityFinding {
  summary: string;
  source_url: string | null;
  approximate_date: string | null;
  signal_strength: "high" | "medium" | "low";
  signal_type?: "hiring_signal";
}

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  citations?: string[];
}

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

async function callPerplexity(
  systemPrompt: string,
  userPrompt: string
): Promise<PerplexityResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY environment variable is not set");
  }

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ] as PerplexityMessage[],
      max_tokens: 1000,
      return_citations: true,
      search_recency_filter: "month",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Perplexity API error (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<PerplexityResponse>;
}

function parseFindings(response: PerplexityResponse): PerplexityFinding[] {
  const content = response.choices?.[0]?.message?.content;
  if (!content) return [];

  const citations = response.citations || [];

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        summary?: string;
        source_url?: string;
        approximate_date?: string;
        signal_strength?: string;
        signal_type?: string;
      }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((item) => item.summary && item.summary.length > 0)
          .map((item) => ({
            summary: item.summary!,
            source_url: item.source_url || null,
            approximate_date: item.approximate_date || null,
            signal_strength: (["high", "medium", "low"].includes(item.signal_strength || "")
              ? item.signal_strength
              : classifySignalStrength(item.summary!)) as "high" | "medium" | "low",
            ...(item.signal_type === "hiring_signal" ? { signal_type: "hiring_signal" as const } : {}),
          }));
      }
    } catch {
    }
  }

  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const findings: PerplexityFinding[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/^[-*•\d.)\s]+/, "").trim();
    if (!trimmed || trimmed.length < 10) continue;

    let sourceUrl: string | null = null;
    const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/);
    if (urlMatch) {
      sourceUrl = urlMatch[0];
    }

    const allCitationMatches = trimmed.matchAll(/\[(\d+)\]/g);
    if (!sourceUrl) {
      for (const match of allCitationMatches) {
        const idx = parseInt(match[1], 10) - 1;
        if (idx >= 0 && idx < citations.length) {
          sourceUrl = citations[idx];
          break;
        }
      }
    }

    const signalStrength = classifySignalStrength(trimmed);

    const dateMatch = trimmed.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/i
    ) || trimmed.match(/\b\d{4}-\d{2}-\d{2}\b/);

    findings.push({
      summary: trimmed.replace(/\[(\d+)\]/g, "").replace(/https?:\/\/[^\s)]+/g, "").trim(),
      source_url: sourceUrl,
      approximate_date: dateMatch ? dateMatch[0] : null,
      signal_strength: signalStrength,
    });
  }

  return findings;
}

function classifySignalStrength(text: string): "high" | "medium" | "low" {
  const lower = text.toLowerCase();
  const highSignals = [
    "funding",
    "acquisition",
    "acquired",
    "merger",
    "ipo",
    "launch",
    "released",
    "ceo",
    "leadership change",
    "pricing change",
    "regulatory",
    "enforcement",
    "deadline",
    "compliance",
    "ban",
    "approval",
    "partnership",
    "major",
    "breakthrough",
  ];
  const mediumSignals = [
    "update",
    "announced",
    "expanded",
    "hired",
    "report",
    "study",
    "trend",
    "growing",
    "increased",
    "decreased",
    "new feature",
    "integration",
  ];

  if (highSignals.some((s) => lower.includes(s))) return "high";
  if (mediumSignals.some((s) => lower.includes(s))) return "medium";
  return "low";
}

export async function searchCompetitorNews(
  competitorName: string,
  category: string,
  lookbackDays: number,
  options?: { websiteUrl?: string; skipHiring?: boolean; skipFinancial?: boolean; categoryFocus?: string }
): Promise<PerplexityFinding[]> {
  const searchName = options?.categoryFocus
    ? `${competitorName} ${options.categoryFocus}`
    : competitorName;

  const systemPrompt =
    "You are a competitive intelligence analyst. Return only factual, sourced information. Be concise and focus on commercially relevant developments. Return your findings as a JSON array with objects containing: summary (string), source_url (string or null), approximate_date (string or null), signal_strength (high/medium/low), and optionally signal_type (string, use \"hiring_signal\" for job postings or strategic hires). Return ONLY the JSON array, no other text.";

  let sitePrefix = "";
  if (options?.websiteUrl) {
    try { sitePrefix = `site:${new URL(options.websiteUrl).hostname} OR `; } catch {}
  }

  let userPrompt = `${sitePrefix}Find news, product updates, pricing changes${options?.skipFinancial ? "" : ", funding announcements"}, leadership changes, and notable developments about ${searchName} in the ${category} space from the last ${lookbackDays} days. Return each finding as a separate item with: a one sentence summary, the source URL if available, and the approximate date. Focus on information that would be relevant to a competitor tracking this company.`;

  if (!options?.skipHiring) {
    const hiringFocusHint = options?.categoryFocus ? ` Prioritise roles related to ${options.categoryFocus}.` : "";
    userPrompt += `\n\nAlso search for recent job postings or strategic hires at ${competitorName} from the last ${lookbackDays} days. Focus on leadership hires, AI/ML roles, and new market expansion roles as these signal strategic direction.${hiringFocusHint} If found, return as findings with signal_type: "hiring_signal".`;
  }

  const response = await callPerplexity(systemPrompt, userPrompt);
  return parseFindings(response);
}

export async function searchTopicUpdates(
  topicName: string,
  topicType: string,
  lookbackDays: number,
  options?: { websiteUrl?: string; entityType?: string; categoryFocus?: string }
): Promise<PerplexityFinding[]> {
  const searchName = options?.categoryFocus
    ? `${topicName} ${options.categoryFocus}`
    : topicName;

  const systemPrompt =
    "You are an intelligence analyst. Return only factual, sourced information relevant to professional monitoring. Return your findings as a JSON array with objects containing: summary (string), source_url (string or null), approximate_date (string or null), signal_strength (high/medium/low). Return ONLY the JSON array, no other text.";

  let sitePrefix = "";
  if (options?.websiteUrl) {
    try { sitePrefix = `site:${new URL(options.websiteUrl).hostname} OR `; } catch {}
  }

  const promptMap: Record<string, string> = {
    regulation: `${sitePrefix}Find updates, amendments, enforcement actions, compliance deadlines, and notable developments regarding ${searchName} from the last ${lookbackDays} days.`,
    trend: `${sitePrefix}Find signals, data points, notable developments, and emerging examples related to ${searchName} from the last ${lookbackDays} days.`,
    person: `${sitePrefix}Find public statements, role changes, publications, appearances, and notable activities by ${searchName} from the last ${lookbackDays} days.`,
    technology: `${sitePrefix}Find product updates, adoption news, pricing changes, new use cases, and competitive developments related to ${searchName} from the last ${lookbackDays} days.`,
    commodity: `${sitePrefix}Find current market prices, price movements, market news, and trading developments for ${searchName} from the last ${lookbackDays} days.`,
    regulation_entity: `${sitePrefix}Find policy updates, regulatory changes, deadlines, and enforcement actions related to ${searchName} from the last ${lookbackDays} days.`,
  };

  let effectiveType = topicType;
  if (options?.entityType === "commodity") effectiveType = "commodity";
  if (options?.entityType === "regulation") effectiveType = "regulation_entity";

  const userPrompt =
    promptMap[effectiveType] ||
    `${sitePrefix}Find recent news and notable developments related to ${searchName} from the last ${lookbackDays} days.`;

  const response = await callPerplexity(systemPrompt, userPrompt);
  return parseFindings(response);
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function wordOverlapSimilarity(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let overlap = 0;
  for (const word of setA) {
    if (setB.has(word)) overlap++;
  }

  const minSize = Math.min(setA.size, setB.size);
  return overlap / minSize;
}

function stripSourceMetadata(text: string): string {
  return text
    .replace(/\n\nSource:.*$/s, "")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .trim();
}

export function deduplicateFindings(
  newFindings: PerplexityFinding[],
  existingCaptures: Capture[]
): PerplexityFinding[] {
  const cleanedCaptures = existingCaptures.map((c) => stripSourceMetadata(c.content));

  return newFindings.filter((finding) => {
    for (const captureContent of cleanedCaptures) {
      if (wordOverlapSimilarity(finding.summary, captureContent) > 0.7) {
        return false;
      }
    }
    return true;
  });
}

export function findingsToCaptures(
  findings: PerplexityFinding[],
  entityId: string,
  userId: string,
  source: string
): InsertCapture[] {
  return findings.map((finding) => {
    const rawContent = finding.source_url
      ? `${finding.summary}\n\nSource: ${finding.source_url}`
      : finding.summary;

    const signalTag = finding.signal_type === "hiring_signal" ? " [signal_type:hiring_signal]" : "";
    const dateTag = finding.approximate_date ? ` [news_date:${finding.approximate_date}]` : "";

    return {
      userId,
      type: "web_search",
      content: rawContent,
      matchedEntity: entityId,
      matchedCategory: source,
      matchReason: `Automatically discovered via Perplexity web search [${finding.signal_strength}]${signalTag}${dateTag}`,
    } satisfies InsertCapture;
  });
}
