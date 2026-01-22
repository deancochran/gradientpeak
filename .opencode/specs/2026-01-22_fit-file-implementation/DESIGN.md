# FIT File Implementation Specification - Comprehensive Research Edition

**Version:** 3.0.0 - Research Integration Edition  
**Created:** January 22, 2026  
**Last Updated:** January 22, 2026  
**Status:** Ready for Implementation  
**Owner:** Coordinator

---

## Executive Summary

This specification defines the implementation of FIT (Flexible and Interoperable Data Transfer) file support for GradientPeak. This comprehensive edition integrates research findings on Turborepo monorepo configuration, Supabase Edge Functions best practices, core package import patterns, and detailed FIT file processing using @garmin/fitsdk.

**Key Research Findings:**

- **@garmin/fitsdk v21.188.0** is the official Garmin SDK with full encoding/decoding support
- **Turborepo** enables efficient caching and parallel builds across mobile, web, and serverless workspaces
- **Supabase Edge Functions** run on Deno 2.x with npm import support for FIT processing
- **Core package architecture** should use barrel exports with platform-agnostic utilities
- **Async processing workflow** with PENDING → PROCESSING → COMPLETED/FAILED state transitions

---

## Part 1: Turborepo Monorepo Configuration

### 1.1 Workspace Structure

Based on research findings, the monorepo should follow this structure:

```
├── apps/
│   ├── mobile/                    # React Native (Expo)
│   │   ├── src/
│   │   ├── package.json
│   │   ├── metro.config.js
│   │   └── tsconfig.json
│   │
│   ├── web/                       # Next.js
│   │   ├── src/
│   │   └── package.json
│   │
│   └── functions/                 # Supabase Functions wrapper
│       ├── package.json
│       └── supabase/
│           ├── functions/
│           │   └── process-activity-fit/
│           │       ├── index.ts
│           │       └── deno.json
│           └── config.toml
│
├── packages/
│   ├── core/                      # @repo/core - Shared utilities
│   │   ├── src/
│   │   │   ├── index.ts           # Main barrel export
│   │   │   ├── fit/               # FIT processing module
│   │   │   │   ├── index.ts
│   │   │   │   ├── parser.ts
│   │   │   │   ├── decoder.ts
│   │   │   │   └── types.ts
│   │   │   ├── metrics/           # Metrics calculations
│   │   │   │   ├── index.ts
│   │   │   │   ├── tss.ts
│   │   │   │   ├── normalized-power.ts
│   │   │   │   └── intensity-factor.ts
│   │   │   ├── geo/               # Geographic utilities
│   │   │   │   ├── index.ts
│   │   │   │   ├── coordinates.ts
│   │   │   │   └── polyline.ts
│   │   │   └── schemas/           # Zod schemas
│   │   │       ├── index.ts
│   │   │       └── activity.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsconfig.build.json
│   │
│   ├── supabase/                  # Database layer
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   └── types/
│   │   ├── migrations/
│   │   ├── supazod/
│   │   └── package.json
│   │
│   └── trpc/                      # API layer
│       ├── src/
│       │   ├── index.ts
│       │   ├── routers/
│       │   │   ├── activities.ts
│       │   │   └── fit-files.ts
│       └── package.json
│
├── supabase/
│   ├── migrations/
│   ├── config.toml
│   └── package.json
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json
```

### 1.2 pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "supabase"

ignoredBuiltDependencies:
  - sharp
```

### 1.3 Root package.json Scripts

```json
{
  "name": "gradientpeak",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:migrate": "turbo run db:migrate",
    "db:generate": "turbo run db:generate",
    "supabase:generate-types": "turbo run supabase:generate-types",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write .",
    "functions:serve": "cd apps/functions && supabase functions serve",
    "functions:deploy": "cd apps/functions && supabase functions deploy"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "@repo/typescript-config": "workspace:*",
    "prettier": "^3.0.0",
    "husky": "^8.0.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

### 1.4 Turbo.json Configuration

**CRITICAL FINDING:** The existing turbo.json needs updates to include database migrations and type generation:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "globalDependencies": [
    "**/.env.*local",
    "tsconfig.json",
    "packages/supabase/migrations/**/*.sql",
    "packages/supabase/supazod/**/*.ts"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build", "^db:generate"],
      "inputs": [
        "$TURBO_DEFAULT$",
        ".env*",
        "packages/supabase/migrations/**/*.sql",
        "packages/supabase/supazod/**/*.ts",
        "packages/core/src/**/*.ts"
      ],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "lib/**"],
      "env": ["NODE_ENV"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": [
        "$TURBO_DEFAULT$",
        ".env*",
        "tests/**",
        "**/*.test.*",
        "src/**"
      ],
      "outputs": ["coverage/**", "test-results/**", "dist/**"],
      "cache": true
    },
    "db:generate": {
      "dependsOn": ["^db:generate"],
      "outputs": [
        "packages/supabase/src/types/*.ts",
        "packages/supabase/generated/**"
      ],
      "cache": true
    },
    "db:migrate": {
      "cache": false,
      "dependsOn": ["^db:generate"]
    },
    "supabase:generate-types": {
      "dependsOn": ["^db:generate"],
      "outputs": ["packages/supabase/src/types/database.types.ts"],
      "cache": true
    },
    "clean": {
      "cache": false
    },
    "watch": {
      "cache": false,
      "persistent": true
    }
  },
  "remoteCache": {
    "signature": true
  }
}
```

### 1.5 Database Type Generation Pipeline

**CRITICAL:** Add database type generation to the build pipeline:

**packages/supabase/package.json:**

```json
{
  "name": "@gradientpeak/supabase",
  "scripts": {
    "build": "prisma generate && tsc",
    "dev": "prisma generate --watch",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "lint": "eslint src/**/*.ts",
    "supabase:generate-types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID --schema public > src/types/database.types.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.7.0",
    "@supabase/supabase-js": "^2.39.0",
    "@repo/core": "workspace:*"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "prisma": "^5.7.0",
    "typescript": "^5.5.2"
  }
}
```

---

## Part 2: Core Package Architecture

### 2.1 Package.json Configuration

**packages/core/package.json:**

```json
{
  "name": "@repo/core",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./fit": {
      "types": "./dist/fit/index.d.ts",
      "import": "./dist/fit/index.js",
      "require": "./dist/fit/index.cjs"
    },
    "./metrics": {
      "types": "./dist/metrics/index.d.ts",
      "import": "./dist/metrics/index.js",
      "require": "./dist/metrics/index.cjs"
    },
    "./geo": {
      "types": "./dist/geo/index.d.ts",
      "import": "./dist/geo/index.js",
      "require": "./dist/geo/index.cjs"
    },
    "./schemas": {
      "types": "./dist/schemas/index.d.ts",
      "import": "./dist/schemas/index.js",
      "require": "./dist/schemas/index.cjs"
    }
  },
  "files": ["dist/**", "src/**"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:watch": "tsc -p tsconfig.build.json --watch",
    "check-types": "tsc --noEmit",
    "lint": "eslint src/**/*.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@garmin/fitsdk": "^21.188.0",
    "@mapbox/polyline": "^1.2.1",
    "zod": "^3.22.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-native": ">=0.72.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/jest": "^29.5.0",
    "@types/mapbox__polyline": "^1.0.5",
    "typescript": "^5.5.2",
    "vitest": "^1.0.0"
  }
}
```

### 2.2 TypeScript Configuration

**packages/core/tsconfig.build.json:**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.test.ts", "**/*.spec.ts"]
}
```

**packages/core/tsconfig.json:**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

### 2.3 Path Mappings

**tsconfig.base.json (root):**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@repo/core/*": ["packages/core/src/*"],
      "@repo/core": ["packages/core/src/index.ts"],
      "@repo/supabase/*": ["packages/supabase/src/*"],
      "@repo/trpc/*": ["packages/trpc/src/*"]
    }
  }
}
```

**apps/mobile/tsconfig.json:**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@repo/core/*": ["../../packages/core/src/*"],
      "@repo/core": ["../../packages/core/src/index.ts"]
    }
  }
}
```

### 2.4 Barrel Exports

**packages/core/src/index.ts:**

```typescript
export * from "./fit/parser";
export * from "./fit/types";
export * from "./metrics/normalized-power";
export * from "./metrics/intensity-factor";
export * from "./metrics/tss";
export * from "./geo/coordinates";
export * from "./geo/polyline";
export * from "./schemas/activity";
```

**packages/core/src/fit/index.ts:**

```typescript
export * from "./parser";
export * from "./types";
```

**packages/core/src/metrics/index.ts:**

```typescript
export * from "./normalized-power";
export * from "./intensity-factor";
export * from "./tss";
```

---

## Part 3: Supabase Edge Functions

### 3.1 Function Structure

**apps/functions/supabase/functions/process-activity-fit/index.ts:**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Decoder, Utils } from "@garmin/fitsdk";
import { encode as encodePolyline } from "@mapbox/polyline";

const FIT_EPOCH_OFFSET = 631065600; // Seconds from Unix epoch to FIT epoch

interface FitRecord {
  timestamp?: number;
  position_lat?: number;
  position_long?: number;
  distance?: number;
  altitude?: number;
  speed?: number;
  heart_rate?: number;
  cadence?: number;
  power?: number;
  temperature?: number;
}

interface FitSession {
  sport?: number;
  start_time?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  total_calories?: number;
}

interface ProcessedMetrics {
  tss: number;
  intensityFactor: number;
  normalizedPower: number;
  hrZones: number[];
  powerZones: number[];
}

Deno.serve(async (req: Request) => {
  // CORS handling
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { activityId } = await req.json();

    if (!activityId) {
      throw new Error("activityId is required");
    }

    // Create Supabase client with auth context
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Get activity with FIT file path
    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id, fit_file_path, profile_id, started_at")
      .eq("id", activityId)
      .single();

    if (activityError || !activity?.fit_file_path) {
      throw new Error("Activity not found or no FIT file");
    }

    // Update status to PROCESSING
    await supabase
      .from("activities")
      .update({ processing_status: "PROCESSING" })
      .eq("id", activityId);

    // Download FIT file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("fit-files")
      .download(activity.fit_file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download FIT file: ${downloadError?.message}`);
    }

    // Parse FIT file
    const arrayBuffer = await fileData.arrayBuffer();
    const decoder = new Decoder(new Uint8Array(arrayBuffer));
    const { messages, errors } = decoder.read();

    if (errors.length > 0) {
      console.warn("FIT parsing warnings:", errors);
    }

    // Extract records and session
    const records = (messages.recordMesgs as FitRecord[]) || [];
    const session = (messages.sessionMesgs?.[0] as FitSession) || {};

    if (records.length === 0) {
      throw new Error("No record data found in FIT file");
    }

    // Get user profile for metrics calculation
    const { data: profile } = await supabase
      .from("profiles")
      .select("functional_threshold_power, max_heart_rate, weight")
      .eq("id", activity.profile_id)
      .single();

    // Calculate metrics
    const metrics = calculateMetrics(records, session, profile);

    // Generate GPS polyline
    const polylineStr = generatePolyline(records);

    // Update activity with results
    const { error: updateError } = await supabase
      .from("activities")
      .update({
        processing_status: "COMPLETED",
        metrics: metrics,
        distance_meters: session.total_distance || 0,
        duration_seconds: session.total_elapsed_time || 0,
        hr_zone_seconds: metrics.hrZones,
        power_zone_seconds: metrics.powerZones,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activityId);

    if (updateError) {
      throw new Error(`Failed to update activity: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, metrics, polyline: polylineStr }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Processing error:", error);

    // Update status to FAILED
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      await supabase
        .from("activities")
        .update({
          processing_status: "FAILED",
          processing_error: error.message,
        })
        .eq("id", activityId);
    } catch (updateErr) {
      console.error("Failed to update error status:", updateErr);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

// ===== Metric Calculation Functions =====

function calculateMetrics(
  records: FitRecord[],
  session: FitSession,
  profile: any,
): ProcessedMetrics {
  // Extract power and HR readings
  const powerReadings = records
    .map((r) => r.power)
    .filter((p): p is number => p !== undefined && p > 0);

  const hrReadings = records
    .map((r) => r.heart_rate)
    .filter((h): h is number => h !== undefined && h > 0);

  // Calculate average power
  const avgPower =
    session.avg_power ||
    (powerReadings.length > 0
      ? powerReadings.reduce((a, b) => a + b, 0) / powerReadings.length
      : 0);

  // Calculate Normalized Power
  const normalizedPower = calculateNormalizedPower(powerReadings);

  // Calculate Intensity Factor
  const ftp = profile?.functional_threshold_power || 200;
  const intensityFactor = avgPower > 0 ? normalizedPower / ftp : 0;

  // Calculate TSS
  const duration = session.total_elapsed_time || 0;
  const tss = Math.round(
    intensityFactor * intensityFactor * (duration / 3600) * 100,
  );

  return {
    tss,
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    normalizedPower,
    hrZones: calculateHRZones(hrReadings, profile?.max_heart_rate),
    powerZones: calculatePowerZones(powerReadings, ftp),
  };
}

function calculateNormalizedPower(powerReadings: number[]): number {
  if (powerReadings.length === 0) return 0;

  // Create 30-second rolling average
  const rolling30s: number[] = [];
  for (let i = 0; i < powerReadings.length; i++) {
    const start = Math.max(0, i - 29);
    const subset = powerReadings.slice(start, i + 1);
    rolling30s.push(subset.reduce((a, b) => a + b, 0) / subset.length);
  }

  // Remove values below threshold (30 seconds below FTP)
  const threshold =
    0.75 * (powerReadings.reduce((a, b) => a + b, 0) / powerReadings.length);
  const elevatedPower = rolling30s.filter((p) => p > threshold);

  // Calculate 4th root of mean of elevated power
  const fourthPowerSum = elevatedPower.reduce(
    (sum, p) => sum + Math.pow(p, 4),
    0,
  );
  return Math.round(Math.pow(fourthPowerSum / elevatedPower.length, 0.25));
}

function calculateHRZones(hrReadings: number[], maxHR?: number): number[] {
  const zones = [0, 0, 0, 0, 0];
  if (hrReadings.length === 0) return zones;

  const actualMax = maxHR || Math.max(...hrReadings);

  hrReadings.forEach((hr) => {
    const pct = hr / actualMax;
    if (pct < 0.6) zones[0]++;
    else if (pct < 0.7) zones[1]++;
    else if (pct < 0.8) zones[2]++;
    else if (pct < 0.9) zones[3]++;
    else zones[4]++;
  });

  return zones;
}

function calculatePowerZones(powerReadings: number[], ftp: number): number[] {
  const zones = [0, 0, 0, 0, 0, 0, 0];
  if (powerReadings.length === 0 || ftp === 0) return zones;

  powerReadings.forEach((power) => {
    const pct = power / ftp;
    if (pct < 0.55) zones[0]++;
    else if (pct < 0.75) zones[1]++;
    else if (pct < 0.9) zones[2]++;
    else if (pct < 1.05) zones[3]++;
    else if (pct < 1.2) zones[4]++;
    else if (pct < 1.5) zones[5]++;
    else zones[6]++;
  });

  return zones;
}

function generatePolyline(records: FitRecord[]): string | null {
  const gpsPoints = records
    .filter(
      (r): r is Required<FitRecord> =>
        r.position_lat !== undefined && r.position_long !== undefined,
    )
    .map((r) => [
      semicirclesToDegrees(r.position_lat!),
      semicirclesToDegrees(r.position_long!),
    ]);

  return gpsPoints.length > 0 ? encodePolyline(gpsPoints) : null;
}

function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

### 3.2 Deno Configuration

**apps/functions/supabase/functions/process-activity-fit/deno.json:**

```json
{
  "compilerOptions": {
    "lib": ["deno.window", "deno.ns"],
    "strict": true
  },
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2",
    "@garmin/fitsdk": "npm:@garmin/fitsdk@^21.188.0",
    "@mapbox/polyline": "npm:@mapbox/polyline@^1.2.1",
    "jsr:@supabase/functions-js": "jsr:@supabase/functions-js@^2.4.1"
  }
}
```

### 3.3 Supabase Configuration

**apps/functions/supabase/config.toml:**

```toml
[functions.process-activity-fit]
verify_jwt = true
import_map = "./supabase/functions/process-activity-fit/deno.json"

[edge_runtime]
enabled = true
policy = "per_worker"
deno_version = "2"
```

### 3.4 Functions Package.json

**apps/functions/package.json:**

```json
{
  "name": "@gradientpeak/functions",
  "version": "0.0.1",
  "scripts": {
    "serve": "supabase functions serve process-activity-fit",
    "deploy": "supabase functions deploy process-activity-fit --project-ref $SUPABASE_PROJECT_ID",
    "deploy:verify": "supabase functions deploy process-activity-fit --no-verify-jwt --project-ref $SUPABASE_PROJECT_ID"
  },
  "dependencies": {
    "@gradientpeak/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0"
  },
  "pnpm": {
    "overrides": {
      "@garmin/fitsdk": "^21.188.0"
    }
  },
  "devDependencies": {
    "@supabase/cli": "^1.44.0"
  }
}
```

---

## Part 4: FIT File Processing Deep Dive

### 4.1 SDK Overview

**Package:** `@garmin/fitsdk` v21.188.0  
**Repository:** https://github.com/garmin/fit-javascript-sdk  
**Documentation:** https://developer.garmin.com/fit

**Core Exports:**

```typescript
import {
  Decoder, // Main class for decoding FIT files
  Encoder, // Main class for encoding FIT files
  Stream, // Binary stream handling
  Profile, // Message type definitions and constants
  Utils, // Utility functions (timestamp conversion, constants)
} from "@garmin/fitsdk";
```

### 4.2 FIT File Format Structure

A FIT file consists of:

1. **Header** (12 or 14 bytes): Protocol version, profile version, data size, ".FIT" signature
2. **Data Records**: Message definitions and data messages
3. **CRC** (2 bytes): 16-bit checksum for integrity validation

### 4.3 Decoding with @garmin/fitsdk

**packages/core/src/fit/decoder.ts:**

```typescript
import { Decoder, Stream } from "@garmin/fitsdk";

export interface DecodeOptions {
  validateChecksum?: boolean;
  applyScaleAndOffset?: boolean;
  convertDateTimesToDates?: boolean;
  convertTypesToStrings?: boolean;
  mesgListener?: (messageNumber: number, message: any) => void;
}

export interface DecodedFITData {
  activities: Activity[];
  sessions: Session[];
  records: Record[];
  events: Event[];
  laps: Lap[];
  deviceInfo: DeviceInfo[];
  fileId: FileId;
}

export interface Activity {
  timestamp: Date;
  totalTimerTime: number;
  numSessions: number;
  type: string;
  event: string;
  sessionMarker: string;
}

export interface Session {
  timestamp: Date;
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  avgPower: number;
  maxPower: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgCadence: number;
  maxCadence: number;
  sport: string;
  subSport: string;
}

export interface Record {
  timestamp: Date;
  positionLat: number;
  positionLong: number;
  distance: number;
  speed: number;
  heartRate: number;
  cadence: number;
  power: number;
  altitude: number;
}

export interface Event {
  timestamp: Date;
  event: string;
  eventType: string;
  data: number;
}

export interface Lap {
  timestamp: Date;
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  distance: number;
}

export interface DeviceInfo {
  timestamp: Date;
  deviceIndex: string;
  manufacturer: string;
  product: number;
  softwareVersion: number;
  hardwareVersion: number;
  serialNumber: number;
}

export interface FileId {
  type: string;
  manufacturer: string;
  product: number;
  timeCreated: Date;
  serialNumber: number;
}

export class FITDecoder {
  private decoder: Decoder;
  private errors: Error[] = [];

  constructor(buffer: ArrayBuffer) {
    const stream = Stream.fromBuffer(new Uint8Array(buffer));
    this.decoder = new Decoder(stream);
  }

  decode(options: DecodeOptions = {}): DecodedFITData {
    const {
      applyScaleAndOffset = true,
      convertDateTimesToDates = true,
      convertTypesToStrings = true,
      mesgListener,
    } = options;

    const { messages, errors } = this.decoder.read({
      applyScaleAndOffset,
      convertDateTimesToDates,
      convertTypesToStrings,
      mesgListener,
    });

    this.errors = errors.map((e) => new Error(e.message));

    return {
      activities: this.decodeActivities(messages.activityMesgs || []),
      sessions: this.decodeSessions(messages.sessionMesgs || []),
      records: this.decodeRecords(messages.recordMesgs || []),
      events: this.decodeEvents(messages.eventMesgs || []),
      laps: this.decodeLaps(messages.lapMesgs || []),
      deviceInfo: this.decodeDeviceInfo(messages.deviceInfoMesgs || []),
      fileId: this.decodeFileId(messages.fileIdMesgs?.[0]),
    };
  }

  getErrors(): Error[] {
    return this.errors;
  }

  isValid(): boolean {
    return this.decoder.isFIT() && this.decoder.checkIntegrity();
  }

  private decodeActivities(activities: any[]): Activity[] {
    return activities.map((a) => ({
      timestamp: a.timestamp,
      totalTimerTime: a.totalTimerTime,
      numSessions: a.numSessions,
      type: a.type,
      event: a.event,
      sessionMarker: a.sessionMarker,
    }));
  }

  private decodeSessions(sessions: any[]): Session[] {
    return sessions.map((s) => ({
      timestamp: s.timestamp,
      startTime: s.startTime,
      totalElapsedTime: s.totalElapsedTime,
      totalTimerTime: s.totalTimerTime,
      distance: s.distance,
      avgSpeed: s.avgSpeed,
      maxSpeed: s.maxSpeed,
      avgPower: s.avgPower,
      maxPower: s.maxPower,
      avgHeartRate: s.avgHeartRate,
      maxHeartRate: s.maxHeartRate,
      avgCadence: s.avgCadence,
      maxCadence: s.maxCadence,
      sport: s.sport,
      subSport: s.subSport,
    }));
  }

  private decodeRecords(records: any[]): Record[] {
    return records.map((r) => ({
      timestamp: r.timestamp,
      positionLat: r.positionLat,
      positionLong: r.positionLong,
      distance: r.distance,
      speed: r.speed,
      heartRate: r.heartRate,
      cadence: r.cadence,
      power: r.power,
      altitude: r.altitude,
    }));
  }

  private decodeEvents(events: any[]): Event[] {
    return events.map((e) => ({
      timestamp: e.timestamp,
      event: e.event,
      eventType: e.eventType,
      data: e.data,
    }));
  }

  private decodeLaps(laps: any[]): Lap[] {
    return laps.map((l) => ({
      timestamp: l.timestamp,
      startTime: l.startTime,
      totalElapsedTime: l.totalElapsedTime,
      totalTimerTime: l.totalTimerTime,
      distance: l.distance,
    }));
  }

  private decodeDeviceInfo(devices: any[]): DeviceInfo[] {
    return devices.map((d) => ({
      timestamp: d.timestamp,
      deviceIndex: d.deviceIndex,
      manufacturer: d.manufacturer,
      product: d.product,
      softwareVersion: d.softwareVersion,
      hardwareVersion: d.hardwareVersion,
      serialNumber: d.serialNumber,
    }));
  }

  private decodeFileId(fileId: any): FileId {
    if (!fileId) {
      return {
        type: "activity",
        manufacturer: "unknown",
        product: 0,
        timeCreated: new Date(),
        serialNumber: 0,
      };
    }
    return {
      type: fileId.type,
      manufacturer: fileId.manufacturer,
      product: fileId.product,
      timeCreated: fileId.timeCreated,
      serialNumber: fileId.serialNumber,
    };
  }
}
```

### 4.4 FIT Parser Utility

**packages/core/src/fit/parser.ts:**

```typescript
import { FITDecoder, DecodedFITData } from "./decoder";
import {
  calculateNormalizedPower,
  calculateTSS,
  calculateIntensityFactor,
} from "../metrics";

export interface FITParseOptions {
  validateChecksum?: boolean;
  extractMetrics?: boolean;
  generatePolyline?: boolean;
}

export interface ParsedFITActivity {
  // Summary data
  id: string;
  type: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  distance: number;

  // Power metrics
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;
  intensityFactor?: number;
  tss?: number;

  // Heart rate metrics
  avgHeartRate?: number;
  maxHeartRate?: number;
  hrZones?: number[];

  // Cadence metrics
  avgCadence?: number;
  maxCadence?: number;

  // Speed metrics
  avgSpeed: number;
  maxSpeed: number;

  // Location data
  polyline?: string;
  elevationGain?: number;

  // Device info
  device?: {
    manufacturer: string;
    product: number;
    softwareVersion: number;
  };

  // Raw data
  records: number;
  laps: number;

  // Processing metadata
  processedAt: Date;
  warnings?: string[];
}

export async function parseFIT(
  buffer: ArrayBuffer,
  options: FITParseOptions = {},
): Promise<ParsedFITActivity> {
  const {
    validateChecksum = true,
    extractMetrics = true,
    generatePolyline = true,
  } = options;

  const decoder = new FITDecoder(buffer);

  // Validate file
  if (validateChecksum && !decoder.isValid()) {
    throw new Error("Invalid or corrupted FIT file");
  }

  const data = decoder.decode();
  const errors = decoder.getErrors();

  // Extract session data
  const session = data.sessions[0];
  const firstRecord = data.records[0];
  const lastRecord = data.records[data.records.length - 1];

  // Calculate derived values
  const duration = session?.totalElapsedTime || 0;
  const distance = session?.distance || 0;
  const avgSpeed = duration > 0 ? distance / duration : 0;

  // Extract power readings for metrics
  const powerReadings = data.records
    .map((r) => r.power)
    .filter((p) => p !== undefined && p > 0);

  // Extract HR readings
  const hrReadings = data.records
    .map((r) => r.heartRate)
    .filter((h) => h !== undefined && h > 0);

  // Calculate metrics
  const normalizedPower = extractMetrics
    ? calculateNormalizedPower(powerReadings)
    : undefined;

  // Generate polyline
  let polyline: string | undefined;
  if (generatePolyline) {
    const gpsPoints = data.records
      .filter(
        (r) => r.positionLat !== undefined && r.positionLong !== undefined,
      )
      .map((r) => [
        semicirclesToDegrees(r.positionLat!),
        semicirclesToDegrees(r.positionLong!),
      ]);

    if (gpsPoints.length > 0) {
      polyline = encodePolyline(gpsPoints);
    }
  }

  return {
    id: generateActivityId(),
    type: mapSportType(session?.sport || "generic"),
    startTime: session?.startTime || firstRecord?.timestamp || new Date(),
    endTime: lastRecord?.timestamp || new Date(),
    duration,
    distance,
    avgPower: session?.avgPower,
    maxPower: session?.maxPower,
    normalizedPower,
    intensityFactor: undefined, // Calculated with FTP
    tss: undefined, // Calculated with FTP
    avgHeartRate: session?.avgHeartRate,
    maxHeartRate: session?.maxHeartRate,
    avgCadence: session?.avgCadence,
    maxCadence: session?.maxCadence,
    avgSpeed,
    maxSpeed: session?.maxSpeed || 0,
    polyline,
    elevationGain: undefined, // Would need lap data for this
    device: data.fileId
      ? {
          manufacturer: data.fileId.manufacturer,
          product: data.fileId.product,
          softwareVersion: data.deviceInfo[0]?.softwareVersion,
        }
      : undefined,
    records: data.records.length,
    laps: data.laps.length,
    processedAt: new Date(),
    warnings: errors.map((e) => e.message),
  };
}

// ===== Helper Functions =====

function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}

function encodePolyline(points: number[][]): string {
  // Implementation using @mapbox/polyline
  // This is a placeholder - actual implementation would use the library
  const polyline = require("@mapbox/polyline");
  return polyline.encode(points);
}

function generateActivityId(): string {
  return `fit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function mapSportType(sport: string): string {
  const sportMap: Record<string, string> = {
    running: "run",
    cycling: "bike",
    swimming: "swim",
    walking: "walk",
    hiking: "hike",
    elliptical: "elliptical",
    rowing: "row",
    strength: "strength",
    cardio: "cardio",
    fitness_equipment: "bike",
    cross_country_skiing: "ski",
    trail_running: "run",
    virtual_activity: "bike",
  };
  return sportMap[sport.toLowerCase()] || "workout";
}
```

---

## Part 5: Mobile Recording Integration

### 5.1 ActivityRecorder Enhancement

**apps/mobile/lib/services/ActivityRecorder/index.ts:**

```typescript
import { EventEmitter } from "events";
import { Encoder, Profile, Utils } from "@garmin/fitsdk";

interface RecordingMetadata {
  activityId: string;
  profileId: string;
  activityCategory: string;
  startedAt: Date;
  profile?: {
    functional_threshold_power?: number;
    max_heart_rate?: number;
    weight?: number;
  };
}

interface SensorReading {
  timestamp: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
}

interface LocationReading {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
}

interface ServiceEvents {
  stateChange: { previousState: string; newState: string };
  error: { error: Error };
  metricsUpdate: { metrics: RecordingMetrics };
}

interface RecordingMetrics {
  duration: number;
  distance: number;
  avgPower?: number;
  maxPower?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgSpeed: number;
}

export class ActivityRecorderService extends EventEmitter<ServiceEvents> {
  // Existing properties
  private state: string = "idle";
  private recordingMetadata: RecordingMetadata | null = null;

  // FIT encoding properties
  private fitEncoder: FITEncoder | null = null;
  private fitFileBuffer: Uint8Array | null = null;
  private fitFilePath: string | null = null;

  // Existing implementation continues...
  // [Previous code preserved]

  // ===== FIT Encoding Methods =====

  async startRecording(metadata: RecordingMetadata): Promise<void> {
    this.recordingMetadata = metadata;

    // Initialize FIT encoder
    this.fitEncoder = new FITEncoder({
      activityType: metadata.activityCategory,
      startTime: metadata.startedAt,
      profileId: metadata.profileId,
      ftp: metadata.profile?.functional_threshold_power,
      weight: metadata.profile?.weight,
    });

    await this.fitEncoder.initialize();

    this.emit("stateChange", { previousState: "ready", newState: "recording" });
  }

  private handleSensorReading(reading: SensorReading): void {
    // Existing sensor handling code...
    // [Previous code preserved]

    // Add to FIT encoder
    if (this.fitEncoder && reading.timestamp) {
      this.fitEncoder.addRecord({
        timestamp: reading.timestamp / 1000, // Convert to seconds
        heartRate: reading.heartRate,
        power: reading.power,
        cadence: reading.cadence,
        speed: reading.speed,
      });
    }
  }

  private handleLocationUpdate(location: LocationReading): void {
    // Existing location handling code...
    // [Previous code preserved]

    // Add GPS to FIT encoder
    if (this.fitEncoder) {
      this.fitEncoder.addLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        altitude: location.altitude,
        timestamp: location.timestamp / 1000,
      });
    }
  }

  async finishRecording(): Promise<void> {
    // Existing finish code...
    // [Previous code preserved]

    // Finalize FIT file
    if (this.fitEncoder) {
      this.fitFileBuffer = await this.fitEncoder.finish();
      this.fitFilePath = `${this.recordingMetadata?.profileId}/${Date.now()}.fit`;

      this.emit("metricsUpdate", {
        metrics: this.fitEncoder.getSummaryMetrics(),
      });
    }
  }

  getFitFileBuffer(): Uint8Array | null {
    return this.fitFileBuffer;
  }

  getFitFilePath(): string | null {
    return this.fitFilePath;
  }
}
```

### 5.2 FIT Encoder Implementation

**apps/mobile/lib/services/fit/FITEncoder.ts:**

```typescript
import { Encoder, Profile, Utils } from "@garmin/fitsdk";

interface EncoderOptions {
  activityType: string;
  startTime: Date;
  profileId: string;
  ftp?: number;
  weight?: number;
}

interface RecordData {
  timestamp: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
}

interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
}

interface SummaryMetrics {
  duration: number;
  distance: number;
  avgPower: number;
  maxPower: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgSpeed: number;
  maxSpeed: number;
}

export class FITEncoder {
  private encoder: Encoder;
  private startTime: Date;
  private localTimestampOffset: number;
  private recordCount: number = 0;
  private startTimestamp: number;

  // Summary tracking
  private totalDistance: number = 0;
  private maxPower: number = 0;
  private totalPower: number = 0;
  private maxHeartRate: number = 0;
  private totalHeartRate: number = 0;
  private maxSpeed: number = 0;
  private speedReadings: number[] = [];

  constructor(private options: EncoderOptions) {
    this.encoder = new Encoder();
    this.startTime = options.startTime;
    this.localTimestampOffset = new Date().getTimezoneOffset() * -60;
    this.startTimestamp = Utils.convertDateToDateTime(this.startTime);
  }

  async initialize(): Promise<void> {
    // Write FILE_ID message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.FILE_ID,
      type: "activity",
      manufacturer: "gradientpeak",
      product: 1,
      timeCreated: Utils.convertDateToDateTime(this.startTime),
      serialNumber: parseInt(
        this.options.profileId.replace(/-/g, "").slice(0, 8),
        16,
      ),
    });

    // Write DEVICE_INFO message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.DEVICE_INFO,
      deviceIndex: "creator",
      manufacturer: "gradientpeak",
      productName: "GradientPeak Mobile",
      timestamp: Utils.convertDateToDateTime(new Date()),
      softwareVersion: 1,
      hardwareVersion: 1,
    });

    // Write timer start event
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: Utils.convertDateToDateTime(this.startTime),
      event: "timer",
      eventType: "start_all",
      eventGroup: 0,
    });
  }

  addRecord(data: RecordData): void {
    const timestamp = Utils.convertDateToDateTime(
      new Date(data.timestamp * 1000),
    );

    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp,
      heartRate: data.heartRate,
      cadence: data.cadence,
      power: data.power,
      distance: this.totalDistance,
      speed: data.speed,
    });

    this.recordCount++;

    // Update summary tracking
    if (data.power !== undefined) {
      this.totalPower += data.power;
      this.maxPower = Math.max(this.maxPower, data.power);
    }

    if (data.heartRate !== undefined) {
      this.totalHeartRate += data.heartRate;
      this.maxHeartRate = Math.max(this.maxHeartRate, data.heartRate);
    }

    if (data.speed !== undefined) {
      this.speedReadings.push(data.speed);
      this.maxSpeed = Math.max(this.maxSpeed, data.speed);
    }

    if (data.distance !== undefined) {
      this.totalDistance = data.distance;
    }
  }

  addLocation(data: LocationData): void {
    const timestamp = Utils.convertDateToDateTime(
      new Date(data.timestamp * 1000),
    );

    const latSemicircles = degreesToSemicircles(data.latitude);
    const lonSemicircles = degreesToSemicircles(data.longitude);

    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp,
      positionLat: latSemicircles,
      positionLong: lonSemicircles,
      altitude: data.altitude,
    });
  }

  async finish(): Promise<Uint8Array> {
    const endTimestamp = Utils.convertDateToDateTime(new Date());
    const totalTime = endTimestamp - this.startTimestamp;

    // Write timer stop event
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: endTimestamp,
      event: "timer",
      eventType: "stop_all",
      eventGroup: 0,
    });

    // Write LAP message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LAP,
      messageIndex: 0,
      timestamp: endTimestamp,
      startTime: Utils.convertDateToDateTime(this.startTime),
      totalElapsedTime: totalTime,
      totalTimerTime: totalTime,
      totalDistance: this.totalDistance,
      avgSpeed:
        this.speedReadings.length > 0
          ? this.speedReadings.reduce((a, b) => a + b, 0) /
            this.speedReadings.length
          : 0,
      maxSpeed: this.maxSpeed,
    });

    // Write SESSION message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.SESSION,
      messageIndex: 0,
      timestamp: endTimestamp,
      startTime: Utils.convertDateToDateTime(this.startTime),
      totalElapsedTime: totalTime,
      totalTimerTime: totalTime,
      totalDistance: this.totalDistance,
      sport: mapSportToFit(this.options.activityType),
      avgSpeed:
        this.speedReadings.length > 0
          ? this.speedReadings.reduce((a, b) => a + b, 0) /
            this.speedReadings.length
          : 0,
      maxSpeed: this.maxSpeed,
      avgPower: this.recordCount > 0 ? this.totalPower / this.recordCount : 0,
      maxPower: this.maxPower,
      avgHeartRate:
        this.recordCount > 0 ? this.totalHeartRate / this.recordCount : 0,
      maxHeartRate: this.maxHeartRate,
      firstLapIndex: 0,
      numLaps: 1,
    });

    // Write ACTIVITY message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.ACTIVITY,
      timestamp: endTimestamp,
      numSessions: 1,
      localTimestamp: endTimestamp + this.localTimestampOffset,
      totalTimerTime: totalTime,
    });

    return this.encoder.close();
  }

  getSummaryMetrics(): SummaryMetrics {
    const avgPower =
      this.recordCount > 0 ? this.totalPower / this.recordCount : 0;
    const avgHeartRate =
      this.recordCount > 0 ? this.totalHeartRate / this.recordCount : 0;
    const avgSpeed =
      this.speedReadings.length > 0
        ? this.speedReadings.reduce((a, b) => a + b, 0) /
          this.speedReadings.length
        : 0;

    return {
      duration: this.recordCount,
      distance: this.totalDistance,
      avgPower,
      maxPower: this.maxPower,
      avgHeartRate,
      maxHeartRate: this.maxHeartRate,
      avgSpeed,
      maxSpeed: this.maxSpeed,
    };
  }
}

// ===== Helper Functions =====

function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

function mapSportToFit(activityType: string): string {
  const sportMap: Record<string, string> = {
    run: "running",
    bike: "cycling",
    swim: "swimming",
    walk: "walking",
    hike: "hiking",
    elliptical: "elliptical",
    row: "rowing",
    strength: "strength",
    workout: "cardio",
  };
  return sportMap[activityType.toLowerCase()] || "generic";
}
```

---

## Part 6: Async Processing Workflow

### 6.1 Processing Status States

```sql
-- Database column definition
processing_status TEXT DEFAULT 'PENDING'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
processing_error TEXT
processing_started_at TIMESTAMPTZ
processing_completed_at TIMESTAMPTZ
retry_count INTEGER DEFAULT 0
```

### 6.2 State Transition Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROCESSING STATUS WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐     ┌─────────────┐     ┌─────────────┐                       │
│   │ PENDING │────▶│ PROCESSING  │────▶│  COMPLETED  │                       │
│   └─────────┘     └─────────────┘     └─────────────┘                       │
│        │                                       ▲                            │
│        │                                       │                            │
│        │           ┌─────────────┐             │                            │
│        │           │   FAILED    │─────────────┘                            │
│        │           └─────────────┘                                          │
│        │                 │                                                  │
│        │                 ▼                                                  │
│        │           ┌─────────────┐                                          │
│        └──────────▶│  RETRYING   │                                          │
│                    └─────────────┘                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 State Descriptions

| State      | Description                                              | Actions                                         |
| ---------- | -------------------------------------------------------- | ----------------------------------------------- |
| PENDING    | Activity created, FIT file uploaded, awaiting processing | Edge function triggers processing               |
| PROCESSING | FIT file being parsed and metrics calculated             | User sees "Processing..." badge                 |
| COMPLETED  | Processing successful, metrics stored                    | User sees activity with all metrics             |
| FAILED     | Processing failed with error                             | User sees error message, retry button available |
| RETRYING   | Retry initiated, resetting to PENDING                    | Processing will restart                         |

### 6.4 Processing Flow

```
1. User completes activity recording
2. Mobile app uploads FIT file to storage bucket
3. tRPC mutation creates activity with:
   - fit_file_path = uploaded file path
   - processing_status = 'PENDING'
   - processing_started_at = NOW()
4. tRPC mutation invokes Edge Function:
   POST /functions/v1/process-activity-fit
   { activityId: "uuid" }
5. Edge Function:
   a. Updates status to 'PROCESSING'
   b. Downloads FIT file from storage
   c. Parses FIT file with @garmin/fitsdk
   d. Calculates metrics (TSS, IF, NP, zones)
   e. Generates GPS polyline
   f. Updates activity with results
   g. Updates status to 'COMPLETED' or 'FAILED'
6. Mobile app polls for status updates
7. User sees final metrics in UI
```

### 6.5 Error Handling and Retry

```typescript
// Retry logic with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Retry endpoint
export const retryProcessing = t.procedure
  .input(z.object({ activityId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const { activityId } = input;

    // Check current status
    const { data: activity } = await ctx.supabase
      .from("activities")
      .select("processing_status, retry_count")
      .eq("id", activityId)
      .single();

    if (!activity) {
      throw new Error("Activity not found");
    }

    if (activity.processing_status === "PROCESSING") {
      throw new Error("Activity is currently being processed");
    }

    // Check retry limit
    if (activity.retry_count >= 3) {
      throw new Error("Maximum retry limit reached");
    }

    // Increment retry count and reset status
    const { error: updateError } = await ctx.supabase
      .from("activities")
      .update({
        processing_status: "PENDING",
        processing_error: null,
        retry_count: activity.retry_count + 1,
      })
      .eq("id", activityId);

    if (updateError) {
      throw new Error(`Failed to update activity: ${updateError.message}`);
    }

    // Re-trigger processing
    await ctx.supabase.functions.invoke("process-activity-fit", {
      body: { activityId },
    });

    return { success: true, message: "Processing retry initiated" };
  });
```

### 6.6 Monitoring and Metrics

```typescript
// Processing metrics tracking
interface ProcessingMetrics {
  activityId: string;
  processingTime: number; // milliseconds
  fileSize: number;
  recordCount: number;
  status: "SUCCESS" | "FAILED";
  error?: string;
}

// Log processing metrics for monitoring
async function logProcessingMetrics(metrics: ProcessingMetrics): Promise<void> {
  await supabase.from("processing_logs").insert({
    activity_id: metrics.activityId,
    processing_time_ms: metrics.processingTime,
    file_size_bytes: metrics.fileSize,
    record_count: metrics.recordCount,
    status: metrics.status,
    error_message: metrics.error,
    created_at: new Date().toISOString(),
  });
}

// Query for monitoring dashboard
const getProcessingStats = async (startDate: Date, endDate: Date) => {
  const { data } = await supabase
    .from("processing_logs")
    .select("status, processing_time_ms, file_size_bytes")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  return {
    totalProcessed: data.length,
    successRate:
      (data.filter((d) => d.status === "SUCCESS").length / data.length) * 100,
    avgProcessingTime:
      data.reduce((sum, d) => sum + d.processing_time_ms, 0) / data.length,
    avgFileSize:
      data.reduce((sum, d) => sum + d.file_size_bytes, 0) / data.length,
  };
};
```

---

## Part 7: Database Schema Integration

### 7.1 Updated Activities Table

```sql
-- Migration: packages/supabase/migrations/20260121_add_fit_file_support.sql

-- Add FIT file support columns
ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN processing_status TEXT DEFAULT 'PENDING'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));
ALTER TABLE activities ADD COLUMN processing_error TEXT;
ALTER TABLE activities ADD COLUMN processing_started_at TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN processing_completed_at TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN fit_file_size INTEGER;
ALTER TABLE activities ADD COLUMN retry_count INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX idx_activities_processing_status ON activities(processing_status);
CREATE INDEX idx_activities_fit_path ON activities(fit_file_path) WHERE fit_file_path IS NOT NULL;
CREATE INDEX idx_activities_retry_count ON activities(retry_count) WHERE retry_count > 0;

-- Add processing logs table
CREATE TABLE processing_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  processing_time_ms INTEGER,
  file_size_bytes BIGINT,
  record_count INTEGER,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_processing_logs_activity ON processing_logs(activity_id);
CREATE INDEX idx_processing_logs_created_at ON processing_logs(created_at);
```

### 7.2 Zod Schema Updates

**packages/supabase/supazod/schemas.ts:**

```typescript
// Add to publicActivitiesInsertSchema
export const publicActivitiesInsertSchema = z.object({
  // ... existing fields ...

  fit_file_path: z.string().optional().nullable(),
  processing_status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"])
    .optional(),
  processing_error: z.string().optional().nullable(),
  processing_started_at: z.date().optional(),
  processing_completed_at: z.date().optional(),
  fit_file_size: z.number().optional(),
  retry_count: z.number().int().min(0).max(10).optional(),
});

// Processing status enum for UI
export const ProcessingStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;
```

---

## Part 8: Testing Strategy

### 8.1 Unit Tests

**packages/core/src/metrics/**tests**/tss.test.ts:**

```typescript
import { describe, it, expect } from "vitest";
import { calculateTSS, calculateIntensityFactor } from "../tss";
import { calculateNormalizedPower } from "../normalized-power";

describe("TSS Calculation", () => {
  it("calculates TSS correctly for 60 minute threshold effort", () => {
    const np = calculateNormalizedPower([250, 250, 250]);
    const tss = calculateTSS(np, 250, 60);
    expect(tss).toBe(100);
  });

  it("calculates TSS for below threshold effort", () => {
    const np = calculateNormalizedPower([200, 200, 200]);
    const tss = calculateTSS(np, 250, 60);
    expect(tss).toBeCloseTo(64, 0);
  });

  it("calculates TSS for above threshold effort", () => {
    const np = calculateNormalizedPower([300, 300, 300]);
    const tss = calculateTSS(np, 250, 60);
    expect(tss).toBeCloseTo(144, 0);
  });

  it("handles zero threshold power", () => {
    const tss = calculateTSS(250, 0, 60);
    expect(tss).toBe(0);
  });
});

describe("Intensity Factor", () => {
  it("calculates IF at threshold", () => {
    const ifactor = calculateIntensityFactor(250, 250);
    expect(ifactor).toBe(1.0);
  });

  it("calculates IF below threshold", () => {
    const ifactor = calculateIntensityFactor(200, 250);
    expect(ifactor).toBe(0.8);
  });

  it("calculates IF above threshold", () => {
    const ifactor = calculateIntensityFactor(300, 250);
    expect(ifactor).toBe(1.2);
  });
});
```

### 8.2 Integration Tests

```typescript
// tests/integration/fit-processing.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { parseFIT } from "@repo/core/fit/parser";

describe("FIT Processing Integration", () => {
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  });

  it("processes Garmin FIT file and stores metrics", async () => {
    // Upload test FIT file
    const fitBuffer = await Deno.readFile("tests/fixtures/garmin-activity.fit");

    // Parse FIT file
    const activity = await parseFIT(fitBuffer.buffer, {
      extractMetrics: true,
      generatePolyline: true,
    });

    // Verify parsed data
    expect(activity.type).toBe("bike");
    expect(activity.distance).toBeGreaterThan(0);
    expect(activity.records).toBeGreaterThan(0);

    // Store in database
    const { data, error } = await supabase
      .from("activities")
      .insert({
        id: activity.id,
        name: "Test Activity",
        type: activity.type,
        started_at: activity.startTime,
        finished_at: activity.endTime,
        duration_seconds: activity.duration,
        distance_meters: activity.distance,
        metrics: {
          normalizedPower: activity.normalizedPower,
          tss: activity.tss,
          intensityFactor: activity.intensityFactor,
        },
        processing_status: "COMPLETED",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.metrics?.normalizedPower).toBeDefined();
  });
});
```

---

## Part 9: Deployment and CI/CD

### 9.1 GitHub Actions Workflow

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [opened, synchronize]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
  SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
  SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}

jobs:
  build:
    name: Build and Test
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Supabase types
        run: pnpm supabase:generate-types

      - name: Run build
        run: pnpm build

      - name: Run tests
        run: pnpm test

      - name: Run lint
        run: pnpm lint

  deploy-functions:
    name: Deploy Edge Functions
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Deploy Supabase Functions
        run: |
          cd apps/functions
          supabase link --project-ref $SUPABASE_PROJECT_ID
          supabase functions deploy process-activity-fit \
            --no-verify-jwt \
            --project-ref $SUPABASE_PROJECT_ID
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

---

## Appendix A: Related Files Reference

| Component            | Path                                                              |
| -------------------- | ----------------------------------------------------------------- |
| Database Schema      | `packages/supabase/schemas/init.sql`                              |
| Zod Schemas          | `packages/supabase/supazod/schemas.ts`                            |
| Database Types       | `packages/supabase/database.types.ts`                             |
| Activities Router    | `packages/trpc/src/routers/activities.ts`                         |
| FIT Files Router     | `packages/trpc/src/routers/fit-files.ts`                          |
| Core FIT Parser      | `packages/core/src/fit/parser.ts`                                 |
| Core FIT Decoder     | `packages/core/src/fit/decoder.ts`                                |
| Mobile Recorder      | `apps/mobile/lib/services/ActivityRecorder/index.ts`              |
| Mobile Encoder       | `apps/mobile/lib/services/fit/FITEncoder.ts`                      |
| Edge Function        | `apps/functions/supabase/functions/process-activity-fit/index.ts` |
| Edge Function Config | `apps/functions/supabase/config.toml`                             |
| Turbo Config         | `turbo.json`                                                      |
| Workspace Config     | `pnpm-workspace.yaml`                                             |

---

## Appendix B: Key Decisions Log

| Decision                | Options                           | Recommendation                | Rationale                                                      |
| ----------------------- | --------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| **FIT SDK**             | @garmin/fitsdk vs custom parser   | @garmin/fitsdk v21.188.0      | Official Garmin SDK, handles all message types, CRC validation |
| **Monorepo Tool**       | Turborepo vs Nx vs Lerna          | Turborepo                     | Best TypeScript support, remote caching, simple config         |
| **Package Manager**     | npm vs yarn vs pnpm               | pnpm 9.0+                     | Fast installs, workspace protocol, disk efficient              |
| **Edge Runtime**        | Node.js vs Deno                   | Deno (Supabase default)       | Native TypeScript, npm import support, cold starts             |
| **Processing Trigger**  | Database trigger vs tRPC mutation | tRPC mutation                 | More control, better error handling, retry support             |
| **Metrics Storage**     | Individual columns vs JSONB       | JSONB                         | Flexible, schema evolution, less migrations                    |
| **Processing Location** | Mobile vs Server                  | Mobile encode, Server process | Battery efficiency on mobile, compute on server                |

---

## Changelog

### Version 3.0.0 (2026-01-22) - Research Integration Edition

**Major Changes:**

- Integrated Turborepo monorepo configuration with database type generation pipeline
- Added Supabase Edge Functions best practices with Deno 2.x configuration
- Implemented comprehensive core package architecture with barrel exports
- Documented @garmin/fitsdk v21.188.0 usage patterns in detail
- Added async processing workflow with state machine and retry logic
- Included React Native polyfills for Node.js built-ins
- Added processing logs table for monitoring and metrics

**Technical Updates:**

- Updated turbo.json with database migration dependencies
- Added pnpm workspace configuration for all packages
- Implemented type-safe Supabase client with database types
- Documented FIT file encoding for mobile recording
- Added comprehensive metric calculation functions
- Included error handling and retry patterns

**Testing Updates:**

- Added unit tests for metrics calculations
- Included integration test patterns
- Added monitoring and metrics tracking

### Version 2.0.0 (2026-01-22)

- Initial specification from research phase

---

**Document Version:** 3.0.0  
**Last Updated:** January 22, 2026  
**Next Review:** Before starting Phase 2  
**Owner:** Coordinator
