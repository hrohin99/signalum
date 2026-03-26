import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Brain, Zap, Target, ShieldAlert, Swords, Eye, Loader2, Info, Sparkles, Globe, Download, Map, TrendingUp, AlertTriangle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PulseItem {
  title: string;
  detail: string;
}

interface PulseSection {
  headline: string;
  items: PulseItem[];
}

interface MarketDirectionSection {
  paragraphs: string[];
}

interface ThreatWatchSection {
  headline: string;
  urgent: PulseItem[];
  monitoring: PulseItem[];
}

interface StrategicPulse {
  id: string;
  workspace_id: string;
  generated_at: string;
  // New sections (v2)
  market_direction: MarketDirectionSection | string | null;
  market_forces: PulseSection | string | null;
  threat_watch: ThreatWatchSection | string | null;
  roadmap_implications: PulseSection | string | null;
  // Legacy sections (v1 — backward compat)
  big_shift: PulseSection | string | null;
  emerging_opportunities: PulseSection | string | null;
  threat_radar: PulseSection | string | null;
  competitor_moves: PulseSection | string | null;
  watch_list: PulseSection | string | null;
  regional_intelligence: PulseSection | string | null;
  capture_count: number;
  model: string;
}

interface DimensionItem {
  name: string;
  our_status: string;
}

interface Dimension {
  id: string;
  name: string;
  items: DimensionItem[];
}

function parseSection<T>(value: T | string | null): T | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  return value as T;
}

// Parse [DIM:DimName|ItemName] tags from text, return {text, tags}
function parseDimTags(text: string): { clean: string; tags: Array<{ dim: string; item: string }> } {
  const tags: Array<{ dim: string; item: string }> = [];
  const clean = text.replace(/\[DIM:([^\]|]+)\|([^\]]+)\]/g, (_, dim, item) => {
    tags.push({ dim: dim.trim(), item: item.trim() });
    return '';
  }).trim();
  return { clean, tags };
}

function DimPill({ dim, item, dimensions }: { dim: string; item: string; dimensions: Dimension[] }) {
  const dimObj = dimensions.find(d => d.name.toLowerCase() === dim.toLowerCase());
  const itemObj = dimObj?.items?.find(it => it.name.toLowerCase() === item.toLowerCase());
  const status = itemObj?.our_status || 'unknown';

  const colorMap: Record<string, string> = {
    yes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
    no: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-700',
    partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  };
  const cls = colorMap[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ml-1.5 ${cls}`} data-testid={`dim-pill-${dim}-${item}`}>
      {dim} → {item}
    </span>
  );
}

function ItemText({ text, dimensions }: { text: string; dimensions: Dimension[] }) {
  const { clean, tags } = parseDimTags(text);
  return (
    <span>
      {clean}
      {tags.map((t, i) => (
        <DimPill key={i} dim={t.dim} item={t.item} dimensions={dimensions} />
      ))}
    </span>
  );
}

const sectionColorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", iconBg: "bg-blue-100 dark:bg-blue-900", text: "text-blue-700 dark:text-blue-300" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", iconBg: "bg-emerald-100 dark:bg-emerald-900", text: "text-emerald-700 dark:text-emerald-300" },
  red: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", iconBg: "bg-red-100 dark:bg-red-900", text: "text-red-700 dark:text-red-300" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", iconBg: "bg-purple-100 dark:bg-purple-900", text: "text-purple-700 dark:text-purple-300" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", iconBg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-700 dark:text-amber-300" },
  slate: { bg: "bg-slate-50 dark:bg-slate-950/30", border: "border-slate-200 dark:border-slate-800", iconBg: "bg-slate-100 dark:bg-slate-900", text: "text-slate-700 dark:text-slate-300" },
};

function PulseSectionCard({
  icon: Icon,
  title,
  color,
  section,
  dimensions,
}: {
  icon: LucideIcon;
  title: string;
  color: string;
  section: PulseSection | null;
  dimensions: Dimension[];
}) {
  const colors = sectionColorMap[color] || sectionColorMap.blue;

  if (!section || (!section.headline && (!section.items || section.items.length === 0))) {
    return (
      <div className={`rounded-lg border ${colors.border} ${colors.bg} p-5`} data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <h3 className="text-base font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3 italic">No data generated for this section.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} p-5`} data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {section.headline && (
        <p className="text-sm font-medium text-foreground/80 mb-4 italic">
          {section.headline}
        </p>
      )}
      <div className="space-y-3">
        {(section.items || []).map((item, i) => (
          <div key={i} className="pl-3 border-l-2 border-current/10">
            <p className="text-sm font-semibold">
              <ItemText text={item.title} dimensions={dimensions} />
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              <ItemText text={item.detail} dimensions={dimensions} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketDirectionCard({ section, dimensions }: { section: MarketDirectionSection | null; dimensions: Dimension[] }) {
  if (!section || !section.paragraphs || section.paragraphs.length === 0) {
    return (
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-5" data-testid="section-market-direction">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <Map className="w-5 h-5 text-blue-700 dark:text-blue-300" />
          </div>
          <h3 className="text-base font-semibold">Market Direction</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3 italic">No data generated for this section.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6" data-testid="section-market-direction">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
          <Map className="w-5 h-5 text-blue-700 dark:text-blue-300" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Market Direction</h3>
          <p className="text-xs text-muted-foreground">6–18 month strategic outlook</p>
        </div>
      </div>
      <div className="space-y-3">
        {section.paragraphs.map((p, i) => {
          const { clean, tags } = parseDimTags(p);
          return (
            <p key={i} className="text-sm leading-relaxed text-foreground/90">
              {clean}
              {tags.map((t, j) => (
                <DimPill key={j} dim={t.dim} item={t.item} dimensions={dimensions} />
              ))}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function ThreatWatchCard({ section, dimensions }: { section: ThreatWatchSection | null; dimensions: Dimension[] }) {
  if (!section || ((!section.urgent || section.urgent.length === 0) && (!section.monitoring || section.monitoring.length === 0))) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-5" data-testid="section-threat-radar-and-watch-list">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300" />
          </div>
          <h3 className="text-base font-semibold">Threat Radar & Watch List</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3 italic">No data generated for this section.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-5" data-testid="section-threat-radar-and-watch-list">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300" />
        </div>
        <h3 className="text-base font-semibold">Threat Radar & Watch List</h3>
      </div>
      {section.headline && (
        <p className="text-sm font-medium text-foreground/80 mb-4 italic">{section.headline}</p>
      )}
      <div className="space-y-4">
        {section.urgent && section.urgent.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2">Immediate — Action Required</p>
            <div className="space-y-2">
              {section.urgent.map((item, i) => (
                <div key={i} className="pl-3 border-l-2 border-red-500 dark:border-red-400">
                  <p className="text-sm font-semibold">
                    <ItemText text={item.title} dimensions={dimensions} />
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <ItemText text={item.detail} dimensions={dimensions} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {section.monitoring && section.monitoring.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">Monitoring — Watch Closely</p>
            <div className="space-y-2">
              {section.monitoring.map((item, i) => (
                <div key={i} className="pl-3 border-l-2 border-amber-400 dark:border-amber-500">
                  <p className="text-sm font-semibold">
                    <ItemText text={item.title} dimensions={dimensions} />
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <ItemText text={item.detail} dimensions={dimensions} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoadmapCard({ section, dimensions }: { section: PulseSection | null; dimensions: Dimension[] }) {
  if (!section || (!section.headline && (!section.items || section.items.length === 0))) {
    return (
      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-5" data-testid="section-roadmap-implications">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-purple-700 dark:text-purple-300" />
          </div>
          <h3 className="text-base font-semibold">Roadmap Implications</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3 italic">No data generated for this section.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-5" data-testid="section-roadmap-implications">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-purple-700 dark:text-purple-300" />
        </div>
        <h3 className="text-base font-semibold">Roadmap Implications</h3>
      </div>
      {section.headline && (
        <p className="text-sm font-medium text-foreground/80 mb-4 italic">{section.headline}</p>
      )}
      <div className="space-y-3">
        {(section.items || []).map((item, i) => (
          <div key={i} className="pl-3 border-l-2 border-purple-400 dark:border-purple-500">
            <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">
              {i + 1}. <ItemText text={item.title} dimensions={dimensions} />
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              <ItemText text={item.detail} dimensions={dimensions} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionalCard({ section, dimensions }: { section: PulseSection | null; dimensions: Dimension[] }) {
  if (!section || !section.items || section.items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 p-5" data-testid="section-regional-intelligence">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
            <Globe className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </div>
          <h3 className="text-base font-semibold">Regional Intelligence</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-3 italic">No data generated for this section.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 p-5" data-testid="section-regional-intelligence">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
          <Globe className="w-5 h-5 text-slate-700 dark:text-slate-300" />
        </div>
        <h3 className="text-base font-semibold">Regional Intelligence</h3>
      </div>
      {section.headline && (
        <p className="text-sm font-medium text-foreground/80 mb-4 italic">{section.headline}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(section.items || []).map((item, i) => {
          const { clean: cleanTitle } = parseDimTags(item.title);
          const { clean: cleanDetail, tags } = parseDimTags(item.detail);
          return (
            <div key={i} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{cleanTitle}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {cleanDetail}
                {tags.map((t, j) => (
                  <DimPill key={j} dim={t.dim} item={t.item} dimensions={dimensions} />
                ))}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function IntelligencePage() {
  const { toast } = useToast();
  const [selectedPulseIndex, setSelectedPulseIndex] = useState<number>(0);

  const { data: pulses = [], isLoading, isError, error, refetch } = useQuery<StrategicPulse[]>({
    queryKey: ["/api/strategic-pulse"],
  });

  const { data: dimensionsRaw = [] } = useQuery<Dimension[]>({
    queryKey: ["/api/dimensions"],
  });
  const dimensions: Dimension[] = dimensionsRaw.map((d: any) => ({
    ...d,
    items: typeof d.items === 'string' ? JSON.parse(d.items) : (d.items || []),
  }));

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/strategic-pulse/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategic-pulse"] });
      setSelectedPulseIndex(0);
      toast({ title: "Strategic Pulse generated", description: "Your new intelligence briefing is ready." });
    },
    onError: (error: any) => {
      let description = "Could not generate pulse.";
      try {
        const msg = error.message || "";
        const jsonStr = msg.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(jsonStr);
        if (parsed.error) description = parsed.error;
        else if (parsed.message) description = parsed.message;
      } catch {
        if (error.message) description = error.message;
      }
      toast({ title: "Generation failed", description, variant: "destructive" });
    },
  });

  const selectedPulse = pulses[selectedPulseIndex] || null;

  // Determine if this pulse is v2 (has new sections) or v1 (legacy)
  const isV2 = selectedPulse
    ? !!(selectedPulse.market_direction || selectedPulse.market_forces || selectedPulse.threat_watch || selectedPulse.roadmap_implications)
    : false;

  const exportPDF = async () => {
    const raw = localStorage.getItem('sb-fwcwijjargbdyjwyapwz-auth-token');
    if (!raw) return;
    const token = JSON.parse(raw).access_token;
    const res = await fetch('/api/strategic-pulse', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const pulse = data[selectedPulseIndex] || data[0];
    if (!pulse) return;
    await new Promise<void>((resolve, reject) => {
      if ((window as any).jspdf) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load jsPDF'));
      document.head.appendChild(s);
    });
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;
    const contentW = 180;
    let y = 35;
    const addText = (text: string, x: number, size: number, bold: boolean, r: number, g: number, b: number) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(r, g, b);
      const lines = doc.splitTextToSize(String(text || ''), contentW - (x - margin));
      for (const line of lines) {
        if (y > 272) { doc.addPage(); y = 20; }
        doc.text(line, x, y);
        y += size * 0.45;
      }
      y += 2;
    };
    const stripEmoji = (text: string) => {
      if (!text) return '';
      return text
        .replace(/🔴/g, '[HIGH]')
        .replace(/🟡/g, '[MED]')
        .replace(/🟢/g, '[LOW]')
        .replace(/\[DIM:[^\]]+\]/g, (m) => {
          // Convert [DIM:DimName|ItemName] → (Relates to: DimName → ItemName)
          const inner = m.slice(5, -1);
          const [dim, item] = inner.split('|');
          return `(Relates to: ${dim?.trim()} → ${item?.trim()})`;
        })
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-')
        .replace(/\u2019/g, "'")
        .replace(/\u201C/g, '"')
        .replace(/\u201D/g, '"')
        .replace(/[^\x00-\x7F]/g, '')
        .trim();
    };
    const addSection = (title: string, section: any, r: number, g: number, b: number) => {
      if (!section) return;
      y += 5;
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(r, g, b);
      doc.rect(margin, y - 4, contentW, 8, 'F');
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text(title, margin + 3, y + 1);
      y += 10;
      if (section.headline) addText(stripEmoji(section.headline), margin, 9, false, 80, 80, 80);
      for (const item of (section.items || [])) {
        if (y > 265) { doc.addPage(); y = 20; }
        addText('• ' + stripEmoji(item.title || ''), margin + 2, 9, true, 30, 30, 30);
        addText(stripEmoji(item.detail || ''), margin + 5, 8, false, 60, 60, 60);
      }
    };
    const addMarketDirectionSection = (section: any) => {
      if (!section || !section.paragraphs) return;
      y += 5;
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(37, 99, 235);
      doc.rect(margin, y - 4, contentW, 8, 'F');
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Market Direction', margin + 3, y + 1);
      y += 10;
      for (const para of section.paragraphs) {
        if (y > 265) { doc.addPage(); y = 20; }
        addText(stripEmoji(para), margin, 9, false, 30, 30, 30);
        y += 2;
      }
    };
    const addThreatWatchSection = (section: any) => {
      if (!section) return;
      y += 5;
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(220, 38, 38);
      doc.rect(margin, y - 4, contentW, 8, 'F');
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Threat Radar & Watch List', margin + 3, y + 1);
      y += 10;
      if (section.headline) addText(stripEmoji(section.headline), margin, 9, false, 80, 80, 80);
      if (section.urgent && section.urgent.length > 0) {
        addText('IMMEDIATE — ACTION REQUIRED', margin + 2, 8, true, 180, 30, 30);
        for (const item of section.urgent) {
          addText('• ' + stripEmoji(item.title || ''), margin + 2, 9, true, 30, 30, 30);
          addText(stripEmoji(item.detail || ''), margin + 5, 8, false, 60, 60, 60);
        }
      }
      if (section.monitoring && section.monitoring.length > 0) {
        addText('MONITORING — WATCH CLOSELY', margin + 2, 8, true, 160, 100, 0);
        for (const item of section.monitoring) {
          addText('• ' + stripEmoji(item.title || ''), margin + 2, 9, true, 30, 30, 30);
          addText(stripEmoji(item.detail || ''), margin + 5, 8, false, 60, 60, 60);
        }
      }
    };
    const addRoadmapSection = (section: any) => {
      if (!section) return;
      y += 5;
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(124, 58, 237);
      doc.rect(margin, y - 4, contentW, 8, 'F');
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Roadmap Implications', margin + 3, y + 1);
      y += 10;
      if (section.headline) addText(stripEmoji(section.headline), margin, 9, false, 80, 80, 80);
      let num = 1;
      for (const item of (section.items || [])) {
        addText(`${num}. ` + stripEmoji(item.title || ''), margin + 2, 9, true, 30, 30, 30);
        addText(stripEmoji(item.detail || ''), margin + 5, 8, false, 60, 60, 60);
        num++;
      }
    };

    doc.setFillColor(30, 40, 80);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Strategic Pulse', margin, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    const date = new Date(pulse.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text('Generated ' + date + '  ·  ' + pulse.capture_count + ' signals  ·  Signalum', margin, 20);

    const pulseMd = parseSection<MarketDirectionSection>(pulse.market_direction);
    const pulseMf = parseSection<PulseSection>(pulse.market_forces);
    const pulseEo = parseSection<PulseSection>(pulse.emerging_opportunities);
    const pulseCm = parseSection<PulseSection>(pulse.competitor_moves);
    const pulseTw = parseSection<ThreatWatchSection>(pulse.threat_watch);
    const pulseRi = parseSection<PulseSection>(pulse.regional_intelligence);
    const pulseRoad = parseSection<PulseSection>(pulse.roadmap_implications);
    const pulseBs = parseSection<PulseSection>(pulse.big_shift);
    const pulseTr = parseSection<PulseSection>(pulse.threat_radar);
    const pulseWl = parseSection<PulseSection>(pulse.watch_list);

    const isV2Pdf = !!(pulse.market_direction || pulse.market_forces || pulse.threat_watch || pulse.roadmap_implications);
    if (isV2Pdf) {
      addMarketDirectionSection(pulseMd);
      addSection('Market Forces', pulseMf, 59, 130, 246);
      addSection('Emerging Opportunities', pulseEo, 16, 185, 129);
      addSection('Competitor Moves Decoded', pulseCm, 139, 92, 246);
      addThreatWatchSection(pulseTw);
      addSection('Regional Intelligence', pulseRi, 100, 116, 139);
      addRoadmapSection(pulseRoad);
    } else {
      addSection('The Big Shift', pulseBs, 59, 130, 246);
      addSection('Emerging Opportunities', pulseEo, 16, 185, 129);
      addSection('Threat Radar', pulseTr, 239, 68, 68);
      addSection('Competitor Moves Decoded', pulseCm, 139, 92, 246);
      addSection('Watch List', pulseWl, 245, 158, 11);
      addSection('Regional Intelligence', pulseRi, 100, 116, 139);
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(150, 150, 150);
      doc.text('Signalum · Confidential · Page ' + i + ' of ' + pageCount, margin, 290);
    }
    doc.save('Strategic-Pulse-' + date + '.pdf');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading-intelligence">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8" data-testid="error-intelligence">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {(error as any)?.message || "Could not load strategic pulses. Please try again."}
        </p>
        <Button onClick={() => refetch()} variant="outline" data-testid="button-retry-intelligence">
          Try Again
        </Button>
      </div>
    );
  }

  if (pulses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8" data-testid="empty-intelligence">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Brain className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Strategic Intelligence</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Generate your first AI-powered strategic pulse to synthesise all captured intelligence signals into actionable insights.
        </p>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-first-pulse"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analysing all signals...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate First Pulse
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="page-intelligence">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 -mx-6 px-6 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-intelligence-title">Strategic Pulse</h1>
              <p className="text-xs text-muted-foreground">AI-powered intelligence briefing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={exportPDF}
              variant="outline"
              size="sm"
              data-testid="button-export-pdf"
              disabled={!selectedPulse}
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              size="sm"
              data-testid="button-generate-new-pulse"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analysing all signals...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate New Pulse
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border" data-testid="info-banner">
        <Info className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          {selectedPulse
            ? `This briefing synthesises ${selectedPulse.capture_count ?? '—'} intelligence signals from the last 6 months. Generated weekly or on demand.`
            : "Generated weekly or on demand. Hit Generate New Pulse to create your first briefing."}
        </p>
      </div>

      {pulses.length > 1 && (
        <div className="flex items-center gap-3" data-testid="history-selector">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Viewing pulse from:</label>
          <select
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground cursor-pointer"
            value={selectedPulseIndex}
            onChange={(e) => setSelectedPulseIndex(Number(e.target.value))}
            data-testid="select-pulse-history"
          >
            {pulses.map((p, i) => (
              <option key={p.id} value={i}>
                {new Date(p.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" "}
                {new Date(p.generated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {i === 0 ? " (latest)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedPulse && (
        <div className="space-y-4">
          {isV2 ? (
            <>
              <MarketDirectionCard section={parseSection<MarketDirectionSection>(selectedPulse.market_direction)} dimensions={dimensions} />
              <PulseSectionCard icon={Zap} title="Market Forces" color="blue" section={parseSection<PulseSection>(selectedPulse.market_forces)} dimensions={dimensions} />
              <PulseSectionCard icon={Target} title="Emerging Opportunities" color="green" section={parseSection<PulseSection>(selectedPulse.emerging_opportunities)} dimensions={dimensions} />
              <PulseSectionCard icon={Swords} title="Competitor Moves Decoded" color="purple" section={parseSection<PulseSection>(selectedPulse.competitor_moves)} dimensions={dimensions} />
              <ThreatWatchCard section={parseSection<ThreatWatchSection>(selectedPulse.threat_watch)} dimensions={dimensions} />
              <RegionalCard section={parseSection<PulseSection>(selectedPulse.regional_intelligence)} dimensions={dimensions} />
              <RoadmapCard section={parseSection<PulseSection>(selectedPulse.roadmap_implications)} dimensions={dimensions} />
            </>
          ) : (
            <>
              <PulseSectionCard icon={Zap} title="The Big Shift" color="blue" section={parseSection<PulseSection>(selectedPulse.big_shift)} dimensions={dimensions} />
              <PulseSectionCard icon={Target} title="Emerging Opportunities" color="green" section={parseSection<PulseSection>(selectedPulse.emerging_opportunities)} dimensions={dimensions} />
              <PulseSectionCard icon={ShieldAlert} title="Threat Radar" color="red" section={parseSection<PulseSection>(selectedPulse.threat_radar)} dimensions={dimensions} />
              <PulseSectionCard icon={Swords} title="Competitor Moves Decoded" color="purple" section={parseSection<PulseSection>(selectedPulse.competitor_moves)} dimensions={dimensions} />
              <PulseSectionCard icon={Eye} title="Watch List" color="amber" section={parseSection<PulseSection>(selectedPulse.watch_list)} dimensions={dimensions} />
              <RegionalCard section={parseSection<PulseSection>(selectedPulse.regional_intelligence)} dimensions={dimensions} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
