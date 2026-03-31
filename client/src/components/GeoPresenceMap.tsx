import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface GeoPresence {
  id: string;
  region: string;
  iso_code: string | null;
  presence_type: string;
  channels: string | null;
  notes: string | null;
}

const PRESENCE_COLORS: Record<string, { fill: string; bg: string; text: string; label: string }> = {
  headquarters: { fill: "#185FA5", bg: "#dbeafe", text: "#1e40af", label: "Headquarters" },
  active:       { fill: "#1D9E75", bg: "#d1fae5", text: "#065f46", label: "Strong presence" },
  expanding:    { fill: "#EF9F27", bg: "#fef3c7", text: "#92400e", label: "Growing" },
  limited:      { fill: "#B4B2A9", bg: "#f3f4f6", text: "#4b5563", label: "Limited" },
  exited:       { fill: "#B4B2A9", bg: "#f3f4f6", text: "#4b5563", label: "Exited" },
};

const REGION_TO_COUNTRIES: Record<string, string[]> = {
  "North America":    ["United States of America", "Canada", "Mexico"],
  "United States":    ["United States of America"],
  "USA":              ["United States of America"],
  "US":               ["United States of America"],
  "Canada":           ["Canada"],
  "United Kingdom":   ["United Kingdom"],
  "UK":               ["United Kingdom"],
  "Europe":           ["France", "Germany", "Netherlands", "Spain", "Italy", "Finland", "Sweden", "Norway", "Denmark", "Belgium", "Austria", "Switzerland", "Portugal", "Ireland", "Poland", "Czech Republic", "Hungary", "Romania", "Slovakia", "Slovenia", "Bulgaria", "Croatia", "Greece"],
  "EU":               ["France", "Germany", "Netherlands", "Spain", "Italy", "Finland", "Sweden", "Denmark", "Belgium", "Austria", "Portugal", "Ireland", "Poland"],
  "Western Europe":   ["France", "Germany", "Netherlands", "Spain", "Italy", "Belgium", "Austria", "Switzerland", "Portugal", "Ireland"],
  "Asia Pacific":     ["Australia", "Japan", "Singapore", "South Korea", "India", "New Zealand", "Thailand", "Malaysia", "Indonesia", "Philippines", "Vietnam"],
  "APAC":             ["Australia", "Japan", "Singapore", "South Korea", "India", "New Zealand"],
  "Asia":             ["Japan", "Singapore", "South Korea", "India", "China", "Thailand", "Malaysia", "Indonesia"],
  "Southeast Asia":   ["Singapore", "Thailand", "Malaysia", "Indonesia", "Philippines", "Vietnam"],
  "Middle East":      ["United Arab Emirates", "Saudi Arabia", "Qatar", "Bahrain", "Oman", "Kuwait", "Israel", "Jordan"],
  "Africa":           ["South Africa", "Nigeria", "Kenya", "Egypt", "Morocco", "Ghana", "Tanzania"],
  "Latin America":    ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru", "Ecuador", "Venezuela"],
  "South America":    ["Brazil", "Argentina", "Colombia", "Chile", "Peru", "Ecuador"],
  "Australia":        ["Australia"],
  "New Zealand":      ["New Zealand"],
  "Japan":            ["Japan"],
  "Germany":          ["Germany"],
  "France":           ["France"],
  "India":            ["India"],
  "China":            ["China"],
  "Singapore":        ["Singapore"],
  "Brazil":           ["Brazil"],
  "UAE":              ["United Arab Emirates"],
  "Israel":           ["Israel"],
  "South Africa":     ["South Africa"],
  "Nordic":           ["Sweden", "Norway", "Denmark", "Finland"],
  "Nordics":          ["Sweden", "Norway", "Denmark", "Finland"],
  "Scandinavia":      ["Sweden", "Norway", "Denmark"],
  "DACH":             ["Germany", "Austria", "Switzerland"],
  "Benelux":          ["Belgium", "Netherlands", "Luxembourg"],
  "Global":           ["United States of America", "Canada", "United Kingdom", "Germany", "France", "Australia", "Japan", "Brazil", "India", "Singapore", "South Africa"],
  "Worldwide":        ["United States of America", "Canada", "United Kingdom", "Germany", "France", "Australia", "Japan", "Brazil", "India", "Singapore"],
};

function resolvePresenceType(region: string, presence_type: string, notes: string | null): string {
  const combined = `${region} ${notes ?? ""}`.toLowerCase();
  if (combined.includes("headquarter") || combined.includes(" hq") || combined.includes("hq ")) {
    return "headquarters";
  }
  return presence_type;
}

export function GeoPresenceMap({ entityId }: { entityId: string }) {
  const mapRef = useRef<SVGSVGElement>(null);

  const { data: geoData, isLoading } = useQuery<GeoPresence[]>({
    queryKey: ["geo-presence", entityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/geo-presence`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!geoData || geoData.length === 0 || !mapRef.current) return;

    const countryColorMap: Record<string, string> = {};
    geoData.forEach((entry) => {
      const resolvedType = resolvePresenceType(entry.region, entry.presence_type, entry.notes);
      const color = PRESENCE_COLORS[resolvedType]?.fill ?? PRESENCE_COLORS.limited.fill;
      const countries = REGION_TO_COUNTRIES[entry.region] ?? [entry.region];
      countries.forEach((c) => {
        if (!countryColorMap[c] || resolvedType === "headquarters") {
          countryColorMap[c] = color;
        }
      });
    });

    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

    Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"),
    ]).then(async () => {
      const d3 = (window as any).d3;
      const topojson = (window as any).topojson;
      if (!d3 || !topojson || !mapRef.current) return;

      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const defaultFill = isDark ? "#374151" : "#e5e7eb";
      const strokeColor = isDark ? "#1f2937" : "#fff";

      const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      const countries = topojson.feature(world, world.objects.countries);

      const svg = d3.select(mapRef.current);
      svg.selectAll("*").remove();

      const projection = d3.geoNaturalEarth1().fitSize([900, 460], countries);
      const path = d3.geoPath().projection(projection);

      const nameMap: Record<string, string> = {};
      if (world.objects.countries.geometries) {
        world.objects.countries.geometries.forEach((g: any) => {
          if (g.properties?.name) nameMap[g.properties.name] = g.properties.name;
        });
      }

      svg.selectAll("path")
        .data(countries.features)
        .join("path")
        .attr("d", path)
        .attr("fill", (d: any) => {
          const name = d.properties?.name ?? "";
          return countryColorMap[name] ?? defaultFill;
        })
        .attr("stroke", strokeColor)
        .attr("stroke-width", 0.5);
    });
  }, [geoData]);

  if (isLoading) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Loading geographic data…
      </div>
    );
  }

  if (!geoData || geoData.length === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        No geographic presence data logged yet.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(PRESENCE_COLORS).map(([key, val]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: val.fill, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#64748b" }}>{val.label}</span>
          </div>
        ))}
      </div>

      <svg
        ref={mapRef}
        viewBox="0 0 900 460"
        style={{ width: "100%", height: "auto", borderRadius: 8, background: "transparent" }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 8,
          marginTop: 16,
        }}
      >
        {geoData.map((entry) => {
          const resolvedType = resolvePresenceType(entry.region, entry.presence_type, entry.notes);
          const style = PRESENCE_COLORS[resolvedType] ?? PRESENCE_COLORS.limited;
          return (
            <div
              key={entry.id}
              style={{
                border: "0.5px solid #e2e8f0",
                borderRadius: 8,
                padding: "10px 12px",
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 5 }}>
                {entry.region}
              </div>
              {entry.notes && (
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, lineHeight: 1.4 }}>
                  {entry.notes}
                </div>
              )}
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 20,
                  fontWeight: 500,
                  background: style.bg,
                  color: style.text,
                }}
              >
                {style.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
