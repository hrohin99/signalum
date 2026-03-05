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
  ArrowLeft,
  Sparkles,
  Pencil,
  ChevronDown,
  Send,
  Check,
  Loader2,
  PenLine,
  Mic,
  Link2,
  FileText,
  Tag,
  Calendar,
  BarChart3,
  RefreshCw,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { ExtractedCategory, ExtractedEntity, Capture, TopicTypeConfig } from "@shared/schema";

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

const priorityConfig: Record<string, { label: string; dotClass: string }> = {
  high: { label: "High", dotClass: "bg-red-500" },
  medium: { label: "Medium", dotClass: "bg-amber-500" },
  low: { label: "Low", dotClass: "bg-gray-400" },
  watch: { label: "Watch", dotClass: "bg-blue-500" },
};

const captureTypeIcons: Record<string, typeof PenLine> = {
  text: PenLine,
  voice: Mic,
  url: Link2,
  document: FileText,
};

export default function TopicViewPage({ params }: { params: { category: string; entity: string } }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const categoryName = decodeURIComponent(params.category);
  const entityName = decodeURIComponent(params.entity);

  const { data: wsData, isLoading: wsLoading } = useQuery<{ exists: boolean; workspace?: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace", user?.id],
    enabled: !!user,
  });

  const { data: captures = [], isLoading: capLoading } = useQuery<Capture[]>({
    queryKey: ["/api/captures"],
    enabled: !!user,
  });

  const { data: topicTypesData } = useQuery<{ topicTypes: TopicTypeConfig[] }>({
    queryKey: ["/api/topic-types"],
    enabled: !!user,
  });

  const categories = wsData?.workspace?.categories ?? [];
  const category = categories.find((c) => c.name === categoryName);
  const entity = category?.entities.find((e) => e.name === entityName);
  const entityCaptures = captures.filter((c) => c.matchedEntity === entityName);
  const allTopics = categories.flatMap((c) => c.entities.map((e) => ({ ...e, categoryName: c.name })));

  const widgetConfig = topicTypesData?.topicTypes?.find(
    (t) => t.typeKey === (entity?.topic_type || "general")
  )?.widgetConfig as { widgets: string[] } | undefined;

  const loading = wsLoading || capLoading;

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!entity || !category) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/")} data-testid="button-back-not-found">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to My Workspace
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground">Topic not found.</p>
        </div>
      </div>
    );
  }

  return (
    <TopicViewContent
      entity={entity}
      categoryName={categoryName}
      captures={entityCaptures}
      allCaptures={captures}
      allTopics={allTopics}
      categories={categories}
      widgetConfig={widgetConfig}
      onBack={() => navigate("/")}
    />
  );
}

function TopicViewContent({
  entity,
  categoryName,
  captures,
  allCaptures,
  allTopics,
  categories,
  widgetConfig,
  onBack,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  captures: Capture[];
  allCaptures: Capture[];
  allTopics: (ExtractedEntity & { categoryName: string })[];
  categories: ExtractedCategory[];
  widgetConfig?: { widgets: string[] };
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const currentTopicType = entity.topic_type || "general";
  const currentPriority = entity.priority || "medium";
  const typeInfo = topicTypeMap[currentTopicType] || topicTypeMap.general;
  const priInfo = priorityConfig[currentPriority] || priorityConfig.medium;

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node)) {
        setShowPriorityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateEntityMutation = useMutation({
    mutationFn: async (data: { topic_type?: string; priority?: string }) => {
      const res = await apiRequest("PATCH", "/api/entity", {
        categoryName,
        entityName: entity.name,
        ...data,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      if (variables.topic_type) toast({ title: "Topic type updated." });
      if (variables.priority) toast({ title: "Priority updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <TopBar
        entity={entity}
        categoryName={categoryName}
        typeInfo={typeInfo}
        priInfo={priInfo}
        currentTopicType={currentTopicType}
        currentPriority={currentPriority}
        showTypeDropdown={showTypeDropdown}
        setShowTypeDropdown={setShowTypeDropdown}
        showPriorityDropdown={showPriorityDropdown}
        setShowPriorityDropdown={setShowPriorityDropdown}
        typeDropdownRef={typeDropdownRef}
        priorityDropdownRef={priorityDropdownRef}
        updateEntityMutation={updateEntityMutation}
        onBack={onBack}
      />

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        <div className="lg:w-[65%] space-y-6">
          <AISummarySection entity={entity} categoryName={categoryName} />
          <WidgetsSection
            entity={entity}
            categoryName={categoryName}
            captures={captures}
            widgetConfig={widgetConfig}
            allCaptures={allCaptures}
          />
        </div>

        <div className="lg:w-[35%] space-y-6">
          <TopicDetailsCard
            entity={entity}
            categoryName={categoryName}
            captures={captures}
            allTopics={allTopics}
            categories={categories}
          />
          <InlineCaptureCard entity={entity} categoryName={categoryName} />
          <AIInsightsCard entity={entity} categoryName={categoryName} captures={captures} />
        </div>
      </div>
    </div>
  );
}

function TopBar({
  entity,
  categoryName,
  typeInfo,
  priInfo,
  currentTopicType,
  currentPriority,
  showTypeDropdown,
  setShowTypeDropdown,
  showPriorityDropdown,
  setShowPriorityDropdown,
  typeDropdownRef,
  priorityDropdownRef,
  updateEntityMutation,
  onBack,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  typeInfo: { icon: string; displayName: string };
  priInfo: { label: string; dotClass: string };
  currentTopicType: string;
  currentPriority: string;
  showTypeDropdown: boolean;
  setShowTypeDropdown: (v: boolean) => void;
  showPriorityDropdown: boolean;
  setShowPriorityDropdown: (v: boolean) => void;
  typeDropdownRef: React.RefObject<HTMLDivElement>;
  priorityDropdownRef: React.RefObject<HTMLDivElement>;
  updateEntityMutation: any;
  onBack: () => void;
}) {
  const [, navigate] = useLocation();

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          data-testid="button-back-to-workspace"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <h1 className="text-xl font-bold text-[#1e3a5f]" data-testid="text-topic-name">
          {entity.name}
        </h1>

        <div className="relative" ref={typeDropdownRef}>
          <button
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] text-xs font-medium hover:bg-[#1e3a5f]/20 transition-colors"
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            data-testid="button-edit-topic-type"
          >
            <span>{typeInfo.icon}</span>
            <span>{typeInfo.displayName}</span>
            <Pencil className="w-3 h-3 ml-0.5 opacity-60" />
          </button>
          {showTypeDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-50 py-1 min-w-[200px] max-h-[280px] overflow-y-auto" data-testid="dropdown-topic-type">
              {Object.entries(topicTypeMap).map(([key, val]) => (
                <button
                  key={key}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 ${key === currentTopicType ? "bg-muted font-medium" : ""}`}
                  onClick={() => {
                    if (key !== currentTopicType) updateEntityMutation.mutate({ topic_type: key });
                    setShowTypeDropdown(false);
                  }}
                  data-testid={`option-type-${key}`}
                >
                  <span>{val.icon}</span>
                  <span>{val.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={priorityDropdownRef}>
          <button
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-xs font-medium hover:bg-muted transition-colors"
            onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
            data-testid="button-edit-priority"
          >
            <span className={`w-2 h-2 rounded-full ${priInfo.dotClass}`} />
            <span className="text-foreground">{priInfo.label}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {showPriorityDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-50 py-1 min-w-[140px]" data-testid="dropdown-priority">
              {Object.entries(priorityConfig).map(([key, val]) => (
                <button
                  key={key}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 ${key === currentPriority ? "bg-muted font-medium" : ""}`}
                  onClick={() => {
                    if (key !== currentPriority) updateEntityMutation.mutate({ priority: key });
                    setShowPriorityDropdown(false);
                  }}
                  data-testid={`option-priority-${key}`}
                >
                  <span className={`w-2 h-2 rounded-full ${val.dotClass}`} />
                  <span>{val.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-sm text-slate-500" data-testid="text-category-label">
          in {categoryName}
        </span>
      </div>

      <Button
        className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
        onClick={() => navigate("/capture")}
        data-testid="button-add-update"
      >
        Add Update
      </Button>
    </div>
  );
}

function AISummarySection({ entity, categoryName }: { entity: ExtractedEntity; categoryName: string }) {
  const { data: summaryData, isLoading, isError, dataUpdatedAt } = useQuery<{ summary: string }>({
    queryKey: ["/api/entity-summary", entity.name, categoryName],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/entity-summary", {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    retry: false,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/entity-summary", {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/entity-summary", entity.name, categoryName], data);
    },
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <Card className="border-[#1e3a5f]/15 bg-[#1e3a5f]/[0.02]" data-testid="section-ai-summary">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-[#1e3a5f]">AI Summary</span>
        </div>
        {isLoading || regenerateMutation.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Unable to generate summary at this time. Try again later.
          </p>
        ) : (
          <p className="text-[15px] text-foreground leading-relaxed" data-testid="text-ai-summary">
            {summaryData?.summary || `No updates available for ${entity.name} yet.`}
          </p>
        )}
        <div className="flex items-center gap-4 mt-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400" data-testid="text-summary-timestamp">
              Last updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            className="text-xs text-[#1e3a5f] hover:underline font-medium"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            data-testid="button-regenerate-summary"
          >
            <RefreshCw className={`w-3 h-3 inline mr-1 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
            Regenerate
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function WidgetsSection({
  entity,
  categoryName,
  captures,
  widgetConfig,
  allCaptures,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  captures: Capture[];
  widgetConfig?: { widgets: string[] };
  allCaptures: Capture[];
}) {
  const widgets = widgetConfig?.widgets ?? [];
  const builtWidgets = ["battlecard", "quick_stats", "updates_feed"];

  const nonFeedWidgets = widgets.filter((w) => w !== "updates_feed");
  const hasUpdatesFeed = widgets.includes("updates_feed") || true;

  return (
    <div className="space-y-4" data-testid="section-widgets">
      {nonFeedWidgets.map((widgetName) => {
        if (builtWidgets.includes(widgetName)) {
          if (widgetName === "battlecard") {
            return <BattlecardWidget key={widgetName} entity={entity} categoryName={categoryName} captures={captures} />;
          }
          if (widgetName === "quick_stats") {
            return <QuickStatsWidget key={widgetName} entity={entity} captures={captures} allCaptures={allCaptures} />;
          }
        }
        return (
          <Card key={widgetName} className="bg-gray-50 border-gray-200" data-testid={`widget-placeholder-${widgetName}`}>
            <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[100px]">
              <p className="font-medium text-foreground capitalize">{widgetName.replace(/_/g, " ")}</p>
              <p className="text-xs text-slate-400 mt-1">Coming soon</p>
            </CardContent>
          </Card>
        );
      })}

      {hasUpdatesFeed && (
        <UpdatesFeedWidget entity={entity} captures={captures} />
      )}
    </div>
  );
}

function BattlecardWidget({
  entity,
  categoryName,
  captures,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  captures: Capture[];
}) {
  return (
    <Card data-testid="widget-battlecard">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎯</span>
          <span className="text-sm font-semibold text-[#1e3a5f]">Battlecard</span>
        </div>
        {captures.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add updates about {entity.name} to build a competitive battlecard.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-700 mb-1">Strengths</p>
                <p className="text-sm text-emerald-900">Analyze updates to identify strengths.</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Weaknesses</p>
                <p className="text-sm text-red-900">Analyze updates to identify weaknesses.</p>
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">Recent Activity</p>
              <p className="text-sm text-blue-900">
                {captures.length} update{captures.length !== 1 ? "s" : ""} captured
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickStatsWidget({
  entity,
  captures,
  allCaptures,
}: {
  entity: ExtractedEntity;
  captures: Capture[];
  allCaptures: Capture[];
}) {
  const lastDate = captures.length > 0 ? new Date(captures[0].createdAt) : null;
  const typeCounts = captures.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card data-testid="widget-quick-stats">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-[#1e3a5f]">Quick Stats</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-[#1e3a5f]">{captures.length}</p>
            <p className="text-xs text-slate-500">Total updates</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1e3a5f]">
              {Object.keys(typeCounts).length}
            </p>
            <p className="text-xs text-slate-500">Source types</p>
          </div>
          <div>
            <p className="text-sm font-medium text-[#1e3a5f]">
              {lastDate
                ? lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </p>
            <p className="text-xs text-slate-500">Last update</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UpdatesFeedWidget({
  entity,
  captures,
}: {
  entity: ExtractedEntity;
  captures: Capture[];
}) {
  return (
    <div data-testid="widget-updates-feed">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 px-1">
        Updates ({captures.length})
      </p>
      {captures.length > 0 ? (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-3 pr-2">
            {captures.map((cap) => {
              const Icon = captureTypeIcons[cap.type] || FileText;
              return (
                <Card key={cap.id} className="border-border/60" data-testid={`card-update-${cap.id}`}>
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
                          <p className="text-xs text-muted-foreground mt-2 italic">
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
      ) : (
        <Card className="border-dashed border-border">
          <CardContent className="p-8 text-center">
            <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-1">No updates captured yet.</p>
            <p className="text-xs text-muted-foreground">
              Use Capture or the inline form to add updates about {entity.name}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TopicDetailsCard({
  entity,
  categoryName,
  captures,
  allTopics,
  categories,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  captures: Capture[];
  allTopics: (ExtractedEntity & { categoryName: string })[];
  categories: ExtractedCategory[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showLinkDropdown, setShowLinkDropdown] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const linkDropdownRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const currentTopicType = entity.topic_type || "general";
  const typeInfo = topicTypeMap[currentTopicType] || topicTypeMap.general;
  const currentPriority = entity.priority || "medium";
  const priInfo = priorityConfig[currentPriority] || priorityConfig.medium;

  const relatedTopicIds = entity.related_topic_ids || [];
  const relatedTopics = allTopics.filter((t) => relatedTopicIds.includes(t.name));

  const linkableTopics = allTopics.filter(
    (t) => t.name !== entity.name && !relatedTopicIds.includes(t.name)
  );
  const filteredLinkable = linkSearch
    ? linkableTopics.filter((t) => t.name.toLowerCase().includes(linkSearch.toLowerCase()))
    : linkableTopics;

  const linkMutation = useMutation({
    mutationFn: async (linkedEntityName: string) => {
      const res = await apiRequest("POST", "/api/link-topic", {
        categoryName,
        entityName: entity.name,
        linkedEntityName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      setShowLinkDropdown(false);
      setLinkSearch("");
      toast({ title: "Topic linked." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (linkDropdownRef.current && !linkDropdownRef.current.contains(e.target as Node)) {
        setShowLinkDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createdDate = captures.length > 0
    ? new Date(captures[captures.length - 1].createdAt)
    : new Date();

  return (
    <Card data-testid="card-topic-details">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-[#1e3a5f] mb-4">Topic Details</h3>
        <div className="space-y-3">
          <DetailRow label="Name" value={entity.name} testId="detail-name" />
          <DetailRow
            label="Type"
            value={
              <span className="inline-flex items-center gap-1">
                <span>{typeInfo.icon}</span>
                <span>{typeInfo.displayName}</span>
              </span>
            }
            testId="detail-type"
          />
          <DetailRow
            label="Priority"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${priInfo.dotClass}`} />
                <span>{priInfo.label}</span>
              </span>
            }
            testId="detail-priority"
          />
          <DetailRow label="Category" value={categoryName} testId="detail-category" />
          <DetailRow
            label="Date created"
            value={createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            testId="detail-created"
          />
          <DetailRow
            label="Updates"
            value={`${captures.length}`}
            testId="detail-updates"
          />

          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-slate-500 mb-2">Related topics</p>
            <div className="flex flex-wrap gap-1.5">
              {relatedTopics.length > 0 ? (
                relatedTopics.map((rt) => {
                  const rtType = topicTypeMap[rt.topic_type || "general"] || topicTypeMap.general;
                  return (
                    <button
                      key={rt.name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] text-xs font-medium hover:bg-[#1e3a5f]/20 transition-colors"
                      onClick={() => navigate(`/topic/${encodeURIComponent(rt.categoryName)}/${encodeURIComponent(rt.name)}`)}
                      data-testid={`link-related-topic-${rt.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span>{rtType.icon}</span>
                      {rt.name}
                    </button>
                  );
                })
              ) : (
                <span className="text-xs text-slate-400">None yet</span>
              )}
            </div>

            <div className="relative mt-2" ref={linkDropdownRef}>
              <button
                className="inline-flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline font-medium"
                onClick={() => setShowLinkDropdown(!showLinkDropdown)}
                data-testid="button-link-topic"
              >
                <Plus className="w-3 h-3" />
                Link a topic
              </button>
              {showLinkDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-50 w-64 max-h-[240px] overflow-hidden" data-testid="dropdown-link-topic">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-8 pl-7 text-sm"
                        placeholder="Search topics..."
                        value={linkSearch}
                        onChange={(e) => setLinkSearch(e.target.value)}
                        data-testid="input-link-search"
                      />
                    </div>
                  </div>
                  <ScrollArea className="max-h-[180px]">
                    <div className="py-1">
                      {filteredLinkable.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">No topics found.</p>
                      ) : (
                        filteredLinkable.map((t) => {
                          const tType = topicTypeMap[t.topic_type || "general"] || topicTypeMap.general;
                          return (
                            <button
                              key={`${t.categoryName}-${t.name}`}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
                              onClick={() => linkMutation.mutate(t.name)}
                              data-testid={`option-link-${t.name.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              <span>{tType.icon}</span>
                              <span className="truncate">{t.name}</span>
                              <span className="text-[10px] text-slate-400 ml-auto">{t.categoryName}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | React.ReactNode;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function InlineCaptureCard({
  entity,
  categoryName,
}: {
  entity: ExtractedEntity;
  categoryName: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const submitMutation = useMutation({
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
      setText("");
      setShowConfirmation(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setShowConfirmation(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entity-summary", entity.name, categoryName] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-insights", entity.name, categoryName] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (submitMutation.isPending) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    submitMutation.mutate(trimmed);
  };

  return (
    <Card data-testid="card-inline-capture">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-[#1e3a5f] mb-3">Quick Capture</h3>
        <textarea
          className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50 resize-none"
          placeholder={`Add an update to ${entity.name}...`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
          disabled={submitMutation.isPending}
          data-testid="input-topic-capture"
        />
        <div className="flex items-center justify-between mt-2">
          <div>
            {showConfirmation && (
              <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5" data-testid="text-capture-confirmation">
                <Check className="w-3.5 h-3.5" />
                Update added.
              </p>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!text.trim() || submitMutation.isPending}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
            data-testid="button-topic-capture-submit"
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AIInsightsCard({
  entity,
  categoryName,
  captures,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  captures: Capture[];
}) {
  const { data: insightsData, isLoading } = useQuery<{ insights: string[] | null }>({
    queryKey: ["/api/ai-insights", entity.name, categoryName],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/ai-insights", {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    enabled: captures.length > 0,
    retry: false,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-insights", {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/ai-insights", entity.name, categoryName], data);
    },
  });

  const insights = insightsData?.insights;
  const hasUpdates = captures.length > 0;

  return (
    <Card data-testid="card-ai-insights">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-[#1e3a5f]">AI Insights</span>
        </div>

        {!hasUpdates ? (
          <p className="text-sm text-slate-400 leading-relaxed" data-testid="text-insights-empty">
            Add some updates and Watchloom will generate insights here.
          </p>
        ) : isLoading || regenerateMutation.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : insights && insights.length > 0 ? (
          <>
            <ul className="space-y-2" data-testid="list-insights">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                  <span className="text-[#1e3a5f] mt-1 shrink-0">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
            <button
              className="text-xs text-[#1e3a5f] hover:underline font-medium mt-3 inline-flex items-center gap-1"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              data-testid="button-regenerate-insights"
            >
              <RefreshCw className={`w-3 h-3 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
              Regenerate
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to generate insights right now.</p>
        )}
      </CardContent>
    </Card>
  );
}
