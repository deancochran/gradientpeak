# TurboFit Mobile App

A cross-platform fitness tracking mobile app built with Expo, React Native, and modern tooling. Features a lightweight, offline-first architecture with robust cloud sync, comprehensive activity tracking, and real-time analytics.

## 📱 Tech Stack

### Core Framework
- **Expo 53** - Development platform with new architecture enabled
- **React Native 0.79.5** - Cross-platform mobile framework
- **Expo Router 5** - File-based routing with typed routes
- **TypeScript 5.8** - Type safety and developer experience

### Styling & UI
- **NativeWind 4.1** - Tailwind CSS for React Native
- **React Native Reusables** - Shadcn/ui-inspired component library
- **Class Variance Authority** - Type-safe component variants
- **Expo Symbols** - Native iOS symbol integration

### Offline-First, Authentication & Database
- **Supabase** - PostgreSQL backend, authentication, and file storage
- **Expo SQLite** - Local database for activity metadata
- **Expo FileSystem** - Local storage for `.fit` activity files
- **Row Level Security** - JWT-based data access control

### Activity Tracking & FIT Files
- **@garmin/fitsdk** - Official Garmin FIT SDK for activity file generation/parsing
- **Expo Location** - GPS tracking with background support
- **Expo Task Manager** - Background location tracking
- **Expo Network** - Network connectivity monitoring for sync

### Utilities & Performance
- **Expo Secure Store** - Encrypted local storage
- **React Native Reanimated** - Performant animations
- **React Native Gesture Handler** - Native gesture recognition
- **React Native Quick Base64** - Binary data encoding for FIT files

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
│   └── workout/                 # Workout-specific components
│       ├── MetricCard.tsx       # Individual metric display
│       ├── MetricsGrid.tsx      # Grid layout for metrics
│       ├── RecordingControls.tsx # Start/pause/stop controls
│       └── WorkoutStatusBar.tsx # GPS/Bluetooth status
├── constants/                   # App-wide constants
├── contexts/                    # React Context providers
├── hooks/                       # Reusable hooks
│   ├── useAdvancedWorkoutRecorder.ts # Advanced recording with fault tolerance
│   ├── useActivityManager.ts    # Activity management and sync
│   └── useWorkoutMetrics.ts     # Dynamic metrics calculation
├── lib/                         # Core logic, utilities, and integrations
│   ├── services/                # Core business logic services
│   │   ├── activity-recorder.ts # Fault-tolerant activity recording
│   │   ├── activity-sync-service.ts # Cloud sync with Supabase
│   │   ├── fit-file-service.ts  # FIT file generation/parsing (Garmin SDK)
│   │   ├── local-activity-database.ts # SQLite for local storage
│   │   ├── workout-service.ts       # High-level workout orchestration
│   │   └── index.ts             # Service exports
│   ├── types/                   # TypeScript type definitions
│   │   ├── activity.ts          # Activity and recording types
│   │   ├── workout.ts           # Legacy workout types
│   │   └── index.ts             # Type exports
│   ├── utils/                   # Utility functions
│   │   ├── workout-utils.ts     # Activity calculations and formatting
│   │   └── index.ts             # Utility exports
│   ├── supabase.ts              # Supabase client and auth
│   └── utils.ts                 # General utility functions
├── modals/                      # Modal components
│   └── BluetoothDeviceModal.tsx # Bluetooth device selection
├── app.json                     # Expo app configuration
└── package.json                 # Dependencies and scripts
```

## 🎯 Advanced Activity Recording System

The application features a comprehensive, fault-tolerant activity recording system built around the **FIT file format as the source of truth**. This approach ensures maximum compatibility with third-party fitness applications and devices while maintaining flexibility for future enhancements.

### 🔧 Core Architecture

#### **1. FIT-First Design Philosophy**
- **No hardcoded activity types** - the system dynamically extracts whatever data is available from FIT files
- **Garmin SDK integration** - uses the official `@garmin/fitsdk` for maximum compatibility
- **Future-proof** - can handle any FIT file structure without code changes
- **Third-party imports** - seamlessly imports activities from Strava, Garmin Connect, etc.

#### **2. Fault-Tolerant Recording**
- **Interruption recovery** - automatically recovers from app crashes, phone restarts, or sensor disconnections
- **Background location tracking** - continues GPS tracking even when app is backgrounded using Expo Task Manager
- **Data buffering** - buffers sensor data to prevent loss during interruptions
- **Session persistence** - saves recording state to AsyncStorage for recovery

#### **3. Local-First with Smart Sync**
- **Offline recording** - activities are recorded and stored locally first for immediate availability
- **User decision point** - after stopping, users choose to save or discard each activity
- **Automatic sync** - activities sync to Supabase when network is available
- **Cleanup after sync** - local data is automatically cleaned up after successful cloud storage

### 🏗️ Service Architecture

#### **Core Services:**
1. **`ActivityRecorderService`** - Handles real-time recording with fault tolerance
2. **`FitFileService`** - FIT file generation and parsing using Garmin SDK
3. **`LocalActivityDatabaseService`** - SQLite storage for activities before sync
4. **`ActivitySyncService`** - Smart sync to Supabase with network awareness
5. **`WorkoutService`** - High-level orchestration of all activity operations

#### **React Hooks:**
1. **`useAdvancedWorkoutRecorder`** - Complete recording interface with live metrics
2. **`useActivityManager`** - Activity management, viewing, syncing, and importing
3. **`useWorkoutMetrics`** - Dynamic metrics calculation from any sensor data

### 📊 Dynamic Data Handling

#### **Flexible Sensor Support:**
- **GPS data** - Location, altitude, speed, accuracy
- **Heart rate** - BPM with zones and variability (HRV)
- **Power** - Watts, normalized power, functional threshold power
- **Cadence** - Steps/minute or RPM depending on activity
- **Environmental** - Temperature, barometric pressure
- **Custom sensors** - Extensible for any future sensor types

#### **Smart Metadata Extraction:**
The system automatically extracts and caches metadata from FIT files:
```typescript
interface ActivityMetadata {
  startTime: Date;
  totalDistance?: number;
  avgHeartRate?: number;
  maxPower?: number;
  elevationGain?: number;
  hasGpsData: boolean;
  hasPowerData: boolean;
  // ... and any other data found in the FIT file
}
```

### 🔄 Recording Flow

1. **Start Recording** → `ActivityRecorderService` creates fault-tolerant session
2. **Data Collection** → GPS and sensors collected in real-time with buffering
3. **Background Persistence** → Session state saved for interruption recovery
4. **Stop & Decision** → User prompted to save or discard the activity
5. **FIT Generation** → Complete FIT file generated using Garmin SDK
6. **Local Storage** → Activity stored in SQLite with metadata cache
7. **Smart Sync** → Automatic upload to Supabase when connected
8. **Cleanup** → Local files cleaned up after successful sync

### 🔄 Synchronization Strategy

The sync process is designed to be robust and transparent, using a status tracking system for each local record.

#### Sync Status
Each record in the local database is tagged with a sync status:
- `local_only`: The record has been created on the device but not yet synced.
- `syncing`: The record is actively being uploaded.
- `synced`: The record is successfully stored in the cloud.
- `sync_failed`: An error occurred during the sync attempt.

#### Two-Step Sync Process
Synchronization happens in two main steps to ensure data integrity:
1.  **File Upload**: The local `.fit` file is first uploaded to Supabase Storage.
2.  **Metadata Push**: Once the file is successfully uploaded, the corresponding activity metadata is pushed to the PostgreSQL database.

This process is managed by the sync manager, which also handles retries for failed attempts and provides feedback to the user on the status of their data.

## 💻 Usage Examples

### Recording an Activity

```typescript
import { useAdvancedWorkoutRecorder } from '@/hooks/useAdvancedWorkoutRecorder';

function RecordScreen() {
  const {
    isRecording,
    duration,
    distance,
    currentHeartRate,
    startWorkout,
    pauseWorkout,
    stopWorkout,
    addSensorData,
  } = useAdvancedWorkoutRecorder();

  const handleStart = async () => {
    await startWorkout(profileId);
  };

  // Add sensor data from Bluetooth devices
  const handleSensorData = (data) => {
    addSensorData({
      messageType: 'record',
      data: {
        heartRate: data.heartRate,
        power: data.power,
        cadence: data.cadence,
      }
    });
  };

  return (
    <View>
      <Text>Duration: {duration}s</Text>
      <Text>Distance: {(distance / 1000).toFixed(2)}km</Text>
      {currentHeartRate && <Text>HR: {currentHeartRate} bpm</Text>}
      
      {!isRecording ? (
        <Button onPress={handleStart}>Start Workout</Button>
      ) : (
        <>
          <Button onPress={pauseWorkout}>Pause</Button>
          <Button onPress={stopWorkout}>Stop</Button>
        </>
      )}
    </View>
  );
}
```

### Managing Activities

```typescript
import { useActivityManager } from '@/hooks/useActivityManager';

function ActivitiesScreen() {
  const {
    activities,
    syncStatus,
    loadActivities,
    syncAllActivities,
    importFitFile,
  } = useActivityManager();

  useEffect(() => {
    loadActivities(profileId);
  }, [profileId]);

  return (
    <View>
      <Text>Total Activities: {syncStatus.totalActivities}</Text>
      <Text>Pending Sync: {syncStatus.pendingActivities}</Text>
      
      <Button onPress={syncAllActivities}>
        Sync All Activities
      </Button>
      
      <Button onPress={() => importFitFile(selectedFilePath)}>
        Import FIT File
      </Button>

      {activities.map(activity => (
        <ActivityItem key={activity.id} activity={activity} />
      ))}
    </View>
  );
}
```

### Importing Third-Party Activities

```typescript
// Import from file picker
const result = await DocumentPicker.getDocumentAsync({
  type: 'application/octet-stream',
  copyToCacheDirectory: false,
});

if (result.type === 'success') {
  const activityId = await importFitFile(result.uri, result.name);
  if (activityId) {
    Alert.alert('Success', 'Activity imported and will sync automatically');
  }
}
```

## 🧪 Testing Strategy

### Unit Testing
The project uses Jest and React Native Testing Library:

```bash
# Install testing dependencies
bun add -D @testing-library/react-native @testing-library/jest-native jest

# Run tests
bun test

# Watch mode
bun test --watch
```

### Maestro E2E Testing

#### Installation
```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

#### Basic Test Structure
Create `.maestro/` directory with test flows:

```yaml
# .maestro/auth-flow.yaml
appId: com.deancochran.xnative
---
- launchApp
- tapOn:
    text: "Sign In"
- inputText: "test@example.com"
- tapOn:
    text: "Password"
- inputText: "password123"
- tapOn:
    text: "Continue"
- assertVisible:
    text: "Dashboard"
```

#### Running Tests
```bash
# Run specific test
maestro test .maestro/auth-flow.yaml

# Run all tests
maestro test .maestro/

# Run on specific device
maestro --device-id "iPhone-15" test .maestro/
```

### Testing Commands
```bash
# Lint code
bun lint

# Type checking
bun run check-types

# Format code
bun run format

# Run development server for testing
bun start
```

## 🔗 Deep Link Authentication

The app supports deep linking for seamless authentication flows, allowing users to complete email verification and password resets directly in the mobile app.

### Features

✅ **Email Verification** - Users can verify their email directly in the app  
✅ **Password Reset** - Users can set new passwords directly in the app  
✅ **Dynamic URL Schemes** - Different schemes for dev/preview/production environments  
✅ **Error Handling** - Graceful handling of expired or invalid links  

### URL Schemes

The app uses environment-specific URL schemes:

- **Development**: `app-scheme-dev://`
- **Preview**: `app-scheme-prev://` 
- **Production**: `app-scheme://`

### Auth Flow Routes

- **`/auth/callback`** - Handles email verification deep links
- **`/auth/reset-password`** - Handles password reset deep links

### Setup Required

1. **Configure Supabase Dashboard**:
   - Go to Authentication > URL Configuration
   - Add redirect URLs for each environment:
   ```
   app-scheme-dev://auth/callback
   app-scheme-dev://auth/reset-password
   app-scheme-prev://auth/callback
   app-scheme-prev://auth/reset-password
   app-scheme://auth/callback
   app-scheme://auth/reset-password
   ```

2. **Environment Variables**:
   ```bash
   EXPO_PUBLIC_APP_URL=app-scheme-dev://
   APP_ENV=development
   ```

### Testing Deep Links

```bash
# Test all deep links
npm run test:deep-links

# Test iOS only
npm run test:deep-links:ios

# Test Android only
npm run test:deep-links:android

# Show configuration URLs
npm run deep-links:config
```

### Manual Testing

**iOS Simulator:**
```bash
xcrun simctl openurl booted "app-scheme-dev://auth/callback?access_token=test&refresh_token=test"
```

**Android Emulator:**
```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "app-scheme-dev://auth/callback?access_token=test&refresh_token=test" \
  com.company.turbofit.dev
```

### How It Works

**Email Verification:**
1. User signs up → receives verification email
2. Taps link → app opens to `/auth/callback`
3. App processes tokens → user verified and signed in

**Password Reset:**
1. User requests reset → receives email
2. Taps link → app opens to `/auth/reset-password`
3. User sets new password → signed in with new password

For detailed setup instructions, see [`DEEP_LINK_SETUP.md`](./DEEP_LINK_SETUP.md).

## 🚀 Staging & Deployment

### Environment Configuration

#### Environment Variables
Create `.env` file:
```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-anon-key

# Deep Link Configuration (matches app.config.ts schemes)
EXPO_PUBLIC_APP_URL=app-scheme-dev://
APP_ENV=development
```

#### App Configuration (`app.json`)
```json
{
  "expo": {
    "name": "TurboFit",
    "slug": "turbofit",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.turbofit"
    },
    "android": {
      "package": "com.yourcompany.turbofit"
    }
  }
}
```

### Development Workflow

#### Local Development
```bash
# Start development server
bun start

# Platform-specific development
bun ios     # iOS Simulator
bun android # Android Emulator
bun web     # Web browser
```

#### Preview Builds
```bash
# Install EAS CLI
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Configure EAS
eas build:configure

# Create preview build
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

### EAS Build Configuration

#### Create `eas.json`
```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "autoIncrement": "buildNumber"
      },
      "android": {
        "autoIncrement": "versionCode"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### Production Deployment

#### iOS App Store
```bash
# Production build
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

#### Android Play Store
```bash
# Production build
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

#### Over-the-Air Updates
```bash
# Install EAS Update
npm install -g @expo/eas-cli

# Create update
eas update --branch production --message "Bug fixes and improvements"
```

## 🔧 Development Commands

### Package Management
```bash
# Install dependencies
bun install

# Add dependency
bun add package-name

# Add development dependency
bun add -D package-name

# Remove dependency
bun remove package-name
```

### Development Server
```bash
# Start development server
bun start

# Start with specific options
bun start --clear         # Clear cache
bun start --tunnel        # Use tunnel for external access
bun start --lan           # Use LAN for network access
```

### Platform Commands
```bash
# iOS
bun ios                   # iOS Simulator
bun ios --device         # Physical iOS device

# Android
bun android              # Android emulator
bun android --device     # Physical Android device

# Web
bun web                  # Web browser
```

### Build Commands
```bash
# Expo development build
eas build --platform ios --profile development
eas build --platform android --profile development

# Production builds
eas build --platform ios --profile production
eas build --platform android --profile production

# Local builds (requires setup)
eas build --local
```

### Utility Commands
```bash
# Reset project (remove example code)
bun run reset-project

# Clear Expo cache
npx expo r --clear

# Check project health
npx expo doctor

# Install iOS pods
cd ios && pod install

# Clean builds
npx expo run:ios --clean
npx expo run:android --clean
```

## 🐛 Troubleshooting


#### Build Issues
- **iOS Build Failures**: Run `cd ios && pod install`
- **Android Build Issues**: Clean build with `bun android --clean`
- **Metro Bundle Errors**: Clear cache with `npx expo r --clear`

#### Development Server
- **Port Conflicts**: Stop other React Native/Expo projects
- **Network Issues**: Try `bun start --tunnel` for external access
- **Cache Issues**: Use `--clear` flag to reset Metro cache

### Performance Optimization
- **Bundle Size**: Use Expo bundle analyzer
- **Memory Usage**: Monitor with React DevTools Profiler
- **Network**: Implement proper caching strategies
- **Animations**: Use `react-native-reanimated` for 60fps animations

---

## 🚀 Key Features Implemented

### ✅ **Fault-Tolerant Activity Recording**
- Automatic recovery from app crashes, phone restarts, or sensor disconnections
- Background GPS tracking continues even when app is closed
- Real-time sensor data collection (heart rate, power, cadence, temperature)
- Session persistence for interruption recovery

### ✅ **FIT-First Data Architecture**
- Official Garmin FIT SDK integration for maximum compatibility
- Dynamic metadata extraction from any FIT file structure
- Support for importing third-party activities (Strava, Garmin Connect, etc.)
- No hardcoded activity types - system adapts to available data

### ✅ **Smart Sync System**
- Local-first storage with automatic cloud sync
- Network-aware sync that handles poor connectivity
- User control over activity saving (save/discard decision)
- Automatic cleanup of local data after successful sync

### ✅ **Comprehensive UI Components**
- Modular workout recording interface
- Real-time metrics display with live updates  
- GPS and Bluetooth status indicators
- Activity management and sync status screens

### ✅ **Developer Experience**
- Fully typed TypeScript interfaces
- React hooks for easy state management
- Modular service architecture for maintainability
- Comprehensive error handling and logging

## 📚 Additional Resources

### Framework & SDK Documentation
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Reusables](https://github.com/mrzachnugent/react-native-reusables)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Garmin FIT SDK Documentation](https://developer.garmin.com/fit/overview/)

### Backend & Authentication
- [Supabase React Native Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [Supabase Deep Linking Guide](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Expo Router Deep Linking](https://docs.expo.dev/router/reference/linking/)

### Testing & Quality
- [Maestro Testing Documentation](https://maestro.mobile.dev/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)

### Fitness & Activity Tracking
- [FIT File Format Specification](https://developer.garmin.com/fit/file-types/)
- [ANT+ Device Profiles](https://www.thisisant.com/developer/ant-plus/device-profiles/)

This comprehensive setup provides a robust, production-ready foundation for a modern fitness tracking application with enterprise-grade fault tolerance, data integrity, and user experience.
