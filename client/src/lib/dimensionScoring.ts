export type ImportanceTier = "critical" | "high" | "medium" | "low";

const TIER_WEIGHTS: Record<ImportanceTier, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0.5,
};

const STATUS_SCORES: Record<string, number> = {
  yes: 100,
  partial: 50,
  unknown: 25,
  no: 0,
  na: 0,
};

export function getItemScore(status: string | null): number {
  if (!status) return STATUS_SCORES.unknown;
  return STATUS_SCORES[status] ?? STATUS_SCORES.unknown;
}

export function getTierWeight(importance: string | null | undefined): number {
  const tier = (importance ?? "high") as ImportanceTier;
  return TIER_WEIGHTS[tier] ?? TIER_WEIGHTS.high;
}

export function calculateWeightedScore(
  items: Array<{ status: string | null; importance?: string | null }>
): number {
  if (items.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const item of items) {
    const weight = getTierWeight(item.importance);
    const score = getItemScore(item.status);
    weightedSum += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

export const IMPORTANCE_LABELS: Record<ImportanceTier, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const IMPORTANCE_SHORT: Record<ImportanceTier, string> = {
  critical: "C",
  high: "H",
  medium: "M",
  low: "L",
};

export const IMPORTANCE_COLORS: Record<ImportanceTier, { bg: string; text: string; dot: string }> = {
  critical: { bg: "#fee2e2", text: "#dc2626", dot: "#dc2626" },
  high: { bg: "#fff7ed", text: "#c2410c", dot: "#f97316" },
  medium: { bg: "#eff6ff", text: "#1d4ed8", dot: "#3b82f6" },
  low: { bg: "#f9fafb", text: "#6b7280", dot: "#9ca3af" },
};
