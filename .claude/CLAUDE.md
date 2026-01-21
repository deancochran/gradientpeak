# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GradientPeak is a sophisticated fitness tracking platform with a **local-first, JSON-centric architecture**. It consists of a mobile app (Expo/React Native) and web dashboard (Next.js), sharing business logic through a database-independent core package.

**Key Architectural Principles:**
- **JSON as Source of Truth** - All activity data stored as JSON objects in Supabase Storage
- **Local-First** - Mobile records activities locally (SQLite), syncs to cloud when available
- **Database-Independent Core** - `@repo/core` has zero database/ORM dependencies for maximum portability
- **Type Safety** - End-to-end TypeScript with shared schemas via Zod
- **Monorepo** - Turborepo with pnpm for fast builds and shared tooling

## Monorepo Structure

```
gradientpeak/
├── apps/
│   ├── mobile/          # Expo 54 + React Native 0.81.4
│   └── web/             # Next.js 15 + React 19
├── packages/
│   ├── core/            # Database-independent business logic (TSS, zones, validation)
│   ├── trpc/            # Type-safe API layer
│   ├── supabase/        # Supabase client and types
│   ├── eslint-config/   # Shared ESLint rules
│   └── typescript-config/ # Shared TypeScript config
```

## Common Commands

**Root-level commands** (from repository root):
```bash
pnpm dev              # Start all apps in development mode
pnpm build            # Build all apps and packages
pnpm lint             # Lint all code
pnpm check-types      # Type-check entire monorepo
pnpm format           # Format code with Prettier
pnpm watch            # Watch mode for type checking
```

**Mobile app** (`apps/mobile/`):
```bash
cd apps/mobile
pnpm dev              # Start Expo dev server with LAN access
pnpm android          # Run on Android device/emulator
pnpm ios              # Run on iOS device/simulator
pnpm lint             # Lint mobile code
pnpm check-types      # Type-check mobile app
```

**Web dashboard** (`apps/web/`):
```bash
cd apps/web
pnpm dev:next         # Start Next.js dev server with Turbopack
pnpm build            # Build for production with Turbopack
pnpm start            # Start production server
pnpm lint             # Lint web code
pnpm check-types      # Type-check web app
```

**Core package** (`packages/core/`):
```bash
cd packages/core
pnpm watch            # Watch mode for type checking and linting
pnpm check-types      # Type-check core package
pnpm lint             # Lint core package
```

## Activity Recording Architecture (Mobile)

### Service Lifecycle Management
The mobile app uses a **lifecycle-scoped service pattern** for activity recording:

- `ActivityRecorderService` is created only when navigating to `/record` screen
- Service automatically cleaned up when leaving the recording screen
- Each recording session gets a fresh service instance with clean state
- No global services - follows React's component lifecycle

**Location:** `apps/mobile/lib/services/ActivityRecorder/index.ts`

### Recording State Machine
States: `pending` → `ready` → `recording` → `paused` → `finished`

### Recording Hooks (Mobile)
The mobile app provides **7 granular hooks** for interacting with the recording service:

1. **`useActivityRecorder(profile)`** - Creates service instance (only in recording screen)
2. **`useRecordingState(service)`** - Subscribe to state changes
3. **`useCurrentReadings(service)`** - Live metrics (HR, power, speed, 1-4Hz updates)
4. **`useSessionStats(service)`** - Aggregated stats (distance, duration, TSS)
5. **`useSensors(service)`** - Bluetooth sensor management
6. **`usePlan(service)`** - Activity plan progress and guidance
7. **`useRecorderActions(service)`** - Actions (start, pause, resume, finish)

**Location:** `apps/mobile/lib/hooks/useActivityRecorder.ts`

**Key Performance Pattern:**
- Use **specific hooks** for specific data needs (avoid subscribing to everything)
- Each hook uses **event-driven subscriptions** for surgical re-renders
- Optimized for 1-4Hz sensor updates without UI lag

### Data Flow Pattern
```
1. Record Locally → SQLite stores JSON activity
2. Upload JSON → Supabase Storage (source of truth)
3. Create Metadata → Activity record in database
4. Generate Streams → Time-series data from JSON
5. Calculate Analytics → @repo/core processes metrics
```

## Core Package Architecture

**Critical:** `@repo/core` is **completely database-independent**. No Drizzle, Supabase, or ORM imports.

**Responsibilities:**
- Zod schemas for activities, profiles, activity plans (JSON validation)
- Performance calculations: TSS, normalized power, training zones, CTL/ATL/TSB
- Activity structure validation and compliance scoring
- Unit conversions and time utilities
- Pure TypeScript functions with zero async operations

**Testing Benefits:**
- No database mocking required
- Pure function testing with deterministic outputs
- Fast test execution (no I/O)
- Same calculations across mobile and web platforms

**Location:** `packages/core/`

**Key Exports:**
- `packages/core/schemas/` - Zod validation schemas
- `packages/core/calculations/` - Performance metrics algorithms
- `packages/core/utils/` - Shared utilities
- `packages/core/estimation/` - Training metrics estimation

## Mobile App Specific

### Stack
- **Expo SDK 54** with new architecture enabled
- **Expo Router v6** for file-based routing
- **NativeWind v4** for Tailwind CSS in React Native
- **React Native Reusables** - Shadcn/ui-inspired components
- **Zustand** for state management
- **React Query v5** with tRPC for server state

### Important Mobile Patterns

**Styling with NativeWind:**
- **No cascading styles** - Every `<Text>` must be styled individually
- Use semantic colors: `bg-background`, `text-foreground`, `text-muted-foreground`
- Platform-specific: `ios:pt-12 android:pt-6`
- Dark mode: React Navigation theme integration with `NAV_THEME`

**React Native Reusables Components:**
- Import from `@/components/ui/*`
- Use `PortalHost` in root layout for modals/dialogs
- Icons: Use `<Icon as={LucideIcon} />` pattern
- No data attributes - use props/state for variants

**Location:**
- Components: `apps/mobile/components/`
- Hooks: `apps/mobile/lib/hooks/`
- Services: `apps/mobile/lib/services/`
- Stores: `apps/mobile/lib/stores/`

### File System Storage
Activities recorded locally use **Expo FileSystem** with JSON storage:
- Fault-tolerant local storage before cloud sync
- JSON objects stored directly (no database encoding)
- Background sync when network available

## Web Dashboard Specific

### Stack
- **Next.js 15** with App Router and Turbopack
- **React 19** with Server Components
- **Tailwind CSS 4** with `@tailwindcss/postcss`
- **Shadcn/ui** components built on Radix UI
- **tRPC** with React Query for type-safe APIs

### Key Web Patterns
- Server Components by default for data fetching
- Client Components for interactivity (`"use client"`)
- React Query for client-side caching
- tRPC procedures in `packages/trpc/src/routers/`

**Location:**
- App routes: `apps/web/app/`
- Components: `apps/web/components/`
- Server actions: `apps/web/lib/actions/`

## tRPC API Layer

**Location:** `packages/trpc/src/routers/`

**Key Routers:**
- `activities.ts` - Activity CRUD and analytics
- `profiles.ts` - User profile management
- Additional routers for plans, analytics, etc.

**Pattern:**
- Procedures use `@repo/core` for calculations
- Database queries via Supabase client
- JSON parsing/validation with Zod schemas from core
- Type-safe client-server communication

## Testing Commands

**Note:** Testing infrastructure is configured but specific test commands depend on implementation:

```bash
# Turborepo test configuration exists for:
pnpm test              # Unit tests (when implemented)
pnpm test:integration  # Integration tests (when implemented)
pnpm test:e2e          # End-to-end tests (when implemented)
pnpm test:watch        # Watch mode (when implemented)
```

## Database & Cloud Services

### Supabase
- **PostgreSQL** database with Row Level Security
- **Storage** for JSON activity objects (source of truth)
- **Auth** with JWT tokens for mobile and web
- **Real-time** subscriptions for live updates (web)

**Client Setup:**
- Mobile: `@supabase/supabase-js` with AsyncStorage
- Web: `@supabase/ssr` for Server Components

### Data Model Key Points
- Activities stored as JSON in Supabase Storage first
- Metadata records reference JSON storage URLs
- Activity streams generated from JSON post-upload
- Profile extensions in `profiles` table linked to `auth.users`

## Critical Development Patterns

### 1. When Working with Activity Data
- Always process activities through `@repo/core` for calculations
- JSON is the source of truth (not database records)
- Validate activity structures with Zod schemas from core
- Never duplicate calculation logic - use core package functions

### 2. When Adding New Features
- Share types via `@repo/core` (not via tRPC or Supabase)
- Keep business logic in core package (database-independent)
- Use tRPC for API layer with proper error handling
- Follow local-first pattern: work offline, sync when available

### 3. Mobile Recording Development
- Use specific hooks for specific data (avoid over-subscribing)
- Service lifecycle tied to recording screen (automatic cleanup)
- Test with real Bluetooth sensors for accurate behavior
- Optimize for 1-4Hz sensor update frequency

### 4. Styling Consistency
- **Mobile:** Every Text element needs direct styling (no inheritance)
- **Web:** Use Shadcn/ui components, extend with Tailwind classes
- **Both:** Use semantic color tokens, support dark mode

### 5. Type Safety
- Import types from `@repo/core`, not from database layer
- Use Zod schemas for runtime validation
- Leverage tRPC for end-to-end type safety
- Keep TypeScript strict mode enabled

## Performance Considerations

### Mobile
- Use `React.memo` for frequently re-rendering components
- Virtualize long lists (activities, routes)
- Optimize Bluetooth sensor read frequency
- Background GPS tracking for outdoor activities

### Web
- Use Server Components for initial data fetching
- Implement pagination for large datasets
- Cache analytics calculations with React Query
- Use Suspense boundaries for progressive loading

## Important Files & Locations

### Configuration
- `turbo.json` - Turborepo task pipeline configuration
- `package.json` (root) - Monorepo scripts and workspace definitions
- `apps/mobile/app.config.ts` - Expo configuration
- `apps/web/next.config.ts` - Next.js configuration with Turbopack

### Shared Configuration
- `packages/typescript-config/` - Base TypeScript configuration
- `packages/eslint-config/` - Shared linting rules
- `.prettierrc` (root) - Code formatting rules

### Theme & Styling
- `apps/mobile/lib/theme.ts` - Mobile theme with NAV_THEME
- `apps/mobile/global.css` - CSS variables for NativeWind
- `apps/web/app/globals.css` - Web CSS variables and Tailwind

### Key Business Logic
- `packages/core/calculations/` - TSS, zones, power metrics
- `packages/core/schemas/` - Zod schemas for all data structures
- `packages/core/utils/` - Time, distance, unit conversions

## Authentication Flow

1. User authenticates via Supabase Auth (email/password or social)
2. JWT token stored in AsyncStorage (mobile) or cookies (web)
3. tRPC middleware validates token on API requests
4. Row Level Security enforces data access at database level
5. Profile created/fetched from `profiles` table (extends `auth.users`)

## Data Sync & Conflict Resolution

**Mobile → Cloud:**
- Activity recorded locally as JSON in SQLite
- JSON uploaded to Supabase Storage when online
- Metadata record created in database referencing JSON
- Streams generated from JSON for analytics

**Conflict Handling:**
- Timestamp-based conflict resolution
- JSON source of truth prevents data loss
- Core package validation ensures data integrity

## Context7 MCP Integration

The repository includes `.claude/rules/context7.md` for library documentation:
- Use Context7 MCP for library documentation queries
- Supabase library: `/supabase/supabase`
- Specify versions when needed (e.g., "Next.js 15 middleware")

## Common Gotchas

### Mobile Development
1. **Styling:** Text doesn't inherit styles - style every element directly
2. **PortalHost:** Must be in root layout for modals to work
3. **Service Lifecycle:** Recording service only exists in recording screen
4. **Background Location:** Requires task manager setup and permissions

### Web Development
1. **Server vs Client:** Default is Server Component - add `"use client"` for hooks
2. **Turbopack:** Some plugins may not work - check compatibility
3. **tRPC Context:** Ensure Supabase client passed to context for auth

### Core Package
1. **No Database Imports:** Keep core package completely database-free
2. **Pure Functions:** No async operations in core (except where absolutely necessary)
3. **JSON Validation:** Always validate with Zod schemas before processing

## Multi-Agent Research-Focused System

For complex features requiring expert analysis and informed decision-making, GradientPeak uses a **research-focused multi-agent system** where specialized agents act as domain experts and advisors.

**Core Philosophy:**
- **Research agents** investigate, analyze, and recommend (no code execution)
- **Execution agents** (Primary Interface & Delegating) implement based on research findings
- **All research saved** to `.claude/research/` for reuse across sessions
- **Persistent knowledge base** builds institutional memory over time

**When to Use:**
- Selecting new technologies or libraries
- Third-party service integrations
- Architectural decisions
- Performance optimization
- Complex testing strategies
- Documentation planning

**When NOT to Use:**
- Simple bug fixes
- Minor updates
- Obvious implementations
- Style tweaks

**How to Invoke:**

*Explicit research:*
```
"Research Strava API options before implementing integration"
"Analyze FIT file parsers and recommend best option"
"Conduct performance audit on recording service"
```

*Automatic research trigger:*
```
"Add Strava integration"
→ System recognizes complexity, commissions research automatically

"Optimize recording service"
→ Triggers Performance Specialist research first
```

**Available Research Agents:**
1. **Architecture Research Expert** - System design, component placement, architectural patterns
2. **Technology Research Expert** - Library selection, API analysis, version compatibility
3. **Quality Assurance Advisor** - Testing strategies, coverage requirements, edge cases
4. **Integration Analyst** - Third-party APIs, OAuth flows, data mapping
5. **Performance Specialist** - Bottleneck identification, optimization strategies
6. **Documentation Strategist** - Documentation plans, JSDoc specifications, content structure

**What Happens:**
1. **Research Phase**: Specialized agents investigate and save findings to `.claude/research/[domain]/`
2. **Synthesis**: Delegating Agent reviews and consolidates multi-domain research
3. **Execution**: Primary Interface or Delegating Agent implements following research recommendations
4. **Validation**: Implementation validated against research specifications
5. **Knowledge Base**: Research indexed for future reference

**Benefits:**
- ✅ **Reduced token consumption** - Research saved to files, not context
- ✅ **Persistent knowledge** - Findings reusable across sessions
- ✅ **Better decisions** - Multiple expert perspectives synthesized
- ✅ **Audit trail** - Traceable from requirement → research → implementation
- ✅ **No redundancy** - Past research referenced instead of repeated

**Research Documents Location:** `.claude/research/`
```
.claude/research/
├── architecture/     # System design, architectural decisions
├── technology/       # Library research, API analysis
├── quality/          # Testing strategies, QA recommendations
├── integration/      # Third-party API integration plans
├── performance/      # Optimization recommendations
├── documentation/    # Documentation plans and strategies
└── index.md         # Master index of all research
```

**Full Documentation:** See `.claude/rules/agent-hierarchy.md` for complete agent roles, research templates, access control, and workflow examples.

**Note:** Simple tasks use direct implementation without research overhead. Research is commissioned automatically for complex/unfamiliar domains.

## Getting Help

- Mobile App: See `apps/mobile/README.md` for detailed mobile architecture
- Web Dashboard: See `apps/web/README.md` for Next.js patterns
- Core Package: Review `packages/core/schemas/` for data structures
- Root README: See `README.md` for complete architecture overview
- Multi-Agent System: See `.claude/rules/agent-hierarchy.md` for complex project workflows

## Version Information

- **Node.js:** 18+ required (pnpm 10.20.0 as package manager)
- **Expo SDK:** 54
- **React Native:** 0.81.4
- **Next.js:** 15
- **React:** 19
- **TypeScript:** 5.9.2

## Additional Notes

- Use `pnpm` for all package management (configured in `.npmrc`)
- Turborepo caches build outputs for fast rebuilds
- Git hooks may enforce linting and type checking (check `.husky/` if exists)
- Environment variables for Supabase required in both mobile and web apps
