import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  Plus,
  Info,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  Loader2,
  BarChart3,
  FileText,
  Activity,
  Layers,
  X,
  Check,
} from "lucide-react";

interface MarketSignal {
  id: string;
  workspace_id: string;
  name: string;
  source_type: string;
  org: string | null;
  signal_date: string | null;
  status: string;
  deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DimensionLink {
  id?: string;
  dimension_id: string;
  dimension_name: string;
  item_name: string;
}

interface Requirement {
  id: string;
  signal_id: string;
  workspace_id: string;
  requirement_text: string;
  source_ref: string | null;
  dimension_links: DimensionLink[] | null;
  created_at: string;
  updated_at: string;
}

interface HeatmapRow {
  dimension_name: string;
  item_name: string;
  signal_count: number;
  req_count: number;
}

interface Dimension {
  id: string;
  name: string;
  items: { name: string; our_status?: string }[];
}

const SOURCE_TYPES = [
  { value: "customer_call", label: "Customer Call" },
  { value: "rfi", label: "RFI" },
  { value: "partner_ask", label: "Partner Ask" },
  { value: "sales_conversation", label: "Sales Conversation" },
  { value: "other", label: "Other" },
];

function getSourceLabel(type: string): string {
  return SOURCE_TYPES.find((s) => s.value === type)?.label ?? type;
}

function getStatusColor(status: string): string {
  if (status === "active") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (status === "closed") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
}

function getHeatmapColor(count: number, max: number): string {
  if (max === 0 || count === 0) return "bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-600";
  const ratio = count / max;
  if (ratio >= 0.8) return "bg-red-500 text-white dark:bg-red-600";
  if (ratio >= 0.6) return "bg-orange-400 text-white dark:bg-orange-500";
  if (ratio >= 0.4) return "bg-amber-300 text-amber-900 dark:bg-amber-500 dark:text-white";
  if (ratio >= 0.2) return "bg-yellow-200 text-yellow-900 dark:bg-yellow-600 dark:text-white";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ===== Signal Modal =====
function SignalModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: MarketSignal | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [sourceType, setSourceType] = useState(initial?.source_type ?? "customer_call");
  const [org, setOrg] = useState(initial?.org ?? "");
  const [signalDate, setSignalDate] = useState(initial?.signal_date ? initial.signal_date.split("T")[0] : "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [deadline, setDeadline] = useState(initial?.deadline ? initial.deadline.split("T")[0] : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        source_type: sourceType,
        org: org || null,
        signal_date: signalDate || null,
        status,
        deadline: deadline || null,
        notes: notes || null,
      };
      if (isEdit && initial) {
        const res = await apiRequest("PUT", `/api/market-signals/${initial.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/market-signals", body);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/metrics"] });
      toast({ title: isEdit ? "Signal updated" : "Signal created" });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = async () => {
    if (!name.trim()) return;
    await mutation.mutateAsync();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Signal" : "Add Signal"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="signal-name">Name *</Label>
            <Input
              id="signal-name"
              data-testid="input-signal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ACME Corp enterprise evaluation"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="signal-source">Source Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger id="signal-source" data-testid="select-signal-source" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="signal-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="signal-status" data-testid="select-signal-status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="signal-org">Organisation</Label>
            <Input
              id="signal-org"
              data-testid="input-signal-org"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="Company or contact"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="signal-date">Signal Date</Label>
              <Input
                id="signal-date"
                data-testid="input-signal-date"
                type="date"
                value={signalDate}
                onChange={(e) => setSignalDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="signal-deadline">Deadline</Label>
              <Input
                id="signal-deadline"
                data-testid="input-signal-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="signal-notes">Notes</Label>
            <Textarea
              id="signal-notes"
              data-testid="textarea-signal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context..."
              className="mt-1 h-20 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-signal">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || mutation.isPending}
            data-testid="button-save-signal"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Create signal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Requirement Modal =====
function RequirementModal({
  open,
  onClose,
  signalId,
  initial,
  dimensions,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  signalId: string;
  initial?: Requirement | null;
  dimensions: Dimension[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial;

  const [reqText, setReqText] = useState(initial?.requirement_text ?? "");
  const [sourceRef, setSourceRef] = useState(initial?.source_ref ?? "");
  const [selectedLinks, setSelectedLinks] = useState<DimensionLink[]>(
    initial?.dimension_links ?? []
  );
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());

  function isSelected(dimId: string, dimName: string, itemName: string): boolean {
    return selectedLinks.some(
      (l) => l.dimension_id === dimId && l.dimension_name === dimName && l.item_name === itemName
    );
  }

  function toggleLink(dim: Dimension, itemName: string) {
    const existing = selectedLinks.find(
      (l) => l.dimension_id === dim.id && l.dimension_name === dim.name && l.item_name === itemName
    );
    if (existing) {
      setSelectedLinks(selectedLinks.filter((l) => l !== existing));
    } else {
      setSelectedLinks([...selectedLinks, { dimension_id: dim.id, dimension_name: dim.name, item_name: itemName }]);
    }
  }

  function toggleDimExpanded(dimId: string) {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dimId)) next.delete(dimId);
      else next.add(dimId);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        requirement_text: reqText,
        source_ref: sourceRef || null,
        dimension_links: selectedLinks.map((l) => ({
          dimension_id: l.dimension_id,
          dimension_name: l.dimension_name,
          item_name: l.item_name,
        })),
      };
      if (isEdit && initial) {
        const res = await apiRequest("PUT", `/api/market-signals/${signalId}/requirements/${initial.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/market-signals/${signalId}/requirements`, body);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/metrics"] });
      toast({ title: isEdit ? "Requirement updated" : "Requirement added" });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = async () => {
    if (!reqText.trim()) return;
    await mutation.mutateAsync();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Requirement" : "Add Requirement"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="req-text">Requirement *</Label>
            <Textarea
              id="req-text"
              data-testid="textarea-req-text"
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              placeholder="Describe the capability or feature requirement..."
              className="mt-1 h-24 resize-none"
            />
          </div>
          <div>
            <Label htmlFor="req-source">Source Reference</Label>
            <Input
              id="req-source"
              data-testid="input-req-source"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder="e.g. Call transcript p.3, Email 2024-03-15"
              className="mt-1"
            />
          </div>

          {dimensions.length > 0 && (
            <div>
              <Label>Link to Dimension Items</Label>
              <div className="mt-2 border rounded-lg divide-y overflow-hidden">
                {dimensions.map((dim) => {
                  const items: { name: string }[] = Array.isArray(dim.items)
                    ? dim.items
                    : [];
                  const isOpen = expandedDims.has(dim.id);
                  const selectedCount = selectedLinks.filter((l) => l.dimension_id === dim.id).length;

                  return (
                    <div key={dim.id}>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-sm font-medium text-left"
                        onClick={() => toggleDimExpanded(dim.id)}
                        data-testid={`accordion-dim-${dim.id}`}
                      >
                        <span className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          {dim.name}
                        </span>
                        {selectedCount > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                            {selectedCount} selected
                          </span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-2 space-y-1 bg-slate-50/50 dark:bg-slate-900/30">
                          {items.map((item) => {
                            const sel = isSelected(dim.id, dim.name, item.name);
                            return (
                              <button
                                key={item.name}
                                type="button"
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-white dark:hover:bg-slate-800 transition-colors ${sel ? "bg-white dark:bg-slate-800" : ""}`}
                                onClick={() => toggleLink(dim, item.name)}
                                data-testid={`checkbox-dim-item-${dim.id}-${item.name}`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-blue-600 border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>
                                  {sel && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className={sel ? "text-foreground font-medium" : "text-muted-foreground"}>
                                  {item.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedLinks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedLinks.map((l, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full"
                      data-testid={`tag-selected-link-${i}`}
                    >
                      {l.dimension_name} → {l.item_name}
                      <button
                        type="button"
                        onClick={() => setSelectedLinks(selectedLinks.filter((_, j) => j !== i))}
                        className="ml-0.5 hover:text-blue-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-req">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!reqText.trim() || mutation.isPending}
            data-testid="button-save-req"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Add requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Signal Row with inline requirements =====
function SignalRow({
  signal,
  dimensions,
  onEdit,
  onDelete,
}: {
  signal: MarketSignal;
  dimensions: Dimension[];
  onEdit: (s: MarketSignal) => void;
  onDelete: (s: MarketSignal) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [addReqOpen, setAddReqOpen] = useState(false);
  const [editReq, setEditReq] = useState<Requirement | null>(null);

  const { data: reqData, isLoading: reqLoading } = useQuery<{ requirements: Requirement[] }>({
    queryKey: ["/api/market-signals", signal.id, "requirements"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/market-signals/${signal.id}/requirements`);
      return res.json();
    },
    enabled: expanded,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const deleteReqMutation = useMutation({
    mutationFn: async (reqId: string) => {
      const res = await apiRequest("DELETE", `/api/market-signals/${signal.id}/requirements/${reqId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals", signal.id, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/metrics"] });
      toast({ title: "Requirement deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const requirements = reqData?.requirements ?? [];

  return (
    <div className="border rounded-lg overflow-hidden dark:border-slate-700" data-testid={`signal-row-${signal.id}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" data-testid={`text-signal-name-${signal.id}`}>{signal.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(signal.status)}`} data-testid={`badge-signal-status-${signal.id}`}>
              {signal.status}
            </span>
            <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {getSourceLabel(signal.source_type)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {signal.org && <span data-testid={`text-signal-org-${signal.id}`}>{signal.org}</span>}
            {signal.signal_date && <span>{formatDate(signal.signal_date)}</span>}
            {signal.deadline && (
              <span className="text-amber-600 dark:text-amber-400">Deadline: {formatDate(signal.deadline)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onEdit(signal)}
            data-testid={`button-edit-signal-${signal.id}`}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(signal)}
            data-testid={`button-delete-signal-${signal.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t dark:border-slate-700 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/30">
          {signal.notes && (
            <p className="text-sm text-muted-foreground mb-3 italic" data-testid={`text-signal-notes-${signal.id}`}>
              {signal.notes}
            </p>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Requirements ({reqLoading ? "…" : requirements.length})
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setAddReqOpen(true)}
              data-testid={`button-add-req-${signal.id}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Requirement
            </Button>
          </div>

          {reqLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading requirements…
            </div>
          )}

          {!reqLoading && requirements.length === 0 && (
            <p className="text-sm text-muted-foreground italic py-2">No requirements yet. Add the first one.</p>
          )}

          {!reqLoading && requirements.length > 0 && (
            <div className="space-y-2">
              {requirements.map((req) => (
                <div
                  key={req.id}
                  className="flex items-start gap-2 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-3"
                  data-testid={`req-row-${req.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" data-testid={`text-req-${req.id}`}>{req.requirement_text}</p>
                    {req.source_ref && (
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-req-source-${req.id}`}>
                        Source: {req.source_ref}
                      </p>
                    )}
                    {req.dimension_links && req.dimension_links.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {req.dimension_links.map((l, i) => (
                          <span
                            key={i}
                            className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full"
                            data-testid={`tag-dim-link-${req.id}-${i}`}
                          >
                            {l.dimension_name} → {l.item_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setEditReq(req)}
                      data-testid={`button-edit-req-${req.id}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => deleteReqMutation.mutate(req.id)}
                      disabled={deleteReqMutation.isPending}
                      data-testid={`button-delete-req-${req.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {addReqOpen && (
            <RequirementModal
              open={addReqOpen}
              onClose={() => setAddReqOpen(false)}
              signalId={signal.id}
              dimensions={dimensions}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/market-signals", signal.id, "requirements"] });
              }}
            />
          )}

          {editReq && (
            <RequirementModal
              open={!!editReq}
              onClose={() => setEditReq(null)}
              signalId={signal.id}
              initial={editReq}
              dimensions={dimensions}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/market-signals", signal.id, "requirements"] });
                setEditReq(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ===== Heatmap =====
function HeatmapSection({ statusFilter }: { statusFilter: string }) {
  const url = statusFilter && statusFilter !== "all"
    ? `/api/market-signals/heatmap?status=${statusFilter}`
    : "/api/market-signals/heatmap";

  const { data: heatmapData, isLoading } = useQuery<{ heatmap: HeatmapRow[] }>({
    queryKey: ["/api/market-signals/heatmap", statusFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", url);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const rows = heatmapData?.heatmap ?? [];

  const dimensionGroups = rows.reduce<Record<string, HeatmapRow[]>>((acc, row) => {
    if (!acc[row.dimension_name]) acc[row.dimension_name] = [];
    acc[row.dimension_name].push(row);
    return acc;
  }, {});

  const maxCount = rows.reduce((m, r) => Math.max(m, r.signal_count), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading heatmap…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-heatmap-empty">
        No dimension links found. Add requirements and link them to dimension items to see the heatmap.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="heatmap-content">
      {Object.entries(dimensionGroups).map(([dimName, dimRows]) => (
        <div key={dimName}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{dimName}</p>
          <div className="flex flex-wrap gap-2">
            {dimRows.map((row) => (
              <div
                key={`${row.dimension_name}-${row.item_name}`}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${getHeatmapColor(row.signal_count, maxCount)}`}
                title={`${row.signal_count} signal${row.signal_count !== 1 ? "s" : ""}, ${row.req_count} requirement${row.req_count !== 1 ? "s" : ""}`}
                data-testid={`heatmap-cell-${dimName}-${row.item_name}`}
              >
                <div className="font-semibold">{row.item_name}</div>
                <div className="opacity-80 mt-0.5">{row.signal_count} signal{row.signal_count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <span className="text-xs text-muted-foreground">Demand intensity:</span>
        {(["Low", "Medium", "High", "Very High"] as const).map((label, i) => {
          const colors = ["bg-blue-100 text-blue-800", "bg-yellow-200 text-yellow-900", "bg-orange-400 text-white", "bg-red-500 text-white"];
          return (
            <span key={label} className={`text-xs px-2 py-0.5 rounded ${colors[i]}`}>{label}</span>
          );
        })}
      </div>
    </div>
  );
}

// ===== Main Page =====
export default function MarketSignalsPage() {
  const { toast } = useToast();
  const [signalModalOpen, setSignalModalOpen] = useState(false);
  const [editingSignal, setEditingSignal] = useState<MarketSignal | null>(null);
  const [deletingSignal, setDeletingSignal] = useState<MarketSignal | null>(null);
  const [heatmapOpen, setHeatmapOpen] = useState(true);
  const [signalsOpen, setSignalsOpen] = useState(true);
  const [heatmapFilter, setHeatmapFilter] = useState("all");
  const [signalTypeFilter, setSignalTypeFilter] = useState("all");
  const [signalStatusFilter, setSignalStatusFilter] = useState("all");

  const { data: signalsData, isLoading: signalsLoading } = useQuery<{ signals: MarketSignal[] }>({
    queryKey: ["/api/market-signals"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const { data: dimensionsRaw = [] } = useQuery<Dimension[]>({
    queryKey: ["/api/dimensions"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const dimensions: Dimension[] = dimensionsRaw.map((d: Dimension) => ({
    ...d,
    items: typeof d.items === "string" ? JSON.parse(d.items as unknown as string) : d.items ?? [],
  }));

  const { data: heatmapMetrics } = useQuery<{ heatmap: HeatmapRow[] }>({
    queryKey: ["/api/market-signals/heatmap", "all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/market-signals/heatmap");
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const { data: metricsData } = useQuery<{ total_requirements: number }>({
    queryKey: ["/api/market-signals/metrics"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/market-signals/metrics");
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const deleteSignalMutation = useMutation({
    mutationFn: async (signalId: string) => {
      const res = await apiRequest("DELETE", `/api/market-signals/${signalId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-signals/metrics"] });
      toast({ title: "Signal deleted" });
      setDeletingSignal(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const allSignals = signalsData?.signals ?? [];

  const filteredSignals = allSignals.filter((s) => {
    if (signalTypeFilter !== "all" && s.source_type !== signalTypeFilter) return false;
    if (signalStatusFilter !== "all" && s.status !== signalStatusFilter) return false;
    return true;
  });

  const totalSignals = allSignals.length;
  const activeSignals = allSignals.filter((s) => s.status === "active").length;

  const heatmapRows = heatmapMetrics?.heatmap ?? [];
  const dimensionsCovered = new Set(heatmapRows.map((r) => r.dimension_name)).size;
  const totalRequirements = metricsData?.total_requirements ?? 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1e3a5f] flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-page-title">Market Signals</h1>
              <p className="text-sm text-muted-foreground">Log and analyse external capability requirements</p>
            </div>
          </div>
          <Button
            onClick={() => { setEditingSignal(null); setSignalModalOpen(true); }}
            data-testid="button-add-signal"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add signal
          </Button>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3" data-testid="banner-info">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Market Signals captures requirements from real-world customer conversations, RFIs, and partner asks. Link each requirement to your competitive dimensions to see where market demand is concentrating.
          </p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg p-4" data-testid="card-total-signals">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total Signals</span>
            </div>
            <p className="text-2xl font-bold" data-testid="value-total-signals">{signalsLoading ? "—" : totalSignals}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg p-4" data-testid="card-requirements">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Requirements</span>
            </div>
            <p className="text-2xl font-bold" data-testid="value-requirements">{totalRequirements}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg p-4" data-testid="card-active-signals">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Active Signals</span>
            </div>
            <p className="text-2xl font-bold" data-testid="value-active-signals">{signalsLoading ? "—" : activeSignals}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg p-4" data-testid="card-dimensions-covered">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Layers className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Dimensions Covered</span>
            </div>
            <p className="text-2xl font-bold" data-testid="value-dimensions-covered">{dimensionsCovered}</p>
          </div>
        </div>

        {/* Heatmap section */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg overflow-hidden" data-testid="section-heatmap">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
            onClick={() => setHeatmapOpen((v) => !v)}
            data-testid="button-toggle-heatmap"
          >
            <span className="font-semibold text-sm">Demand Heatmap</span>
            {heatmapOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>

          {heatmapOpen && (
            <div className="border-t dark:border-slate-700 px-5 py-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Filter by status:</span>
                {["all", "active", "closed"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${heatmapFilter === f ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-slate-300"}`}
                    onClick={() => setHeatmapFilter(f)}
                    data-testid={`button-heatmap-filter-${f}`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <HeatmapSection statusFilter={heatmapFilter} />
            </div>
          )}
        </div>

        {/* Signals list section */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg overflow-hidden" data-testid="section-signals-list">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
            onClick={() => setSignalsOpen((v) => !v)}
            data-testid="button-toggle-signals"
          >
            <span className="font-semibold text-sm">Signals ({filteredSignals.length})</span>
            {signalsOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>

          {signalsOpen && (
            <div className="border-t dark:border-slate-700 px-5 py-4 space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Type:</span>
                  <Select value={signalTypeFilter} onValueChange={setSignalTypeFilter}>
                    <SelectTrigger className="h-8 text-xs w-40" data-testid="select-filter-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {SOURCE_TYPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <Select value={signalStatusFilter} onValueChange={setSignalStatusFilter}>
                    <SelectTrigger className="h-8 text-xs w-32" data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {signalsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading signals…
                </div>
              )}

              {!signalsLoading && filteredSignals.length === 0 && (
                <div className="text-center py-10" data-testid="text-no-signals">
                  <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium text-muted-foreground">No signals yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "+ Add signal" to log your first market signal.</p>
                </div>
              )}

              {!signalsLoading && filteredSignals.length > 0 && (
                <div className="space-y-2">
                  {filteredSignals.map((signal) => (
                    <SignalRow
                      key={signal.id}
                      signal={signal}
                      dimensions={dimensions}
                      onEdit={(s) => { setEditingSignal(s); setSignalModalOpen(true); }}
                      onDelete={(s) => setDeletingSignal(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Signal create/edit modal */}
      {signalModalOpen && (
        <SignalModal
          open={signalModalOpen}
          onClose={() => { setSignalModalOpen(false); setEditingSignal(null); }}
          initial={editingSignal}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/market-signals"] });
          }}
        />
      )}

      {/* Delete signal confirmation */}
      {deletingSignal && (
        <Dialog open={!!deletingSignal} onOpenChange={(v) => !v && setDeletingSignal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Signal</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Are you sure you want to delete <strong>{deletingSignal.name}</strong>? This will also delete all its requirements and dimension links.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingSignal(null)} data-testid="button-cancel-delete">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteSignalMutation.mutate(deletingSignal.id)}
                disabled={deleteSignalMutation.isPending}
                data-testid="button-confirm-delete-signal"
              >
                {deleteSignalMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
