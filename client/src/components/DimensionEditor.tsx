import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ItemStatus = "yes" | "partial" | "no" | "na";

interface DimensionItem {
  name: string;
  our_status: ItemStatus;
  notes: string | null;
}

interface Dimension {
  id: string;
  workspace_id: string;
  name: string;
  source: string;
  priority: string;
  display_order: number;
  items: DimensionItem[];
  created_at: string;
  updated_at: string;
}

interface SuggestedDimension {
  name: string;
  priority: string;
  rationale: string;
  items: { name: string }[];
}

const STATUS_CYCLE: ItemStatus[] = ["yes", "partial", "no", "na"];

const statusColor: Record<ItemStatus, string> = {
  yes: "#16a34a",
  partial: "#d97706",
  no: "#dc2626",
  na: "#9ca3af",
};

const statusLabel: Record<ItemStatus, string> = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
  na: "N/A",
};

const priorityBadge: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#dc2626" },
  medium: { bg: "#fef3c7", text: "#d97706" },
  low: { bg: "#f0fdf4", text: "#16a34a" },
};

function ItemPill({ item, onCycle }: { item: DimensionItem; onCycle: (name: string) => void }) {
  const color = statusColor[item.our_status] || "#9ca3af";
  return (
    <button
      onClick={() => onCycle(item.name)}
      title={`${item.name} — ${statusLabel[item.our_status]} (click to cycle)`}
      data-testid={`pill-item-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 10px",
        borderRadius: "999px",
        border: `1.5px solid ${color}`,
        color,
        fontSize: "12px",
        background: `${color}14`,
        cursor: "pointer",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      <span>{item.name}</span>
      <span style={{ opacity: 0.7, fontSize: "11px" }}>· {statusLabel[item.our_status]}</span>
    </button>
  );
}

function AddDimensionForm({ onSave, onCancel }: { onSave: (d: Partial<Dimension>) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("medium");
  const [itemsRaw, setItemsRaw] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    const items: DimensionItem[] = itemsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({ name: s, our_status: "na", notes: null }));
    onSave({ name: name.trim(), priority, items, source: "custom", display_order: 0 });
  };

  return (
    <div style={{ border: "0.5px solid #534AB7", borderRadius: "10px", padding: "16px", background: "#faf9ff" }}>
      <p className="text-sm font-medium text-gray-700 mb-3">New dimension</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Dimension name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Biometric capabilities"
            data-testid="input-new-dimension-name"
            style={{ border: "0.5px solid #d1d5db", borderRadius: "8px", padding: "6px 10px", fontSize: "13px", width: "100%", outline: "none" }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            data-testid="select-new-dimension-priority"
            style={{ border: "0.5px solid #d1d5db", borderRadius: "8px", padding: "6px 10px", fontSize: "13px", width: "100%", outline: "none", background: "#fff" }}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Items (one per line)</label>
          <textarea
            value={itemsRaw}
            onChange={(e) => setItemsRaw(e.target.value)}
            placeholder={"Face recognition\nLiveness detection\nIris scan"}
            data-testid="textarea-new-dimension-items"
            style={{ border: "0.5px solid #d1d5db", borderRadius: "8px", padding: "6px 10px", fontSize: "13px", width: "100%", outline: "none", resize: "vertical", minHeight: "80px" }}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-dimension">Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim()}
            style={{ backgroundColor: "#534AB7", color: "#fff" }}
            data-testid="button-save-new-dimension"
          >
            Add dimension
          </Button>
        </div>
      </div>
    </div>
  );
}

function DimensionCard({ dim, onDelete }: { dim: Dimension; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const { toast } = useToast();

  const pb = priorityBadge[dim.priority] || priorityBadge.medium;

  const cycleMutation = useMutation({
    mutationFn: async (itemName: string) => {
      const currentItems: DimensionItem[] = Array.isArray(dim.items) ? dim.items : [];
      const updated = currentItems.map((it) => {
        if (it.name !== itemName) return it;
        const idx = STATUS_CYCLE.indexOf(it.our_status);
        const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        return { ...it, our_status: next };
      });
      const res = await apiRequest("PUT", `/api/dimensions/${dim.id}`, {
        name: dim.name,
        priority: dim.priority,
        items: updated,
        display_order: dim.display_order,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dimensions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const items: DimensionItem[] = Array.isArray(dim.items) ? dim.items : [];

  return (
    <div style={{ border: "0.5px solid #e5e7eb", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`dimension-card-${dim.id}`}
        style={{ borderBottom: expanded ? "0.5px solid #f3f4f6" : "none" }}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <span className="text-sm font-medium flex-1">{dim.name}</span>
        <span
          style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: pb.bg, color: pb.text, fontWeight: 600 }}
        >
          {dim.priority.toUpperCase()}
        </span>
        <span style={{ fontSize: "11px", color: "#9ca3af", padding: "2px 6px", borderRadius: "6px", background: "#f9fafb" }}>
          {dim.source}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(dim.id); }}
          className="text-gray-300 hover:text-red-400 transition-colors ml-1"
          data-testid={`button-delete-dimension-${dim.id}`}
          title="Delete dimension"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="px-4 py-3">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No items yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.map((it) => (
                <ItemPill key={it.name} item={it} onCycle={(name) => cycleMutation.mutate(name)} />
              ))}
            </div>
          )}
          {cycleMutation.isPending && <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</p>}
        </div>
      )}
    </div>
  );
}

function SuggestedDimensionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: SuggestedDimension;
  onAccept: (s: SuggestedDimension) => void;
  onDismiss: () => void;
}) {
  const pb = priorityBadge[suggestion.priority] || priorityBadge.medium;
  return (
    <div style={{ border: "1px dashed #534AB7", borderRadius: "10px", background: "#faf9ff", padding: "14px 16px" }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-sm font-medium flex-1 text-[#534AB7]">{suggestion.name}</span>
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: pb.bg, color: pb.text, fontWeight: 600 }}>
          {suggestion.priority.toUpperCase()}
        </span>
      </div>
      {suggestion.rationale && <p className="text-xs text-gray-500 mb-3">{suggestion.rationale}</p>}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {suggestion.items.map((it) => (
          <span
            key={it.name}
            style={{ fontSize: "12px", padding: "2px 10px", borderRadius: "999px", background: "#ede9fe", color: "#534AB7", fontWeight: 500 }}
          >
            {it.name}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onAccept(suggestion)}
          style={{ backgroundColor: "#534AB7", color: "#fff" }}
          data-testid={`button-accept-suggestion-${suggestion.name}`}
        >
          <Check className="w-3.5 h-3.5 mr-1" /> Accept
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss} data-testid={`button-dismiss-suggestion-${suggestion.name}`}>
          <X className="w-3.5 h-3.5 mr-1" /> Dismiss
        </Button>
      </div>
    </div>
  );
}

export function DimensionEditor() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedDimension[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const { data: dimensions = [], isLoading } = useQuery<Dimension[]>({
    queryKey: ["/api/dimensions"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const createMutation = useMutation({
    mutationFn: async (body: Partial<Dimension>) => {
      const res = await apiRequest("POST", "/api/dimensions", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dimensions"] });
      setShowAddForm(false);
      toast({ title: "Dimension added", className: "bg-green-50 border-green-200 text-green-800" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/dimensions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dimensions"] });
      toast({ title: "Dimension deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSuggest = async () => {
    setIsSuggesting(true);
    try {
      const res = await apiRequest("POST", "/api/dimensions/suggest", {});
      const data = await res.json();
      if (Array.isArray(data)) {
        setSuggestions(data);
      } else {
        toast({ title: "Unexpected response from AI", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error getting suggestions", description: err.message, variant: "destructive" });
    } finally {
      setIsSuggesting(false);
    }
  };

  const acceptSuggestion = (s: SuggestedDimension) => {
    const items: DimensionItem[] = s.items.map((it) => ({ name: it.name, our_status: "na", notes: null }));
    createMutation.mutate({ name: s.name, priority: s.priority, items, source: "ai", display_order: dimensions.length });
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
  };

  const dismissSuggestion = (name: string) => {
    setSuggestions((prev) => prev.filter((x) => x.name !== name));
  };

  const grouped: Record<string, Dimension[]> = { universal: [], ai: [], custom: [] };
  for (const dim of dimensions) {
    const key = dim.source === "ai" ? "ai" : dim.source === "universal" ? "universal" : "custom";
    grouped[key].push(dim);
  }

  const sourceLabels: Record<string, string> = {
    universal: "Universal",
    ai: "AI-Suggested",
    custom: "Custom",
  };

  return (
    <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px" }}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold">Competitive Dimensions</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              disabled={isSuggesting}
              data-testid="button-suggest-dimensions"
              style={{ borderColor: "#534AB7", color: "#534AB7" }}
            >
              {isSuggesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              Suggest with AI
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
              data-testid="button-add-dimension"
              style={{ backgroundColor: "#534AB7", color: "#fff" }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add dimension
            </Button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Track capabilities across competitive dimensions. Click a status pill to cycle through Yes / Partial / No / N/A.
        </p>

        {suggestions.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-[#534AB7] uppercase tracking-wide mb-2">AI Suggestions</p>
            <div className="space-y-3">
              {suggestions.map((s) => (
                <SuggestedDimensionCard
                  key={s.name}
                  suggestion={s}
                  onAccept={acceptSuggestion}
                  onDismiss={() => dismissSuggestion(s.name)}
                />
              ))}
            </div>
          </div>
        )}

        {showAddForm && (
          <div className="mb-4">
            <AddDimensionForm
              onSave={(d) => createMutation.mutate(d)}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading dimensions…
          </div>
        ) : dimensions.length === 0 && !showAddForm ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No dimensions yet.</p>
            <p className="text-xs mt-1">Add one manually or use AI suggestions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(["universal", "ai", "custom"] as const).map((group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{sourceLabels[group]}</p>
                  <div className="space-y-2">
                    {items.map((dim) => (
                      <DimensionCard key={dim.id} dim={dim} onDelete={(id) => deleteMutation.mutate(id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
