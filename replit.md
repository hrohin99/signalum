# Watchloom

## Overview
Watchloom is an AI-powered personal intelligence workspace designed to help users capture, classify, and organize information efficiently. It transforms unstructured data into actionable intelligence through intelligent content capture, AI-driven classification, and personalized daily briefs. The project aims to empower users to stay informed, understand market trends, manage projects, and gain competitive insights.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
I do not want changes made to the `client/src/pages/auth.tsx` file.

## System Architecture
Watchloom features a React, Vite, and Tailwind CSS frontend with shadcn/ui components, using a white background and deep navy blue (`#1e3a5f`) accents. DM Sans is used for marketing pages, and Inter for the authenticated dashboard. The backend is built with Node.js/Express. Supabase handles authentication via email/password and Google OAuth, with Resend for transactional emails. AI capabilities, including entity extraction, content classification, transcription, and insight generation, are powered by Replit AI Integrations (Anthropic Claude). Data is stored in a PostgreSQL database managed by Drizzle ORM.

**Key Features:**
- **Intelligent Capture System:** Supports various input types (text, voice, URL, document) with AI classification and multi-topic routing. When content spans multiple topics, the AI splits it and routes each piece to the correct topic with individual confirm/skip controls and a "Confirm all" option. It can also infer user intent to pre-fill topic creation forms.
- **Onboarding Flow:** Guides new users through initial setup, extracting categories and entities using AI, and performs asynchronous historical data seeding.
- **Dynamic Dashboard:** Provides navigation to "My Workspace," "Capture," "Inbox," "Daily Brief," and "Settings."
- **Workspace Management:** Organizes intelligence into categories and "Topics" (entities), including deadline indicators and features for creating categories and topics.
- **Daily Briefs:** AI-generated summaries of key intelligence, including an "On Your Radar" section.
- **Topic View:** Detailed full-screen view for topics with AI summaries, widgets (e.g., battlecards), and an updates feed.
- **Product Context:** Allows users to define product context for personalized AI insights, especially for battlecards.
- **Battlecards:** AI-enhanced competitive analysis tools with auto-fill and manual update capabilities.
- **Key Dates Management:** Tracks and manages specific dates/deadlines for topics.
- **Topic Type-Specific Behavior:** Provides contextual prompts and automated date modals for regulation, risk, and event topics.
- **Ambient Search System:** Schedules daily web searches using Perplexity AI for all tenants, deduplicating findings and creating captures and notifications. Supports manual, per-topic searches and customizable search settings.
- **Sibling Topic Inference:** AI-powered disambiguation for new topics based on existing workspace context or category names, determining domain, confidence, and reasoning.
- **Confidence Indicator:** Displays the scope and confidence of AI summaries in the UI.
- **Disambiguation UI:** Provides banners and modals for confirming or refining AI-inferred contexts and selecting specific aspects for topic focus.
- **Retroactive Disambiguation Migration:** A background migration process to apply disambiguation contexts to existing entities.

**Core Technical Implementations:**
- **API-driven communication:** RESTful API endpoints handle all frontend-backend interactions.
- **Database Schema:** Key tables include `user_profiles`, `workspaces` (with JSONB for categories/entities), `captures`, `briefs`, `topic_type_configs`, `product_context`, `battlecards`, `topic_dates`, and `workspace_context`.
- **Auth and User Management:** Supabase integration for robust authentication and email verification via Resend, including a 3-step signup flow.
- **AI Integration:** Anthropic Claude is used for advanced natural language processing.
- **Null Safety & Error Handling:** Implemented with `ErrorBoundary`, database schema safety checks, and consistent null-safe access patterns for JSONB fields. Background jobs are non-blocking and robustly handle errors.

## External Dependencies
- **Supabase:** Authentication and user management.
- **Resend:** Transactional email services.
- **Replit AI Integrations (Anthropic Claude):** AI capabilities for content extraction, classification, transcription, and insight generation.
- **Perplexity AI:** Web research for automated competitor and topic intelligence gathering (via `server/perplexityService.ts`).
- **node-cron:** Schedules daily ambient search.
- **PostgreSQL:** Primary database.
- **pdfjs-dist:** Server-side PDF text extraction for document captures (with regex fallback for resilience).
- **mammoth:** Server-side DOCX text extraction for document captures.