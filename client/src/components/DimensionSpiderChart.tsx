import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { calculateWeightedScore } from "@/lib/dimensionScoring";

interface DimensionItem {
  name: string;
  our_status: string | null;
  competitor_status: string | null;
  importance: string | null;
  status_id: string | null;
  source: string | null;
  evidence: string | null;
}

interface Dimension {
  id: string;
  name: string;
  priority: string;
  items: DimensionItem[];
}

interface DimensionComparisonData {
  dimensions: Dimension[];
}

function calculateScore(items: DimensionItem[], field: "our_status" | "competitor_status"): number {
  if (items.length === 0) return 0;
  return calculateWeightedScore(
    items.map((item) => ({
      status: item[field],
      importance: item.importance,
    }))
  );
}

function AssessmentBadge({ ourScore, theirScore }: { ourScore: number; theirScore: number }) {
  const diff = ourScore - theirScore;
  if (diff > 10) return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>Ahead</span>
  );
  if (diff < -10) return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fee2e2", color: "#991b1b", fontWeight: 600 }}>Behind</span>
  );
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e", fontWeight: 600 }}>Parity</span>
  );
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", minWidth: 26, textAlign: "right" }}>{score}</span>
    </div>
  );
}

export function DimensionSpiderChart({ entityName }: { entityName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);

  const { data, isLoading } = useQuery<DimensionComparisonData>({
    queryKey: ["/api/competitor-dimensions", entityName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitor-dimensions/${encodeURIComponent(entityName)}`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const dimensions = data?.dimensions ?? [];

  const scores = dimensions.map((dim) => ({
    name: dim.name,
    our: calculateScore(dim.items, "our_status"),
    their: calculateScore(dim.items, "competitor_status"),
  }));

  const overallOur = scores.length > 0
    ? Math.round(scores.reduce((s, d) => s + d.our, 0) / scores.length)
    : 0;
  const overallTheir = scores.length > 0
    ? Math.round(scores.reduce((s, d) => s + d.their, 0) / scores.length)
    : 0;

  useEffect(() => {
    if (scores.length < 2 || !canvasRef.current) return;

    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

    loadScript("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js").then(() => {
      const Chart = (window as any).Chart;
      if (!Chart || !canvasRef.current) return;

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }

      chartInstanceRef.current = new Chart(canvasRef.current, {
        type: "radar",
        data: {
          labels: scores.map((d) => d.name.length > 16 ? d.name.slice(0, 15) + "…" : d.name),
          datasets: [
            {
              label: "Us",
              data: scores.map((d) => d.our),
              backgroundColor: "rgba(83, 74, 183, 0.15)",
              borderColor: "#534AB7",
              borderWidth: 2,
              pointBackgroundColor: "#534AB7",
              pointRadius: 4,
            },
            {
              label: entityName,
              data: scores.map((d) => d.their),
              backgroundColor: "rgba(216, 90, 48, 0.12)",
              borderColor: "#D85A30",
              borderWidth: 2,
              pointBackgroundColor: "#D85A30",
              pointRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: {
                stepSize: 25,
                font: { size: 10 },
                backdropColor: "transparent",
                color: "#94a3b8",
              },
              pointLabels: { font: { size: 11 }, color: "#334155" },
              grid: { color: "rgba(0,0,0,0.06)" },
              angleLines: { color: "rgba(0,0,0,0.06)" },
            },
          },
        },
      });
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [scores.map((s) => `${s.name}${s.our}${s.their}`).join(",")]);

  if (isLoading) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Loading dimension data…
      </div>
    );
  }

  if (dimensions.length === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        No competitive dimensions configured yet. Add dimensions in My Product settings.
      </div>
    );
  }

  if (dimensions.length < 2) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Add at least 2 dimensions to see the competitive scoring chart.
      </div>
    );
  }

  const overallDiff = overallOur - overallTheir;
  const overallLabel = overallDiff > 10 ? "Ahead" : overallDiff < -10 ? "Behind" : "Parity";
  const overallBadgeStyle = overallDiff > 10
    ? { bg: "#d1fae5", text: "#065f46" }
    : overallDiff < -10
    ? { bg: "#fee2e2", text: "#991b1b" }
    : { bg: "#fef3c7", text: "#92400e" };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#534AB7", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>Us</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#D85A30", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{entityName}</span>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: 320, marginBottom: 20 }}>
        <canvas ref={canvasRef} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {scores.map((dim) => (
          <div
            key={dim.name}
            style={{
              border: "0.5px solid #e2e8f0",
              borderRadius: 8,
              padding: "10px 12px",
              background: "#fafafa",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#1e293b" }}>{dim.name}</span>
              <AssessmentBadge ourScore={dim.our} theirScore={dim.their} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <ScoreBar score={dim.our} color="#534AB7" />
              <ScoreBar score={dim.their} color="#D85A30" />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "14px 16px",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
            Overall competitive score
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginTop: 6 }}>
            <div>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#534AB7" }}>{overallOur}</span>
              <span style={{ fontSize: 11, color: "#64748b", marginLeft: 3 }}>Us</span>
            </div>
            <div>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#D85A30" }}>{overallTheir}</span>
              <span style={{ fontSize: 11, color: "#64748b", marginLeft: 3 }}>{entityName}</span>
            </div>
          </div>
        </div>
        <div>
          <span
            style={{
              fontSize: 13,
              padding: "4px 14px",
              borderRadius: 20,
              fontWeight: 700,
              background: overallBadgeStyle.bg,
              color: overallBadgeStyle.text,
            }}
          >
            {overallLabel} ({overallDiff > 0 ? "+" : ""}{overallDiff} pts)
          </span>
        </div>
      </div>
    </div>
  );
}
