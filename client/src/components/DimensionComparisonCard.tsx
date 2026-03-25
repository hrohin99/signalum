import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StatusOverrideModal } from "@/components/StatusOverrideModal";
import { AlertTriangle } from "lucide-react";

interface DimensionItem {
  name: string;
  our_status: string | null;
  competitor_status: string | null;
  status_id: string | null;
  source: string | null;
  evidence: string | null;
}

interface Dimension {
  id: string;
  name: string;
  priority: string;
  items: DimensionItem[];
}

interface DimensionComparisonData {
  dimensions: Dimension[];
}

interface DimensionComparisonCardProps {
  entityName: string;
  workspaceId?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  yes: { bg: "#dcfce7", text: "#16a34a", border: "#bbf7d0" },
  partial: { bg: "#fef3c7", text: "#d97706", border: "#fde68a" },
  no: { bg: "#fee2e2", text: "#dc2626", border: "#fecaca" },
  unknown: { bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb" },
  na: { bg: "#f3f4f6", text: "#9ca3af", border: "#e5e7eb" },
};

const STATUS_LABELS: Record<string, string> = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
  unknown: "Unknown",
  na: "N/A",
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#dc2626" },
  medium: { bg: "#fef3c7", text: "#d97706" },
  low: { bg: "#f0fdf4", text: "#16a34a" },
};

function StatusPill({ status, clickable, onClick }: { status: string | null; clickable?: boolean; onClick?: () => void }) {
  const resolved = status ?? "unknown";
  const colors = STATUS_COLORS[resolved] ?? STATUS_COLORS.unknown;
  return (
    <span
      onClick={clickable ? onClick : undefined}
      data-testid={`status-pill-${resolved}`}
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        cursor: clickable ? "pointer" : "default",
        transition: clickable ? "opacity 0.12s" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABELS[resolved] ?? resolved}
    </span>
  );
}

export function DimensionComparisonCard({ entityName, workspaceId }: DimensionComparisonCardProps) {
  const [overrideModal, setOverrideModal] = useState<{
    dimensionId: string;
    itemName: string;
    statusId: string | null;
    currentStatus: string | null;
  } | null>(null);

  const { data, isLoading } = useQuery<DimensionComparisonData>({
    queryKey: ["/api/competitor-dimensions", entityName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitor-dimensions/${encodeURIComponent(entityName)}`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
        <div style={{ height: 16, background: "#f3f4f6", borderRadius: 4, width: 180, marginBottom: 12 }} />
        <div style={{ height: 12, background: "#f3f4f6", borderRadius: 4, width: "100%" }} />
      </div>
    );
  }

  const dimensions = data?.dimensions ?? [];
  if (dimensions.length === 0) return null;

  return (
    <div
      data-testid="card-dimension-comparison"
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px 12px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Competitive dimensions</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["yes", "partial", "no", "unknown"] as const).map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </div>

      {/* Dimension groups */}
      <div style={{ padding: "12px 0" }}>
        {dimensions.map((dim, dimIndex) => {
          const priorityBadge = PRIORITY_BADGE[dim.priority] ?? PRIORITY_BADGE.medium;

          const hasVulnerability = dim.items.some(
            (item) =>
              (item.our_status === "no" || item.our_status === "na") &&
              item.competitor_status === "yes"
          );

          return (
            <div
              key={dim.id}
              data-testid={`dimension-group-${dim.id}`}
              style={{
                marginBottom: dimIndex < dimensions.length - 1 ? 4 : 0,
                borderBottom: dimIndex < dimensions.length - 1 ? "1px solid #f9fafb" : "none",
                paddingBottom: 12,
              }}
            >
              {/* Dimension header row */}
              <div
                style={{
                  padding: "8px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{dim.name}</span>
                {dim.priority && dim.priority !== "medium" ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 7px",
                      borderRadius: 20,
                      background: priorityBadge.bg,
                      color: priorityBadge.text,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {dim.priority}
                  </span>
                ) : null}
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "50%" }} />
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "25%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th style={{ padding: "6px 18px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Item
                      </th>
                      <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Us
                      </th>
                      <th style={{ padding: "6px 18px 6px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {entityName}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dim.items.map((item, itemIndex) => {
                      const isVulnRow =
                        (item.our_status === "no" || item.our_status === "na") &&
                        item.competitor_status === "yes";

                      return (
                        <tr
                          key={item.name}
                          data-testid={`row-item-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                          style={{
                            background: isVulnRow ? "#fff8f8" : itemIndex % 2 === 0 ? "#fff" : "#fafafa",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          <td style={{ padding: "8px 18px", fontSize: 12, color: "#374151", verticalAlign: "middle" }}>
                            {item.name}
                          </td>
                          <td style={{ padding: "8px", textAlign: "center", verticalAlign: "middle" }}>
                            <StatusPill status={item.our_status} />
                          </td>
                          <td style={{ padding: "8px 18px 8px 8px", textAlign: "center", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                              <StatusPill
                                status={item.competitor_status}
                                clickable
                                onClick={() =>
                                  setOverrideModal({
                                    dimensionId: dim.id,
                                    itemName: item.name,
                                    statusId: item.status_id,
                                    currentStatus: item.competitor_status,
                                  })
                                }
                              />
                              {item.source === "manual" && (
                                <span
                                  title="Manually set"
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#7c3aed",
                                    background: "#ede9fe",
                                    padding: "1px 5px",
                                    borderRadius: 10,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  manual
                                </span>
                              )}
                              {item.source === "perplexity" && (
                                <span
                                  title={item.evidence ?? "via Perplexity"}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#0369a1",
                                    background: "#e0f2fe",
                                    padding: "1px 5px",
                                    borderRadius: 10,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                    cursor: item.evidence ? "help" : "default",
                                  }}
                                >
                                  AI
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Vulnerability alert */}
              {hasVulnerability && (
                <div
                  style={{
                    margin: "8px 18px 4px",
                    padding: "8px 12px",
                    background: "#fff5f5",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={13} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#b91c1c", lineHeight: 1.4 }}>
                    Competitor has capabilities you lack in this dimension — potential vulnerability.
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status override modal */}
      {overrideModal && (
        <StatusOverrideModal
          open
          onClose={() => setOverrideModal(null)}
          entityName={entityName}
          dimensionId={overrideModal.dimensionId}
          itemName={overrideModal.itemName}
          statusId={overrideModal.statusId}
          currentStatus={overrideModal.currentStatus}
        />
      )}
    </div>
  );
}
