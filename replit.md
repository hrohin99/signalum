# Watchloom

## Overview
Watchloom is an AI-powered personal intelligence workspace designed to help users capture, classify, and organize information efficiently. It transforms unstructured data into actionable intelligence through intelligent content capture, AI-driven classification, and personalized daily briefs. The project aims to empower users to stay informed, understand market trends, manage projects, and gain competitive insights.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
I do not want changes made to the `client/src/pages/auth.tsx` file.

## System Architecture
Watchloom features a React, Vite, and Tailwind CSS frontend with shadcn/ui components, using a white background and deep navy blue (`#1e3a5f`) accents. DM Sans is used for marketing pages (Playfair Display for the hero headline), and Inter for the authenticated dashboard. The landing page (`client/src/pages/landing.tsx`) uses CSS-only animations with Intersection Observer for scroll-triggered fade-up effects, a word-by-word hero headline animation, count-up stat numbers, feature card hover lifts, a continuous scrolling topic pill strip (pause on hover), and a Snagit-style features mega dropdown in the navbar. The landing page sections in order: Navbar, Hero (dark navy), Stats Bar, Problem Section, Topic Pill Strip, How It Works, Feature Cards (2x4 grid of 8 cards), Testimonials, Trust Section, Coming Soon (Ask Watchloom), Final CTA, Footer. The backend is built with Node.js/Express. Supabase handles authentication via email/password and Google OAuth, with Resend for transactional emails. AI capabilities, including entity extraction, content classification, transcription, and insight generation, are powered by Replit AI Integrations (Anthropic Claude). Data is stored in a PostgreSQL database managed by Drizzle ORM.

**Key Features:**
- **Intelligent Capture System:** Supports various input types (text, voice, URL, document) with AI classification and multi-topic routing. When content spans multiple topics, the AI splits it and routes each piece to the correct topic with individual confirm/skip controls and a "Confirm all" option. It can also infer user intent to pre-fill topic creation forms.
- **Onboarding Flow:** Guides new users through initial setup, extracting categories and entities using AI, and performs asynchronous historical data seeding.
- **Dynamic Dashboard:** Provides navigation to "My Workspace," "Capture," "Inbox," "Daily Brief," and "Settings."
- **Workspace Management:** Organizes intelligence into categories and "Topics" (entities), including deadline indicators and features for creating categories and topics.
- **Daily Briefs:** AI-generated summaries of key intelligence, including an "On Your Radar" section.
- **Topic View:** Detailed full-screen view for topics with AI summaries, widgets (e.g., battlecards), and an updates feed.
- **Product Context:** Allows users to define product context for personalized AI insights, especially for battlecards.
- **Battlecards:** AI-enhanced competitive analysis tools with auto-fill and manual update capabilities.
- **Key Dates Management:** Tracks and manages specific dates/deadlines for topics. AI date extraction automatically detects dates/deadlines from capture text during classification (`/api/classify` includes `extracted_dates` in response) and via a dedicated `/api/extract-dates` endpoint for inline captures. Extracted dates appear as actionable cards with Track/Ignore buttons on the capture page and as inline prompts on the topic detail view.
- **Topic Type-Specific Behavior:** Provides contextual prompts and automated date modals for regulation, risk, and event topics.
- **Ambient Search System:** Schedules daily web searches using Perplexity AI for all tenants, deduplicating findings and creating captures and notifications. Supports manual, per-topic searches and customizable search settings. Competitor searches now also detect hiring signals (leadership hires, AI/ML roles, market expansion roles) which are tagged with `[signal_type:hiring_signal]` in matchReason and displayed with a briefcase icon and amber "Hiring signal" pill in the updates feed.
- **Sibling Topic Inference:** AI-powered disambiguation for new topics based on existing workspace context or category names, determining domain, confidence, and reasoning.
- **Confidence Indicator:** Displays the scope and confidence of AI summaries in the UI.
- **Disambiguation UI:** Provides banners and modals for confirming or refining AI-inferred contexts and selecting specific aspects for topic focus.
- **Retroactive Disambiguation Migration:** A background migration process to apply disambiguation contexts to existing entities.
- **Monitored URLs:** Allows users to track specific URLs for competitor topics. Supports URL categories (pricing/product/news/careers/custom) and configurable check frequencies (daily/every 3 days/weekly). Card appears in the right column of competitor topic full-screen views below Dates and Deadlines.
- **Coming Soon Interest Cards:** Three feature interest cards (AI Visibility, Email Capture, Search Your Intelligence) with "I'm Interested" buttons that record user interest. AI Visibility appears in competitor topic views below Monitored URLs. Email Capture and Search cards appear in Settings below My Product. A disabled search icon with tooltip is in the top navigation bar.
- **Admin Dashboard:** Private route at `/admin` accessible only to `hrohin99@gmail.com`. Shows three sections: all feedback (table with date, mood, message, email), feature interest summary cards (AI Visibility, Email Capture, Search), and all users with activity stats (topics, captures). Admin nav link appears in sidebar only for the admin user. Backend enforced via `requireAdmin` middleware.
- **Feedback Widget:** Fixed bottom-right button on all authenticated screens. Opens modal with mood pills and textarea. Saves to `feedback` table and emails feedback to founder via nodemailer. Controlled by `VITE_FEEDBACK_ENABLED` env var (default true).
- **Weekly Digest Email:** Optional weekly summary email sent every Monday at 8am UTC via node-cron. Toggle in Settings under Notifications card. Covers last 7 days of captures, prioritizes high-signal updates, includes hiring signals detected and deadlines within 30 days. Generated via Anthropic Claude and sent via Resend. Stored as `weekly_digest_enabled` boolean on user_profiles. Backend endpoint: POST `/api/digest/weekly`. Generation logic in `server/weeklyDigest.ts`.

**Core Technical Implementations:**
- **API-driven communication:** RESTful API endpoints handle all frontend-backend interactions.
- **Capabilities System:** User-defined market capabilities tracked across competitors. Workspace capabilities (max 12) defined in Settings with drag-to-reorder. Competitor capability statuses (yes/no/partial/unknown) with evidence notes in competitor topic views. Comparison matrix modal on My Workspace page. AI capability detection during capture routing suggests status updates when captures mention capability names. Tables: `workspace_capabilities`, `competitor_capabilities`.
- **Database Schema:** Key tables include `user_profiles`, `workspaces` (with JSONB for categories/entities), `captures`, `briefs`, `topic_type_configs`, `product_context`, `battlecards`, `topic_dates`, `monitored_urls`, `workspace_context`, `feature_interest`, `feedback`, `workspace_capabilities`, and `competitor_capabilities`.
- **Auth and User Management:** Supabase integration for robust authentication and email verification via Resend, including a 3-step signup flow.
- **AI Integration:** Anthropic Claude is used for advanced natural language processing.
- **Null Safety & Error Handling:** Implemented with `ErrorBoundary`, database schema safety checks, and consistent null-safe access patterns for JSONB fields. Background jobs are non-blocking and robustly handle errors.

## External Dependencies
- **Supabase:** Authentication and user management.
- **Resend:** Transactional email services.
- **Replit AI Integrations (Anthropic Claude):** AI capabilities for content extraction, classification, transcription, and insight generation.
- **Perplexity AI:** Web research for automated competitor and topic intelligence gathering (via `server/perplexityService.ts`).
- **node-cron:** Schedules daily ambient search and weekly Monday digest emails.
- **PostgreSQL:** Primary database.
- **pdfjs-dist:** Server-side PDF text extraction for document captures (with regex fallback for resilience).
- **mammoth:** Server-side DOCX text extraction for document captures.
- **nodemailer:** Sends feedback notification emails. Requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars.