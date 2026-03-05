import { useQuery } from "@tanstack/react-query";
import { Inbox as InboxIcon, PenLine, Mic, Link2, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Capture } from "@shared/schema";

const typeConfig: Record<string, { icon: typeof PenLine; label: string }> = {
  text: { icon: PenLine, label: "Text Note" },
  voice: { icon: Mic, label: "Voice Note" },
  url: { icon: Link2, label: "URL" },
  document: { icon: FileText, label: "Document" },
};

function formatDate(date: string | Date) {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: string | Date) {
  const d = new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function truncateContent(content: string, maxLength = 120) {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trimEnd() + "…";
}

export default function InboxPage() {
  const { data: captures, isLoading } = useQuery<Capture[]>({
    queryKey: ["/api/captures"],
  });

  const confirmed = captures ?? [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Inbox</h1>
        <p className="text-muted-foreground mt-1">
          All confirmed submissions, most recent first.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20" data-testid="inbox-loading">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e3a5f]" />
          <p className="text-sm text-muted-foreground mt-3">Loading submissions…</p>
        </div>
      ) : confirmed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="inbox-empty">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <InboxIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-1">No items in your inbox</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Submissions that need your attention will appear here. Start by capturing something new.
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="inbox-list">
          {confirmed.map((capture) => {
            const config = typeConfig[capture.type] || typeConfig.text;
            const Icon = config.icon;

            return (
              <div
                key={capture.id}
                className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
                data-testid={`inbox-item-${capture.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-5 h-5 text-[#1e3a5f]" data-testid={`icon-type-${capture.type}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide" data-testid={`text-type-${capture.id}`}>
                        {config.label}
                      </span>
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200 text-xs"
                        data-testid={`badge-status-${capture.id}`}
                      >
                        Confirmed
                      </Badge>
                    </div>

                    <p className="text-sm text-foreground mb-2 leading-relaxed" data-testid={`text-content-${capture.id}`}>
                      {truncateContent(capture.content)}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      {capture.matchedEntity && capture.matchedCategory && (
                        <span className="inline-flex items-center gap-1" data-testid={`text-routing-${capture.id}`}>
                          <span className="font-medium text-[#1e3a5f]">{capture.matchedEntity}</span>
                          <span>in</span>
                          <span className="font-medium">{capture.matchedCategory}</span>
                        </span>
                      )}
                      <span data-testid={`text-date-${capture.id}`}>
                        {formatDate(capture.createdAt)} at {formatTime(capture.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
