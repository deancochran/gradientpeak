# @repo/core - GradientPeak Core Package

The shared heart of GradientPeak, providing business logic, calculations, schemas, and app-facing contracts across all applications.

## 🎯 Purpose

This package contains **pure TypeScript** business logic and should remain **database-client free at its public boundary**. It serves as the single source of truth for:

- **Type Definitions** - Shared interfaces and types
- **Zod Schemas** - Data validation and JSON schema validation
- **Calculations** - Training metrics, analytics, and performance algorithms
- **Business Logic** - Platform-agnostic core functionality

## 📦 Package Structure

```
packages/core/
├── calculations/           # Performance and training calculations
│   ├── hr.ts              # Heart rate zone calculations
│   ├── power.ts           # Power metrics and FTP calculations
│   ├── training-load.ts   # CTL/ATL/TSB and training stress
│   ├── training-plan.ts   # Plan validation and progression
│   └── utils.ts           # Calculation utilities
├── constants/             # App-wide constants and enums
├── schemas/               # Zod validation schemas
│   ├── planned_activity.ts # Activity structure validation
│   ├── profile_plan.ts    # Training plan schemas
│   └── index.ts           # Schema exports
├── types/                 # TypeScript type definitions
└── index.ts               # Main package exports
```

## 🚀 Key Features

### Boundary Policy
- **No database clients or framework wiring** - `@repo/core` must not import Supabase clients, React, or app runtime code
- **Own domain contracts here** - Prefer package-owned Zod schemas and helper types for public exports
- **Adapt database shapes at the edge** - Transform Supabase-generated rows before they become core-facing contracts
- **Platform agnostic** - Shared logic runs in mobile, web, and server environments
- **Fully testable** - Unit tests should not require database or network mocking

### Zod Schema Validation
- **Activity structures** - Complex activity step validation
- **Training plans** - Plan configuration and progression rules
- **Profile data** - User preferences and fitness metrics
- **JSON compatibility** - Validates data from any source

### Performance Calculations
- **Training Stress Score (TSS)** - Activity intensity quantification
- **Training Load Analytics** - CTL/ATL/TSB progression modeling
- **Heart Rate Zones** - Age and threshold-based zone calculations
- **Power Metrics** - FTP, normalized power, intensity factors

## 📖 Usage Examples

### Training Load Calculations

```typescript
import { analyzeTrainingLoad, calculateTSS } from '@repo/core/calculations';

// Calculate TSS for an activity
const tss = calculateTSS({
  normalizedPower: 250,
  duration: 3600, // seconds
  ftp: 300
});

// Analyze training load progression
const progression = analyzeTrainingLoad(activities, {
  ctlTime: 42, // days
  atlTime: 7   // days
});
```

### Schema Validation

```typescript
import { profilePlanConfigSchema } from '@repo/core/schemas';

// Validate training plan structure
const planConfig = {
  version: "1.0",
  progression: {
    rampRateCTL: 5.0,
    recoveryStructure: { work: 3, recover: 1 }
  }
};

const validated = profilePlanConfigSchema.parse(planConfig);
```

### Heart Rate Zone Calculations

```typescript
import { calculateHeartRateZones } from '@repo/core/calculations';

const zones = calculateHeartRateZones({
  maxHR: 190,
  thresholdHR: 165,
  age: 30
});
// Returns: { Z1: [0, 142], Z2: [142, 155], ... }
```

## 🔧 Development

### Building
```bash
cd packages/core
npm build    # Build TypeScript
npm test     # Run unit tests (no database required)
```

### Testing
The core package includes comprehensive unit tests that run without any database or external dependencies:

```bash
npm test     # All core tests
npm coverage # Test coverage report
```

## 🏗️ Architecture Benefits

### Type Safety
- **End-to-end types** - From JSON validation to UI components
- **Schema-driven** - Types generated from Zod schemas
- **Compile-time safety** - Catch errors before runtime

### Performance
- **Client-side calculations** - No API calls required for metrics
- **Optimized algorithms** - Efficient training load calculations
- **Minimal bundle size** - Pure TypeScript with minimal dependencies

### Maintainability
- **Single source of truth** - Business logic centralized
- **Platform consistency** - Same calculations across all apps
- **Easy testing** - Pure functions with no side effects

## 📋 Dependencies

### Runtime Dependencies
- `zod` - Schema validation and type generation

### Development Dependencies
- `@repo/typescript-config` - Shared TypeScript configuration
- `@repo/eslint-config` - Linting rules
- `typescript` - TypeScript compiler

## 🔄 Integration

This package is consumed by:

- **Mobile App (`apps/mobile`)** - Activity recording and analysis
- **Web Dashboard (`apps/web`)** - Analytics and reporting
- **Backend APIs** - Server-side calculations and validation

All consuming applications import from the core package for consistent business logic and type safety.

## 🧪 Testing Philosophy

The core package follows a **pure function** testing approach:

- **No mocking required** - All functions are deterministic
- **Fast execution** - Tests run in milliseconds
- **High coverage** - Critical business logic fully tested
- **Regression safety** - Algorithm changes caught immediately

This ensures the core business logic remains reliable across all platforms and use cases.
