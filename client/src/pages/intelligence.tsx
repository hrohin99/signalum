import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Brain, Zap, Target, ShieldAlert, Swords, Eye, Loader2, Info, Sparkles, Globe, Download, type LucideIcon } from "lucide-react";
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

interface StrategicPulse {
  id: string;
  workspace_id: string;
  generated_at: string;
  big_shift: PulseSection | null;
  emerging_opportunities: PulseSection | null;
  threat_radar: PulseSection | null;
  competitor_moves: PulseSection | null;
  watch_list: PulseSection | null;
  regional_intelligence: PulseSection | null;
  capture_count: number;
  model: string;
}

const sectionColorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", iconBg: "bg-blue-100 dark:bg-blue-900", text: "text-blue-700 dark:text-blue-300" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", iconBg: "bg-emerald-100 dark:bg-emerald-900", text: "text-emerald-700 dark:text-emerald-300" },
  red: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", iconBg: "bg-red-100 dark:bg-red-900", text: "text-red-700 dark:text-red-300" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", iconBg: "bg-purple-100 dark:bg-purple-900", text: "text-purple-700 dark:text-purple-300" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", iconBg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-700 dark:text-amber-300" },
};

function PulseSectionCard({
  icon: Icon,
  title,
  color,
  section,
}: {
  icon: LucideIcon;
  title: string;
  color: string;
  section: PulseSection | null;
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
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionalCard({ section }: { section: PulseSection | null }) {
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
        {(section.items || []).map((item, i) => (
          <div key={i} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{item.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
          </div>
        ))}
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

  const exportPDF = async () => {
  const raw = localStorage.getItem('sb-fwcwijjargbdyjwyapwz-auth-token');
  if (!raw) return;
  const token = JSON.parse(raw).access_token;
  const res = await fetch('/api/strategic-pulse', { headers: { 'Authorization': 'Bearer ' + token } });
  const data = await res.json();
  const pulse = data[0];
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
  doc.setFillColor(30, 40, 80);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Strategic Pulse', margin, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const date = new Date(pulse.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text('Generated ' + date + '  ·  ' + pulse.capture_count + ' signals  ·  Signalum', margin, 20);
  addSection('The Big Shift', pulse.big_shift, 59, 130, 246);
  addSection('Emerging Opportunities', pulse.emerging_opportunities, 16, 185, 129);
  addSection('Threat Radar', pulse.threat_radar, 239, 68, 68);
  addSection('Competitor Moves Decoded', pulse.competitor_moves, 139, 92, 246);
  addSection('Watch List', pulse.watch_list, 245, 158, 11);
  addSection('Regional Intelligence', pulse.regional_intelligence, 100, 116, 139);
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
          <PulseSectionCard icon={Zap} title="The Big Shift" color="blue" section={selectedPulse.big_shift} />
          <PulseSectionCard icon={Target} title="Emerging Opportunities" color="green" section={selectedPulse.emerging_opportunities} />
          <PulseSectionCard icon={ShieldAlert} title="Threat Radar" color="red" section={selectedPulse.threat_radar} />
          <PulseSectionCard icon={Swords} title="Competitor Moves Decoded" color="purple" section={selectedPulse.competitor_moves} />
          <PulseSectionCard icon={Eye} title="Watch List" color="amber" section={selectedPulse.watch_list} />
          <RegionalCard section={selectedPulse.regional_intelligence ?? null} />
        </div>
      )}
    </div>
  );
}