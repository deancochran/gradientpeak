# TurboFit Mobile App

A cross-platform fitness tracking mobile app built with Expo, React Native, and modern tooling. Features a lightweight, offline-first architecture with robust cloud sync, fault-tolerant activity recording, multi-sensor BLE integration, planned activity guidance, and real-time analytics.

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

### Activity Tracking

* **Expo Location + Task Manager** — GPS tracking with background support
* **Expo Network** — Network connectivity monitoring for sync
* **BLE Sensor Streams** — Heart rate, cadence, and power capture
* **JSON Storage & Sync** — Activity JSON files stored locally and uploaded to Supabase Storage
* **Activities Table** — Populated in Supabase Postgres from activity metadata extracted from JSON

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

## 🎯 Enhanced Fault-Tolerant Activity Recording System

The application features a comprehensive, fault-tolerant activity recording system with **automatic recovery**, **multi-sensor BLE integration**, **planned activity guidance**, and **streamlined completion workflow**. Built around **local JSON storage as source-of-truth** with **export capabilities** for maximum compatibility with third-party fitness applications while maintaining offline-first functionality.

### 🔧 Enhanced Architecture Features

#### **1. Fault-Tolerant Recording System**

* **Automatic recovery**: detects and recovers from app crashes, phone restarts, or sensor disconnections
* **Background location tracking**: continues GPS tracking even when backgrounded using Expo Task Manager
* **Data buffering with validation**: buffers sensor data with stale data filtering and accuracy validation
* **Session checkpointing**: creates recovery checkpoints every few minutes for robust interruption handling
* **Connection monitoring**: tracks GPS, Bluetooth, and sensor connection states with automatic reconnection

#### **2. Multi-Sensor BLE Integration**

* **Universal BLE support**: heart rate monitors, power meters, cadence sensors, speed sensors
* **Smartwatch integration**: enhanced support for Apple Watch and other wearables with extended data age tolerance
* **Real-time data validation**: filters out stale sensor data (>15 seconds old) and validates accuracy
* **Auto-reconnection**: automatically attempts to reconnect to disconnected sensors during recording
* **Device management**: comprehensive device pairing, connection status monitoring, and manual reconnection controls

#### **3. Planned Activity System**

* **Pre-activity selection**: choose between free activities or structured planned workouts before recording
* **Real-time guidance**: step-by-step workout instructions with progress indicators
* **Compliance monitoring**: real-time feedback on whether you're meeting target heart rate, power, or pace zones
* **Step management**: automatic step progression with manual advance/skip options
* **Vibration alerts**: haptic feedback on step changes and important workout milestones

#### **4. Streamlined User Experience**

* **Single completion modal**: eliminated multiple popups, replaced with one comprehensive activity summary
* **No interruption recording**: removed all popups during active recording sessions
* **Enhanced metrics display**: real-time live indicators, comprehensive post-activity analysis
* **Error recovery UI**: visual indicators for recovery status, errors, and connection issues
* **Background recording indicator**: clear visual feedback when recording continues in background

#### **5. JSON Storage and Sync Strategy**

* Activities are first recorded and stored locally as **JSON files** (GPS, BLE sensors, metrics).
* JSON files are uploaded to Supabase Storage when network is available.
* The JSON file is uploaded to Supabase Storage for backup and synchronization.
* Metadata extracted from the JSON file populates the **activities table** in Supabase.
* The JSON file serves as the **ground truth** for activity data and can be exported in various formats.

#### **6. Local-First with Smart Sync**

* **Offline recording**: activities are recorded and stored locally first for immediate availability
* **Automatic save**: activities are automatically saved with comprehensive completion workflow
* **Smart sync**: activities JSON files sync to Supabase when network is available with retry logic
* **Cleanup after sync**: local JSON data is automatically cleaned up after successful cloud storage

---

### 🔄 Enhanced Recording & Sync Flow

1. **Pre-Recording Setup** → Optional planned activity selection with structured workout templates
2. **Start Recording** → Enhanced `ActivityRecorderService` captures data with fault tolerance
3. **Real-time Data Collection** → GPS, BLE sensors, and smartwatch data with validation and buffering
4. **Planned Activity Guidance** → Step-by-step instructions, progress tracking, and compliance monitoring
5. **Background Persistence** → Automatic checkpointing and session state recovery
6. **Seamless Completion** → Single tap to finish, automatic save with comprehensive processing
7. **Activity Summary** → Single modal with performance analysis, training metrics, and sync status
8. **Background Sync** → JSON upload to Supabase with automatic retry and processing
9. **Cleanup & Notification** → Local data cleanup and sync confirmation

---

### 🔄 Sync Status & Two-Step Process

Each activity record has a **sync status**:

* `local_only`: Created locally, not yet uploaded
* `syncing`: JSON being uploaded
* `synced`: JSON uploaded, metadata stored
* `sync_failed`: Error during sync or processing

**Two-step sync ensures data integrity**:

1. JSON file uploaded to Supabase Storage

---

### 📊 Enhanced Data Handling

* **GPS data**: Location, altitude, speed, accuracy with intelligent filtering
* **Heart rate**: BPM with real-time zone analysis and compliance checking
* **Power**: Watts, normalized power, functional threshold power with training stress calculation
* **Cadence**: Steps/minute or RPM with activity-specific interpretation
* **Smartwatch integration**: Extended data streams including calories, steps, and advanced metrics
* **Environmental**: Temperature, barometric pressure (when available)
* **Planned activity metrics**: Step completion tracking, interval compliance, and workout progression
* **Performance analysis**: Training Stress Score (TSS), Intensity Factor (IF), and normalized metrics
* **Real-time validation**: Stale data filtering, accuracy thresholds, and sensor health monitoring

---

### ✅ Key Advantages of Enhanced System

* **Fault-tolerant**: Automatic recovery from crashes, disconnections, and interruptions
* **User-friendly**: Streamlined workflow with single completion modal and no interrupting popups
* **Multi-sensor ready**: Universal BLE support with smartwatch integration and auto-reconnection
* **Planned activity support**: Structured workouts with real-time guidance and compliance monitoring
* **Performance optimized**: No heavy processing on mobile, efficient background recording
* **Offline-first**: Users can record multi-hour sessions even without network connectivity
* **Export-ready**: JSON data can be converted to various formats (GPX, TCX, CSV) for compatibility with Garmin, Strava, TrainingPeaks, etc.
* **Comprehensive analytics**: Training metrics, performance analysis, and detailed activity summaries
* **Extensible architecture**: Supports additional sensors and activity types without app updates
