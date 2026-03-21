# GradientPeak 🏃‍♂️

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. GradientPeak delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

## 🛠️ Developer Experience & Tooling

### Modern Development Stack

- **Turborepo + pnpm** - High-performance monorepo build system with workspace-aware package management
- **TypeScript 5.9** - Full type safety with strict mode and modern features
- **Biome** - Consistent formatting and linting across the monorepo
- **tRPC v11** - End-to-end type-safe API layer with React Query integration
- **Zustand** - Lightweight state management with persistence middleware

### Development Workflow

- **Hot Reloading** - Instant updates across mobile and web during development
- **Shared Tooling** - Consistent Biome and TypeScript configurations
- **Parallel Execution** - Turborepo caching for fast build and test runs
- **Type Safety** - Full-stack type sharing between frontend and backend

### Build & Deployment

- **Expo EAS Build** - Cloud builds for iOS and Android with over-the-air updates
- **Vercel Deployment** - Automatic deployments for web dashboard
- **Turborepo Pipelines** - Optimized build and test execution
- **Environment Management** - Consistent environments across development and production

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. GradientPeak delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

---

## 🏗️ Architecture Overview

GradientPeak is organized as a **Turborepo monorepo** with modular packages:

### 📦 Core Package (`packages/core`)

The heart of GradientPeak, shared across web, mobile, and backend apps. **Completely independent of database or ORM dependencies.**

**Responsibilities:**

- **Type Definitions & Schemas** — Zod validation for profiles, activities, activities, and flexible JSON structures
- **Calculations & Analytics** — Training zones, TSS, normalized power, compliance scoring, CTL/ATL/TSB
- **Business Logic** — Activity plan validation, progression, and adaptive algorithms
- **Utilities** — Time/duration helpers, unit conversions, constants
- **Platform Agnostic** — Pure TypeScript with no database, ORM, or platform-specific dependencies

**Key Benefit:** Single source of truth ensures consistent calculations, type safety, and validation across all applications while remaining completely portable and testable in isolation.

---

### 📦 TypeScript Config Package (`packages/typescript-config`)

A shared TypeScript configuration used across all apps and packages in the GradientPeak monorepo.

**Responsibilities:**

- **Centralized TS Configuration** — Base `tsconfig` defines compiler options, strict type checking, and module resolution
- **Standardized Paths & Aliases** — Ensures consistent `@/*` imports across apps
- **Extensible per App** — Apps can extend the base config for Next.js, Expo, or library-specific overrides
- **Version Control** — Single source of truth for TypeScript settings to reduce discrepancies and errors

**Key Benefit:** All apps and packages share a **consistent TypeScript environment**, simplifying cross-package type safety and refactoring.

---

### 📦 Repo Tooling

GradientPeak uses shared repo-level tooling for formatting, linting, and workspace automation.

**Responsibilities:**

- **Biome** — Linting and formatting across apps and packages
- **Turborepo** — Task orchestration, caching, and workspace builds
- **pnpm Workspaces** — Shared dependency and package management
- **TypeScript Config** — Consistent compiler settings through `@repo/typescript-config`

**Key Benefit:** Provides **uniform developer workflows** across the monorepo without duplicating tool configuration by package.

---

### 📱 Mobile App (`apps/mobile`)

- **Expo SDK 54 + React Native 0.81.5** - Modern React Native development with new architecture
- **Expo Router v6** - File-based routing with fully typed routes and deep linking
- **NativeWind v5 Preview** - Utility styling for React Native and shared UI work
- **tRPC + React Query** - Type-safe API calls with caching and optimistic updates
- **Zustand + AsyncStorage** - Persistent local state management
- **Expo SQLite + FileSystem** - Offline-first data persistence
- **React Native BLE PLX** - Bluetooth Low Energy device integration
- **React Native Reanimated** - Smooth 60fps animations and gestures

**Developer Experience Features:**

- Hot reloading with Fast Refresh
- Native module development with Expo Dev Client
- Comprehensive debugging tools (Flipper, React DevTools)
- Type-safe navigation with Expo Router
- Shared business logic with `@repo/core` package

* Expo + React Native
* Local-first storage with SQLite for offline recording
* Powered by `@repo/core` for validation and calculations (database-independent)
* Cloud sync handled via API endpoints

---

### 🌐 Web Dashboard (`apps/web`)

- **Next.js 15 + React 19** - Modern React framework with App Router
- **tRPC + React Query** - Type-safe API layer with server-side rendering
- **Tailwind CSS** - Utility-first CSS framework with dark mode
- **Shadcn/ui** - Accessible component library built on Radix UI
- **Zod** - Schema validation with TypeScript integration
- **Supabase** - Real-time database and authentication

**Developer Experience Features:**

- Instant hot reloading with Next.js
- API route handlers with tRPC integration
- Automatic code splitting and optimization
- Type-safe data fetching with React Query
- Shared validation schemas from `@repo/core`

* Next.js + React
* Real-time analytics and dashboards
* Powered by `@repo/core` for calculations and validation

---

### 🔗 Shared Infrastructure & Packages

#### `@repo/core` - Business Logic & Calculations

- **Database Independent** - Pure TypeScript with no external dependencies
- **Zod Schemas** - Comprehensive validation for all data structures
- **Performance Calculations** - TSS, normalized power, training zones, CTL/ATL/TSB
- **Type Definitions** - Shared interfaces across mobile and web
- **Test Utilities** - Mock data generators and test helpers

#### `@repo/trpc` - API Layer & Types

- **tRPC Routers** - Type-safe API endpoints for all data operations
- **Shared Procedures** - Authentication, activities, profiles, analytics
- **Error Handling** - Consistent error types and handling patterns
- **Middleware** - Authentication, logging, and rate limiting

#### Repo Tooling - Code Quality & Automation

- **Biome** - Shared linting and formatting rules at the repo level
- **Turborepo** - Cached task execution across apps and packages
- **pnpm Workspaces** - Consistent package management and linking
- **TypeScript Config** - Shared compiler configuration via `@repo/typescript-config`

#### `@repo/typescript-config` - Type Safety

- **Base tsconfig** - Shared compiler options and strict settings
- **Path Mapping** - Consistent import aliases (`@/*`, `@repo/*`)
- **Module Resolution** - Standardized module resolution strategy
- **Target Environments** - Appropriate settings for Node.js, React Native, and browsers

* **Turborepo + pnpm** - High-performance monorepo management
* **TypeScript Throughout** - End-to-end type safety from database to UI
* **Shared Core Package** - Database-independent business logic and calculations
* **tRPC API Layer** - Type-safe client-server communication
* **Local-First Architecture** - Offline recording with intelligent sync
* **Consistent Tooling** - Unified Biome and TypeScript configurations
* **Parallel Development** - Fast iteration with Turborepo caching

---

## 🧑‍💻 Profiles & Preferences

User-centric design anchors the system around **profiles** extended from `auth.users`. The core package provides enhanced profile interfaces and validation schemas for athlete-specific metrics:

| Field             | Description                                         |
| ----------------- | --------------------------------------------------- |
| `id`              | Primary key, UUID, FK → `auth.users.id`             |
| `threshold_hr`    | Threshold heart rate (bpm); nullable for new users  |
| `ftp`             | Functional Threshold Power (watts); nullable        |
| `weight_kg`       | Athlete's weight for power-to-weight calculations   |
| `gender`          | Used in predictive models and analytics             |
| `dob`             | Date of birth; calculates age-based zones & targets |
| `username`        | Unique public-facing handle                         |
| `language`        | Preferred UI language/locale                        |
| `preferred_units` | Metric vs imperial                                  |
| `avatar_url`      | Optional profile picture/avatar                     |
| `bio`             | Optional short biography                            |

The core package handles **profile validation**, **training zone calculations**, and **unit conversions** for personalized experiences.

---

## 📋 Training Plans & Planned Activities

### Profile Plans

`profile_plans` stores personalized training plans generated from library templates. The **core package** provides **plan validation**, **progression algorithms**, and **adaptation logic**.

### Planned Activities

`planned_activities` contains scheduled activities with flexible JSON structures validated by the **core package**:

- `structure` — Complex JSON objects defining activity steps
- `structure_version` — Version tracked by core package
- `requires_threshold_hr` / `requires_ftp` — Validated against core profile requirements
- Performance estimates calculated by core algorithms

**Activity Structure Features:**

- Nested repetitions and complex step sequences
- Multiple intensity target types with validation
- Duration units (time, distance, repetition)
- Intensity classes with core classification logic
- Portable format compatible with major training platforms

The core package ensures **valid activity structures**, calculates **estimated durations and training stress**, and provides **compliance scoring algorithms**.

---

## 🏃 Activity Storage & Performance Analysis

### JSON-First Activity Architecture

GradientPeak uses a **JSON-first approach** where all activity data is stored as the single source of truth:

- **Primary Storage** — Complete activity data stored as JSON in Supabase Storage
- **Local Recording** — Activities initially captured locally in SQLite as JSON
- **Cloud Sync** — JSON objects uploaded to Supabase Storage when network available
- **Metadata Generation** — Activity records created locally and synced after JSON storage
- **Stream Processing** — Activity streams generated from JSON after successful upload

**Data Flow:**

1. **Record** → Local SQLite stores complete activity as JSON
2. **Upload** → JSON object uploaded to Supabase Storage (source of truth)
3. **Process** → Activity metadata record generated locally and inserted
4. **Streams** → Activity streams generated and inserted after JSON processing
5. **Analytics** — Core package processes JSON for performance calculations

### Performance Analysis

Activity data flows through the **core package** for consistent analysis:

- **Performance Metrics** — TSS, normalized power, intensity factors calculated from JSON
- **Training Load Analytics** — CTL, ATL, TSB derived from activity metadata
- **Compliance Scoring** — Activity matching algorithms using JSON activity structure
- **Zone Analysis** — Training zone calculations using core package algorithms

### Activity Streams

Time-series data processed from JSON source through core package utilities:

- **Generated from JSON** — All streams derived from primary JSON activity data
- **Standardized Metrics** — Core package ensures consistent metric types and validation
- **Performance Curves** — Power/HR curves calculated from JSON streams
- **Real-time Processing** — Stream aggregation during activity recording

---

## 🔄 Local-First Architecture

- **Record Locally** — Expo-SQLite captures complete activities as JSON with core package validation
- **JSON Source of Truth** — All activity data stored primarily as JSON objects
- **Background Sync** — Core package ensures data integrity during upload process
- **Metadata Derivation** — Activity records and streams generated from JSON post-upload
- **Conflict Resolution** — Smart merging using JSON timestamps and core validation

---

## ✨ Key Features

### 🔄 Shared Business Logic via Core Package

- **Database Independent** — Core package has zero database dependencies
- **Consistent Calculations** — Same algorithms across platforms
- **Unified Validation** — JSON schema validation using Zod
- **Type Safety** — Full TypeScript support without ORM coupling
- **Client-side Performance** — Instant calculations without API calls

### 📊 Advanced Analytics

- **JSON-Derived Metrics** — All analytics calculated from JSON source data
- **Training Load Models** — CTL/ATL/TSB from activity metadata
- **Performance Analytics** — Power curves, trends from JSON streams
- **Compliance Tracking** — Plan adherence using JSON activity structures
- **Zone Analysis** — Heart rate and power zones from core calculations

### 🔐 Enterprise Security

- **Validated Data Integrity** — Core package schemas ensure data quality
- **Row Level Security** — Database-level access control
- **Encrypted Storage** — Secure local and cloud storage
- **Audit Logging** — Complete activity history preservation

### 🚀 Developer Experience

- **Independent Core Package** — Pure TypeScript, fully testable in isolation
- **End-to-end Type Safety** — From JSON validation to UI components
- **Hot Reloading** — Fast development iteration
- **Consistent Behavior** — Same business logic across all platforms

---

## 🛠️ Tech Stack

| Layer                | Mobile                          | Web                             | Shared Packages                |
| -------------------- | ------------------------------- | ------------------------------- | ------------------------------ |
| **Framework**        | Expo 54, React Native 0.81.5    | Next.js 15, React 19            | -                              |
| **Business Logic**   | `@repo/core`                    | `@repo/core`                    | Core calculations & validation |
| **API Layer**        | `@repo/trpc` + React Query      | `@repo/trpc` + React Query      | Type-safe API procedures       |
| **State Management** | Zustand + AsyncStorage          | Zustand + React Query           | Persistent state patterns      |
| **Local Storage**    | Expo SQLite + FileSystem        | -                               | JSON data structures           |
| **Cloud Services**   | Supabase Auth + Storage         | Supabase Auth + PostgreSQL      | Real-time capabilities         |
| **Styling**          | NativeWind v5 Preview + Reusables | Tailwind CSS + `@repo/ui`      | Design system consistency      |
| **Navigation**       | Expo Router v6                  | Next.js App Router              | Type-safe routing              |
| **Development**      | Turborepo + pnpm                | Turborepo + pnpm                | Monorepo tooling               |
| **Type Safety**      | TypeScript 5.9 + `@repo/typescript-config` | TypeScript 5.9 + `@repo/typescript-config` | Shared configurations |

---

## 📖 Development Guide

### Project Structure

```
gradientpeak/
├── apps/
│   ├── mobile/          # Mobile app (Expo + React Native)
│   └── web/             # Web dashboard (Next.js)
├── packages/
│   ├── core/            # 🌟 Database-independent business logic, types, calculations
```

### Core Package Structure & Development

The `@repo/core` package is designed for maximum portability and testability:

```typescript
// Example usage - completely database independent
import { calculateHrZones, validateActivity } from "@repo/core";

// Zone calculations using pure functions
const zones = calculateHrZones(threshold_hr, maxHr);

// JSON validation with Zod schemas
const validation = validateActivity(activityJson);
```

**Key Development Benefits:**

- 🚀 **Zero Dependencies** - No database, ORM, or platform-specific code
- 🧪 **Easy Testing** - Pure functions require no mocks or setup
- 🔄 **Consistent Behavior** - Same results across all platforms
- 📦 **Tree Shakable** - Only include what you use in final bundles
- ⚡ **Fast Execution** - No async operations or I/O delays

```
packages/core/
├── types/               # Platform-agnostic types and interfaces
├── schemas/             # Zod validation schemas for JSON data
├── calculations/        # Performance and training calculations
├── validators/          # Data validation utilities
└── utils/               # Shared utilities and constants
```

---

### Common Commands

**Root level:**

```bash
pnpm dev          # Start all development servers
pnpm build        # Build all applications including shared packages
pnpm lint         # Lint all code
pnpm test         # Run all tests
pnpm check-types  # Type check the monorepo
```

**Core package development:**

```bash
pnpm --dir packages/core check-types
pnpm --dir packages/core lint
pnpm --dir packages/core test
```

---

## 🔐 Authentication Flow

1. Supabase authentication with JWT tokens
2. Profile enhancement using core package type extensions
3. Data validation through core package schemas
4. Secure sync with core package integrity checks

### Mobile Authentication Autonomy

- **Self-Service Management**: Users can update email, password, and delete accounts directly from the mobile app.
- **Security Guards**:
  - **Verification Guard**: Blocks access to the app if an email change is pending.
  - **Onboarding Guard**: Enforces onboarding completion for new users.
  - **Force Re-authentication**: Critical actions like password resets force a fresh sign-in.
- **Deep Linking**: Uses `gradientpeak://` scheme for password resets and email verification.

---

## 📱 Mobile & 🌐 Web Dashboard Features

- **JSON-First Storage** — Single source of truth for all activity data
- **Real-time Validation** — Core package schemas ensure data quality
- **Client-side Analytics** — Performance calculations without server dependencies
- **Consistent Training Zones** — Core package algorithms across platforms
- **Intelligent Offline-first Sync** — JSON-based conflict resolution

---

## 🧪 Testing Strategy

**Testing Strategy & Developer Experience**

**Core Package Testing:**

- 🧪 **Pure Function Testing** - No database mocking required
- 📊 **Algorithm Validation** - Mathematical correctness of calculations
- 🎯 **Schema Testing** - JSON validation and type safety
- 🔄 **Cross-platform Consistency** - Same results across mobile and web
- ⚡ **Performance Testing** - Benchmark critical calculation functions

**Development Workflow:**

```bash
# Start all development servers
pnpm dev

# Run core package tests in watch mode
pnpm --filter @repo/core test

# Lint all code with shared configuration
pnpm lint

# Build all packages with Turborepo caching
pnpm build

# Type check entire monorepo
pnpm check-types
```

**Quality Assurance:**

- ✅ **Pre-commit Hooks** - Automatic linting and type checking
- 📋 **Code Reviews** - Consistent patterns across all packages
- 🚦 **CI/CD Pipeline** - Automated testing on every commit
- 📊 **Coverage Reports** - Comprehensive test coverage requirements
- 🔍 **Static Analysis** - Biome linting and TypeScript checking

* **Algorithm Validation** — Mathematical correctness of calculations
* **Schema Testing** — JSON validation and type safety
* **Pure Function Testing** — No database mocking required
* **Cross-platform Consistency** — Same results across mobile and web

**Application Testing & Debugging:**

**Mobile App Testing:**

- 📱 **Component Testing** - React Native component validation
- 🔗 **Integration Tests** - JSON storage and retrieval workflows
- 🎯 **E2E User Journeys** - Complete activity recording flows
- 📊 **Performance Tests** - Large JSON processing and analytics
- 📶 **Network Testing** - Offline/online scenario testing

**Web Dashboard Testing:**

- 🌐 **Component Testing** - Next.js component validation
- 🔌 **API Testing** - tRPC procedure integration tests
- 🎨 **UI Testing** - Visual regression and accessibility testing
- ⚡ **Performance Testing** - Page load and analytics performance

**Debugging Tools:**

- 🐛 **React DevTools** - Component hierarchy and state inspection
- 📱 **Flipper** - Native debugging for React Native
- 🌐 **Next.js DevTools** - Performance and bundle analysis
- 📊 **React Query DevTools** - API call inspection and caching
- 🔍 **TypeScript Debugging** - Real-time type error reporting

* **Integration Tests** — JSON storage and retrieval workflows
* **E2E User Journeys** — Complete activity recording and analysis flows
* **Performance Tests** — Large JSON processing and analytics

---

## 🚀 Deployment & DevOps

**Mobile App Deployment (Expo EAS):**

```bash
# Production builds for both platforms
eas build --platform all --profile production

# Over-the-air updates without app store review
eas update --branch production --message "Feature update"

# Submit to app stores
eas submit --platform ios --profile production
```

**Web Dashboard Deployment (Vercel):**

```bash
# Automatic deployment on push to main
git push origin main

# Preview deployments for PRs
vercel --prod

# Environment-specific configuration
vercel env add VARIABLE_NAME
```

**Self-Hosting (Docker + GHCR):**

- GradientPeak publishes a web container from `apps/web/Dockerfile` to `ghcr.io/<owner>/<repo>`.
- Use `:latest` for the newest `main` build or `:sha-<commit>` for a pinned release.
- Copy `apps/web/selfhost.env.example` to `apps/web/.env.selfhost`, fill in the required values, then run:

```bash
docker run -d --name gradientpeak-web -p 3000:3000 \
  --env-file apps/web/.env.selfhost \
  --restart unless-stopped \
  ghcr.io/<owner>/<repo>:latest

curl http://127.0.0.1:3000/api/health
```

- The mobile app can sign in against your host by expanding `Server URL` on the auth screen and entering your hosted base URL, for example `http://<LAN-IP>:3000`.
- To run the local Supabase stack from this repo, copy `packages/supabase/.env.example` to `packages/supabase/.env`, then use `pnpm self-host:up` and `pnpm self-host:down`.

**CI/CD Pipeline:**

- ✅ **Automated Testing** - Runs on every pull request
- 📦 **Build Verification** - Ensures all packages compile correctly
- 🧪 **Test Coverage** - Minimum coverage requirements enforced
- 🔒 **Security Scanning** - Dependency vulnerability checks
- 🚀 **Preview Deployments** - Automatic staging environments for PRs

**Environment Management:**

- 🔧 **Turborepo Remote Caching** - Shared build cache across team
- 🌐 **Multi-environment Support** - Development, staging, production
- 📋 **Configuration Management** - Environment-specific variables
- 🔍 **Monitoring & Logging** - Application performance monitoring
- 📊 **Analytics Integration** - Usage tracking and error reporting

**Mobile App (Expo/EAS):**

```bash
# Production builds
eas build --platform all --profile production

# Over-the-air updates
eas update --branch production --message "Feature update"
```

**Web Dashboard (Vercel):**

```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment
vercel --prod
```

---

## 🤝 Contributing

- Fork the repository and create a feature branch
- Make your changes with tests and documentation
- Run quality checks: `pnpm lint && pnpm test`
- Submit a pull request with clear description

---

## 📄 Documentation

- [Setup Guide](SETUP_GUIDE.md)
- [Architecture Guide](AGENTS.md)
- [Component Library](packages/ui/README.md)

---

## 📝 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

Built with modern tools and technologies:

- [Expo](https://expo.dev) — Cross-platform mobile development
- [Next.js](https://nextjs.org) — React web framework
- [Supabase](https://supabase.com) — Backend-as-a-service
- [Turborepo](https://turbo.build) — Monorepo build system

---

**GradientPeak** — Enterprise-grade fitness tracking with JSON-first, local-first architecture 🚀
