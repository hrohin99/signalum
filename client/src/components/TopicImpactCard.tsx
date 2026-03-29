import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertTriangle, AlertCircle, CheckCircle, Zap } from "lucide-react";

interface Insight {
  title: string;
  description: string;
  type: "risk" | "warning" | "strength";
  dimension?: string | null;
}

interface Action {
  title: string;
  description: string;
}

interface ImpactData {
  exists: boolean;
  relevance?: "high" | "medium" | "low";
  relevanceReason?: string;
  insights?: Insight[];
  actions?: Action[];
  generatedAt?: string;
}

const PURPLE = "#723988";
const PURPLE_BG = "#EEEDFE";
const PURPLE_TEXT = "#534AB7";

const relevanceConfig = {
  high: { border: "#ef4444", bg: "#fef2f2", label: "High relevance", labelColor: "#991b1b" },
  medium: { border: "#f59e0b", bg: "#fffbeb", label: "Medium relevance", labelColor: "#92400e" },
  low: { border: "#22c55e", bg: "#f0fdf4", label: "Low relevance", labelColor: "#166534" },
};

const insightConfig = {
  risk: { bg: "#fee2e2", icon: AlertCircle, iconColor: "#dc2626", label: "risk" },
  warning: { bg: "#fef3c7", icon: AlertTriangle, iconColor: "#d97706", label: "warning" },
  strength: { bg: "#dcfce7", icon: CheckCircle, iconColor: "#16a34a", label: "strength" },
};

function SectionHeader({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
      {children}
    </p>
  );
}

export function TopicImpactCard({
  entityName,
  hasIntent,
  onSetFocusClick,
}: {
  entityName: string;
  hasIntent: boolean | undefined;
  onSetFocusClick: () => void;
}) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useQuery<ImpactData>({
    queryKey: ["/api/topic-impact", entityName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/topic-impact/${encodeURIComponent(entityName)}`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      const res = await apiRequest("POST", `/api/topic-impact/${encodeURIComponent(entityName)}/generate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-impact", entityName] });
      setGenerating(false);
    },
    onError: () => setGenerating(false),
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="topic-impact-loading">
        {[60, 44, 44, 44].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 8, background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "impactPulse 1.5s ease-in-out infinite" }} />
        ))}
        <style>{`@keyframes impactPulse{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    );
  }

  if (!data?.exists) {
    if (!hasIntent) {
      return (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "14px 0", textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 8 }} data-testid="topic-impact-no-intent">
          <p style={{ margin: "0 0 8px", color: "#64748b" }}>Set your tracking focus first to generate a personalized impact analysis.</p>
          <button
            type="button"
            onClick={onSetFocusClick}
            style={{ fontSize: 12, color: PURPLE, background: "none", border: `1px solid ${PURPLE}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 500 }}
            data-testid="button-set-focus-for-impact"
          >
            Set tracking focus →
          </button>
        </div>
      );
    }

    return (
      <div style={{ fontSize: 13, color: "#94a3b8", padding: "14px 0", textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 8 }} data-testid="topic-impact-empty">
        <p style={{ margin: "0 0 8px", color: "#64748b" }}>No impact analysis yet. Generate one based on your tracking focus.</p>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generating}
          style={{ fontSize: 12, color: "#fff", background: PURPLE, border: "none", borderRadius: 6, padding: "6px 14px", cursor: generating ? "not-allowed" : "pointer", fontWeight: 500, opacity: generating ? 0.7 : 1 }}
          data-testid="button-generate-impact"
        >
          {generating ? "Generating…" : "Generate impact analysis"}
        </button>
      </div>
    );
  }

  const rel = data.relevance || "medium";
  const relConfig = relevanceConfig[rel] || relevanceConfig.medium;
  const insights = data.insights || [];
  const actions = data.actions || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="topic-impact-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Zap size={13} style={{ color: PURPLE }} />
          <span style={{ fontSize: 11, color: PURPLE_TEXT, fontWeight: 500, background: PURPLE_BG, borderRadius: 999, padding: "2px 8px" }}>AI-generated</span>
        </div>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generating}
          title="Regenerate impact analysis"
          data-testid="button-refresh-impact"
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: generating ? "not-allowed" : "pointer", padding: 0, opacity: generating ? 0.5 : 1 }}
        >
          <RefreshCw size={12} style={{ animation: generating ? "spin 1s linear infinite" : "none" }} />
          {generating ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 0, borderLeft: `3px solid ${relConfig.border}`, background: relConfig.bg, borderRadius: "0 8px 8px 0", padding: "10px 14px" }} data-testid="impact-relevance-banner">
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: relConfig.labelColor }}>{relConfig.label}</p>
          {data.relevanceReason && (
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{data.relevanceReason}</p>
          )}
        </div>
      </div>

      {insights.length > 0 && (
        <div data-testid="impact-insights-section">
          <SectionHeader>What this means for us</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {insights.map((insight, i) => {
              const cfg = insightConfig[insight.type] || insightConfig.warning;
              const IconComp = cfg.icon;
              return (
                <div
                  key={i}
                  data-testid={`impact-insight-${i}`}
                  style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < insights.length - 1 ? "0.5px solid #f1f5f9" : "none" }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <IconComp size={13} style={{ color: cfg.iconColor }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{insight.title}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{insight.description}</p>
                    {insight.dimension && (
                      <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, background: PURPLE_BG, color: PURPLE_TEXT, borderRadius: 999, padding: "2px 8px", fontWeight: 500 }}>
                        {insight.dimension}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div data-testid="impact-actions-section">
          <SectionHeader>Recommended actions</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.map((action, i) => (
              <div key={i} data-testid={`impact-action-${i}`} style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: PURPLE_BG, color: PURPLE_TEXT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, marginTop: 1 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{action.title}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{action.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
