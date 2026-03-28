import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Trash2, Sparkles } from "lucide-react";

interface Milestone {
  id: string;
  date: string;
  event_text: string;
  source: string;
  created_at: string;
}

function MilestoneItem({
  milestone,
  isLast,
  onDelete,
  isDeleting,
}: {
  milestone: Milestone;
  isLast: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const dateObj = new Date(milestone.date);
  const now = new Date();
  const isPast = dateObj < now;
  const isAI = milestone.source === "perplexity";

  const dateStr = dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{ display: "flex", gap: 12, position: "relative" }}
      data-testid={`milestone-item-${milestone.id}`}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
          width: 20,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: isPast ? "#534AB7" : "#e2e8f0",
            border: isPast ? "none" : "2px solid #94a3b8",
            flexShrink: 0,
            marginTop: 3,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 1,
              flex: 1,
              backgroundColor: "#e2e8f0",
              marginTop: 4,
              marginBottom: 0,
              minHeight: 24,
            }}
          />
        )}
      </div>

      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{dateStr}</span>
              {isAI && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: "#f5f3ff",
                    color: "#534AB7",
                    border: "0.5px solid #ddd6fe",
                    fontWeight: 500,
                  }}
                  data-testid={`milestone-ai-badge-${milestone.id}`}
                >
                  <Sparkles size={9} />
                  AI
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#1e293b", marginTop: 2, lineHeight: 1.4 }}>
              {milestone.event_text}
            </div>
          </div>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#cbd5e1",
              padding: 2,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
            }}
            data-testid={`milestone-delete-${milestone.id}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TopicMilestones({ entityName }: { entityName: string }) {
  const [newDate, setNewDate] = useState("");
  const [newText, setNewText] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery<{ milestones: Milestone[] }>({
    queryKey: ["/api/topic-milestones", entityName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/topic-milestones/${encodeURIComponent(entityName)}`);
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: async (body: { date: string; event_text: string }) => {
      await apiRequest("POST", `/api/topic-milestones/${encodeURIComponent(entityName)}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-milestones", entityName] });
      setNewDate("");
      setNewText("");
      setFormOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/topic-milestones/by-id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-milestones", entityName] });
    },
  });

  const milestones = data?.milestones ?? [];

  const handleAdd = () => {
    if (!newDate || !newText.trim()) return;
    addMutation.mutate({ date: newDate, event_text: newText.trim() });
  };

  if (isLoading) {
    return (
      <div style={{ color: "#94a3b8", fontSize: 13 }} data-testid="milestones-loading">
        Loading milestones…
      </div>
    );
  }

  return (
    <div data-testid="topic-milestones">
      {milestones.length === 0 && !formOpen && (
        <div
          style={{
            fontSize: 13,
            color: "#94a3b8",
            textAlign: "center",
            padding: "16px 0 8px",
          }}
          data-testid="milestones-empty"
        >
          No milestones yet.
        </div>
      )}

      {milestones.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {milestones.map((m, i) => (
            <MilestoneItem
              key={m.id}
              milestone={m}
              isLast={i === milestones.length - 1}
              onDelete={() => deleteMutation.mutate(m.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {formOpen ? (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          data-testid="milestone-form"
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{
                flex: "0 0 auto",
                fontSize: 12,
                padding: "5px 8px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                color: "#1e293b",
                background: "#fff",
              }}
              data-testid="milestone-date-input"
            />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Describe the milestone…"
              style={{
                flex: 1,
                fontSize: 12,
                padding: "5px 8px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                color: "#1e293b",
                background: "#fff",
                outline: "none",
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              data-testid="milestone-text-input"
            />
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                setFormOpen(false);
                setNewDate("");
                setNewText("");
              }}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
                color: "#64748b",
              }}
              data-testid="milestone-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newDate || !newText.trim() || addMutation.isPending}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 6,
                border: "none",
                background: "#534AB7",
                color: "#fff",
                cursor: "pointer",
                opacity: !newDate || !newText.trim() ? 0.5 : 1,
              }}
              data-testid="milestone-save"
            >
              {addMutation.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setFormOpen(true)}
          style={{
            fontSize: 12,
            color: "#534AB7",
            background: "none",
            border: "1px dashed #c4b5fd",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            width: "100%",
            justifyContent: "center",
          }}
          data-testid="milestone-add-button"
        >
          <Plus size={13} /> Add milestone
        </button>
      )}
    </div>
  );
}
