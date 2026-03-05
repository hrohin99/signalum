import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  FolderOpen,
  Tag,
  ChevronRight,
  Network,
  FileText,
  PenLine,
  Mic,
  Link2,
  ArrowLeft,
  Plus,
  Loader2,
  Calendar,
  BarChart3,
  Activity,
  Sparkles,
  Shield,
  Check,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ExtractedCategory, Capture } from "@shared/schema";

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

const captureTypeIcons: Record<string, typeof PenLine> = {
  text: PenLine,
  voice: Mic,
  url: Link2,
  document: FileText,
};

function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="welcome-modal-overlay">
      <div className="absolute inset-0 bg-black/40" onClick={onDismiss} />
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-[560px] mx-4"
        style={{ padding: "40px" }}
        data-testid="welcome-modal"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-10 h-10 rounded-md bg-[#1e3a5f] flex items-center justify-center mb-2">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Watchloom</span>
        </div>

        <h2 className="text-xl font-semibold text-[#1e3a5f] text-center mb-6" data-testid="text-welcome-headline">
          Your workspace is ready. Here is what to do next.
        </h2>

        <div className="space-y-5 mb-8">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0 text-white text-sm font-semibold">
              1
            </div>
            <div>
              <p className="font-semibold text-[#1e3a5f] mb-1">Add what you want to track</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                You can see your categories on the left. Click any category with 0 topics and add the specific companies, topics, or names you want Watchloom to follow.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0 text-white text-sm font-semibold">
              2
            </div>
            <div>
              <p className="font-semibold text-[#1e3a5f] mb-1">Drop in your first piece of intelligence</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Click Capture in the sidebar and paste an article, type a note, or drop in a URL about anything relevant to your work. Our AI will file it in the right place automatically.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0 text-white text-sm font-semibold">
              3
            </div>
            <div>
              <p className="font-semibold text-[#1e3a5f] mb-1">Check back tomorrow morning</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Watchloom's AI agents are now working in the background. Your first briefing will be waiting for you tomorrow under Daily Brief.
              </p>
            </div>
          </div>
        </div>

        <Button
          className="w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white h-11"
          onClick={onDismiss}
          data-testid="button-dismiss-welcome"
        >
          Got it, take me to my workspace
        </Button>
      </div>
    </div>
  );
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
        Name a few specific ones and Watchloom will start tracking them for you.
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
          Added. Watchloom is now tracking this.
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
          Added. Watchloom is now tracking this.
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  const { data: wsData, isLoading: wsLoading } = useQuery<{ exists: boolean; workspace?: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace", user?.id],
    enabled: !!user,
  });

  const { data: captures = [], isLoading: capLoading } = useQuery<Capture[]>({
    queryKey: ["/api/captures"],
    enabled: !!user,
  });

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

  useEffect(() => {
    if (welcomeStatus && !welcomeStatus.dismissed) {
      setShowWelcome(true);
    }
  }, [welcomeStatus]);

  const categories = wsData?.workspace?.categories ?? [];
  const loading = wsLoading || capLoading;

  const effectiveCategory = selectedCategory ?? (categories.length > 0 ? categories[0].name : null);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].name);
    }
  }, [categories, selectedCategory]);

  const activeCategory = categories.find((c) => c.name === effectiveCategory);
  const activeEntity = activeCategory?.entities.find((e) => e.name === selectedEntity);
  const entityCaptures = captures.filter((c) => c.matchedEntity === selectedEntity);

  const { data: summaryData, isLoading: summaryLoading, isError: summaryError } = useQuery<{ summary: string }>({
    queryKey: ["/api/entity-summary", selectedEntity, effectiveCategory],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/entity-summary", {
        entityName: selectedEntity,
        categoryName: effectiveCategory,
      });
      return res.json();
    },
    enabled: !!selectedEntity && !!effectiveCategory && !!activeEntity,
    retry: false,
  });

  const addEntityMutation = useMutation({
    mutationFn: async (data: { categoryName: string; entityName: string; entityType: string }) => {
      const res = await apiRequest("POST", "/api/add-entity", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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

  const handleDismissWelcome = () => {
    dismissWelcomeMutation.mutate();
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="md:col-span-2 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">My Workspace</h1>
          <p className="text-muted-foreground mt-1">Your tracked categories and topics.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Network className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-1">No workspace data yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Complete the onboarding to set up your categories and topics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {showWelcome && <WelcomeModal onDismiss={handleDismissWelcome} />}

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">My Workspace</h1>
        <p className="text-muted-foreground mt-1">
          {categories.length} categories, {categories.reduce((a, c) => a + c.entities.length, 0)} topics, {captures.length} updates
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 px-1">Categories</p>
          {categories.map((cat) => {
            const isActive = effectiveCategory === cat.name;
            const count = getCaptureCountForCategory(cat.name);
            return (
              <button
                key={cat.name}
                onClick={() => {
                  setSelectedCategory(cat.name);
                  setSelectedEntity(null);
                }}
                className={`w-full text-left rounded-lg p-4 transition-all flex flex-col gap-2 group border ${
                  isActive
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md"
                    : "bg-card border-border/50 hover:border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/[0.03] hover:shadow-sm"
                }`}
                data-testid={`button-category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                    isActive ? "bg-white/20" : "bg-[#1e3a5f]/10"
                  }`}>
                    <FolderOpen className={`w-4 h-4 ${isActive ? "text-white" : "text-[#1e3a5f]"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm truncate ${isActive ? "text-white" : "text-foreground"}`}>
                      {cat.name}
                    </p>
                    <p className={`text-xs mt-0.5 ${isActive ? "text-white/70" : "text-muted-foreground"}`}>
                      {cat.entities.length} topics{count > 0 ? ` · ${count} updates` : ""}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-white/70" : "text-muted-foreground group-hover:translate-x-0.5"}`} />
                </div>
                {cat.entities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-12">
                    {cat.entities.slice(0, 4).map((e) => (
                      <span
                        key={e.name}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? "bg-white/15 text-white/80"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {e.name}
                      </span>
                    ))}
                    {cat.entities.length > 4 && (
                      <span className={`text-[10px] px-1.5 py-0.5 ${isActive ? "text-white/60" : "text-muted-foreground"}`}>
                        +{cat.entities.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="md:col-span-2">
          {selectedEntity && activeEntity ? (
            <EntityDetail
              entity={activeEntity}
              categoryName={effectiveCategory!}
              captures={entityCaptures}
              summary={summaryData?.summary}
              summaryLoading={summaryLoading}
              summaryError={summaryError}
              onBack={() => setSelectedEntity(null)}
            />
          ) : activeCategory ? (
            <div className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-foreground">{activeCategory.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{activeCategory.description}</p>
              </div>

              {activeCategory.entities.length === 0 ? (
                <EmptyCategoryNudge
                  categoryName={activeCategory.name}
                  onAdd={handleNudgeAdd}
                  isPending={addEntityMutation.isPending}
                />
              ) : (
                <>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                    Topics ({activeCategory.entities.length})
                  </p>

                  <div className="space-y-2">
                    {activeCategory.entities.map((entity) => {
                      const count = getCaptureCountForEntity(entity.name);
                      return (
                        <button
                          key={entity.name}
                          onClick={() => setSelectedEntity(entity.name)}
                          className="w-full text-left rounded-lg bg-card border border-border/50 p-4 flex items-center gap-3 hover:border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/[0.03] hover:shadow-sm transition-all group"
                          data-testid={`button-entity-${entity.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div className="w-9 h-9 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                            <Tag className="w-4 h-4 text-[#1e3a5f]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground">{entity.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {entityTypeLabels[entity.type] || entity.type}
                              {count > 0 ? ` · ${count} update${count !== 1 ? "s" : ""}` : ""}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      );
                    })}
                  </div>

                  <InlineAddTopic
                    onAdd={handleNudgeAdd}
                    isPending={addEntityMutation.isPending}
                  />
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
    </div>
  );
}

function EntityDetail({
  entity,
  categoryName,
  captures,
  summary,
  summaryLoading,
  summaryError,
  onBack,
}: {
  entity: { name: string; type: string };
  categoryName: string;
  captures: Capture[];
  summary?: string;
  summaryLoading: boolean;
  summaryError: boolean;
  onBack: () => void;
}) {
  const lastDate = captures.length > 0 ? new Date(captures[0].createdAt) : null;
  const status = captures.length > 0 ? "Active" : "New";
  const [inlineText, setInlineText] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const inlineMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/captures", {
        type: "text",
        content,
        matchedEntity: entity.name,
        matchedCategory: categoryName,
        matchReason: "Direct update from topic view",
      });
      return res.json();
    },
    onSuccess: () => {
      setInlineText("");
      setShowConfirmation(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setShowConfirmation(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entity-summary", entity.name, categoryName] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (inlineMutation.isPending) return;
    const trimmed = inlineText.trim();
    if (!trimmed) return;
    inlineMutation.mutate(trimmed);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          data-testid="button-back-to-topics"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground" data-testid="text-entity-name">{entity.name}</h2>
            <Badge variant="secondary" className="text-xs">
              {entityTypeLabels[entity.type] || entity.type}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            in {categoryName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 rounded-lg border border-border/50" data-testid="entity-stats-bar">
        <div className="flex items-center gap-1.5 text-sm">
          <BarChart3 className="w-3.5 h-3.5 text-[#1e3a5f]" />
          <span className="font-medium text-foreground">{captures.length}</span>
          <span className="text-muted-foreground">update{captures.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5 text-sm">
          <Calendar className="w-3.5 h-3.5 text-[#1e3a5f]" />
          <span className="text-muted-foreground">
            {lastDate
              ? lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "No data"}
          </span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5 text-sm">
          <Activity className="w-3.5 h-3.5 text-[#1e3a5f]" />
          <span className={`font-medium ${status === "Active" ? "text-emerald-600" : "text-muted-foreground"}`}>{status}</span>
        </div>
      </div>

      <div className="rounded-lg border border-[#1e3a5f]/15 bg-[#1e3a5f]/[0.02] p-4" data-testid="entity-ai-summary">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-xs font-medium uppercase tracking-wider text-[#1e3a5f]">AI Summary</span>
        </div>
        {summaryLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : summaryError ? (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Unable to generate summary at this time. Try again later.
          </p>
        ) : (
          <p className="text-sm text-foreground leading-relaxed">{summary || `No updates available for ${entity.name} yet.`}</p>
        )}
      </div>

      {captures.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
            Updates ({captures.length})
          </p>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3 pr-3">
              {captures.map((cap) => {
                const Icon = captureTypeIcons[cap.type] || FileText;
                return (
                  <Card key={cap.id} className="border-border/60" data-testid={`card-capture-item-${cap.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0 mt-1">
                          <Icon className="w-4 h-4 text-[#1e3a5f]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {cap.content}
                          </p>
                          {cap.matchReason && (
                            <p className="text-xs text-muted-foreground mt-2.5 italic leading-relaxed">
                              {cap.matchReason}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <Badge variant="outline" className="text-[10px] mb-1">{cap.type}</Badge>
                          <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(cap.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">
            No updates captured for this topic yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the Capture page to add articles, notes, or documents about {entity.name}.
          </p>
        </div>
      )}

      <div className="space-y-2" data-testid="inline-capture-form">
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50 resize-none"
            placeholder={`Add an update to ${entity.name}...`}
            value={inlineText}
            onChange={(e) => setInlineText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
            disabled={inlineMutation.isPending}
            data-testid="input-inline-capture"
          />
          <Button
            onClick={handleSubmit}
            disabled={!inlineText.trim() || inlineMutation.isPending}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white h-10 px-4"
            data-testid="button-inline-capture-submit"
          >
            {inlineMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        {showConfirmation && (
          <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5" data-testid="text-update-confirmation">
            <Check className="w-3.5 h-3.5" />
            Update added.
          </p>
        )}
      </div>
    </div>
  );
}
