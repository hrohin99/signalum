# Intel App

AI-powered personal intelligence workspace.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Node.js/Express
- **Auth**: Supabase (email/password + Google OAuth)
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
- Vite exposes Supabase vars as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` via vite.config.ts

## API Routes
- `POST /api/extract` - Onboarding: extract categories/entities from user description (auth required)
- `POST /api/classify` - Classify captured content and match to workspace entity (auth required)
- `POST /api/transcribe` - Transcribe audio via Claude (auth required, multipart form)
- `POST /api/captures` - Save a confirmed capture (auth required)
- `POST /api/workspace` - Create user workspace (auth required)
- `GET /api/workspace/:userId` - Check if workspace exists (auth required)

## Database Tables
- `workspaces` - User workspaces with categories/entities (jsonb)
- `captures` - Captured content with entity/category match info

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
- `server/routes.ts` - API routes
- `server/storage.ts` - Database storage layer with Drizzle
- `shared/schema.ts` - Drizzle schemas and shared TypeScript types

## Visual Style
- White background, deep navy blue #1e3a5f accent
- Inter font
- Clean and minimal with lots of white space
