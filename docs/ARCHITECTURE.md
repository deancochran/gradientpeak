# GradientPeak Architecture

Comprehensive architecture documentation for the GradientPeak fitness tracking platform.

## Core Architecture Principles

### 1. Database-Independent Core Package

The `@repo/core` package is the heart of GradientPeak with **zero database dependencies**:

- Pure TypeScript functions with no async operations
- Zod schemas for all data validation
- Complete performance calculations (TSS, power zones, training load)
- Shared across mobile, web, and any future platforms
- 100% testable without mocks

**Example:**
```typescript
import { calculateTSS, validateActivity, getIntensityZone } from '@repo/core';

// Pure function calls - no database required
const tss = calculateTSS(startedAt, endedAt, powerStream, profile);
const zone = getIntensityZone(intensityFactor);
```

### 2. JSON-First Data Storage

All activity data stored as JSON in Supabase Storage as the single source of truth:

**Data Flow:**
```
Local Recording → SQLite (JSON) → Upload → Supabase Storage (source of truth)
                                         ↓
                        Metadata Generated → Activity Records
                                         ↓
                        Stream Processing → Activity Streams
                                         ↓
                        Core Package → Performance Analytics
```

**Benefits:**
- Complete activity data preserved
- Platform-independent format
- Easy export/import
- Enables offline-first architecture

### 3. Type Safety Chain

End-to-end type safety from database to UI:

```
Database Schema → @repo/supabase (generated types)
                        ↓
                  @repo/core (Zod schemas)
                        ↓
                  @repo/trpc (type-safe APIs)
                        ↓
                  Apps (fully typed components)
```

## Package Structure

### @repo/core - Business Logic

**Purpose:** Platform-agnostic calculations and validation

**Structure:**
```
packages/core/
├── calculations.ts         # Performance calculations
├── constants.ts           # Activity types, metrics, zones
├── database-types.ts      # Shared type definitions
├── schemas/               # Zod validation schemas
│   ├── activity_payload.ts
│   ├── activity_plan_structure.ts
│   ├── planned_activity.ts
│   └── training_plan_structure.ts
└── samples/               # Sample data generators
```

**Key Functions:**
- `calculateTSS()` - Training Stress Score
- `calculateNormalizedPower()` - 30s rolling average power
- `calculateIntensityFactor()` - Relative intensity (NP/FTP)
- `calculateCTL/ATL/TSB()` - Training load metrics
- `calculateHrZones()` - 5 HR zones based on threshold
- `calculatePowerZones()` - 7 power zones based on FTP
- `getIntensityZone()` - 7-zone classification system

### @repo/trpc - API Layer

**Purpose:** Type-safe client-server communication

**Structure:**
```
packages/trpc/src/
├── routers/
│   ├── activities.ts          # Activity CRUD + analysis
│   ├── activity_plans.ts      # Plan library management
│   ├── planned_activities.ts  # Activity scheduling
│   ├── training_plans.ts      # Training plan management
│   ├── profiles.ts            # User profile management
│   ├── auth.ts                # Authentication
│   └── integrations.ts        # External service integrations
├── context.ts                 # Request context + auth
├── trpc.ts                    # tRPC setup
└── server.ts                  # Router composition
```

**Key Endpoints:**
- `activities.list` - Query activities by date range
- `activities.update` - Set IF/TSS post-completion
- `trainingPlans.getIntensityDistribution` - 7-zone TSS-weighted analysis
- `trainingPlans.getCurrentStatus` - CTL/ATL/TSB calculation
- `plannedActivities.create` - Schedule activity

### @repo/supabase - Database Layer

**Purpose:** Database schema and type generation

**Structure:**
```
packages/supabase/
├── database.types.ts      # Generated TypeScript types
├── migrations/            # Database migrations
├── schemas/               # RLS policies
└── config.toml            # Supabase configuration
```

**Key Tables:**
- `profiles` - Extended user profiles (threshold_hr, ftp, weight_kg)
- `activities` - Activity metadata + IF/TSS
- `activity_streams` - Time-series metrics (compressed)
- `activity_plans` - Reusable activity templates
- `planned_activities` - Scheduled activities
- `training_plans` - Long-term training structures
- `profile_plans` - User-specific training plans

**Type Generation:**
```bash
cd packages/supabase
npm run update-types  # Generates types + Zod schemas
```

## Training Load System

### CTL/ATL/TSB Calculations

**Chronic Training Load (CTL)** - 42-day exponential weighted moving average:
```typescript
CTL = previousCTL + α × (todayTSS - previousCTL)
α = 2 / (42 + 1)
```

**Acute Training Load (ATL)** - 7-day exponential weighted moving average:
```typescript
ATL = previousATL + α × (todayTSS - previousATL)
α = 2 / (7 + 1)
```

**Training Stress Balance (TSB)** - Form/freshness indicator:
```typescript
TSB = CTL - ATL
```

**Interpretation:**
- TSB > 25: Very fresh (optimal for racing)
- TSB 5-25: Good form (optimal for hard training)
- TSB -10 to 5: Neutral (normal training)
- TSB -30 to -10: Tired (building fitness)
- TSB < -30: Overreaching (risk zone)

## Intensity System

### 7-Zone Classification

**After-the-fact measurement** based on completed activity Intensity Factor (IF):

| Zone | IF Range | Name | Description |
|------|----------|------|-------------|
| Z1 | < 0.55 | Recovery | Active recovery |
| Z2 | 0.55-0.75 | Endurance | Aerobic base |
| Z3 | 0.75-0.85 | Tempo | Sweet spot |
| Z4 | 0.85-0.95 | Threshold | Sustained FTP efforts |
| Z5 | 0.95-1.05 | VO2max | Race pace |
| Z6 | 1.05-1.15 | Anaerobic | Supra-threshold |
| Z7 | ≥ 1.15 | Neuromuscular | Max effort/sprints |

**Calculation Flow:**
```typescript
// 1. Calculate Normalized Power
const np = calculateNormalizedPower(powerStream);

// 2. Calculate Intensity Factor
const if_ = calculateTrainingIntensityFactor(np, ftp);

// 3. Classify Zone
const zone = getTrainingIntensityZone(if_);
```

### Power Zones (% FTP)

| Zone | FTP % | Name | Training Focus |
|------|-------|------|----------------|
| Z1 | < 55% | Active Recovery | Recovery rides |
| Z2 | 56-75% | Endurance | Base building |
| Z3 | 76-90% | Tempo | Aerobic capacity |
| Z4 | 91-105% | Threshold | FTP development |
| Z5 | 106-120% | VO2max | Anaerobic capacity |
| Z6 | 121-150% | Anaerobic | Neuromuscular power |
| Z7 | > 150% | Sprint | Peak power |

### Heart Rate Zones (% Threshold HR)

| Zone | HR % | Name |
|------|------|------|
| Z1 | < 81% | Recovery |
| Z2 | 81-89% | Aerobic |
| Z3 | 90-93% | Tempo |
| Z4 | 94-99% | Threshold |
| Z5 | ≥ 100% | Anaerobic |

## Activity Plan Structure

Activities use flexible JSON structures for structured activities:

```typescript
interface ActivityPlanStructure {
  steps: ActivityStep[];
}

interface ActivityStep {
  name: string;
  description?: string;
  duration: Duration | "untilFinished";
  targets?: IntensityTarget[];
  class: "warmup" | "active" | "cooldown" | "recovery" | "interval" | "rest";
  repetitions?: {
    repeat: number;
    steps: ActivityStep[];
  };
}

interface IntensityTarget {
  type: "%FTP" | "watts" | "%HR" | "bpm" | "pace" | "cadence";
  intensity: number;
  min?: number;
  max?: number;
}
```

**Example - Interval Activity:**
```json
{
  "steps": [
    {
      "name": "Warm Up",
      "duration": { "value": 10, "unit": "minutes" },
      "targets": [{ "type": "%FTP", "intensity": 65 }],
      "class": "warmup"
    },
    {
      "repetitions": {
        "repeat": 4,
        "steps": [
          {
            "name": "Hard Effort",
            "duration": { "value": 5, "unit": "minutes" },
            "targets": [{ "type": "%FTP", "min": 95, "max": 105 }],
            "class": "interval"
          },
          {
            "name": "Recovery",
            "duration": { "value": 2, "unit": "minutes" },
            "targets": [{ "type": "%FTP", "intensity": 55 }],
            "class": "recovery"
          }
        ]
      }
    },
    {
      "name": "Cool Down",
      "duration": { "value": 10, "unit": "minutes" },
      "targets": [{ "type": "%FTP", "intensity": 60 }],
      "class": "cooldown"
    }
  ]
}
```

**Core Package Functions:**
- `flattenPlanSteps()` - Flatten nested repetitions
- `getDurationMs()` - Calculate step duration in milliseconds
- `getIntensityColor()` - Visual color coding for intensity

## Mobile App Architecture (Expo + React Native)

### Tech Stack

- **Framework:** Expo SDK 54 + React Native 0.81.4
- **Routing:** Expo Router v6 (file-based, type-safe)
- **Styling:** NativeWind v4 (Tailwind CSS for React Native)
- **State:** Zustand + AsyncStorage (persistent)
- **API:** tRPC + React Query
- **Local Storage:** Expo SQLite + FileSystem
- **UI Components:** @rn-primitives (Radix-inspired)

### Directory Structure

```
apps/mobile/
├── app/                    # Expo Router file-based routing
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Home/Dashboard
│   │   ├── trends.tsx     # Analytics & trends
│   │   ├── plan.tsx       # Training plans
│   │   └── profile.tsx    # User profile
│   ├── record/            # Activity recording flow
│   └── _layout.tsx        # Root layout
├── components/            # Reusable UI components
│   ├── ui/               # Base UI primitives
│   └── dashboard/        # Recording dashboard cards
├── lib/                   # Utilities
│   ├── services/         # ActivityRecorderService
│   ├── trpc.ts           # tRPC client setup
│   └── supabase.ts       # Supabase client
└── stores/                # Zustand stores
```

### Activity Recording Service

**Purpose:** Manage local-first activity recording with background support

**Key Features:**
- Singleton pattern (one instance per activity)
- Event-driven architecture
- Background location tracking
- SQLite for local storage
- Automatic cloud sync when online

**Flow:**
```
User Starts Activity → Create SQLite Record → Start Sensors
                                           ↓
                            Track Metrics (power, HR, GPS)
                                           ↓
                            Save to SQLite Every N Seconds
                                           ↓
User Stops Activity → Finalize SQLite Record → Upload JSON to Storage
                                                         ↓
                                           Process Metadata + Streams
                                                         ↓
                                           Calculate IF/TSS (Core Package)
```

## Web App Architecture (Next.js)

### Tech Stack

- **Framework:** Next.js 15 + React 19
- **Routing:** App Router (server components by default)
- **Styling:** Tailwind CSS v4
- **UI Components:** Shadcn/ui (Radix UI + Tailwind)
- **State:** Zustand + React Query
- **API:** tRPC + Server Actions
- **Database:** Supabase (PostgreSQL)

### Directory Structure

```
apps/web/src/
├── app/                   # Next.js App Router
│   ├── (dashboard)/      # Authenticated routes
│   │   ├── activities/   # Activity list & detail
│   │   ├── plans/        # Training plan management
│   │   └── analytics/    # Advanced analytics
│   ├── api/              # API routes (tRPC handler)
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── ui/              # Shadcn/ui components
│   └── dashboard/       # Dashboard-specific
└── lib/                  # Utilities
    ├── trpc/            # tRPC setup (server + client)
    └── supabase/        # Supabase client (SSR-safe)
```

## Authentication & Security

### Supabase Auth Flow

1. User signs up/in → JWT token issued
2. Token stored in secure storage (mobile) or httpOnly cookie (web)
3. tRPC context extracts token → validates session
4. User profile fetched → attached to context
5. All tRPC procedures have access to authenticated user

**Row Level Security (RLS):**
- All tables enforce user ownership via `profile_id`
- Policies prevent cross-user data access
- Service role key bypasses RLS for admin operations

### Profile Enhancement

```typescript
// Base Supabase user
interface User {
  id: string;
  email: string;
}

// Extended profile (core package types)
interface Profile extends User {
  threshold_hr: number | null;
  ftp: number | null;
  weight_kg: number;
  gender: string;
  dob: string;
  username: string;
  preferred_units: 'metric' | 'imperial';
}
```

## Offline-First Architecture

### Mobile Sync Strategy

**Recording Phase:**
1. Activity recorded → Saved to SQLite (offline-capable)
2. JSON payload complete → Queued for upload
3. Network available → Upload to Supabase Storage
4. Upload successful → Generate metadata + streams
5. Process analytics → Calculate IF/TSS via core package

**Conflict Resolution:**
- Timestamps used for ordering
- Last-write-wins for updates
- Core package validation ensures data integrity
- Failed uploads retry with exponential backoff

### Web Fallback

- Server-side rendering for initial load
- Client-side hydration for interactivity
- React Query handles offline cache
- Optimistic updates for better UX

## Performance Considerations

### Database Indexes

```sql
-- Activity date range queries
CREATE INDEX idx_activities_profile_started
  ON activities(profile_id, started_at);

-- Intensity filtering
CREATE INDEX idx_activities_intensity
  ON activities(profile_id, intensity_factor)
  WHERE intensity_factor IS NOT NULL;

-- Stream lookups
CREATE INDEX idx_streams_activity
  ON activity_streams(activity_id, type);
```

### Core Package Optimizations

- Pure functions (no I/O delays)
- Tree-shakable exports
- Memoized calculations where appropriate
- Zero runtime dependencies (except Zod)

### API Response Times

**Targets:**
- Simple queries: < 200ms
- Complex analytics: < 500ms
- Large dataset queries: < 1s

## Testing Strategy

### Core Package Tests

```bash
cd packages/core && npm test
```

- Pure function testing (no mocks required)
- Mathematical validation (TSS, IF, zones)
- Schema validation (Zod)
- Cross-platform consistency

### Integration Tests

- tRPC endpoint testing
- Database query validation
- Authentication flow testing
- Error handling verification

### E2E Tests

- Complete activity recording flow
- Training plan creation workflow
- Offline/online sync scenarios
- Multi-device consistency

## Deployment

### Mobile (Expo EAS)

```bash
# Production builds
eas build --platform all --profile production

# Over-the-air updates (no app store review)
eas update --branch production --message "Feature update"

# Submit to stores
eas submit --platform ios --profile production
```

### Web (Vercel)

```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment
vercel --prod
```

### Database (Supabase)

- Migrations managed in `packages/supabase/migrations/`
- Applied via Supabase CLI
- Staging → Production promotion workflow

## Monitoring & Observability

### Key Metrics

- API response times (P50, P95, P99)
- Error rates per endpoint
- Activity completion success rate
- % of activities with IF data
- User engagement (DAU, MAU)

### Logging

- Structured logging with context
- Error tracking (Sentry or similar)
- Performance monitoring
- User analytics (privacy-compliant)

## Future Architecture Considerations

### Potential Enhancements

1. **GraphQL Alternative** - Consider Apollo if REST becomes limiting
2. **Event Sourcing** - For complete activity history audit trail
3. **CQRS Pattern** - Separate read/write models for analytics
4. **Microservices** - If scale requires service separation
5. **Edge Functions** - Supabase Edge Functions for real-time processing
6. **AI Integration** - Training recommendations via ML models

### Scalability Path

- Current: Monolithic tRPC API (< 10k users)
- Phase 2: Separate analytics service (< 100k users)
- Phase 3: Microservices + message queue (< 1M users)
- Phase 4: Distributed system + caching layer (> 1M users)

---

**Last Updated:** 2025-01-23
