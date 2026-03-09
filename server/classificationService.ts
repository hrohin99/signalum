import Anthropic from "@anthropic-ai/sdk";

const VALID_ENTITY_TYPES = [
  "local_business", "regional_brand", "enterprise", "commodity", "regulation", "person", "project"
];

const VALID_PRICING_MODELS = [
  "per_service", "subscription_monthly", "subscription_annual", "per_transaction",
  "per_unit", "per_seat", "usage_tiered", "freemium", "commission", "custom"
];

export async function classifyEntity(
  name: string,
  description: string
): Promise<{ entity_type: string; pricing_model: string }> {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    });

    const prompt = `Classify this organisation. Return JSON only, no other text. Fields: entity_type (one of: local_business / regional_brand / enterprise / commodity / regulation / person / project), pricing_model (one of: per_service / subscription_monthly / subscription_annual / per_transaction / per_unit / per_seat / usage_tiered / freemium / commission / custom). Guidelines — local_business: clinic, salon, boutique, sole trader, single location. regional_brand: multi-location, national chain, funded startup. enterprise: public company, global brand, 500+ employees. commodity: gold, oil, interest rates, indices. regulation: GDPR, ISO standards, government policy. person: individual human. project: event, tender, initiative. For pricing — per_service: treatments, consultations, legal fees, repairs. subscription_monthly or per_seat: SaaS, software. subscription_annual or custom: enterprise software, government contracts. per_transaction: IDV verification, payments, API calls billed per use. per_unit: physical retail products. usage_tiered: cloud infrastructure, high-volume APIs. freemium: free tier plus paid upgrade. commission: marketplace, broker, revenue share. Entity name: ${name}. Description: ${description}.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return { entity_type: "local_business", pricing_model: "per_service" };
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { entity_type: "local_business", pricing_model: "per_service" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const entity_type = VALID_ENTITY_TYPES.includes(parsed.entity_type)
      ? parsed.entity_type
      : "local_business";
    const pricing_model = VALID_PRICING_MODELS.includes(parsed.pricing_model)
      ? parsed.pricing_model
      : "per_service";

    return { entity_type, pricing_model };
  } catch (error) {
    console.error("[classifyEntity] Classification failed, using defaults:", error);
    return { entity_type: "local_business", pricing_model: "per_service" };
  }
}
