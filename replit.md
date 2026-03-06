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
- **Intelligent Capture System:** Supports text, voice, URL, and document inputs with AI classification and topic routing.
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
  3. Sends context + new entity name to Claude for domain inference.
  4. Applies result based on confidence: high → auto-confirms with `disambiguation_context`; medium → sets context but leaves unconfirmed (for future lightweight confirmation UI); low → skips.
- **Entity Fields (JSONB in workspaces.categories):** `disambiguation_confirmed`, `disambiguation_context`, `company_industry`, `domain_keywords` added to `ExtractedEntity` interface.
- **DB Table:** `workspace_context` (id, tenant_id, primary_domain, relevant_subtopics JSONB, domain_keywords JSONB, updated_at).
- **API Routes:** `GET /api/workspace-context`, `PUT /api/workspace-context` — CRUD for workspace context.
- **Response:** Both `/api/add-entity` and `/api/add-category` now return `siblingInference` field with `inferred_domain`, `confidence`, and `reasoning`.