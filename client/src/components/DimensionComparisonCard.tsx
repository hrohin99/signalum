import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StatusOverrideModal } from "@/components/StatusOverrideModal";
import { AlertTriangle } from "lucide-react";
import { IMPORTANCE_SHORT, IMPORTANCE_COLORS, type ImportanceTier } from "@/lib/dimensionScoring";
import { useToast } from "@/hooks/use-toast";

interface DimensionItem {
  name: string;
  our_status: string | null;
  competitor_status: string | null;
  importance: string | null;
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

interface ResearchResult {
  dimensionId: string;
  dimensionName: string;
  itemName: string;
  importance: string;
  verdict: string;
  confidence: string;
  evidence: string;
  source_url: string | null;
  source_date: string | null;
  current_status: string;
  current_source: string | null;
}

type Decision = "accepted" | "rejected" | "pending";
type ResearchStep = "selector" | "loading" | "review" | null;

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

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "#EEEDFE", text: "#3C3489", border: "#AFA9EC" },
  medium: { bg: "#fef3c7", text: "#d97706", border: "#fde68a" },
  low: { bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb" },
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

function VerdictPill({ verdict }: { verdict: string }) {
  const colors = STATUS_COLORS[verdict] ?? STATUS_COLORS.unknown;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABELS[verdict] ?? verdict}
    </span>
  );
}

function ConfidencePill({ confidence }: { confidence: string }) {
  const colors = CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS.low;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
        textTransform: "capitalize",
      }}
    >
      {confidence}
    </span>
  );
}

export function DimensionComparisonCard({ entityName, workspaceId }: DimensionComparisonCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [overrideModal, setOverrideModal] = useState<{
    dimensionId: string;
    itemName: string;
    statusId: string | null;
    currentStatus: string | null;
  } | null>(null);

  const [researchStep, setResearchStep] = useState<ResearchStep>(null);
  const [selectedDimIds, setSelectedDimIds] = useState<string[]>([]);
  const [researchResults, setResearchResults] = useState<ResearchResult[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const cancelledRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const dimensions = data?.dimensions ?? [];

  function openSelector() {
    setSelectedDimIds([]);
    setResearchResults([]);
    setDecisions({});
    cancelledRef.current = false;
    setResearchStep("selector");
  }

  function closeResearch() {
    cancelledRef.current = true;
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setResearchStep(null);
  }

  function toggleDim(id: string) {
    setSelectedDimIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function getTotalItems(dimIds: string[]) {
    return dimensions
      .filter((d) => dimIds.includes(d.id))
      .reduce((sum, d) => sum + d.items.length, 0);
  }

  async function startResearch() {
    cancelledRef.current = false;
    const total = getTotalItems(selectedDimIds);
    setProgress({ current: 0, total });
    setResearchStep("loading");

    let current = 0;
    progressTimerRef.current = setInterval(() => {
      current = Math.min(current + 1, total - 1);
      setProgress((p) => ({ ...p, current }));
    }, 3000);

    try {
      const res = await apiRequest(
        "POST",
        `/api/competitors/${encodeURIComponent(entityName)}/research-dimensions-ondemand`,
        { dimensionIds: selectedDimIds }
      );
      const data = await res.json();

      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      if (cancelledRef.current) return;

      const results: ResearchResult[] = data.results || [];
      setResearchResults(results);

      const initialDecisions: Record<string, Decision> = {};
      for (const r of results) {
        initialDecisions[`${r.dimensionId}__${r.itemName}`] = "pending";
      }
      setDecisions(initialDecisions);
      setResearchStep("review");
    } catch (err) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (cancelledRef.current) return;
      toast({ title: "Research failed", description: "Could not complete AI research. Please try again.", variant: "destructive" });
      setResearchStep(null);
    }
  }

  function setDecision(key: string, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
  }

  function acceptAll() {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = "accepted";
      }
      return next;
    });
  }

  async function saveAccepted() {
    const accepted = researchResults.filter(
      (r) => decisions[`${r.dimensionId}__${r.itemName}`] === "accepted"
    );
    if (accepted.length === 0) return;

    setIsSaving(true);
    try {
      await apiRequest(
        "POST",
        `/api/competitors/${encodeURIComponent(entityName)}/research-dimensions-save`,
        { accepted }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-dimensions", entityName] });
      toast({ title: `${accepted.length} result${accepted.length !== 1 ? "s" : ""} saved`, description: "Dimension statuses have been updated." });
      setResearchStep(null);
    } catch (err) {
      toast({ title: "Save failed", description: "Could not save results. Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  const acceptedCount = Object.values(decisions).filter((d) => d === "accepted").length;
  const rejectedCount = Object.values(decisions).filter((d) => d === "rejected").length;
  const pendingCount = Object.values(decisions).filter((d) => d === "pending").length;

  const groupedResults = researchResults.reduce<Record<string, ResearchResult[]>>((acc, r) => {
    if (!acc[r.dimensionName]) acc[r.dimensionName] = [];
    acc[r.dimensionName].push(r);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
        <div style={{ height: 16, background: "#f3f4f6", borderRadius: 4, width: 180, marginBottom: 12 }} />
        <div style={{ height: 12, background: "#f3f4f6", borderRadius: 4, width: "100%" }} />
      </div>
    );
  }

  if (dimensions.length === 0) return null;

  return (
    <>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["yes", "partial", "no", "unknown"] as const).map((s) => (
                <StatusPill key={s} status={s} />
              ))}
            </div>
            <button
              data-testid="button-research-with-ai"
              onClick={openSelector}
              style={{
                background: "#EEEDFE",
                border: "1px solid #AFA9EC",
                color: "#3C3489",
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Research with AI
            </button>
          </div>
        </div>

        {/* Dimension groups */}
        <div style={{ padding: "12px 0" }}>
          {dimensions.map((dim, dimIndex) => {
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
                <div
                  style={{
                    padding: "8px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{dim.name}</span>
                </div>

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
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>{item.name}</span>
                                {(() => {
                                  const tier = (item.importance ?? "high") as ImportanceTier;
                                  const colors = IMPORTANCE_COLORS[tier] ?? IMPORTANCE_COLORS.high;
                                  return (
                                    <span
                                      title={tier.charAt(0).toUpperCase() + tier.slice(1)}
                                      data-testid={`importance-badge-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 16,
                                        height: 16,
                                        borderRadius: "50%",
                                        background: colors.bg,
                                        color: colors.text,
                                        fontSize: 9,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                        border: `1px solid ${colors.dot}40`,
                                      }}
                                    >
                                      {IMPORTANCE_SHORT[tier] ?? "H"}
                                    </span>
                                  );
                                })()}
                              </div>
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
                                {(item.source === "perplexity" || item.source === "ai_confirmed") && (
                                  <span
                                    title={item.evidence ?? "via AI"}
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

      {/* Research with AI Modal */}
      {researchStep !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: 660,
              maxWidth: "95vw",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            }}
          >
            {/* Step A: Dimension selector */}
            {researchStep === "selector" && (
              <>
                <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Research with AI</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>Select which dimensions to research for <strong>{entityName}</strong>.</div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dimensions.map((dim) => {
                      const selected = selectedDimIds.includes(dim.id);
                      return (
                        <div
                          key={dim.id}
                          data-testid={`dim-selector-${dim.id}`}
                          onClick={() => toggleDim(dim.id)}
                          style={{
                            border: `1px solid ${selected ? "#AFA9EC" : "#e5e7eb"}`,
                            background: selected ? "#EEEDFE" : "#fafafa",
                            borderRadius: 8,
                            padding: "10px 14px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            transition: "all 0.12s",
                          }}
                        >
                          <div
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: `2px solid ${selected ? "#3C3489" : "#d1d5db"}`,
                              background: selected ? "#3C3489" : "#fff",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {selected && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{dim.name}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{dim.items.length} item{dim.items.length !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ padding: "12px 24px", borderTop: "1px solid #f3f4f6" }}>
                  {selectedDimIds.length > 0 && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                      ~{getTotalItems(selectedDimIds)} item{getTotalItems(selectedDimIds) !== 1 ? "s" : ""} · est. {Math.ceil(getTotalItems(selectedDimIds) * 3)} sec
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button
                      data-testid="button-cancel-selector"
                      onClick={closeResearch}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        color: "#374151",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      data-testid="button-start-research"
                      onClick={startResearch}
                      disabled={selectedDimIds.length === 0}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid #AFA9EC",
                        background: selectedDimIds.length === 0 ? "#f3f4f6" : "#EEEDFE",
                        color: selectedDimIds.length === 0 ? "#9ca3af" : "#3C3489",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: selectedDimIds.length === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      Start research
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step B: Loading */}
            {researchStep === "loading" && (
              <>
                <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Researching {entityName}…</div>
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 20 }}>
                  <div style={{ fontSize: 14, color: "#374151", fontWeight: 500 }}>
                    Researching item {Math.min(progress.current + 1, progress.total)} of {progress.total}…
                  </div>
                  <div style={{ width: "100%", maxWidth: 360, height: 6, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        background: "#3C3489",
                        borderRadius: 999,
                        width: `${progress.total > 0 ? Math.round(((progress.current + 1) / progress.total) * 100) : 0}%`,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>This may take a minute. Please keep this window open.</div>
                </div>

                <div style={{ padding: "12px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    data-testid="button-cancel-loading"
                    onClick={closeResearch}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      color: "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Step C: Review */}
            {researchStep === "review" && (
              <>
                <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Review AI research results</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>{acceptedCount} accepted</span>
                      {" · "}
                      <span style={{ color: "#dc2626", fontWeight: 600 }}>{rejectedCount} rejected</span>
                      {" · "}
                      <span style={{ color: "#6b7280" }}>{pendingCount} pending</span>
                    </div>
                  </div>
                  <button
                    data-testid="button-accept-all"
                    onClick={acceptAll}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid #AFA9EC",
                      background: "#EEEDFE",
                      color: "#3C3489",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Accept all
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
                  {Object.entries(groupedResults).map(([dimName, items]) => (
                    <div key={dimName} style={{ marginBottom: 8 }}>
                      <div style={{ padding: "6px 24px", fontSize: 12, fontWeight: 700, color: "#374151", background: "#fafafa", borderBottom: "1px solid #f3f4f6" }}>
                        {dimName}
                      </div>
                      {items.map((r) => {
                        const key = `${r.dimensionId}__${r.itemName}`;
                        const decision = decisions[key] ?? "pending";
                        const rowBg =
                          decision === "accepted" ? "#EAF3DE" :
                          decision === "rejected" ? "rgba(252,235,235,0.6)" :
                          "#fff";

                        return (
                          <div
                            key={key}
                            data-testid={`result-row-${r.itemName.toLowerCase().replace(/\s+/g, "-")}`}
                            style={{
                              padding: "12px 24px",
                              background: rowBg,
                              borderBottom: "1px solid #f3f4f6",
                              transition: "background 0.15s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{r.itemName}</span>
                                  {(() => {
                                    const tier = (r.importance ?? "high") as ImportanceTier;
                                    const colors = IMPORTANCE_COLORS[tier] ?? IMPORTANCE_COLORS.high;
                                    return (
                                      <span
                                        title={tier.charAt(0).toUpperCase() + tier.slice(1)}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          width: 16,
                                          height: 16,
                                          borderRadius: "50%",
                                          background: colors.bg,
                                          color: colors.text,
                                          fontSize: 9,
                                          fontWeight: 700,
                                          flexShrink: 0,
                                          border: `1px solid ${colors.dot}40`,
                                        }}
                                      >
                                        {IMPORTANCE_SHORT[tier] ?? "H"}
                                      </span>
                                    );
                                  })()}
                                  <VerdictPill verdict={r.verdict} />
                                  <ConfidencePill confidence={r.confidence} />
                                </div>

                                {r.evidence && (
                                  <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, marginBottom: 4 }}>{r.evidence}</div>
                                )}

                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  {r.source_url && (
                                    <a
                                      href={r.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ fontSize: 11, color: "#3C3489", textDecoration: "underline", wordBreak: "break-all" }}
                                    >
                                      {r.source_url.length > 60 ? r.source_url.slice(0, 60) + "…" : r.source_url}
                                    </a>
                                  )}
                                  {r.source_date && (
                                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{r.source_date}</span>
                                  )}
                                </div>

                                <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
                                  Current: <strong style={{ color: "#374151" }}>{r.current_status}</strong>
                                  {r.current_source && <span style={{ marginLeft: 4 }}>({r.current_source})</span>}
                                  {" → "}
                                  Proposed: <strong style={{ color: "#374151" }}>{r.verdict}</strong>
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                {decision === "pending" ? (
                                  <>
                                    <button
                                      data-testid={`button-accept-${r.itemName.toLowerCase().replace(/\s+/g, "-")}`}
                                      onClick={() => setDecision(key, "accepted")}
                                      title="Accept"
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        border: "1px solid #bbf7d0",
                                        background: "#dcfce7",
                                        color: "#16a34a",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 14,
                                        fontWeight: 700,
                                      }}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      data-testid={`button-reject-${r.itemName.toLowerCase().replace(/\s+/g, "-")}`}
                                      onClick={() => setDecision(key, "rejected")}
                                      title="Reject"
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        border: "1px solid #fecaca",
                                        background: "#fee2e2",
                                        color: "#dc2626",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 14,
                                        fontWeight: 700,
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </>
                                ) : decision === "accepted" ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Accepted</span>
                                    <button
                                      onClick={() => setDecision(key, "pending")}
                                      style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 11, padding: "0 2px" }}
                                      title="Undo"
                                    >
                                      undo
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>✕ Rejected</span>
                                    <button
                                      onClick={() => setDecision(key, "pending")}
                                      style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 11, padding: "0 2px" }}
                                      title="Undo"
                                    >
                                      undo
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div style={{ padding: "12px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    data-testid="button-cancel-review"
                    onClick={closeResearch}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      color: "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="button-save-accepted"
                    onClick={saveAccepted}
                    disabled={acceptedCount === 0 || isSaving}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${acceptedCount === 0 ? "#e5e7eb" : "#AFA9EC"}`,
                      background: acceptedCount === 0 ? "#f3f4f6" : "#EEEDFE",
                      color: acceptedCount === 0 ? "#9ca3af" : "#3C3489",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: acceptedCount === 0 || isSaving ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSaving ? "Saving…" : `Save ${acceptedCount} accepted result${acceptedCount !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
