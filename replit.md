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
2. **Onboarding Flow** - Free text input → Claude API extraction → Category/entity confirmation → Workspace creation
3. **Dashboard** - Sidebar navigation with Capture, Inbox, Intelligence Map, Daily Brief, Settings pages
4. **Capture System** - Four capture types (Text, Voice, URL, Document) with AI classification and entity routing

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
- `POST /api/auth/signup` - Signup via Supabase Admin API (no Supabase email), sends branded verification email via Resend
- `GET /api/auth/verify-email` - Email verification link handler, validates JWT token and confirms email in Supabase
- `POST /api/extract` - Onboarding: extract categories/entities from user description (auth required)
- `POST /api/classify` - Classify captured content and match to workspace entity (auth required)
- `POST /api/transcribe` - Transcribe audio via Claude (auth required, multipart form)
- `POST /api/captures` - Save a confirmed capture (auth required)
- `GET /api/captures` - List all captures for authenticated user (auth required)
- `POST /api/entity-summary` - AI-generated summary for an entity based on captured intel (auth required)
- `POST /api/add-entity` - Add a new entity to an existing category (auth required)
- `POST /api/workspace` - Create user workspace (auth required)
- `GET /api/workspace/:userId` - Check if workspace exists (auth required)
- `POST /api/briefs/generate` - Generate a daily brief using Claude from all captures + entity data (auth required)
- `GET /api/briefs` - List all briefs for authenticated user (auth required)

## Database Tables
- `workspaces` - User workspaces with categories/entities (jsonb)
- `captures` - Captured content with entity/category match info
- `briefs` - AI-generated daily intelligence briefs with content, capture/entity counts

## File Structure
- `client/src/lib/supabase.ts` - Supabase client initialization
- `client/src/lib/auth-context.tsx` - Auth provider with Supabase auth hooks
- `client/src/pages/landing.tsx` - Public landing page (hero with pill badge, "the real problem" section with comparison card, scrolling tag strip, how-it-works 3-column, social proof testimonials, track-anything 6-card showcase, "coming soon" Ask Watchloom teaser with waitlist form, final CTA, footer)
- `client/src/pages/signup.tsx` - 3-step signup flow (role → tracking text → account creation)
- `client/src/pages/signin.tsx` - Simple sign-in page
- `client/src/pages/auth.tsx` - Legacy auth page (no longer routed, kept for reference)
- `client/src/pages/onboarding.tsx` - Onboarding flow with AI extraction (shown to users who skip 3-step signup)
- `client/src/pages/dashboard.tsx` - Main dashboard layout with sidebar
- `client/src/pages/capture.tsx` - Full capture page with 4 input types + AI classification
- `client/src/pages/inbox.tsx` - Inbox page (empty state)
- `client/src/pages/map.tsx` - Intelligence Map page (empty state)
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
- Users who complete the 3-step signup have their role + tracking text stored in localStorage as `pendingOnboarding`
- After email verification and sign-in, App.tsx auto-runs AI extraction and workspace creation from the stored context, skipping the manual onboarding page
- Users who sign in without prior signup context (e.g. Google OAuth without going through signup flow) see the standard onboarding page

## Visual Style
- White background, deep navy blue #1e3a5f accent
- DM Sans font for landing/signup/signin pages, Inter font for authenticated dashboard
- Clean and minimal with lots of white space
