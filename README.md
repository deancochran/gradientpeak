# TurboFit 🏃‍♂️

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. TurboFit delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

---

## 🏗️ Architecture Overview

TurboFit is built as a **Turborepo monorepo** with enterprise-grade local-first architecture:

### 📦 Core Package (`packages/turbofit-core`)

* Centralized **shared types, schemas, calculations, and utilities**
* Single source of truth for:

  * Activity, profile, and workout data structures
  * Validation with Zod schemas
  * Training zone and performance calculations (TSS, IF, NP)
  * Shared utilities like time, units, formatting, constants
* Ensures **type safety, consistency, and maintainability** across web and mobile apps

### 📱 Native Mobile App (`apps/native`)

* **Expo 53** + React Native 0.79.5 (New Architecture)
* **Expo-SQLite** - High-performance local database for activity recording
* **Supabase Client** - Cloud sync and real-time features
* **NativeWind 4.1** - Native Tailwind CSS styling
* **Hybrid Architecture** - Local-first recording with intelligent cloud sync
* **Uses `@turbofit/core`** for types, validation, calculations, and utilities

### 🌐 Web Dashboard (`apps/web`)

* **Next.js 15** + React 19
* **Turbopack** - Lightning-fast development builds
* **Supabase** - PostgreSQL backend with real-time subscriptions
* **Analytics Interface** - Comprehensive fitness insights and admin tools
* **Uses `@turbofit/core`** for shared business logic and type safety

### 🔗 Shared Infrastructure

* **Turborepo** with **Bun** package manager
* **TypeScript** throughout the stack
* **Supabase** - PostgreSQL with Row Level Security
* **Intelligent Sync Engine** - Conflict resolution and offline-first

---

## 🧑‍💻 Profiles & Preferences

User-centric design anchors the system around **profiles** extended from `auth.users`. Each profile stores athlete-specific metrics, preferences, and personalization settings:

| Field               | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `profile_id`        | Primary key, UUID, FK → `auth.users.id`                    |
| `threshold_hr`      | Threshold heart rate (bpm); nullable for new users         |
| `ftp`               | Functional Threshold Power (watts); nullable for new users |
| `weight_kg`         | Athlete’s weight for power-to-weight calculations          |
| `gender`            | Used in predictive models and analytics                    |
| `dob`               | Date of birth; calculates age-based zones & targets        |
| `username`          | Unique public-facing handle                                |
| `language`          | Preferred UI language/locale                               |
| `preferred_units`   | Metric vs imperial                                         |
| `preferred_metrics` | Focus metrics (power, HR, pace, RPE)                       |
| `avatar_url`        | Optional profile picture/avatar                            |
| `bio`               | Optional short biography                                   |

> These metrics enable **personalized, adaptive training**, ensuring workouts match an athlete’s physiology and goals.

---

## 📋 Training Plans & Planned Activities

### Profile Plans

`profile_plans` stores personalized training plans generated from library templates:

* Enables multiple plans per user
* Tracks progress individually per plan

### Planned Activities

`planned_activities` contains the scheduled workouts derived from plans:

* `id` — Primary key, UUID
* `plan_id` — FK → `profile_plans.id`
* `structure` — JSON object defining steps, repetitions, intensity targets
* `structure_version` — Tracks JSON/Zod schema version
* `requires_threshold_hr` / `requires_ftp` — Flags for mandatory metrics
* Optional fields: notes, estimated duration, TSS

**Workout Structure (JSON Example)**:

```json
{
  "Structure": [
    {
      "IntensityClass": "WarmUp",
      "Name": "Warm up",
      "Length": { "Unit": "Second", "Value": 600 },
      "Type": "Step",
      "IntensityTarget": { "Unit": "PercentOfFtp", "Value": 60, "MinValue": 55, "MaxValue": 65 }
    }
  ]
}
```

* Supports Step or Repetition types
* Length units: Second, Meter, Repetition
* IntensityClass: WarmUp, Active, Rest, CoolDown
* IntensityTarget: %FTP, %MaxHR, %ThresholdHR, speed, cadence, or RPE
* Optional: Name, Notes, CadenceTarget, OpenDuration

> JSON structure allows **portable, schema-validated workouts** compatible with Garmin, Wahoo, and TrainingPeaks formats.

---

## 🏃 Activities & Performance Analysis

### Completed Activities

`activities` captures all finished sessions:

* `id` — Primary key, UUID
* `profile_id` — FK → `profiles.profile_id`
* `planned_activity_id` — Optional FK → `planned_activities.id`
* `started_at`, `ended_at` — Timestamps
* `source` — Device or manual entry

### Activity Results

`activity_results` stores analytical metrics:

* `activity_id` — FK → `activities.id`
* Metrics include TSS, CTL, compliance score, normalized power, etc.
* Numeric fields default to NULL if data is missing

### Activity Streams

`activity_streams` stores granular, timestamped metrics:

* Columns: activity\_id, timestamp, metric\_type, value
* Recommended indexing/partitioning for large datasets

> This separation of planned vs completed activities allows **intelligent plan adaptation** and **compliance tracking** for personalized, evolving training.

---

## 🔄 Hybrid Local-First Architecture

* **Record Locally** — Expo-SQLite handles all activity data instantly
* **Background Sync** — Automatic upload to Supabase when connected
* **Conflict Resolution** — Smart merging with server-side validation
* **FIT File Pipeline** — Local processing → Cloud storage → Analytics
* **Alerts** — Planned activities requiring missing threshold HR or FTP trigger notifications

---

## ✨ Key Features

### 🔄 Hybrid Local-First Architecture

* **Instant Activity Recording** - Expo-SQLite handles real-time GPS tracking and FIT file creation
* **Intelligent Cloud Sync** - Automatic sync to Supabase when network is available
* **Conflict Resolution** - Smart merging of local and cloud data
* **FIT File Processing** - Local parsing and analysis with cloud backup storage
* **Shared calculations** via `@turbofit/core` ensure consistency between platforms

### 📊 Advanced Analytics

* **Real-Time Metrics** - Power curves, training load, recovery tracking
* **Performance Analytics** - Trends, comparisons, and insights
* **Achievement System** - Automated milestone detection and gamification
* **Dashboard Views** - Pre-calculated metrics for instant loading

### 🔐 Enterprise Security

* **Row Level Security** - Database-level access control
* **Encrypted Storage** - Secure local data management
* **Audit Logging** - Comprehensive tracking for compliance

### 🚀 Developer Experience

* **Type Safety** - End-to-end TypeScript with shared schemas
* **Hot Reloading** - Instant development feedback
* **Shared Components** - Consistent UI across platforms
* **Testing Suite** - Unit, integration, and E2E testing

---

## 🛠️ Tech Stack

| Layer              | Mobile                    | Web                   | Backend    |
| ------------------ | ------------------------- | --------------------- | ---------- |
| **Frontend**       | Expo 53, React Native     | Next.js 15, React 19  | -          |
| **Local Storage**  | Expo-SQLite (SQLite)      | -                     | -          |
| **Cloud Database** | Supabase Client           | Supabase              | PostgreSQL |
| **Shared Core**    | `@turbofit/core`          | `@turbofit/core`      | -          |
| **Styling**        | NativeWind 4.1            | Tailwind CSS          | -          |
| **State**          | Expo-SQLite + React Query | React Query + Zustand | -          |

---

## 📖 Development Guide

### Project Structure

```
turbofit/
├── apps/
│   ├── native/          # Mobile app (Expo + React Native)
│   └── web/             # Web dashboard (Next.js)
├── packages/
│   ├── turbofit-core/   # Shared types, calculations, validation, utilities
│   ├── supabase/        # Shared Supabase schemas
│   └── config/          # Shared configuration
└── docs/                # Documentation
```

### Common Commands

**Root level** (runs across all apps):

```bash
bun dev          # Start all development servers
bun build        # Build all applications
bun lint         # Lint all code
bun test         # Run all tests
```

**Mobile development**:

```bash
cd apps/native
bun start        # Start Expo development server
bun ios          # Run on iOS simulator
bun android      # Run on Android emulator
```

**Web development**:

```bash
cd apps/web
bun dev          # Start Next.js development server
bun build        # Build production application
```

---

## 📦 Using `@turbofit/core`

### Example: Training Zones (Mobile or Web)

```ts
import { TrainingZoneCalculator } from '@turbofit/core';

const zones = TrainingZoneCalculator.getZonesForProfile(profile);
```

### Example: Performance Analysis

```ts
import { PerformanceCalculator } from '@turbofit/core';

const metrics = PerformanceCalculator.analyzeActivity(
  activity.streams,
  activity.duration_seconds,
  activity.profile?.ftp,
  activity.profile?.threshold_hr
);
```

> `@turbofit/core` ensures **type safety, centralized calculations, validation, and utilities** across the entire TurboFit stack.

`

### Database Setup

1. **Create Supabase Project** and copy credentials
2. **Apply migrations** from `packages/database/migrations/`
3. **Configure Row Level Security** policies

> See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed setup instructions

## 🗄️ Database Architecture

### Core Tables (Supabase PostgreSQL)
- **users** - User profiles and preferences
- **activities** - Synced workout activities with comprehensive metrics
- **activity_segments** - GPS and time-based activity segments
- **user_metrics** - Pre-calculated performance analytics
- **user_achievements** - Gamification and milestone tracking
- **fit_files** - Metadata and cloud storage references

### Local Storage (Expo-SQLite SQLite)
- **local_activities** - Real-time activity recording during workouts
- **local_segments** - GPS tracking data and time series
- **local_fit_data** - Raw FIT file data before processing
- **sync_queue** - Pending uploads and sync operations

### Hybrid Sync Strategy
- **Record Locally** - All activity data written to Expo-SQLite first
- **Background Sync** - Automatic upload to Supabase when connected
- **Conflict Resolution** - Smart merging with server-side validation
- **FIT File Pipeline** - Local processing → Cloud storage → Analytics

## 🔐 Authentication Flow

2. **JWT token generated** with custom Supabase claims
3. **Database access** authorized via Row Level Security policies
4. **Local data sync** authenticated with bearer tokens

### Security Features
- **Database-level isolation** - RLS policies per user
- **Token refresh** - Automatic JWT rotation
- **Encrypted local storage** - Secure offline data
- **Audit logging** - Track all data access

## 📱 Mobile Features

### Hybrid Recording Architecture
- **Local-first activity recording** - Expo-SQLite captures all workout data instantly
- **Real-time GPS tracking** - High-frequency location data stored locally
- **Background cloud sync** - Automatic sync to Supabase when network available
- **FIT file generation** - Local processing and cloud storage integration

### Performance Optimizations
- **Expo-SQLite reactive queries** - Real-time UI updates during workouts
- **Efficient GPS batching** - Optimized location data collection
- **Smart sync scheduling** - Network-aware background uploads
- **Local FIT processing** - Parse and analyze without internet dependency

## 🌐 Web Dashboard

### Data Flow & Administration
- **Real-time metrics** - Live dashboards powered by Supabase subscriptions
- **Advanced visualizations** - Power curves, trends, and comparative analysis
- **Cloud analytics** - Server-side processing of synced activity data
- **User management** - Administrative tools and account oversight

### Administrative Features
- **User management** - Account administration
- **Data insights** - Platform-wide analytics
- **System monitoring** - Performance and health metrics
- **Bulk operations** - Efficient data management

## 🧪 Testing Strategy

### Comprehensive Test Coverage
- **Unit tests** - Component and function testing
- **Integration tests** - API and database integration
- **E2E tests** - Full user journey validation
- **Performance tests** - Load and stress testing

### Quality Assurance
- **TypeScript strict mode** - Compile-time error prevention
- **ESLint + Prettier** - Consistent code quality
- **Husky pre-commit hooks** - Automated quality checks
- **CI/CD validation** - Automated testing pipeline

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
- **⚡ Real-time recording** - Instant GPS tracking and activity capture via WatermelonDB
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
- [**API Documentation**](docs/api/) - Database schemas and endpoints
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
