# TurboFit Mobile App

A cross-platform fitness tracking mobile app built with Expo, React Native, and modern tooling. Features a lightweight, offline-first architecture with robust cloud sync, comprehensive activity tracking, and real-time analytics.

## 📱 Tech Stack

### Core Framework

* **Expo 53** - Development platform with new architecture enabled
* **React Native 0.79.5** - Cross-platform mobile framework
* **Expo Router 5** - File-based routing with typed routes
* **TypeScript 5.8** - Type safety and developer experience

### Styling & UI

* **NativeWind 4.1** - Tailwind CSS for React Native
* **React Native Reusables** - Shadcn/ui-inspired component library
* **Class Variance Authority** - Type-safe component variants
* **Expo Symbols** - Native iOS symbol integration

### Offline-First, Authentication & Database

* **Supabase** - PostgreSQL backend, authentication, and file storage
* **Expo SQLite** - Local database for activity metadata and summary stats
* **Expo FileSystem** - Local storage for raw activity JSON files
* **Row Level Security** - JWT-based data access control

### Activity Tracking & FIT Files

* **Expo Location + Task Manager** — GPS tracking with background support
* **Expo Network** — Network connectivity monitoring for sync
* **BLE Sensor Streams** — Heart rate, cadence, and power capture
* **Backend FIT Generation** — Activity JSON uploaded to Supabase is converted server-side to `.fit` using `@garmin/fitsdk`
* **Activities Table** — Populated in Supabase Postgres from parsed FIT metadata

### Utilities & Performance

* **Expo Secure Store** - Encrypted local storage
* **React Native Reanimated** - Performant animations
* **React Native Gesture Handler** - Native gesture recognition
* **React Native Quick Base64** - Binary data encoding for uploading activity JSON

---

## 🏗️ Project Structure

```
apps/native/
├── app/                          # Expo Router file-based routing
│   ├── (auth)/                   # Authentication screens
│   ├── (tabs)/                  # Main app tab navigation
│   ├── (internal)/              # Internal screens (record.tsx)
│   └── _layout.tsx              # Root layout with providers
├── assets/                      # Static assets (images, fonts)
├── components/                   # Reusable UI components
│   ├── ui/                      # Base UI components (buttons, cards)
│   └── activity/                 # activity-specific components
│       ├── MetricCard.tsx       # Individual metric display
│       ├── MetricsGrid.tsx      # Grid layout for metrics
│       ├── RecordingControls.tsx # Start/pause/stop controls
│       └── activityStatusBar.tsx # GPS/Bluetooth status
├── constants/                   # App-wide constants
├── contexts/                    # React Context providers
├── hooks/                       # Reusable hooks
│   ├── useAdvancedactivityRecorder.ts # Advanced recording with fault tolerance
│   ├── useActivityManager.ts    # Activity management and sync
│   └── useactivityMetrics.ts     # Dynamic metrics calculation
├── lib/                         # Core logic, utilities, and integrations
│   ├── services/                # Core business logic services
│   │   ├── activity-recorder.ts # Fault-tolerant activity recording
│   │   ├── activity-sync-service.ts # Cloud sync with Supabase
│   │   ├── fit-file-service.ts  # FIT file generation/parsing (Garmin SDK)
│   │   ├── local-activity-database.ts # SQLite for local storage
│   │   ├── activity-service.ts       # High-level activity orchestration
│   │   └── index.ts             # Service exports
│   ├── types/                   # TypeScript type definitions
│   │   ├── activity.ts          # Activity and recording types
│   │   ├── activity.ts           # Legacy activity types
│   │   └── index.ts             # Type exports
│   ├── utils/                   # Utility functions
│   │   ├── activity-utils.ts     # Activity calculations and formatting
│   │   └── index.ts             # Utility exports
│   ├── supabase.ts              # Supabase client and auth
│   └── utils.ts                 # General utility functions
├── modals/                      # Modal components
│   └── BluetoothDeviceModal.tsx # Bluetooth device selection
├── app.json                     # Expo app configuration
└── package.json                 # Dependencies and scripts
```

## 🎯 Advanced Activity Recording System

The application features a comprehensive, fault-tolerant activity recording system built around **local JSON storage as source-of-truth** with **backend FIT file generation**. This approach ensures maximum compatibility with third-party fitness applications while maintaining offline-first functionality.

### 🔧 Core Architecture

#### **1. Backend FIT Generation Strategy**

* Activities are first recorded and stored locally as **JSON files** (GPS, BLE sensors, metrics).
* JSON files are uploaded to Supabase Storage when network is available.
* A backend function parses JSON and generates a `.fit` file using `@garmin/fitsdk`.
* Metadata extracted from the FIT file populates the **activities table** in Supabase.
* The `.fit` file serves as the **ground truth** for activity data.

#### **2. Fault-Tolerant Recording**

* **Interruption recovery**: automatically recovers from app crashes, phone restarts, or sensor disconnections
* **Background location tracking**: continues GPS tracking even when the app is backgrounded using Expo Task Manager
* **Data buffering**: buffers sensor data to prevent loss during interruptions
* **Session persistence**: saves recording state to AsyncStorage for recovery

#### **3. Local-First with Smart Sync**

* **Offline recording**: activities are recorded and stored locally first for immediate availability
* **User decision point**: after stopping, users choose to save or discard each activity
* **Automatic sync**: activities JSON files sync to Supabase when network is available
* **Cleanup after sync**: local JSON data is automatically cleaned up after successful cloud storage

---

### 🔄 Recording & Sync Flow

1. **Start Recording** → `ActivityRecorderService` captures data in real-time
2. **Data Collection** → GPS and BLE sensors collected with buffering
3. **Background Persistence** → Session state saved for interruption recovery
4. **Stop & Decision** → User chooses to save or discard activity
5. **Upload JSON** → Activity JSON uploaded to Supabase
6. **Backend FIT Generation** → Supabase server generates `.fit` file from JSON
7. **Metadata Population** → Activities table updated with parsed FIT metadata
8. **Cleanup** → Local JSON files removed after successful sync

---

### 🔄 Sync Status & Two-Step Process

Each activity record has a **sync status**:

* `local_only`: Created locally, not yet uploaded
* `syncing`: JSON being uploaded
* `synced`: JSON uploaded, FIT generated, metadata stored
* `sync_failed`: Error during sync or FIT generation

**Two-step sync ensures data integrity**:

1. JSON file uploaded to Supabase Storage
2. Backend generates FIT file and updates Postgres metadata

---

### 📊 Dynamic Data Handling

* **GPS data**: Location, altitude, speed, accuracy
* **Heart rate**: BPM with zones and variability (HRV)
* **Power**: Watts, normalized power, functional threshold power
* **Cadence**: Steps/minute or RPM depending on activity
* **Environmental**: Temperature, barometric pressure
* **Custom sensors**: Extensible for future devices

---

### ✅ Key Advantages of This Approach

* **Device remains performant**: No heavy FIT encoding on mobile
* **Offline-first**: Users can record multi-hour sessions even without network
* **FIT-compliant**: Server generates `.fit` files compatible with Garmin, Strava, etc.
* **Robust metadata extraction**: Activities table populated from FIT files ensures accurate analytics
* **Extensible**: Supports additional sensors and activity types without app updates
