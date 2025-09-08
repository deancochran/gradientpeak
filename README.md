# TurboFit 🏃‍♂️

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. TurboFit delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

---

## 🏗️ Architecture Overview

TurboFit is built as a **Turborepo monorepo** with enterprise-grade local-first architecture:

### 📦 Core Package (`packages/core`)

**The heart of TurboFit's shared business logic** - A centralized package that eliminates duplication and ensures consistency across all platforms.

**Core Responsibilities:**
* **Shared Type System** - Generated database types, extended interfaces, and flexible JSON structure definitions
* **Validation & Schemas** - Zod-based validation for workout structures, activity data, and user inputs
* **Performance Calculations** - Training zones, performance metrics (TSS, IF, NP), fitness analytics (CTL, ATL, TSB)
* **Business Logic** - Workout compliance scoring, plan progression, and intelligent matching algorithms
* **Utilities** - Time/duration helpers, unit conversions, formatting, and shared constants

**Key Benefits:**
* **Single Source of Truth** - All calculations implemented once, tested once, used everywhere
* **Type Safety** - Compile-time guarantees across web and mobile platforms
* **Performance** - Client-side calculations reduce server load and improve response times
* **Consistency** - Identical results and behavior across all applications
* **Maintainability** - Centralized updates automatically propagate to all platforms

### 📱 Native Mobile App (`apps/native`)

* **Expo 53** + React Native 0.79.5 (New Architecture)
* **Expo-SQLite** - High-performance local database for activity recording
* **Supabase Client** - Cloud sync and real-time features
* **NativeWind 4.1** - Native Tailwind CSS styling
* **Hybrid Architecture** - Local-first recording with intelligent cloud sync
* **Powered by `@turbofit/core`** - Shared types, calculations, validation, and business logic

### 🌐 Web Dashboard (`apps/web`)

* **Next.js 15** + React 19
* **Turbopack** - Lightning-fast development builds
* **Supabase** - PostgreSQL backend with real-time subscriptions
* **Analytics Interface** - Comprehensive fitness insights and admin tools
* **Powered by `@turbofit/core`** - Ensures identical calculations and type safety with mobile

### 🔗 Shared Infrastructure

* **Turborepo** with **Bun** package manager
* **TypeScript** throughout the stack with shared core package
* **Supabase** - PostgreSQL with Row Level Security
* **Intelligent Sync Engine** - Conflict resolution and offline-first

---

## 🧑‍💻 Profiles & Preferences

User-centric design anchors the system around **profiles** extended from `auth.users`. The core package provides enhanced profile interfaces and validation schemas for athlete-specific metrics:

| Field               | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `id`        | Primary key, UUID, FK → `auth.users.id`                    |
| `threshold_hr`      | Threshold heart rate (bpm); nullable for new users         |
| `ftp`               | Functional Threshold Power (watts); nullable for new users |
| `weight_kg`         | Athlete's weight for power-to-weight calculations          |
| `gender`            | Used in predictive models and analytics                    |
| `dob`               | Date of birth; calculates age-based zones & targets        |
| `username`          | Unique public-facing handle                                |
| `language`          | Preferred UI language/locale                               |
| `preferred_units`   | Metric vs imperial                                         |
| `avatar_url`        | Optional profile picture/avatar                            |
| `bio`               | Optional short biography                                   |

The **core package** handles profile validation, training zone calculations based on athlete metrics, and unit conversions for personalized experiences.

---

## 📋 Training Plans & Planned Activities

### Profile Plans

`profile_plans` stores personalized training plans generated from library templates. The **core package** provides plan validation, progression algorithms, and adaptation logic.

### Planned Activities

`planned_activities` contains scheduled workouts with flexible JSON structures validated by the **core package**:

* `structure` — Complex JSON objects defining workout steps, validated by core schemas
* `structure_version` — Tracked by core package versioning system
* `requires_threshold_hr` / `requires_ftp` — Validated against core profile requirements
* Performance estimates calculated by core algorithms

**Workout Structure Features** (validated by core package):
* Support for nested repetitions and complex step sequences
* Multiple intensity target types with core validation
* Duration units (time, distance, repetition) with core calculations
* Intensity classes with core classification logic
* Portable format compatible with major training platforms

The **core package** ensures workout structures are valid, calculates estimated durations and training stress, and provides compliance scoring algorithms.

---

## 🏃 Activities & Performance Analysis

### Completed Activities & Results

Activity data flows through the **core package** for consistent analysis:

* **Performance Metrics** - TSS, normalized power, intensity factors calculated by core algorithms
* **Training Load Analytics** - CTL, ATL, TSB calculations shared across platforms
* **Compliance Scoring** - Workout matching algorithms from core package
* **Zone Analysis** - Training zone calculations using core profile-based algorithms

### Activity Streams

Time-series data processed through **core package** utilities:
* Standardized metric types and validation
* Performance curve calculations
* Stream processing and aggregation algorithms
* Real-time analytics during activity recording

The **core package** ensures identical analysis results whether computed on mobile during recording or on web during review.

---

## 🔄 Hybrid Local-First Architecture

* **Record Locally** — Expo-SQLite with core package validation handles all activity data instantly
* **Background Sync** — Core package sync logic ensures data integrity during cloud upload
* **Conflict Resolution** — Core package algorithms handle smart merging with server validation
* **Intelligent Alerts** — Core package validation triggers notifications for missing athlete metrics

---

## ✨ Key Features

### 🔄 Shared Business Logic via Core Package

* **Consistent Calculations** - Training zones, performance metrics, and analytics identical across platforms
* **Unified Validation** - Workout structures, activity data, and user inputs validated once
* **Type Safety** - End-to-end TypeScript with shared schemas and interfaces
* **Performance Optimization** - Client-side calculations using core package reduce server load
* **Instant Feedback** - Real-time validation and calculations without API calls

### 📊 Advanced Analytics (Powered by Core Package)

* **Training Load Models** - CTL/ATL/TSB calculations with consistent algorithms
* **Performance Analytics** - Power curves, trends, and fitness insights
* **Compliance Tracking** - Workout matching and plan adherence scoring
* **Zone-Based Analysis** - Heart rate and power zone calculations from athlete profiles

### 🔐 Enterprise Security

* **Validated Data Integrity** - Core package schemas ensure consistent data structure
* **Row Level Security** - Database-level access control
* **Encrypted Storage** - Secure local data management
* **Audit Logging** - Comprehensive tracking for compliance

### 🚀 Developer Experience

* **Shared Core Package** - Single source of truth for all business logic
* **Type Safety** - End-to-end TypeScript with shared schemas
* **Hot Reloading** - Instant development feedback
* **Consistent Behavior** - Identical calculations and validation across platforms

---

## 🛠️ Tech Stack

| Layer              | Mobile                    | Web                   | Shared             |
| ------------------ | ------------------------- | --------------------- | ------------------ |
| **Business Logic** | `@turbofit/core`          | `@turbofit/core`      | **Core Package**   |
| **Frontend**       | Expo 53, React Native     | Next.js 15, React 19  | -                  |
| **Local Storage**  | Expo-SQLite (SQLite)      | -                     | -                  |
| **Cloud Database** | Supabase Client           | Supabase              | PostgreSQL         |
| **Styling**        | NativeWind 4.1            | Tailwind CSS          | -                  |
| **State**          | Expo-SQLite + React Query | React Query + Zustand | -                  |

---

## 📖 Development Guide

### Project Structure

```
turbofit/
├── apps/
│   ├── native/          # Mobile app (Expo + React Native)
│   └── web/             # Web dashboard (Next.js)
├── packages/
│   ├── core/   # 🌟 Shared business logic, types, calculations
│   ├── supabase/        # Database schemas and migrations
│   └── config/          # Shared configuration
```

### Core Package Structure

The `@turbofit/core` package is organized into focused modules:

```
packages/core/
├── types/               # Database types and enhanced interfaces
├── schemas/             # Zod validation schemas
├── calculations/        # Performance and training calculations
├── validators/          # Data validation utilities
└── utils/              # Shared utilities and constants
```

### Common Commands

**Root level** (runs across all apps):

```bash
bun dev          # Start all development servers
bun build        # Build all applications including core package
bun lint         # Lint all code
bun test         # Run all tests including core package tests
```

**Core package development**:

```bash
cd packages/core
bun build        # Build core package
bun test         # Test core package
bun dev          # Watch mode for core package development
```

---

## 📦 Using `@turbofit/core`

The core package provides consistent business logic across all applications:

### Training Zone Calculations
Both mobile and web apps use identical training zone algorithms from the core package, ensuring consistent zone displays and workout targeting.

### Performance Analysis
Activity analysis, including training stress scores and performance metrics, uses shared core algorithms for identical results across platforms.

### Workout Validation
Complex workout structures are validated using shared schemas, ensuring data integrity and consistent behavior.

### Type Safety
Database types and enhanced interfaces are shared, providing compile-time safety and consistent data structures.


### Core Architecture Principles

The schema leverages **Supabase's built-in authentication** and extends it with custom tables optimized for training management. All tables include `created_at` and `updated_at` timestamps for comprehensive auditing.

### User Management & Profiles

**`auth.users`** — Supabase's foundation authentication table handling login credentials and security.

**`profiles`** — **Extended user profiles with athlete-specific metrics**, validated and enhanced by the core package:

| Field               | Purpose                                                    | Core Package Role              |
| ------------------- | ---------------------------------------------------------- | ------------------------------ |
| `profile_id`        | Primary key, UUID, FK → `auth.users.id`                    | Type definitions and validation |
| `threshold_hr`      | Threshold Heart Rate (bpm) for HR training zones          | Zone calculation algorithms    |
| `ftp`               | Functional Threshold Power (watts) for power zones        | Zone calculation algorithms    |
| `weight_kg`         | Body weight for power-to-weight performance metrics       | Performance calculations       |
| `gender`            | Used in predictive models and age-based analytics         | Analytics algorithms           |
| `dob`               | Date of birth for age-based targets and progression       | Age-based calculations         |
| `username`          | Unique public handle                                       | Validation schemas             |
| `language`          | Preferred UI language/locale                               | Localization utilities         |
| `preferred_units`   | Metric vs imperial measurement system                      | Unit conversion utilities      |
| `preferred_metrics` | Focus metrics (power, HR, pace, RPE) for training feedback| Display logic                  |
| `avatar_url`        | Profile picture/avatar                                     | URL validation                 |
| `bio`               | Optional biography                                         | Text validation                |

The **core package** ensures training prescriptions are personalized and adaptive by processing these physiological metrics into training zones, targets, and performance benchmarks.

### Training Plan Framework

**`profile_plans`** — **Dynamically generated, personalized training plans** created from library templates:
* Enables multiple active plans per user with separate progress tracking
* **Core package** provides plan validation, progression algorithms, and adaptation logic
* Template instantiation handled by core package schemas

### Activity Planning & Execution

**`planned_activities`** — **Scheduled workouts with flexible JSON structures**:

| Field                   | Description                                        | Core Package Role                    |
| ----------------------- | -------------------------------------------------- | ------------------------------------ |
| `id`                    | Primary key, UUID                                  | Type definitions                     |
| `plan_id`               | FK → `profile_plans.id`                            | Relational validation                |
| `structure`             | **Complex JSON workout definition**                | **Schema validation & processing**   |
| `structure_version`     | JSON schema version for backward compatibility     | **Version management**               |
| `requires_threshold_hr` | Boolean flag for HR-dependent workouts            | **Validation logic**                 |
| `requires_ftp`          | Boolean flag for power-dependent workouts         | **Validation logic**                 |
| `estimated_duration`    | Calculated workout duration                        | **Duration calculation algorithms**  |
| `estimated_tss`         | Calculated training stress score                   | **TSS calculation algorithms**       |
| `notes`                 | Optional workout notes                             | Text validation                      |

#### Workout Structure (JSON Schema)

The **core package** defines and validates complex workout structures supporting:

**Step Types & Duration:**
* **Step** or **Repetition** (with nested sub-steps)
* **Duration units**: Second, Meter, Repetition
* **Length calculations** handled by core algorithms

**Intensity Management:**
* **Intensity classes**: WarmUp, Active, Rest, CoolDown
* **Target types**: %FTP, %MaxHR, %ThresholdHR, watts, bpm, speed, cadence, RPE
* **Range targets** with min/max values calculated from profile metrics
* **Zone-based targeting** using core package training zone algorithms

**Additional Features:**
* **Nested repetitions** with complex step sequences
* **Optional fields**: Name, Notes, CadenceTarget, OpenDuration
* **Portable format** compatible with Garmin, Wahoo, and TrainingPeaks

The **core package** computes estimated duration, distance, and training stress while maintaining schema compactness and interoperability.

### Activities & Performance Analysis

**`activities`** — **Completed training sessions**:
* Links to planned activities for compliance analysis
* Supports device-recorded and manually entered sessions
* **Core package** processes activity metadata and linking logic

**`activity_results`** — **Performance metrics calculated by the core package**:

| Metric Category        | Core Package Calculations                           |
| ---------------------- | --------------------------------------------------- |
| **Training Load**      | TSS, CTL, ATL, TSB using core algorithms          |
| **Power Metrics**      | Normalized Power, Intensity Factor, Variability    |
| **Performance**        | Power curves, peak values, zone distribution       |
| **Compliance**         | Workout matching and adherence scoring             |
| **Progression**        | Fitness trends and performance analytics           |

All numeric fields default to NULL for missing data, with the **core package** handling graceful degradation.

**`activity_streams`** — **Granular time-series data**:
* Timestamped metrics: HR, power, cadence, GPS coordinates, speed, elevation
* **Core package** provides stream processing utilities and aggregation algorithms
* Optimized indexing and partitioning for large datasets
* Real-time processing during activity recording

### Local Storage Architecture (Expo-SQLite)

**Hybrid local-first design** with **core package** validation:

| Table              | Description                                    | Core Package Integration           |
| ------------------ | ---------------------------------------------- | ---------------------------------- |
| `local_activities` | Real-time activity recording during workouts  | **Real-time validation & processing** |
| `local_segments`   | GPS tracking and performance data streams     | **Stream processing algorithms**   |
| `sync_queue`       | Pending uploads and synchronization tasks     | **Sync logic & conflict resolution** |

### Data Processing & Sync Flow

**Powered by core package throughout:**

1. **Local Recording** — Core package validates workout structures and processes activity data in real-time
2. **Performance Calculations** — Core algorithms compute TSS, zones, and metrics instantly on device
3. **Background Sync** — Core package handles data integrity, conflict resolution, and server validation
4. **Analytics Generation** — Shared calculations ensure identical insights across web and mobile
5. **Plan Adaptation** — Core algorithms adjust future workouts based on completed activity compliance

### Schema Benefits

This **core package-enhanced architecture** delivers:

* **Personalized Training** — Profile metrics processed by core algorithms for adaptive workouts
* **Consistent Analysis** — Identical performance calculations across all platforms
* **Flexible Structures** — JSON workout definitions validated by shared schemas
* **Intelligent Sync** — Local-first recording with robust cloud synchronization
* **Performance Optimization** — Client-side calculations reduce server load
* **Type Safety** — End-to-end TypeScript validation from database to UI

The separation of planned vs completed activities enables **intelligent training adaptation** through core package algorithms that analyze compliance patterns and adjust future workouts based on actual performance and athlete development.

---

## 🔐 Authentication Flow

1. **Supabase authentication** with JWT tokens
2. **Profile enhancement** using core package type extensions
3. **Data validation** through core package schemas
4. **Secure sync** with core package integrity checks

---

## 📱 Mobile Features

### Enhanced with Core Package

* **Real-time Validation** - Core schemas validate workout and activity data instantly
* **Client-side Analytics** - Core calculations provide immediate performance feedback
* **Consistent Training Zones** - Core algorithms ensure identical zone calculations
* **Intelligent Sync** - Core package manages data integrity during cloud synchronization

---

## 🌐 Web Dashboard

### Powered by Core Package

* **Identical Calculations** - Same performance metrics as mobile app
* **Shared Validation** - Consistent data integrity across platforms
* **Unified Analytics** - Core algorithms power all dashboard insights
* **Type-Safe Operations** - Shared types prevent data structure mismatches

---

## 🧪 Testing Strategy

### Core Package Testing
* **Algorithm Validation** - Comprehensive testing of calculation accuracy
* **Schema Testing** - Validation of data structure integrity
* **Type Safety** - Compile-time verification across platforms
* **Cross-platform Consistency** - Identical behavior testing

### Application Testing
* **Integration Tests** - Verify core package integration
* **E2E Tests** - Full user journey validation using shared logic
* **Performance Tests** - Client-side calculation efficiency

---

## 📊 Performance Metrics

### Core Package Benefits
- **⚡ Client-side Calculations** - Instant performance feedback using core algorithms
- **🔄 Consistent Results** - Identical calculations across all platforms
- **📱 Reduced Server Load** - Core package handles computations locally
- **☁️ Smart Sync** - Core package manages efficient data synchronization

### Scalability Features
- **🚀 Shared Logic** - Single implementation scales across platforms
- **📈 Type Safety** - Compile-time verification prevents runtime errors
- **🗂️ Consistent Data** - Core schemas ensure data integrity
- **⚡ Optimized Performance** - Client-side calculations reduce latency

---

## 🚀 Deployment

### Mobile App (Expo/EAS)
```bash
# Production builds
eas build --platform all --profile production

# Over-the-air updates
eas update --branch production --message "Feature update"
```

### Web Dashboard (Vercel)
```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment
vercel --prod
```

## 📊 Performance Metrics

### Hybrid Architecture Benefits
- **⚡ Real-time recording** - Instant GPS tracking and activity capture via Expo-SQLite
- **🔄 Smart sync** - Automatic background sync to Supabase cloud database
- **📱 Offline workouts** - Full functionality without internet connection
- **☁️ Cloud analytics** - Rich dashboard insights powered by Supabase

### Scalability Features
- **🚀 Multi-tenant** - Enterprise-ready architecture
- **📈 Horizontal scaling** - Database read replicas
- **🗂️ File storage** - Efficient binary data handling
- **⚡ Caching layers** - Optimized query performance

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. **Fork the repository** and create a feature branch
2. **Make your changes** with tests and documentation
3. **Run quality checks** - `bun lint && bun test`
4. **Submit a pull request** with clear description

## 📄 Documentation

- [**Setup Guide**](SETUP_GUIDE.md) - Complete installation and configuration
- [**Architecture Guide**](CLAUDE.md) - Technical implementation details
- [**Component Library**](packages/ui/README.md) - Shared UI components

## 📝 License

This project is licensed under the [MIT License](LICENSE).

## 🙏 Acknowledgments

Built with modern tools and technologies:
- [Expo](https://expo.dev) - Cross-platform mobile development
- [Next.js](https://nextjs.org) - React web framework
- [Supabase](https://supabase.com) - Backend-as-a-service
- [Turborepo](https://turbo.build) - Monorepo build system

---

**TurboFit** - Enterprise-grade fitness tracking with local-first architecture 🚀
