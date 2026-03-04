import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

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

  const getCaptureCountForCategory = (categoryName: string) =>
    captures.filter((c) => c.matchedCategory === categoryName).length;

  const getCaptureCountForEntity = (entityName: string) =>
    captures.filter((c) => c.matchedEntity === entityName).length;

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div className="md:col-span-2 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
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
                className={`w-full text-left rounded-md p-4 transition-colors flex items-center gap-3 group ${
                  isActive
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-card hover-elevate"
                }`}
                data-testid={`button-category-${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
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
                <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? "text-white/70" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>

        <div className="md:col-span-2">
          {selectedEntity && activeEntity ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedEntity(null)}
                  data-testid="button-back-to-entities"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">{activeEntity.name}</h2>
                    <Badge variant="secondary" className="text-xs">
                      {entityTypeLabels[activeEntity.type] || activeEntity.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    in {selectedCategory}
                  </p>
                </div>
              </div>

              {entityCaptures.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                    Captured intel ({entityCaptures.length})
                  </p>
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-3 pr-3">
                      {entityCaptures.map((cap) => {
                        const Icon = captureTypeIcons[cap.type] || FileText;
                        return (
                          <Card key={cap.id} data-testid={`card-capture-item-${cap.id}`}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <Icon className="w-4 h-4 text-[#1e3a5f]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Badge variant="outline" className="text-xs">{cap.type}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(cap.createdAt).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground whitespace-pre-wrap break-words line-clamp-4">
                                    {cap.content}
                                  </p>
                                  {cap.matchReason && (
                                    <p className="text-xs text-muted-foreground mt-2 italic">
                                      {cap.matchReason}
                                    </p>
                                  )}
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
                <div className="border border-dashed border-border rounded-md p-10 text-center">
                  <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No intel captured for this entity yet. Use the Capture page to add items.
                  </p>
                </div>
              )}
            </div>
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
                      className="w-full text-left rounded-md bg-card p-4 flex items-center gap-3 hover-elevate active-elevate-2 transition-colors"
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
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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
