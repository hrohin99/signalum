import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  FolderOpen,
  Tag,
  ChevronRight,
  Network,
  Plus,
  Loader2,
  Shield,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { ExtractedCategory, Capture, TopicDate } from "@shared/schema";

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
        Watchloom is searching the web for recent intelligence on your tracked topics. This takes about 30 seconds.
      </p>
    </div>
  );
}

export default function MapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [seedingActive, setSeedingActive] = useState(false);
  const [seedingChecked, setSeedingChecked] = useState(false);

  const { data: wsData, isLoading: wsLoading } = useQuery<{ exists: boolean; workspace?: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace", user?.id],
    enabled: !!user,
  });

  const { data: captures = [], isLoading: capLoading } = useQuery<Capture[]>({
    queryKey: ["/api/captures"],
    enabled: !!user,
  });

  const { data: topicDatesData } = useQuery<{ dates: TopicDateWithDaysUntil[] }>({
    queryKey: ["/api/topic-dates/all"],
    enabled: !!user,
  });

  const allTopicDates = topicDatesData?.dates ?? [];

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

  useEffect(() => {
    if (welcomeStatus && !welcomeStatus.dismissed) {
      setShowWelcome(true);
    }
  }, [welcomeStatus]);

  const checkSeedingStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest("GET", "/api/historical-seeding/status");
      const data = await res.json();
      if (data.running) {
        setSeedingActive(true);
      } else if (seedingActive && !data.running) {
        setSeedingActive(false);
        if (data.totalFindings > 0) {
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
    } catch {
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

  const categories = wsData?.workspace?.categories ?? [];
  const loading = wsLoading || capLoading;

  const effectiveCategory = selectedCategory ?? (categories.length > 0 ? categories[0].name : null);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].name);
    }
  }, [categories, selectedCategory]);

  const activeCategory = categories.find((c) => c.name === effectiveCategory);

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
      {seedingActive && <SeedingBanner />}

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
            const catUrgency = getCategoryUrgency(cat);
            return (
              <button
                key={cat.name}
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
                  {catUrgency && (
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${urgencyDotColors[catUrgency]}`}
                      data-testid={`dot-deadline-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                    />
                  )}
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-white/70" : "text-muted-foreground group-hover:translate-x-0.5"}`} />
                </div>
                {cat.entities.length > 0 && (
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
                )}
              </button>
            );
          })}
        </div>

        <div className="md:col-span-2">
          {activeCategory ? (
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
                      const entityDeadline = getEntityDeadline(entity.name);
                      const pill = entityDeadline ? formatDeadlinePill(entityDeadline.days_until, String(entityDeadline.date)) : null;
                      return (
                        <button
                          key={entity.name}
                          onClick={() => navigate(`/topic/${encodeURIComponent(effectiveCategory!)}/${encodeURIComponent(entity.name)}`)}
                          className="w-full text-left rounded-lg bg-card border border-border/50 p-4 flex items-center gap-3 hover:border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/[0.03] hover:shadow-sm transition-all group"
                          data-testid={`button-entity-${entity.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div className="w-9 h-9 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                            <Tag className="w-4 h-4 text-[#1e3a5f]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground">{entity.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {topicTypeMap[(entity.topic_type || "general").toLowerCase()]?.displayName || entityTypeLabels[entity.type] || entity.type}
                              {count > 0 ? ` · ${count} update${count !== 1 ? "s" : ""}` : ""}
                            </p>
                            {pill && (
                              <span
                                className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1.5 ${pill.className}`}
                                data-testid={`pill-deadline-${entity.name.toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                {pill.label}
                              </span>
                            )}
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

