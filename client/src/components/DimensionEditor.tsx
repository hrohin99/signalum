import { useState, useRef } from "react";
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
  Pencil,
  ArrowUp,
  ArrowDown,
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
const PRIORITY_CYCLE = ["high", "medium", "low"];

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

const inputSm: React.CSSProperties = {
  border: "0.5px solid #d1d5db",
  borderRadius: "6px",
  padding: "5px 9px",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

// ─── View-mode pill (cycles status on click) ─────────────────────────────────

function ViewPill({ item, onCycle }: { item: DimensionItem; onCycle: () => void }) {
  const color = statusColor[item.our_status] || "#9ca3af";
  return (
    <button
      onClick={onCycle}
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

// ─── Edit-mode pill (shows X and move arrows) ────────────────────────────────

function EditPill({
  item,
  index,
  total,
  onCycle,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: DimensionItem;
  index: number;
  total: number;
  onCycle: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const color = statusColor[item.our_status] || "#9ca3af";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "2px 6px 2px 10px",
        borderRadius: "999px",
        border: `1.5px solid ${color}`,
        color,
        fontSize: "12px",
        background: `${color}14`,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      <button onClick={onCycle} title="Cycle status" style={{ color, fontWeight: 500 }}>
        <span>{item.name}</span>
        <span style={{ opacity: 0.7, fontSize: "11px", marginLeft: "4px" }}>· {statusLabel[item.our_status]}</span>
      </button>
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        title="Move up"
        style={{ opacity: index === 0 ? 0.3 : 0.6, cursor: index === 0 ? "default" : "pointer", padding: "0 2px" }}
        data-testid={`button-move-up-${item.name}`}
      >
        <ArrowUp className="w-3 h-3" />
      </button>
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        title="Move down"
        style={{ opacity: index === total - 1 ? 0.3 : 0.6, cursor: index === total - 1 ? "default" : "pointer", padding: "0 2px" }}
        data-testid={`button-move-down-${item.name}`}
      >
        <ArrowDown className="w-3 h-3" />
      </button>
      <button
        onClick={onRemove}
        title="Remove item"
        style={{ opacity: 0.6, padding: "0 1px" }}
        data-testid={`button-remove-item-${item.name}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Inline editor (shown inside an expanded card) ──────────────────────────

function DimensionInlineEditor({
  dim,
  onSave,
  onCancel,
  isSaving,
}: {
  dim: Dimension;
  onSave: (updated: { name: string; priority: string; items: DimensionItem[]; display_order: number }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(dim.name);
  const [priority, setPriority] = useState(dim.priority);
  const [items, setItems] = useState<DimensionItem[]>(Array.isArray(dim.items) ? dim.items : []);
  const [newItemName, setNewItemName] = useState("");
  const newItemRef = useRef<HTMLInputElement>(null);

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(priority);
    setPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  };

  const cycleItemStatus = (index: number) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const idx = STATUS_CYCLE.indexOf(it.our_status);
      return { ...it, our_status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
    }));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    setItems((prev) => {
      const next = [...prev];
      const swap = direction === "up" ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  };

  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    if (items.some((it) => it.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewItemName("");
      return;
    }
    setItems((prev) => [...prev, { name: trimmed, our_status: "na", notes: null }]);
    setNewItemName("");
    newItemRef.current?.focus();
  };

  const pb = priorityBadge[priority] || priorityBadge.medium;

  return (
    <div style={{ padding: "12px 16px", borderTop: "0.5px solid #f3f4f6", background: "#fafafa" }}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div style={{ flex: 1 }}>
            <label className="block text-xs font-medium text-gray-500 mb-1">Dimension name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputSm, width: "100%" }}
              data-testid="input-edit-dimension-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <button
              onClick={cyclePriority}
              title="Click to cycle priority"
              data-testid="button-cycle-priority"
              style={{
                fontSize: "11px",
                padding: "4px 12px",
                borderRadius: "999px",
                background: pb.bg,
                color: pb.text,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${pb.text}40`,
                whiteSpace: "nowrap",
              }}
            >
              {priority.toUpperCase()} ↻
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Items <span className="text-gray-400 font-normal">(click pill to cycle status · arrows to reorder · × to remove)</span>
          </label>
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 italic mb-2">No items yet. Add one below.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {items.map((it, i) => (
                <EditPill
                  key={i}
                  item={it}
                  index={i}
                  total={items.length}
                  onCycle={() => cycleItemStatus(i)}
                  onRemove={() => removeItem(i)}
                  onMoveUp={() => moveItem(i, "up")}
                  onMoveDown={() => moveItem(i, "down")}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={newItemRef}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
              placeholder="New item name…"
              style={{ ...inputSm, flex: 1 }}
              data-testid="input-add-item"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addItem}
              disabled={!newItemName.trim()}
              data-testid="button-add-item"
              style={{ borderColor: "#534AB7", color: "#534AB7" }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving} data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave({ name: name.trim() || dim.name, priority, items, display_order: dim.display_order })}
            disabled={isSaving || !name.trim()}
            style={{ backgroundColor: "#534AB7", color: "#fff" }}
            data-testid="button-save-edit"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Single dimension card ───────────────────────────────────────────────────

function DimensionCard({
  dim,
  onDelete,
}: {
  dim: Dimension;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  const pb = priorityBadge[dim.priority] || priorityBadge.medium;
  const items: DimensionItem[] = Array.isArray(dim.items) ? dim.items : [];

  const saveMutation = useMutation({
    mutationFn: async (body: { name: string; priority: string; items: DimensionItem[]; display_order: number }) => {
      const res = await apiRequest("PUT", `/api/dimensions/${dim.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dimensions"] });
      setEditing(false);
      toast({ title: "Dimension saved", className: "bg-green-50 border-green-200 text-green-800" });
    },
    onError: (err: Error) => {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    },
  });

  const cycleMutation = useMutation({
    mutationFn: async (itemIndex: number) => {
      const updated = items.map((it, i) => {
        if (i !== itemIndex) return it;
        const idx = STATUS_CYCLE.indexOf(it.our_status);
        return { ...it, our_status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete dimension "${dim.name}"? This cannot be undone.`)) {
      onDelete(dim.id);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setEditing(true);
  };

  return (
    <div style={{ border: "0.5px solid #e5e7eb", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => { if (!editing) setExpanded((v) => !v); }}
        data-testid={`dimension-card-${dim.id}`}
        style={{ borderBottom: expanded ? "0.5px solid #f3f4f6" : "none" }}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 truncate">{dim.name}</span>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "999px",
            background: pb.bg,
            color: pb.text,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {dim.priority.toUpperCase()}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "#9ca3af",
            padding: "2px 6px",
            borderRadius: "6px",
            background: "#f9fafb",
            whiteSpace: "nowrap",
          }}
        >
          {dim.source}
        </span>
        <button
          onClick={handleEditClick}
          className="text-gray-400 hover:text-[#534AB7] transition-colors ml-1"
          data-testid={`button-edit-dimension-${dim.id}`}
          title="Edit dimension"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDeleteClick}
          className="text-gray-300 hover:text-red-400 transition-colors"
          data-testid={`button-delete-dimension-${dim.id}`}
          title="Delete dimension"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && !editing && (
        <div className="px-4 py-3">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No items yet.{" "}
              <button
                onClick={() => setEditing(true)}
                style={{ color: "#534AB7", textDecoration: "underline", cursor: "pointer", fontSize: "12px" }}
              >
                Add items
              </button>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.map((it, i) => (
                <ViewPill
                  key={i}
                  item={it}
                  onCycle={() => !cycleMutation.isPending && cycleMutation.mutate(i)}
                />
              ))}
            </div>
          )}
          {cycleMutation.isPending && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </p>
          )}
        </div>
      )}

      {expanded && editing && (
        <DimensionInlineEditor
          dim={dim}
          onSave={(updated) => saveMutation.mutate(updated)}
          onCancel={() => setEditing(false)}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Add dimension form (one-by-one item entry) ──────────────────────────────

function AddDimensionForm({
  onSave,
  onCancel,
  isSaving,
}: {
  onSave: (d: Partial<Dimension>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("medium");
  const [items, setItems] = useState<DimensionItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const newItemRef = useRef<HTMLInputElement>(null);

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(priority);
    setPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  };

  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    if (items.some((it) => it.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewItemName("");
      return;
    }
    setItems((prev) => [...prev, { name: trimmed, our_status: "na", notes: null }]);
    setNewItemName("");
    newItemRef.current?.focus();
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), priority, items, source: "custom", display_order: 0 });
  };

  const pb = priorityBadge[priority] || priorityBadge.medium;

  return (
    <div style={{ border: "1px solid #534AB7", borderRadius: "10px", padding: "16px", background: "#faf9ff" }}>
      <p className="text-sm font-semibold text-[#534AB7] mb-3">New dimension</p>
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <div style={{ flex: 1 }}>
            <label className="block text-xs font-medium text-gray-500 mb-1">Dimension name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") newItemRef.current?.focus(); }}
              placeholder="e.g. Biometric capabilities"
              data-testid="input-new-dimension-name"
              style={{ ...inputSm, width: "100%" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <button
              onClick={cyclePriority}
              data-testid="button-new-dimension-cycle-priority"
              style={{
                fontSize: "11px",
                padding: "5px 12px",
                borderRadius: "999px",
                background: pb.bg,
                color: pb.text,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${pb.text}40`,
                whiteSpace: "nowrap",
              }}
            >
              {priority.toUpperCase()} ↻
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Items</label>
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {items.map((it, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    padding: "2px 8px 2px 10px",
                    borderRadius: "999px",
                    background: "#ede9fe",
                    color: "#534AB7",
                    fontWeight: 500,
                  }}
                >
                  {it.name}
                  <button
                    onClick={() => removeItem(i)}
                    style={{ opacity: 0.6 }}
                    data-testid={`button-remove-new-item-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={newItemRef}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
              placeholder="Type an item and press Enter or Add…"
              data-testid="input-new-dimension-item"
              style={{ ...inputSm, flex: 1 }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addItem}
              disabled={!newItemName.trim()}
              data-testid="button-add-new-item"
              style={{ borderColor: "#534AB7", color: "#534AB7" }}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving} data-testid="button-cancel-dimension">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving || !name.trim()}
            style={{ backgroundColor: "#534AB7", color: "#fff" }}
            data-testid="button-save-new-dimension"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Add dimension
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AI suggestion card ───────────────────────────────────────────────────────

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
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "999px",
            background: pb.bg,
            color: pb.text,
            fontWeight: 600,
          }}
        >
          {suggestion.priority.toUpperCase()}
        </span>
      </div>
      {suggestion.rationale && <p className="text-xs text-gray-500 mb-3">{suggestion.rationale}</p>}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {suggestion.items.map((it) => (
          <span
            key={it.name}
            style={{
              fontSize: "12px",
              padding: "2px 10px",
              borderRadius: "999px",
              background: "#ede9fe",
              color: "#534AB7",
              fontWeight: 500,
            }}
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          data-testid={`button-dismiss-suggestion-${suggestion.name}`}
        >
          <X className="w-3.5 h-3.5 mr-1" /> Dismiss
        </Button>
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

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
    createMutation.mutate({
      name: s.name,
      priority: s.priority,
      items,
      source: "ai",
      display_order: dimensions.length,
    });
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
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
              {isSuggesting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1" />
              )}
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
          Track capabilities across competitive dimensions. Click a status pill to cycle Yes / Partial / No / N/A. Use the pencil icon to edit a dimension.
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
                  onDismiss={() => setSuggestions((prev) => prev.filter((x) => x.name !== s.name))}
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
              isSaving={createMutation.isPending}
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
          <div className="space-y-4">
            {(["universal", "ai", "custom"] as const).map((group) => {
              const groupDims = grouped[group];
              if (groupDims.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {sourceLabels[group]}
                  </p>
                  <div className="space-y-2">
                    {groupDims.map((dim) => (
                      <DimensionCard
                        key={dim.id}
                        dim={dim}
                        onDelete={(id) => deleteMutation.mutate(id)}
                      />
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
