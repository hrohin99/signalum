# Impact Card Redesign — AI-Generated, Focus-Driven

## Paste CLAUDE.md first, then paste this prompt.

---

## TASK: Replace the keyword-matching TopicImpactCard with an 
## AI-generated impact analysis driven by the user's tracking focus

### CRITICAL SAFETY RULES:
- Do NOT run drizzle-kit push
- Use db.execute(sql`...`) for all DB writes  
- Use apiRequest() for authenticated frontend fetches
- staleTime: 0, gcTime: 0, refetchOnMount: "always" on new queries

---

## WHAT CHANGES:

The current TopicImpactCard.tsx uses client-side keyword matching 
to find dimension items that relate to a topic. This produces noisy, 
unhelpful results like "We have this / Mentioned in signals."

Replace it with an AI-generated impact analysis that:
1. Uses the user's TRACKING FOCUS areas (from focus_area field) 
   as the primary driver
2. Cross-references the user's competitive dimensions + statuses
3. Produces structured output: relevance level, insights, and actions
4. Is generated once and stored, not computed on every page load

---

## BACKEND: New API route for generating impact analysis

### New DB table (add to server/dbSafety.ts):

```sql
CREATE TABLE IF NOT EXISTS topic_impact_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  relevance TEXT NOT NULL DEFAULT 'medium',
  relevance_reason TEXT,
  insights JSONB DEFAULT '[]'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMP DEFAULT now(),
  UNIQUE(workspace_id, entity_name)
);
```

The `insights` JSONB stores:
```json
[
  {
    "title": "Our PAD testing may need updating",
    "description": "ISO 30107-5 extends 30107-3 with...",
    "type": "warning",  // "strength" | "warning" | "risk"
    "dimension": "Certifications & compliance"  // optional
  }
]
```

The `actions` JSONB stores:
```json
[
  {
    "title": "Schedule 30107-5 lab testing",
    "description": "Timeline: 3-6 months. Budget: $30-50K."
  }
]
```

### New API routes in server/routes.ts:

**GET /api/topic-impact/:entityName**
- requireAuth
- Returns the stored impact analysis for this entity
- If none exists, returns { exists: false }

**POST /api/topic-impact/:entityName/generate**
- requireSubAdmin
- Fetches:
  1. The entity's tracking focus areas (focus_area from the entity 
     in workspaces.categories JSONB, or from wherever TrackingFocusStep 
     saves them)
  2. The user's competitive dimensions (from competitive_dimensions table)
  3. Recent captures for this entity (last 20, for context)
  4. The user's product context (product name, description, strengths, 
     weaknesses from workspace fields)
- Calls Claude (claude-sonnet-4-6) with this prompt:

```
You are a strategic product analyst. Analyze the impact of "${entityName}" 
on the user's product.

USER'S PRODUCT: ${productDescription}
USER'S STRENGTHS: ${strengths}  
USER'S WEAKNESSES: ${weaknesses}

USER'S TRACKING FOCUS for this topic:
${focusAreas.join('\n- ')}

USER'S COMPETITIVE DIMENSIONS:
${dimensions.map(d => `${d.name} (${d.priority}): ${d.items.map(i => 
  `${i.name} [${i.our_status}]`).join(', ')}`).join('\n')}

RECENT SIGNALS about ${entityName}:
${recentCaptures.map(c => c.content?.substring(0, 150)).join('\n')}

Generate a structured impact analysis. Respond ONLY with valid JSON:
{
  "relevance": "high" | "medium" | "low",
  "relevance_reason": "One sentence explaining why this is high/medium/low relevance to the user's product.",
  "insights": [
    {
      "title": "Short headline (max 10 words)",
      "description": "2-3 sentences explaining the insight. Reference specific dimension items and their status where relevant.",
      "type": "risk" | "warning" | "strength",
      "dimension": "Dimension name if directly related, or null"
    }
  ],
  "actions": [
    {
      "title": "Specific actionable recommendation",
      "description": "1-2 sentences with timeline, budget, or next step details."
    }
  ]
}

Rules:
- Focus your analysis on the user's TRACKING FOCUS areas listed above
- Reference specific competitive dimension items and their status (gap/partial/strong)
- 2-4 insights maximum
- 1-3 actions maximum  
- "risk" type = we have a gap here that this topic exposes
- "warning" type = something to monitor, could become a risk
- "strength" type = we're well positioned here, this is an advantage
- Be specific to this user's product, not generic advice
```

- Parse the response (strip code fences, JSON.parse)
- Upsert into topic_impact_analysis table
- Return the parsed result

---

## FRONTEND: Redesign TopicImpactCard.tsx

Replace the current keyword-matching content with the AI-generated 
analysis. The card should match this design:

### Card structure:

```
┌─────────────────────────────────────────────┐
│ ⚡ Impact on our product        AI-generated │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ High        This standard directly...     │ │
│ │ relevance                                 │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ WHAT THIS MEANS FOR US                       │
│                                              │
│ ⚠ Our PAD testing may need updating          │
│   ISO 30107-5 extends 30107-3...             │
│   [Certifications & compliance]              │
│                                              │
│ ✓ Our liveness stack is well-positioned      │
│   The standard tests liveness detection...   │
│   [Biometric capabilities]                   │
│                                              │
│ RECOMMENDED ACTIONS                          │
│                                              │
│ ① Schedule 30107-5 lab testing               │
│   Timeline: 3-6 months. Budget: $30-50K      │
│                                              │
│ ② Update marketing materials to differ...    │
│   Competitors claiming "ISO 30107..."        │
└─────────────────────────────────────────────┘
```

### Relevance banner:
- High relevance: red left border, light red/danger background
- Medium relevance: amber left border, light warning background  
- Low relevance: green left border, light success background
- Left side: relevance level text (bold)
- Right side: relevance reason text

### Insights section:
Header: "WHAT THIS MEANS FOR US" (11px, uppercase, gray, spaced)

Each insight is a row with:
- Left: 24px circle icon
  - type "risk" → red background, exclamation icon
  - type "warning" → amber background, warning icon
  - type "strength" → green background, checkmark icon
- Right: 
  - Title (13px, weight 500)
  - Description (12px, gray, line-height 1.5)
  - Dimension pill (if present): purple background (#EEEDFE), 
    purple text (#534AB7), 11px, rounded pill
- Bottom border between items (0.5px, tertiary)

### Actions section:
Header: "RECOMMENDED ACTIONS" (11px, uppercase, gray, spaced)

Each action is a row with:
- Left: 24px numbered circle (purple bg #EEEDFE, purple text #534AB7)
- Right:
  - Title (13px, weight 500)
  - Description (12px, gray)

### Empty state:
If no impact analysis exists yet AND the user has set tracking 
focus areas, show a "Generate impact analysis" button that calls 
POST /api/topic-impact/:entityName/generate

If the user has NOT set tracking focus yet, show:
"Set your tracking focus first to generate a personalized impact 
analysis." with a link/button to the tracking focus step.

### Auto-generation:
When the user completes the TrackingFocusStep (sets their focus 
areas), automatically trigger the impact analysis generation.
Find where the tracking focus save handler is and add:
```typescript
// After saving focus areas successfully:
await apiRequest("POST", `/api/topic-impact/${entityName}/generate`);
queryClient.invalidateQueries({ queryKey: ['topic-impact', entityName] });
```

### Refresh button:
Add a small "Refresh" icon button next to the "AI-generated" badge 
in the card header. Clicking it regenerates the impact analysis.

---

## INTEGRATION:

The TopicImpactCard should:
1. Fetch from GET /api/topic-impact/:entityName on mount
2. If data exists, render the structured card
3. If no data + has focus areas → show "Generate" button
4. If no data + no focus areas → show "Set focus first" message
5. After generation, invalidate and refetch

The card should be inside a CollapsibleSection with defaultOpen={true}.

---

## FILES TO CREATE/MODIFY:
- server/dbSafety.ts (add topic_impact_analysis table)
- server/routes.ts (add 2 new API routes)
- client/src/components/TopicImpactCard.tsx (complete rewrite)

## FILES NOT TO MODIFY:
- server/storage.ts, shared/schema.ts, drizzle.config.ts
- TrackingFocusStep.tsx (only add the auto-generate call after save)
- CollapsibleSection.tsx (use as-is)

## VERIFICATION:
1. Navigate to a non-competitor topic (e.g., Liveness Detection)
2. If tracking focus is set, click "Generate impact analysis"
3. Card shows: relevance banner + insights with icons + actions with numbers
4. Dimension pills appear on relevant insights
5. Refresh button regenerates the analysis
6. Setting tracking focus on a new topic auto-generates the impact
7. Card is collapsible
