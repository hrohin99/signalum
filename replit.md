# Watchloom

## Overview
Watchloom is an AI-powered personal intelligence workspace designed to help users capture, classify, and organize information efficiently. It acts as a centralized hub for transforming unstructured data into actionable intelligence, providing features like intelligent content capture, AI-driven classification, and personalized daily briefs. The project aims to empower users to stay on top of critical information, understand market trends, manage projects, and gain competitive insights.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
I do not want changes made to the `client/src/pages/auth.tsx` file.

## System Architecture
Watchloom is built with a React, Vite, and Tailwind CSS frontend, utilizing shadcn/ui components for a clean and minimal UI with a white background and deep navy blue (`#1e3a5f`) accent. It uses DM Sans for marketing pages and Inter for the authenticated dashboard. The backend is powered by Node.js/Express. Authentication is handled by Supabase, supporting email/password and Google OAuth, with Resend for transactional emails. AI capabilities, including entity extraction, content classification, transcription, and insight generation, are provided by Replit AI Integrations (Anthropic Claude). Data persistence is managed by a PostgreSQL database via Drizzle ORM.

**Key Features:**
- **Intelligent Capture System:** Supports text, voice, URL, and document inputs with AI classification and topic routing. When AI detects user intent (e.g. "I want to track CEN/TS 18099") instead of intelligence, shows an inline topic creation form pre-filled with the detected entity name, inferred topic type, and a description. The form includes a category dropdown (with "+ Create new category" option) and topic type pills. On creation, navigates to My Workspace.
- **Onboarding Flow:** Guides new users through initial setup, extracting categories and entities from their descriptions using AI. After workspace creation, triggers asynchronous historical seeding via Perplexity to populate the workspace with 90 days of web intelligence. A navy banner with pulsing dot shows during seeding; a green toast confirms completion.
- **Dynamic Dashboard:** Features a sidebar for navigation to "My Workspace," "Capture," "Inbox," "Daily Brief," and "Settings" pages.
- **Workspace Management:** Organizes intelligence into categories and "Topics" (user-facing term for entities), displaying deadline indicators (red for overdue, amber for 7 days, yellow for 30 days) and an "Empty Category Nudge" for easy topic creation. Uses a `workspace_ready` flag (integer column in `user_profiles`) set to 1 after workspace creation completes. The MapPage polls `GET /api/workspace-ready` every 2s for up to 10s when categories are empty, showing a branded loading state; after timeout, shows a "Your workspace is almost ready" empty state with a manual refresh button.
- **Daily Briefs:** AI-generated summaries of key intelligence, including an "On Your Radar" section for urgent topics.
- **Topic View:** Provides a detailed, full-screen view for each topic with AI summaries, widgets (e.g., battlecards for competitors), and an updates feed.
- **Product Context:** Allows users to define their product's context for personalized AI insights, particularly for battlecards.
- **Battlecards:** AI-enhanced competitive analysis tools for competitor topics, supporting auto-fill and manual updates.
- **Key Dates Management:** Allows users to track and manage specific dates/deadlines associated with topics.
- **Topic Type-Specific Behaviour:** For regulation, risk, and event topics: the Dates and Deadlines card shows a contextual soft prompt when no dates exist yet, and creating a new topic of these types automatically presents an Add Date modal in the capture flow.

**Core Technical Implementations:**
- **API-driven communication:** A comprehensive set of RESTful API endpoints handles all interactions between the frontend and backend, including authentication, data extraction, classification, capture, and workspace management.
- **Database Schema:** `user_profiles`, `workspaces` (with JSONB for categories/entities), `captures`, `briefs`, `topic_type_configs` (seeded with system defaults), `product_context`, `battlecards`, `topic_dates`, and `workspace_context` tables are central to data storage.
- **Auth and User Management:** Integrates Supabase for robust authentication, including email verification via Resend. It supports a pre-auth flow with a 3-step signup process and handles redirects post-verification.
- **AI Integration:** Utilizes Anthropic Claude for advanced natural language processing tasks, ensuring intelligent data handling.

## External Dependencies
- **Supabase:** Authentication and user management.
- **Resend:** Transactional email services for user verification.
- **Replit AI Integrations (Anthropic Claude):** AI capabilities for content extraction, classification, transcription, and insight generation.
- **Perplexity AI:** Web research layer for automated competitor and topic intelligence gathering. Service at `server/perplexityService.ts`. Uses `PERPLEXITY_API_KEY` secret. Provides `searchCompetitorNews`, `searchTopicUpdates`, `deduplicateFindings`, and `findingsToCaptures` functions.
- **node-cron:** Schedules daily ambient search at 6:00 AM UTC.
- **PostgreSQL:** Primary database.

## Ambient Search System
- **Route:** `POST /api/search/run-ambient` — triggers ambient web search for all tenants (no auth required, intended for scheduled jobs).
- **Service:** `server/ambientSearch.ts` — core ambient search logic with rate limiting (10 Perplexity calls/min).
- **Scheduler:** node-cron in `server/index.ts` runs daily at 6:00 AM UTC.
- **Flow:** Fetches all workspaces → for each entity, searches Perplexity with 7-day lookback → deduplicates against 30-day capture window → creates captures, updates entity AI summaries, flags for daily brief, creates high-signal notifications.
- **DB Tables:** `notifications` (high-signal alerts), `ambient_search_logs` (run history/metrics).
- **Manual Search:** `POST /api/search/manual` (auth required) — per-topic manual Perplexity search with 30-day lookback, 3 searches/topic/day limit. Frontend `ManualSearchButton` component in `TopicDetailsCard` shows last searched time, loading state, limit reached message, and remaining searches count.
- **Search Settings:** `PATCH /api/entity/search-settings` (auth required) — updates per-entity `auto_search_enabled` and `alert_on_high_signal` preferences stored in workspace JSONB. Frontend `SearchSettingsSection` component in `TopicDetailsCard` with toggle switches.

## Sibling Topic Inference System
- **Function:** `performSiblingInference()` in `server/routes.ts` — AI-powered disambiguation for new topics based on existing workspace context.
- **Flow:** When a topic is created via `/api/add-entity` or `/api/add-category`, the system:
  1. Checks `workspace_context` table for the tenant's domain context (primary_domain, relevant_subtopics, domain_keywords).
  2. If no workspace_context exists, falls back to the 3 most recently confirmed entities (those with `disambiguation_confirmed: true` and `company_industry` or `domain_keywords` set) from the workspace JSONB.
  3. If no confirmed entities exist either, uses the **category name** as a fallback context signal (e.g., "IDV Competitors" provides strong domain signal).
  4. Sends context + new entity name to Claude for domain inference.
  5. Applies result based on confidence: high → auto-confirms with `disambiguation_context`; medium → sets context but leaves unconfirmed; low → skips.
- **Category Name Context:** The category name is always passed to the inference prompt as supplementary context. When it's the only signal available, it serves as the primary inference context.
- **Entity Fields (JSONB in workspaces.categories):** `disambiguation_confirmed`, `disambiguation_context`, `company_industry`, `domain_keywords`, `needs_aspect_review` added to `ExtractedEntity` interface.
- **DB Table:** `workspace_context` (id, tenant_id, primary_domain, relevant_subtopics JSONB, domain_keywords JSONB, updated_at).
- **API Routes:** `GET /api/workspace-context`, `PUT /api/workspace-context` — CRUD for workspace context.
- **Response:** Both `/api/add-entity` and `/api/add-category` now return `siblingInference` field with `inferred_domain`, `confidence`, and `reasoning`.

## Confidence Indicator (Part 5)
- **Location:** AI Summary card in `AISummarySection` component (`client/src/pages/topic-view.tsx`).
- **Position:** Same line as "Last updated" timestamp, right-aligned.
- **Three states:**
  - **State 1 (green dot):** `disambiguation_confirmed=true` AND `workspace_context` exists with `primaryDomain`. Shows "Scoped to [primary_domain]".
  - **State 2 (amber dot):** `disambiguation_confirmed=true` but no workspace context (inferred via medium confidence). Shows "Based on your workspace focus" + thumbs down icon.
  - **State 3 (grey dot):** `disambiguation_confirmed=false` or no context. Shows "General summary" + pencil icon that opens AspectSelectionModal.
- **Thumbs Down Popover:** Two options: "wrong part of company" → opens AspectSelectionModal; "irrelevant info" → text input for custom focus → saves as `disambiguation_context` via `POST /api/entity/confirm-disambiguation`, regenerates summary, shows green toast.
- **Data:** Fetches `GET /api/workspace-context` to determine workspace context availability.

## Disambiguation UI (Parts 2-4)
- **DisambiguationBanner** (`client/src/pages/topic-view.tsx`): Amber confirmation banner shown when entity has `disambiguation_context` but `disambiguation_confirmed` is false (medium confidence), OR when entity has `needs_aspect_review` flag set (retroactive migration). For context banners: "Yes, that is right" confirms; "No, change this" opens AspectSelectionModal. For review banners (no context): "Select focus area" opens AspectSelectionModal; "Keep as-is" confirms. Auto-dismisses context banners after 24 hours via localStorage tracking.
- **AspectSelectionModal** (`client/src/pages/topic-view.tsx`): Modal with Claude-generated aspect pills for selecting which business area to track. Calls `POST /api/entity/aspect-pills` for pills, `POST /api/entity/confirm-disambiguation` on selection. Triggers Perplexity search scoped to selected aspect. Includes free-text input and "All business areas" option. No cancel — user must select.
- **DisambiguationCard** (`client/src/pages/topic-view.tsx`): Two-step card for ambiguous company names. Step 1: calls `POST /api/entity/disambiguate-companies` to check ambiguity, shows company selection cards. Step 2: transitions to AspectSelectionModal scoped to selected company. If name is unambiguous (single: true), skips to aspect selection directly. Back arrow on Step 2.
- **API Endpoints:**
  - `POST /api/entity/aspect-pills` — generates 3-5 business area labels via Claude
  - `POST /api/entity/disambiguate-companies` — checks if entity name is ambiguous, returns company options
  - `POST /api/entity/confirm-disambiguation` — saves disambiguation_context, confirms entity, triggers Perplexity search
  - `PATCH /api/entity` — now supports `disambiguation_confirmed`, `disambiguation_context`, and `needs_aspect_review` fields

## Retroactive Disambiguation Migration (Part 7)
- **Module:** `server/retroactiveMigration.ts` — one-time background migration that runs on server start.
- **Purpose:** For entities with `disambiguation_confirmed=true` but no `disambiguation_context` (confirmed before the disambiguation system existed).
- **Flow:**
  1. Fetches all workspaces and identifies qualifying entities.
  2. For each entity: runs sibling inference using workspace context and sibling topics.
  3. High confidence → sets `disambiguation_context` silently.
  4. Medium confidence → sets `disambiguation_context` AND `needs_aspect_review=true`.
  5. Low confidence or inference failure → sets `needs_aspect_review=true`.
  6. Saves updated workspace categories after processing each workspace.
  7. Regenerates AI summaries for competitor entities with updated context (sequential, 1s delay between each).
- **Non-blocking:** Runs as a fire-and-forget async task after server listen callback. Errors are caught and logged, never crash the server.
- **Entity Field:** `needs_aspect_review` (boolean) on `ExtractedEntity` — triggers the DisambiguationBanner when user opens topic view.

## Null Safety & Error Handling
- **ErrorBoundary** (`client/src/components/ErrorBoundary.tsx`): Top-level React error boundary wrapping the entire app in `App.tsx`. Shows branded "Something went wrong" page with "Reload workspace" and "Clear and retry" buttons instead of blank white screen.
- **DB Schema Safety** (`server/dbSafety.ts`): Runs on server start to ensure `workspace_context`, `topic_dates`, and `monitored_urls` tables exist using `CREATE TABLE IF NOT EXISTS`. Called before retroactive migration.
- **Null Safety Patterns**: All entity JSONB fields (`disambiguation_confirmed`, `disambiguation_context`, `needs_aspect_review`, `company_industry`, `domain_keywords`, `auto_search_enabled`, `alert_on_high_signal`) are accessed with `?? false`, `?? []`, or `?? undefined` fallbacks throughout client and server code.
- **Workspace Context Safety**: All `workspaceContext` references use optional chaining (`wsContext?.primaryDomain ?? null`). `GET /api/workspace-context` returns `{ workspaceContext: null }` on error instead of 500. `performSiblingInference()` wraps context fetch in try/catch.
- **Diagnostic Logging**: MapPage outputs mount diagnostics (`tenant_id`, `workspace_context_found`, `entities_loaded`, errors) to console on load.
- **Background Job Safety**: All background jobs (retroactive migration, historical seeding, ambient search) are wrapped in try/catch and never block the UI render.