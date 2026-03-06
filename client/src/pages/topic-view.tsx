import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  AlertTriangle,
  Scissors,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Trash2,
  Globe,
  ThumbsDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { ExtractedCategory, ExtractedEntity, Capture, TopicTypeConfig, Battlecard, TopicDate } from "@shared/schema";

function detectMultipleEntities(name: string): string[] | null {
  if (!name.includes(",")) return null;
  const parts = name.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const looksLikeSuffix = parts.length === 2 && /^(inc|llc|ltd|co|corp|plc|gmbh|sa|ag|jr|sr|ii|iii)\.?$/i.test(parts[1]);
  if (looksLikeSuffix) return null;
  return parts;
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
  web_search: Globe,
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

  const entityTopicType = (entity?.topic_type || "general").toLowerCase();
  const apiWidgetConfig = topicTypesData?.topicTypes?.find(
    (t) => t.typeKey === entityTopicType
  )?.widgetConfig as { widgets: string[] } | undefined;

  const fallbackWidgetConfigs: Record<string, { widgets: string[] }> = {
    competitor: { widgets: ["battlecard", "quick_stats", "updates_feed"] },
    general: { widgets: ["updates_feed"] },
  };

  const widgetConfig = apiWidgetConfig || fallbackWidgetConfigs[entityTopicType] || fallbackWidgetConfigs.general;

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
  widgetConfig: { widgets: string[] };
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const currentTopicType = (entity.topic_type || "general").toLowerCase();
  const currentPriority = entity.priority || "medium";
  const typeInfo = topicTypeMap[currentTopicType] || topicTypeMap.general;
  const priInfo = priorityConfig[currentPriority] || priorityConfig.medium;

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAspectModal, setShowAspectModal] = useState(false);
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

      {detectMultipleEntities(entity.name) && (
        <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200" data-testid="banner-multiple-entities">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            This topic appears to contain multiple entries. Consider splitting them into individual topics for better tracking.
          </p>
        </div>
      )}

      {((entity.disambiguation_context && !entity.disambiguation_confirmed) || entity.needs_aspect_review) && (
        <DisambiguationBanner
          entity={entity}
          categoryName={categoryName}
          onChangeRequest={() => setShowAspectModal(true)}
        />
      )}

      {!entity.disambiguation_confirmed && !entity.disambiguation_context && !entity.needs_aspect_review && (
        <DisambiguationCard
          entity={entity}
          categoryName={categoryName}
        />
      )}

      <AspectSelectionModal
        open={showAspectModal}
        onOpenChange={setShowAspectModal}
        entityName={entity.name}
        categoryName={categoryName}
      />

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        <div className="lg:w-[65%] space-y-6">
          <AISummarySection entity={entity} categoryName={categoryName} onOpenAspectModal={() => setShowAspectModal(true)} />
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
          <DatesAndDeadlinesCard entity={entity} categoryName={categoryName} />
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

function AISummarySection({ entity, categoryName, onOpenAspectModal }: { entity: ExtractedEntity; categoryName: string; onOpenAspectModal: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [thumbsDownOpen, setThumbsDownOpen] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

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

  const { data: wsContextData } = useQuery<{ workspaceContext: { primaryDomain?: string } | null }>({
    queryKey: ["/api/workspace-context"],
    enabled: !!user,
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

  const feedbackMutation = useMutation({
    mutationFn: async (feedback: string) => {
      await apiRequest("POST", "/api/entity/confirm-disambiguation", {
        entityName: entity.name,
        categoryName,
        disambiguation_context: feedback,
      });
      const res = await apiRequest("POST", "/api/entity-summary", {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/entity-summary", entity.name, categoryName], data);
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      toast({
        title: "Summary updated.",
        className: "bg-green-50 border-green-200 text-green-800",
      });
      setThumbsDownOpen(false);
      setShowFeedbackInput(false);
      setFeedbackText("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update summary",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const wsContext = wsContextData?.workspaceContext;
  const hasWorkspaceContext = !!(wsContext && wsContext.primaryDomain);

  let confidenceState: 1 | 2 | 3 = 3;
  if (entity.disambiguation_confirmed && hasWorkspaceContext) {
    confidenceState = 1;
  } else if (entity.disambiguation_confirmed) {
    confidenceState = 2;
  } else {
    confidenceState = 3;
  }

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <Card className="border-[#1e3a5f]/15 bg-[#1e3a5f]/[0.02]" data-testid="section-ai-summary">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-[#1e3a5f]">AI Summary</span>
        </div>
        {isLoading || regenerateMutation.isPending || feedbackMutation.isPending ? (
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
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-1.5" data-testid="confidence-indicator">
            {confidenceState === 1 && (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="text-xs text-slate-500">Scoped to {wsContext?.primaryDomain}</span>
              </>
            )}
            {confidenceState === 2 && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span className="text-xs text-slate-500">Based on your workspace focus</span>
                <Popover open={thumbsDownOpen} onOpenChange={(open) => { setThumbsDownOpen(open); if (!open) { setShowFeedbackInput(false); setFeedbackText(""); } }}>
                  <PopoverTrigger asChild>
                    <button className="ml-1 text-slate-400 hover:text-slate-600 transition-colors" data-testid="button-thumbs-down">
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="end">
                    {!showFeedbackInput ? (
                      <div className="space-y-1">
                        <button
                          className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-slate-100 transition-colors"
                          onClick={() => { setThumbsDownOpen(false); onOpenAspectModal(); }}
                          data-testid="button-wrong-aspect"
                        >
                          This summary is about the wrong part of the company
                        </button>
                        <button
                          className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-slate-100 transition-colors"
                          onClick={() => setShowFeedbackInput(true)}
                          data-testid="button-irrelevant-info"
                        >
                          This summary contains irrelevant information
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600">What should this summary focus on instead?</p>
                        <Input
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          placeholder="e.g. their cloud infrastructure products"
                          className="text-sm"
                          data-testid="input-feedback-text"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowFeedbackInput(false); setFeedbackText(""); }}
                            data-testid="button-feedback-cancel"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={!feedbackText.trim() || feedbackMutation.isPending}
                            onClick={() => feedbackText.trim() && feedbackMutation.mutate(feedbackText.trim())}
                            data-testid="button-feedback-submit"
                          >
                            {feedbackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                            Update
                          </Button>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </>
            )}
            {confidenceState === 3 && (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                <span className="text-xs text-slate-500">General summary</span>
                <button
                  className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={onOpenAspectModal}
                  data-testid="button-scope-summary"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
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
  widgetConfig: { widgets: string[] };
  allCaptures: Capture[];
}) {
  const widgets = widgetConfig.widgets;
  const builtWidgets = ["battlecard", "quick_stats", "updates_feed"];

  const nonFeedWidgets = widgets.filter((w) => w !== "updates_feed");
  const hasUpdatesFeed = widgets.includes("updates_feed");

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

function EditableText({
  value,
  onSave,
  placeholder,
  testId,
}: {
  value: string;
  onSave: (val: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  return editing ? (
    <textarea
      ref={ref}
      className="w-full text-sm bg-white border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 min-h-[60px]"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      data-testid={testId}
    />
  ) : (
    <p
      className="text-sm text-foreground leading-relaxed cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5 min-h-[24px] transition-colors"
      onClick={() => setEditing(true)}
      data-testid={testId}
    >
      {value || <span className="text-slate-400 italic">{placeholder}</span>}
    </p>
  );
}

function EditableBulletList({
  items,
  onSave,
  placeholder,
  testId,
}: {
  items: string[];
  onSave: (items: string[]) => void;
  placeholder: string;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items.join("\n"));
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(items.join("\n")); }, [items]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  const handleBlur = () => {
    setEditing(false);
    const newItems = draft.split("\n").map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
    if (JSON.stringify(newItems) !== JSON.stringify(items)) onSave(newItems);
  };

  return editing ? (
    <textarea
      ref={ref}
      className="w-full text-sm bg-white border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 min-h-[80px]"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      placeholder="One item per line"
      data-testid={testId}
    />
  ) : (
    <div
      className="cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5 transition-colors min-h-[24px]"
      onClick={() => setEditing(true)}
      data-testid={testId}
    >
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-40" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400 italic">{placeholder}</p>
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
  const { toast } = useToast();
  const entityId = entity.name;

  const { data: bcData, isLoading } = useQuery<{ battlecard: Battlecard | null }>({
    queryKey: ["/api/battlecard", entityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/battlecard/${encodeURIComponent(entityId)}`);
      return res.json();
    },
  });

  const { data: prodCtxData } = useQuery<{ battlecard: any }>({
    queryKey: ["/api/product-context-check"],
    queryFn: async () => {
      return { battlecard: null };
    },
    enabled: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { whatTheyDo?: string; strengths?: string[]; weaknesses?: string[]; howToBeat?: string[] }) => {
      const res = await apiRequest("PUT", `/api/battlecard/${encodeURIComponent(entityId)}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/battlecard", entityId], data);
    },
    onError: (err: Error) => {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    },
  });

  const autofillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/battlecard/${encodeURIComponent(entityId)}/autofill`, {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/battlecard", entityId], data);
      toast({ title: "Battlecard auto-filled with AI." });
    },
    onError: (err: Error) => {
      toast({ title: "Auto-fill failed", description: err.message, variant: "destructive" });
    },
  });

  const bc = bcData?.battlecard;
  const lastUpdated = bc?.updatedAt ? new Date(bc.updatedAt) : null;
  const hasData = !!(bc?.whatTheyDo || (bc?.strengths as string[])?.length || (bc?.weaknesses as string[])?.length || (bc?.howToBeat as string[])?.length);

  const autofillButton = (
    <Button
      className="w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
      onClick={() => autofillMutation.mutate()}
      disabled={autofillMutation.isPending}
      data-testid="button-battlecard-autofill"
    >
      {autofillMutation.isPending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Generating with AI...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2" />
          Auto-fill with AI
        </>
      )}
    </Button>
  );

  return (
    <Card data-testid="widget-battlecard">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚔️</span>
            <span className="text-sm font-semibold text-[#1e3a5f]">Battlecard</span>
          </div>
          {lastUpdated && (
            <span className="text-[11px] text-slate-400" data-testid="text-battlecard-timestamp">
              Updated {lastUpdated.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at{" "}
              {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {!hasData && autofillButton}

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                <span>📝</span> What they do
                <Pencil className="w-3 h-3 ml-auto opacity-40" />
              </p>
              <EditableText
                value={bc?.whatTheyDo || ""}
                onSave={(val) => updateMutation.mutate({ whatTheyDo: val })}
                placeholder="Click to describe what this competitor does..."
                testId="input-battlecard-what"
              />
            </div>

            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-700 mb-1.5 flex items-center gap-1">
                <span>💪</span> Their strengths
                <Pencil className="w-3 h-3 ml-auto opacity-40" />
              </p>
              <EditableBulletList
                items={(bc?.strengths as string[]) || []}
                onSave={(items) => updateMutation.mutate({ strengths: items })}
                placeholder="Click to add their strengths..."
                testId="input-battlecard-strengths"
              />
            </div>

            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700 mb-1.5 flex items-center gap-1">
                <span>🎯</span> Their weaknesses
                <Pencil className="w-3 h-3 ml-auto opacity-40" />
              </p>
              <EditableBulletList
                items={(bc?.weaknesses as string[]) || []}
                onSave={(items) => updateMutation.mutate({ weaknesses: items })}
                placeholder="Click to add their weaknesses..."
                testId="input-battlecard-weaknesses"
              />
            </div>

            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700 mb-1.5 flex items-center gap-1">
                <span>🏆</span> How to beat them
                <Pencil className="w-3 h-3 ml-auto opacity-40" />
              </p>
              <EditableBulletList
                items={(bc?.howToBeat as string[]) || []}
                onSave={(items) => updateMutation.mutate({ howToBeat: items })}
                placeholder="Click to add competitive strategies..."
                testId="input-battlecard-howtobeat"
              />
              <p className="text-[11px] text-blue-500 mt-2 italic" data-testid="text-product-context-hint">
                Add your product details in Settings for personalised advice.
              </p>
            </div>

            {hasData && autofillButton}
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
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const updatesThisMonth = captures.filter(c => new Date(c.createdAt) >= thirtyDaysAgo).length;

  const firstTracked = captures.length > 0
    ? new Date(captures[captures.length - 1].createdAt)
    : null;

  const lastActivity = captures.length > 0
    ? new Date(captures[0].createdAt)
    : null;

  return (
    <Card data-testid="widget-quick-stats">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-[#1e3a5f]">Quick Stats</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-[#1e3a5f]" data-testid="stat-updates-month">{updatesThisMonth}</p>
            <p className="text-xs text-slate-500">Updates this month</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#1e3a5f]" data-testid="stat-first-tracked">
              {firstTracked
                ? firstTracked.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </p>
            <p className="text-xs text-slate-500">First tracked</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#1e3a5f]" data-testid="stat-last-activity">
              {lastActivity
                ? lastActivity.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </p>
            <p className="text-xs text-slate-500">Last activity</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SearchSettingsSection({ entity }: { entity: ExtractedEntity }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const autoSearchEnabled = entity.auto_search_enabled !== false;
  const alertOnHighSignal = entity.alert_on_high_signal === true;

  const updateSettingMutation = useMutation({
    mutationFn: async (settings: { auto_search_enabled?: boolean; alert_on_high_signal?: boolean }) => {
      const res = await apiRequest("PATCH", "/api/entity/search-settings", {
        entityName: entity.name,
        ...settings,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="pt-2 border-t border-border/50" data-testid="section-search-settings">
      <p className="text-xs text-slate-500 mb-2">Search settings</p>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-xs font-medium text-foreground">Automatic daily search</p>
            <p className="text-[11px] text-slate-400">Search for updates every day</p>
          </div>
          <Switch
            checked={autoSearchEnabled}
            onCheckedChange={(checked) => updateSettingMutation.mutate({ auto_search_enabled: checked })}
            disabled={updateSettingMutation.isPending}
            data-testid="switch-auto-search"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-xs font-medium text-foreground">High signal alerts</p>
            <p className="text-[11px] text-slate-400">Get notified for important findings</p>
          </div>
          <Switch
            checked={alertOnHighSignal}
            onCheckedChange={(checked) => updateSettingMutation.mutate({ alert_on_high_signal: checked })}
            disabled={updateSettingMutation.isPending}
            data-testid="switch-high-signal-alerts"
          />
        </div>
      </div>
    </div>
  );
}

function ManualSearchButton({
  entity,
  categoryName,
  captures,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  captures: Capture[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const webSearchCaptures = captures
    .filter((c) => c.type === "web_search")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const lastSearched = webSearchCaptures.length > 0 ? new Date(webSearchCaptures[0].createdAt) : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayManualCount = captures.filter(
    (c) => c.type === "web_search" && c.matchReason?.includes("Manual web search") && new Date(c.createdAt) >= today
  ).length;
  const limitReached = todayManualCount >= 3;

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const searchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/search/manual", {
        entityName: entity.name,
        categoryName,
        topicType: entity.topic_type || "general",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Search failed");
      }
      return res.json();
    },
    onSuccess: (data: { newFindings: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      toast({
        title: data.newFindings > 0 ? "New updates found" : "Search complete",
        description: data.message,
      });
    },
    onError: (err: Error) => {
      if (err.message.includes("limit reached")) {
        queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      }
      toast({
        title: "Search failed",
        description: err.message,
        variant: err.message.includes("limit reached") ? "default" : "destructive",
      });
    },
  });

  return (
    <div className="pt-2 border-t border-border/50" data-testid="section-manual-search">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">Web search</p>
        {lastSearched && (
          <p className="text-[11px] text-slate-400" data-testid="text-last-searched">
            {formatRelativeTime(lastSearched)}
          </p>
        )}
      </div>
      {limitReached ? (
        <p className="text-[11px] text-slate-400 italic" data-testid="text-search-limit">
          Search limit reached for today. Watchloom will automatically search again tomorrow.
        </p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 gap-1.5"
          onClick={() => searchMutation.mutate()}
          disabled={searchMutation.isPending}
          data-testid="button-search-web"
        >
          {searchMutation.isPending ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Globe className="w-3 h-3" />
              Search web now
            </>
          )}
        </Button>
      )}
      {!limitReached && !searchMutation.isPending && (
        <p className="text-[10px] text-slate-400 mt-1 text-center" data-testid="text-searches-remaining">
          {3 - todayManualCount} search{3 - todayManualCount !== 1 ? "es" : ""} remaining today
        </p>
      )}
    </div>
  );
}

function CaptureSourceIndicator({ capture }: { capture: Capture }) {
  const sourceUrlMatch = capture.content.match(/\n\nSource: (https?:\/\/[^\s]+)/);
  const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : null;

  let icon: typeof Globe | typeof Pencil = Pencil;
  let label = "Added manually";

  if (capture.type === "web_search") {
    icon = Globe;
    label = "Web search";
  } else if (capture.matchReason?.includes("Direct update from topic view")) {
    icon = Pencil;
    label = "Added from topic";
  } else if (capture.type === "text") {
    icon = Pencil;
    label = "Added manually";
  }

  const SourceIcon = icon;

  const content = (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500" data-testid={`source-indicator-${capture.id}`}>
      <SourceIcon className="w-3 h-3 text-[#1e3a5f]" />
      <span>{label}</span>
    </span>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-[#1e3a5f] hover:underline mt-2 transition-colors"
        data-testid={`source-link-${capture.id}`}
      >
        <SourceIcon className="w-3 h-3 text-[#1e3a5f]" />
        <span>{label}</span>
      </a>
    );
  }

  return <div className="mt-2">{content}</div>;
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
                        <CaptureSourceIndicator capture={cap} />
                        {cap.matchReason && !cap.matchReason.includes("FLAGGED_FOR_BRIEF") && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            {cap.matchReason.replace(/ \[FLAGGED_FOR_BRIEF\]/g, "")}
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
  const [showSplitModal, setShowSplitModal] = useState(false);
  const detectedNames = detectMultipleEntities(entity.name);

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

          <ManualSearchButton
            entity={entity}
            categoryName={categoryName}
            captures={captures}
          />

          <SearchSettingsSection entity={entity} />

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

          {detectedNames && (
            <div className="pt-3 border-t border-border/50">
              <button
                className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-medium hover:underline"
                onClick={() => setShowSplitModal(true)}
                data-testid="button-split-topic"
              >
                <Scissors className="w-3.5 h-3.5" />
                Split into separate topics
              </button>
            </div>
          )}
        </div>

        {detectedNames && (
          <SplitTopicModal
            open={showSplitModal}
            onOpenChange={setShowSplitModal}
            detectedNames={detectedNames}
            originalEntity={entity}
            categoryName={categoryName}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SplitTopicModal({
  open,
  onOpenChange,
  detectedNames,
  originalEntity,
  categoryName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedNames: string[];
  originalEntity: ExtractedEntity;
  categoryName: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [names, setNames] = useState<string[]>(detectedNames);

  useEffect(() => {
    if (open) setNames(detectedNames);
  }, [open, detectedNames]);

  const splitMutation = useMutation({
    mutationFn: async () => {
      const trimmedNames = names.map((n) => n.trim()).filter(Boolean);
      if (trimmedNames.length < 2) throw new Error("Need at least two topic names");
      const res = await apiRequest("POST", "/api/split-topic", {
        categoryName,
        originalEntityName: originalEntity.name,
        newNames: trimmedNames,
        topicType: originalEntity.topic_type || "general",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      toast({ title: "Topic split successfully. Individual topics created." });
      onOpenChange(false);
      navigate("/");
    },
    onError: (err: Error) => {
      toast({ title: "Split failed", description: err.message, variant: "destructive" });
    },
  });

  const updateName = (index: number, value: string) => {
    const updated = [...names];
    updated[index] = value;
    setNames(updated);
  };

  const removeName = (index: number) => {
    if (names.length <= 2) return;
    setNames(names.filter((_, i) => i !== index));
  };

  const addName = () => {
    setNames([...names, ""]);
  };

  const validNames = names.map((n) => n.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-split-topic">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-4 h-4" />
            Split into separate topics
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            This will create individual topics for each name below under <span className="font-medium text-foreground">{categoryName}</span>, and remove the combined topic.
          </p>
          <div className="space-y-2">
            {names.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => updateName(i, e.target.value)}
                  placeholder="Topic name..."
                  className="h-9 text-sm"
                  data-testid={`input-split-name-${i}`}
                />
                {names.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeName(i)}
                    data-testid={`button-remove-split-name-${i}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <button
            className="inline-flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline font-medium"
            onClick={addName}
            data-testid="button-add-split-name"
          >
            <Plus className="w-3 h-3" />
            Add another name
          </button>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-split-cancel">
            Cancel
          </Button>
          <Button
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
            onClick={() => splitMutation.mutate()}
            disabled={splitMutation.isPending || validNames.length < 2}
            data-testid="button-split-confirm"
          >
            {splitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Splitting...
              </>
            ) : (
              `Split into ${validNames.length} topics`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

type TopicDateWithDays = TopicDate & { days_until: number };

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDateStatusPill(daysUntil: number, status: string): { label: string; className: string } | null {
  if (status === "completed" || status === "dismissed") return null;
  if (daysUntil < 0) return { label: "Overdue", className: "bg-red-100 text-red-700" };
  if (daysUntil <= 30) return { label: `${daysUntil} days`, className: "bg-amber-100 text-amber-700" };
  return { label: `In ${daysUntil} days`, className: "bg-slate-100 text-slate-600" };
}

function sortTopicDates(dates: TopicDateWithDays[]): TopicDateWithDays[] {
  return [...dates].sort((a, b) => {
    const aOverdue = a.days_until < 0 && a.status !== "completed" && a.status !== "dismissed";
    const bOverdue = b.days_until < 0 && b.status !== "completed" && b.status !== "dismissed";
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

const dateTypeBorderColors: Record<string, string> = {
  hard_deadline: "border-l-red-500",
  soft_deadline: "border-l-amber-500",
  watch_date: "border-l-blue-500",
};

function DatesAndDeadlinesCard({
  entity,
  categoryName,
}: {
  entity: ExtractedEntity;
  categoryName: string;
}) {
  const { toast } = useToast();
  const entityId = entity.name;
  const topicType = (entity.topic_type || "general").toLowerCase();
  const isProminent = topicType === "regulation" || topicType === "risk";
  const isDatePromptType = topicType === "regulation" || topicType === "risk" || topicType === "event";

  const [showDateModal, setShowDateModal] = useState(false);
  const [editingDate, setEditingDate] = useState<TopicDateWithDays | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [formLabel, setFormLabel] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDateType, setFormDateType] = useState<string>("hard_deadline");
  const [formNotes, setFormNotes] = useState("");

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: datesData, isLoading } = useQuery<{ dates: TopicDateWithDays[] }>({
    queryKey: ["/api/topics", entityId, "dates"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/topics/${encodeURIComponent(entityId)}/dates`);
      return res.json();
    },
  });

  const dates = datesData?.dates ?? [];
  const activeDates = dates.filter(d => d.status !== "completed" && d.status !== "dismissed");
  const sortedDates = sortTopicDates(activeDates);

  const hasUrgent = activeDates.some(d => d.days_until < 0 || (d.days_until <= 7 && d.status !== "completed" && d.status !== "dismissed"));

  const resetForm = () => {
    setFormLabel("");
    setFormDate("");
    setFormDateType("hard_deadline");
    setFormNotes("");
  };

  const openAddModal = () => {
    setEditingDate(null);
    resetForm();
    setShowDateModal(true);
  };

  const closeModal = () => {
    setShowDateModal(false);
    setEditingDate(null);
    resetForm();
  };

  const createMutation = useMutation({
    mutationFn: async (data: { label: string; date: string; dateType: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/topics/${encodeURIComponent(entityId)}/dates`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entityId, "dates"] });
      closeModal();
      toast({ title: "Date added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ dateId, data }: { dateId: string; data: Record<string, string> }) => {
      const res = await apiRequest("PATCH", `/api/topics/${encodeURIComponent(entityId)}/dates/${dateId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entityId, "dates"] });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (dateId: string) => {
      const res = await apiRequest("DELETE", `/api/topics/${encodeURIComponent(entityId)}/dates/${dateId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entityId, "dates"] });
      toast({ title: "Date deleted." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!formLabel.trim() || !formDate) return;
    const payload: { label: string; date: string; dateType: string; notes?: string } = {
      label: formLabel.trim(), date: formDate, dateType: formDateType,
    };
    if (formNotes.trim()) payload.notes = formNotes.trim();
    createMutation.mutate(payload);
  };

  const handleEdit = (td: TopicDateWithDays) => {
    setEditingDate(td);
    setFormLabel(td.label);
    setFormDate(td.date);
    setFormDateType(td.dateType);
    setFormNotes(td.notes || "");
    setOpenMenuId(null);
    setShowDateModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingDate || !formLabel.trim() || !formDate) return;
    updateMutation.mutate({
      dateId: editingDate.id,
      data: { label: formLabel.trim(), date: formDate, dateType: formDateType, notes: formNotes.trim() },
    });
  };

  const handleMarkComplete = (dateId: string) => {
    updateMutation.mutate({ dateId, data: { status: "completed" } });
    setOpenMenuId(null);
  };

  const handleDismiss = (dateId: string) => {
    updateMutation.mutate({ dateId, data: { status: "dismissed" } });
    setOpenMenuId(null);
  };

  const handleDelete = (dateId: string) => {
    deleteMutation.mutate(dateId);
    setOpenMenuId(null);
  };

  const cardBorder = isProminent ? "border-l-4 border-l-amber-400" : "";

  return (
    <Card className={cardBorder} data-testid="card-dates-deadlines">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1e3a5f]" />
            <h3 className="text-sm font-semibold text-[#1e3a5f]" data-testid="text-dates-header">Dates and Deadlines</h3>
            {isProminent && hasUrgent && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" data-testid="icon-dates-warning" />
            )}
          </div>
          <button
            onClick={openAddModal}
            className="w-6 h-6 rounded flex items-center justify-center bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 transition-colors"
            data-testid="button-add-date"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <Dialog open={showDateModal} onOpenChange={(open) => { if (!open) closeModal(); }}>
          <DialogContent className="sm:max-w-md" data-testid="modal-add-date">
            <DialogHeader>
              <DialogTitle className="text-[#1e3a5f]" data-testid="text-date-modal-title">
                {editingDate ? `Edit date for ${entity.name}` : `Add a date to ${entity.name}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Label</label>
                <Input
                  placeholder="e.g. Compliance enforcement begins, Project kickoff, Expected launch"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="text-sm"
                  data-testid="input-date-label"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Date</label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="text-sm"
                  data-testid="input-date-value"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Type</label>
                <div className="flex gap-2" data-testid="select-date-type">
                  {([
                    { value: "hard_deadline", label: "Hard deadline", description: "A firm date with real consequences if missed", selectedClass: "border-red-400 bg-red-50 text-red-700", ringClass: "ring-red-200" },
                    { value: "soft_deadline", label: "Soft deadline", description: "A target date that is important but flexible", selectedClass: "border-amber-400 bg-amber-50 text-amber-700", ringClass: "ring-amber-200" },
                    { value: "watch_date", label: "Watch date", description: "A date worth monitoring but not a strict deadline", selectedClass: "border-blue-400 bg-blue-50 text-blue-700", ringClass: "ring-blue-200" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormDateType(opt.value)}
                      className={`flex-1 rounded-lg border-2 px-3 py-2 text-left transition-all ${
                        formDateType === opt.value
                          ? `${opt.selectedClass} ring-2 ${opt.ringClass}`
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                      data-testid={`pill-date-type-${opt.value}`}
                    >
                      <span className="text-xs font-semibold block">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 italic" data-testid="text-date-type-description">
                  {formDateType === "hard_deadline" && "A firm date with real consequences if missed"}
                  {formDateType === "soft_deadline" && "A target date that is important but flexible"}
                  {formDateType === "watch_date" && "A date worth monitoring but not a strict deadline"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Notes</label>
                <textarea
                  placeholder="Any additional context about this date"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full min-h-[70px] rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50 resize-none"
                  data-testid="input-date-notes"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                onClick={closeModal}
                data-testid="button-date-cancel"
              >
                Cancel
              </Button>
              <Button
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
                onClick={editingDate ? handleSaveEdit : handleAdd}
                disabled={!formLabel.trim() || !formDate || createMutation.isPending || updateMutation.isPending}
                data-testid="button-date-save"
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : null}
                {editingDate ? "Save Changes" : "Add Date"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sortedDates.length === 0 ? (
          isDatePromptType ? (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3" data-testid="text-dates-prompt">
              <p className="text-sm text-blue-700">
                {topicType === "regulation"
                  ? "Regulations and deadlines go hand in hand. Add the key compliance dates for this topic so Watchloom can keep you on track."
                  : topicType === "risk"
                  ? "Tracking risk means staying ahead of key dates. Add the important deadlines for this risk so Watchloom can keep you on track."
                  : "Events revolve around dates. Add the key dates for this event so Watchloom can keep you on track."}
              </p>
              <button
                onClick={openAddModal}
                className="mt-2 text-xs font-semibold text-[#1e3a5f] hover:underline"
                data-testid="button-dates-prompt-add"
              >
                + Add a date
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic" data-testid="text-dates-empty">
              No dates tracked yet. Add a deadline or key date for this topic.
            </p>
          )
        ) : (
          <div className="space-y-1.5" data-testid="list-dates">
            {sortedDates.map((td) => {
              const borderColor = dateTypeBorderColors[td.dateType] || "border-l-slate-300";
              const pill = getDateStatusPill(td.days_until, td.status);
              return (
                <div
                  key={td.id}
                  className={`flex items-center gap-3 p-2 rounded-md border-l-[3px] ${borderColor} bg-white hover:bg-slate-50 transition-colors`}
                  data-testid={`row-date-${td.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium whitespace-nowrap" data-testid={`text-date-value-${td.id}`}>
                        {formatDateDisplay(td.date)}
                      </span>
                      {pill && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${pill.className}`} data-testid={`pill-date-status-${td.id}`}>
                          {pill.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#1e3a5f] truncate" data-testid={`text-date-label-${td.id}`}>
                      {td.label}
                    </p>
                  </div>
                  <div className="relative" ref={openMenuId === td.id ? menuRef : undefined}>
                    <button
                      onClick={() => setOpenMenuId(openMenuId === td.id ? null : td.id)}
                      className="p-1 rounded hover:bg-slate-100 transition-colors"
                      data-testid={`button-date-menu-${td.id}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    {openMenuId === td.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded-lg shadow-lg py-1 w-36" data-testid={`menu-date-${td.id}`}>
                        <button
                          onClick={() => handleEdit(td)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                          data-testid={`button-date-edit-${td.id}`}
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleMarkComplete(td.id)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                          data-testid={`button-date-complete-${td.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark complete
                        </button>
                        <button
                          onClick={() => handleDismiss(td.id)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                          data-testid={`button-date-dismiss-${td.id}`}
                        >
                          <XCircle className="w-3 h-3" /> Dismiss
                        </button>
                        <button
                          onClick={() => handleDelete(td.id)}
                          className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          data-testid={`button-date-delete-${td.id}`}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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

function AspectSelectionModal({
  open,
  onOpenChange,
  entityName,
  categoryName,
  companyContext,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  categoryName: string;
  companyContext?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [aspects, setAspects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [customText, setCustomText] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAspects([]);
    setCustomText("");
    setLoading(true);

    const fetchAspects = async () => {
      try {
        const res = await apiRequest("POST", "/api/entity/aspect-pills", {
          entityName,
          companyContext: companyContext || undefined,
        });
        const data = await res.json();
        setAspects(data.aspects || []);
      } catch {
        setAspects([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAspects();
  }, [open, entityName, companyContext]);

  const handleSelect = async (aspect: string) => {
    setConfirming(true);
    try {
      await apiRequest("POST", "/api/entity/confirm-disambiguation", {
        entityName,
        categoryName,
        disambiguation_context: aspect,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      toast({
        title: `Watchloom will now track ${entityName} for ${aspect}.`,
        className: "bg-green-50 border-green-200 text-green-800",
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to save selection", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-aspect-selection" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack} data-testid="button-aspect-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <DialogTitle>What do you want to track about {entityName}?</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          {entityName} operates across multiple areas. Tell us what matters to you so we only surface relevant intelligence.
        </p>
        <div className="py-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#1e3a5f]" />
              <span className="ml-2 text-sm text-muted-foreground">Loading business areas...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="aspect-pills-container">
              {aspects.map((aspect, i) => (
                <button
                  key={i}
                  className="px-4 py-2 rounded-full border border-[#1e3a5f]/20 text-sm font-medium text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white transition-colors disabled:opacity-50"
                  onClick={() => handleSelect(aspect)}
                  disabled={confirming}
                  data-testid={`button-aspect-pill-${i}`}
                >
                  {aspect}
                </button>
              ))}
              <button
                className="px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                onClick={() => handleSelect("All business areas")}
                disabled={confirming}
                data-testid="button-aspect-all"
              >
                All business areas
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <label className="text-sm text-muted-foreground mb-1 block">Something else —</label>
            <div className="flex gap-2">
              <Input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Type a specific area..."
                className="h-9 text-sm"
                data-testid="input-aspect-custom"
              />
              <Button
                size="sm"
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white h-9 px-4"
                onClick={() => handleSelect(customText.trim())}
                disabled={!customText.trim() || confirming}
                data-testid="button-aspect-custom-submit"
              >
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DisambiguationBanner({
  entity,
  categoryName,
  onChangeRequest,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  onChangeRequest: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isReviewBanner = entity.needs_aspect_review && !entity.disambiguation_context;
  const isContextBanner = !!entity.disambiguation_context && !entity.disambiguation_confirmed;
  const isNeedsReviewWithContext = entity.needs_aspect_review && !!entity.disambiguation_context;

  useEffect(() => {
    if (isReviewBanner || isNeedsReviewWithContext) return;
    if (!entity.disambiguation_context || entity.disambiguation_confirmed) return;

    const storageKey = `disambiguation_banner_shown_${entity.name}`;
    const shownAt = localStorage.getItem(storageKey);

    if (!shownAt) {
      localStorage.setItem(storageKey, new Date().toISOString());
      return;
    }

    const shownDate = new Date(shownAt);
    const now = new Date();
    const hoursSinceShown = (now.getTime() - shownDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceShown >= 24) {
      const autoConfirm = async () => {
        try {
          await apiRequest("PATCH", "/api/entity", {
            categoryName,
            entityName: entity.name,
            disambiguation_confirmed: true,
            needs_aspect_review: false,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
          setDismissed(true);
        } catch {
        }
      };
      autoConfirm();
    }
  }, [entity.name, entity.disambiguation_context, entity.disambiguation_confirmed, entity.needs_aspect_review, categoryName, user?.id, isReviewBanner]);

  if (dismissed) return null;
  if (!isReviewBanner && !isContextBanner && !isNeedsReviewWithContext) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await apiRequest("PATCH", "/api/entity", {
        categoryName,
        entityName: entity.name,
        disambiguation_confirmed: true,
        needs_aspect_review: false,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      setDismissed(true);
      toast({
        title: entity.disambiguation_context
          ? `Got it. All searches will focus on ${entity.disambiguation_context}.`
          : "Confirmed. We'll keep tracking this topic as-is.",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200" data-testid="banner-disambiguation-confirm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-amber-900">
          {isReviewBanner ? (
            <>
              We'd like to confirm how you want us to track <span className="font-semibold">{entity.name}</span>. Would you like to select a specific business area to focus on?
            </>
          ) : (
            <>
              We are tracking <span className="font-semibold">{entity.name}</span> for their{" "}
              <span className="font-semibold">{entity.disambiguation_context}</span> products based on your workspace focus. Is that right?
            </>
          )}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white h-8 px-3 text-xs"
            onClick={isReviewBanner ? onChangeRequest : handleConfirm}
            disabled={confirming}
            data-testid="button-disambiguation-yes"
          >
            {confirming ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            {isReviewBanner ? "Select focus area" : "Yes, that is right"}
          </Button>
          <button
            className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
            onClick={isReviewBanner ? handleConfirm : onChangeRequest}
            data-testid="button-disambiguation-no"
          >
            {isReviewBanner ? "Keep as-is" : "No, change this"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisambiguationCard({
  entity,
  categoryName,
}: {
  entity: ExtractedEntity;
  categoryName: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"loading" | "companies" | "aspects" | "done">("loading");
  const [companies, setCompanies] = useState<{ name: string; description: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [aspects, setAspects] = useState<string[]>([]);
  const [aspectsLoading, setAspectsLoading] = useState(false);
  const [customText, setCustomText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (entity.disambiguation_confirmed || entity.disambiguation_context) return;

    const fetchCompanies = async () => {
      try {
        const res = await apiRequest("POST", "/api/entity/disambiguate-companies", {
          entityName: entity.name,
        });
        const data = await res.json();

        if (data.single) {
          setModalOpen(true);
          loadAspects(undefined);
        } else {
          setCompanies(data.companies || []);
          setStep("companies");
          setModalOpen(true);
        }
      } catch {
        setStep("done");
      }
    };
    fetchCompanies();
  }, [entity.name, entity.disambiguation_confirmed, entity.disambiguation_context]);

  const loadAspects = async (companyContext?: string) => {
    setAspectsLoading(true);
    setStep("aspects");
    try {
      const res = await apiRequest("POST", "/api/entity/aspect-pills", {
        entityName: entity.name,
        companyContext: companyContext || undefined,
      });
      const data = await res.json();
      const pills = data.aspects || [];

      if (pills.length <= 1) {
        const aspect = pills.length === 1 ? pills[0] : "All business areas";
        const contextStr = companyContext ? `${companyContext} — ${aspect}` : aspect;
        await handleConfirm(contextStr);
        return;
      }

      setAspects(pills);
    } catch {
      setAspects([]);
    } finally {
      setAspectsLoading(false);
    }
  };

  const handleCompanySelect = (companyName: string) => {
    setSelectedCompany(companyName);
    loadAspects(companyName);
  };

  const handleConfirm = async (aspect: string) => {
    setConfirming(true);
    try {
      const contextStr = selectedCompany ? `${selectedCompany} — ${aspect}` : aspect;
      await apiRequest("POST", "/api/entity/confirm-disambiguation", {
        entityName: entity.name,
        categoryName,
        disambiguation_context: contextStr,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      toast({
        title: `Watchloom will now track ${entity.name} for ${aspect}.`,
        className: "bg-green-50 border-green-200 text-green-800",
      });
      setModalOpen(false);
      setStep("done");
    } catch (err: any) {
      toast({ title: "Failed to save selection", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  if (entity.disambiguation_confirmed || entity.disambiguation_context) {
    return null;
  }

  if (step === "done" && !modalOpen) {
    return null;
  }

  if (step === "loading") {
    return (
      <Card className="mt-3" data-testid="card-disambiguation-loading">
        <CardContent className="p-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#1e3a5f]" />
          <span className="text-sm text-muted-foreground">Checking disambiguation options...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={modalOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-disambiguation-card" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === "companies" && companies.length > 0 && (
          <>
            <DialogHeader>
              <DialogTitle>Which {entity.name} do you mean?</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {companies.map((company, i) => (
                <button
                  key={i}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors"
                  onClick={() => handleCompanySelect(company.name)}
                  data-testid={`button-company-option-${i}`}
                >
                  <p className="text-sm font-medium text-foreground">{company.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{company.description}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "aspects" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                {selectedCompany && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setStep("companies");
                      setSelectedCompany(null);
                      setAspects([]);
                    }}
                    data-testid="button-disambiguation-back"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                <DialogTitle>What do you want to track about {entity.name}?</DialogTitle>
              </div>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              {entity.name} operates across multiple areas. Tell us what matters to you so we only surface relevant intelligence.
            </p>
            <div className="py-3 space-y-4">
              {aspectsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[#1e3a5f]" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading business areas...</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2" data-testid="disambiguation-aspect-pills">
                  {aspects.map((aspect, i) => (
                    <button
                      key={i}
                      className="px-4 py-2 rounded-full border border-[#1e3a5f]/20 text-sm font-medium text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white transition-colors disabled:opacity-50"
                      onClick={() => handleConfirm(aspect)}
                      disabled={confirming}
                      data-testid={`button-disambiguation-aspect-${i}`}
                    >
                      {aspect}
                    </button>
                  ))}
                  <button
                    className="px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    onClick={() => handleConfirm("All business areas")}
                    disabled={confirming}
                    data-testid="button-disambiguation-all"
                  >
                    All business areas
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <label className="text-sm text-muted-foreground mb-1 block">Something else —</label>
                <div className="flex gap-2">
                  <Input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Type a specific area..."
                    className="h-9 text-sm"
                    data-testid="input-disambiguation-custom"
                  />
                  <Button
                    size="sm"
                    className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white h-9 px-4"
                    onClick={() => handleConfirm(customText.trim())}
                    disabled={!customText.trim() || confirming}
                    data-testid="button-disambiguation-custom-submit"
                  >
                    {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
