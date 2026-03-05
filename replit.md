# Watchloom

AI-powered personal intelligence workspace.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Node.js/Express
- **Auth**: Supabase (email/password + Google OAuth) with Resend transactional emails
- **AI**: Replit AI Integrations (Anthropic Claude) for entity extraction and content classification
- **Database**: PostgreSQL (Replit) via Drizzle ORM
- **Routing**: wouter (frontend), Express routes (backend)

## Key Features
1. **Supabase Auth** - Email/password signup/login, Google OAuth
2. **Onboarding Flow** - Free text input → Claude API extraction → Category/topic confirmation → Workspace creation
3. **Dashboard** - Sidebar navigation with My Workspace (default), Capture, Inbox, Daily Brief, Settings pages
4. **Capture System** - Four capture types (Text, Voice, URL, Document) with AI classification and topic routing
5. **Welcome Modal** - One-time welcome overlay for new users after onboarding, dismissed state stored in user_profiles
6. **Empty Category Nudge** - Inline add-topic form shown when clicking a category with 0 topics

## Environment Variables
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` - Replit AI integration key (auto-configured)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` - Replit AI integration URL (auto-configured)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key for admin user creation (bypasses email rate limits)
- `RESEND_API_KEY` - Resend API key for transactional emails
- `EMAIL_FROM` - Sender email address for transactional emails
- `SESSION_SECRET` - Used for signing JWT verification tokens
- Vite exposes Supabase vars as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` via vite.config.ts

## API Routes
- `POST /api/auth/signup` - Signup via Supabase Admin API (no Supabase email), sends branded verification email via Resend. Also accepts optional `role`, `trackingText`, and `emailRedirectTo` fields. Persists onboarding context to user_profiles table at account creation. The `emailRedirectTo` is validated against allowed domains before being embedded in the verification JWT
- `POST /api/auth/resend-verification` - Resend verification email to an unconfirmed user. Accepts `email` and `emailRedirectTo`
- `GET /api/auth/verify-email` - Email verification link handler, validates JWT token and confirms email in Supabase. On success redirects to `APP_BASE_URL/workspace` (with magic link auto-sign-in). On failure/expiry redirects to `APP_BASE_URL/login?error=invalid-token`. Uses `APP_BASE_URL` env var for redirect base URL
- `POST /api/extract` - Onboarding: extract categories/entities from user description (auth required)
- `POST /api/classify` - Classify captured content and match to workspace entity (auth required). Returns `matched: true` with entity/category (plus optional `suggested_type_change` if AI detects a better topic_type) or `matched: false` with `suggestedCategory` and `suggestedEntity` (including inferred `topic_type`) when confidence is below 70%
- `POST /api/transcribe` - Transcribe audio via Claude (auth required, multipart form)
- `POST /api/captures` - Save a confirmed capture (auth required)
- `GET /api/captures` - List all captures for authenticated user (auth required)
- `POST /api/entity-summary` - AI-generated summary for an entity based on captured intel (auth required)
- `POST /api/add-entity` - Add a new entity to an existing category (auth required)
- `POST /api/add-category` - Create a new category with optional initial entity (auth required)
- `POST /api/split-topic` - Split a combined topic into individual topics (auth required). Accepts categoryName, originalEntityName, newNames[], topicType. Creates individual entities and removes the combined one. Guards against data loss if all names already exist. Always inherits topic_type from original entity as primary source of truth
- `POST /api/fix-topic-types` - Bulk fix topic_type for entities (auth required). Accepts `fixes` array of `{ categoryName, entityName, topic_type }` objects
- `PATCH /api/entity` - Update entity topic_type and/or priority (auth required). Accepts categoryName, entityName, and optional topic_type/priority fields
- `POST /api/ai-insights` - Generate 3 AI insight bullet points for a topic from its captures (auth required). Returns `{ insights: string[] | null }`
- `POST /api/link-topic` - Link a related topic to an entity (auth required). Accepts categoryName, entityName, linkedEntityName
- `GET /api/topic-types` - Get all system topic type configs (auth required)
- `GET /api/workspace/current` - Get workspace for authenticated user (auth required)
- `POST /api/workspace` - Create user workspace (auth required)
- `GET /api/onboarding-context/:userId` - Check if user has onboarding context saved from 3-step signup (auth required)
- `GET /api/workspace/:userId` - Check if workspace exists (auth required)
- `POST /api/briefs/generate` - Generate a daily brief using Claude from all captures + entity data (auth required)
- `GET /api/briefs` - List all briefs for authenticated user (auth required)
- `GET /api/welcome-status` - Check if user has dismissed the welcome modal (auth required)
- `POST /api/dismiss-welcome` - Mark welcome modal as dismissed for the user (auth required)
- `GET /api/battlecard/:entityId` - Get battlecard data for a competitor entity (auth required)
- `PUT /api/battlecard/:entityId` - Upsert battlecard sections (whatTheyDo, strengths, weaknesses, howToBeat) with auto-save on blur (auth required)
- `POST /api/battlecard/:entityId/autofill` - AI auto-fill all battlecard sections using captures + product_context (auth required)

## Database Tables
- `user_profiles` - User role, onboarding context (tracking text from signup Step 2), and welcome_dismissed flag. Saved at account creation before email confirmation
- `workspaces` - User workspaces with categories/entities (jsonb). Each entity in the JSONB has optional `topic_type` (default 'general'), `related_topic_ids` (default []), and `priority` ('high'|'medium'|'low'|'watch', default 'medium')
- `captures` - Captured content with entity/category match info
- `briefs` - AI-generated daily intelligence briefs with content, capture/entity counts
- `topic_type_configs` - Configurable topic types per tenant (uuid PK, tenant_id, type_key, display_name, icon, description, ai_prompt_hint, widget_config jsonb, created_at). Seeded with 11 system defaults (competitor, project, regulation, person, trend, account, technology, event, deal, risk, general) under system tenant 00000000-0000-0000-0000-000000000000
- `product_context` - Product context per tenant (uuid PK, tenant_id, product_name, description, target_customer, strengths, weaknesses, updated_at)
- `battlecards` - Competitive battlecard data per entity (uuid PK, tenant_id, entity_id text, what_they_do text, strengths jsonb, weaknesses jsonb, how_to_beat jsonb, last_ai_generated_at, updated_at). Unique on (tenant_id, entity_id)

## File Structure
- `client/src/lib/supabase.ts` - Supabase client initialization
- `client/src/lib/auth-context.tsx` - Auth provider with Supabase auth hooks
- `client/src/pages/landing.tsx` - Public landing page (hero with pill badge, interactive tracking input + "Build my workspace" CTA, animated product mockup (3-stage CSS animation: Capture → AI Routing → Intelligence Map, 9s loop), "the real problem" section with comparison card, scrolling tag strip, how-it-works 3-column, social proof testimonials, track-anything 6-card showcase, "coming soon" Ask Watchloom teaser with waitlist form, final CTA, footer)
- `client/src/pages/signup.tsx` - 3-step signup flow (role → tracking text → account creation). Supports hero skip: when arriving via /signup?from=hero with localStorage "watchloom_tracking_intent" set, skips Steps 1 & 2 and goes straight to Step 3 account creation with tracking text pre-populated
- `client/src/pages/signin.tsx` - Simple sign-in page
- `client/src/pages/auth.tsx` - Legacy auth page (no longer routed, kept for reference)
- `client/src/pages/onboarding.tsx` - Onboarding flow with AI extraction (shown to users who skip 3-step signup)
- `client/src/pages/dashboard.tsx` - Main dashboard layout with sidebar
- `client/src/pages/capture.tsx` - Full capture page with 4 input types + AI classification
- `client/src/pages/inbox.tsx` - Inbox page (empty state)
- `client/src/pages/map.tsx` - My Workspace page (category/topic list view with empty category nudge and welcome modal). Clicking a topic navigates to full-screen topic view
- `client/src/pages/topic-view.tsx` - Full-screen topic view with two-column layout: left (AI summary, widgets, updates feed) and right (topic details, inline capture, AI insights). Supports type/priority editing, related topic linking, battlecard/quick_stats widgets for competitor type, placeholder widgets for unbuilt types. Topic type matching is case-insensitive (normalized to lowercase). BattlecardWidget shows Auto-fill with AI button at top when no data exists, at bottom when data is present. Widget config uses fallback defaults for competitor and general types when API data hasn't loaded
- `client/src/pages/brief.tsx` - Daily Brief page (empty state)
- `client/src/pages/settings.tsx` - Settings/account page
- `client/src/components/app-sidebar.tsx` - Sidebar navigation component
- `server/routes.ts` - API routes (including auth signup/verification)
- `server/email.ts` - Resend email sending (branded verification emails)
- `server/storage.ts` - Database storage layer with Drizzle
- `shared/schema.ts` - Drizzle schemas and shared TypeScript types

## Pre-Auth Flow
- Landing page at `/` for unauthenticated users with hero section, features, and social proof
- 3-step signup at `/signup`: Step 1 (8 role cards in 2x4 grid, "Other" reveals text input) → Step 2 (tracking text) → Step 3 (account creation)
- Sign-in at `/signin`: simple email/password form
- Users who complete the 3-step signup have their role + tracking text saved to the `user_profiles` database table at account creation (before email confirmation), and also stored in localStorage as `pendingOnboarding` as a fast-path fallback
- After email verification, the server auto-signs users in via a Supabase magic link redirect (no manual sign-in needed). Fallback: if magic link generation fails, shows verification success page with link to sign-in
- After sign-in (or auto-sign-in), App.tsx redirects authenticated users away from /signin and /signup to / automatically
- App.tsx first checks localStorage, then falls back to checking the server via `GET /api/onboarding-context/:userId`. If onboarding data exists from either source, it auto-runs AI extraction and workspace creation, skipping the manual onboarding page
- Only users who genuinely have no onboarding data (no localStorage AND no server-side profile) see the standard onboarding question page
- Loading state shows centered Watchloom logo + spinner while auth/onboarding state is being resolved

## UI Terminology (Plain English)
- "Intelligence Map" → "My Workspace" (sidebar + page headers)
- "Entities" → "Topics" (all user-facing text)
- "Intel Items" → "Updates" (all user-facing text)
- "Captures" (noun in Inbox) → "Submissions"
- "Capture" (sidebar verb) — unchanged
- "Daily Brief", "Inbox", "Settings" — unchanged
- Database column names, API routes, and internal code variable names are NOT renamed

## Routing (Authenticated)
- `/` → My Workspace (default landing after login/onboarding)
- `/capture` → Capture page
- `/inbox` → Inbox page
- `/brief` → Daily Brief page
- `/settings` → Settings page
- `/map` → Also renders My Workspace (legacy alias)
- `/topic/:category/:entity` → Full-screen Topic View (URL-encoded params)

## Visual Style
- White background, deep navy blue #1e3a5f accent
- DM Sans font for landing/signup/signin pages, Inter font for authenticated dashboard
- Clean and minimal with lots of white space
