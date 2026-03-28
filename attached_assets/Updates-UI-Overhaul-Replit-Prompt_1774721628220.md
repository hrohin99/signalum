# Updates UI Overhaul + Mobile Fixes — Replit Prompt

## Paste CLAUDE.md first, then paste this prompt.

---

## TASK: Fix 4 UX issues on competitor/topic detail pages

Read CLAUDE.md first. This modifies the topic-view.tsx page and
related components.

### CRITICAL SAFETY RULES:
- Do NOT run drizzle-kit push
- Do NOT modify server/storage.ts or shared/schema.ts
- All new useQuery calls MUST include staleTime: 0, gcTime: 0,
  refetchOnMount: "always"
- Use apiRequest() for any new authenticated fetches
- Build new components as SEPARATE files, not inline in topic-view.tsx

---

## FIX 1: Mobile tabs cut off

The tab bar (Overview, Profile, Commercial, Competitive, Strategy)
gets cut off on mobile — users can't see tabs beyond "Competitive"
without swiping, but there's no visual indicator that more tabs exist.

### Fix:
In the tab bar component (inside topic-view.tsx or wherever the
horizontal tab list is rendered):

1. Add `overflow-x: auto` and `-webkit-overflow-scrolling: touch`
   to the tabs container
2. Hide the scrollbar: add these CSS properties:
   ```
   scrollbar-width: none;
   -ms-overflow-style: none;
   &::-webkit-scrollbar { display: none; }
   ```
3. Add a fade gradient on the right edge to signal more content:
   - Wrap the tabs in a relative-positioned container
   - Add a pseudo-element or an absolutely-positioned div on the
     right side:
     ```
     position: absolute;
     right: 0; top: 0; bottom: 0;
     width: 32px;
     background: linear-gradient(to right, transparent, white);
     pointer-events: none;
     ```
   - Hide the fade when scrolled to the end (optional, nice-to-have)
4. Make sure each tab has `white-space: nowrap` and `flex-shrink: 0`

---

## FIX 2: Updates text overflow on mobile

The update cards' text (especially long URLs in the source field)
overflows the card boundary on the right side.

### Fix:
Find the update/capture card component. Add these CSS properties
to the card container and all text elements inside:

```css
/* On the card container */
overflow: hidden;
word-break: break-word;
overflow-wrap: break-word;

/* On the source URL text specifically */
max-width: 100%;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
```

Also ensure the card container has `min-width: 0` if it's inside
a flex layout (flex children can overflow without this).

---

## FIX 3: Pricing detection — two bugs

### Bug A: Pricing shows inaccurate values
The AI is detecting revenue figures, funding amounts, and
valuations as "pricing" — e.g., "Persona doubled its revenue to
$141 million" shows as "Pricing detected: $141 Per Service".
These are NOT actual product/service prices.

Fix: In the pricing detection logic (wherever the AI or regex
extracts pricing from captures/updates):
- The prompt or regex that identifies pricing must be updated to
  ONLY match actual product/service pricing, not revenue, funding,
  valuations, or market size figures
- Add negative keyword filtering: skip any match that contains
  words like "revenue", "valuation", "funding", "raised",
  "market size", "market cap", "annual", "quarterly", "billion",
  "million" (when referring to company financials, not per-unit price)
- Pricing should only be extracted when the text describes what
  a customer pays: "per transaction", "per verification",
  "per user", "per month", "license fee", etc.

### Bug B: Pricing appears on non-competitor topics
Pricing detection should ONLY run for entities where
`topic_type === 'competitor'`. It makes no sense to detect pricing
for regulations, industry topics, or general news.

Fix: Find where pricing detection is triggered and add a guard:
```typescript
if (entity.topic_type !== 'competitor') {
  // Skip pricing detection entirely
}
```

Remove any existing "Pricing detected" UI elements for
non-competitor entities.

---

## FIX 4: Updates UI redesign

Replace the current update/capture card list with a new design.
Build this as a NEW component: `UpdatesList.tsx`

### Filter bar:
- Top of the updates section
- Left side: Time filter pills in a row:
  "All time" (default, selected), "This week", "This month",
  "Last 90 days"
  - Selected pill: background #534AB7, white text
  - Unselected: white background, gray border, gray text
- Vertical divider (0.5px gray line, 20px tall)
- Right side: Category dropdown button:
  "Category: All" — clicking opens a dropdown menu with options:
  All categories, Product launch, Contract win, Partnership,
  Certification, R&D signal, Case study, Conference, Pricing,
  Other
  - When a category is selected, button text updates to
    "Category: [selected]" and gets purple highlight
- ALL filtering is client-side (no API re-fetch needed)
- Time filtering: compare capture.created_at against the
  selected time range

### Update cards (compact, expandable):
Each update is a single row that expands on click.

COLLAPSED STATE (default):
- Left: Signal dot (8px circle)
  - Red (#E24B4A) for "High Signal" captures
  - Amber (#EF9F27) for "Notable" captures
  - Blue (#85B7EB) for normal captures
  - Determine signal level from the existing capture.signal_level
    or capture.priority field (check what the current data uses)
- Middle (flex: 1):
  - Row 1: Title (14px, font-weight 500, single line, ellipsis
    overflow) + Date (11px, gray, right-aligned) + Chevron arrow
    (16px, gray, points right)
  - Row 2: Source domain (11px, blue/info color, truncated) +
    Dimension tag (purple pill, 10px, only if the update relates
    to a competitive dimension) + Category tag (gray pill, 10px)
- Background: WHITE (var(--color-background-primary))
- Border between cards: 0.5px solid var(--color-border-tertiary)
- Hover: var(--color-background-secondary)
- Cursor: pointer on the whole row

EXPANDED STATE (on click):
- Chevron rotates 90 degrees (points down)
- Below row 2, show an expanded panel:
  - Background: var(--color-background-secondary)
  - Border-radius: var(--border-radius-md)
  - Padding: 12px
  - Margin: 8px 0 4px
  - Contents:
    - Summary text (13px, gray, line-height 1.5) — this is the
      full capture body/description
    - Action buttons row (flex, gap 6px, top border):
      - "Save to battlecard" — small outlined button
      - "Add to briefing" — small outlined button
      - "Open source" — small outlined button, opens the source URL
- Click anywhere on the row again to collapse

### Dimension tags:
When an update/capture relates to one of the user's competitive
dimensions, show a purple pill tag. To determine this:
- Fetch the user's dimensions (GET /api/dimensions)
- For each capture, check if any dimension item name appears in
  the capture title or body (case-insensitive substring match)
- If matched, show the dimension name as a purple pill
- This is a FRONTEND-ONLY check — no API needed, just match
  capture text against dimension item names loaded in the page

### Category tags:
Classify each update into a category. This can be done by:
- Checking the capture's existing tags/labels if they exist
- Or using simple keyword matching on the title:
  - Contains "launch", "release", "announces" → "Product launch"
  - Contains "contract", "selected", "awarded", "wins" → "Contract win"
  - Contains "partner", "integration", "alliance" → "Partnership"
  - Contains "certified", "certification", "compliance" → "Certification"
  - Contains "patent", "R&D", "research" → "R&D signal"
  - Contains "case study", "deployed", "zero fraud" → "Case study"
  - Contains "keynote", "conference", "summit" → "Conference"
  - Default → "Update"
- Store the category in a computed field, not in the database

### Responsive behavior:
- On desktop (>768px): cards are full width as described
- On mobile (<768px):
  - Filter pills wrap to second line if needed
  - Title can be 2 lines instead of 1 (remove white-space: nowrap)
  - Source URL gets max-width: 120px with ellipsis
  - Expanded panel takes full width

### Integration into topic-view.tsx:
- Import UpdatesList component
- Replace the current updates/captures rendering section with
  <UpdatesList captures={captures} entityType={entity.topic_type} />
- Pass the captures data and entity type to the component
- The component handles all filtering and rendering internally

---

## FILES TO CREATE:
- client/src/components/UpdatesList.tsx (new)

## FILES TO MODIFY:
- client/src/pages/topic-view.tsx (replace updates section,
  add mobile tab fix)
- CSS/Tailwind for the tab overflow fix
- Pricing detection logic (wherever it lives — search for
  "pricing detected" or "Pricing" in the codebase)

## FILES NOT TO MODIFY:
- server/routes.ts (no API changes needed for this)
- server/storage.ts
- shared/schema.ts
- server/dbSafety.ts

## VERIFICATION:
After implementing:
1. Navigate to iProov page — new updates UI with compact cards
2. Click a card — expands with summary and action buttons
3. Click time filters — list filters
4. Click Category dropdown — filters by category
5. Check on mobile width (resize browser to 390px) — tabs scroll
   with fade indicator, no text overflow
6. Check a non-competitor topic page — NO pricing detection shown
7. Check competitor page — pricing only shows for actual prices,
   not revenue/funding numbers
8. Dimension purple pills appear on relevant updates
