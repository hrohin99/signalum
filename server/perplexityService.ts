import type { InsertCapture, Capture } from "@shared/schema";

interface PerplexityFinding {
  summary: string;
  source_url: string | null;
  approximate_date: string | null;
  signal_strength: "high" | "medium" | "low";
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
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const findings: PerplexityFinding[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/^[-*•\d.)\s]+/, "").trim();
    if (!trimmed || trimmed.length < 15) continue;

    let sourceUrl: string | null = null;
    const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/);
    if (urlMatch) {
      sourceUrl = urlMatch[0];
    } else {
      const citationMatch = trimmed.match(/\[(\d+)\]/);
      if (citationMatch) {
        const idx = parseInt(citationMatch[1], 10) - 1;
        if (idx >= 0 && idx < citations.length) {
          sourceUrl = citations[idx];
        }
      }
    }

    const signalStrength = classifySignalStrength(trimmed);

    const dateMatch = trimmed.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/i
    ) || trimmed.match(/\b\d{4}-\d{2}-\d{2}\b/);

    findings.push({
      summary: trimmed.replace(/\[(\d+)\]/g, "").trim(),
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
  lookbackDays: number
): Promise<PerplexityFinding[]> {
  const systemPrompt =
    "You are a competitive intelligence analyst. Return only factual, sourced information. Be concise and focus on commercially relevant developments.";
  const userPrompt = `Find news, product updates, pricing changes, funding announcements, leadership changes, and notable developments about ${competitorName} in the ${category} space from the last ${lookbackDays} days. Return each finding as a separate item with: a one sentence summary, the source URL if available, and the approximate date. Focus on information that would be relevant to a competitor tracking this company.`;

  const response = await callPerplexity(systemPrompt, userPrompt);
  return parseFindings(response);
}

export async function searchTopicUpdates(
  topicName: string,
  topicType: string,
  lookbackDays: number
): Promise<PerplexityFinding[]> {
  const systemPrompt =
    "You are an intelligence analyst. Return only factual, sourced information relevant to professional monitoring.";

  const promptMap: Record<string, string> = {
    regulation: `Find updates, amendments, enforcement actions, compliance deadlines, and notable developments regarding ${topicName} from the last ${lookbackDays} days.`,
    trend: `Find signals, data points, notable developments, and emerging examples related to ${topicName} from the last ${lookbackDays} days.`,
    person: `Find public statements, role changes, publications, appearances, and notable activities by ${topicName} from the last ${lookbackDays} days.`,
    technology: `Find product updates, adoption news, pricing changes, new use cases, and competitive developments related to ${topicName} from the last ${lookbackDays} days.`,
  };

  const userPrompt =
    promptMap[topicType] ||
    `Find recent news and notable developments related to ${topicName} from the last ${lookbackDays} days.`;

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

export function deduplicateFindings(
  newFindings: PerplexityFinding[],
  existingCaptures: Capture[]
): PerplexityFinding[] {
  return newFindings.filter((finding) => {
    for (const capture of existingCaptures) {
      if (wordOverlapSimilarity(finding.summary, capture.content) > 0.7) {
        return false;
      }
    }
    return true;
  });
}

export function findingsToCaptures(
  findings: PerplexityFinding[],
  entityId: string,
  tenantId: string,
  source: string
): InsertCapture[] {
  return findings.map((finding) => {
    const rawContent = finding.source_url
      ? `${finding.summary}\n\nSource: ${finding.source_url}`
      : finding.summary;

    return {
      userId: tenantId,
      type: "web_search",
      content: rawContent,
      matchedEntity: entityId,
      matchedCategory: source,
      matchReason: `Automatically discovered via Perplexity web search [${finding.signal_strength}]`,
    } satisfies InsertCapture;
  });
}
