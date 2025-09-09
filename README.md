# TurboFit 🏃‍♂️

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. TurboFit delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

---

## Key Advantages of the New Architecture

* **Decoupled backend** — No longer dependent on Supabase migrations; Drizzle manages everything.
* **Type-safe queries & transactions** — Database interactions are fully type-checked.
* **Shared business logic** — Core package powers calculations, validations, and algorithms for web, mobile, and backend.
* **Maintainable monorepo** — Easy to update schemas, logic, and apps in one place.
* **Offline-first & sync-ready** — Mobile and web apps remain responsive with local-first storage.

---

## 🏗️ Architecture Overview

TurboFit is organized as a **Turborepo monorepo** with modular packages:

### 📦 Core Package (`packages/core`)

The heart of TurboFit, shared across web, mobile, and backend apps.

**Responsibilities:**

* **Type Definitions & Schemas** — Zod validation for profiles, workouts, activities, and flexible JSON structures
* **Calculations & Analytics** — Training zones, TSS, normalized power, compliance scoring, CTL/ATL/TSB
* **Business Logic** — Workout plan validation, progression, and adaptive algorithms
* **Utilities** — Time/duration helpers, unit conversions, constants

**Key Benefit:** Single source of truth ensures consistent calculations, type safety, and validation across all applications.

---

### 📦 Drizzle Backend Package (`packages/drizzle`)

A new centralized backend layer replacing Supabase migrations and client-side dependencies.

**Responsibilities:**

* **Schema Definition** — Table structures and relations managed via Drizzle
* **Migrations** — Database versioning and schema updates fully controlled
* **Queries & Transactions** — Type-safe interactions with PostgreSQL
* **Integration** — Powers both web and mobile apps with a single database interface

**Key Benefit:** Decouples your applications from Supabase migrations while keeping the database fully type-safe and maintainable.

---

### 📱 Mobile App (`apps/native`)

* Expo + React Native
* Local-first storage with SQLite for offline recording
* Powered by `@turbofit/core` & `@turbofit/drizzle` for validation, calculations, and backend queries
* Cloud sync handled via Drizzle-backed API

---

### 🌐 Web Dashboard (`apps/web`)

* Next.js + React
* Real-time analytics and dashboards
* Powered by `@turbofit/core` & `@turbofit/drizzle`
* Type-safe database interactions using Drizzle instead of Supabase client

---

### 🔗 Shared Infrastructure

* Turborepo + TypeScript throughout
* Core package for shared business logic
* Drizzle package for database schema, migrations, and transactions
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

* `structure` — Complex JSON objects defining workout steps
* `structure_version` — Version tracked by core package
* `requires_threshold_hr` / `requires_ftp` — Validated against core profile requirements
* Performance estimates calculated by core algorithms

**Workout Structure Features:**

* Nested repetitions and complex step sequences
* Multiple intensity target types with validation
* Duration units (time, distance, repetition)
* Intensity classes with core classification logic
* Portable format compatible with major training platforms

The core package ensures **valid workout structures**, calculates **estimated durations and training stress**, and provides **compliance scoring algorithms**.

---

## 🏃 Activities & Performance Analysis

### Completed Activities & Results

Activity data flows through the **core package** for consistent analysis:

* **Performance Metrics** — TSS, normalized power, intensity factors
* **Training Load Analytics** — CTL, ATL, TSB
* **Compliance Scoring** — Workout matching algorithms
* **Zone Analysis** — Training zone calculations

### Activity Streams

Time-series data processed through core package utilities:

* Standardized metric types and validation
* Performance curve calculations
* Stream processing and aggregation algorithms
* Real-time analytics during activity recording

---

## 🔄 Hybrid Local-First Architecture

* **Record Locally** — Expo-SQLite with core package validation
* **Background Sync** — Core package ensures data integrity
* **Conflict Resolution** — Smart merging with server validation
* **Intelligent Alerts** — Notifications for missing athlete metrics

---

## ✨ Key Features

### 🔄 Shared Business Logic via Core Package

* Consistent calculations across platforms
* Unified validation
* Type safety with TypeScript
* Client-side performance optimization
* Instant feedback without API calls

### 📊 Advanced Analytics

* Training load models: CTL/ATL/TSB
* Performance analytics: Power curves, trends
* Compliance tracking: Plan adherence scoring
* Zone-based analysis: Heart rate and power zones

### 🔐 Enterprise Security

* Validated data integrity
* Row level security
* Encrypted storage
* Audit logging

### 🚀 Developer Experience

* Shared core package
* End-to-end TypeScript type safety
* Hot reloading
* Consistent behavior across platforms

---

## 🛠️ Tech Stack

| Layer          | Mobile                | Web                   | Shared       |
| -------------- | --------------------- | --------------------- | ------------ |
| Business Logic | `@turbofit/core`      | `@turbofit/core`      | Core Package |
| Frontend       | Expo 53, React Native | Next.js 15, React 19  | -            |
| Local Storage  | Expo-SQLite (SQLite)  | -                     | -            |
| Cloud Database | Drizzle API           | Drizzle API           | PostgreSQL   |
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
│   ├── core/            # 🌟 Shared business logic, types, calculations
│   ├── drizzle/         # Database schema, migrations, queries
│   └── config/          # Shared configuration
```

### Core Package Structure

```
packages/core/
├── types/               # Database types and enhanced interfaces
├── schemas/             # Zod validation schemas
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
bun test     # Test core package
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

* Real-time validation
* Client-side analytics
* Consistent training zones
* Intelligent offline-first sync
* Type-safe database interactions

---

## 🧪 Testing Strategy

**Core Package Testing:**

* Algorithm validation
* Schema testing
* Type safety
* Cross-platform consistency

**Application Testing:**

* Integration tests
* E2E user journey validation
* Performance tests

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

**TurboFit** — Enterprise-grade fitness tracking with local-first architecture 🚀
