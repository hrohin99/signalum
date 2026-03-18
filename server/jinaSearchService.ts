import Anthropic from "@anthropic-ai/sdk";

interface JinaCompetitorEnrichment {
  products: { name: string; description: string }[];
  geo_presence: string[];
  customers: string[];
  customer_verticals: string[];
  pricing: { planName: string; price: string; inclusions?: string; pricingModel?: string }[];
}

async function jinaSearch(query: string): Promise<string> {
  const apiKey = process.env.JINA_API_KEY;
  const headers: Record<string, string> = {
    "Accept": "text/plain",
    "X-Retain-Images": "none",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Jina search failed (${response.status}): ${url}`);
  }

  const text = await response.text();
  return text.slice(0, 12000);
}

export async function runJinaCompetitorEnrichment(
  competitorName: string,
  websiteUrl?: string
): Promise<JinaCompetitorEnrichment | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const siteHint = websiteUrl ? ` site:${websiteUrl}` : "";

  let productsRaw = "";
  let geoRaw = "";
  let customersRaw = "";
  let pricingRaw = "";

  try {
    productsRaw = await jinaSearch(`${competitorName} products solutions features platform${siteHint}`);
  } catch (err: any) {
    console.error(`[Jina] Products search failed for ${competitorName}:`, err.message);
  }

  try {
    geoRaw = await jinaSearch(`${competitorName} offices countries regions geographic presence headquarters`);
  } catch (err: any) {
    console.error(`[Jina] Geo search failed for ${competitorName}:`, err.message);
  }

  try {
    customersRaw = await jinaSearch(`${competitorName} customers case study deployment clients "powered by" testimonial`);
  } catch (err: any) {
    console.error(`[Jina] Customers search failed for ${competitorName}:`, err.message);
  }

  try {
    pricingRaw = await jinaSearch(`${competitorName} pricing plans cost price per transaction subscription fee${siteHint}`);
  } catch (err: any) {
    console.error(`[Jina] Pricing search failed for ${competitorName}:`, err.message);
  }

  if (!productsRaw && !geoRaw && !customersRaw && !pricingRaw) {
    console.log(`[Jina] All searches returned empty for ${competitorName}`);
    return null;
  }

  const anthropic = new Anthropic({ apiKey });

  const combinedText = [
    productsRaw ? `=== PRODUCTS/SOLUTIONS SEARCH ===\n${productsRaw}` : "",
    geoRaw ? `=== GEO PRESENCE SEARCH ===\n${geoRaw}` : "",
    customersRaw ? `=== CUSTOMERS/DEPLOYMENTS SEARCH ===\n${customersRaw}` : "",
    pricingRaw ? `=== PRICING SEARCH ===\n${pricingRaw}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a competitive intelligence analyst. Based on the web search results below for "${competitorName}", extract structured data. Return ONLY valid JSON with this exact structure:

{
  "products": [{ "name": "string", "description": "one sentence" }],
  "geo_presence": ["country or region strings"],
  "customers": ["named customer or company strings"],
  "customer_verticals": ["industry vertical strings e.g. Banking, Healthcare"],
  "pricing": [{ "planName": "string", "price": "string e.g. $0.50 per check", "inclusions": "optional string of what is included", "pricingModel": "per_transaction|subscription|usage_based|custom|unknown" }]
}

Rules:
- Only include information that is clearly stated in the search results
- Do not fabricate or infer beyond what is written
- products: named products, solutions, or platform modules
- geo_presence: countries, regions, or cities where they operate or have offices
- customers: specifically named companies or organisations using their product
- customer_verticals: industries or sectors their customers come from
- pricing: specific plans or tiers with named prices (e.g. "$0.50 per check", "from $299/month"); omit if only vague mentions found

Search results:
${combinedText}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as JinaCompetitorEnrichment;

    const hasData =
      (parsed.products && parsed.products.length > 0) ||
      (parsed.geo_presence && parsed.geo_presence.length > 0) ||
      (parsed.customers && parsed.customers.length > 0) ||
      (parsed.customer_verticals && parsed.customer_verticals.length > 0) ||
      (parsed.pricing && parsed.pricing.length > 0);

    if (!hasData) return null;

    return {
      products: parsed.products || [],
      geo_presence: parsed.geo_presence || [],
      customers: parsed.customers || [],
      customer_verticals: parsed.customer_verticals || [],
      pricing: parsed.pricing || [],
    };
  } catch (err: any) {
    console.error(`[Jina] Claude extraction failed for ${competitorName}:`, err.message);
    return null;
  }
}
