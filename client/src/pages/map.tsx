import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Lightbulb,
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

export default function MapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [addEntityOpen, setAddEntityOpen] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState("other");
  const [addToCategory, setAddToCategory] = useState("");

  const { data: wsData, isLoading: wsLoading } = useQuery<{ exists: boolean; workspace?: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace", user?.id],
    enabled: !!user,
  });

  const { data: captures = [], isLoading: capLoading } = useQuery<Capture[]>({
    queryKey: ["/api/captures"],
    enabled: !!user,
  });

  const categories = wsData?.workspace?.categories ?? [];
  const loading = wsLoading || capLoading;

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].name);
    }
  }, [categories, selectedCategory]);

  const activeCategory = categories.find((c) => c.name === selectedCategory);
  const activeEntity = activeCategory?.entities.find((e) => e.name === selectedEntity);
  const entityCaptures = captures.filter((c) => c.matchedEntity === selectedEntity);

  const { data: summaryData, isLoading: summaryLoading, isError: summaryError } = useQuery<{ summary: string }>({
    queryKey: ["/api/entity-summary", selectedEntity, selectedCategory],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/entity-summary", {
        entityName: selectedEntity,
        categoryName: selectedCategory,
      });
      return res.json();
    },
    enabled: !!selectedEntity && !!selectedCategory && !!activeEntity,
    retry: false,
  });

  const addEntityMutation = useMutation({
    mutationFn: async (data: { categoryName: string; entityName: string; entityType: string }) => {
      const res = await apiRequest("POST", "/api/add-entity", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace", user?.id] });
      setAddEntityOpen(false);
      setNewEntityName("");
      setNewEntityType("other");
      toast({ title: "Entity added", description: "New entity has been added to the category." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getCaptureCountForCategory = (categoryName: string) =>
    captures.filter((c) => c.matchedCategory === categoryName).length;

  const getCaptureCountForEntity = (entityName: string) =>
    captures.filter((c) => c.matchedEntity === entityName).length;

  const getLatestCaptureDate = (entityName: string) => {
    const matching = captures.filter((c) => c.matchedEntity === entityName);
    if (matching.length === 0) return null;
    return new Date(matching[0].createdAt);
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
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Intelligence Map</h1>
          <p className="text-muted-foreground mt-1">Visualize connections between your tracked entities.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Network className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-1">No workspace data yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Complete the onboarding to set up your categories and entities.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Intelligence Map</h1>
        <p className="text-muted-foreground mt-1">
          {categories.length} categories, {categories.reduce((a, c) => a + c.entities.length, 0)} entities, {captures.length} captured items
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 px-1">Categories</p>
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.name;
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
                      {cat.entities.length} entities{count > 0 ? ` · ${count} items` : ""}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-white/70" : "text-muted-foreground group-hover:translate-x-0.5"}`} />
                </div>
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
              </button>
            );
          })}

          <Dialog open={addEntityOpen} onOpenChange={setAddEntityOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full mt-3 border-dashed text-muted-foreground hover:text-[#1e3a5f] hover:border-[#1e3a5f]/30"
                onClick={() => {
                  setAddToCategory(selectedCategory || categories[0]?.name || "");
                }}
                data-testid="button-add-entity"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Entity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a new entity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Category</label>
                  <Select value={addToCategory} onValueChange={setAddToCategory}>
                    <SelectTrigger data-testid="select-add-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Entity name</label>
                  <Input
                    placeholder="e.g. OpenAI, GDPR, John Smith"
                    value={newEntityName}
                    onChange={(e) => setNewEntityName(e.target.value)}
                    data-testid="input-add-entity-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Type</label>
                  <Select value={newEntityType} onValueChange={setNewEntityType}>
                    <SelectTrigger data-testid="select-add-entity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(entityTypeLabels).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-[#1e3a5f]"
                  disabled={!newEntityName.trim() || !addToCategory || addEntityMutation.isPending}
                  onClick={() => {
                    addEntityMutation.mutate({
                      categoryName: addToCategory,
                      entityName: newEntityName.trim(),
                      entityType: newEntityType,
                    });
                  }}
                  data-testid="button-confirm-add-entity"
                >
                  {addEntityMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Add Entity
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="md:col-span-2">
          {selectedEntity && activeEntity ? (
            <EntityDetail
              entity={activeEntity}
              categoryName={selectedCategory!}
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

              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                Entities ({activeCategory.entities.length})
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
                          {count > 0 ? ` · ${count} captured item${count !== 1 ? "s" : ""}` : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Network className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Select a category to view its entities.</p>
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          data-testid="button-back-to-entities"
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
          <span className="text-muted-foreground">item{captures.length !== 1 ? "s" : ""}</span>
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
          <p className="text-sm text-foreground leading-relaxed">{summary || `No intelligence data available for ${entity.name} yet.`}</p>
        )}
      </div>

      {captures.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
            Captured intel ({captures.length})
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

          {captures.length <= 2 && (
            <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200/60 px-4 py-3" data-testid="text-capture-more-prompt">
              <Lightbulb className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-800">
                Capture more intel about <span className="font-medium">{entity.name}</span> to build a richer picture.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">
            No intel captured for this entity yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the Capture page to add articles, notes, or documents about {entity.name}.
          </p>
        </div>
      )}
    </div>
  );
}
