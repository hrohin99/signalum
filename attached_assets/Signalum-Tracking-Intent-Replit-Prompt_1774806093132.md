# Signalum — Tracking Intent Feature
## Full Replit Prompt

---

## CONTEXT

We are adding a "Tracking Intent" feature to Signalum. When a user adds a non-competitor topic (regulation, trend, threat, or other), they are now asked what they want to track most. This intent is stored and used to:
- Generate focused AI suggestions at topic creation (Perplexity → Claude pipeline)
- Gate AI summary generation until intent is set
- Replace the Perplexity ambient search cron with per-focus queries
- Tag captures with which focus area produced them
- Drive Claude's section parsing when generating the AI summary

This is a meaningful architectural change to how non-competitor topics work. Follow every instruction carefully.

---

## RULES (do not violate)

- NEVER run `drizzle-kit push`
- NEVER modify `server/storage.ts`, `shared/schema.ts`, `drizzle.config.ts`, or `client/src/lib/queryClient.ts`
- ALWAYS use `db.execute(sql\`...\`)` not `pool.query`
- ALWAYS add `staleTime`, `gcTime`, `refetchOnMount` to all `useQuery` calls
- NEVER define form components inside parent components
- Verify data via browser/API not Replit shell
- All DB tables created via `dbSafety.ts` only

---

## STEP 1: DB SCHEMA

Add to `server/dbSafety.ts`, inside the existing safety init function:

```sql
CREATE TABLE IF NOT EXISTS entity_tracking_intent (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  entity_name     TEXT NOT NULL,
  selected_focuses TEXT[] DEFAULT '{}',
  custom_focus    TEXT DEFAULT '',
  updated_at      TIMESTAMP DEFAULT now(),
  UNIQUE(workspace_id, entity_name)
);

-- Add focus_area column to existing captures/updates table
-- Only add if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspace_captures'
    AND column_name = 'focus_area'
  ) THEN
    ALTER TABLE workspace_captures ADD COLUMN focus_area TEXT;
  END IF;
END $$;
```

Note: the captures table name may be `workspace_captures` or similar — check the existing schema and use the correct table name.

---

## STEP 2: NEW API ROUTES

Add to `server/routes.ts`:

### GET /api/tracking-intent/:entityName
Returns the stored intent for a topic.

```typescript
app.get('/api/tracking-intent/:entityName', requireAuth, async (req, res) => {
  const { entityName } = req.params;
  const workspaceId = req.user.workspaceId;
  try {
    const result = await db.execute(sql`
      SELECT selected_focuses, custom_focus, updated_at
      FROM entity_tracking_intent
      WHERE workspace_id = ${workspaceId}
      AND entity_name = ${entityName}
    `);
    if (result.rows.length === 0) {
      return res.json({ hasIntent: false, selectedFocuses: [], customFocus: '' });
    }
    const row = result.rows[0];
    return res.json({
      hasIntent: true,
      selectedFocuses: row.selected_focuses || [],
      customFocus: row.custom_focus || '',
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Error fetching tracking intent:', err);
    res.status(500).json({ error: 'Failed to fetch tracking intent' });
  }
});
```

### PUT /api/tracking-intent/:entityName
Upserts the intent for a topic.

```typescript
app.put('/api/tracking-intent/:entityName', requireAuth, async (req, res) => {
  const { entityName } = req.params;
  const workspaceId = req.user.workspaceId;
  const { selectedFocuses, customFocus } = req.body;
  try {
    await db.execute(sql`
      INSERT INTO entity_tracking_intent
        (workspace_id, entity_name, selected_focuses, custom_focus, updated_at)
      VALUES
        (${workspaceId}, ${entityName}, ${selectedFocuses}, ${customFocus || ''}, now())
      ON CONFLICT (workspace_id, entity_name)
      DO UPDATE SET
        selected_focuses = ${selectedFocuses},
        custom_focus = ${customFocus || ''},
        updated_at = now()
    `);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving tracking intent:', err);
    res.status(500).json({ error: 'Failed to save tracking intent' });
  }
});
```

### POST /api/tracking-intent/suggestions
Calls Perplexity then Claude to generate focus suggestions for a new topic.

```typescript
app.post('/api/tracking-intent/suggestions', requireAuth, async (req, res) => {
  const { topicName, topicType, dimensions } = req.body;
  // dimensions: array of { name, items[] } from the workspace — pass from client
  const workspaceId = req.user.workspaceId;

  try {
    // Step 1: Perplexity — get grounding context on this topic
    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: `Give me a concise overview of "${topicName}" as it relates to identity verification, biometric systems, and digital trust. Focus on: what is actively happening right now, key technical or regulatory developments, and who is affected. 3-5 sentences only.`
        }]
      })
    });
    const perplexityData = await perplexityRes.json();
    const groundingContext = perplexityData.choices?.[0]?.message?.content || '';

    // Step 2: Claude — generate focus suggestions using grounding + workspace context
    const dimensionSummary = dimensions
      .map((d: any) => `${d.name}: ${d.items?.map((i: any) => i.name).join(', ')}`)
      .join('\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are helping a product manager decide what to track for a new intelligence topic.

Topic name: "${topicName}"
Topic type: ${topicType}

Current context on this topic:
${groundingContext}

The PM's product has these competitive dimensions and capabilities:
${dimensionSummary}

Generate exactly 5 specific, actionable tracking focus suggestions for this topic. Each should be:
- Specific to this topic (not generic like "latest news")
- Relevant to an identity verification product team
- Phrased as what to watch for, not what to read

Return ONLY a JSON array of 5 strings. No preamble, no markdown, no explanation.
Example format: ["Enforcement timeline and compliance deadlines", "Evasion technique evolution in real deployments"]`
        }]
      })
    });
    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(cleaned);

    res.json({ suggestions, groundingContext });
  } catch (err) {
    console.error('Error generating suggestions:', err);
    res.status(500).json({ error: 'Failed to generate suggestions', suggestions: [] });
  }
});
```

---

## STEP 3: TOPIC CREATION MODAL — 2-STEP FLOW

Locate the existing "Add Topic" modal component (likely `AddTopicModal.tsx` or similar). Convert it to a 2-step flow for non-competitor topics. Competitor entity creation is unchanged.

### Step 1 (existing): Topic name + type selector
No changes to logic. Change the primary button from "Add Topic" to "Next →".

On click of "Next →":
- Validate name is not empty
- Set `step = 2`
- Simultaneously fire `POST /api/tracking-intent/suggestions` with `{ topicName, topicType, dimensions }`
- Store the promise in state — suggestions load in background while step 2 renders

### Step 2: Tracking focus

New component: `client/src/components/TrackingFocusStep.tsx`

```typescript
interface TrackingFocusStepProps {
  topicName: string;
  topicType: string;
  suggestionsPromise: Promise<{ suggestions: string[] }>;
  onSave: (selectedFocuses: string[], customFocus: string) => void;
  onSkip: () => void;
}
```

UI layout:

```
┌──────────────────────────────────────────────────────────┐
│  What matters most for this topic?                       │
│  ─────────────────────────────────────────────────────   │
│  We'll use this to focus your AI summaries, milestone    │
│  tracking, and search queries.                           │
│                                                          │
│  [Loading skeleton — 4 rows — while suggestions load]    │
│                                                          │
│  Once loaded:                                            │
│  ☐  Enforcement deadlines and compliance windows         │
│  ☐  Evasion technique evolution in real deployments      │
│  ☐  Vendor detection claims vs independent testing       │
│  ☐  Regulatory standard updates (ISO 30107-3, iBeta)     │
│  ☐  How competitors are responding publicly              │
│                                                          │
│  + Add your own focus                                    │
│  [_____________________________________________]         │
│                                                          │
│  [Skip for now]              [Set focus & create topic]  │
└──────────────────────────────────────────────────────────┘
```

Behavior:
- User can select any combination of the 5 suggestions (no minimum, no maximum)
- "Add your own focus" text input is always visible but optional
- "Set focus & create topic" is enabled even if nothing is selected (so it doubles as an alternative to skip that still creates the topic)
- "Skip for now" creates the topic with no intent saved
- On submit with at least one selection: save intent via PUT, then create topic
- On skip: create topic only, no intent saved

Styling:
- Checkboxes use the existing purple accent (#723988)
- Selected items get light purple background (#EEEDFE)
- Loading skeleton: 4 gray rounded bars, animated pulse
- "Add your own" input: subtle border, placeholder "e.g. How enterprise vendors are adapting..."

---

## STEP 4: TOPIC PAGE — EMPTY STATE WHEN NO INTENT SET

In `client/src/pages/topic-view.tsx`, for non-competitor topics:

After fetching the entity, also fetch `GET /api/tracking-intent/:entityName`.

If `hasIntent === false`:

Replace the AI Summary section entirely with this card. Do not show the AI summary card at all.

```tsx
// TrackingFocusEmptyState component
<div style={{
  background: '#EEEDFE',
  border: '1.5px solid #723988',
  borderRadius: '12px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '12px'
}}>
  <span style={{ fontSize: '24px' }}>🎯</span>
  <p style={{ fontWeight: 600, fontSize: '15px', color: '#2D1B4E', margin: 0 }}>
    Set your tracking focus
  </p>
  <p style={{ fontSize: '13px', color: '#534AB7', margin: 0, maxWidth: '340px' }}>
    Tell Signalum what matters most for this topic. We'll focus your AI summaries,
    milestone extraction, and search queries accordingly.
  </p>
  <button
    onClick={() => setShowIntentModal(true)}
    style={{
      background: '#723988',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      marginTop: '4px'
    }}
  >
    Set tracking focus →
  </button>
</div>
```

Clicking "Set tracking focus" opens the same `TrackingFocusStep` modal, but in edit mode (no step 1, just step 2 pre-populated with existing selections if any).

If `hasIntent === true`, show the AI summary as normal, with a subtle edit affordance:

```tsx
// In the AI Summary section header, right side:
<button
  onClick={() => setShowIntentModal(true)}
  style={{ fontSize: '12px', color: '#723988', background: 'none', border: 'none', cursor: 'pointer' }}
>
  📌 {selectedFocuses.length} focus area{selectedFocuses.length !== 1 ? 's' : ''} · Edit
</button>
```

When intent is edited on an existing topic, after saving show a confirmation:

```
"Tracking focus updated. Regenerate AI summary now?"
[Yes, regenerate]   [Save focus only]
```

---

## STEP 5: AI SUMMARY — ONLY GENERATES AFTER INTENT IS SET

Locate wherever the AI summary generation is triggered (likely a route like `POST /api/ai-summary/:entityName` or similar).

Add a guard at the top of the route:

```typescript
// Check if intent is set for non-competitor topics
const intentResult = await db.execute(sql`
  SELECT selected_focuses, custom_focus
  FROM entity_tracking_intent
  WHERE workspace_id = ${workspaceId}
  AND entity_name = ${entityName}
`);

const isNonCompetitor = /* check entity type */;

if (isNonCompetitor && intentResult.rows.length === 0) {
  return res.status(400).json({
    error: 'tracking_intent_required',
    message: 'Set a tracking focus before generating AI summary'
  });
}

// If intent exists, extract it for use in the prompt
const intent = intentResult.rows[0];
const focuses = intent?.selected_focuses || [];
const customFocus = intent?.custom_focus || '';
const allFocuses = customFocus
  ? [...focuses, customFocus]
  : focuses;
```

Then inject focuses into the Claude prompt:

```typescript
const focusInstruction = allFocuses.length > 0
  ? `\n\nThe user specifically wants to track:\n${allFocuses.map(f => `- ${f}`).join('\n')}\n\nStructure your analysis around these focus areas. Only include sections where you have relevant information — do not pad with generic content.`
  : '';

// Add focusInstruction to the existing system prompt
```

---

## STEP 6: PERPLEXITY AMBIENT SEARCH CRON — INTENT-AWARE QUERIES

Locate the ambient search cron in `server/ambientSearch.ts`.

Find the section that iterates over non-competitor topic entities and constructs Perplexity queries.

**Current behavior:** one query per topic using the entity name.

**New behavior:** when a topic has intent set, replace the single query with one query per focus area (max 5 queries). When no intent is set, keep the existing single query as fallback.

```typescript
// For each non-competitor entity in the cron:

// 1. Fetch intent
const intentResult = await db.execute(sql`
  SELECT selected_focuses, custom_focus
  FROM entity_tracking_intent
  WHERE workspace_id = ${workspaceId}
  AND entity_name = ${entityName}
`);

const hasIntent = intentResult.rows.length > 0 &&
  (intentResult.rows[0].selected_focuses?.length > 0 || intentResult.rows[0].custom_focus);

if (hasIntent) {
  const row = intentResult.rows[0];
  const focuses: string[] = row.selected_focuses || [];
  if (row.custom_focus) focuses.push(row.custom_focus);

  // Run one Perplexity query per focus area
  for (const focus of focuses) {
    const query = `${entityName} ${focus} 2025`;

    // Run existing Perplexity fetch logic with this query
    // Tag each resulting capture with focus_area = focus
    const captures = await fetchPerplexityCaptures(query);
    for (const capture of captures) {
      await saveCapture({ ...capture, focusArea: focus, entityName, workspaceId });
    }
  }
} else {
  // Fallback: existing single query behavior, focus_area = null
  const captures = await fetchPerplexityCaptures(entityName);
  for (const capture of captures) {
    await saveCapture({ ...capture, focusArea: null, entityName, workspaceId });
  }
}
```

When saving captures, include `focus_area` in the INSERT:

```sql
INSERT INTO workspace_captures
  (workspace_id, entity_name, content, source_url, captured_at, focus_area, ...)
VALUES
  (${workspaceId}, ${entityName}, ${content}, ${sourceUrl}, now(), ${focusArea}, ...)
ON CONFLICT DO NOTHING
```

---

## STEP 7: UPDATES TAB — FOCUS AREA FILTER

In the Updates tab for non-competitor topics, if captures have focus_area tags, add a focus area filter row above the existing time/category filters:

```tsx
// If any captures for this entity have focus_area set:
const focusAreas = [...new Set(captures.filter(c => c.focusArea).map(c => c.focusArea))];

{focusAreas.length > 0 && (
  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
    <span style={{ fontSize: '12px', color: '#666', alignSelf: 'center' }}>Focus:</span>
    <button
      onClick={() => setFocusFilter(null)}
      style={focusFilter === null ? activePillStyle : inactivePillStyle}
    >
      All
    </button>
    {focusAreas.map(area => (
      <button
        key={area}
        onClick={() => setFocusFilter(area)}
        style={focusFilter === area ? activePillStyle : inactivePillStyle}
      >
        {area}
      </button>
    ))}
  </div>
)}
```

Active pill style: `{ background: '#EEEDFE', color: '#534AB7', border: '1px solid #723988', borderRadius: '999px', padding: '3px 10px', fontSize: '12px', fontWeight: 500 }`

Inactive pill style: `{ background: 'transparent', color: '#666', border: '1px solid #ddd', borderRadius: '999px', padding: '3px 10px', fontSize: '12px' }`

---

## NEW FILES TO CREATE

- `client/src/components/TrackingFocusStep.tsx` — the step 2 modal UI
- `client/src/components/TrackingFocusEmptyState.tsx` — the empty state card for topic page

## FILES TO MODIFY

- `server/dbSafety.ts` — add `entity_tracking_intent` table + `focus_area` column migration
- `server/routes.ts` — add GET/PUT `/api/tracking-intent/:entityName` and POST `/api/tracking-intent/suggestions`
- `server/ambientSearch.ts` — intent-aware Perplexity queries with `focus_area` tagging
- Wherever AI summary is generated — add intent guard + focus injection
- Wherever the Add Topic modal is — convert to 2-step for non-competitor types
- `client/src/pages/topic-view.tsx` — fetch intent, show empty state or edit affordance, focus area filter in Updates tab

## FILES NOT TO MODIFY

- `server/storage.ts`
- `shared/schema.ts`
- `drizzle.config.ts`
- `client/src/lib/queryClient.ts`

---

## VERIFICATION CHECKLIST

### Topic creation:
- [ ] Add a new non-competitor topic — modal shows step 1 (name + type)
- [ ] Click "Next →" — step 2 appears immediately, loading skeleton shows while suggestions load
- [ ] Suggestions load within ~3 seconds and are specific to the topic (not generic)
- [ ] Can select multiple focuses (up to 5 via the 5 suggestions, plus custom)
- [ ] "Add your own focus" input appends to selection
- [ ] "Skip for now" creates topic without saving intent
- [ ] "Set focus & create topic" creates topic AND saves intent to DB
- [ ] Verify DB: `SELECT * FROM entity_tracking_intent` shows the saved row

### Topic page — no intent:
- [ ] Navigate to a topic where intent was skipped
- [ ] AI Summary section is replaced by purple "Set tracking focus" card
- [ ] Click "Set tracking focus →" opens step 2 modal (no step 1)
- [ ] Save from this modal — card disappears, AI summary generates
- [ ] Verify AI summary reflects the focus areas in its structure

### Topic page — intent set:
- [ ] "📌 N focus areas · Edit" shows in AI Summary header
- [ ] Clicking it opens edit modal pre-populated with existing selections
- [ ] Changing focus and saving shows "Regenerate AI summary now?" prompt
- [ ] "Yes, regenerate" triggers new AI summary with updated focus
- [ ] "Save focus only" saves without regenerating

### Cron / captures:
- [ ] After cron runs, captures for intent-set topics have `focus_area` populated
- [ ] Captures for topics without intent have `focus_area = null`
- [ ] Updates tab shows Focus filter row when focus_area captures exist
- [ ] Filtering by focus area works correctly

### Competitor entities:
- [ ] No changes to competitor topic creation — single-step modal unchanged
- [ ] No tracking focus card on competitor pages
