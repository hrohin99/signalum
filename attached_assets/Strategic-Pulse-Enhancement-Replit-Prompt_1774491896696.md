# Strategic Pulse Enhancement — Replit Prompt

## Paste CLAUDE.md first, then paste this prompt

---

## TASK: Enhance Strategic Pulse with new sections, restructured flow, and dimension-linked insights

Read CLAUDE.md first. This modifies the Strategic Pulse feature.

### CRITICAL SAFETY RULES:
- Do NOT run drizzle-kit push
- Strategic Pulse table is NOT managed by Drizzle migrations (see drizzle.config.ts tablesFilter)
- Use db.execute(sql`...`) for all DB writes
- Two-pass summarisation must stay SEQUENTIAL (not parallel) to avoid 30k TPM rate limit on claude-sonnet-4-6
- Do NOT break the existing PDF export — update it to match the new section structure
- Do NOT delete existing strategic_pulse data — new structure should work alongside old data
- Store sections as JSON strings in text columns (same pattern as existing)

---

### WHAT CHANGES:

#### Section restructure (7 sections, was 6):

OLD ORDER:
1. The Big Shift
2. Emerging Opportunities  
3. Threat Radar
4. Competitor Moves Decoded
5. Watch List
6. Regional Intelligence

NEW ORDER:
1. **Market Direction** (NEW) — Where is the market heading in the next 6-18 months? Technology bets being placed across the industry. Buyer behavior shifts. Consolidation or fragmentation signals. This is a 2-3 paragraph strategic synthesis, not a list of news items. Written like an analyst briefing.
2. **Market Forces** (RENAMED from "The Big Shift") — Structural forces driving the market: regulation changes, technology shifts, procurement trends, standards evolution. These are the inputs that drive the Market Direction above.
3. **Emerging Opportunities** (UNCHANGED)
4. **Competitor Moves Decoded** (UNCHANGED)
5. **Threat Radar & Watch List** (MERGED) — Combine the old Threat Radar and Watch List into one section with two tiers:
   - **Immediate threats** — things requiring action now (tag as "urgent")
   - **Watch items** — things to monitor that could become threats (tag as "monitoring")
6. **Regional Intelligence** (UNCHANGED) — 2×3 grid: North America, UK, EU, EMEA, APAC, South America
7. **Roadmap Implications** (NEW) — 3-5 actionable bullet-point recommendations connecting everything above to the user's product. Format each as: "Based on [specific signal from above sections], consider [specific action/investment]." This section MUST pull from the user's competitive dimensions (from the competitive_dimensions table) to reference specific capability gaps and strengths. Example: "Based on the industry shift toward on-premises deployment (Market Forces), consider prioritizing your cloud-agnostic capability — currently marked as a gap in your Deployment & Architecture dimension."

#### Dimension-linked insights (NEW — applies to ALL sections):

Every insight/bullet in the Pulse that relates to one of the user's competitive dimensions should be tagged with a dimension reference. Format: `[Relates to: Dimension Name → Item Name (your status)]`

Example: "iProov announced FIDO2 certification for their biometric SDK. [Relates to: Certifications & Compliance → FIDO certification (gap)]"

To implement this:
1. When generating the Pulse, fetch the user's competitive_dimensions from the DB
2. Include dimension names and items in the Claude prompt context
3. Ask Claude to tag insights with matching dimensions where relevant
4. In the frontend, render these tags as small colored pills:
   - Green pill if the dimension item our_status is "yes" (we're strong here)
   - Red pill if our_status is "no" (this is our gap — pay attention)
   - Amber pill if our_status is "partial"
   - Gray pill if "na" or no match

---

### IMPLEMENTATION DETAILS:

#### Backend changes (server/routes.ts + wherever Pulse generation lives):

1. Find the Strategic Pulse generation code (the Claude API call that generates each section)

2. Update the system prompt / section prompts:
   - Remove "The Big Shift" section prompt, replace with "Market Forces"
   - Remove "Watch List" section prompt, merge its instructions into "Threat Radar" → rename to "Threat Radar & Watch List"
   - Add "Market Direction" section prompt (FIRST in the sequence)
   - Add "Roadmap Implications" section prompt (LAST in the sequence)

3. For the "Market Direction" prompt, instruct Claude:
   "Synthesize a 2-3 paragraph strategic outlook for the next 6-18 months in the user's market. Focus on: (a) where technology is heading, (b) what buyers are demanding differently, (c) whether the market is consolidating or fragmenting. Write like a senior industry analyst briefing a product leader. Do NOT list individual news items — synthesize the patterns."

4. For the "Roadmap Implications" prompt, instruct Claude:
   "Based on all the intelligence above, provide 3-5 specific, actionable recommendations for the user's product roadmap. Each recommendation must follow this format: 'Based on [specific signal], consider [specific action].' Reference the user's competitive dimensions where relevant — mention specific capability gaps they should address and strengths they should double down on."
   
   IMPORTANT: This prompt needs the user's competitive dimensions as context. Fetch them:
   ```
   const dims = await db.execute(sql`
     SELECT name, priority, items FROM competitive_dimensions 
     WHERE workspace_id = ${workspaceId} ORDER BY display_order
   `);
   ```
   Include in the prompt: dimension names, items, our_status for each item.

5. For dimension-linked insights, add to EVERY section's prompt:
   "Where an insight directly relates to one of the user's competitive dimensions, append a tag in this format: [DIM:Dimension Name|Item Name]. Only tag insights that have a clear, direct connection — do not force tags."
   
   Include the dimension list in the prompt context so Claude knows what to match against.

6. When parsing Claude's response, extract [DIM:...] tags and convert them to structured data for the frontend.

#### Frontend changes:

1. Update the Pulse display component to show the new section names and order

2. For "Market Direction" — render as flowing paragraphs (no bullet points), with a distinctive header style that signals "this is the executive summary"

3. For "Threat Radar & Watch List" — render with two visual tiers:
   - Urgent items: red left border accent
   - Monitoring items: amber left border accent

4. For "Roadmap Implications" — render as numbered recommendations with a distinctive style (maybe purple left border to match Signalum's accent). Each recommendation should clearly show the "Based on..." → "Consider..." structure.

5. For dimension-linked tags — render as small pills next to the insight text:
   - Parse the [DIM:Dimension Name|Item Name] tags from the content
   - Look up the item's our_status from the dimensions data
   - Render as: `<span class="dim-tag dim-tag-{status}">Dimension → Item</span>`
   - Colors: green (yes), red (no), amber (partial), gray (na/unknown)
   - Clicking a dimension tag could navigate to the relevant dimension in settings (nice-to-have, not required)

6. Update the PDF export (jsPDF) to match the new section structure:
   - New section names and order
   - Dimension tags rendered as text labels: "(Relates to: Dimension → Item)"
   - "Market Direction" rendered with slightly larger font as the opening section

#### Token budget management:

The two-pass sequential summarisation must stay within limits:
- Pass 1: Generate raw intelligence from Perplexity/captured data
- Pass 2: Claude synthesizes into sections

To fit the new sections without exceeding tokens:
- "Watch List" merging into "Threat Radar" saves ~800 tokens
- "Market Direction" needs ~600 tokens (2-3 paragraphs)
- "Roadmap Implications" needs ~500 tokens (3-5 bullets)  
- Dimension tags add ~100 tokens to the prompt context
- Net increase: ~400 tokens — should fit within existing budget

If token limits are hit, the dimension context can be truncated to just high-priority dimensions.

---

### SECTION PROMPT TEMPLATES:

**Market Direction:**
"You are a senior industry analyst. Based on the intelligence gathered this week about {user's market}, write a 2-3 paragraph strategic outlook for the next 6-18 months. Focus on technology trajectory, buyer behavior shifts, and market structure changes (consolidation vs fragmentation). Write with conviction — take a position on where things are heading. Do not hedge everything. The user's product is: {product_description}. Their market perspective is: {user_perspective}."

**Market Forces (was The Big Shift):**
"Identify the 3-5 most significant structural forces shaping {user's market} this week. These should be forces, not events — regulation shifts, technology maturation curves, procurement standard changes, talent market shifts. For each force, explain the direction it's pushing the market. {dimension_context}"

**Threat Radar & Watch List:**
"Identify threats to {product_name} from this week's intelligence. Categorize each as either URGENT (requires action within 30 days) or MONITORING (could become a threat in 3-6 months). For urgent items, suggest an immediate response. For monitoring items, define what trigger would escalate them. {dimension_context}"

**Roadmap Implications:**
"Based on ALL the intelligence sections above, provide 3-5 specific product roadmap recommendations for {product_name}. Format each as: 'Based on [specific signal from the sections above], consider [specific investment or action].' You MUST reference the user's competitive dimensions where relevant. Their dimensions and current status: {full_dimension_list_with_statuses}. Prioritize recommendations that address gaps (items marked 'no') that the market is moving toward, and strengths (items marked 'yes') worth doubling down on."

---

### FILES TO MODIFY:
- Server-side Pulse generation (wherever the Claude prompts live — likely in routes.ts or a dedicated pulse file)
- Frontend Pulse display component
- PDF export code
- Any constants/enums defining section names

### FILES NOT TO MODIFY:
- server/dbSafety.ts
- server/storage.ts  
- shared/schema.ts
- drizzle.config.ts
- client/src/lib/queryClient.ts

### VERIFICATION:
After implementing, generate a new Strategic Pulse and verify:
1. All 7 sections appear in the correct order
2. "Market Direction" reads like an analyst briefing (paragraphs, not bullets)
3. "Threat Radar & Watch List" has urgent/monitoring tiers
4. "Roadmap Implications" references specific dimension gaps
5. Dimension tags appear as colored pills on relevant insights
6. PDF export includes all new sections correctly
7. Existing Pulse data still displays (backward compatibility)
