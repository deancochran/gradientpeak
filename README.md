# TurboFit 🏃‍♂️

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. TurboFit delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

---

## 🏗️ Architecture Overview

TurboFit is organized as a **Turborepo monorepo** with modular packages:

### 📦 Core Package (`packages/core`)

The heart of TurboFit, shared across web, mobile, and backend apps. **Completely independent of database or ORM dependencies.**

**Responsibilities:**

* **Type Definitions & Schemas** — Zod validation for profiles, workouts, activities, and flexible JSON structures
* **Calculations & Analytics** — Training zones, TSS, normalized power, compliance scoring, CTL/ATL/TSB
* **Business Logic** — Activity plan validation, progression, and adaptive algorithms
* **Utilities** — Time/duration helpers, unit conversions, constants
* **Platform Agnostic** — Pure TypeScript with no database, ORM, or platform-specific dependencies

**Key Benefit:** Single source of truth ensures consistent calculations, type safety, and validation across all applications while remaining completely portable and testable in isolation.

---

### 📦 Drizzle Backend Package (`packages/drizzle`)

A centralized backend layer providing type-safe database interactions.

**Responsibilities:**

* **Schema Definition** — Table structures and relations managed via Drizzle
* **Migrations** — Database versioning and schema updates fully controlled
* **Queries & Transactions** — Type-safe interactions with PostgreSQL
* **Integration** — Powers both web and mobile apps with a single database interface

**Key Benefit:** Decouples applications from direct database dependencies while providing type-safe data operations.

---

### 📦 TypeScript Config Package (`packages/typescript-config`)

A shared TypeScript configuration used across all apps and packages in the TurboFit monorepo.

**Responsibilities:**

* **Centralized TS Configuration** — Base `tsconfig` defines compiler options, strict type checking, and module resolution
* **Standardized Paths & Aliases** — Ensures consistent `@/*` imports across apps
* **Extensible per App** — Apps can extend the base config for Next.js, Expo, or library-specific overrides
* **Version Control** — Single source of truth for TypeScript settings to reduce discrepancies and errors

**Key Benefit:** All apps and packages share a **consistent TypeScript environment**, simplifying cross-package type safety and refactoring.

---

### 📦 ESLint Config Package (`packages/eslint-config`)

A shared ESLint configuration used across all apps and packages in the TurboFit monorepo.

**Responsibilities:**

* **Centralized Linting Rules** — Base ESLint rules and plugins (`@eslint/js`, `typescript-eslint`, `eslint-config-prettier`) applied across all apps
* **Next.js & React Support** — Optional per-app overrides for Next.js or React library requirements
* **Custom Plugins** — Turbo-specific rules, `eslint-plugin-only-warn`, and other shared rules enforced consistently
* **Ignored Paths** — Standard exclusions for `dist`, `.next`, and build artifacts

**Key Benefit:** Provides **uniform code quality standards** across all apps and packages, making maintenance and onboarding simpler.

---

### 📱 Mobile App (`apps/native`)

* Expo + React Native
* Local-first storage with SQLite for offline recording
* Powered by `@turbofit/core` for validation and calculations (database-independent)
* Cloud sync handled via API endpoints

---

### 🌐 Web Dashboard (`apps/web`)

* Next.js + React
* Real-time analytics and dashboards
* Powered by `@turbofit/core` for calculations and validation
* Database access via Drizzle-powered API endpoints

---

### 🔗 Shared Infrastructure

* Turborepo + TypeScript throughout
* Core package for shared business logic (database-independent)
* Drizzle package for centralized database operations
* Local-first recording + intelligent sync ensures offline usability and data integrity

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

`planned_activities` contains scheduled workouts with flexible JSON structures validated by the **core package**:

* `structure` — Complex JSON objects defining activity steps
* `structure_version` — Version tracked by core package
* `requires_threshold_hr` / `requires_ftp` — Validated against core profile requirements
* Performance estimates calculated by core algorithms

**Activity Structure Features:**

* Nested repetitions and complex step sequences
* Multiple intensity target types with validation
* Duration units (time, distance, repetition)
* Intensity classes with core classification logic
* Portable format compatible with major training platforms

The core package ensures **valid activity structures**, calculates **estimated durations and training stress**, and provides **compliance scoring algorithms**.

---

## 🏃 Activity Storage & Performance Analysis

### JSON-First Activity Architecture

TurboFit uses a **JSON-first approach** where all activity data is stored as the single source of truth:

* **Primary Storage** — Complete activity data stored as JSON in Supabase Storage
* **Local Recording** — Activities initially captured locally in SQLite as JSON
* **Cloud Sync** — JSON objects uploaded to Supabase Storage when network available
* **Metadata Generation** — Activity records created locally and synced after JSON storage
* **Stream Processing** — Activity streams generated from JSON after successful upload

**Data Flow:**
1. **Record** → Local SQLite stores complete activity as JSON
2. **Upload** → JSON object uploaded to Supabase Storage (source of truth)
3. **Process** → Activity metadata record generated locally and inserted
4. **Streams** → Activity streams generated and inserted after JSON processing
5. **Analytics** — Core package processes JSON for performance calculations

### Performance Analysis

Activity data flows through the **core package** for consistent analysis:

* **Performance Metrics** — TSS, normalized power, intensity factors calculated from JSON
* **Training Load Analytics** — CTL, ATL, TSB derived from activity metadata
* **Compliance Scoring** — Activity matching algorithms using JSON activity structure
* **Zone Analysis** — Training zone calculations using core package algorithms

### Activity Streams

Time-series data processed from JSON source through core package utilities:

* **Generated from JSON** — All streams derived from primary JSON activity data
* **Standardized Metrics** — Core package ensures consistent metric types and validation
* **Performance Curves** — Power/HR curves calculated from JSON streams
* **Real-time Processing** — Stream aggregation during activity recording

---

## 🔄 Local-First Architecture

* **Record Locally** — Expo-SQLite captures complete activities as JSON with core package validation
* **JSON Source of Truth** — All activity data stored primarily as JSON objects
* **Background Sync** — Core package ensures data integrity during upload process
* **Metadata Derivation** — Activity records and streams generated from JSON post-upload
* **Conflict Resolution** — Smart merging using JSON timestamps and core validation

---

## ✨ Key Features

### 🔄 Shared Business Logic via Core Package

* **Database Independent** — Core package has zero database dependencies
* **Consistent Calculations** — Same algorithms across platforms
* **Unified Validation** — JSON schema validation using Zod
* **Type Safety** — Full TypeScript support without ORM coupling
* **Client-side Performance** — Instant calculations without API calls

### 📊 Advanced Analytics

* **JSON-Derived Metrics** — All analytics calculated from JSON source data
* **Training Load Models** — CTL/ATL/TSB from activity metadata
* **Performance Analytics** — Power curves, trends from JSON streams
* **Compliance Tracking** — Plan adherence using JSON activity structures
* **Zone Analysis** — Heart rate and power zones from core calculations

### 🔐 Enterprise Security

* **Validated Data Integrity** — Core package schemas ensure data quality
* **Row Level Security** — Database-level access control
* **Encrypted Storage** — Secure local and cloud storage
* **Audit Logging** — Complete activity history preservation

### 🚀 Developer Experience

* **Independent Core Package** — Pure TypeScript, fully testable in isolation
* **End-to-end Type Safety** — From JSON validation to UI components
* **Hot Reloading** — Fast development iteration
* **Consistent Behavior** — Same business logic across all platforms

---

## 🛠️ Tech Stack

| Layer          | Mobile                | Web                   | Shared       |
| -------------- | --------------------- | --------------------- | ------------ |
| Business Logic | `@turbofit/core`      | `@turbofit/core`      | Core Package |
| Frontend       | Expo 53, React Native | Next.js 15, React 19  | -            |
| Local Storage  | Expo-SQLite (SQLite)  | -                     | -            |
| Cloud Storage  | Supabase Storage      | Supabase Storage      | JSON Files   |
| Cloud Database | API → Drizzle         | API → Drizzle         | PostgreSQL   |
| Styling        | NativeWind 4.1        | Tailwind CSS          | -            |
| State          | SQLite + React Query  | React Query + Zustand | -            |

---

## 📖 Development Guide

### Project Structure

```
turbofit/
├── apps/
│   ├── native/          # Mobile app (Expo + React Native)
│   └── web/             # Web dashboard (Next.js)
├── packages/
│   ├── core/            # 🌟 Database-independent business logic, types, calculations
│   ├── drizzle/         # Database schema, migrations, queries
│   └── config/          # Shared configuration
```

### Core Package Structure

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
bun dev      # Start all development servers
bun build    # Build all applications including core package
bun lint     # Lint all code
bun test     # Run all tests including core package tests
```

**Core package development:**

```bash
cd packages/core
bun build    # Build core package
bun test     # Test core package (no database dependencies)
bun dev      # Watch mode for core package development
```

---

## 🔐 Authentication Flow

1. Supabase authentication with JWT tokens
2. Profile enhancement using core package type extensions
3. Data validation through core package schemas
4. Secure sync with core package integrity checks

---

## 📱 Mobile & 🌐 Web Dashboard Features

* **JSON-First Storage** — Single source of truth for all activity data
* **Real-time Validation** — Core package schemas ensure data quality
* **Client-side Analytics** — Performance calculations without server dependencies
* **Consistent Training Zones** — Core package algorithms across platforms
* **Intelligent Offline-first Sync** — JSON-based conflict resolution

---

## 🧪 Testing Strategy

**Core Package Testing:**

* **Algorithm Validation** — Mathematical correctness of calculations
* **Schema Testing** — JSON validation and type safety
* **Pure Function Testing** — No database mocking required
* **Cross-platform Consistency** — Same results across mobile and web

**Application Testing:**

* **Integration Tests** — JSON storage and retrieval workflows
* **E2E User Journeys** — Complete activity recording and analysis flows
* **Performance Tests** — Large JSON processing and analytics

---

## 🚀 Deployment

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

* Fork the repository and create a feature branch
* Make your changes with tests and documentation
* Run quality checks: `bun lint && bun test`
* Submit a pull request with clear description

---

## 📄 Documentation

* [Setup Guide](SETUP_GUIDE.md)
* [Architecture Guide](CLAUDE.md)
* [Component Library](packages/ui/README.md)

---

## 📝 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

Built with modern tools and technologies:

* [Expo](https://expo.dev) — Cross-platform mobile development
* [Next.js](https://nextjs.org) — React web framework
* [Supabase](https://supabase.com) — Backend-as-a-service
* [Turborepo](https://turbo.build) — Monorepo build system

---

**TurboFit** — Enterprise-grade fitness tracking with JSON-first, local-first architecture 🚀
