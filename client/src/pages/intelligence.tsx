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
    const element = document.querySelector('[data-testid="page-intelligence"]') as HTMLElement;
    if (!element) return;

    const originalStyle = element.style.cssText;
    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';

    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');

      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        scrollY: 0,
        height: element.scrollHeight,
        width: element.scrollWidth,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'JPEG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 20);
      }

      const date = selectedPulse
        ? new Date(selectedPulse.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'pulse';
      pdf.save(`Strategic-Pulse-${date}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      element.style.cssText = originalStyle;
    }
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