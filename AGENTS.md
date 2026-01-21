# GradientPeak - Agent Guidelines

This file provides guidance for agentic coding agents operating in the GradientPeak repository.

## Build Commands

**Root-level:**

```bash
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all apps
pnpm lint             # Lint all code
pnpm check-types      # Type-check entire monorepo
pnpm format           # Format code with Prettier
```

**Single app/package:**

```bash
cd apps/mobile && pnpm dev              # Mobile dev server
cd apps/web && pnpm dev:next            # Next.js dev with Turbopack
cd packages/core && pnpm watch          # Watch mode for core
```

**Testing:**

```bash
pnpm test                                 # Run all tests
pnpm --filter @repo/core test            # Core package tests
pnpm --filter mobile test                # Mobile tests
pnpm --filter web test                   # Web tests

# Run single test file
pnpm --filter @repo/core test tss.test.ts
cd packages/core && pnpm test tss.test.ts
```

## Code Style Guidelines

### Imports

- Use named exports (preferred over default exports)
- Use type-only imports for types: `import type { Activity } from '@repo/core'`
- Group imports: React → third-party → internal → relative
- Use workspace aliases: `@/components/*`, `@repo/core`, `@repo/trpc`

### Formatting

- Use Prettier: `pnpm format` (runs on `**/*.{ts,tsx,md}`)
- No semicolons in TypeScript
- Single quotes for strings
- Trailing commas in multi-line objects/arrays

### TypeScript

- **Strict mode required** - no `any`, no implicit `any`
- No type assertions; use Zod validation or type guards
- Explicit return types for public functions
- Use union types for simple choices: `type ActivityType = 'run' | 'bike' | 'swim' | 'other'`
- Use interfaces for objects, type aliases for unions/primitives
- Use `unknown` instead of `any` when type is truly unknown

### Naming Conventions

- **Interfaces/Types**: PascalCase (`Activity`, `ActivityType`)
- **Functions/Variables**: camelCase (`calculateTSS`, `maxHeartRate`)
- **Constants**: SCREAMING_SNAKE_CASE for true constants (`MAX_HEART_RATE`), camelCase for config objects
- **Files**: kebab-case (`activity-card.tsx`), not camelCase/PascalCase
- **Components**: PascalCase (`ActivityCard.tsx`)

### Error Handling

- Use typed errors: `throw new Error('message')`
- Handle async errors with try/catch
- Propagate errors with context: `throw new Error(\`Failed to fetch: \${error.message}\`)`
- tRPC: throw `TRPCError` with appropriate code (`NOT_FOUND`, `BAD_REQUEST`, etc.)
- Never swallow errors silently

### Component Patterns

**Mobile (React Native):**

- Every `<Text>` must be styled directly (no inheritance)
- Use semantic colors: `bg-background`, `text-foreground`
- Platform variants: `ios:pt-12 android:pt-6`
- Use specific recording hooks (`useCurrentReadings`, not all events)
- Use `activitySelectionStore` for cross-screen navigation

**Web (Next.js):**

- Default to Server Components
- Add `"use client"` only for hooks/event handlers
- Use shadcn/ui components from `@/components/ui/*`
- Use tRPC with React Query caching (`staleTime`, `refetchOnWindowFocus`)
- Handle loading/error states for all data fetching

### Core Package Rules

- **Never import**: `@supabase/*`, `drizzle-orm`, `prisma`, `@repo/trpc`, `react`
- Pure functions only (no side effects, no async except rare cases)
- All inputs as parameters
- JSDoc documentation for public functions
- 100% test coverage for calculations

### File Structure

```
apps/mobile/    # Expo 54 + React Native 0.81.4
apps/web/       # Next.js 15 + React 19
packages/core/  # Database-independent business logic
packages/trpc/  # Type-safe API layer
packages/supabase/ # Supabase client
```

## Key Architectural Principles

1. **JSON as Source of Truth** - Activity data stored as JSON in Supabase Storage
2. **Local-First Mobile** - Record locally (SQLite), sync when online
3. **Database-Independent Core** - `@repo/core` has zero database dependencies
4. **Type Safety** - End-to-end TypeScript with Zod schemas

## Critical Gotchas

- Mobile: Text doesn't inherit styles; style every Text element directly
- Mobile: PortalHost required in root layout for modals
- Web: Default is Server Component; add "use client" for interactivity
- Core package: No database imports, pure functions only
