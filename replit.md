# Intel App

AI-powered personal intelligence workspace.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Node.js/Express
- **Auth**: Supabase (email/password + Google OAuth)
- **AI**: Anthropic Claude API for entity extraction
- **Routing**: wouter (frontend), Express routes (backend)

## Key Features
1. **Supabase Auth** - Email/password signup/login, Google OAuth
2. **Onboarding Flow** - Free text input → Claude API extraction → Category/entity confirmation → Workspace creation
3. **Dashboard** - Sidebar navigation with Capture, Inbox, Intelligence Map, Daily Brief, Settings pages

## Environment Variables
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `ANTHROPIC_API_KEY` - Claude API key
- Vite exposes Supabase vars as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` via vite.config.ts

## File Structure
- `client/src/lib/supabase.ts` - Supabase client initialization
- `client/src/lib/auth-context.tsx` - Auth provider with Supabase auth hooks
- `client/src/pages/auth.tsx` - Login/signup page
- `client/src/pages/onboarding.tsx` - Onboarding flow with AI extraction
- `client/src/pages/dashboard.tsx` - Main dashboard layout with sidebar
- `client/src/pages/capture.tsx` - Capture page (shell)
- `client/src/pages/inbox.tsx` - Inbox page (empty state)
- `client/src/pages/map.tsx` - Intelligence Map page (empty state)
- `client/src/pages/brief.tsx` - Daily Brief page (empty state)
- `client/src/pages/settings.tsx` - Settings/account page
- `client/src/components/app-sidebar.tsx` - Sidebar navigation component
- `server/routes.ts` - API routes (/api/extract, /api/workspace)
- `shared/schema.ts` - Shared TypeScript types

## Visual Style
- White background, deep navy blue #1e3a5f accent
- Inter font
- Clean and minimal with lots of white space

## Data Storage
- Workspaces stored in-memory on the server (Map)
- Auth handled entirely by Supabase client-side SDK
