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

### Utilities & Performance
- **Expo Location** - GPS and location tracking
- **Expo Secure Store** - Encrypted local storage
- **React Native Reanimated** - Performant animations
- **React Native Gesture Handler** - Native gesture recognition

## 🏗️ Project Structure

```
apps/native/
├── app/                          # Expo Router file-based routing
│   ├── (auth)/                   # Authentication screens
│   ├── (tabs)/                  # Main app tab navigation
│   └── _layout.tsx              # Root layout with providers
├── assets/                      # Static assets (images, fonts)
├── components/                   # Reusable UI components
├── constants/                   # App-wide constants
├── contexts/                    # React Context providers
├── hooks/                       # Reusable hooks
├── lib/                         # Core logic, utilities, and integrations
│   ├── supabase.ts              # Supabase client
│   ├── database.ts              # Local SQLite database setup
│   ├── sync.ts                  # Offline-first sync manager
│   └── utils.ts                 # Utility functions
├── app.json                     # Expo app configuration
└── package.json                 # Dependencies and scripts
```

##  архитектура Офлайн-сначала

The application is built with an offline-first approach, ensuring that core functionality—like recording and viewing activities—remains available without a network connection. This is achieved through a custom, lightweight synchronization mechanism instead of heavy-duty solutions like WatermelonDB.

### Core Components
1.  **Local SQLite Database (`expo-sqlite`)**: All activity metadata (e.g., duration, distance, date) is stored locally in a SQLite database. This allows for fast, native-speed queries on the device.

2.  **Local File System (`expo-file-system`)**: Raw activity data, such as `.fit` files, are saved directly to the device's local filesystem. This is efficient for handling potentially large binary files.

3.  **Supabase Backend**:
    *   **PostgreSQL**: Serves as the source of truth for all user data once synced.
    *   **Storage**: Securely stores the `.fit` files in the cloud.

4.  **Sync Manager**: A custom logic layer responsible for orchestrating the synchronization process between the local device and the Supabase backend.

### Synchronization Strategy

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
2.  **Metadata Push**: Once the file is successfully uploaded, the corresponding activity metadata (with the file's new cloud URL) is pushed to the PostgreSQL database.

This process is managed by the sync manager, which also handles retries for failed attempts and provides feedback to the user on the status of their data. This architecture eliminates complex native dependencies, reduces overhead, and gives us full control over the data flow.

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

## 📚 Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Reusables](https://github.com/mrzachnugent/react-native-reusables)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Supabase React Native Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [Supabase Deep Linking Guide](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Expo Router Deep Linking](https://docs.expo.dev/router/reference/linking/)
- [Maestro Testing Documentation](https://maestro.mobile.dev/)

This comprehensive setup provides a robust foundation for developing, testing, and deploying a modern React Native application with best practices for performance, type safety, and user experience.
