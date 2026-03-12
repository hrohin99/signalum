import { useState, useEffect } from "react";
import { Newspaper, Sparkles, Loader2, Calendar, Database, Users, AlertTriangle, Send, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import type { Brief, TopicDate, ExtractedCategory } from "@shared/schema";

interface TopicDateWithDaysUntil extends TopicDate {
  days_until: number;
}

interface BriefingSettings {
  briefingEnabled: boolean;
  briefingDay: string;
  briefingTime: string;
  briefingEmail: string | null;
  briefingLastSent: string | null;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TIMES = [
  { value: "06:00", label: "6:00 AM" },
  { value: "07:00", label: "7:00 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
];

function getCategoryType(categoryName: string): "competitor" | "regulatory" | "standard" | "other" {
  const lower = categoryName.toLowerCase();
  if (lower.includes("competitor") || lower.includes("competition")) return "competitor";
  if (lower.includes("regulat") || lower.includes("compliance") || lower.includes("legal") || lower.includes("policy")) return "regulatory";
  if (lower.includes("standard") || lower.includes("certification") || lower.includes("iso")) return "standard";
  return "other";
}

function getTagStyles(type: "competitor" | "regulatory" | "standard" | "other") {
  switch (type) {
    case "competitor":
      return { background: "#FAECE7", color: "#993C1D" };
    case "regulatory":
      return { background: "#E6F1FB", color: "#185FA5" };
    case "standard":
      return { background: "#EAF3DE", color: "#3B6D11" };
    default:
      return { background: "#F3F4F6", color: "#4B5563" };
  }
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
    <div className="mb-6 bg-white rounded-xl" style={{ border: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }} data-testid="card-on-your-radar">
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }}>
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-foreground" data-testid="text-radar-title">On Your Radar</h2>
      </div>
      <div className="px-5 py-3">
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
      </div>
    </div>
  );
}

function TodaysBriefTab() {
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

  const hasBriefs = briefsList && briefsList.length > 0;
  const latestBrief = hasBriefs ? briefsList[0] : null;

  return (
    <div>
      {latestBrief && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-xs text-gray-500" data-testid="badge-brief-date">
            <Calendar className="w-3 h-3" />
            {new Date(latestBrief.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-xs text-gray-500" data-testid="badge-brief-signals">
            <Database className="w-3 h-3" />
            {latestBrief.captureCount} signals
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-xs text-gray-500" data-testid="badge-brief-entities">
            <Users className="w-3 h-3" />
            {latestBrief.entityCount} entities
          </span>
        </div>
      )}

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
            Click "Generate now" to create your first brief based on your tracked categories and updates.
          </p>
        </div>
      )}

      {!isLoading && hasBriefs && (
        <div className="space-y-4">
          {briefsList.map((brief) => {
            const lines = brief.content.split("\n").filter(l => l.trim());
            const sections: { heading: string; items: { text: string; soWhat?: string }[] }[] = [];
            let currentSection: { heading: string; items: { text: string; soWhat?: string }[] } | null = null;

            for (const line of lines) {
              const headingMatch = line.match(/^#{1,3}\s+(.+)/);
              if (headingMatch) {
                currentSection = { heading: headingMatch[1], items: [] };
                sections.push(currentSection);
              } else if (currentSection) {
                const soWhatMatch = line.match(/\*\*So what[^*]*\*\*:?\s*(.*)/i);
                if (soWhatMatch && currentSection.items.length > 0) {
                  currentSection.items[currentSection.items.length - 1].soWhat = soWhatMatch[1] || line;
                } else {
                  const cleaned = line.replace(/^[-*•]\s*/, "").trim();
                  if (cleaned) {
                    currentSection.items.push({ text: cleaned });
                  }
                }
              } else {
                if (!currentSection) {
                  currentSection = { heading: "Overview", items: [] };
                  sections.push(currentSection);
                }
                const cleaned = line.replace(/^[-*•]\s*/, "").trim();
                if (cleaned) {
                  currentSection.items.push({ text: cleaned });
                }
              }
            }

            if (sections.length === 0) {
              return (
                <div key={brief.id} className="bg-white rounded-xl p-5" style={{ border: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }} data-testid={`card-brief-${brief.id}`}>
                  <ReactMarkdown className="prose prose-sm max-w-none text-gray-700">
                    {brief.content}
                  </ReactMarkdown>
                </div>
              );
            }

            return (
              <div key={brief.id} className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }} data-testid={`card-brief-${brief.id}`}>
                {sections.map((section, si) => {
                  const catType = getCategoryType(section.heading);
                  const tagStyle = getTagStyles(catType);

                  return (
                    <div key={si} style={si > 0 ? { borderTop: "0.5px solid var(--color-border-tertiary, #e5e7eb)" } : {}}>
                      <div className="px-5 pt-4 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400" data-testid={`text-section-heading-${si}`}>
                          {section.heading}
                        </span>
                      </div>
                      <div className="px-5 pb-4 space-y-2.5">
                        {section.items.map((item, ii) => {
                          const entityMatch = item.text.match(/\*\*([^*]+)\*\*/);
                          const entityName = entityMatch ? entityMatch[1] : null;
                          const textContent = entityMatch
                            ? item.text.replace(/\*\*[^*]+\*\*:?\s*/, "").trim()
                            : item.text;

                          return (
                            <div key={ii} className="flex items-start gap-3 text-sm" data-testid={`signal-row-${si}-${ii}`}>
                              {entityName && (
                                <span
                                  className="shrink-0 mt-0.5"
                                  style={{
                                    ...tagStyle,
                                    borderRadius: "20px",
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    fontWeight: 500,
                                    whiteSpace: "nowrap",
                                  }}
                                  data-testid={`tag-entity-${si}-${ii}`}
                                >
                                  {entityName}
                                </span>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-gray-700">{textContent || item.text}</span>
                                {item.soWhat && (
                                  <span
                                    className="inline-block mt-1 text-xs px-2 py-0.5 rounded"
                                    style={{ background: "#F0EEFF", color: "#534AB7" }}
                                    data-testid={`so-what-${si}-${ii}`}
                                  >
                                    {item.soWhat}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                                {new Date(brief.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeeklyDigestTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState("monday");
  const [time, setTime] = useState("08:00");
  const [email, setEmail] = useState("");
  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  const { data: settings, isLoading } = useQuery<BriefingSettings>({
    queryKey: ["/api/briefing/settings"],
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.briefingEnabled);
      setDay(settings.briefingDay);
      setTime(settings.briefingTime);
      setEmail(settings.briefingEmail || user?.email || "");
    } else if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [settings, user]);

  useEffect(() => {
    if (user?.email && recipients.length === 0) {
      setRecipients([{
        id: "owner",
        name: user.email.split("@")[0],
        email: user.email,
        isOwner: true,
      }]);
    }
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefing/settings", {
        briefingEnabled: enabled,
        briefingDay: day,
        briefingTime: time,
        briefingEmail: email,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/briefing/settings"] });
      toast({ title: "Settings saved", description: "Your briefing preferences have been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefing/send-now", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Briefing sent", description: "Check your email inbox." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  function addRecipient() {
    const trimmed = newRecipientEmail.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    if (recipients.some(r => r.email === trimmed)) return;
    setRecipients([...recipients, {
      id: Date.now().toString(),
      name: trimmed.split("@")[0],
      email: trimmed,
      isOwner: false,
    }]);
    setNewRecipientEmail("");
  }

  function removeRecipient(id: string) {
    setRecipients(recipients.filter(r => r.id !== id));
  }

  function getInitials(name: string): string {
    return name
      .split(/[\s._-]+/)
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase())
      .join("");
  }

  const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
  const timeLabel = TIMES.find(t => t.value === time)?.label || time;

  function getNextSendDate(): string {
    const now = new Date();
    const dayIndex = DAYS.indexOf(day);
    const currentDay = now.getUTCDay();
    const targetDay = dayIndex === 6 ? 0 : dayIndex + 1;
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntil);
    return next.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-briefing-settings">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }}>
          <div>
            <Label htmlFor="briefing-toggle" className="text-sm font-medium">
              Enable weekly briefing
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receive an AI-generated summary of your tracked entities
            </p>
          </div>
          <Switch
            id="briefing-toggle"
            checked={enabled}
            onCheckedChange={(val) => { setEnabled(val); }}
            data-testid="switch-briefing-enabled"
          />
        </div>

        <div className="px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Recipients</h3>
          <div className="space-y-2.5">
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3" data-testid={`recipient-row-${r.id}`}>
                <div
                  className="shrink-0 flex items-center justify-center rounded-full text-xs font-semibold"
                  style={{
                    width: 28,
                    height: 28,
                    background: "#EEEDFE",
                    color: "#534AB7",
                  }}
                  data-testid={`recipient-avatar-${r.id}`}
                >
                  {getInitials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{r.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{r.email}</span>
                </div>
                {r.isOwner ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "#EEEDFE", color: "#534AB7" }}
                    data-testid="badge-owner"
                  >
                    Owner
                  </span>
                ) : (
                  <button
                    onClick={() => removeRecipient(r.id)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                    data-testid={`button-remove-recipient-${r.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Input
              type="email"
              placeholder="Add recipient email"
              value={newRecipientEmail}
              onChange={(e) => setNewRecipientEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRecipient()}
              className="h-8 text-sm"
              data-testid="input-add-recipient"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addRecipient}
              className="h-8 shrink-0"
              data-testid="button-add-recipient"
            >
              Add
            </Button>
          </div>
        </div>

        <div className="px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Schedule</h3>
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground">
              Sends every <span className="font-medium">{dayLabel}</span> at <span className="font-medium">{timeLabel} UTC</span>
            </p>
            <button
              className="text-sm font-medium hover:underline"
              style={{ color: "#534AB7" }}
              onClick={() => setIsScheduleOpen(!isScheduleOpen)}
              data-testid="button-edit-schedule"
            >
              Edit schedule
            </button>
          </div>
          {isScheduleOpen && <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="briefing-day" className="text-xs">Day of week</Label>
                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger id="briefing-day" className="h-8 text-sm" data-testid="select-briefing-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={d} data-testid={`option-day-${d}`}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="briefing-time" className="text-xs">Send time</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger id="briefing-time" className="h-8 text-sm" data-testid="select-briefing-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((t) => (
                      <SelectItem key={t.value} value={t.value} data-testid={`option-time-${t.value}`}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="briefing-email" className="text-xs">Email address</Label>
              <Input
                id="briefing-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="h-8 text-sm"
                data-testid="input-briefing-email"
              />
            </div>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-briefing"
            >
              {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save schedule
            </Button>
          </div>}
        </div>

        <div className="px-5 py-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {settings?.briefingLastSent && (
              <span data-testid="text-last-sent">
                Last sent: {new Date(settings.briefingLastSent).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {" · "}
              </span>
            )}
            <span data-testid="text-next-send">Next: {getNextSendDate()}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="h-8"
            data-testid="button-send-now"
          >
            {testMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 mr-1.5" />
            )}
            Send now
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BriefingsPage() {
  const [activeTab, setActiveTab] = useState<"today" | "weekly">("today");
  const { toast } = useToast();

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-foreground" style={{ fontSize: "20px", fontWeight: 500 }} data-testid="text-page-title">
            Briefings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your daily and weekly intelligence summaries.
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="text-white"
          style={{ backgroundColor: "#534AB7" }}
          data-testid="button-generate-brief"
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {generateMutation.isPending ? "Generating..." : "Generate now"}
        </Button>
      </div>

      <div className="mb-6" style={{ borderBottom: "0.5px solid var(--color-border-tertiary, #e5e7eb)" }}>
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("today")}
            className="pb-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === "today" ? "#534AB7" : "#6B7280",
              borderBottom: activeTab === "today" ? "2px solid #534AB7" : "2px solid transparent",
              marginBottom: "-0.5px",
            }}
            data-testid="tab-today"
          >
            Today's brief
          </button>
          <button
            onClick={() => setActiveTab("weekly")}
            className="pb-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === "weekly" ? "#534AB7" : "#6B7280",
              borderBottom: activeTab === "weekly" ? "2px solid #534AB7" : "2px solid transparent",
              marginBottom: "-0.5px",
            }}
            data-testid="tab-weekly"
          >
            Weekly digest
          </button>
        </div>
      </div>

      {activeTab === "today" && <TodaysBriefTab />}
      {activeTab === "weekly" && <WeeklyDigestTab />}
    </div>
  );
}
