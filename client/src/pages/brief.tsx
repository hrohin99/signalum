import { Newspaper, Sparkles, Loader2, Calendar, Database, Users, AlertTriangle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Brief, TopicDate, ExtractedCategory } from "@shared/schema";

interface TopicDateWithDaysUntil extends TopicDate {
  days_until: number;
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" = "ul";
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      const ListTag = listType === "ol" ? "ol" : "ul";
      const listClass = listType === "ol" ? "list-decimal pl-5 mb-3 space-y-1" : "list-disc pl-5 mb-3 space-y-1";
      elements.push(
        <ListTag key={key++} className={listClass}>
          {listItems.map((item, i) => (
            <li key={i} className="text-sm text-foreground">{renderInline(item)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = "ul";
    }
  }

  function renderInline(text: string) {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let idx = 0;
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.slice(lastIndex, match.index));
      }
      if (match[1]) {
        parts.push(<strong key={idx++}>{match[1]}</strong>);
      } else if (match[2]) {
        parts.push(<em key={idx++}>{match[2]}</em>);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < remaining.length) {
      parts.push(remaining.slice(lastIndex));
    }
    return <>{parts}</>;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(trimmed)) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-base font-semibold mt-4 mb-2 text-foreground">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-lg font-semibold mt-5 mb-2 text-foreground">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-xl font-bold mt-6 mb-3 text-foreground">
          {renderInline(trimmed.slice(2))}
        </h1>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listItems.length === 0) listType = "ol";
      listItems.push(trimmed.replace(/^\d+\.\s/, ""));
    } else {
      flushList();
      elements.push(
        <p key={key++} className="text-sm text-foreground mb-3 leading-relaxed">
          {renderInline(trimmed)}
        </p>
      );
    }
  }
  flushList();

  return <div>{elements}</div>;
}

function OnYourRadar({ deadlines, categories }: { deadlines: TopicDateWithDaysUntil[]; categories: ExtractedCategory[] }) {
  const urgent = deadlines
    .filter(d => d.days_until <= 30)
    .sort((a, b) => a.days_until - b.days_until);

  if (urgent.length === 0) return null;

  const displayed = urgent.slice(0, 5);
  const remaining = urgent.length - 5;

  function findCategoryForEntity(entityId: string): string | null {
    for (const cat of categories) {
      if (cat.entities.some(e => e.name === entityId)) {
        return cat.name;
      }
    }
    return null;
  }

  function getUrgencyColor(daysUntil: number): { text: string; dot: string } {
    if (daysUntil < 0) return { text: "text-red-600", dot: "bg-red-500" };
    if (daysUntil <= 7) return { text: "text-amber-600", dot: "bg-amber-500" };
    return { text: "text-slate-500", dot: "bg-slate-400" };
  }

  function formatDate(dateVal: string | Date): string {
    const dateStr = dateVal instanceof Date
      ? dateVal.toISOString().split("T")[0]
      : String(dateVal).split("T")[0];
    return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <Card className="mb-6 border-l-4 border-l-amber-400" data-testid="card-on-your-radar">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h2 className="text-base font-semibold text-foreground" data-testid="text-radar-title">On Your Radar</h2>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {displayed.map((d) => {
            const colors = getUrgencyColor(d.days_until);
            const category = findCategoryForEntity(d.entityId);
            const topicLink = category
              ? `/topic/${encodeURIComponent(category)}/${encodeURIComponent(d.entityId)}`
              : null;

            return (
              <li key={d.id} className="flex items-center gap-3 text-sm" data-testid={`radar-item-${d.id}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                <span className={`font-medium ${colors.text} shrink-0 min-w-[90px]`}>
                  {formatDate(d.date)}
                </span>
                <span className="text-foreground">
                  {d.label}
                </span>
                <span className="text-muted-foreground">—</span>
                {topicLink ? (
                  <Link
                    href={topicLink}
                    className="text-blue-600 hover:underline shrink-0"
                    data-testid={`link-radar-topic-${d.id}`}
                  >
                    {d.entityId}
                  </Link>
                ) : (
                  <span className="text-muted-foreground shrink-0">{d.entityId}</span>
                )}
              </li>
            );
          })}
        </ul>
        {remaining > 0 && (
          <div className="mt-3 pt-2 border-t">
            <Link
              href="/?filter=deadlines"
              className="text-sm text-blue-600 hover:underline"
              data-testid="link-radar-more"
            >
              and {remaining} more
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BriefPage() {
  const { toast } = useToast();

  const { data: briefsList, isLoading } = useQuery<Brief[]>({
    queryKey: ["/api/briefs"],
  });

  const { data: topicDatesData } = useQuery<{ dates: TopicDateWithDaysUntil[] }>({
    queryKey: ["/api/topic-dates/all"],
  });

  const { data: workspaceData } = useQuery<{ exists: boolean; workspace?: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace/current"],
  });

  const upcomingDeadlines = (topicDatesData?.dates ?? []).filter(d => d.days_until <= 30);
  const categories = workspaceData?.workspace?.categories ?? [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefs/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/briefs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-dates/all"] });
      toast({ title: "Brief generated", description: "Your daily intelligence brief is ready." });
    },
    onError: (error: Error) => {
      const msg = error.message.includes("400:")
        ? "No updates yet. Capture some content first."
        : error.message.includes("404:")
          ? "No workspace found. Complete onboarding first."
          : "Something went wrong generating your brief. Please try again.";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    },
  });

  const hasBriefs = briefsList && briefsList.length > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Daily Brief</h1>
          <p className="text-muted-foreground mt-1">
            Your AI-generated morning intelligence summary.
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-brief"
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {generateMutation.isPending ? "Generating..." : "Generate Now"}
        </Button>
      </div>

      {upcomingDeadlines.length > 0 && (
        <OnYourRadar deadlines={upcomingDeadlines} categories={categories} />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && !hasBriefs && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Newspaper className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-1" data-testid="text-no-briefs">No briefs yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Click "Generate Now" to create your first brief based on your tracked categories and updates.
          </p>
        </div>
      )}

      {!isLoading && hasBriefs && (
        <div className="space-y-6">
          {briefsList.map((brief) => (
            <Card key={brief.id} data-testid={`card-brief-${brief.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1" data-testid={`text-brief-date-${brief.id}`}>
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(brief.createdAt).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex items-center gap-1" data-testid={`text-brief-captures-${brief.id}`}>
                    <Database className="w-3.5 h-3.5" />
                    {brief.captureCount} submissions
                  </span>
                  <span className="flex items-center gap-1" data-testid={`text-brief-entities-${brief.id}`}>
                    <Users className="w-3.5 h-3.5" />
                    {brief.entityCount} topics
                  </span>
                </div>
              </CardHeader>
              <CardContent data-testid={`text-brief-content-${brief.id}`}>
                <MarkdownRenderer content={brief.content} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
