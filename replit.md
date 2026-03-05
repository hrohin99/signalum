# Intel App

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
- `RESEND_API_KEY` - Resend API key for transactional emails
- `EMAIL_FROM` - Sender email address for transactional emails
- `SESSION_SECRET` - Used for signing JWT verification tokens
- Vite exposes Supabase vars as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` via vite.config.ts

## API Routes
- `POST /api/auth/signup` - Signup with email/password, sends branded verification email via Resend
- `GET /api/auth/verify-email` - Email verification link handler, validates JWT token
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
- `client/src/pages/auth.tsx` - Login/signup page
- `client/src/pages/onboarding.tsx` - Onboarding flow with AI extraction
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

## Visual Style
- White background, deep navy blue #1e3a5f accent
- Inter font
- Clean and minimal with lots of white space
