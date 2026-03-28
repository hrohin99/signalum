# Topic Page Redesign + Updates UI + UX Fixes — Replit Prompt

## Paste CLAUDE.md first, then paste this prompt.

---

## OVERVIEW

This prompt covers 6 changes. Implement them in order:
1. Mobile tab overflow fix
2. Updates text overflow fix  
3. Pricing detection fix
4. Updates UI redesign (new UpdatesList component)
5. Non-competitor topic page redesign
6. Auto-milestones via Perplexity

---

## CRITICAL SAFETY RULES
- Do NOT run drizzle-kit push
- Do NOT modify server/storage.ts or shared/schema.ts
- All new useQuery calls MUST include staleTime: 0, gcTime: 0, refetchOnMount: "always"
- Use apiRequest() for any new authenticated frontend fetches
- Use db.execute(sql`...`) for all DB writes
- Build new components as SEPARATE files, not inline in topic-view.tsx
- New DB tables go in server/dbSafety.ts with CREATE TABLE IF NOT EXISTS

---

## 1. MOBILE TAB OVERFLOW FIX

The tab bar (Overview, Profile, Commercial, Competitive, Strategy, Updates)
gets cut off on mobile with no visual indicator that more tabs exist.

### Fix in topic-view.tsx (wherever the tab bar is rendered):

Add to the tabs container:
```css
overflow-x: auto;
-webkit-overflow-scrolling: touch;
scrollbar-width: none;
-ms-overflow-style: none;
```
Add `::-webkit-scrollbar { display: none; }` via Tailwind or inline style.

Wrap tabs in a relative container. Add a fade gradient div on the right:
```css
position: absolute;
right: 0; top: 0; bottom: 0;
width: 32px;
background: linear-gradient(to right, transparent, white);
pointer-events: none;
```

Each tab needs: `white-space: nowrap; flex-shrink: 0;`

---

## 2. UPDATES TEXT OVERFLOW FIX

Update/capture card text (especially URLs) overflows on the right side.

### Fix on the capture/update card component:

```css
/* Card container */
overflow: hidden;
min-width: 0; /* critical for flex children */

/* All text inside */
word-break: break-word;
overflow-wrap: break-word;

/* Source URLs specifically */
max-width: 100%;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
```

---

## 3. PRICING DETECTION FIX

Two bugs:

### Bug A: False positives
The AI/regex detects revenue, funding, and valuations as "pricing."
E.g., "Persona doubled revenue to $141 million" shows as "Pricing: $141."

Fix: Update the pricing detection logic to ONLY match actual product/service
pricing. Skip any match containing: "revenue", "valuation", "funding",
"raised", "market size", "market cap", "billion" (company financials),
"million" (company financials).

Only extract pricing when text describes what a CUSTOMER PAYS:
"per transaction", "per verification", "per user", "per month",
"license fee", "starting at $X", "costs $X per", etc.

### Bug B: Shows on non-competitors
Pricing should ONLY appear for entities where topic_type === 'competitor'.

Add a guard:
```typescript
if (entity.topic_type !== 'competitor') {
  // Skip pricing detection entirely — hide pricing UI
}
```

---

## 4. UPDATES UI REDESIGN

Replace the current update/capture card list with a new compact, expandable
design. Build as: `client/src/components/UpdatesList.tsx`

### Props:
```typescript
interface UpdatesListProps {
  captures: Capture[];
  entityType: string; // 'competitor' | 'regulation' | 'topic' | etc.
  dimensions?: any[]; // from /api/dimensions, for dimension tag matching
}
```

### Filter bar (top of component):
- Left: Time pills: "All time" (default), "This week", "This month", "Last 90 days"
  - Selected: background #534AB7, white text, purple border
  - Unselected: white bg, gray border
- Vertical divider (0.5px, 20px tall)
- Right: Category dropdown button "Category: All"
  - Dropdown options: All, Product launch, Contract win, Partnership,
    Certification, R&D signal, Case study, Conference, Other
  - Selected category: button gets purple highlight, text updates
- ALL filtering is client-side (no API re-fetch)

### Update cards — COLLAPSED state (default):
- Background: WHITE (var(--color-background-primary))
- Left: Signal dot (8px circle)
  - Red (#E24B4A) = high signal
  - Amber (#EF9F27) = notable
  - Blue (#85B7EB) = normal
- Row 1: Title (14px, weight 500, single line, ellipsis) + Date (11px, gray) + Chevron (16px, gray, points right)
- Row 2: Source domain (11px, info color, truncated) + Dimension tag (purple pill, optional) + Category tag (gray pill)
- Border between cards: 0.5px solid var(--color-border-tertiary)
- Hover: var(--color-background-secondary)
- Cursor: pointer on whole row
- Click ANYWHERE on row to expand/collapse

### Update cards — EXPANDED state:
- Chevron rotates 90 degrees
- Expanded panel appears below row 2:
  - Background: var(--color-background-secondary)
  - Border-radius: var(--border-radius-md)
  - Padding: 12px, margin: 8px 0 4px
  - Content: full capture text (13px, gray, line-height 1.5)
  - Action buttons: "Save to battlecard", "Add to briefing", "Open source"
  - Buttons: small outlined style (11px, 0.5px border, rounded)

### Category detection (client-side keyword matching on title):
```typescript
function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (/launch|release|announces.*product|new.*suite|introduces/.test(t)) return 'Product launch';
  if (/contract|selected|awarded|wins|chosen|deployed at/.test(t)) return 'Contract win';
  if (/partner|integration|alliance|collaborat|joint/.test(t)) return 'Partnership';
  if (/certif|compliance|accredit|ISO|NIST|FIDO/.test(t)) return 'Certification';
  if (/patent|R&D|research|study|paper|whitepaper/.test(t)) return 'R&D signal';
  if (/case study|zero fraud|deployed|implementation/.test(t)) return 'Case study';
  if (/keynote|conference|summit|event|webinar/.test(t)) return 'Conference';
  return 'Other';
}
```

### Dimension tag matching (client-side):
- Fetch dimensions via useQuery to /api/dimensions
- For each capture, check if any dimension item name appears in the
  capture content (case-insensitive substring match)
- If matched, show dimension name as purple pill (#EEEDFE bg, #534AB7 text)
- Not every update will have a dimension tag — only when there's a match

### Responsive (mobile < 768px):
- Title wraps to 2 lines (remove white-space: nowrap)
- Source URL: max-width 120px with ellipsis
- Filter pills wrap if needed

### Integration:
In topic-view.tsx, replace current updates/captures section with:
```tsx
<UpdatesList 
  captures={entityCaptures} 
  entityType={entity.topic_type}
  dimensions={dimensionsData}
/>
```

---

## 5. NON-COMPETITOR TOPIC PAGE REDESIGN

For entities where topic_type !== 'competitor', the page should show a
DIFFERENT layout than competitor pages.

### Current sections to REMOVE for non-competitors:
- Partnerships & alliances card
- Key Dates (Coming Soon) placeholder
- Compliance Notes (Coming Soon) placeholder
- Any competitor-specific tabs (Profile, Commercial, Competitive, Strategy)

### New layout for non-competitor topics:

**Tabs:** Only show "Overview" and "Updates (N)" tabs.

**Overview tab sections (all collapsible):**

Each section is a card with a clickable header that expands/collapses.
Use a consistent pattern:
```tsx
// CollapsibleSection component — build as separate file
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode; // e.g., "1 gap" or "4 milestones"
  children: React.ReactNode;
}
```
Header has: icon + title on left, badge + chevron on right.
Click header to toggle. Chevron rotates on expand.

**Section 1: AI Summary** (defaultOpen: true)
- Keep existing AI summary component as-is
- Just wrap in CollapsibleSection

**Section 2: Impact on our product** (defaultOpen: true)
- NEW component: `TopicImpactCard.tsx`
- Fetches user's competitive dimensions from /api/dimensions
- Uses Claude API to determine which dimension items are affected
  by this topic (can be done during AI summary generation — add
  to the same prompt)
- Displays a list of affected dimension items:
  - Each row: Dimension name | Item name | Our status pill (green/amber/red) | Action label
  - Action labels based on our_status:
    - "no" → "Action needed" (purple pill)
    - "partial" → "Monitor" (purple pill)  
    - "yes" → "Leverage" (purple pill)
- Badge in collapsed header: count of gaps (e.g., "1 gap" in red)
- If no dimensions match, show: "No direct impact on tracked dimensions"

For the initial version, the impact mapping can be simpler:
- Match topic name and capture content against dimension item names
- Same client-side keyword matching as dimension tags in updates
- No separate API call needed for V1

**Section 3: My Notes** (defaultOpen: true)
- NEW component: `TopicNotes.tsx`
- Rich text editor using contentEditable div with toolbar
- Toolbar buttons: Bold, Italic, Underline | Bullet list, Numbered list | Heading, Link
- Use document.execCommand() for toolbar actions (simple, works everywhere)
- Auto-save: debounce 1 second after last keystroke, save to backend
- Content stored as HTML string

NEW API routes needed:
```
GET /api/topic-notes/:entityName — returns { content: string }
PUT /api/topic-notes/:entityName — body: { content: string }
```

NEW DB table (add to dbSafety.ts):
```sql
CREATE TABLE IF NOT EXISTS topic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  content TEXT DEFAULT '',
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(workspace_id, entity_name)
);
```

**Section 4: Key Milestones** (defaultOpen: false, show count in badge)
- NEW component: `TopicMilestones.tsx`
- Timeline display with vertical line and dots
- Each milestone: date, event title, description note
- Milestones with source='perplexity' show small "AI" badge
- Milestones with source='manual' show no badge
- Future milestones (date > today) show red dot border
- Add milestone form at bottom: date input + text input + "Add" button
- Manual add saves with source='manual'

NEW API routes:
```
GET /api/topic-milestones/:entityName — returns milestones array
POST /api/topic-milestones/:entityName — body: { date, event, note }
DELETE /api/topic-milestones/:id
```

NEW DB table (add to dbSafety.ts):
```sql
CREATE TABLE IF NOT EXISTS topic_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  milestone_date DATE NOT NULL,
  event TEXT NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topic_milestones_entity
ON topic_milestones(workspace_id, entity_name);
```

**Section 5: Latest Updates** (defaultOpen: true)
- Shows the first 5 updates in compact format (dot + title + date)
- "View all N updates" link switches to the Updates tab
- Or just embed the UpdatesList component with a limit prop

### Conditional rendering in topic-view.tsx:

```tsx
// At the top level where tabs and content are rendered:
const isCompetitor = entity.topic_type === 'competitor';

// For tabs:
{isCompetitor ? (
  // Show all tabs: Overview, Profile, Commercial, Competitive, Strategy, Updates
) : (
  // Show only: Overview, Updates
)}

// For Overview tab content:
{isCompetitor ? (
  // Existing competitor sections (AI Summary, Products, Funding, etc.)
) : (
  // New topic sections:
  <CollapsibleSection title="AI summary" defaultOpen icon={...}>
    <AISummaryContent ... />
  </CollapsibleSection>
  <CollapsibleSection title="Impact on our product" defaultOpen icon={...} badge={gapCount}>
    <TopicImpactCard entityName={entity.name} />
  </CollapsibleSection>
  <CollapsibleSection title="My notes" defaultOpen icon={...}>
    <TopicNotes entityName={entity.name} />
  </CollapsibleSection>
  <CollapsibleSection title="Key milestones" icon={...} badge={milestoneCount}>
    <TopicMilestones entityName={entity.name} />
  </CollapsibleSection>
  <CollapsibleSection title="Latest updates" defaultOpen icon={...} badge={captureCount}>
    <UpdatesList captures={entityCaptures} entityType={entity.topic_type} limit={5} />
  </CollapsibleSection>
)}
```

---

## 6. AUTO-MILESTONES VIA PERPLEXITY

When the ambient search cron researches non-competitor topics, include
milestone extraction in the Perplexity prompt.

### In server/ambientSearch.ts:

Find where non-competitor entities are researched. After the existing
research logic, add a milestone extraction step:

```typescript
// Only for non-competitor topics
if (entity.topic_type !== 'competitor') {
  try {
    const milestonePrompt = `For "${entity.name}" (${entity.disambiguation_context || ''}), 
    identify the 3-5 most significant milestones, key dates, or timeline events. 
    Include both past events and known upcoming deadlines.
    Respond ONLY with valid JSON, no markdown fences:
    [{"date": "YYYY-MM-DD", "event": "What happened/will happen", "note": "Why it matters"}]`;
    
    const milestoneResult = await callPerplexity(milestonePrompt);
    const milestones = JSON.parse(stripCodeFences(milestoneResult));
    
    for (const m of milestones) {
      // Check for existing milestone with similar date (±7 days)
      const existing = await db.execute(sql`
        SELECT id FROM topic_milestones 
        WHERE workspace_id = ${workspaceId} 
        AND entity_name = ${entity.name}
        AND ABS(EXTRACT(EPOCH FROM (milestone_date - ${m.date}::date))) < 604800
        LIMIT 1
      `);
      
      // Skip if similar milestone exists (manual or perplexity)
      if (existing.rows.length > 0) continue;
      
      await db.execute(sql`
        INSERT INTO topic_milestones (workspace_id, entity_name, milestone_date, event, note, source)
        VALUES (${workspaceId}, ${entity.name}, ${m.date}::date, ${m.event}, ${m.note}, 'perplexity')
      `);
    }
    console.log(`[ambient] Added ${milestones.length} milestones for ${entity.name}`);
  } catch (err) {
    console.error(`[ambient] Milestone extraction failed for ${entity.name}:`, err);
  }
}
```

### Staleness check:
Only run milestone extraction if the most recent perplexity-sourced
milestone for this entity is older than 30 days (milestones don't change
as often as news).

### Manual override protection:
Milestones with source='manual' are NEVER modified or deleted by
the cron. Only perplexity-sourced milestones can be updated.

---

## NEW FILES TO CREATE:
- client/src/components/UpdatesList.tsx
- client/src/components/CollapsibleSection.tsx
- client/src/components/TopicImpactCard.tsx
- client/src/components/TopicNotes.tsx
- client/src/components/TopicMilestones.tsx

## FILES TO MODIFY:
- client/src/pages/topic-view.tsx (conditional rendering, mobile tab fix, text overflow fix)
- server/routes.ts (new API routes for notes + milestones)
- server/dbSafety.ts (2 new tables: topic_notes, topic_milestones)
- server/ambientSearch.ts (auto-milestone extraction, relevance check)
- Pricing detection logic (wherever it lives)

## FILES NOT TO MODIFY:
- server/storage.ts
- shared/schema.ts
- drizzle.config.ts
- client/src/lib/queryClient.ts

---

## VERIFICATION CHECKLIST:

After implementing, test ALL of these:

### Mobile (resize browser to 390px width):
- [ ] Tabs scroll horizontally with fade gradient on right
- [ ] No text overflow on update cards
- [ ] Filter pills wrap properly

### Pricing:
- [ ] Navigate to a competitor page — no false pricing on revenue/funding items
- [ ] Navigate to a non-competitor topic — NO pricing section at all

### Updates UI (on any competitor page):
- [ ] Compact cards with signal dots, titles, dates
- [ ] Click card to expand — summary and action buttons appear
- [ ] Time filter pills work (All time, This week, etc.)
- [ ] Category dropdown filters updates
- [ ] Dimension purple pills appear on relevant updates

### Non-competitor topic page (e.g., Identity Verification):
- [ ] Only "Overview" and "Updates" tabs shown (no Profile/Commercial/etc.)
- [ ] AI Summary section — collapsible, shows content
- [ ] Impact on our product — shows dimension items affected
- [ ] My Notes — rich text editor with toolbar (bold, bullets, etc.)
- [ ] My Notes — type something, refresh page, it persists
- [ ] Key Milestones — timeline with dots, dates, events
- [ ] Key Milestones — can add a new milestone manually
- [ ] Latest Updates — shows 5 recent with "View all" link
- [ ] All sections collapse/expand by clicking header
- [ ] Partnerships & alliances section is GONE
- [ ] Key Dates (Coming Soon) is GONE
- [ ] Compliance Notes (Coming Soon) is GONE

### Competitor page (e.g., iProov):
- [ ] Still shows all original tabs (Overview, Profile, etc.)
- [ ] Still shows all competitor-specific sections
- [ ] Updates now use new compact card design
- [ ] No irrelevant updates (cleanup already done)
