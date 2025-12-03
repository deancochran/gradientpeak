# GradientPeak

Fitness tracking platform for endurance athletes with structured training plans, activity recording, and performance analytics.

## Stack

**Mobile**: React Native (Expo SDK 54) + NativeWind  
**Web**: Next.js 15 + Tailwind CSS  
**Backend**: tRPC + Supabase (PostgreSQL + Storage)  
**Core**: Shared TypeScript package with zero dependencies  

## Quick Start

```bash
# Install dependencies
npm install

# Start all dev servers
npm dev

# Start specific apps
cd apps/mobile && npm dev
cd apps/web && npm dev:next
```

## Project Structure

```
apps/
├── mobile/          # React Native app (Expo)
└── web/             # Next.js web app

packages/
├── core/            # Business logic (pure TypeScript)
├── trpc/            # API layer (type-safe)
└── supabase/        # Database schema & types
```

## Key Features

### Activity Recording
- Real-time GPS tracking with offline support
- Bluetooth sensor integration (power, HR, cadence)
- Background location tracking
- Local SQLite storage → Cloud sync

### Training Plans
- Structured activity plans with intervals
- 7-zone intensity classification (IF-based)
- Training load tracking (CTL/ATL/TSB)
- Weekly calendar with constraint validation

### Performance Analytics
- Training Stress Score (TSS) calculation
- Intensity Factor (IF) from power/HR data
- Normalized Power (30s rolling average)
- Zone distribution analysis

### GPS Routes
- GPX upload and polyline encoding
- Route overlays during recording
- Turn-by-turn navigation (outdoor)
- Indoor trainer grade simulation (planned)

## Core Concepts

### Database-Independent Core
All calculations in `@repo/core` are pure functions with no async operations. This enables:
- 100% testable without mocks
- Shared across mobile/web/future platforms
- Zero runtime dependencies (except Zod)

### JSON-First Storage
Activity data stored as JSON in Supabase Storage (single source of truth):
```
Local Recording → SQLite → Upload → Supabase Storage
                                  ↓
                    Metadata → Activities Table
                                  ↓
                    Streams → Activity Streams Table
```

### Type Safety Chain
```
Database Schema → Supabase Types → Core Zod Schemas → tRPC → Apps
```

## Environment Setup

### Prerequisites
- Node.js 18+
- pnpm 8+
- Expo CLI (global)
- Docker (for local Supabase)

### Environment Variables

**Mobile** (`apps/mobile/.env`):
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Web** (`apps/web/.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Local Supabase (Optional)
```bash
cd packages/supabase
supabase start
supabase db reset
npm run update-types
```

## Common Commands

```bash
# Development
npm dev                 # Start all servers
npm build              # Build all packages
npm test               # Run all tests

# Mobile
cd apps/mobile
npm dev                # Start Expo (clears cache)
npm android            # Run on Android
npm ios                # Run on iOS

# Database
cd packages/supabase
npm run update-types   # Regenerate types from schema
supabase migration new <name>
supabase db reset
```

## Documentation

- **ARCHITECTURE.md** - Core technical concepts and patterns
- **DEVELOPMENT.md** - Development workflow and best practices

## Deployment

**Mobile**: EAS Build + Submit to App/Play Store  
**Web**: Vercel automatic deployment on push  
**Database**: Supabase migrations via CLI  

## License

Proprietary
