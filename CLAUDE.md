# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Root level development:**
```bash
bun dev                    # Start all development servers
bun build                  # Build all applications and packages
bun lint                   # Lint all code with shared config
bun format                 # Format all code with Prettier
bun check-types            # Type check entire monorepo
bun test                   # Run all tests
bun test:unit              # Run unit tests only
bun test:integration       # Run integration tests
bun test:e2e               # Run end-to-end tests
bun test:e2e:web          # Run web E2E tests
bun test:e2e:mobile       # Run mobile E2E tests
bun test:watch            # Run tests in watch mode
```

**Mobile app (from apps/mobile/):**
```bash
bun dev                    # Start Expo development server
bun ios                    # Run on iOS simulator
bun android               # Run on Android emulator
```

**Core package development:**
```bash
cd packages/core && bun test    # Test core package (database-independent)
```

## Architecture

**TurboFit** is a Turborepo monorepo with a **local-first, offline-capable** fitness tracking platform.

### Package Structure

```
turbofit/
├── apps/
│   ├── mobile/          # React Native + Expo app (offline-first)
│   └── web/             # Next.js dashboard (real-time analytics)
├── packages/
│   ├── core/            # 🌟 Database-independent business logic
│   ├── trpc/            # Type-safe API layer
│   ├── supabase/        # Database types and client
│   ├── eslint-config/   # Shared linting rules
│   └── typescript-config/ # Shared TypeScript config
```

### Core Principles

1. **Database-Independent Core**: The `@repo/core` package contains **zero database dependencies**. All business logic, calculations, and validation schemas are pure TypeScript.

2. **JSON-First Data Storage**: Activities are stored as JSON objects (source of truth) with derived metadata for queries.

3. **Shared Type Safety**: All apps import types and schemas from `@repo/core` - never define app-specific interfaces.

4. **Local-First Mobile**: Mobile app works offline using SQLite, syncing to Supabase when connected.

### Key Architecture Patterns

**Core Package Design:**
- **Zero Dependencies**: No database, ORM, or platform-specific code
- **Pure Functions**: All calculations can be tested without mocking
- **Zod Schemas**: JSON validation and TypeScript type generation
- **Cross-Platform**: Same algorithms on mobile and web

**Data Flow:**
1. **Record** → Local SQLite stores complete activity as JSON
2. **Upload** → JSON uploaded to Supabase Storage (single source of truth)
3. **Process** → Metadata extracted locally and synced
4. **Analytics** → Core package processes JSON for performance calculations

**API Layer (tRPC):**
- Type-safe procedures shared between mobile and web
- Authentication via Supabase sessions
- React Query integration for caching and optimistic updates

### Technology Stack

| Layer | Mobile | Web | Shared |
|-------|--------|-----|---------|
| **Framework** | Expo 54 + RN 0.81.4 | Next.js 15 + React 19 | - |
| **Business Logic** | `@repo/core` | `@repo/core` | Pure TypeScript |
| **API** | `@repo/trpc` + React Query | `@repo/trpc` + React Query | Type-safe procedures |
| **State** | Zustand + AsyncStorage | Zustand + React Query | Persistent patterns |
| **Storage** | SQLite + Supabase sync | Supabase PostgreSQL | JSON data structures |
| **Styling** | NativeWind v4 | Tailwind + shadcn/ui | Design consistency |
| **Navigation** | Expo Router v6 | Next.js App Router | Type-safe routing |

### Development Workflow

1. **Context First**: Always check existing code patterns before implementing
2. **Core Package**: Put shared logic in `@repo/core`, not in individual apps
3. **Type Safety**: Import types from `@repo/core` or `@repo/supabase`
4. **Testing**: Run `bun lint && bun check-types` before committing
5. **JSON Validation**: Use Zod schemas from core package for all data structures

### Common Patterns

**Using Core Package:**
```typescript
// ✅ Correct - use core package for calculations
import { calculateTrainingZones, validateActivity } from '@repo/core';

// ✅ Correct - use core types
import type { Activity, Profile } from '@repo/core';

// ❌ Avoid - don't duplicate logic in apps
const calculateZones = (threshold: number) => { ... }
```

**Data Validation:**
```typescript
// ✅ Use Zod schemas from core
import { ActivitySchema } from '@repo/core';
const result = ActivitySchema.parse(rawData);

// ❌ Don't create app-specific validation
const validateActivity = (data: any) => { ... }
```

**API Procedures:**
```typescript
// tRPC procedures in packages/trpc/src/routers/
export const activityRouter = router({
  create: protectedProcedure
    .input(ActivitySchema) // From @repo/core
    .mutation(async ({ input, ctx }) => {
      // Use core package for validation and calculations
      const validated = validateActivity(input);
      // Database operations here
    })
});
```

### Testing Strategy

- **Core Package**: Unit tests for pure functions (no database mocking required)
- **Integration**: Test API procedures with actual database
- **E2E**: Complete user flows using Playwright (web) and Maestro (mobile)
- **Performance**: JSON processing and calculation benchmarks

### Mobile-Specific Notes

- **Offline Recording**: SQLite stores activities locally during recording
- **Background Sync**: Uploads happen when network is available
- **Expo Development**: Uses development build for native debugging
- **BLE Integration**: React Native BLE PLX for device connectivity

### Web-Specific Notes

- **Real-time Analytics**: Supabase subscriptions for live updates
- **Server Actions**: Next.js server components with tRPC
- **Component Library**: shadcn/ui components with Tailwind
- **Deployment**: Vercel with automatic deployments

## Key Files to Understand

- `turbo.json` - Monorepo build configuration and task dependencies
- `packages/core/index.ts` - Entry point for shared business logic
- `packages/trpc/src/routers/` - API endpoint definitions
- `packages/core/types/` - Shared TypeScript interfaces
- `packages/core/calculations/` - Performance calculation algorithms
- `apps/mobile/src/app/` - Mobile app routing structure (Expo Router)
- `apps/web/src/app/` - Web app routing structure (Next.js App Router)