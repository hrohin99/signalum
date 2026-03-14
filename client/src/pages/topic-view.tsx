import { useState, useEffect, useRef } from "react";
import ReactMarkdown from 'react-markdown';
import { useAuth } from "@/lib/auth-context";
import { useRole } from "@/App";
import { supabase } from "@/lib/supabase";
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
  Briefcase,
  Zap,
  ChevronUp,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { ExtractedCategory, ExtractedEntity, Capture, TopicTypeConfig, Battlecard, TopicDate, MonitoredUrl, WorkspaceCapability, CompetitorCapability, CompetitorPricing, StrategicDirection, ProductContext, EntitySeoData } from "@shared/schema";
import { ComingSoonCard } from "@/components/coming-soon-card";
import { PartnershipsCard } from "@/components/PartnershipsCard";
import { SoWhatCard as SoWhatIntelCard } from "@/components/SoWhatCard";
import { SwotCard } from "@/components/SwotCard";
import { CapabilityMatrixCard } from "@/components/CapabilityMatrixCard";
import { CertificationsCard } from "@/components/CertificationsCard";
import { ProductsCard } from "@/components/ProductsCard";
import { GeoPresenceCard, getRegionFlag } from "@/components/GeoPresenceCard";
import { WinLossCard } from "@/components/WinLossCard";
import { FundingCard, FundingOverviewPreview } from "@/components/FundingCard";
import { CoachMarks } from "@/components/coach-marks";
import { ContextualTopicBanner } from "@/components/contextual-topic-banner";
import { topicTourSteps } from "@/lib/tourConfig";
import { Eye, Crosshair, Compass, Star, MapPin, Phone, Clock } from "lucide-react";

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

  const [, navigate] = useLocation();
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAspectModal, setShowAspectModal] = useState(false);
  const [showCoachMarks, setShowCoachMarks] = useState(false);
  const [showWebsiteModal, setShowWebsiteModal] = useState(false);
  const [renameTopicOpen, setRenameTopicOpen] = useState(false);
  const [renameTopicNewName, setRenameTopicNewName] = useState("");
  const [deleteTopicOpen, setDeleteTopicOpen] = useState(false);
  const [websiteUrlInput, setWebsiteUrlInput] = useState("");
  const [websiteBannerDismissed, setWebsiteBannerDismissed] = useState(() => {
    return localStorage.getItem(`website_banner_dismissed_${entity.name}`) === "true";
  });
  const [extractionNoData, setExtractionNoData] = useState(false);
  const [extractionNoDataDismissed, setExtractionNoDataDismissed] = useState(false);
  const [battlecardExpanded, setBattlecardExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'commercial' | 'competitive' | 'strategic' | 'updates'>('overview');
  const isCompetitor = currentTopicType === 'competitor';
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  const { data: profileData } = useQuery<{ role: string | null }>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });
  const userRole = profileData?.role || "admin";

  const { data: extractionStatus } = useQuery<{ extraction: { status: string; noDataFound?: boolean } | null }>({
    queryKey: ["/api/entity/website-extraction-status", entity.name],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entity/website-extraction-status?entityName=${encodeURIComponent(entity.name)}`);
      return res.json();
    },
    enabled: !!user && !!entity.website_url,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.extraction?.status === "running") return 2000;
      return false;
    },
  });

  const isExtractionRunning = extractionStatus?.extraction?.status === "running";

  const entityId = entity.name;
  const { data: products = [] } = useQuery<any[]>({
    queryKey: [`/api/entities/${entityId}/products`],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return [];
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/products`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 500
  });

  const { data: geoPresence = [] } = useQuery<any[]>({
    queryKey: [`/api/entities/${entityId}/geo-presence`],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return [];
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/geo-presence`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 500
  });

  const { data: partnershipsData } = useQuery<{ partnerships: any[] }>({
    queryKey: ["/api/entities", entityId, "partnerships"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { partnerships: [] };
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/partnerships`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      });
      if (!res.ok) return { partnerships: [] };
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 500
  });

  useQuery<Record<string, any> | null>({
    queryKey: ["/api/entities", entityId, "swot"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/swot`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 500
  });

  useEffect(() => {
    if (extractionStatus?.extraction?.status === "completed" && extractionStatus?.extraction?.noDataFound) {
      setExtractionNoData(true);
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
    } else if (extractionStatus?.extraction?.status === "completed" && extractionStatus?.extraction?.noDataFound === false) {
      setExtractionNoData(false);
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
    }
  }, [extractionStatus?.extraction?.status, extractionStatus?.extraction?.noDataFound]);

  useEffect(() => {
    const tourSeen = localStorage.getItem("onboarding_topic_tour_seen") === "true";
    if (!tourSeen && entity?.disambiguation_confirmed) {
      setShowCoachMarks(true);
    }
  }, [entity?.disambiguation_confirmed]);

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

  const websiteUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/entity/update-website-url", {
        entityName: entity.name,
        categoryName,
        website_url: url,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/entity/website-extraction-status", entity.name] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entity.name, "seo-intelligence"] });
      setShowWebsiteModal(false);
      setWebsiteUrlInput("");
      toast({ title: "Website URL saved. Reading their website..." });
      (async () => {
        try {
          await apiRequest("POST", `/api/entities/${encodeURIComponent(entity.name)}/seo-intelligence`);
          queryClient.invalidateQueries({ queryKey: ["/api/entities", entity.name, "seo-intelligence"] });
        } catch {}
      })();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renameTopicMutation = useMutation({
    mutationFn: async (data: { oldName: string; newName: string }) => {
      const res = await apiRequest("PUT", `/api/topics/${encodeURIComponent(data.oldName)}`, {
        name: data.newName,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      setRenameTopicOpen(false);
      toast({ title: "Topic renamed", description: `Renamed to "${variables.newName}".` });
      navigate(`/topic/${encodeURIComponent(categoryName)}/${encodeURIComponent(variables.newName)}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (entityName: string) => {
      const res = await apiRequest("DELETE", `/api/topics/${encodeURIComponent(entityName)}`, {
        categoryName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      setDeleteTopicOpen(false);
      toast({ title: "Topic deleted" });
      navigate("/");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const showWebsiteBanner = entity.entity_type_detected === "local_business" && !entity.website_url && !websiteBannerDismissed;

  return (
    <div className="p-4 md:px-8 md:py-6 max-w-7xl mx-auto">
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
        onRename={() => {
          setRenameTopicNewName(entity.name);
          setRenameTopicOpen(true);
        }}
        onDelete={() => setDeleteTopicOpen(true)}
        userRole={userRole}
      />

      {detectMultipleEntities(entity.name) && (
        <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200" data-testid="banner-multiple-entities">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            This topic appears to contain multiple entries. Consider splitting them into individual topics for better tracking.
          </p>
        </div>
      )}

      {["competitor", "account", "technology"].includes(currentTopicType) && ((entity.disambiguation_context && !(entity.disambiguation_confirmed ?? false)) || (entity.needs_aspect_review ?? false)) && (
        <DisambiguationBanner
          entity={entity}
          categoryName={categoryName}
          onChangeRequest={() => setShowAspectModal(true)}
        />
      )}

      {["competitor", "account", "technology"].includes(currentTopicType) && !(entity.disambiguation_confirmed ?? false) && !entity.disambiguation_context && !(entity.needs_aspect_review ?? false) && (
        <DisambiguationCard
          entity={entity}
          categoryName={categoryName}
        />
      )}

      {["competitor", "account", "technology"].includes(currentTopicType) && (
        <AspectSelectionModal
          open={showAspectModal}
          onOpenChange={setShowAspectModal}
          entityName={entity.name}
          categoryName={categoryName}
        />
      )}

      {showWebsiteBanner && (
        <div className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200" data-testid="banner-add-website">
          <Globe className="w-4 h-4 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            Add {entity.name}'s website URL to improve search accuracy
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
            onClick={() => setShowWebsiteModal(true)}
            data-testid="button-add-website"
          >
            Add Website
          </Button>
          <button
            className="text-blue-400 hover:text-blue-600 transition-colors"
            onClick={() => {
              setWebsiteBannerDismissed(true);
              localStorage.setItem(`website_banner_dismissed_${entity.name}`, "true");
            }}
            data-testid="button-dismiss-website-banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isExtractionRunning && (
        <div className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200" data-testid="banner-website-extraction">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <p className="text-sm text-emerald-800">Reading their website…</p>
        </div>
      )}

      {extractionNoData && !extractionNoDataDismissed && !isExtractionRunning && (
        <div className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200" data-testid="banner-extraction-no-data">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            Limited information found on their website. Try adding more pages in Monitored URLs.
          </p>
          <button
            className="text-amber-400 hover:text-amber-600 transition-colors"
            onClick={() => setExtractionNoDataDismissed(true)}
            data-testid="button-dismiss-extraction-notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Dialog open={showWebsiteModal} onOpenChange={setShowWebsiteModal}>
        <DialogContent className="max-w-sm" data-testid="modal-add-website">
          <DialogHeader>
            <DialogTitle>Add Website URL</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-slate-600 mb-1 block">Website URL</label>
            <Input
              placeholder="https://..."
              value={websiteUrlInput}
              onChange={(e) => setWebsiteUrlInput(e.target.value)}
              data-testid="input-website-url"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowWebsiteModal(false)}>Cancel</Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
              disabled={!websiteUrlInput.trim() || websiteUrlMutation.isPending}
              onClick={() => websiteUrlMutation.mutate(websiteUrlInput.trim())}
              data-testid="button-save-website"
            >
              {websiteUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-4">
        <ContextualTopicBanner
          entityId={entity.name}
          entityName={entity.name}
          topicType={currentTopicType}
          categoryName={categoryName}
          onOpenDateModal={() => {
            const datesCard = document.querySelector('[data-tour="dates-deadlines"]');
            if (datesCard) {
              datesCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
        />
      </div>

      {captures.filter(c => c.type === "web_search").length === 0 && (
        <div className="flex items-center gap-2 mt-3 px-4 py-2.5 rounded-lg bg-[#1e3a5f]/5 border border-[#1e3a5f]/10" data-testid="banner-searching-now">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1e3a5f] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1e3a5f]" />
          </span>
          <span className="text-sm text-[#1e3a5f] font-medium">Searching now…</span>
        </div>
      )}

      {isCompetitor && (
        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', marginBottom: 20, marginTop: 16, gap: 0, overflowX: 'auto', whiteSpace: 'nowrap' }} data-testid="tab-bar-competitor">
          {(['overview','profile','commercial','competitive','strategic','updates'] as const).map(tab => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 13, padding: '10px 16px', cursor: 'pointer',
                color: activeTab === tab ? '#534AB7' : 'var(--color-text-secondary, #64748b)',
                borderBottom: activeTab === tab ? '2px solid #534AB7' : '2px solid transparent',
                fontWeight: activeTab === tab ? 500 : 400,
                marginBottom: -0.5, whiteSpace: 'nowrap',
                textTransform: 'capitalize'
              }}
              data-testid={`tab-${tab}`}
            >
              {tab === 'updates' ? 'Updates' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
        </div>
      )}

      {isCompetitor && activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AISummarySection entity={entity} categoryName={categoryName} onOpenAspectModal={() => setShowAspectModal(true)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Products & solutions</div>
                <button onClick={() => setActiveTab('profile')} style={{ fontSize: 11, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>Manage →</button>
              </div>
              {products.length === 0
                ? <div style={{ fontSize: 13, color: '#94a3b8' }}>No products logged yet.</div>
                : products.slice(0, 3).map((p: any) => (
                    <div key={p.id} style={{ padding: '6px 0', borderBottom: '0.5px solid #f1f5f9' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{p.product_name}</div>
                      {p.description && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'pre-wrap' }}>{p.description}</div>
                      )}
                    </div>
                  ))
              }
            </div>
            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Markets & geography</div>
                  {geoPresence.length > 0 && (
                    <span data-testid="text-geo-overview-count" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: '#f8fafc', color: '#64748b', border: '0.5px solid #e2e8f0' }}>
                      {geoPresence.length} {geoPresence.length === 1 ? 'market' : 'markets'}
                    </span>
                  )}
                </div>
                <button data-testid="button-manage-geo" onClick={() => setActiveTab('profile')} style={{ fontSize: 11, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>Manage →</button>
              </div>
              {geoPresence.length === 0
                ? <div style={{ fontSize: 13, color: '#94a3b8' }}>No geographic data logged yet.</div>
                : geoPresence.slice(0, 3).map((g: any) => {
                    const flag = getRegionFlag(g.region);
                    const presenceStyles: Record<string, { bg: string; color: string; label: string }> = {
                      active: { bg: '#EAF3DE', color: '#27500A', label: 'Active' },
                      expanding: { bg: '#E0EDFF', color: '#1A3F6F', label: 'Expanding' },
                      limited: { bg: '#FAEEDA', color: '#633806', label: 'Limited' },
                      exited: { bg: '#F1EFE8', color: '#444441', label: 'Exited' },
                    };
                    const s = presenceStyles[g.presence_type] || presenceStyles.active;
                    return (
                      <div key={g.id} style={{ padding: '6px 0', borderBottom: '0.5px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{flag}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{g.region}</span>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color }}>{s.label}</span>
                      </div>
                    );
                  })
              }
            </div>
            <FundingOverviewPreview entityId={entity.name} />
            <CertificationsCard entityId={entity.name} userRole={userRole} previewMode={true} />
          </div>
        </div>
      )}

      {isCompetitor && activeTab === 'profile' && (
        <div className="space-y-6">
          <AISummarySection entity={entity} categoryName={categoryName} onOpenAspectModal={() => setShowAspectModal(true)} />
          <SoWhatCard entity={entity} categoryName={categoryName} captureCount={captures.length} />
          <div className="space-y-4">
            <BattlecardCollapsedHeader
              entity={entity}
              categoryName={categoryName}
              expanded={battlecardExpanded}
              onToggle={() => setBattlecardExpanded(!battlecardExpanded)}
            />
            {battlecardExpanded && (
              <BattlecardWidget entity={entity} categoryName={categoryName} captures={captures} />
            )}
          </div>
          <CompetitorCapabilitiesCard entityName={entity.name} />

          {/* Products & Solutions */}
          <ProductsCard entityId={entity.name} userRole={userRole} />

          {/* Geographic Presence */}
          <GeoPresenceCard entityId={entity.name} userRole={userRole} />
        </div>
      )}

      {isCompetitor && activeTab === 'commercial' && (
        <div className="space-y-6">
          <PricingCard entity={entity} />
          <WinLossCard entityId={entity.name} userRole={userRole} />
          <FundingCard entityId={entity.name} userRole={userRole} />
        </div>
      )}

      {isCompetitor && activeTab === 'competitive' && (
        <div className="space-y-6">
          <SoWhatIntelCard entityId={entity.name} userRole={userRole} />
          <SwotCard entityId={entity.name} userRole={userRole} />
          <CapabilityMatrixCard entityId={entity.name} userRole={userRole} previewMode={false} onSwitchToProfile={() => setActiveTab('profile')} />
          <div className="space-y-4">
            <BattlecardCollapsedHeader
              entity={entity}
              categoryName={categoryName}
              expanded={battlecardExpanded}
              onToggle={() => setBattlecardExpanded(!battlecardExpanded)}
            />
            {battlecardExpanded && (
              <BattlecardWidget entity={entity} categoryName={categoryName} captures={captures} />
            )}
          </div>
          <CertificationsCard entityId={entity.name} userRole={userRole} previewMode={false} />
        </div>
      )}

      {isCompetitor && activeTab === 'strategic' && (
        <div className="space-y-6">
          <PartnershipsCard entityId={entity.name} userRole={userRole} />
        </div>
      )}

      {(!isCompetitor || activeTab === 'updates') && (
        <div className="flex flex-col lg:flex-row gap-6 mt-6">
          <div className="lg:w-[65%] space-y-6">
            {!isCompetitor && (
              <>
                <AISummarySection entity={entity} categoryName={categoryName} onOpenAspectModal={() => setShowAspectModal(true)} />
                <SoWhatCard entity={entity} categoryName={categoryName} captureCount={captures.length} />
                <PartnershipsCard entityId={entity.name} userRole={userRole} />
              </>
            )}
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
            <RecentSignalsCard captures={captures} />
            <DatesAndDeadlinesCard entity={entity} categoryName={categoryName} />
            {currentTopicType === "competitor" && (
              <MonitoredUrlsCard entity={entity} />
            )}
            {false && (
              entity.website_url && (
                <DigitalPresenceCard entity={entity} categoryName={categoryName} isExtractionRunning={isExtractionRunning} />
              )
            )}
            {false && (
              entity.website_url && (
                <SeoIntelligenceCard entity={entity} categoryName={categoryName} />
              )
            )}
            {currentTopicType === "competitor" && (
              <AIVisibilityCard />
            )}
            <InlineCaptureCard entity={entity} categoryName={categoryName} />
          </div>
        </div>
      )}

      {showCoachMarks && (
        <CoachMarks
          steps={topicTourSteps}
          storageKey="onboarding_topic_tour_seen"
          onComplete={() => {
            localStorage.setItem("onboarding_topic_tour_seen", "true");
            setShowCoachMarks(false);
          }}
        />
      )}

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
                  renameTopicMutation.mutate({ oldName: entity.name, newName: renameTopicNewName.trim() });
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
                onClick={() => renameTopicMutation.mutate({ oldName: entity.name, newName: renameTopicNewName.trim() })}
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
            <AlertDialogTitle>Delete "{entity.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the topic and all captured updates associated with it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-topic-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteTopicMutation.isPending}
              onClick={() => deleteTopicMutation.mutate(entity.name)}
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
  onRename,
  onDelete,
  userRole,
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
  onRename: () => void;
  onDelete: () => void;
  userRole: string;
}) {
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const [, navigate] = useLocation();

  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3 border-b border-border pb-4 pl-4"
      style={{
        borderLeft: `4px solid ${
          categoryName.toLowerCase().includes("competitor") ? "#dc2626"
          : categoryName.toLowerCase().includes("regulation") || categoryName.toLowerCase().includes("standards") ? "#1d4ed8"
          : categoryName.toLowerCase().includes("industry") || categoryName.toLowerCase().includes("topic") ? "#16a34a"
          : categoryName.toLowerCase().includes("threat") || categoryName.toLowerCase().includes("intelligence") ? "#ea580c"
          : "#94a3b8"
        }`,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0"
          data-testid="button-back-to-workspace"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <h1 className="text-lg md:text-xl font-bold text-[#1e3a5f] break-words min-w-0" data-testid="text-topic-name">
          {entity.name}
        </h1>

        {isEditor && (
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
        )}

        {!isEditor && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] text-xs font-medium">
            <span>{typeInfo.icon}</span>
            <span>{typeInfo.displayName}</span>
          </span>
        )}

        {isEditor && (
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
        )}

        {!isEditor && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-xs font-medium">
            <span className={`w-2 h-2 rounded-full ${priInfo.dotClass}`} />
            <span className="text-foreground">{priInfo.label}</span>
          </span>
        )}

        <span className="text-sm text-slate-500" data-testid="text-category-label">
          in {categoryName}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {isEditor && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-topic-actions-menu">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename} data-testid="menu-rename-topic">
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600" data-testid="menu-delete-topic">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
          onClick={() => navigate("/capture")}
          data-testid="button-add-update"
        >
          Add Update
        </Button>
      </div>
    </div>
  );
}

function SoWhatCard({ entity, categoryName, captureCount }: { entity: ExtractedEntity; categoryName: string; captureCount: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);

  const soWhatMutation = useMutation({
    mutationFn: async (force?: boolean) => {
      const res = await apiRequest("POST", `/api/topics/${encodeURIComponent(entity.name)}/so-what`, {
        force: force ?? false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
    },
    onError: (err: Error) => {
      toast({ title: "Error generating analysis", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!hasAutoTriggered && !entity.soWhatText && captureCount >= 3 && !soWhatMutation.isPending) {
      setHasAutoTriggered(true);
      soWhatMutation.mutate(false);
    }
  }, [hasAutoTriggered, entity.soWhatText, captureCount, soWhatMutation.isPending]);

  return (
    <Card data-testid="card-so-what">
      <div className="flex items-center justify-between gap-2 flex-wrap p-4 pb-0">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold" data-testid="text-so-what-title">So What for Us?</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => soWhatMutation.mutate(true)}
          disabled={soWhatMutation.isPending}
          data-testid="button-regenerate-so-what"
        >
          {soWhatMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>
      <CardContent className="pt-3">
        {soWhatMutation.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-so-what-loading">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing strategic implications...</span>
          </div>
        ) : entity.soWhatText ? (
          <ReactMarkdown className="prose prose-sm max-w-none text-sm leading-relaxed" data-testid="text-so-what-content">{entity.soWhatText}</ReactMarkdown>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-so-what-empty">
            No analysis generated yet.{' '}
            <button onClick={() => soWhatMutation.mutate(false)} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline' }} data-testid="button-generate-now-so-what">Generate now</button>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AISummarySection({ entity, categoryName, onOpenAspectModal }: { entity: ExtractedEntity; categoryName: string; onOpenAspectModal: () => void }) {
  const { user } = useAuth();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const { toast } = useToast();
  const [thumbsDownOpen, setThumbsDownOpen] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [summaryExpanded, setSummaryExpanded] = useState(false);

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

  const wsContext = wsContextData?.workspaceContext ?? null;
  const hasWorkspaceContext = !!(wsContext && wsContext.primaryDomain);

  const disambiguationConfirmed = entity.disambiguation_confirmed ?? false;

  let confidenceState: 1 | 2 | 3 = 3;
  if (disambiguationConfirmed && hasWorkspaceContext) {
    confidenceState = 1;
  } else if (disambiguationConfirmed) {
    confidenceState = 2;
  } else {
    confidenceState = 3;
  }

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <Card className="border-[#1e3a5f]/15 bg-[#1e3a5f]/[0.02]" data-testid="section-ai-summary" data-tour="ai-summary">
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
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Unable to generate summary at this time. Try again later.
            </p>
          </div>
        ) : (() => {
          const summaryText = summaryData?.summary || `No updates available for ${entity.name} yet.`;
          const summaryParagraphs = summaryText.split(/\n\n+/);
          const hasMoreParagraphs = summaryParagraphs.length > 3;
          const displayedSummary = hasMoreParagraphs && !summaryExpanded
            ? summaryParagraphs.slice(0, 3).join('\n\n')
            : summaryText;
          return (
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <ReactMarkdown className="prose prose-sm max-w-none text-[15px] text-foreground leading-relaxed" data-testid="text-ai-summary">
                {displayedSummary}
              </ReactMarkdown>
              {hasMoreParagraphs && (
                <button
                  className="text-xs text-[#1e3a5f] hover:underline font-medium mt-3 inline-flex items-center gap-1"
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  data-testid="button-toggle-summary"
                >
                  {summaryExpanded ? 'Read less' : 'Read more'}
                  {summaryExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          );
        })()}
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
                <span className="text-xs text-slate-500">Scoped to {wsContext?.primaryDomain ?? "your domain"}</span>
              </>
            )}
            {confidenceState === 2 && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span className="text-xs text-slate-500">Based on your workspace focus</span>
                {isEditor && (
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
                )}
              </>
            )}
            {confidenceState === 3 && (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                <span className="text-xs text-slate-500">General summary</span>
                {isEditor && (
                  <button
                    className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                    onClick={onOpenAspectModal}
                    data-testid="button-scope-summary"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StrategicDirectionCard({ entity, categoryName, captures }: { entity: ExtractedEntity; categoryName: string; captures: Capture[] }) {
  const entityId = entity.name;
  const [, navigate] = useLocation();

  const { data: directionData, isLoading } = useQuery<{ strategicDirection: StrategicDirection | null; insufficient?: boolean; captureCount?: number }>({
    queryKey: ["/api/strategic-direction", entityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/strategic-direction/${encodeURIComponent(entityId)}`);
      return res.json();
    },
  });

  const { data: prodCtxData } = useQuery<{ productContext: ProductContext | null }>({
    queryKey: ["/api/product-context"],
  });

  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/strategic-direction/${encodeURIComponent(entityId)}`, {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/strategic-direction", entityId], data);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate strategic direction", description: err.message, variant: "destructive" });
    },
  });

  const direction = directionData?.strategicDirection;
  const hasProductContext = !!(prodCtxData?.productContext?.productName);
  const lastUpdated = direction?.updatedAt ? new Date(direction.updatedAt) : null;
  const isOlderThanWeek = lastUpdated ? (Date.now() - lastUpdated.getTime()) > 7 * 24 * 60 * 60 * 1000 : false;
  const captureCount = captures.length;
  const hasEnoughCaptures = captureCount >= 3;

  const shouldAutoGenerate = hasEnoughCaptures && !direction && !isLoading && !generateMutation.isPending;
  const shouldRegenerate = hasEnoughCaptures && direction && isOlderThanWeek && !generateMutation.isPending;

  useEffect(() => {
    if (shouldAutoGenerate || shouldRegenerate) {
      generateMutation.mutate();
    }
  }, [shouldAutoGenerate, shouldRegenerate]);

  return (
    <Card className="border-[#1e3a5f]/15" data-testid="section-strategic-direction">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Compass className="w-4 h-4 text-[#1e3a5f]" />
          <span className="text-sm font-semibold text-[#1e3a5f]">Strategic Direction</span>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600 mb-2">Where they're heading</p>
            {isLoading || generateMutation.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : !hasEnoughCaptures ? (
              <p className="text-sm text-slate-400 italic" data-testid="text-strategic-insufficient">
                Need at least 3 captures to generate strategic direction ({captureCount}/3 so far).
              </p>
            ) : direction?.whereHeading ? (
              <ReactMarkdown className="prose prose-sm max-w-none text-sm text-foreground leading-relaxed" data-testid="text-where-heading">
                {direction.whereHeading}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-slate-400 italic">Unable to generate at this time.</p>
            )}
            {hasEnoughCaptures && (
              <div className="flex items-center gap-3 mt-2">
                {lastUpdated && (
                  <span className="text-xs text-slate-400" data-testid="text-strategic-timestamp">
                    Last updated {lastUpdated.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at{" "}
                    {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
                <button
                  className="text-xs text-[#1e3a5f] hover:underline font-medium"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-regenerate-strategic"
                >
                  <RefreshCw className={`w-3 h-3 inline mr-1 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                  Regenerate
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-blue-50/50 p-3">
            <p className="text-xs font-medium text-slate-600 mb-2">What this means for you</p>
            {hasProductContext ? (
              isLoading || generateMutation.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : direction?.whatMeansForYou ? (
                <ReactMarkdown className="prose prose-sm max-w-none text-sm text-foreground leading-relaxed" data-testid="text-what-means">
                  {direction.whatMeansForYou}
                </ReactMarkdown>
              ) : !hasEnoughCaptures ? (
                <p className="text-sm text-slate-400 italic">
                  Needs enough captures to generate insights.
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">Unable to generate at this time.</p>
              )
            ) : (
              <p className="text-sm text-slate-400 italic" data-testid="text-product-context-prompt">
                Add your product details in{" "}
                <button
                  className="text-[#1e3a5f] underline hover:text-[#1e3a5f]/80"
                  onClick={() => navigate("/settings")}
                  data-testid="link-settings-product"
                >
                  Settings
                </button>
                {" "}to unlock personalised competitive insights.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PRICING_MODEL_LABELS: Record<string, string> = {
  per_service: "Per Service",
  subscription_monthly: "Monthly Sub",
  subscription_annual: "Annual Sub",
  per_transaction: "Per Transaction",
  per_unit: "Per Unit",
  per_seat: "Per Seat",
  usage_tiered: "Usage Tiered",
  freemium: "Freemium",
  commission: "Commission",
  custom: "Custom",
};

const PRICING_MODEL_COLUMNS: Record<string, { col1: string; col2: string; col3?: string; col4?: string }> = {
  per_service: { col1: "Service or Treatment", col2: "Price", col3: "Notes" },
  subscription_monthly: { col1: "Plan", col2: "Price/month", col3: "Inclusions" },
  subscription_annual: { col1: "Plan", col2: "Price/year", col3: "Min term", col4: "Inclusions" },
  per_transaction: { col1: "Transaction type", col2: "Unit price", col3: "Volume discount" },
  per_unit: { col1: "Product or SKU", col2: "Unit price", col3: "Min order" },
  per_seat: { col1: "Plan", col2: "Price/seat/month", col3: "Min seats" },
  usage_tiered: { col1: "Tier", col2: "Usage range", col3: "Price per unit" },
  freemium: { col1: "Tier", col2: "Price", col3: "Key limits" },
  commission: { col1: "Transaction type", col2: "Rate %", col3: "Notes" },
  custom: { col1: "Package", col2: "Indicative range", col3: "Notes" },
};

const PRICING_MODEL_FIELDS: Record<string, { planLabel: string; planPlaceholder: string; priceLabel: string; pricePlaceholder: string; inclusionsLabel?: string; inclusionsPlaceholder?: string }> = {
  per_service: { planLabel: "Service or Treatment", planPlaceholder: "e.g. Initial consultation, Deep clean", priceLabel: "Price", pricePlaceholder: "e.g. $150, $80-120" },
  subscription_monthly: { planLabel: "Plan", planPlaceholder: "e.g. Pro, Enterprise", priceLabel: "Price/month", pricePlaceholder: "e.g. $49/mo", inclusionsLabel: "Inclusions", inclusionsPlaceholder: "e.g. 10 seats, API access" },
  subscription_annual: { planLabel: "Plan", planPlaceholder: "e.g. Enterprise Annual", priceLabel: "Price/year", pricePlaceholder: "e.g. $499/yr", inclusionsLabel: "Min term & Inclusions", inclusionsPlaceholder: "e.g. 12 months, unlimited users" },
  per_transaction: { planLabel: "Transaction type", planPlaceholder: "e.g. ID verification, API call", priceLabel: "Unit price", pricePlaceholder: "e.g. $0.50/call", inclusionsLabel: "Volume discount", inclusionsPlaceholder: "e.g. 20% off at 10k+" },
  per_unit: { planLabel: "Product or SKU", planPlaceholder: "e.g. Widget Pro, Pack of 12", priceLabel: "Unit price", pricePlaceholder: "e.g. $24.99", inclusionsLabel: "Min order", inclusionsPlaceholder: "e.g. MOQ 100 units" },
  per_seat: { planLabel: "Plan", planPlaceholder: "e.g. Team, Business", priceLabel: "Price/seat/month", pricePlaceholder: "e.g. $12/seat/mo", inclusionsLabel: "Min seats", inclusionsPlaceholder: "e.g. 5 seats minimum" },
  usage_tiered: { planLabel: "Tier", planPlaceholder: "e.g. Standard, High volume", priceLabel: "Usage range", pricePlaceholder: "e.g. 0-1000 requests", inclusionsLabel: "Price per unit", inclusionsPlaceholder: "e.g. $0.01/request" },
  freemium: { planLabel: "Tier", planPlaceholder: "e.g. Free, Pro, Enterprise", priceLabel: "Price", pricePlaceholder: "e.g. $0, $29/mo", inclusionsLabel: "Key limits", inclusionsPlaceholder: "e.g. 3 projects, 1GB storage" },
  commission: { planLabel: "Transaction type", planPlaceholder: "e.g. Sale, Referral", priceLabel: "Rate %", pricePlaceholder: "e.g. 15%, 2.9% + $0.30", inclusionsLabel: "Notes", inclusionsPlaceholder: "e.g. Capped at $50/transaction" },
  custom: { planLabel: "Package", planPlaceholder: "e.g. Enterprise, Government", priceLabel: "Indicative range", pricePlaceholder: "e.g. $10k-50k/yr", inclusionsLabel: "Notes", inclusionsPlaceholder: "e.g. Custom SLA, dedicated support" },
};

function PricingCard({ entity }: { entity: ExtractedEntity }) {
  const { toast } = useToast();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const entityId = entity.name;
  const [pricingExpanded, setPricingExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(entity.pricing_model_detected || "per_service");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formPlan, setFormPlan] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formInclusions, setFormInclusions] = useState("");
  const [formSource, setFormSource] = useState("");

  const { data: pricingData, isLoading } = useQuery<{ pricing: CompetitorPricing[] }>({
    queryKey: ["/api/competitor-pricing", entityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitor-pricing/${encodeURIComponent(entityId)}`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { capturedDate: string; planName: string; price: string; inclusions?: string; sourceUrl?: string; pricingModel?: string }) => {
      const res = await apiRequest("POST", `/api/competitor-pricing/${encodeURIComponent(entityId)}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing", entityId] });
      setShowAddModal(false);
      resetForm();
      toast({ title: "Pricing entry added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pricingId: string) => {
      await apiRequest("DELETE", `/api/competitor-pricing/${encodeURIComponent(entityId)}/${pricingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing", entityId] });
      toast({ title: "Pricing entry removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormPlan("");
    setFormPrice("");
    setFormInclusions("");
    setFormSource("");
    setSelectedModel(entity.pricing_model_detected || "per_service");
  };

  const handleSubmit = () => {
    if (!formPlan.trim() || !formPrice.trim()) return;
    createMutation.mutate({
      capturedDate: formDate,
      planName: formPlan.trim(),
      price: formPrice.trim(),
      inclusions: formInclusions.trim() || undefined,
      sourceUrl: formSource.trim() || undefined,
      pricingModel: selectedModel,
    });
  };

  const pricing = pricingData?.pricing || [];

  const groupedPricing: Record<string, CompetitorPricing[]> = {};
  for (const entry of pricing) {
    const model = (entry as any).pricingModel || "per_service";
    if (!groupedPricing[model]) groupedPricing[model] = [];
    groupedPricing[model].push(entry);
  }
  const modelKeys = Object.keys(groupedPricing);
  const hasMultipleModels = modelKeys.length > 1;

  const renderPricingTable = (entries: CompetitorPricing[], model: string) => {
    const cols = PRICING_MODEL_COLUMNS[model] || PRICING_MODEL_COLUMNS.custom;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid={`table-pricing-${model}`}>
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">Date</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">{cols.col1}</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">{cols.col2}</th>
              {cols.col3 && <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">{cols.col3}</th>}
              {cols.col4 && <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">{cols.col4}</th>}
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500">Source</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`row-pricing-${entry.id}`}>
                <td className="py-2 px-2 text-slate-600">
                  {new Date(entry.capturedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td className="py-2 px-2 font-medium">{entry.planName}</td>
                <td className="py-2 px-2">{entry.price}</td>
                {cols.col3 && <td className="py-2 px-2 text-slate-600 max-w-[200px] truncate">{entry.inclusions || "—"}</td>}
                {cols.col4 && <td className="py-2 px-2 text-slate-600 max-w-[150px] truncate">—</td>}
                <td className="py-2 px-2">
                  {entry.sourceUrl ? (
                    <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#1e3a5f] hover:underline truncate block max-w-[120px]" data-testid={`link-pricing-source-${entry.id}`}>
                      Link
                    </a>
                  ) : "—"}
                </td>
                <td className="py-2 px-2">
                  {isEditor && (
                    <button
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      onClick={() => deleteMutation.mutate(entry.id)}
                      data-testid={`button-delete-pricing-${entry.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const fields = PRICING_MODEL_FIELDS[selectedModel] || PRICING_MODEL_FIELDS.custom;

  const pricingPreview = pricing.length > 0 ? pricing[0].planName : "No pricing data yet";

  return (
    <>
      <Card className="min-h-[80px]" data-testid="section-pricing">
        <CardContent className="p-5">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setPricingExpanded(!pricingExpanded)}
            data-testid="button-pricing-toggle"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#1e3a5f]" />
              <span className="text-sm font-semibold text-[#1e3a5f]">Pricing</span>
              {pricingExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </div>
            {pricingExpanded && isEditor && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setShowAddModal(true); }}
                data-testid="button-add-pricing"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add pricing entry
              </Button>
            )}
          </div>

          {!pricingExpanded && (
            <p className="text-sm text-slate-500 mt-2 truncate" data-testid="text-pricing-preview">
              {isLoading ? "Loading..." : pricingPreview}
            </p>
          )}

          {pricingExpanded && (
            isLoading ? (
              <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : pricing.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-4" data-testid="text-pricing-empty">
                No pricing data yet. Add what you know about their pricing — even partial info is useful.
              </p>
            ) : hasMultipleModels ? (
              <div className="space-y-4 mt-4">
                {modelKeys.map((model) => (
                  <div key={model}>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2" data-testid={`heading-pricing-model-${model}`}>
                      {PRICING_MODEL_LABELS[model] || model}
                    </h4>
                    {renderPricingTable(groupedPricing[model], model)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4">{renderPricingTable(pricing, modelKeys[0] || "per_service")}</div>
            )
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg" data-testid="modal-add-pricing">
          <DialogHeader>
            <DialogTitle>Add Pricing Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-2 block">Pricing model</label>
              <div className="flex flex-wrap gap-1.5" data-testid="pricing-model-selector">
                {Object.entries(PRICING_MODEL_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedModel === key
                        ? "bg-[#1e3a5f] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    onClick={() => setSelectedModel(key)}
                    data-testid={`pill-pricing-model-${key}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                data-testid="input-pricing-date"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{fields.planLabel}</label>
              <Input
                placeholder={fields.planPlaceholder}
                value={formPlan}
                onChange={(e) => setFormPlan(e.target.value)}
                data-testid="input-pricing-plan"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{fields.priceLabel}</label>
              <Input
                placeholder={fields.pricePlaceholder}
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                data-testid="input-pricing-price"
              />
            </div>
            {fields.inclusionsLabel && (
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{fields.inclusionsLabel}</label>
                <Input
                  placeholder={fields.inclusionsPlaceholder}
                  value={formInclusions}
                  onChange={(e) => setFormInclusions(e.target.value)}
                  data-testid="input-pricing-inclusions"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Source URL</label>
              <Input
                placeholder="https://..."
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                data-testid="input-pricing-source"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAddModal(false); resetForm(); }} data-testid="button-cancel-pricing">
              Cancel
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
              disabled={!formPlan.trim() || !formPrice.trim() || createMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-save-pricing"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
            return null;
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
        <UpdatesFeedWidget entity={entity} captures={captures} categoryName={categoryName} />
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
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
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
    <div className="border rounded-xl p-5 bg-white break-words" data-testid="widget-battlecard">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
              {lastUpdated && (
                <span className="text-[11px] text-slate-400 block" data-testid="text-battlecard-timestamp">
                  Updated {lastUpdated.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at{" "}
                  {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              )}

              {!hasData && isEditor && autofillButton}

              <div className="rounded-lg bg-slate-50 p-4 mb-3">
                <p className="text-sm font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                  <span>📝</span> What they do
                  {isEditor && <Pencil className="w-3 h-3 ml-auto opacity-40" />}
                </p>
                {isEditor ? (
                  <EditableText
                    value={bc?.whatTheyDo || ""}
                    onSave={(val) => updateMutation.mutate({ whatTheyDo: val })}
                    placeholder="Click to describe what this competitor does..."
                    testId="input-battlecard-what"
                  />
                ) : (
                  <p className="text-sm text-slate-700" data-testid="input-battlecard-what">{bc?.whatTheyDo || <span className="text-slate-400 italic">No description yet.</span>}</p>
                )}
              </div>

              <div className="rounded-lg bg-green-50 p-4 mb-3 border-l-4 border-green-400">
                <p className="text-sm font-semibold text-green-700 mb-1.5 flex items-center gap-1">
                  <span>💪</span> Their strengths
                  {isEditor && <Pencil className="w-3 h-3 ml-auto opacity-40" />}
                </p>
                {isEditor ? (
                  <EditableBulletList
                    items={(bc?.strengths as string[]) || []}
                    onSave={(items) => updateMutation.mutate({ strengths: items })}
                    placeholder="Click to add their strengths..."
                    testId="input-battlecard-strengths"
                  />
                ) : (
                  <ul className="space-y-1" data-testid="input-battlecard-strengths">
                    {((bc?.strengths as string[]) || []).length > 0 ? (bc?.strengths as string[]).map((s, i) => <li key={i} className="text-sm text-slate-700">• {s}</li>) : <li className="text-sm text-slate-400 italic">No strengths listed yet.</li>}
                  </ul>
                )}
              </div>

              <div className="rounded-lg bg-red-50 p-4 mb-3 border-l-4 border-red-400">
                <p className="text-sm font-semibold text-red-700 mb-1.5 flex items-center gap-1">
                  <span>🎯</span> Their weaknesses
                  {isEditor && <Pencil className="w-3 h-3 ml-auto opacity-40" />}
                </p>
                {isEditor ? (
                  <EditableBulletList
                    items={(bc?.weaknesses as string[]) || []}
                    onSave={(items) => updateMutation.mutate({ weaknesses: items })}
                    placeholder="Click to add their weaknesses..."
                    testId="input-battlecard-weaknesses"
                  />
                ) : (
                  <ul className="space-y-1" data-testid="input-battlecard-weaknesses">
                    {((bc?.weaknesses as string[]) || []).length > 0 ? (bc?.weaknesses as string[]).map((s, i) => <li key={i} className="text-sm text-slate-700">• {s}</li>) : <li className="text-sm text-slate-400 italic">No weaknesses listed yet.</li>}
                  </ul>
                )}
              </div>

              <div className="rounded-lg bg-blue-50 p-4 mb-3 border-l-4 border-blue-500">
                <p className="text-sm font-semibold text-blue-700 mb-1.5 flex items-center gap-1">
                  <span>🏆</span> How to beat them
                  {isEditor && <Pencil className="w-3 h-3 ml-auto opacity-40" />}
                </p>
                {isEditor ? (
                  <EditableBulletList
                    items={(bc?.howToBeat as string[]) || []}
                    onSave={(items) => updateMutation.mutate({ howToBeat: items })}
                    placeholder="Click to add competitive strategies..."
                    testId="input-battlecard-howtobeat"
                  />
                ) : (
                  <ul className="space-y-1" data-testid="input-battlecard-howtobeat">
                    {((bc?.howToBeat as string[]) || []).length > 0 ? (bc?.howToBeat as string[]).map((s, i) => <li key={i} className="text-sm text-slate-700">• {s}</li>) : <li className="text-sm text-slate-400 italic">No strategies listed yet.</li>}
                  </ul>
                )}
                <p className="text-[11px] text-blue-500 mt-2 italic" data-testid="text-product-context-hint">
                  Add your product details in Settings for personalised advice.
                </p>
              </div>

        {hasData && isEditor && autofillButton}
      </div>
      )}
    </div>
  );
}

function BattlecardCollapsedHeader({
  entity,
  categoryName,
  expanded,
  onToggle,
}: {
  entity: ExtractedEntity;
  categoryName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { toast } = useToast();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const [editingBattlecard, setEditingBattlecard] = useState(false);
  const [battlecardEditText, setBattlecardEditText] = useState("");

  const { data: bcData, isLoading } = useQuery<{ battlecard: Battlecard | null }>({
    queryKey: ["/api/battlecard", entity.name],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/battlecard/${encodeURIComponent(entity.name)}`);
      return res.json();
    },
  });

  const autofillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/battlecard/${encodeURIComponent(entity.name)}/autofill`, {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/battlecard", entity.name], data);
      toast({ title: "Battlecard generated with AI." });
      if (!expanded) onToggle();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate battlecard", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (text: string) => {
      const sections: Record<string, string[]> = { whatTheyDo: [], strengths: [], weaknesses: [], howToBeat: [] };
      let currentSection = "whatTheyDo";
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase().replace(/[:#\-*]/g, "").trim();
        if (lower === "what they do") { currentSection = "whatTheyDo"; continue; }
        if (lower === "strengths") { currentSection = "strengths"; continue; }
        if (lower === "weaknesses") { currentSection = "weaknesses"; continue; }
        if (lower === "how to beat") { currentSection = "howToBeat"; continue; }
        if (trimmed) sections[currentSection].push(trimmed);
      }
      const res = await apiRequest("PUT", `/api/battlecard/${encodeURIComponent(entity.name)}`, {
        whatTheyDo: sections.whatTheyDo.join("\n"),
        strengths: sections.strengths,
        weaknesses: sections.weaknesses,
        howToBeat: sections.howToBeat,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/battlecard", entity.name] });
      toast({ title: "Battlecard updated." });
      setEditingBattlecard(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const bc = bcData?.battlecard;
  const firstStrength = (bc?.strengths as string[])?.[0] || null;
  const hasBattlecard = !!(bc?.whatTheyDo || firstStrength || (bc?.weaknesses as string[])?.length || (bc?.howToBeat as string[])?.length);

  function buildEditText() {
    const parts: string[] = [];
    parts.push("## What They Do");
    parts.push(bc?.whatTheyDo || "");
    parts.push("");
    parts.push("## Strengths");
    if ((bc?.strengths as string[])?.length) parts.push(...(bc!.strengths as string[]));
    parts.push("");
    parts.push("## Weaknesses");
    if ((bc?.weaknesses as string[])?.length) parts.push(...(bc!.weaknesses as string[]));
    parts.push("");
    parts.push("## How To Beat");
    if ((bc?.howToBeat as string[])?.length) parts.push(...(bc!.howToBeat as string[]));
    return parts.join("\n");
  }

  return (
    <Card className="min-h-[80px]" data-testid="widget-battlecard-header">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚔️</span>
            <span className="text-sm font-semibold text-[#1e3a5f]">Battlecard</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!hasBattlecard && !isLoading && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-[#1e3a5f]/30 text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                onClick={() => autofillMutation.mutate()}
                disabled={autofillMutation.isPending}
                data-testid="button-generate-battlecard"
              >
                {autofillMutation.isPending ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />Generate Battlecard</>
                )}
              </Button>
            )}
            {hasBattlecard && expanded && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-[#1e3a5f]/30 text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                onClick={() => autofillMutation.mutate()}
                disabled={autofillMutation.isPending}
                data-testid="button-regenerate-battlecard"
              >
                {autofillMutation.isPending ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />Regenerate</>
                )}
              </Button>
            )}
            {isEditor && !editingBattlecard && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-[#1e3a5f]/30 text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                onClick={() => { setBattlecardEditText(buildEditText()); setEditingBattlecard(true); }}
                data-testid="button-edit-battlecard"
              >
                <Pencil className="w-3 h-3 mr-1" />Edit
              </Button>
            )}
            <Button
              size="sm"
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white text-xs"
              onClick={onToggle}
              data-testid="button-view-battlecard"
            >
              {expanded ? "Close" : "View Battlecard"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate" data-testid="text-battlecard-preview">
          {isLoading ? "Loading..." : firstStrength || "No battlecard yet"}
        </p>
        {editingBattlecard && (
          <div className="mt-3 space-y-2">
            <textarea
              value={battlecardEditText}
              onChange={(e) => setBattlecardEditText(e.target.value)}
              rows={8}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 resize-vertical font-inherit"
              data-testid="textarea-battlecard-edit"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => setEditingBattlecard(false)}
                data-testid="button-cancel-battlecard-edit"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white text-xs"
                onClick={() => editMutation.mutate(battlecardEditText)}
                disabled={editMutation.isPending}
                data-testid="button-save-battlecard-edit"
              >
                {editMutation.isPending ? "Saving..." : "Save"}
              </Button>
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
            <p className="text-3xl font-bold text-[#1e3a5f]" data-testid="stat-updates-month">{updatesThisMonth}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Updates this month</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-[#1e3a5f]" data-testid="stat-first-tracked">
              {firstTracked
                ? firstTracked.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">First tracked</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-[#1e3a5f]" data-testid="stat-last-activity">
              {lastActivity
                ? lastActivity.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Last activity</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const statusConfig: Record<string, { emoji: string; label: string; bgClass: string; textClass: string }> = {
  yes: { emoji: "\u2705", label: "Yes", bgClass: "bg-green-100", textClass: "text-green-800" },
  no: { emoji: "\u274C", label: "No", bgClass: "bg-red-100", textClass: "text-red-800" },
  partial: { emoji: "\u26A0\uFE0F", label: "Partial", bgClass: "bg-amber-100", textClass: "text-amber-800" },
  unknown: { emoji: "\u2753", label: "Unknown", bgClass: "bg-slate-100", textClass: "text-slate-500" },
};

function CompetitorCapabilitiesCard({ entityName }: { entityName: string }) {
  const { toast } = useToast();
  const entityId = entityName;
  const [capabilitiesExpanded, setCapabilitiesExpanded] = useState(false);
  const [expandedCapabilityId, setExpandedCapabilityId] = useState<string | null>(null);

  const { data: capData } = useQuery<{ capabilities: WorkspaceCapability[] }>({
    queryKey: ["/api/capabilities"],
  });

  const { data: compCapData } = useQuery<{ competitorCapabilities: CompetitorCapability[] }>({
    queryKey: ["/api/competitor-capabilities", entityId],
  });

  const capabilities = capData?.capabilities || [];
  const competitorCaps = compCapData?.competitorCapabilities || [];

  const updateMutation = useMutation({
    mutationFn: async ({ capabilityId, status, evidence }: { capabilityId: string; status: string; evidence?: string | null }) => {
      const res = await apiRequest("PUT", `/api/competitor-capabilities/${encodeURIComponent(entityId)}`, {
        capabilityId,
        status,
        evidence,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-capabilities", entityId] });
      queryClient.invalidateQueries({ queryKey: ["/api/all-competitor-capabilities"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (capabilities.length === 0) {
    return null;
  }

  const getCapStatus = (capId: string) => {
    const found = competitorCaps.find(cc => cc.capabilityId === capId);
    return found?.status || "unknown";
  };

  const getCapEvidence = (capId: string) => {
    const found = competitorCaps.find(cc => cc.capabilityId === capId);
    return found?.evidence || "";
  };

  const statusDotClass: Record<string, string> = {
    yes: "bg-green-500",
    no: "bg-red-500",
    partial: "bg-amber-500",
    unknown: "bg-slate-300",
  };

  const first3 = capabilities.slice(0, 3);

  return (
    <Card data-testid="card-competitor-capabilities">
      <CardContent className="p-5">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setCapabilitiesExpanded(!capabilitiesExpanded)}
          data-testid="button-capabilities-toggle"
        >
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[#1e3a5f]" />
            <span className="text-sm font-semibold text-[#1e3a5f]">Capabilities ({capabilities.length})</span>
            {capabilitiesExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
          {!capabilitiesExpanded && (
            <div className="flex items-center gap-1.5">
              {first3.map((cap) => {
                const st = getCapStatus(cap.id);
                return (
                  <div key={cap.id} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass[st] || "bg-slate-300"}`} />
                    <span className="text-xs text-slate-500">{cap.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </button>

        {capabilitiesExpanded && (
          <div className="mt-3">
            {capabilities.map((cap) => {
              const currentStatus = getCapStatus(cap.id);
              const evidence = getCapEvidence(cap.id);
              const isExpanded = expandedCapabilityId === cap.id;

              const badgeClass: Record<string, string> = {
                yes: "bg-green-100 text-green-700",
                no: "bg-red-100 text-red-700",
                partial: "bg-amber-100 text-amber-700",
                unknown: "bg-slate-100 text-slate-500",
              };
              const badgeLabel: Record<string, string> = {
                yes: "Yes", no: "No", partial: "Partial", unknown: "Unknown",
              };

              return (
                <div key={cap.id} data-testid={`capability-row-${cap.id}`}>
                  <div
                    className="flex items-center justify-between py-2 border-b border-slate-100 cursor-pointer hover:bg-slate-50 rounded px-1"
                    onClick={() => setExpandedCapabilityId(isExpanded ? null : cap.id)}
                  >
                    <span className="text-sm font-medium">{cap.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass[currentStatus] || badgeClass.unknown}`}>
                      {badgeLabel[currentStatus] || "Unknown"}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="px-1 py-2 bg-slate-50 rounded-b mb-1 space-y-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {(["yes", "no", "partial", "unknown"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateMutation.mutate({ capabilityId: cap.id, status: s })}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                              currentStatus === s
                                ? `${badgeClass[s]} ring-1 ring-current/20`
                                : "bg-white border border-slate-200 text-slate-400 hover:bg-slate-100"
                            }`}
                            data-testid={`capability-status-${cap.id}-${s}`}
                          >
                            {badgeLabel[s]}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        defaultValue={evidence}
                        onBlur={(e) => {
                          if (e.target.value !== evidence) {
                            updateMutation.mutate({ capabilityId: cap.id, status: currentStatus, evidence: e.target.value });
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="Add a note or source..."
                        className="w-full text-xs bg-white border border-border/50 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 placeholder:text-slate-300"
                        data-testid={`capability-evidence-${cap.id}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
  const [serverLimitReached, setServerLimitReached] = useState(false);

  const webSearchCaptures = captures
    .filter((c) => c.type === "web_search")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const lastSearched = webSearchCaptures.length > 0 ? new Date(webSearchCaptures[0].createdAt) : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayManualCount = captures.filter(
    (c) => c.type === "web_search" && c.matchReason?.includes("Manual web search") && new Date(c.createdAt) >= today
  ).length;
  const limitReached = serverLimitReached;

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
      const isLimitError = err.message.includes("limit reached") || err.message.startsWith("429:");
      let displayMessage = err.message;
      if (err.message.startsWith("429:")) {
        try {
          const jsonPart = err.message.slice(err.message.indexOf("{"));
          const parsed = JSON.parse(jsonPart);
          displayMessage = parsed.message || "Daily search limit reached for today.";
        } catch {
          displayMessage = "Daily search limit reached for today.";
        }
      }
      if (isLimitError) {
        setServerLimitReached(true);
        queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      }
      toast({
        title: isLimitError ? "Limit reached" : "Search failed",
        description: displayMessage,
        variant: isLimitError ? "default" : "destructive",
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
          Search limit reached for today. Signalum will automatically search again tomorrow.
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
          {Math.max(0, 3 - todayManualCount)} search{Math.max(0, 3 - todayManualCount) !== 1 ? "es" : ""} remaining today
        </p>
      )}
    </div>
  );
}

function CaptureSourceIndicator({ capture }: { capture: Capture }) {
  const sourceUrlMatch = capture.content.match(/\n\nSource: (https?:\/\/[^\s]+)/);
  const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : null;
  const isHiringSignal = capture.matchReason?.includes("[signal_type:hiring_signal]");

  let icon: typeof Globe | typeof Pencil | typeof Briefcase = Pencil;
  let label = "Added manually";

  if (isHiringSignal) {
    icon = Briefcase;
    label = "Hiring signal";
  } else if (capture.type === "web_search") {
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

  const pillContent = isHiringSignal ? (
    <span className="inline-flex items-center gap-1 text-[11px]" data-testid={`source-indicator-${capture.id}`}>
      <SourceIcon className="w-3 h-3 text-amber-600" />
      <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-medium">Hiring signal</span>
    </span>
  ) : (
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
        className={`inline-flex items-center gap-1 text-[11px] mt-2 transition-colors max-w-full overflow-hidden break-all ${isHiringSignal ? "text-amber-600 hover:text-amber-800" : "text-slate-500 hover:text-[#1e3a5f]"} hover:underline`}
        data-testid={`source-link-${capture.id}`}
      >
        <SourceIcon className={`w-3 h-3 ${isHiringSignal ? "text-amber-600" : "text-[#1e3a5f]"}`} />
        {isHiringSignal ? (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-medium">Hiring signal</span>
        ) : (
          <span>{label}</span>
        )}
      </a>
    );
  }

  return <div className="mt-2">{pillContent}</div>;
}

function getSignalStrength(cap: Capture): "high" | "medium" | "low" | null {
  if (!cap.matchReason) return null;
  const match = cap.matchReason.match(/\[(high|medium|low)\]/);
  return match ? (match[1] as "high" | "medium" | "low") : null;
}

type SignalFilter = "all" | "notable" | "high";

function getSignalCardStyles(strength: "high" | "medium" | "low" | null): {
  wrapperClass: string;
  cardClass: string;
  bodyTextClass: string;
} {
  if (strength === "high") {
    return {
      wrapperClass: "border-l-[3px] border-l-[#c9a84c] rounded-lg overflow-hidden shadow-sm",
      cardClass: "border-border/60 rounded-l-none",
      bodyTextClass: "text-[15px] text-foreground",
    };
  }
  if (strength === "low") {
    return {
      wrapperClass: "",
      cardClass: "border-border/60 opacity-[0.65]",
      bodyTextClass: "text-[15px] text-muted-foreground",
    };
  }
  return {
    wrapperClass: "",
    cardClass: "border-border/60",
    bodyTextClass: "text-[15px] text-foreground",
  };
}

function scrollToCapture(captureId: number) {
  const el = document.querySelector(`[data-testid="card-update-${captureId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("gold-flash-highlight");
    setTimeout(() => el.classList.remove("gold-flash-highlight"), 400);
  }
}

function KeySignalsSection({ highSignalCaptures }: { highSignalCaptures: Capture[] }) {
  const [expanded, setExpanded] = useState(true);
  const recent = highSignalCaptures.slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <Card className="border-[#c9a84c]/30 bg-[#c9a84c]/[0.04] mb-4" data-testid="key-signals-section">
      <CardContent className="p-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          data-testid="key-signals-toggle"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#c9a84c]" />
            <span className="text-sm font-bold text-[#1e3a5f] dark:text-foreground">Key signals</span>
            <Badge className="bg-[#c9a84c]/15 text-[#c9a84c] border-[#c9a84c]/30 text-[10px] px-1.5 py-0">{highSignalCaptures.length}</Badge>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {expanded && (
          <div className="px-4 pb-3 space-y-1.5">
            {recent.map((cap) => {
              const isHiring = cap.matchReason?.includes("[signal_type:hiring_signal]");
              const Icon = isHiring ? Briefcase : (captureTypeIcons[cap.type] || FileText);
              return (
                <button
                  key={cap.id}
                  onClick={() => scrollToCapture(cap.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#c9a84c]/10 dark:hover:bg-[#c9a84c]/20 transition-colors text-left"
                  data-testid={`key-signal-row-${cap.id}`}
                >
                  <Icon className="w-3.5 h-3.5 text-[#1e3a5f] dark:text-[#c9a84c] shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1 min-w-0">
                    {(cap.content || "").slice(0, 120)}
                    {(cap.content || "").length > 120 ? "…" : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(cap.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/30 text-[9px] font-medium whitespace-nowrap shrink-0">
                    High Signal
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpdatesFeedWidget({
  entity,
  captures,
  categoryName,
}: {
  entity: ExtractedEntity;
  captures: Capture[];
  categoryName: string;
}) {
  const storageKey = `signal-filter-${categoryName}-${entity.name}`;
  const [filter, setFilter] = useState<SignalFilter>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "all" || saved === "notable" || saved === "high") return saved;
    } catch {}
    return "all";
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, filter); } catch {}
  }, [filter, storageKey]);

  const highSignalCaptures = captures.filter((cap) => getSignalStrength(cap) === "high");

  const filteredCaptures = captures.filter((cap) => {
    if (filter === "all") return true;
    const strength = getSignalStrength(cap);
    if (filter === "notable") return strength === "high" || strength === "medium" || strength === null;
    if (filter === "high") return strength === "high";
    return true;
  });

  const filterOptions: { value: SignalFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "notable", label: "Notable" },
    { value: "high", label: "High Signal" },
  ];

  return (
    <div data-testid="widget-updates-feed">
      <KeySignalsSection highSignalCaptures={highSignalCaptures} />

      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Updates ({filteredCaptures.length})
        </p>
        <div className="flex gap-1" role="tablist" aria-label="Signal strength filter" data-testid="signal-filter-tabs">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              role="tab"
              aria-selected={filter === opt.value}
              onClick={() => setFilter(opt.value)}
              data-testid={`filter-${opt.value}`}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {filteredCaptures.length > 0 ? (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-3 pr-2">
            {filteredCaptures.map((cap) => {
              const isHiring = cap.matchReason?.includes("[signal_type:hiring_signal]");
              const Icon = isHiring ? Briefcase : (captureTypeIcons[cap.type] || FileText);
              const strength = getSignalStrength(cap);
              const effectiveStrength = strength ?? "medium";
              const styles = getSignalCardStyles(effectiveStrength);
              const cardEl = (
                <Card className={`relative overflow-hidden max-w-full ${styles.cardClass}`} data-testid={`card-update-${cap.id}`}>
                  {effectiveStrength === "high" && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/30 text-[9px] font-medium" data-testid={`signal-pill-${cap.id}`}>
                      High Signal
                    </span>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-1 ${isHiring ? "bg-amber-100" : "bg-[#1e3a5f]/10"}`}>
                        <Icon className={`w-4 h-4 ${isHiring ? "text-amber-600" : "text-[#1e3a5f]"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`${styles.bodyTextClass} whitespace-pre-wrap break-words leading-relaxed`}>
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
              return styles.wrapperClass ? (
                <div key={cap.id} className={`${styles.wrapperClass} max-w-full overflow-hidden`}>{cardEl}</div>
              ) : cardEl;
            })}
          </div>
        </ScrollArea>
      ) : (
        <Card className="border-dashed border-border">
          <CardContent className="p-8 text-center">
            <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-1">
              {filter === "all" ? "No updates captured yet." : "No updates match this filter."}
            </p>
            <p className="text-xs text-muted-foreground">
              {filter === "all"
                ? `Use Capture or the inline form to add updates about ${entity.name}.`
                : "Try switching to \"All\" to see all updates."}
            </p>
          </CardContent>
        </Card>
      )}

      <PricingSignalDetection entity={entity} captures={captures} categoryName={categoryName} />
    </div>
  );
}

function inferPricingModelFromText(text: string): string | null {
  const lower = text.toLowerCase();
  if (/per\s+(session|treatment|consultation|service|appointment)/i.test(lower)) return "per_service";
  if (/per\s+(month|mo\b)|subscribe|monthly\s+plan|\/month/i.test(lower)) return "subscription_monthly";
  if (/per\s+(year|yr\b|annum)|annual\s+(plan|subscription|contract)|\/year/i.test(lower)) return "subscription_annual";
  if (/per\s+(verification|call|transaction|api\s+call)|per\s+use\b/i.test(lower)) return "per_transaction";
  if (/per\s+(unit|item|piece|product)|unit\s+price/i.test(lower)) return "per_unit";
  if (/per\s+(user|seat|licence|license)/i.test(lower)) return "per_seat";
  if (/usage[\s-]*(based|tiered)|tiered\s+pricing|pay[\s-]*as[\s-]*you[\s-]*go/i.test(lower)) return "usage_tiered";
  if (/freemium|free\s+tier|free\s+plan.*paid/i.test(lower)) return "freemium";
  if (/commission|revenue\s+share|broker\s+fee|marketplace\s+fee/i.test(lower)) return "commission";
  if (/custom\s+(pricing|quote|contract)|contact\s+(sales|us)/i.test(lower)) return "custom";
  return null;
}

function PricingSignalDetection({ entity, captures, categoryName }: { entity: ExtractedEntity; captures: Capture[]; categoryName: string }) {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const pricingCaptures = captures.filter((cap) => {
    if (dismissed.has(cap.id)) return false;
    if (cap.type !== "web_search") return false;
    const pricingKeywords = /\b(price|pricing|plan|tier|cost|per month|per year|per seat|per user|per call|per transaction|subscription|free trial|freemium)\b/i;
    return pricingKeywords.test(cap.content);
  }).slice(0, 3);

  const createMutation = useMutation({
    mutationFn: async (data: { capturedDate: string; planName: string; price: string; pricingModel: string; sourceUrl?: string }) => {
      const res = await apiRequest("POST", `/api/competitor-pricing/${encodeURIComponent(entity.name)}`, data);
      return res.json();
    },
    onSuccess: (_data, _vars, context) => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing", entity.name] });
      toast({ title: "Pricing entry saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (pricingCaptures.length === 0) return null;

  return (
    <div className="mt-4 space-y-2" data-testid="pricing-signal-detection">
      {pricingCaptures.map((cap) => {
        const inferredModel = inferPricingModelFromText(cap.content) || entity.pricing_model_detected || "per_service";
        const sourceMatch = cap.content.match(/Source:\s*(https?:\/\/[^\s]+)/);
        const sourceUrl = sourceMatch ? sourceMatch[1] : undefined;
        const summary = cap.content.replace(/\n\nSource:.*$/, "").trim();
        const priceMatch = summary.match(/\$[\d,.]+(?:\/\w+)?/);
        const price = priceMatch ? priceMatch[0] : "";

        return (
          <Card key={cap.id} className="border-[#1e3a5f]/20 bg-[#1e3a5f]/[0.02]" data-testid={`pricing-signal-${cap.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Tag className="w-4 h-4 text-[#1e3a5f] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1e3a5f] mb-1">Pricing detected</p>
                  <p className="text-sm text-foreground line-clamp-2 mb-2">{summary.slice(0, 150)}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge variant="outline" className="text-[10px]">{PRICING_MODEL_LABELS[inferredModel] || inferredModel}</Badge>
                    {price && <Badge variant="outline" className="text-[10px]">{price}</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white h-7 px-3 text-xs"
                      disabled={createMutation.isPending}
                      onClick={() => {
                        createMutation.mutate({
                          capturedDate: new Date().toISOString().split("T")[0],
                          planName: summary.slice(0, 80),
                          price: price || "See source",
                          pricingModel: inferredModel,
                          sourceUrl,
                        });
                        setDismissed(prev => new Set(prev).add(cap.id));
                      }}
                      data-testid={`button-confirm-pricing-signal-${cap.id}`}
                    >
                      {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Save to Pricing
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-3 text-xs text-muted-foreground"
                      onClick={() => setDismissed(prev => new Set(prev).add(cap.id))}
                      data-testid={`button-dismiss-pricing-signal-${cap.id}`}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RecentSignalsCard({ captures }: { captures: Capture[] }) {
  const highSignalCaptures = captures
    .filter((cap) => getSignalStrength(cap) === "high")
    .slice(0, 3);

  return (
    <Card data-testid="recent-signals-card" data-tour="key-signals">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[#c9a84c]" />
          <span className="text-sm font-semibold text-[#1e3a5f] dark:text-foreground">Recent signals</span>
        </div>
        {highSignalCaptures.length > 0 ? (
          <div className="space-y-1.5">
            {highSignalCaptures.map((cap) => (
              <button
                key={cap.id}
                onClick={() => scrollToCapture(cap.id)}
                className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/80 transition-colors text-left"
                data-testid={`recent-signal-row-${cap.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">
                    {(cap.content || "").slice(0, 100)}
                    {(cap.content || "").length > 100 ? "…" : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(cap.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="px-1.5 py-0.5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/30 text-[9px] font-medium whitespace-nowrap shrink-0 mt-0.5">
                  High Signal
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic" data-testid="recent-signals-empty">
            No high signal updates yet. High signal events will appear here as they are captured.
          </p>
        )}
      </CardContent>
    </Card>
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
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
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
    <Card className={cardBorder} data-testid="card-dates-deadlines" data-tour="dates-deadlines">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1e3a5f]" />
            <h3 className="text-sm font-semibold text-[#1e3a5f]" data-testid="text-dates-header">Dates and Deadlines</h3>
            {isProminent && hasUrgent && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" data-testid="icon-dates-warning" />
            )}
          </div>
          {isEditor && (
            <button
              onClick={openAddModal}
              className="w-6 h-6 rounded flex items-center justify-center bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 transition-colors"
              data-testid="button-add-date"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
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
                  ? "Regulations and deadlines go hand in hand. Add the key compliance dates for this topic so Signalum can keep you on track."
                  : topicType === "risk"
                  ? "Tracking risk means staying ahead of key dates. Add the important deadlines for this risk so Signalum can keep you on track."
                  : "Events revolve around dates. Add the key dates for this event so Signalum can keep you on track."}
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
                  {isEditor && (
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const urlCategoryOptions = [
  { value: "pricing", label: "Pricing", color: "bg-blue-100 text-blue-800" },
  { value: "product", label: "Product", color: "bg-purple-100 text-purple-800" },
  { value: "news", label: "News", color: "bg-green-100 text-green-800" },
  { value: "careers", label: "Careers", color: "bg-amber-100 text-amber-800" },
  { value: "custom", label: "Custom", color: "bg-gray-100 text-gray-800" },
];

const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "every_3_days", label: "Every 3 days" },
  { value: "weekly", label: "Weekly" },
];

function MonitoredUrlsCard({ entity }: { entity: ExtractedEntity }) {
  const { toast } = useToast();
  const entityId = entity.name;
  const [showAddModal, setShowAddModal] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("pricing");
  const [formFrequency, setFormFrequency] = useState("daily");

  const { data: urlsData, isLoading } = useQuery<{ monitoredUrls: MonitoredUrl[] }>({
    queryKey: ["/api/topics", entityId, "monitored-urls"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/topics/${encodeURIComponent(entityId)}/monitored-urls`);
      return res.json();
    },
  });

  const urls = urlsData?.monitoredUrls ?? [];

  const resetForm = () => {
    setFormUrl("");
    setFormCategory("pricing");
    setFormFrequency("daily");
  };

  const createMutation = useMutation({
    mutationFn: async (data: { url: string; urlCategory: string; checkFrequency: string }) => {
      const res = await apiRequest("POST", `/api/topics/${encodeURIComponent(entityId)}/monitored-urls`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entityId, "monitored-urls"] });
      setShowAddModal(false);
      resetForm();
      toast({ title: "URL added successfully.", className: "bg-green-50 border-green-200 text-green-800" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (urlId: string) => {
      const res = await apiRequest("DELETE", `/api/topics/${encodeURIComponent(entityId)}/monitored-urls/${urlId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entityId, "monitored-urls"] });
      toast({ title: "URL removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!formUrl.trim()) return;
    createMutation.mutate({
      url: formUrl.trim(),
      urlCategory: formCategory,
      checkFrequency: formFrequency,
    });
  };

  const getCategoryPill = (category: string) => {
    const opt = urlCategoryOptions.find(o => o.value === category);
    return opt || { label: category, color: "bg-gray-100 text-gray-800" };
  };

  const getFrequencyLabel = (freq: string) => {
    const opt = frequencyOptions.find(o => o.value === freq);
    return opt?.label || freq;
  };

  const truncateUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const display = parsed.hostname + parsed.pathname;
      return display.length > 40 ? display.slice(0, 37) + "..." : display;
    } catch {
      return url.length > 40 ? url.slice(0, 37) + "..." : url;
    }
  };

  return (
    <>
      <Card data-testid="card-monitored-urls">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#1e3a5f]" />
              <h3 className="font-semibold text-[#1e3a5f]" data-testid="text-monitored-urls-title">Monitored URLs</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
              data-testid="button-add-monitored-url"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : urls.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-urls">No URLs yet.</p>
          ) : (
            <div className="space-y-2">
              {urls.map((monitoredUrl) => {
                const pill = getCategoryPill(monitoredUrl.urlCategory);
                return (
                  <div
                    key={monitoredUrl.id}
                    className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-gray-50 group"
                    data-testid={`row-monitored-url-${monitoredUrl.id}`}
                  >
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${pill.color}`} data-testid={`badge-category-${monitoredUrl.id}`}>
                      {pill.label}
                    </span>
                    <a
                      href={monitoredUrl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate flex-1 min-w-0"
                      title={monitoredUrl.url}
                      data-testid={`link-url-${monitoredUrl.id}`}
                    >
                      {truncateUrl(monitoredUrl.url)}
                    </a>
                    <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-frequency-${monitoredUrl.id}`}>
                      {getFrequencyLabel(monitoredUrl.checkFrequency)}
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(monitoredUrl.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 shrink-0"
                      data-testid={`button-remove-url-${monitoredUrl.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent data-testid="dialog-add-monitored-url">
          <DialogHeader>
            <DialogTitle>Add Monitored URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">URL</label>
              <Input
                placeholder="https://example.com/pricing"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                data-testid="input-monitored-url"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {urlCategoryOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFormCategory(opt.value)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
                      formCategory === opt.value
                        ? `${opt.color} border-current ring-1 ring-current/20`
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid={`button-category-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Check Frequency</label>
              <div className="flex flex-wrap gap-2">
                {frequencyOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFormFrequency(opt.value)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
                      formFrequency === opt.value
                        ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid={`button-frequency-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }} data-testid="button-cancel-add-url">
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!formUrl.trim() || createMutation.isPending}
              data-testid="button-save-monitored-url"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface InlineExtractedDate {
  date: string;
  label: string;
  date_type: string;
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
  const [inlineDates, setInlineDates] = useState<InlineExtractedDate[]>([]);
  const [trackingInlineDate, setTrackingInlineDate] = useState<number | null>(null);

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
    onSuccess: (_data, content) => {
      const capturedContent = content;
      setText("");
      setShowConfirmation(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setShowConfirmation(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entity-summary", entity.name, categoryName] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-insights", entity.name, categoryName] });

      setInlineDates([]);
      apiRequest("POST", "/api/extract-dates", { content: capturedContent })
        .then(res => res.json())
        .then(data => {
          setInlineDates(Array.isArray(data.extracted_dates) ? data.extracted_dates : []);
        })
        .catch(() => { setInlineDates([]); });
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

  const handleTrackInlineDate = async (dateItem: InlineExtractedDate, index: number) => {
    setTrackingInlineDate(index);
    try {
      await apiRequest("POST", `/api/topics/${encodeURIComponent(entity.name)}/dates`, {
        label: dateItem.label,
        date: dateItem.date,
        dateType: dateItem.date_type,
        source: "ai_extracted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entity.name, "dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-dates/all"] });
      setInlineDates(prev => prev.filter((_, i) => i !== index));
      toast({ title: "Date tracked", description: `${dateItem.label} added to ${entity.name}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not track date.", variant: "destructive" });
    } finally {
      setTrackingInlineDate(null);
    }
  };

  const handleDismissInlineDate = (index: number) => {
    setInlineDates(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card data-testid="card-inline-capture" data-tour="quick-capture">
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
        {inlineDates.map((dateItem, index) => (
          <div key={index} className="mt-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md px-3 py-2" data-testid={`inline-date-prompt-${index}`}>
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm text-blue-800 dark:text-blue-300 flex-1">
              {dateItem.date} — {dateItem.label}. Track this?
            </span>
            <button
              onClick={() => handleDismissInlineDate(index)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5"
              data-testid={`button-inline-date-no-${index}`}
            >
              No
            </button>
            <button
              onClick={() => handleTrackInlineDate(dateItem, index)}
              disabled={trackingInlineDate === index}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 px-1.5 py-0.5"
              data-testid={`button-inline-date-yes-${index}`}
            >
              {trackingInlineDate === index ? "..." : "Yes"}
            </button>
          </div>
        ))}
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
            Add some updates and Signalum will generate insights here.
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
  const [aspectWebsiteUrl, setAspectWebsiteUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setAspects([]);
    setCustomText("");
    setAspectWebsiteUrl("");
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
      const payload: any = {
        entityName,
        categoryName,
        disambiguation_context: aspect,
      };
      if (aspectWebsiteUrl.trim()) {
        payload.website_url = aspectWebsiteUrl.trim();
      }
      await apiRequest("POST", "/api/entity/confirm-disambiguation", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      toast({
        title: `Signalum will now track ${entityName} for ${aspect}.`,
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
          <div className="pt-2">
            <label className="text-xs text-muted-foreground mb-1 block">Their website</label>
            <Input
              value={aspectWebsiteUrl}
              onChange={(e) => setAspectWebsiteUrl(e.target.value)}
              placeholder="https://example.com — improves accuracy significantly"
              className="h-9 text-sm"
              data-testid="input-aspect-website"
            />
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

  const isReviewBanner = (entity.needs_aspect_review ?? false) && !entity.disambiguation_context;
  const isContextBanner = !!entity.disambiguation_context && !(entity.disambiguation_confirmed ?? false);
  const isNeedsReviewWithContext = (entity.needs_aspect_review ?? false) && !!entity.disambiguation_context;

  useEffect(() => {
    if (isReviewBanner || isNeedsReviewWithContext) return;
    if (!entity.disambiguation_context || (entity.disambiguation_confirmed ?? false)) return;

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
  }, [entity.name, entity.disambiguation_context, entity.disambiguation_confirmed ?? false, entity.needs_aspect_review ?? false, categoryName, user?.id, isReviewBanner]);

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
          ? `Got it. All searches will focus on ${entity.disambiguation_context ?? ""}.`
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
              <span className="font-semibold">{entity.disambiguation_context ?? ""}</span> products based on your workspace focus. Is that right?
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
  const [disambigWebsiteUrl, setDisambigWebsiteUrl] = useState("");

  useEffect(() => {
    if ((entity.disambiguation_confirmed ?? false) || entity.disambiguation_context) return;

    setStep("companies");
    setModalOpen(true);
  }, [entity.name, entity.disambiguation_confirmed ?? false, entity.disambiguation_context]);

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
      const payload: any = {
        entityName: entity.name,
        categoryName,
        disambiguation_context: contextStr,
      };
      if (disambigWebsiteUrl.trim()) {
        payload.website_url = disambigWebsiteUrl.trim();
      }
      await apiRequest("POST", "/api/entity/confirm-disambiguation", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/captures"] });
      toast({
        title: `Signalum will now track ${entity.name} for ${aspect}.`,
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

  if ((entity.disambiguation_confirmed ?? false) || entity.disambiguation_context) {
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
        {step === "companies" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm: {entity.name}</DialogTitle>
              <p className="text-sm text-muted-foreground pt-1">Help Signalum find the right organisation.</p>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Their website <span className="text-muted-foreground font-normal">(strongly recommended)</span></label>
                <Input
                  value={disambigWebsiteUrl}
                  onChange={(e) => setDisambigWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="h-9 text-sm"
                  data-testid="input-company-website"
                />
                <p className="text-xs text-muted-foreground mt-1">Adding a URL anchors all searches to the right company, especially for common names.</p>
              </div>
              <Button
                className="w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
                onClick={() => loadAspects(undefined)}
                disabled={confirming}
              >
                Continue
              </Button>
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
              <div className="pt-2">
                <label className="text-xs text-muted-foreground mb-1 block">Their website</label>
                <Input
                  value={disambigWebsiteUrl}
                  onChange={(e) => setDisambigWebsiteUrl(e.target.value)}
                  placeholder="https://example.com — improves accuracy significantly"
                  className="h-9 text-sm"
                  data-testid="input-disambiguation-website"
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SeoIntelligenceCard({ entity, categoryName }: { entity: ExtractedEntity; categoryName: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const entityId = entity.name;
  const isLocalBusiness = entity.entity_type_detected === "local_business";

  const { data: seoResponse, isLoading } = useQuery<{ seoData: EntitySeoData | null }>({
    queryKey: ["/api/entities", entityId, "seo-intelligence"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/seo-intelligence`);
      return res.json();
    },
    enabled: !!user && !!entity.website_url,
  });

  const seoData = seoResponse?.seoData;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/seo-intelligence`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "seo-intelligence"] });
      toast({ title: "SEO data refreshed." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const keywords = seoData?.rankedKeywords as { keyword: string; position: number; search_volume: number }[] || [];
  const sortedKeywords = [...keywords].sort((a, b) => a.position - b.position);
  const businessRating = seoData?.businessRating ? parseFloat(seoData.businessRating) : null;

  if (isLoading) {
    return (
      <Card data-testid="card-seo-intelligence">
        <CardContent className="p-4">
          <Skeleton className="h-4 w-40 mb-3" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-seo-intelligence">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#1e3a5f]" />
            <h3 className="text-sm font-semibold text-[#1e3a5f]">SEO Intelligence</h3>
          </div>
        </div>

        {refreshMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 mb-3" data-testid="status-seo-updating">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Updating…
          </div>
        )}

        {!seoData && !refreshMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-blue-600 mb-3" data-testid="banner-seo-fetching">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Fetching SEO data…
          </div>
        )}

        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-2">Ranking for</h4>
            {isLocalBusiness && seoData?.localPackPosition != null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 mb-2" data-testid="pill-local-pack">
                Appears in Google local pack — position {seoData.localPackPosition}
              </span>
            )}
            {sortedKeywords.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-search-rankings">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-1.5 pr-2 font-medium text-slate-500">Keyword</th>
                      <th className="text-right py-1.5 px-2 font-medium text-slate-500">Position</th>
                      <th className="text-right py-1.5 pl-2 font-medium text-slate-500">Monthly searches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedKeywords.map((kw, idx) => (
                      <tr key={idx} className="border-b border-slate-50" data-testid={`row-keyword-${idx}`}>
                        <td className="py-1.5 pr-2 text-slate-700">{kw.keyword}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-600">{kw.position}</td>
                        <td className="py-1.5 pl-2 text-right text-slate-500">{kw.search_volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400" data-testid="text-no-ranking-data">No ranking data yet</p>
            )}
          </div>

          <div>
            <p className="font-medium text-sm text-slate-400">Google Business <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">Coming soon</span></p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[10px] text-slate-400" data-testid="text-seo-last-updated">
              {seoData?.lastUpdated ? `Updated ${new Date(seoData.lastUpdated).toLocaleDateString()} ${new Date(seoData.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not yet updated"}
            </span>
            <Button
              variant="default"
              size="sm"
              className="h-7 px-3 text-xs bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              data-testid="button-refresh-seo"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DigitalPresenceCard({ entity, categoryName, isExtractionRunning }: { entity: ExtractedEntity; categoryName: string; isExtractionRunning: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/entity/refresh-website", {
        entityName: entity.name,
        categoryName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity/website-extraction-status", entity.name] });
      toast({ title: "Website refresh started." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const websiteExtractionCaptures = (useQuery<Capture[]>({
    queryKey: ["/api/captures"],
    enabled: !!user,
  }).data || []).filter(c => c.matchedEntity === entity.name && c.matchReason?.includes("source_type:website_extraction"));

  return (
    <Card data-testid="card-digital-presence">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#1e3a5f]" />
            <h3 className="text-sm font-semibold text-[#1e3a5f]">Digital Presence</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-500 hover:text-[#1e3a5f]"
            disabled={isExtractionRunning || refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
            data-testid="button-refresh-website"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isExtractionRunning || refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh website
          </Button>
        </div>
        <div className="text-xs text-slate-500 mb-2">
          <a href={entity.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" data-testid="link-entity-website">
            {entity.website_url}
          </a>
        </div>
        {isExtractionRunning ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Reading website…
          </div>
        ) : websiteExtractionCaptures.length > 0 ? (
          <p className="text-xs text-slate-500">{websiteExtractionCaptures.length} insight{websiteExtractionCaptures.length !== 1 ? "s" : ""} extracted from website</p>
        ) : (
          <p className="text-xs text-slate-400">No website data extracted yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function AIVisibilityCard() {
  return (
    <ComingSoonCard
      featureName="ai_visibility"
      title="AI Visibility"
      description="See how often your competitors are mentioned in ChatGPT, Perplexity, and Gemini — and why they get cited."
      icon={<Eye className="w-5 h-5 text-[#1e3a5f]" />}
    />
  );
}
