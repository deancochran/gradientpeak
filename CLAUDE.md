# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a **TurboFit** fitness tracking application built as a Turborepo monorepo with:
- **Native mobile app** (`apps/native`) using Expo/React Native with NativeWind for styling
- **Web dashboard** (`apps/web`) built with Next.js 15
- **Shared packages** (`packages/`) for TypeScript configs, ESLint rules, supabase schemas, and shared modules

### Key Technologies
- **Monorepo**: Turborepo with Bun as package manager
- **Mobile**: Expo 53, React Native, NativeWind, Expo Router
- **Web**: Next.js 15, Tailwind CSS, React 19
- **Database**: Supabase with complex fitness analytics schema
- **Auth**: Clerk with JWT template for Supabase integration
- **State**: Local-first mobile architecture with cloud sync architecture

## Development Commands

### Root Level Commands
```bash
# Install dependencies
bun install

# Start all apps in development
bun dev
turbo dev

# Build all apps
bun build
turbo build

# Lint all apps
bun lint
turbo lint

# Type check all apps
bun check-types
turbo check-types

# Format code
bun run format
```

### Mobile App (`apps/native/`)
```bash
cd apps/native

# Start Expo development server
bun start
npx expo start

# Run on specific platforms
bun android
bun ios
bun web

# Run linting
bun lint
npx expo lint

# Reset project (removes example code)
bun run reset-project
```

### Web App (`apps/web/`)
```bash
cd apps/web

# Development with Turbopack
bun dev

# Development with webhooks (for Clerk integration)
bun run dev:with-webhooks

# Build for production
bun build

# Start production server
bun start

# Type checking
bun check-types

# Linting
bun lint
```

## Database Architecture

### Core Schema (`packages/supabase/migrations/`)
The database uses a comprehensive fitness tracking schema with:

- **users**: User profiles linked to Clerk via `clerk_user_id`
- **activities**: Core f witness activities with detailed metrics
- **activity_segments**: GPS/time-based activity segments
- **user_metrics**: Aggregated performance metrics
- **user_achievements**: Gamification and milestone tracking
- **activity_analytics**: Cached analytics for performance
- **sync tables**: Device sync and conflict resolution

### Key Features
- **Row Level Security (RLS)** policies for all tables using Clerk JWT
- **Local-first sync**: Activities stored locally, synced to cloud
- **Analytics views**: Pre-calculated metrics for dashboard performance
- **File storage**: FIT file uploads via Supabase Storage
- **Achievement system**: Automated achievement detection

## Authentication Flow

### Clerk Configuration
1. **JWT Template**: Named `supabase` in Clerk dashboard with specific payload structure
2. **Environment Variables**: Both apps require `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
3. **Webhooks**: Web app handles user lifecycle via `/api/webhooks/clerk/route.ts`

### Supabase Integration
- **RLS Policies**: Use `auth.jwt()->> 'sub'` to match `clerk_user_id`
- **Token Refresh**: Mobile app uses `getToken({ template: "supabase" })` for API calls
- **Service Role**: Web webhooks use service role key for admin operations

## Critical Files

### Mobile App Configuration
- `apps/native/app/_layout.tsx`: Clerk provider setup with token cache
- `apps/native/lib/supabase.ts`: Database client with authenticated requests
- `apps/native/app/(tabs)/index.tsx`: Main dashboard with real data integration

### Web App Configuration  
- `apps/web/middleware.ts`: Clerk middleware for route protection
- `apps/web/app/api/webhooks/clerk/route.ts`: User lifecycle management
- `apps/web/app/layout.tsx`: Root layout with Clerk provider

### Environment Variables
Both apps require these environment variables:
```bash
# Mobile (.env in apps/native/)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_KEY=
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=

# Web (.env.local in apps/web/)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SECRET=
```

## Testing and Development

### Database Setup
1. **Apply Migrations**: Run SQL migrations in Supabase dashboard
2. **Verify RLS**: Ensure policies are active for all tables
3. **Test Data**: Use `generate_sample_activities()` function for testing
4. **Metrics**: Run `recalculate_user_metrics()` for analytics

### Local Development
1. **Start Services**: Run both apps with `turbo dev` from root
2. **Test Auth**: Sign up in mobile app, verify user creation in database
3. **Test Sync**: Create activities, verify sync status and analytics
4. **Webhooks**: Use ngrok for local webhook testing (see web app scripts)

## Common Issues

### Authentication Errors
- **PGRST301**: Usually JWT template misconfiguration or missing RLS policies
- **Token Issues**: Check environment variables and Clerk template name
- **Sync Failures**: Verify `clerk_user_id` matches JWT `sub` claim

### Performance Considerations
- **Metrics Calculation**: Use background jobs for `update_user_metrics()`
- **Analytics Processing**: Process activities asynchronously 
- **Index Usage**: Monitor query performance with pg_stat_statements
- **Cache Strategy**: Use materialized views for dashboard queries

## Deployment Notes

### Mobile App
- **Expo Build**: Use EAS Build for production builds
- **Environment**: Set production environment variables in Expo dashboard
- **Updates**: Use Expo Updates for OTA updates

### Web App
- **Vercel**: Recommended deployment platform
- **Environment**: Set all required environment variables
- **Webhooks**: Configure Clerk webhook URLs for production domain

The codebase implements a sophisticated local-first fitness tracking system with robust sync, analytics, and cross-platform capabilities.