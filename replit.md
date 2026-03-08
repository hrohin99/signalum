# Watchloom

## Overview
Watchloom is an AI-powered personal intelligence workspace designed to capture, classify, and organize unstructured information into actionable intelligence. It provides intelligent content capture, AI-driven classification, and personalized daily briefs to help users stay informed, understand market trends, manage projects, and gain competitive insights.

## User Preferences
I want iterative development.
I prefer detailed explanations.
I want to be asked before making major changes.
I do not want changes made to the `client/src/pages/auth.tsx` file.

## System Architecture
Watchloom features a React, Vite, and Tailwind CSS frontend with shadcn/ui components, utilizing a white background with deep navy blue (`#1e3a5f`) accents. DM Sans and Inter fonts are used for marketing pages and the authenticated dashboard, respectively. The landing page includes CSS-only animations and an Intersection Observer for dynamic visual effects.

The backend is built with Node.js/Express. Supabase handles authentication via email/password and Google OAuth, with Resend for transactional emails. AI capabilities, including entity extraction, content classification, transcription, and insight generation, are powered by Replit AI Integrations (Anthropic Claude). Data is stored in a PostgreSQL database managed by Drizzle ORM.

**Key Features:**
- **Intelligent Capture System:** Supports diverse input types (text, voice, URL, document) with AI classification, multi-topic routing, and intent inference.
- **Onboarding Flow:** Guides new users through initial setup, AI-driven category/entity extraction, and historical data seeding.
- **Dynamic Dashboard & Workspace Management:** Provides navigation, organizes intelligence into categories and topics, and indicates deadlines.
- **Daily Briefs:** AI-generated summaries with an "On Your Radar" section.
- **Topic View:** Detailed full-screen topic view with AI summaries, widgets (e.g., battlecards), and an updates feed with signal-based visual hierarchy.
- **Product Context & Battlecards:** Allows users to define product context for personalized AI insights and provides AI-enhanced competitive analysis.
- **Key Dates Management:** Tracks deadlines and automatically extracts dates from content for actionable alerts.
- **Ambient Search System:** Schedules daily web searches using Perplexity AI, deduplicates findings, and creates captures and notifications, including competitor hiring signals.
- **Sibling Topic Inference & Disambiguation:** AI-powered disambiguation for new topics based on existing context and UI for confirming or refining AI inferences.
- **Monitored URLs:** Allows tracking of specific URLs for competitor topics with configurable check frequencies.
- **Admin Dashboard:** A private route for administrators to view feedback, feature interest, and user activity.
- **Feedback Widget:** A persistent widget for users to submit feedback.
- **Weekly Digest Email:** Optional AI-generated weekly summary emails.
- **Capabilities System:** User-defined market capabilities tracked across competitors, with AI assistance for status updates.
- **Strategic Direction:** AI-generated strategic analyses for competitor topics, synthesizing insights and providing personalized recommendations.
- **Onboarding Education Layer:** A multi-component frontend onboarding system including a welcome modal, coach marks for guided tours, and contextual topic banners.
- **Pricing Intelligence:** Dynamic multi-model pricing tracking for competitor topics, with AI detection of pricing models and signals.
- **Silent Entity Classification:** Background AI classification of entities by type (e.g., local_business, regulation) and pricing model to drive downstream behavior.
- **Website Intelligence Extraction:** Automatic website scraping using Jina Reader to extract structured intelligence from competitor websites, generating captures and triggering AI summary regeneration.

## External Dependencies
- **Supabase:** Authentication and user management.
- **Resend:** Transactional email services.
- **Replit AI Integrations (Anthropic Claude):** Core AI capabilities (content extraction, classification, transcription, insight generation).
- **Perplexity AI:** Web research for automated intelligence gathering.
- **node-cron:** Scheduling daily ambient searches and weekly digest emails.
- **PostgreSQL:** Primary database.
- **pdfjs-dist:** Server-side PDF text extraction.
- **mammoth:** Server-side DOCX text extraction.
- **nodemailer:** Sending feedback notification emails.