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
- **Onboarding Flow:** Guides new users through initial setup, extracting categories and entities from their descriptions using AI.
- **Dynamic Dashboard:** Features a sidebar for navigation to "My Workspace," "Capture," "Inbox," "Daily Brief," and "Settings" pages.
- **Workspace Management:** Organizes intelligence into categories and "Topics" (user-facing term for entities), displaying deadline indicators (red for overdue, amber for 7 days, yellow for 30 days) and an "Empty Category Nudge" for easy topic creation.
- **Daily Briefs:** AI-generated summaries of key intelligence, including an "On Your Radar" section for urgent topics.
- **Topic View:** Provides a detailed, full-screen view for each topic with AI summaries, widgets (e.g., battlecards for competitors), and an updates feed.
- **Product Context:** Allows users to define their product's context for personalized AI insights, particularly for battlecards.
- **Battlecards:** AI-enhanced competitive analysis tools for competitor topics, supporting auto-fill and manual updates.
- **Key Dates Management:** Allows users to track and manage specific dates/deadlines associated with topics.

**Core Technical Implementations:**
- **API-driven communication:** A comprehensive set of RESTful API endpoints handles all interactions between the frontend and backend, including authentication, data extraction, classification, capture, and workspace management.
- **Database Schema:** `user_profiles`, `workspaces` (with JSONB for categories/entities), `captures`, `briefs`, `topic_type_configs` (seeded with system defaults), `product_context`, `battlecards`, and `topic_dates` tables are central to data storage.
- **Auth and User Management:** Integrates Supabase for robust authentication, including email verification via Resend. It supports a pre-auth flow with a 3-step signup process and handles redirects post-verification.
- **AI Integration:** Utilizes Anthropic Claude for advanced natural language processing tasks, ensuring intelligent data handling.

## External Dependencies
- **Supabase:** Authentication and user management.
- **Resend:** Transactional email services for user verification.
- **Replit AI Integrations (Anthropic Claude):** AI capabilities for content extraction, classification, transcription, and insight generation.
- **PostgreSQL:** Primary database.