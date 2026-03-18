import React, { useState, useEffect, useCallback, useRef } from "react";
import { OnboardingWelcomeModal as OnboardingWelcomeModalComponent } from "@/components/welcome-modal";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FolderOpen,
  Tag,
  ChevronRight,
  ChevronDown,
  Network,
  Plus,
  Loader2,
  Shield,
  Check,
  BarChart3,
  Download,
  X,
  Target,
  Zap,
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { ExtractedCategory, ExtractedEntity, Capture, TopicDate, WorkspaceCapability, CompetitorCapability } from "@shared/schema";

interface TopicDateWithDaysUntil extends TopicDate {
  days_until: number;
}

type DeadlineUrgency = "red" | "amber" | "yellow" | null;

function getDeadlineUrgency(daysUntil: number): DeadlineUrgency {
  if (daysUntil < 0) return "red";
  if (daysUntil <= 7) return "amber";
  if (daysUntil <= 30) return "yellow";
  return null;
}

function getMostUrgent(urgencies: DeadlineUrgency[]): DeadlineUrgency {
  if (urgencies.includes("red")) return "red";
  if (urgencies.includes("amber")) return "amber";
  if (urgencies.includes("yellow")) return "yellow";
  return null;
}

const urgencyDotColors: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-400",
};

function formatDeadlinePill(daysUntil: number, dateStr: string): { label: string; className: string } {
  if (daysUntil < 0) {
    return { label: "Overdue", className: "bg-red-500 text-white" };
  }
  if (daysUntil <= 7) {
    return { label: `Due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`, className: "bg-red-500 text-white" };
  }
  const d = new Date(dateStr + "T00:00:00");
  const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: `Due ${formatted}`, className: "bg-amber-500 text-white" };
}

const topicTypeMap: Record<string, { icon: string; displayName: string }> = {
  competitor: { icon: "🎯", displayName: "Competitor" },
  project: { icon: "📋", displayName: "Project" },
  regulation: { icon: "⚖️", displayName: "Regulation or Policy" },
  person: { icon: "👤", displayName: "Person to Watch" },
  trend: { icon: "📈", displayName: "Market Trend" },
  account: { icon: "🤝", displayName: "Account" },
  technology: { icon: "⚙️", displayName: "Technology" },
  event: { icon: "📅", displayName: "Event" },
  deal: { icon: "💰", displayName: "Deal" },
  risk: { icon: "⚠️", displayName: "Risk" },
  general: { icon: "📌", displayName: "General" },
};

const categoryColorMap: Record<string, { bg: string; icon: string }> = {
  "Competitors": { bg: "#fee2e2", icon: "#dc2626" },
  "Competitor Landscape": { bg: "#fee2e2", icon: "#dc2626" },
  "Standards & Regulations": { bg: "#dbeafe", icon: "#1d4ed8" },
  "Industry Topics": { bg: "#dcfce7", icon: "#16a34a" },
  "Threat Intelligence": { bg: "#ffedd5", icon: "#ea580c" },
};

const topicIconMap: Record<string, { Icon: typeof Target; color: string }> = {
  competitor: { Icon: Target, color: "#dc2626" },
  regulation: { Icon: Shield, color: "#1d4ed8" },
  technology: { Icon: Zap, color: "#16a34a" },
  trend: { Icon: AlertTriangle, color: "#ea580c" },
};

const entityTypeLabels: Record<string, string> = {
  person: "Person",
  company: "Company",
  topic: "Topic",
  technology: "Technology",
  regulation: "Regulation",
  event: "Event",
  location: "Location",
  other: "Other",
};

function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  return <OnboardingWelcomeModalComponent onDismiss={onDismiss} />;
}

function EmptyCategoryNudge({
  categoryName,
  onAdd,
  isPending,
}: {
  categoryName: string;
  onAdd: (name: string) => void;
  isPending: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const handleAdd = () => {
    const name = inputValue.trim();
    if (!name) return;
    onAdd(name);
    setJustAdded(name);
    setInputValue("");
    setTimeout(() => setJustAdded(null), 3000);
  };

  return (
    <div
      className="rounded-lg bg-gray-100 border border-gray-200"
      style={{ padding: "24px" }}
      data-testid="empty-category-nudge"
    >
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-5 h-5 text-[#1e3a5f]" />
        <h3 className="font-semibold text-[#1e3a5f]" data-testid="text-nudge-headline">Nothing here yet</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Name a few specific ones and Signalum will start tracking them for you.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. Google, a regulation name, a specific topic..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          className="flex-1"
          data-testid="input-nudge-topic"
        />
        <Button
          size="sm"
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white px-4"
          disabled={!inputValue.trim() || isPending}
          onClick={handleAdd}
          data-testid="button-nudge-add"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </div>
      {justAdded && (
        <div className="flex items-center gap-1.5 mt-3 text-sm text-emerald-600" data-testid="text-nudge-confirmation">
          <Check className="w-4 h-4" />
          Added. Signalum is now tracking this.
        </div>
      )}
    </div>
  );
}

function InlineAddTopic({
  onAdd,
  isPending,
}: {
  onAdd: (name: string) => void;
  isPending: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const handleAdd = () => {
    const name = inputValue.trim();
    if (!name) return;
    onAdd(name);
    setJustAdded(name);
    setInputValue("");
    setTimeout(() => setJustAdded(null), 3000);
  };

  return (
    <div className="mt-3" data-testid="inline-add-topic">
      <div className="flex gap-2">
        <Input
          placeholder="Add another topic..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          className="flex-1"
          data-testid="input-inline-add-topic"
        />
        <Button
          size="sm"
          variant="outline"
          className="text-[#1e3a5f] border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/5 px-4"
          disabled={!inputValue.trim() || isPending}
          onClick={handleAdd}
          data-testid="button-inline-add-topic"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </div>
      {justAdded && (
        <div className="flex items-center gap-1.5 mt-2 text-sm text-emerald-600" data-testid="text-inline-add-confirmation">
          <Check className="w-4 h-4" />
          Added. Signalum is now tracking this.
        </div>
      )}
    </div>
  );
}

function SeedingBanner() {
  return (
    <div
      className="w-full rounded-lg bg-[#1e3a5f] text-white px-4 py-3 flex items-center gap-3 mb-6"
      data-testid="banner-seeding"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <p className="text-sm">
        Signalum is searching the web for recent intelligence on your tracked topics. This takes about 30 seconds.
      </p>
    </div>
  );
}

function WorkspaceInitialLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white" data-testid="workspace-initial-loading">
      <div className="flex flex-col items-center text-center">
        <Loader2 className="w-8 h-8 text-[#1e3a5f] animate-spin mb-4" />
        <p className="text-sm text-muted-foreground" data-testid="text-initial-loading">Loading your workspace…</p>
      </div>
    </div>
  );
}


function WorkspaceErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white" data-testid="workspace-error-fallback">
      <div className="text-center max-w-md px-6">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ backgroundColor: "#1e3a5f" }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold" style={{ color: "#1e3a5f" }}>Signalum</span>
        </div>
        <p className="text-lg font-medium text-foreground mb-2" data-testid="text-error-message">Something went wrong loading your workspace</p>
        <Button
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white px-6"
          onClick={() => window.location.reload()}
          data-testid="button-error-reload"
        >
          Reload
        </Button>
      </div>
    </div>
  );
}

class WorkspaceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_error: unknown): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    try {
      console.error("[WorkspaceErrorBoundary] Caught error:", error, errorInfo);
    } catch (_) {}
  }
  render() {
    if (this.state.hasError) {
      return <WorkspaceErrorFallback />;
    }
    return this.props.children;
  }
}

export default function MapPage() {
  return (
    <WorkspaceErrorBoundary>
      <MapPageInner />
    </WorkspaceErrorBoundary>
  );
}

function MapPageInner() {
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [wsPhase, setWsPhase] = useState<"loading" | "ready" | "error">("loading");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [seedingActive, setSeedingActive] = useState(false);
  const [seedingChecked, setSeedingChecked] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showTopAddTopic, setShowTopAddTopic] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [topAddTopicName, setTopAddTopicName] = useState("");
  const [topAddTopicType, setTopAddTopicType] = useState("general");
  const [topAddTopicWebsiteUrl, setTopAddTopicWebsiteUrl] = useState("");
  const [justCreatedCategory, setJustCreatedCategory] = useState<string | null>(null);
  const [renameCategoryOpen, setRenameCategoryOpen] = useState(false);
  const [renameCategoryOldName, setRenameCategoryOldName] = useState("");
  const [renameCategoryNewName, setRenameCategoryNewName] = useState("");
  const [editFocusOpen, setEditFocusOpen] = useState(false);
  const [editFocusCategoryName, setEditFocusCategoryName] = useState("");
  const [editFocusValue, setEditFocusValue] = useState("");
  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false);
  const [deleteCategoryName, setDeleteCategoryName] = useState("");
  const [renameTopicOpen, setRenameTopicOpen] = useState(false);
  const [renameTopicOldName, setRenameTopicOldName] = useState("");
  const [renameTopicNewName, setRenameTopicNewName] = useState("");
  const [deleteTopicOpen, setDeleteTopicOpen] = useState(false);
  const [deleteTopicName, setDeleteTopicName] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const queryEnabled = !!user?.id && !!session && !authLoading;
  console.log("WS: component mounted");
  console.log("WS_FETCH_GUARD:", { user: !!user, userId: !!user?.id, session: !!session, authLoading, queryEnabled });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fresh") === "1" && user?.id) {
      queryClient.removeQueries({ queryKey: ["/api/workspace", user.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user.id] });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [user?.id]);

  const { data: wsData, isLoading: wsLoading, error: wsError, fetchStatus } = useQuery<{ exists: boolean; workspace?: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace", user?.id],
    enabled: queryEnabled,
    retry: false,
    refetchOnMount: "always",
  });


  console.log("WS: fetch started", { userId: user?.id, wsLoading, wsError: wsError?.message, wsDataExists: !!wsData });

  if (wsData) {
    const catCount = Array.isArray(wsData?.workspace?.categories) ? wsData.workspace.categories.length : 0;
    console.log("WS: fetch response received", { exists: wsData?.exists, catCount });
    console.log("WS: categories count =", catCount);
  }

  const { data: capturesRaw, isLoading: capLoading } = useQuery<Capture[]>({
    queryKey: ["/api/captures"],
    enabled: !!user && wsPhase === "ready",
  });
  const captures: Capture[] = Array.isArray(capturesRaw) ? capturesRaw : [];

  const { data: topicDatesData } = useQuery<{ dates: TopicDateWithDaysUntil[] }>({
    queryKey: ["/api/topic-dates/all"],
    enabled: !!user && wsPhase === "ready",
  });

  const allTopicDates = Array.isArray(topicDatesData?.dates) ? topicDatesData.dates : [];
  const rawCategories = wsData?.workspace?.categories;
  const categories = (Array.isArray(rawCategories) ? rawCategories : []).map(cat => ({
    ...cat,
    entities: Array.isArray(cat?.entities) ? cat.entities.map(e => ({
      ...e,
      disambiguation_confirmed: e?.disambiguation_confirmed ?? false,
      disambiguation_context: e?.disambiguation_context ?? undefined,
      company_industry: e?.company_industry ?? undefined,
      domain_keywords: Array.isArray(e?.domain_keywords) ? e.domain_keywords : [],
      needs_aspect_review: e?.needs_aspect_review ?? false,
      auto_search_enabled: e?.auto_search_enabled ?? true,
      alert_on_high_signal: e?.alert_on_high_signal ?? false,
    })) : [],
  }));

  useEffect(() => {
    try {
      if (wsPhase === "ready" || wsPhase === "error") return;

      if (wsPhase !== "loading") return;
      if (!queryEnabled) return;
      if (wsLoading || fetchStatus === "fetching") return;
      if (wsError) {
        setWsPhase("error");
        return;
      }

      if (wsData?.exists || wsData?.workspace) {
        setWsPhase("ready");
        return;
      }

      setWsPhase("ready");
    } catch (err) {
      console.error("[MyWorkspace] Phase transition error:", err);
      setWsPhase("error");
    }
  }, [wsPhase, wsLoading, wsError, wsData, queryEnabled, fetchStatus]);


  useEffect(() => {
    try {
      const tenantId = user?.id ?? "unknown";
      const wsContextFound = !!(wsData?.workspace);
      const rawCats = wsData?.workspace?.categories;
      const entityCount = (Array.isArray(rawCats) ? rawCats : []).reduce((a, c) => a + (Array.isArray(c?.entities) ? c.entities.length : 0), 0);
      const errors: string[] = [];
      if (wsError) errors.push(`workspace: ${(wsError as Error)?.message ?? "unknown"}`);
      if (wsPhase === "error") errors.push("phase: error");

      console.log(`[MyWorkspace] Mount diagnostics — tenant_id: ${tenantId}, phase: ${wsPhase}, workspace_context_found: ${wsContextFound}, entities_loaded: ${entityCount}, errors: ${errors.length > 0 ? errors.join("; ") : "none"}`);
    } catch (e) {
      console.error("[MyWorkspace] Diagnostic logging failed:", e);
    }
  }, [user?.id, wsData, wsError, wsPhase]);

  const getEntityDeadline = (entityName: string): TopicDateWithDaysUntil | null => {
    const dates = allTopicDates.filter(d => d.entityId === entityName && d.days_until <= 30);
    if (dates.length === 0) return null;
    return dates.reduce((most, d) => (d.days_until < most.days_until ? d : most), dates[0]);
  };

  const getCategoryUrgency = (cat: ExtractedCategory): DeadlineUrgency => {
    const urgencies = cat.entities
      .map(e => {
        const dl = getEntityDeadline(e.name);
        return dl ? getDeadlineUrgency(dl.days_until) : null;
      })
      .filter((u): u is DeadlineUrgency => u !== null);
    return getMostUrgent(urgencies);
  };

  const { data: welcomeStatus } = useQuery<{ dismissed: boolean }>({
    queryKey: ["/api/welcome-status"],
    enabled: !!user,
  });

  const dismissWelcomeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dismiss-welcome");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/welcome-status"] });
      setShowWelcome(false);
    },
  });

  const { data: suggestedCategories } = useQuery<{ category: string; count: number; reason: string; latestCaptureId: number }[]>({
    queryKey: ["/api/captures/suggested-categories"],
    enabled: queryEnabled,
    refetchOnMount: true,
  });

  const addSuggestedCategoryMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      const res = await apiRequest("POST", "/api/add-category", { categoryName, categoryDescription: "" });
      return res.json();
    },
    onSuccess: (_data, categoryName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures/suggested-categories"] });
      setDismissedSuggestions(prev => new Set([...prev, categoryName]));
      toast({ title: "Category added", description: `"${categoryName}" has been added to your workspace.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const dismissSuggestedCategoryMutation = useMutation({
    mutationFn: async (category: string) => {
      const res = await apiRequest("DELETE", `/api/captures/suggested-categories/${encodeURIComponent(category)}`);
      return res.json();
    },
    onSuccess: (_data, category) => {
      queryClient.invalidateQueries({ queryKey: ["/api/captures/suggested-categories"] });
      setDismissedSuggestions(prev => new Set([...prev, category]));
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addToExistingCategoryMutation = useMutation({
    mutationFn: async ({ suggestedCategory, targetCategory }: { suggestedCategory: string; targetCategory: string }) => {
      const res = await apiRequest("POST", "/api/add-entity", {
        categoryName: targetCategory,
        entityName: suggestedCategory,
        entityType: "other",
      });
      await apiRequest("DELETE", `/api/captures/suggested-categories/${encodeURIComponent(suggestedCategory)}`);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures/suggested-categories"] });
      setDismissedSuggestions(prev => new Set([...prev, variables.suggestedCategory]));
      toast({ title: "Topic added", description: `"${variables.suggestedCategory}" has been added to "${variables.targetCategory}".` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const localSeen = localStorage.getItem("onboarding_welcome_seen") === "true";
    if (welcomeStatus && !welcomeStatus.dismissed && !localSeen && categories.length > 0) {
      setShowWelcome(true);
    }
  }, [welcomeStatus, categories.length]);

  const checkSeedingStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest("GET", "/api/historical-seeding/status");
      const data = await res.json();
      if (data?.running) {
        setSeedingActive(true);
      } else if (seedingActive && !data?.running) {
        setSeedingActive(false);
        if (data?.totalFindings > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
          queryClient.invalidateQueries({ queryKey: ["/api/workspace", user.id] });
          toast({
            title: "Intelligence gathered",
            description: `Your workspace has been populated with recent intelligence. ${data.totalFindings} updates found across ${data.topicsProcessed} topics.`,
            className: "bg-emerald-50 border-emerald-200 text-emerald-900",
          });
        }
      }
      setSeedingChecked(true);
    } catch (err) {
      console.error("[MyWorkspace] Seeding status check failed:", err);
      setSeedingChecked(true);
    }
  }, [user, seedingActive, toast]);

  useEffect(() => {
    if (!user) return;
    checkSeedingStatus();
  }, [user]);

  useEffect(() => {
    if (!seedingActive) return;
    const interval = setInterval(checkSeedingStatus, 3000);
    return () => clearInterval(interval);
  }, [seedingActive, checkSeedingStatus]);

  const effectiveCategory = selectedCategory ?? (categories.length > 0 ? categories[0].name : null);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].name);
    }
  }, [categories, selectedCategory]);

  const activeCategory = categories.find((c) => c.name === effectiveCategory);

  const triggerEntitySearch = useCallback(async (entityName: string, categoryName: string, topicType?: string) => {
    try {
      await apiRequest("POST", "/api/search/manual", {
        entityName,
        categoryName,
        topicType: topicType || "general",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
    } catch (err) {
      console.error(`[MyWorkspace] Background search failed for "${entityName}":`, err);
    }
  }, [user?.id]);

  const searchTriggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !categories.length || capLoading) return;

    const entitiesToSearch: { name: string; categoryName: string; topicType: string }[] = [];
    for (const cat of categories) {
      for (const entity of cat.entities) {
        const searchKey = `${cat.name}::${entity.name}`;
        if (searchTriggeredRef.current.has(searchKey)) continue;

        // Only search if aiSummary is stale (older than 24 hours) or has never been set
        const lastUpdated = entity.aiSummaryUpdatedAt ? new Date(entity.aiSummaryUpdatedAt).getTime() : 0;
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const isStale = lastUpdated < twentyFourHoursAgo;

        if (isStale) {
          entitiesToSearch.push({
            name: entity.name,
            categoryName: cat.name,
            topicType: (entity.topic_type || "general").toLowerCase(),
            searchKey,
          });
        }
      }
    }

    if (entitiesToSearch.length > 0) {
      for (const e of entitiesToSearch) {
        searchTriggeredRef.current.add(e.searchKey);
        triggerEntitySearch(e.name, e.categoryName, e.topicType);
      }
    }
  }, [user, categories, captures, capLoading, triggerEntitySearch]);

  const addEntityMutation = useMutation({
    mutationFn: async (data: { categoryName: string; entityName: string; entityType: string; topicType?: string; website_url?: string }) => {
      const res = await apiRequest("POST", "/api/add-entity", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      searchTriggeredRef.current.add(`${variables.categoryName}::${variables.entityName}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  const addCategoryMutation = useMutation({
    mutationFn: async (data: { categoryName: string }) => {
      const res = await apiRequest("POST", "/api/add-category", {
        categoryName: data.categoryName,
        categoryDescription: "",
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      setSelectedCategory(variables.categoryName);
      setNewCategoryName("");
      setShowNewCategoryInput(false);
      setJustCreatedCategory(variables.categoryName);
      setTimeout(() => setJustCreatedCategory(null), 8000);
      toast({ title: "Category created", description: `"${variables.categoryName}" has been added to your workspace.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renameCategoryMutation = useMutation({
    mutationFn: async (data: { oldName: string; newName: string }) => {
      const res = await apiRequest("PUT", `/api/categories/${encodeURIComponent(data.oldName)}`, {
        name: data.newName,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      if (selectedCategory === variables.oldName) {
        setSelectedCategory(variables.newName);
      }
      setRenameCategoryOpen(false);
      toast({ title: "Category renamed", description: `Renamed to "${variables.newName}".` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateCategoryFocusMutation = useMutation({
    mutationFn: async (data: { categoryName: string; focus: string }) => {
      const res = await apiRequest("PUT", `/api/categories/${encodeURIComponent(data.categoryName)}`, {
        focus: data.focus,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      setEditFocusOpen(false);
      toast({ title: "Focus updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      const res = await apiRequest("DELETE", `/api/categories/${encodeURIComponent(categoryName)}`);
      return res.json();
    },
    onSuccess: (_data, categoryName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      if (selectedCategory === categoryName) {
        setSelectedCategory(null);
      }
      setDeleteCategoryOpen(false);
      toast({ title: "Category deleted", description: `"${categoryName}" and its topics have been removed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renameTopicMutation = useMutation({
    mutationFn: async (data: { oldName: string; newName: string }) => {
      const res = await apiRequest("PUT", `/api/topics/${encodeURIComponent(data.oldName)}`, {
        name: data.newName,
        categoryName: selectedCategory,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      setRenameTopicOpen(false);
      toast({ title: "Topic renamed", description: `Renamed to "${variables.newName}".` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (entityName: string) => {
      const res = await apiRequest("DELETE", `/api/topics/${encodeURIComponent(entityName)}`, {
        categoryName: selectedCategory,
      });
      return res.json();
    },
    onSuccess: (_data, entityName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      setDeleteTopicOpen(false);
      toast({ title: "Topic deleted", description: `"${entityName}" has been removed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    addCategoryMutation.mutate({ categoryName: name });
  };

  const handleTopAddTopic = () => {
    const name = topAddTopicName.trim();
    if (!name || !effectiveCategory) return;
    const payload: { categoryName: string; entityName: string; entityType: string; topicType: string; website_url?: string } = {
      categoryName: effectiveCategory,
      entityName: name,
      entityType: "other",
      topicType: topAddTopicType,
    };
    if (topAddTopicType === "competitor" && topAddTopicWebsiteUrl.trim()) {
      payload.website_url = topAddTopicWebsiteUrl.trim();
    }
    addEntityMutation.mutate(payload);
    setTopAddTopicName("");
    setTopAddTopicType("general");
    setTopAddTopicWebsiteUrl("");
    setShowTopAddTopic(false);
  };

  const handleNudgeAdd = (name: string) => {
    if (!effectiveCategory) return;
    addEntityMutation.mutate({
      categoryName: effectiveCategory,
      entityName: name,
      entityType: "other",
    });
  };

  const getCaptureCountForCategory = (categoryName: string) =>
    captures.filter((c) => c.matchedCategory === categoryName).length;

  const getCaptureCountForEntity = (entityName: string) =>
    captures.filter((c) => c.matchedEntity === entityName).length;

  const getLastSearchedLabel = (entityName: string): { text: string; isSearched: boolean; isSearching: boolean } => {
    const webSearchCaptures = captures
      .filter((c) => c.matchedEntity === entityName && c.type === "web_search")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (webSearchCaptures.length === 0) {
      return { text: "Searching now…", isSearched: false, isSearching: true };
    }

    const lastDate = new Date(webSearchCaptures[0].createdAt);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let relative: string;
    if (diffMins < 1) relative = "just now";
    else if (diffMins < 60) relative = `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
    else if (diffHours < 24) relative = `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    else if (diffDays === 1) relative = "yesterday";
    else if (diffDays < 7) relative = `${diffDays} days ago`;
    else relative = lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return { text: `Last searched: ${relative}`, isSearched: true, isSearching: false };
  };

  const handleDismissWelcome = () => {
    dismissWelcomeMutation.mutate();
  };

  if (wsPhase === "loading") {
    console.log("WS: rendering loading state");
    return <WorkspaceInitialLoading />;
  }

  if (wsPhase === "error") {
    console.log("WS: rendering error fallback");
    return <WorkspaceErrorFallback />;
  }


  console.log("WS: rendering workspace", { categoriesCount: categories.length, capturesCount: captures.length });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {showWelcome && <WelcomeModal onDismiss={handleDismissWelcome} />}
      {seedingActive && <SeedingBanner />}

      {suggestedCategories && suggestedCategories
        .filter(s => !dismissedSuggestions.has(s.category))
        .map(s => (
          <div
            key={s.category}
            className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
            data-testid={`banner-suggested-category-${s.category.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span className="text-lg leading-none mt-0.5">💡</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                &ldquo;{s.category}&rdquo; appears in {s.count} captured email{s.count !== 1 ? "s" : ""} — add it as a tracked category?
              </p>
              {s.reason && (
                <p className="text-xs text-amber-700 mt-0.5">{s.reason}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-400 text-amber-900 hover:bg-amber-100"
                data-testid={`button-add-new-suggested-category-${s.category.toLowerCase().replace(/\s+/g, "-")}`}
                disabled={addSuggestedCategoryMutation.isPending || dismissSuggestedCategoryMutation.isPending || addToExistingCategoryMutation.isPending}
                onClick={() => addSuggestedCategoryMutation.mutate(s.category)}
              >
                Add as New Category
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-400 text-amber-900 hover:bg-amber-100"
                    data-testid={`button-add-to-existing-category-${s.category.toLowerCase().replace(/\s+/g, "-")}`}
                    disabled={addSuggestedCategoryMutation.isPending || dismissSuggestedCategoryMutation.isPending || addToExistingCategoryMutation.isPending}
                  >
                    Add to Existing Category <ChevronDown className="ml-1 w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {categories.map(cat => (
                    <DropdownMenuItem
                      key={cat.name}
                      data-testid={`dropdown-item-existing-category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={() => addToExistingCategoryMutation.mutate({ suggestedCategory: s.category, targetCategory: cat.name })}
                    >
                      {cat.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-amber-700 hover:bg-amber-100"
                data-testid={`button-dismiss-suggested-category-${s.category.toLowerCase().replace(/\s+/g, "-")}`}
                disabled={addSuggestedCategoryMutation.isPending || dismissSuggestedCategoryMutation.isPending || addToExistingCategoryMutation.isPending}
                onClick={() => dismissSuggestedCategoryMutation.mutate(s.category)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))
      }

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">My Workspace</h1>
          <p className="text-muted-foreground mt-1">
            {categories.length} categories, {categories.reduce((a, c) => a + c.entities.length, 0)} topics, {captures.length} updates this month
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCompareModal(true)}
          className="gap-1.5 text-[#1e3a5f] border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/5"
          data-testid="button-compare"
        >
          <BarChart3 className="w-4 h-4" />
          Compare
        </Button>
      </div>

      {showCompareModal && (
        <CompareModal
          categories={categories}
          open={showCompareModal}
          onOpenChange={setShowCompareModal}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 px-1">Categories</p>
          {categories.map((cat) => {
            const isActive = effectiveCategory === cat.name;
            const count = getCaptureCountForCategory(cat.name);
            const catUrgency = getCategoryUrgency(cat);
            const catColors = categoryColorMap[cat.name];
            const latestCapture = captures
              .filter((c) => c.matchedCategory === cat.name)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            const latestActivityText = latestCapture
              ? (() => {
                  const preview = `${latestCapture.matchedEntity || ""} ${latestCapture.content}`.trim();
                  const truncated = preview.length > 60 ? preview.slice(0, 60).trimEnd() + "…" : preview;
                  const dateStr = new Date(latestCapture.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return `${truncated} · ${dateStr}`;
                })()
              : null;
            return (
              <div
                key={cat.name}
                className="relative group/cat"
              >
                <button
                  onClick={() => {
                    setSelectedCategory(cat.name);
                  }}
                  className={`w-full text-left rounded-lg p-4 transition-all flex flex-col gap-2 group border ${
                    isActive
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md"
                      : "bg-card border-border/50 hover:border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/[0.03] hover:shadow-sm"
                  }`}
                  data-testid={`button-category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                      style={isActive
                        ? { backgroundColor: "rgba(255,255,255,0.2)" }
                        : catColors
                          ? { backgroundColor: catColors.bg }
                          : { backgroundColor: "rgba(30,58,95,0.1)" }
                      }
                    >
                      <FolderOpen
                        className="w-4 h-4"
                        style={isActive
                          ? { color: "white" }
                          : catColors
                            ? { color: catColors.icon }
                            : { color: "#1e3a5f" }
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${isActive ? "text-white" : "text-foreground"}`}>
                        {cat.name}
                      </p>
                      <p className={`text-xs mt-0.5 ${isActive ? "text-white/70" : "text-muted-foreground"}`}>
                        {cat.entities.length} topics{count > 0 ? ` · ${count} updates this month` : ""}
                      </p>
                      {cat.focus && (
                        <p className={`text-[11px] italic mt-0.5 truncate ${isActive ? "text-white/50" : "text-gray-400"}`} data-testid={`text-category-focus-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}>
                          Focus: {cat.focus}
                        </p>
                      )}
                    </div>
                    {catUrgency && (
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${urgencyDotColors[catUrgency]}`}
                        data-testid={`dot-deadline-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                    )}
                    <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-white/70" : "text-muted-foreground group-hover:translate-x-0.5"}`} />
                  </div>
                  {latestActivityText ? (
                    <div className="pl-12">
                      <p className={`text-[11px] italic truncate ${isActive ? "text-white/60" : "text-gray-400"}`}>
                        {latestActivityText}
                      </p>
                    </div>
                  ) : cat.entities.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pl-12">
                      {cat.entities.slice(0, 4).map((e) => {
                        const typeInfo = topicTypeMap[e.topic_type || "general"] || topicTypeMap.general;
                        return (
                          <span
                            key={e.name}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              isActive
                                ? "bg-white/15 text-white/80"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {typeInfo.icon} {e.name}
                          </span>
                        );
                      })}
                      {cat.entities.length > 4 && (
                        <span className={`text-[10px] px-1.5 py-0.5 ${isActive ? "text-white/60" : "text-muted-foreground"}`}>
                          +{cat.entities.length - 4} more
                        </span>
                      )}
                    </div>
                  ) : null}
                </button>
                <div className="absolute top-2 right-2 invisible group-hover/cat:visible" style={{ zIndex: 10 }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-7 w-7 ${isActive ? "text-white/70 hover:text-white" : "text-muted-foreground"}`}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-category-menu-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameCategoryOldName(cat.name);
                          setRenameCategoryNewName(cat.name);
                          setRenameCategoryOpen(true);
                        }}
                        data-testid={`menu-rename-category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Type className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setEditFocusCategoryName(cat.name);
                          setEditFocusValue(cat.focus || "");
                          setEditFocusOpen(true);
                        }}
                        data-testid={`menu-edit-focus-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Focus
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setDeleteCategoryName(cat.name);
                          setDeleteCategoryOpen(true);
                        }}
                        className="text-red-600 focus:text-red-600"
                        data-testid={`menu-delete-category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
          {showNewCategoryInput ? (
            <div className="flex items-center gap-1.5 px-1 mt-1">
              <Input
                ref={newCategoryInputRef}
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCategory();
                  if (e.key === "Escape") { setShowNewCategoryInput(false); setNewCategoryName(""); }
                }}
                className="h-8 text-sm flex-1"
                data-testid="input-new-category"
                autoFocus
              />
              <button
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                className="text-[#1e3a5f] hover:text-[#1e3a5f]/80 disabled:opacity-40 p-1"
                data-testid="button-confirm-new-category"
              >
                {addCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowNewCategoryInput(true);
                setTimeout(() => newCategoryInputRef.current?.focus(), 100);
              }}
              className="flex items-center gap-1.5 text-slate-500 hover:text-[#1e3a5f] text-[13px] px-1 py-1 mt-1 transition-colors"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
              data-testid="button-new-category"
            >
              <Plus className="w-3.5 h-3.5" />
              New category
            </button>
          )}
        </div>

        <div className="md:col-span-2">
          {activeCategory ? (
            <div className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-foreground">{activeCategory.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{activeCategory.description}</p>
                {activeCategory.focus && (
                  <p className="text-xs italic text-gray-400 mt-1" data-testid="text-active-category-focus">
                    Focus: {activeCategory.focus}
                  </p>
                )}
              </div>

              {justCreatedCategory === activeCategory.name && activeCategory.entities.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2 space-y-3" data-testid="text-category-created-prompt">
                  <p className="text-sm text-emerald-700">
                    Category created. Add your first topic to <span className="font-medium">{activeCategory.name}</span>.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a topic name..."
                      value={topAddTopicName}
                      onChange={(e) => setTopAddTopicName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleTopAddTopic();
                      }}
                      className="flex-1 h-8 text-sm bg-white"
                      data-testid="input-first-topic-name"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white px-4 h-8"
                      disabled={!topAddTopicName.trim() || addEntityMutation.isPending}
                      onClick={handleTopAddTopic}
                      data-testid="button-first-topic-add"
                    >
                      {addEntityMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {activeCategory.entities.length === 0 ? (
                <EmptyCategoryNudge
                  categoryName={activeCategory.name}
                  onAdd={handleNudgeAdd}
                  isPending={addEntityMutation.isPending}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Topics ({activeCategory.entities.length})
                    </p>
                    {!showTopAddTopic && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTopAddTopic(true)}
                        className="text-[#1e3a5f] border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/5 rounded-lg text-sm h-8 px-4"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px" }}
                        data-testid="button-top-add-topic"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add topic
                      </Button>
                    )}
                  </div>

                  {showTopAddTopic && (
                    <div className="border border-border rounded-lg p-3 space-y-3 bg-card" data-testid="inline-top-add-topic">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Topic name"
                          value={topAddTopicName}
                          onChange={(e) => setTopAddTopicName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleTopAddTopic();
                            if (e.key === "Escape") { setShowTopAddTopic(false); setTopAddTopicName(""); setTopAddTopicType("general"); setTopAddTopicWebsiteUrl(""); }
                          }}
                          className="flex-1 h-9 text-sm"
                          data-testid="input-top-add-topic-name"
                          autoFocus
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5" data-testid="pills-top-add-topic-type">
                        {(["competitor", "regulation", "project", "person", "trend", "technology", "event", "general"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => { setTopAddTopicType(t); if (t !== "competitor") setTopAddTopicWebsiteUrl(""); }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                              topAddTopicType === t
                                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                                : "bg-background text-foreground border-border hover:border-[#1e3a5f]/40"
                            }`}
                            data-testid={`pill-top-type-${t}`}
                          >
                            {topicTypeMap[t]?.icon} {topicTypeMap[t]?.displayName || t}
                          </button>
                        ))}
                      </div>
                      {topAddTopicType === "competitor" && (
                        <div>
                          <Input
                            placeholder="Website URL (optional, e.g. https://competitor.com)"
                            value={topAddTopicWebsiteUrl}
                            onChange={(e) => setTopAddTopicWebsiteUrl(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleTopAddTopic();
                            }}
                            className="h-9 text-sm"
                            data-testid="input-top-add-topic-website"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">Providing a URL improves product and geo intelligence gathering</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white px-4 h-8"
                          disabled={!topAddTopicName.trim() || addEntityMutation.isPending}
                          onClick={handleTopAddTopic}
                          data-testid="button-top-add-topic-confirm"
                        >
                          {addEntityMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                          Add
                        </Button>
                        <button
                          type="button"
                          onClick={() => { setShowTopAddTopic(false); setTopAddTopicName(""); setTopAddTopicType("general"); setTopAddTopicWebsiteUrl(""); }}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          data-testid="button-top-add-topic-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {activeCategory.entities.map((entity) => {
                      const count = getCaptureCountForEntity(entity.name);
                      const entityDeadline = getEntityDeadline(entity.name);
                      const pill = entityDeadline ? formatDeadlinePill(entityDeadline.days_until, String(entityDeadline.date)) : null;
                      const topicType = (entity.topic_type || "general").toLowerCase();
                      const iconConfig = topicIconMap[topicType];
                      const catName = effectiveCategory || "";
                      const categoryBasedIcon = !iconConfig
                        ? (catName.toLowerCase().includes("competitor")
                          ? topicIconMap.competitor
                          : catName.toLowerCase().includes("regulation") || catName.toLowerCase().includes("standards")
                            ? topicIconMap.regulation
                            : catName.toLowerCase().includes("industry") || catName.toLowerCase().includes("topic")
                              ? topicIconMap.technology
                              : catName.toLowerCase().includes("threat") || catName.toLowerCase().includes("intelligence")
                                ? topicIconMap.trend
                                : null)
                        : null;
                      const finalIcon = iconConfig || categoryBasedIcon;
                      const TopicIcon = finalIcon?.Icon || Tag;
                      const topicIconColor = finalIcon?.color || "#1e3a5f";

                      const entityCaptures = captures
                        .filter((c) => c.matchedEntity === entity.name)
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                      const latestCapture = entityCaptures[0];
                      const lastUpdateText = latestCapture
                        ? (() => {
                            const d = new Date(latestCapture.createdAt);
                            const now = new Date();
                            const diffMs = now.getTime() - d.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);
                            if (diffMins < 1) return "Last update: just now";
                            if (diffMins < 60) return `Last update: ${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
                            if (diffHours < 24) return `Last update: ${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
                            if (diffDays === 1) return "Last update: yesterday";
                            if (diffDays < 7) return `Last update: ${diffDays} days ago`;
                            return `Last update: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                          })()
                        : "No updates yet";
                      const previewText = latestCapture
                        ? latestCapture.content.length > 70
                          ? latestCapture.content.slice(0, 70).trimEnd() + "…"
                          : latestCapture.content
                        : null;

                      return (
                        <div
                          key={entity.name}
                          onClick={() => navigate(`/topic/${encodeURIComponent(effectiveCategory ?? "")}/${encodeURIComponent(entity?.name ?? "")}`)}
                          className="w-full text-left rounded-lg bg-card border border-border/50 p-4 flex items-center gap-3 hover:border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/[0.03] hover:shadow-sm transition-all group cursor-pointer"
                          data-testid={`button-entity-${(entity?.name ?? "").toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div
                            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${topicIconColor}15` }}
                          >
                            <TopicIcon className="w-4 h-4" style={{ color: topicIconColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground">{entity.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {topicTypeMap[topicType]?.displayName || entityTypeLabels[entity.type] || entity.type}
                              {count > 0 ? ` · ${count} update${count !== 1 ? "s" : ""}` : ""}
                            </p>
                            <p
                              className={`text-[11px] mt-0.5 ${latestCapture ? "text-slate-400" : "text-slate-400 italic"}`}
                              data-testid={`text-last-update-${entity.name.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {lastUpdateText}
                            </p>
                            {previewText && (
                              <p className="text-[13px] italic mt-0.5 truncate" style={{ color: "#6b7280" }}>
                                {previewText}
                              </p>
                            )}
                            {pill && (
                              <span
                                className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1.5 ${pill.className}`}
                                data-testid={`pill-deadline-${entity.name.toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                {pill.label}
                              </span>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                className="invisible group-hover:visible p-1 rounded-md hover:bg-muted transition-colors shrink-0"
                                data-testid={`button-topic-menu-${(entity?.name ?? "").toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenameTopicOldName(entity.name);
                                  setRenameTopicNewName(entity.name);
                                  setRenameTopicOpen(true);
                                }}
                                data-testid={`menu-rename-topic-${(entity?.name ?? "").toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTopicName(entity.name);
                                  setDeleteTopicOpen(true);
                                }}
                                className="text-red-600 focus:text-red-600"
                                data-testid={`menu-delete-topic-${(entity?.name ?? "").toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Network className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Select a category to view its topics.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={renameCategoryOpen} onOpenChange={setRenameCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={renameCategoryNewName}
              onChange={(e) => setRenameCategoryNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameCategoryNewName.trim()) {
                  renameCategoryMutation.mutate({ oldName: renameCategoryOldName, newName: renameCategoryNewName.trim() });
                }
              }}
              placeholder="Category name"
              data-testid="input-rename-category"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameCategoryOpen(false)} data-testid="button-rename-category-cancel">
                Cancel
              </Button>
              <Button
                className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                disabled={!renameCategoryNewName.trim() || renameCategoryMutation.isPending}
                onClick={() => renameCategoryMutation.mutate({ oldName: renameCategoryOldName, newName: renameCategoryNewName.trim() })}
                data-testid="button-rename-category-confirm"
              >
                {renameCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editFocusOpen} onOpenChange={setEditFocusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Focus — {editFocusCategoryName}</DialogTitle>
          </DialogHeader>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            Set your search focus to guide how Signalum searches for intelligence in this category. 
            Keep it clear and concise — vague or overly broad focus instructions may yield inaccurate results.
          </p>
          <div className="space-y-3 py-2">
            <div>
              <Textarea
                value={editFocusValue}
                onChange={(e) => {
                  if (e.target.value.length <= 300) setEditFocusValue(e.target.value);
                }}
                placeholder="What should we pay attention to within this category? e.g. Digital ID policy, UK government procurement"
                className="min-h-[80px] text-sm"
                maxLength={300}
                data-testid="input-edit-category-focus"
              />
              {editFocusValue.length > 0 && editFocusValue.length < 20 && (
                <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                  ⚠ Focus is too short — add more detail for better results
                </p>
              )}
              <p className="text-xs text-muted-foreground text-right mt-1" data-testid="text-focus-char-count">
                {editFocusValue.length}/300
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditFocusOpen(false)} data-testid="button-edit-focus-cancel">
                Cancel
              </Button>
              <Button
                className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                disabled={updateCategoryFocusMutation.isPending}
                onClick={() => updateCategoryFocusMutation.mutate({ categoryName: editFocusCategoryName, focus: editFocusValue.trim() })}
                data-testid="button-edit-focus-confirm"
              >
                {updateCategoryFocusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteCategoryOpen} onOpenChange={setDeleteCategoryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteCategoryName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category, all its topics, and all captured updates associated with them. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-category-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteCategoryMutation.isPending}
              onClick={() => deleteCategoryMutation.mutate(deleteCategoryName)}
              data-testid="button-delete-category-confirm"
            >
              {deleteCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameTopicOpen} onOpenChange={setRenameTopicOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Topic</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={renameTopicNewName}
              onChange={(e) => setRenameTopicNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameTopicNewName.trim()) {
                  renameTopicMutation.mutate({ oldName: renameTopicOldName, newName: renameTopicNewName.trim() });
                }
              }}
              placeholder="Topic name"
              data-testid="input-rename-topic"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTopicOpen(false)} data-testid="button-rename-topic-cancel">
                Cancel
              </Button>
              <Button
                className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                disabled={!renameTopicNewName.trim() || renameTopicMutation.isPending}
                onClick={() => renameTopicMutation.mutate({ oldName: renameTopicOldName, newName: renameTopicNewName.trim() })}
                data-testid="button-rename-topic-confirm"
              >
                {renameTopicMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTopicOpen} onOpenChange={setDeleteTopicOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTopicName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the topic and all captured updates associated with it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-topic-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteTopicMutation.isPending}
              onClick={() => deleteTopicMutation.mutate(deleteTopicName)}
              data-testid="button-delete-topic-confirm"
            >
              {deleteTopicMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const compareStatusConfig: Record<string, { emoji: string; label: string; bgClass: string; textClass: string }> = {
  yes: { emoji: "\u2705", label: "Yes", bgClass: "bg-green-100", textClass: "text-green-800" },
  no: { emoji: "\u274C", label: "No", bgClass: "bg-red-100", textClass: "text-red-800" },
  partial: { emoji: "\u26A0\uFE0F", label: "Partial", bgClass: "bg-amber-100", textClass: "text-amber-800" },
  unknown: { emoji: "\u2753", label: "Unknown", bgClass: "bg-slate-100", textClass: "text-slate-500" },
};

function CompareModal({
  categories,
  open,
  onOpenChange,
}: {
  categories: ExtractedCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: capData } = useQuery<{ capabilities: WorkspaceCapability[] }>({
    queryKey: ["/api/capabilities"],
  });

  const { data: allCompCaps } = useQuery<{ competitorCapabilities: CompetitorCapability[] }>({
    queryKey: ["/api/all-competitor-capabilities"],
  });

  const { data: productData } = useQuery<{ productContext: any }>({
    queryKey: ["/api/product-context"],
  });

  const capabilities = capData?.capabilities || [];
  const competitorCaps = allCompCaps?.competitorCapabilities || [];

  const competitors = categories.flatMap(cat =>
    cat.entities
      .filter(e => (e.topic_type || "general").toLowerCase() === "competitor")
      .map(e => ({ name: e.name, categoryName: cat.name }))
  );

  const myProductName = productData?.productContext?.productName || "My Product";

  const updateMutation = useMutation({
    mutationFn: async ({ entityId, capabilityId, status }: { entityId: string; capabilityId: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/competitor-capabilities/${encodeURIComponent(entityId)}`, {
        capabilityId,
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/all-competitor-capabilities"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getStatus = (entityId: string, capId: string) => {
    const found = competitorCaps.find(cc => cc.entityId === entityId && cc.capabilityId === capId);
    return found?.status || "unknown";
  };

  const handleExportImage = async () => {
    if (!tableRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = "capability-comparison.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast({ title: "Exported", description: "Comparison saved as PNG." });
    } catch (err) {
      toast({ title: "Export failed", description: "Could not export the comparison.", variant: "destructive" });
    }
  };

  if (capabilities.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Capability Comparison</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <p className="text-muted-foreground">No capabilities defined yet. Add capabilities in Settings to compare.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const columns = [
    { id: "__my_product__", name: myProductName, isMyProduct: true },
    ...competitors.map(c => ({ id: c.name, name: c.name, isMyProduct: false })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto p-0">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground" data-testid="text-compare-title">Capability Comparison</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Compare capabilities across your product and competitors.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportImage}
              className="gap-1.5"
              data-testid="button-export-comparison"
            >
              <Download className="w-3.5 h-3.5" />
              Export as image
            </Button>
          </div>

          <div ref={tableRef} className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]" data-testid="table-comparison">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border bg-slate-50 min-w-[180px]">
                    Capability
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className={`text-center text-xs font-medium px-3 py-2 border-b border-border min-w-[120px] ${
                        col.isMyProduct ? "bg-[#1e3a5f] text-white" : "bg-slate-50 text-muted-foreground"
                      }`}
                      data-testid={`header-${col.id}`}
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capabilities.map((cap) => (
                  <tr key={cap.id} className="border-b border-border/50 last:border-0">
                    <td className="text-sm font-medium text-foreground px-3 py-3 bg-white">
                      {cap.name}
                    </td>
                    {columns.map((col) => {
                      const status = getStatus(col.id, cap.id);
                      const cfg = compareStatusConfig[status] || compareStatusConfig.unknown;
                      return (
                        <td key={col.id} className="text-center px-3 py-3 bg-white">
                          <div className="flex justify-center gap-1">
                            {(["yes", "no", "partial", "unknown"] as const).map((s) => {
                              const sCfg = compareStatusConfig[s];
                              const isActive = status === s;
                              return (
                                <button
                                  key={s}
                                  onClick={() => updateMutation.mutate({ entityId: col.id, capabilityId: cap.id, status: s })}
                                  className={`w-7 h-7 rounded-full text-xs flex items-center justify-center transition-all ${
                                    isActive
                                      ? `${sCfg.bgClass} ${sCfg.textClass} ring-1 ring-current/20`
                                      : "bg-transparent text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                                  }`}
                                  title={sCfg.label}
                                  data-testid={`compare-status-${col.id}-${cap.id}-${s}`}
                                >
                                  {sCfg.emoji}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

