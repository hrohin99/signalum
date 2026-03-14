import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface SwotData {
  id?: string;
  strengths: string;
  weaknesses: string;
  opportunities: string;
  threats: string;
  ai_generated: boolean;
  updated_at: string;
}

type SwotQuadrantKey = "strengths" | "weaknesses" | "opportunities" | "threats";

const QUADRANTS: { key: SwotQuadrantKey; label: string; emoji: string; color: string; bg: string; border: string }[] = [
  { key: "strengths", label: "Strengths", emoji: "💪", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  { key: "weaknesses", label: "Weaknesses", emoji: "⚠️", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  { key: "opportunities", label: "Opportunities", emoji: "🚀", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  { key: "threats", label: "Threats", emoji: "🎯", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
];

export function SwotCard({ entityId, userRole }: { entityId: string; userRole: string }) {
  const [editingQuadrant, setEditingQuadrant] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const queryClient = useQueryClient();
  const canEdit = userRole === "admin" || userRole === "sub_admin";

  const { data: swotData, isLoading } = useQuery<SwotData | null>({
    queryKey: ["/api/entities", entityId, "swot"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/swot`);
      const data = await res.json();
      return data?.id ? data : null;
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<SwotData>) => {
      const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/swot`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "swot"] });
      setEditingQuadrant(null);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/swot/regenerate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "swot"] });
    },
  });

  const updatedAt = swotData?.updated_at ? new Date(swotData.updated_at) : null;

  return (
    <div data-testid="card-swot" style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>SWOT Analysis</span>
          {swotData?.ai_generated && (
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#EEEDFE", color: "#3C3489", border: "0.5px solid #AFA9EC", fontWeight: 500 }}>AI generated</span>
          )}
          {swotData?.ai_generated && updatedAt && (
            <span style={{ fontSize: 11, color: "#94a3b8" }} data-testid="text-swot-timestamp">
              Updated {updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at {updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            style={{ fontSize: 12, color: "#534AB7", border: "0.5px solid #AFA9EC", borderRadius: 6, padding: "3px 10px", cursor: "pointer", background: "transparent" }}
            data-testid="button-regenerate-swot"
          >
            {regenerateMutation.isPending ? "Generating..." : "Regenerate"}
          </button>
        )}
      </div>

      <div style={{ borderTop: "0.5px solid #e2e8f0", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {QUADRANTS.map((q) => {
          const rawContent = swotData?.[q.key] || "";
          const bullets = rawContent.split("\n").filter((line: string) => line.trim());
          const isEditing = editingQuadrant === q.key;

          return (
            <div
              key={q.key}
              data-testid={`swot-quadrant-${q.key}`}
              style={{
                padding: "14px 18px",
                borderBottom: "0.5px solid #e2e8f0",
                borderRight: q.key === "strengths" || q.key === "opportunities" ? "0.5px solid #e2e8f0" : "none",
                background: q.bg,
                minHeight: 120,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{q.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: q.color }}>{q.label}</span>
                </div>
                {canEdit && !isEditing && (
                  <button
                    onClick={() => { setEditingQuadrant(q.key); setEditText(rawContent); }}
                    style={{ fontSize: 11, color: "#534AB7", border: "0.5px solid #AFA9EC", borderRadius: 6, padding: "2px 8px", cursor: "pointer", background: "transparent" }}
                    data-testid={`button-edit-swot-${q.key}`}
                  >
                    Edit
                  </button>
                )}
              </div>

              {isLoading && <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Loading...</p>}

              {!isLoading && !isEditing && bullets.length === 0 && (
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, fontStyle: "italic" }} data-testid={`text-swot-empty-${q.key}`}>No data yet</p>
              )}

              {!isLoading && !isEditing && bullets.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {bullets.map((bullet: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                      <span style={{ color: q.color, flexShrink: 0 }}>•</span>
                      <span>{bullet.replace(/^[-•]\s*/, "")}</span>
                    </div>
                  ))}
                </div>
              )}

              {isEditing && (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={5}
                    style={{
                      width: "100%", fontSize: 12, fontFamily: "inherit", padding: "8px 10px",
                      border: `0.5px solid ${q.border}`, borderRadius: 6, background: "#fff",
                      color: "#1e293b", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box",
                    }}
                    data-testid={`textarea-swot-${q.key}`}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                    <button
                      onClick={() => setEditingQuadrant(null)}
                      style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #e2e8f0", borderRadius: 6, background: "transparent", color: "#64748b", cursor: "pointer" }}
                      data-testid={`button-cancel-swot-${q.key}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveMutation.mutate({ [q.key]: editText })}
                      disabled={saveMutation.isPending}
                      style={{ fontSize: 11, padding: "3px 10px", background: "#534AB7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      data-testid={`button-save-swot-${q.key}`}
                    >
                      {saveMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
