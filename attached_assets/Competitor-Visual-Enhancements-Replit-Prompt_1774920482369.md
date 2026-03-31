# Competitor Page Visual Enhancements — Replit Prompt

## Paste CLAUDE.md first, then paste this prompt.

---

## OVERVIEW: 3 changes to the competitor detail page
1. Geo presence map with region cards (collapsible)
2. Spider chart + dimension scoring (collapsible)
3. Remove DimensionMatrix from competitor page

---

## CRITICAL SAFETY RULES:
- Do NOT run drizzle-kit push
- Use apiRequest() for authenticated frontend fetches
- staleTime: 0, gcTime: 0, refetchOnMount: "always" on new queries
- Build new components as SEPARATE files
- Do NOT modify server/storage.ts or shared/schema.ts

---

## 1. GEO PRESENCE MAP

Replace the current GeoPresenceCard with an enhanced version that 
includes a world map + region cards.

### New component: GeoPresenceMap.tsx

Uses D3.js for the world map + a grid of region summary cards below.

**Data source:** The existing geo_presence data from the entity 
object (Perplexity-populated). Parse the regions and map them to 
countries for coloring.

**Layout:**
- Collapsible via CollapsibleSection (defaultOpen: false)
- Legend bar at top: 4 color dots
  - Blue (#185FA5) = Headquarters
  - Green (#1D9E75) = Strong presence
  - Amber (#EF9F27) = Growing
  - Gray (#B4B2A9) = Limited
- World map (D3 choropleth):
  - Load world topology from: https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json
  - Use d3.geoNaturalEarth1() projection
  - Color countries based on presence level
  - Default fill: light gray (#eee light mode, #333 dark mode)
  - Stroke: thin borders between countries
  - Responsive: viewBox="0 0 900 460", width 100%
- Region cards grid (3 columns on desktop, 1 on mobile):
  - Each card: region name (bold), 1-line description, status pill
  - Status pills: Headquarters (blue bg), Strong (green bg), 
    Growing (amber bg), Limited (gray bg)

**D3 loading:**
```tsx
// In the component, load D3 and topojson via script tags
// Or use dynamic import from CDN
// D3 UMD: https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js
// TopoJSON: https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js
```

Since this is a React app, use useEffect + useRef to render D3 
into a container div. Load the scripts dynamically:

```typescript
useEffect(() => {
  // Load D3 and topojson scripts
  const loadScript = (src: string) => new Promise<void>((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
  
  Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js')
  ]).then(() => {
    renderMap();
  });
}, [geoData]);
```

**Mapping geo data to countries:**
Parse the entity's geo_presence field. It contains region names like 
"North America", "United Kingdom", "Europe", etc. Map these to 
country names that match the world-atlas topology:

```typescript
const regionToCountries: Record<string, string[]> = {
  'North America': ['United States of America', 'Canada', 'Mexico'],
  'United States': ['United States of America'],
  'United Kingdom': ['United Kingdom'],
  'Europe': ['France', 'Germany', 'Netherlands', 'Spain', 'Italy', 
    'Finland', 'Sweden', 'Norway', 'Denmark', 'Belgium', 'Austria',
    'Switzerland', 'Portugal', 'Ireland', 'Poland'],
  'EU': ['France', 'Germany', 'Netherlands', 'Spain', 'Italy', 
    'Finland', 'Sweden', 'Denmark', 'Belgium', 'Austria', 'Portugal',
    'Ireland', 'Poland'],
  'Asia Pacific': ['Australia', 'Japan', 'Singapore', 'South Korea',
    'India', 'New Zealand', 'Thailand', 'Malaysia', 'Indonesia'],
  'APAC': ['Australia', 'Japan', 'Singapore', 'South Korea', 'India'],
  'Middle East': ['United Arab Emirates', 'Saudi Arabia', 'Qatar',
    'Bahrain', 'Oman', 'Kuwait', 'Israel'],
  'Africa': ['South Africa', 'Nigeria', 'Kenya', 'Egypt'],
  'Latin America': ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile'],
  'South America': ['Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru']
};
```

Determine presence level from the geo_presence description text:
- Contains "headquarters" or "HQ" → blue (HQ)
- Contains "strong" or "major" or "established" → green (Strong)
- Contains "growing" or "expanding" or "entering" → amber (Growing)
- Default → gray (Limited)

**Dark mode support:**
Check `matchMedia('(prefers-color-scheme: dark)').matches` and 
adjust map colors accordingly.

### Integration:
In topic-view.tsx, find where GeoPresenceCard is rendered for 
competitors. Replace it with:
```tsx
<CollapsibleSection title="Geographic presence" defaultOpen={false}>
  <GeoPresenceMap geoPresence={entity.geo_presence} />
</CollapsibleSection>
```

---

## 2. SPIDER CHART + DIMENSION SCORING

Add a new visual component showing a radar/spider chart comparing 
"Us" vs the current competitor across all dimension groups, with 
per-dimension scores and an overall score.

### New component: DimensionSpiderChart.tsx

Props: { entityName: string }

**Data fetching:**
- Fetch /api/competitor-dimensions/:entityName (already exists)
- This returns dimensions with items, each having our_status and 
  competitor_status

**Score calculation (client-side):**
For each dimension, calculate a score 0-100:
```typescript
function calculateScore(items: any[], statusField: string): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => {
    const status = item[statusField];
    if (status === 'yes') return sum + 100;
    if (status === 'partial') return sum + 50;
    if (status === 'unknown') return sum + 25;
    return sum; // 'no' or 'na' = 0
  }, 0);
  return Math.round(total / items.length);
}

// Per dimension:
const ourScore = calculateScore(dim.items, 'our_status');
const theirScore = calculateScore(dim.items, 'competitor_status');
```

Overall score = average of all dimension scores.

**Layout:**

Top: Custom HTML legend (not Chart.js default):
- Purple dot (#534AB7) = "Us (product_name)"
- Coral dot (#D85A30) = competitor name

Middle: Radar chart using Chart.js:
```typescript
// Load Chart.js via script tag or import
type: 'radar',
data: {
  labels: dimensionNames, // shortened to fit (max 15 chars)
  datasets: [
    { label: 'Us', data: ourScores, 
      backgroundColor: 'rgba(83, 74, 183, 0.15)',
      borderColor: '#534AB7', borderWidth: 2,
      pointBackgroundColor: '#534AB7', pointRadius: 4 },
    { label: competitorName, data: theirScores,
      backgroundColor: 'rgba(216, 90, 48, 0.12)',
      borderColor: '#D85A30', borderWidth: 2,
      pointBackgroundColor: '#D85A30', pointRadius: 4 }
  ]
},
options: {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    r: { beginAtZero: true, max: 100,
      ticks: { stepSize: 25, font: { size: 10 }, 
        backdropColor: 'transparent' },
      pointLabels: { font: { size: 11 } },
      grid: { color: 'rgba(0,0,0,0.06)' },
      angleLines: { color: 'rgba(0,0,0,0.06)' }
    }
  }
}
```

Canvas wrapper: `<div style="position:relative;width:100%;height:320px">`

Below chart: Score cards grid (2 columns):
Each score card:
- Dimension name (13px, weight 500)
- Two mini bar charts side by side:
  - Our score: purple bar + number
  - Their score: coral bar + number
- Assessment badge:
  - "Ahead" (green pill) if our score > their score + 10
  - "Behind" (red pill) if their score > our score + 10  
  - "Parity" (amber pill) if within 10 points

Bottom: Overall competitive score bar:
- Full width card with:
  - "Overall competitive score" label
  - Our total score (large, purple)
  - Their total score (large, coral)
  - Ahead/Behind/Parity badge with point difference

**Chart.js loading in React:**
Same pattern as the map — load Chart.js via dynamic script tag,
render into a canvas ref:

```typescript
useEffect(() => {
  const loadScript = (src: string) => new Promise<void>((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
  
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js')
    .then(() => renderChart());
}, [scores]);
```

### Integration:
In topic-view.tsx, add inside the Competitive tab (or Overview) 
for competitor entities, ABOVE the DimensionComparisonCard:
```tsx
<CollapsibleSection title="Competitive scoring" defaultOpen={true}>
  <DimensionSpiderChart entityName={entity.name} />
</CollapsibleSection>
```

---

## 3. REMOVE DIMENSION MATRIX FROM COMPETITOR PAGE

The DimensionMatrix is available from the "Compare" button on 
My Workspace. Having it on every competitor page is redundant.

### Fix:
In topic-view.tsx, find where DimensionMatrix is rendered on 
competitor pages and REMOVE it. 

Search for `<DimensionMatrix` in topic-view.tsx. It should only 
remain in map.tsx (the My Workspace Compare modal).

Do NOT remove the DimensionComparisonCard — that's the side-by-side 
comparison for the current competitor, which is different from the 
full matrix. Only remove DimensionMatrix.

---

## FILES TO CREATE:
- client/src/components/GeoPresenceMap.tsx
- client/src/components/DimensionSpiderChart.tsx

## FILES TO MODIFY:
- client/src/pages/topic-view.tsx (replace GeoPresenceCard with 
  GeoPresenceMap, add DimensionSpiderChart, remove DimensionMatrix)

## FILES NOT TO MODIFY:
- server/routes.ts (no new API routes needed — all data comes 
  from existing endpoints)
- server/storage.ts, shared/schema.ts, drizzle.config.ts
- client/src/components/DimensionMatrix.tsx (keep the file, just 
  remove its usage from competitor pages)
- client/src/pages/map.tsx (DimensionMatrix stays here for Compare)

## VERIFICATION:
1. Navigate to iProov competitor page
2. Geographic presence section:
   - [ ] Collapsible with chevron
   - [ ] World map renders with colored countries
   - [ ] Region cards show below with status badges
   - [ ] Dark mode works (map colors adapt)
3. Competitive scoring section:
   - [ ] Spider chart shows Us vs iProov overlay
   - [ ] Score cards show per-dimension comparison
   - [ ] Overall score shows at bottom with Ahead/Behind badge
   - [ ] Numbers are correct (yes=100, partial=50, etc.)
4. DimensionMatrix:
   - [ ] NOT shown on competitor page
   - [ ] Still works from Compare button on My Workspace
5. All sections are collapsible
6. Mobile responsive (resize to 390px)
