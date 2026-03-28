import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Capture, ExtractedEntity } from "@shared/schema";

interface DimensionItem {
  name: string;
  our_status?: string | null;
}

interface Dimension {
  id: string;
  name: string;
  items: DimensionItem[];
}

function OurStatusPill({ status }: { status?: string | null }) {
  if (!status) return null;
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    yes: { bg: "#EAF3DE", color: "#27500A", label: "We have this" },
    partial: { bg: "#FEF9C3", color: "#78350F", label: "Partial" },
    no: { bg: "#FEE2E2", color: "#991B1B", label: "We don\u2019t have this" },
    planned: { bg: "#E0EDFF", color: "#1A3F6F", label: "Planned" },
  };
  const s = styles[status] || { bg: "#f1f5f9", color: "#64748b", label: status };
  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export function TopicImpactCard({
  entity,
  captures,
}: {
  entity: ExtractedEntity;
  captures: Capture[];
}) {
  const { data: dimensionsData, isLoading } = useQuery<{ dimensions: Dimension[] }>({
    queryKey: ["/api/matrix/dimensions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/matrix/dimensions");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const allText = [
    entity.name,
    entity.description || "",
    ...captures.map((c) => c.content),
  ]
    .join(" ")
    .toLowerCase();

  const matchedItems: { dimName: string; itemName: string; ourStatus?: string | null }[] = [];

  if (dimensionsData?.dimensions) {
    for (const dim of dimensionsData.dimensions) {
      for (const item of dim.items || []) {
        if (item.name && allText.includes(item.name.toLowerCase())) {
          matchedItems.push({ dimName: dim.name, itemName: item.name, ourStatus: item.our_status });
        }
      }
    }
  }

  if (isLoading) {
    return (
      <div style={{ color: "#94a3b8", fontSize: 13 }} data-testid="topic-impact-loading">
        Loading dimension data…
      </div>
    );
  }

  if (matchedItems.length === 0) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "#94a3b8",
          padding: "12px 0",
          textAlign: "center",
          border: "1px dashed #e2e8f0",
          borderRadius: 8,
        }}
        data-testid="topic-impact-empty"
      >
        No capability matches found. Add dimension items to track impact.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }} data-testid="topic-impact-list">
      {matchedItems.map((item, i) => (
        <div
          key={`${item.dimName}-${item.itemName}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: i < matchedItems.length - 1 ? "0.5px solid #f1f5f9" : "none",
            gap: 8,
          }}
          data-testid={`impact-item-${i}`}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{item.itemName}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{item.dimName}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <OurStatusPill status={item.ourStatus} />
            <span style={{ fontSize: 11, color: "#64748b" }}>Mentioned in signals</span>
          </div>
        </div>
      ))}
    </div>
  );
}
