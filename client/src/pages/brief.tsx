import { Newspaper, Sparkles, Loader2, Calendar, Database, Users } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Brief } from "@shared/schema";

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc pl-5 mb-3 space-y-1">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm text-foreground">{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
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

export default function BriefPage() {
  const { toast } = useToast();

  const { data: briefsList, isLoading } = useQuery<Brief[]>({
    queryKey: ["/api/briefs"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefs/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/briefs"] });
      toast({ title: "Brief generated", description: "Your daily intelligence brief is ready." });
    },
    onError: (error: Error) => {
      const msg = error.message.includes("400:")
        ? "No captured intel yet. Capture some content first."
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
            Click "Generate Now" to create your first intelligence brief based on your tracked categories and captured data.
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
                    {brief.captureCount} captures
                  </span>
                  <span className="flex items-center gap-1" data-testid={`text-brief-entities-${brief.id}`}>
                    <Users className="w-3.5 h-3.5" />
                    {brief.entityCount} entities
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
