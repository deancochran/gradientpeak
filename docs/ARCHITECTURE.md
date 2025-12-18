# GradientPeak Architecture

## Core Principles

### 1. Database-Independent Core Package

`@repo/core` contains pure TypeScript functions with zero database dependencies:

```typescript
import { calculateTSS, validateActivity, getIntensityZone } from '@repo/core';

// Pure function calls - no database required
const tss = calculateTSS(startedAt, endedAt, powerStream, profile);
const zone = getIntensityZone(intensityFactor);
```

**Benefits**: 100% testable, platform-agnostic, no mocks needed.

### 2. JSON-First Data Storage

Activity data stored as JSON in Supabase Storage (single source of truth):

```
Local Recording → SQLite (JSON) → Upload → Supabase Storage
                                         ↓
                        Metadata → Activity Records
                                         ↓
                        Streams → Activity Streams (compressed)
```

### 3. Type Safety Chain

```
Database Schema → @repo/supabase (generated types)
                        ↓
                  @repo/core (Zod schemas)
                        ↓
                  @repo/trpc (type-safe APIs)
                        ↓
                  Apps (fully typed)
```

## Package Structure

### @repo/core - Business Logic

```
packages/core/
├── calculations.ts         # TSS, IF, NP, CTL/ATL/TSB
├── constants.ts           # Activity types, zones, colors
├── schemas/               # Zod validation
│   ├── activity_payload.ts
│   ├── activity_plan_structure.ts
│   └── training_plan_structure.ts
└── utils/
    ├── activity-defaults.ts  # Smart step generation
    ├── plan-view-logic.ts    # Recording config
    └── polyline.ts           # GPS encoding/decoding
```

**Key Functions**:
- `calculateTSS()` - Training Stress Score
- `calculateNormalizedPower()` - 30s rolling average
- `calculateIntensityFactor()` - Relative intensity (NP/FTP)
- `calculateCTL/ATL/TSB()` - Training load metrics
- `getIntensityZone()` - 7-zone classification

### @repo/trpc - API Layer

```
packages/trpc/src/routers/
├── activities.ts          # Activity CRUD + analytics
├── activity_plans.ts      # Plan library
├── planned_activities.ts  # Scheduling
├── training_plans.ts      # Training plan management
├── routes.ts              # GPS routes
└── profiles.ts            # User settings
```

### @repo/supabase - Database Layer

**Key Tables**:
- `profiles` - User settings (FTP, threshold HR, weight)
- `activities` - Activity metadata + IF/TSS
- `activity_streams` - Time-series data (compressed)
- `activity_plans` - Reusable templates
- `planned_activities` - Scheduled activities
- `training_plans` - Long-term structures
- `activity_routes` - GPS routes with polylines

**Type Generation**:
```bash
cd packages/supabase
npm run update-types  # Generates TypeScript + Zod schemas
```

## Training Load System

### CTL/ATL/TSB Calculations

**Chronic Training Load (CTL)** - 42-day exponential weighted moving average:
```typescript
CTL = previousCTL + (2/43) × (todayTSS - previousCTL)
```

**Acute Training Load (ATL)** - 7-day exponential weighted moving average:
```typescript
ATL = previousATL + (2/8) × (todayTSS - previousATL)
```

**Training Stress Balance (TSB)** - Form indicator:
```typescript
TSB = CTL - ATL
```

**Interpretation**:
- TSB > 25: Very fresh (peak for racing)
- TSB 5-25: Good form (hard training)
- TSB -10 to 5: Neutral (normal training)
- TSB -30 to -10: Tired (building fitness)
- TSB < -30: Overreaching (risk zone)

## Intensity System

### 7-Zone Classification (After-the-fact)

Based on completed activity Intensity Factor (IF):

| Zone | IF Range | Name | Description |
|------|----------|------|-------------|
| Z1 | < 0.55 | Recovery | Active recovery |
| Z2 | 0.55-0.75 | Endurance | Aerobic base |
| Z3 | 0.75-0.85 | Tempo | Sweet spot |
| Z4 | 0.85-0.95 | Threshold | Sustained FTP |
| Z5 | 0.95-1.05 | VO2max | Race pace |
| Z6 | 1.05-1.15 | Anaerobic | Supra-threshold |
| Z7 | ≥ 1.15 | Neuromuscular | Max sprints |

**Calculation**:
```typescript
const np = calculateNormalizedPower(powerStream);
const if_ = calculateTrainingIntensityFactor(np, ftp);
const zone = getTrainingIntensityZone(if_);
```

## Activity Plan Structure

Flexible JSON structure for structured workouts:

```typescript
interface ActivityPlanStructure {
  steps: ActivityStep[];
}

interface ActivityStep {
  name: string;
  duration: Duration | "untilFinished";
  targets?: IntensityTargetV2[];  // Max 2 targets
  class: "warmup" | "active" | "cooldown" | "recovery" | "interval" | "rest";
  repetitions?: {
    repeat: number;
    steps: ActivityStep[];
  };
}
```

**Example - Interval Activity**:
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
    }
  ]
}
```

## Mobile App Architecture

### Tech Stack
- **Framework**: Expo SDK 54 + React Native 0.81.4
- **Routing**: Expo Router v6 (file-based, type-safe)
- **Styling**: NativeWind v4 (Tailwind for RN)
- **State**: Zustand + AsyncStorage
- **API**: tRPC + React Query
- **Local Storage**: Expo SQLite + FileSystem

### Activity Recording Service

Singleton service managing local-first recording:

```typescript
const recorder = ActivityRecorderService.getInstance();

await recorder.initialize({ activityType: 'outdoor_bike' });
await recorder.start();

// Subscribe to metrics
recorder.on('metric:power', (watts) => { ... });
recorder.on('metric:heartRate', (bpm) => { ... });

await recorder.stop();
const activityId = await recorder.finalize();
```

**Flow**:
```
Start → Track Sensors → Save to SQLite → Upload JSON → Process Analytics
```

## GPS Routes System

### Route Storage

**Metadata** in `activity_routes` table:
- Polyline-encoded coordinates (~300 bytes)
- Total distance, ascent, descent
- Activity type association

**Full Coordinates** in Supabase Storage:
- GPX file (raw data, ~150KB)
- Loaded only at recording start

### Recording View Configuration

Map visibility based on activity type and route:

| Activity Type | Has Route | Show Map | Navigation |
|--------------|-----------|----------|------------|
| Indoor | ❌ | ❌ | Steps only |
| Indoor | ✅ | ✅ | Visual overlay |
| Outdoor | ❌ | ✅ | GPS tracking |
| Outdoor | ✅ | ✅ | Turn-by-turn |

## Authentication & Security

### Supabase Auth Flow
1. User signs in → JWT token issued
2. Token stored in secure storage/cookie
3. tRPC context validates session
4. User profile attached to context

### Row Level Security (RLS)
- All tables enforce user ownership via `profile_id`
- Policies prevent cross-user data access
- Service role key bypasses RLS for admin operations

## Offline-First Architecture

### Mobile Sync Strategy
1. Record locally → SQLite storage
2. Queue for upload when offline
3. Network available → Upload to Storage
4. Process metadata + streams
5. Calculate analytics via core package

**Conflict Resolution**: Last-write-wins with timestamp ordering

## Performance Considerations

### Database Indexes
```sql
CREATE INDEX idx_activities_profile_started 
  ON activities(profile_id, started_at);

CREATE INDEX idx_activities_intensity 
  ON activities(profile_id, intensity_factor) 
  WHERE intensity_factor IS NOT NULL;
```

### Core Package Optimizations
- Pure functions (no I/O delays)
- Tree-shakable exports
- Memoized calculations
- Zero runtime dependencies

### Polyline Compression
- Raw JSON (5000 points): ~150KB
- Mapbox polyline (150 points): ~300 bytes
- **500x compression ratio**

## Deployment

### Mobile (EAS)
```bash
eas build --platform all --profile production
eas submit --platform ios --profile production
eas update --branch production  # OTA updates
```

### Web (Vercel)
```bash
git push origin main  # Automatic deployment
```

### Database (Supabase)
```bash
cd packages/supabase
supabase db push  # Apply migrations
```

## Testing Strategy

**Core Package**: Pure function testing, no mocks required  
**Integration**: tRPC endpoint validation  
**E2E**: Manual testing on physical devices (required)  

**Note**: Unit testing is not required for this implementation.
