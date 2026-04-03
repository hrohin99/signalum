import { useState, useRef, useCallback } from "react";
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
  Upload,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Pencil,
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

interface ItemSignalResult {
  signal_id: string;
  signal_name: string;
  source_type: string;
  source_organisation: string | null;
  signal_date: string | null;
  status: string;
  requirement_id: string;
  requirement_text: string;
  source_reference: string | null;
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

function getCellColor(count: number): { bg: string; color: string } {
  if (count === 0) return { bg: "#F1EFE8", color: "#888780" };
  if (count <= 2) return { bg: "#D3D1C7", color: "#2C2C2A" };
  if (count <= 4) return { bg: "#CECBF6", color: "#26215C" };
  if (count <= 6) return { bg: "#AFA9EC", color: "#26215C" };
  if (count <= 8) return { bg: "#7F77DD", color: "#EEEDFE" };
  return { bg: "#534AB7", color: "#EEEDFE" };
}

function getSourceTypeBadgeStyle(sourceType: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    rfi: { bg: "#EEEDFE", color: "#3C3489" },
    sales_conversation: { bg: "#E1F5EE", color: "#085041" },
    customer_call: { bg: "#FAEEDA", color: "#633806" },
    partner_ask: { bg: "#FBEAF0", color: "#72243E" },
    other: { bg: "#F1EFE8", color: "#444441" },
  };
  return map[sourceType] ?? map.other;
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

// ===== Dimension accordion shared component =====
function DimensionAccordion({
  dimensions,
  selectedLinks,
  setSelectedLinks,
  expandedDims,
  setExpandedDims,
}: {
  dimensions: Dimension[];
  selectedLinks: DimensionLink[];
  setSelectedLinks: (links: DimensionLink[]) => void;
  expandedDims: Set<string>;
  setExpandedDims: (s: Set<string>) => void;
}) {
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
    const next = new Set(expandedDims);
    if (next.has(dimId)) next.delete(dimId);
    else next.add(dimId);
    setExpandedDims(next);
  }

  if (dimensions.length === 0) return null;

  return (
    <div>
      <Label>Link to Dimension Items</Label>
      <div className="mt-2 border rounded-lg divide-y overflow-hidden">
        {dimensions.map((dim) => {
          const items: { name: string }[] = Array.isArray(dim.items) ? dim.items : [];
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
  );
}

// ===== Extracted requirement row in review screen =====
type ReviewStatus = "pending" | "accepted" | "rejected";

interface ExtractedReq {
  requirement_text: string;
  source_ref: string | null;
  linked_items: DimensionLink[];
  status: ReviewStatus;
  editing: boolean;
  editText: string;
  editLinks: DimensionLink[];
  editExpandedDims: Set<string>;
}

function ReviewRow({
  req,
  idx,
  dimensions,
  onChange,
}: {
  req: ExtractedReq;
  idx: number;
  dimensions: Dimension[];
  onChange: (updated: Partial<ExtractedReq>) => void;
}) {
  const dimLinks: DimensionLink[] = req.editing ? req.editLinks : req.linked_items;
  const isAccepted = req.status === "accepted";
  const isRejected = req.status === "rejected";

  const rowBg = isAccepted
    ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
    : isRejected
    ? "border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/20 opacity-50"
    : "border-blue-200 bg-blue-50/30 dark:border-blue-800/50 dark:bg-blue-950/10";

  return (
    <div
      className={`border rounded-lg p-3 space-y-2 transition-colors ${rowBg}`}
      data-testid={`review-req-row-${idx}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {req.editing ? (
            <Textarea
              value={req.editText}
              onChange={(e) => onChange({ editText: e.target.value })}
              className="text-sm h-20 resize-none"
              data-testid={`review-edit-text-${idx}`}
            />
          ) : (
            <p className="text-sm text-foreground leading-snug" data-testid={`review-req-text-${idx}`}>
              {req.requirement_text}
            </p>
          )}
          {req.source_ref && !req.editing && (
            <p className="text-xs text-muted-foreground mt-1">{req.source_ref}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            type="button"
            title="Accept"
            className={`p-1.5 rounded transition-colors ${isAccepted ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground"}`}
            onClick={() => onChange({ status: "accepted" })}
            data-testid={`button-accept-req-${idx}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Reject"
            className={`p-1.5 rounded transition-colors ${isRejected ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground"}`}
            onClick={() => onChange({ status: "rejected" })}
            data-testid={`button-reject-req-${idx}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={req.editing ? "Done editing" : "Edit"}
            className={`p-1.5 rounded transition-colors ${req.editing ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground"}`}
            onClick={() => {
              if (req.editing) {
                onChange({ editing: false, requirement_text: req.editText, linked_items: req.editLinks });
              } else {
                onChange({ editing: true, editText: req.requirement_text, editLinks: req.linked_items });
              }
            }}
            data-testid={`button-edit-req-${idx}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {req.editing && dimensions.length > 0 && (
        <div className="pt-1">
          <DimensionAccordion
            dimensions={dimensions}
            selectedLinks={req.editLinks}
            setSelectedLinks={(links) => onChange({ editLinks: links })}
            expandedDims={req.editExpandedDims}
            setExpandedDims={(s) => onChange({ editExpandedDims: s })}
          />
        </div>
      )}

      {!req.editing && dimLinks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dimLinks.map((l, i) => (
            <span key={i} className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full">
              {l.dimension_name} → {l.item_name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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

  type TabType = "manual" | "paste" | "import";
  const [activeTab, setActiveTab] = useState<TabType>("manual");

  // Manual tab state
  const [reqText, setReqText] = useState(initial?.requirement_text ?? "");
  const [sourceRef, setSourceRef] = useState(initial?.source_ref ?? "");
  const [selectedLinks, setSelectedLinks] = useState<DimensionLink[]>(
    initial?.dimension_links ?? []
  );
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());

  // Paste tab state
  const [pasteText, setPasteText] = useState("");
  const MAX_PASTE = 3000;

  // Import tab state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const [pdfPageCountWarning, setPdfPageCountWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ExtractedReq[] | null>(null);
  const [savingBulk, setSavingBulk] = useState(false);

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

  const handleExtract = useCallback(async (body: object) => {
    setExtracting(true);
    setExtractError(null);
    setReviewItems(null);
    try {
      const res = await apiRequest("POST", `/api/market-signals/${signalId}/extract-requirements`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Extraction failed");
      }
      const data = await res.json();
      const items: ExtractedReq[] = (data.requirements ?? []).map((r: any) => {
        const linked: DimensionLink[] = (r.linked_items ?? []).map((li: any) => ({
          dimension_id: li.dimension_id ?? null,
          dimension_name: li.dimension_name,
          item_name: li.item_name,
        }));
        return {
          requirement_text: r.requirement_text,
          source_ref: r.source_ref ?? null,
          linked_items: linked,
          status: "pending" as ReviewStatus,
          editing: false,
          editText: r.requirement_text,
          editLinks: linked,
          editExpandedDims: new Set<string>(),
        };
      });
      setReviewItems(items);
    } catch (e: any) {
      setExtractError(e.message ?? "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, [signalId]);

  const handleAnalyseText = () => {
    if (!pasteText.trim()) return;
    handleExtract({ text: pasteText });
  };

  const handleAnalyseDocument = async () => {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = selectedFile.type as "application/pdf" | "image/jpeg" | "image/png";
      handleExtract({ file: base64, mimeType });
    };
    reader.readAsDataURL(selectedFile);
  };

  const validateAndSetFile = (file: File) => {
    setFileTooLarge(false);
    setPdfPageCountWarning(false);

    const maxSize = 4 * 1024 * 1024;
    if (file.size > maxSize) {
      setFileTooLarge(true);
      setSelectedFile(null);
      return;
    }

    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const pdfLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
          const { getDocument } = pdfLib as any;
          const arrayBuffer = reader.result as ArrayBuffer;
          const pdf = await getDocument({ data: arrayBuffer }).promise;
          if (pdf.numPages > 3) {
            setPdfPageCountWarning(true);
            setSelectedFile(file);
            return;
          }
        } catch {
          // ignore parse errors — let backend handle
        }
        setSelectedFile(file);
      };
      reader.readAsArrayBuffer(file);
    } else {
      setSelectedFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setFileTooLarge(false);
      setExtractError("Unsupported file type. Please upload a PDF, JPG, or PNG.");
      return;
    }
    validateAndSetFile(file);
  };

  const handleSaveBulk = async () => {
    if (!reviewItems) return;
    const accepted = reviewItems.filter((r) => r.status === "accepted");
    if (!accepted.length) return;
    setSavingBulk(true);
    let savedCount = 0;
    let failedCount = 0;
    for (const r of accepted) {
      try {
        const rawLinks = r.editing ? r.editLinks : r.linked_items;
        const validLinks = rawLinks.filter((l) => l.dimension_id && l.dimension_name && l.item_name);
        const res = await apiRequest("POST", `/api/market-signals/${signalId}/requirements`, {
          requirement_text: r.editing ? r.editText : r.requirement_text,
          source_ref: r.source_ref || null,
          dimension_links: validLinks.map((l) => ({
            dimension_id: l.dimension_id,
            dimension_name: l.dimension_name,
            item_name: l.item_name,
          })),
        });
        if (res.ok) {
          savedCount++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }
    setSavingBulk(false);
    queryClient.invalidateQueries({ queryKey: ["/api/market-signals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/market-signals/heatmap"] });
    queryClient.invalidateQueries({ queryKey: ["/api/market-signals/metrics"] });
    if (failedCount > 0) {
      toast({
        title: `${savedCount} saved, ${failedCount} failed`,
        description: "Some requirements could not be saved.",
        variant: "destructive",
      });
    } else {
      toast({ title: `${savedCount} requirement${savedCount !== 1 ? "s" : ""} saved` });
    }
    onSaved();
    onClose();
  };

  const updateReviewItem = (idx: number, updates: Partial<ExtractedReq>) => {
    setReviewItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  };

  const tabs: { key: TabType; label: string }[] = isEdit
    ? [{ key: "manual", label: "Write manually" }]
    : [
        { key: "manual", label: "Write manually" },
        { key: "paste", label: "Paste text" },
        { key: "import", label: "Import from document" },
      ];

  const charCount = pasteText.length;
  const charColor =
    charCount >= MAX_PASTE
      ? "text-red-600 dark:text-red-400"
      : charCount >= 2500
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Requirement" : "Add Requirement"}</DialogTitle>
        </DialogHeader>

        {/* Tab switcher — only shown when adding */}
        {!isEdit && !reviewItems && (
          <div className="flex border-b -mx-6 px-6 gap-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setActiveTab(t.key); setExtractError(null); }}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-blue-600 text-blue-700 dark:text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Review screen */}
        {reviewItems && (
          <div className="space-y-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {reviewItems.length} requirement{reviewItems.length !== 1 ? "s" : ""} found
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Review and accept or reject each one before saving.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="text-xs text-blue-700 dark:text-blue-400 underline underline-offset-2 hover:text-blue-900"
                  onClick={() => setReviewItems(reviewItems.map((r) => ({ ...r, status: "accepted" as ReviewStatus })))}
                  data-testid="button-accept-all"
                >
                  Accept all
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setReviewItems(null)}
                  data-testid="button-back-to-input"
                >
                  Back
                </button>
              </div>
            </div>
            <div
              className="flex items-center gap-4 text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-900/50 rounded-md"
              data-testid="review-tally"
            >
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {reviewItems.filter((r) => r.status === "accepted").length} accepted
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                {reviewItems.filter((r) => r.status === "pending").length} pending
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {reviewItems.filter((r) => r.status === "rejected").length} rejected
              </span>
            </div>
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {reviewItems.map((r, idx) => (
                <ReviewRow
                  key={idx}
                  req={r}
                  idx={idx}
                  dimensions={dimensions}
                  onChange={(updates) => updateReviewItem(idx, updates)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Manual tab */}
        {!reviewItems && (activeTab === "manual" || isEdit) && (
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
            <DimensionAccordion
              dimensions={dimensions}
              selectedLinks={selectedLinks}
              setSelectedLinks={setSelectedLinks}
              expandedDims={expandedDims}
              setExpandedDims={setExpandedDims}
            />
          </div>
        )}

        {/* Paste text tab */}
        {!reviewItems && activeTab === "paste" && !isEdit && (
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800 dark:text-blue-300">
                Paste an email, call notes, or transcript. We will extract individual requirements and suggest dimension mappings.
              </p>
            </div>
            {extracting ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3" data-testid="extracting-state">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <p className="text-sm text-muted-foreground">Analysing text…</p>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="paste-text">Text content</Label>
                    <span className={`text-xs ${charColor}`} data-testid="paste-char-count">
                      {charCount}/{MAX_PASTE}
                    </span>
                  </div>
                  <Textarea
                    id="paste-text"
                    data-testid="textarea-paste-text"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value.slice(0, MAX_PASTE))}
                    placeholder="Paste text here..."
                    className="h-48 resize-none"
                  />
                </div>
                {extractError && (
                  <p className="text-sm text-red-600 dark:text-red-400" data-testid="extract-error">{extractError}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Import from document tab */}
        {!reviewItems && activeTab === "import" && !isEdit && (
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800 dark:text-blue-300">
                Upload a PDF (max 3 pages, 4 MB) or image (JPG/PNG, max 4 MB). Claude will extract requirements from the document.
              </p>
            </div>

            {extracting ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3" data-testid="extracting-state-import">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <p className="text-sm text-muted-foreground">Analysing document… This may take 15–30 seconds.</p>
              </div>
            ) : (
              <>
                {fileTooLarge && (
                  <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-800 px-3 py-2" data-testid="file-too-large-warning">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-800 dark:text-red-300">File exceeds 4 MB limit. Please choose a smaller file.</p>
                  </div>
                )}

                {pdfPageCountWarning && selectedFile && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 px-3 py-2" data-testid="pdf-page-warning">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-900 dark:text-amber-300">This PDF has more than 3 pages. Only the first 3 pages will be analysed. Continue anyway?</p>
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          className="text-xs font-medium text-amber-800 dark:text-amber-300 underline"
                          onClick={() => { setPdfPageCountWarning(false); }}
                          data-testid="button-continue-pdf"
                        >
                          Continue
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-muted-foreground underline"
                          onClick={() => { setPdfPageCountWarning(false); setSelectedFile(null); }}
                          data-testid="button-cancel-pdf"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className={`border-2 border-dashed rounded-lg px-4 py-8 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="file-dropzone"
                >
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  {selectedFile ? (
                    <p className="text-sm font-medium text-foreground" data-testid="selected-file-name">{selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — max 4 MB</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={handleFileInput}
                    data-testid="input-file-upload"
                  />
                </div>

                {extractError && (
                  <p className="text-sm text-red-600 dark:text-red-400" data-testid="extract-error-import">{extractError}</p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {reviewItems ? (
            <>
              <Button variant="outline" onClick={() => setReviewItems(null)} data-testid="button-back-review">Back</Button>
              <Button
                onClick={handleSaveBulk}
                disabled={savingBulk || reviewItems.filter((r) => r.status === "accepted").length === 0}
                data-testid="button-save-accepted"
              >
                {savingBulk && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {(() => {
                  const n = reviewItems.filter((r) => r.status === "accepted").length;
                  return `Save ${n} accepted requirement${n !== 1 ? "s" : ""}`;
                })()}
              </Button>
            </>
          ) : activeTab === "paste" && !isEdit ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={extracting} data-testid="button-cancel-req">Cancel</Button>
              <Button
                onClick={handleAnalyseText}
                disabled={!pasteText.trim() || extracting || charCount > MAX_PASTE}
                data-testid="button-analyse-text"
              >
                Analyse text
              </Button>
            </>
          ) : activeTab === "import" && !isEdit ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={extracting} data-testid="button-cancel-req">Cancel</Button>
              <Button
                onClick={handleAnalyseDocument}
                disabled={!selectedFile || fileTooLarge || extracting || pdfPageCountWarning}
                data-testid="button-analyse-document"
              >
                Analyse document
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-req">Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={!reqText.trim() || mutation.isPending}
                data-testid="button-save-req"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEdit ? "Save changes" : "Add requirement"}
              </Button>
            </>
          )}
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
const LEGEND_STEPS = [
  { label: "0", ...getCellColor(0) },
  { label: "1–2", ...getCellColor(1) },
  { label: "3–4", ...getCellColor(3) },
  { label: "5–6", ...getCellColor(5) },
  { label: "7–8", ...getCellColor(7) },
  { label: "9+", ...getCellColor(9) },
];

function HeatmapSection({
  statusFilter,
  onCellClick,
}: {
  statusFilter: string;
  onCellClick: (dimensionName: string, itemName: string) => void;
}) {
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

  const uniqueDimensions = Array.from(new Set(rows.map((r) => r.dimension_name)));

  const cellMap = new Map<string, Map<string, number>>();
  const itemTotals = new Map<string, number>();
  for (const row of rows) {
    if (!cellMap.has(row.item_name)) cellMap.set(row.item_name, new Map());
    cellMap.get(row.item_name)!.set(row.dimension_name, row.signal_count);
    itemTotals.set(row.item_name, (itemTotals.get(row.item_name) ?? 0) + row.signal_count);
  }

  const sortedItems = Array.from(new Set(rows.map((r) => r.item_name))).sort(
    (a, b) => (itemTotals.get(b) ?? 0) - (itemTotals.get(a) ?? 0)
  );

  const scrollable = uniqueDimensions.length > 5;

  return (
    <div className="space-y-3" data-testid="heatmap-content">
      <div className={scrollable ? "overflow-x-auto" : ""}>
        <table style={{ borderCollapse: "collapse", width: scrollable ? undefined : "100%" }}>
          <thead>
            <tr>
              <th
                style={{ width: 180, minWidth: 180, textAlign: "left", padding: "6px 8px 6px 0", fontSize: 11, fontWeight: 500, color: "#888780", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}
              >
                Item
              </th>
              {uniqueDimensions.map((dim) => (
                <th
                  key={dim}
                  title={dim}
                  style={{ minWidth: 60, padding: "6px 4px", fontSize: 11, fontWeight: 500, color: "#6B7280", textAlign: "center", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}
                >
                  {dim.length > 12 ? dim.slice(0, 12) + "…" : dim}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item}>
                <td
                  title={item}
                  style={{ padding: "3px 8px 3px 0", fontSize: 12, color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {item}
                </td>
                {uniqueDimensions.map((dim) => {
                  const count = cellMap.get(item)?.get(dim) ?? 0;
                  const { bg, color } = getCellColor(count);
                  return (
                    <td key={dim} style={{ padding: "2px 4px", textAlign: "center" }}>
                      <div
                        onClick={() => count > 0 && onCellClick(dim, item)}
                        title={count > 0 ? `${count} signal${count !== 1 ? "s" : ""}` : undefined}
                        style={{
                          background: bg,
                          color,
                          height: 28,
                          minWidth: 60,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 500,
                          borderRadius: 4,
                          cursor: count > 0 ? "pointer" : "default",
                        }}
                        data-testid={`heatmap-cell-${dim}-${item}`}
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <span className="text-xs text-muted-foreground">Lower demand</span>
        {LEGEND_STEPS.map((step) => (
          <div
            key={step.label}
            style={{ background: step.bg, color: step.color, fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 500 }}
          >
            {step.label}
          </div>
        ))}
        <span className="text-xs text-muted-foreground">Higher demand</span>
      </div>
    </div>
  );
}

// ===== Item Signals Drill-down Panel =====
function ItemSignalsPanel({
  dimensionName,
  itemName,
  onClose,
}: {
  dimensionName: string;
  itemName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ results: ItemSignalResult[] }>({
    queryKey: ["/api/market-signals/item-signals", dimensionName, itemName],
    queryFn: async () => {
      const params = new URLSearchParams({ dimension_name: dimensionName, item_name: itemName });
      const res = await apiRequest("GET", `/api/market-signals/item-signals?${params.toString()}`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const results = data?.results ?? [];

  const signalMap = new Map<string, { signal: ItemSignalResult; requirements: ItemSignalResult[] }>();
  for (const r of results) {
    if (!signalMap.has(r.signal_id)) {
      signalMap.set(r.signal_id, { signal: r, requirements: [] });
    }
    signalMap.get(r.signal_id)!.requirements.push(r);
  }
  const signalGroups = Array.from(signalMap.values());

  return (
    <div>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 49 }}
        onClick={onClose}
        data-testid="backdrop-item-signals"
      />
      <div
        style={{ position: "fixed", top: 0, right: 0, width: "380px", height: "100vh", overflowY: "auto", background: "var(--color-background-primary)", borderLeft: "0.5px solid var(--color-border-tertiary)", zIndex: 50, padding: "20px" }}
        data-testid="panel-item-signals"
      >
        {/* Panel header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <p style={{ fontSize: 15, fontWeight: 500 }} className="text-foreground truncate">{itemName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{dimensionName}</p>
            <span
              style={{ background: "#EDE9FE", color: "#4C1D95", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, display: "inline-block", marginTop: 6 }}
            >
              {isLoading ? "…" : `${signalGroups.length} signal${signalGroups.length !== 1 ? "s" : ""}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            data-testid="button-close-item-signals"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {!isLoading && signalGroups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No signals reference this item yet.
            </p>
          )}

          {!isLoading && signalGroups.map(({ signal, requirements }) => {
            const badgeStyle = getSourceTypeBadgeStyle(signal.source_type);
            return (
              <div
                key={signal.signal_id}
                style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: 12 }}
                className="bg-white dark:bg-slate-800 dark:border-slate-700"
                data-testid={`card-signal-${signal.signal_id}`}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span style={{ ...badgeStyle, fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 500 }}>
                    {getSourceLabel(signal.source_type)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(signal.status)}`}>
                    {signal.status}
                  </span>
                </div>
                <p className="font-medium text-sm text-foreground mb-1">{signal.signal_name}</p>
                {(signal.source_organisation || signal.signal_date) && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {[signal.source_organisation, signal.signal_date ? formatDate(signal.signal_date) : null].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="space-y-2">
                  {requirements.map((req) => (
                    <div key={req.requirement_id} className="border-t border-slate-100 dark:border-slate-700 pt-2">
                      <p className="text-xs italic text-foreground">"{req.requirement_text}"</p>
                      {req.source_reference && (
                        <p className="text-xs text-muted-foreground mt-0.5">{req.source_reference}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
  const [drillDown, setDrillDown] = useState<{ dimensionName: string; itemName: string } | null>(null);

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
    <div className="relative flex flex-col h-full overflow-auto">
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
              <HeatmapSection
                statusFilter={heatmapFilter}
                onCellClick={(dimensionName, itemName) => setDrillDown({ dimensionName, itemName })}
              />
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

      {drillDown && (
        <ItemSignalsPanel
          dimensionName={drillDown.dimensionName}
          itemName={drillDown.itemName}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
