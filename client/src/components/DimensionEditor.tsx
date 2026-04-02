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
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IMPORTANCE_LABELS, IMPORTANCE_COLORS, type ImportanceTier } from "@/lib/dimensionScoring";

type ItemStatus = "yes" | "partial" | "no" | "na";

interface DimensionItem {
  name: string;
  our_status: ItemStatus;
  notes: string | null;
  importance: ImportanceTier;
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
const IMPORTANCE_TIERS: ImportanceTier[] = ["critical", "high", "medium", "low"];

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

const inputSm: React.CSSProperties = {
  border: "0.5px solid #d1d5db",
  borderRadius: "6px",
  padding: "5px 9px",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const importanceSelectStyle: React.CSSProperties = {
  border: "0.5px solid #d1d5db",
  borderRadius: "4px",
  padding: "1px 4px",
  fontSize: "11px",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
  background: "#f9fafb",
  color: "#374151",
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

// ─── Edit-mode pill (shows importance select + X) ────────────────────────────

function EditPill({
  item,
  onCycle,
  onRemove,
  onImportanceChange,
}: {
  item: DimensionItem;
  onCycle: () => void;
  onRemove: () => void;
  onImportanceChange: (tier: ImportanceTier) => void;
}) {
  const tier = item.importance ?? "high";
  const ic = IMPORTANCE_COLORS[tier] ?? IMPORTANCE_COLORS.high;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "2px 6px 2px 10px",
        borderRadius: "999px",
        border: `1.5px solid ${ic.dot}`,
        color: ic.text,
        fontSize: "12px",
        background: ic.bg,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      <button onClick={onCycle} title="Cycle status" style={{ color: ic.text, fontWeight: 500 }}>
        <span>{item.name}</span>
        <span style={{ opacity: 0.7, fontSize: "11px", marginLeft: "4px" }}>· {statusLabel[item.our_status]}</span>
      </button>
      <select
        value={tier}
        onChange={(e) => onImportanceChange(e.target.value as ImportanceTier)}
        title="Importance tier"
        data-testid={`select-importance-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
        onClick={(e) => e.stopPropagation()}
        style={{ ...importanceSelectStyle, marginLeft: "4px" }}
      >
        {IMPORTANCE_TIERS.map((t) => (
          <option key={t} value={t}>{IMPORTANCE_LABELS[t]}</option>
        ))}
      </select>
      <button
        onClick={onRemove}
        title="Remove item"
        style={{ opacity: 0.6, padding: "0 1px", marginLeft: "2px" }}
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
  const [items, setItems] = useState<DimensionItem[]>(
    Array.isArray(dim.items)
      ? dim.items.map((it) => ({ ...it, importance: it.importance ?? "high" }))
      : []
  );
  const [newItemName, setNewItemName] = useState("");
  const newItemRef = useRef<HTMLInputElement>(null);

  const cycleItemStatus = (index: number) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const idx = STATUS_CYCLE.indexOf(it.our_status);
      return { ...it, our_status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
    }));
  };

  const setItemImportance = (index: number, tier: ImportanceTier) => {
    setItems((prev) => prev.map((it, i) => i === index ? { ...it, importance: tier } : it));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    if (items.some((it) => it.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewItemName("");
      return;
    }
    setItems((prev) => [...prev, { name: trimmed, our_status: "na", notes: null, importance: "high" }]);
    setNewItemName("");
    newItemRef.current?.focus();
  };

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
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Items <span className="text-gray-400 font-normal">(click pill to cycle status · select importance · × to remove)</span>
          </label>
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 italic mb-2">No items yet. Add one below.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {items.map((it, i) => (
                <EditPill
                  key={i}
                  item={it}
                  onCycle={() => cycleItemStatus(i)}
                  onRemove={() => removeItem(i)}
                  onImportanceChange={(tier) => setItemImportance(i, tier)}
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
            onClick={() => onSave({ name: name.trim() || dim.name, priority: dim.priority, items, display_order: dim.display_order })}
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

// ─── Single dimension card (sortable) ───────────────────────────────────────

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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dim.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: "0.5px solid #e5e7eb",
    borderRadius: "10px",
    background: "#fff",
    overflow: "hidden",
  };

  const items: DimensionItem[] = Array.isArray(dim.items)
    ? dim.items.map((it) => ({ ...it, importance: it.importance ?? "high" }))
    : [];

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
      toast({ title: "Error saving dimension", description: err.message, variant: "destructive" });
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
      toast({ title: "Error updating status", description: err.message, variant: "destructive" });
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
    <div ref={setNodeRef} style={style}>
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => { if (!editing) setExpanded((v) => !v); }}
        data-testid={`dimension-card-${dim.id}`}
        style={{ borderBottom: expanded ? "0.5px solid #f3f4f6" : "none" }}
      >
        <button
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          data-testid={`drag-handle-${dim.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "grab", color: "#d1d5db", padding: "0 2px", display: "flex", alignItems: "center" }}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 truncate">{dim.name}</span>
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

// ─── Add dimension form ──────────────────────────────────────────────────────

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
  const [items, setItems] = useState<DimensionItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const newItemRef = useRef<HTMLInputElement>(null);

  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    if (items.some((it) => it.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewItemName("");
      return;
    }
    setItems((prev) => [...prev, { name: trimmed, our_status: "na", notes: null, importance: "high" }]);
    setNewItemName("");
    newItemRef.current?.focus();
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), priority: "medium", items, source: "custom", display_order: 0 });
  };

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
  return (
    <div style={{ border: "1px dashed #534AB7", borderRadius: "10px", background: "#faf9ff", padding: "14px 16px" }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-sm font-medium flex-1 text-[#534AB7]">{suggestion.name}</span>
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
      toast({ title: "Error saving dimension", description: err.message, variant: "destructive" });
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

  const reorderMutation = useMutation({
    mutationFn: async (reordered: Dimension[]) => {
      await Promise.all(
        reordered.map((dim, index) =>
          apiRequest("PUT", `/api/dimensions/${dim.id}`, {
            name: dim.name,
            priority: String(index + 1),
            items: dim.items,
            display_order: index,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dimensions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error reordering dimensions", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/dimensions"] });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dimensions.findIndex((d) => d.id === active.id);
    const newIndex = dimensions.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(dimensions, oldIndex, newIndex);
    queryClient.setQueryData(["/api/dimensions"], reordered);
    reorderMutation.mutate(reordered);
  };

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
    const items: DimensionItem[] = s.items.map((it) => ({ name: it.name, our_status: "na", notes: null, importance: "high" }));
    createMutation.mutate({
      name: s.name,
      priority: s.priority,
      items,
      source: "ai",
      display_order: dimensions.length,
    });
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
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
          Track capabilities across competitive dimensions. Click a status pill to cycle Yes / Partial / No / N/A. Drag the handle to reorder. Use the pencil icon to edit a dimension.
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dimensions.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {dimensions.map((dim) => (
                  <DimensionCard
                    key={dim.id}
                    dim={dim}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
