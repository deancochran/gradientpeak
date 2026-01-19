# Background GPS Tracking Fix

## Problem
GPS tracking was stopping when the app was backgrounded, causing the breadcrumb trail to show straight lines when the app was foregrounded again.

## Root Causes Identified

### 1. Missing `expo-location` Plugin
The most critical issue was that the `expo-location` plugin was not configured in `app.config.ts`. This plugin is **essential** for:
- Configuring native modules for background location tracking
- Setting up proper AndroidManifest.xml entries automatically
- Ensuring the background location task is properly registered

### 2. Missing Android 14+ Permissions
Android 14+ requires the `FOREGROUND_SERVICE_LOCATION` permission to run location-based foreground services.

### 3. Suboptimal Background Task Configuration
The background location tracking configuration needed enhancements for:
- Better error handling
- Duplicate start prevention
- Activity type optimization for fitness tracking
- More robust logging for debugging

## Changes Made

### 1. app.config.ts
Added the `expo-location` plugin with proper configuration:
```typescript
[
  "expo-location",
  {
    locationAlwaysAndWhenInUsePermission:
      "Allow $(PRODUCT_NAME) to use your location to track activities.",
    locationAlwaysPermission:
      "Allow $(PRODUCT_NAME) to track your location even when the app is in the background.",
    locationWhenInUsePermission:
      "Allow $(PRODUCT_NAME) to use your location to track activities.",
    isAndroidBackgroundLocationEnabled: true,
    isAndroidForegroundServiceEnabled: true,
  },
]
```

Added Android permissions:
- `android.permission.FOREGROUND_SERVICE_LOCATION` (Android 14+ requirement)
- `android.permission.POST_NOTIFICATIONS` (for foreground service notification)

### 2. location.ts - Background Tracking Configuration
Enhanced `startBackgroundTracking()` with:
- Duplicate start prevention check
- Better foreground service notification configuration
- `pausesUpdatesAutomatically: false` to ensure continuous tracking
- `activityType: Location.ActivityType.Fitness` for optimized battery usage
- `killServiceOnDestroy: false` to keep service alive even if notification is dismissed
- Better error handling and logging

### 3. location.ts - Background Task Definition
Improved the TaskManager background task with:
- Comprehensive error handling
- Better logging for debugging
- Validation of location data before processing
- Callback count monitoring
- Resilient error recovery

## Testing Checklist

### Prerequisites
1. **Rebuild the app** - Native changes require a fresh build:
   ```bash
   cd apps/mobile
   npx expo prebuild --clean
   npx expo run:android  # or expo run:ios
   ```

2. **Permissions** - Ensure all permissions are granted:
   - Location (Always)
   - Background Location
   - Notifications

### Test Scenarios

#### Test 1: Basic Background Tracking
1. Start an outdoor activity recording
2. Verify GPS is tracking (breadcrumb trail appears)
3. Press home button to background the app
4. Walk/move for 2-3 minutes
5. Return to app
6. **Expected**: Continuous breadcrumb trail with no straight-line jumps

#### Test 2: Extended Background Duration
1. Start an outdoor activity recording
2. Background the app
3. Walk/move for 10+ minutes
4. Return to app
5. **Expected**: Complete continuous trail for entire duration

#### Test 3: App Switching
1. Start an outdoor activity recording
2. Switch to other apps multiple times
3. Return to recording app
4. **Expected**: Continuous tracking maintained throughout

#### Test 4: Lock Screen
1. Start an outdoor activity recording
2. Lock the device
3. Keep device locked while moving for 5 minutes
4. Unlock and open app
5. **Expected**: Complete trail recorded even with screen locked

### Debugging

If issues persist, check logs for these key indicators:

**Look for these success messages:**
```
[Background Location Task] Processing N location(s)
Background location tracking started successfully
```

**Common issues to watch for:**
```
[Background Location Task] No callbacks registered, buffering location
[Background Location Task] Invalid location, skipping
Background location tracking already running
```

### Android-Specific Notes

1. **Battery Optimization**: On some devices, you may need to disable battery optimization for the app:
   - Settings → Apps → GradientPeak → Battery → Unrestricted

2. **Foreground Service Notification**: The notification showing "Recording Activity" should remain visible while tracking. If it's dismissed, tracking may stop on some devices.

3. **Location Permissions**: Ensure "Allow all the time" is selected, not just "While using the app"

4. **Developer Options**: Enable "Keep screen awake while charging" for easier testing

### iOS-Specific Notes

1. **Background Location Indicator**: You should see the blue pill indicator at the top of the screen when the app is tracking in the background

2. **Permissions**: The "Always" location permission must be granted

3. **Simulated Location**: In Xcode simulator, use Debug → Location → City Run or Freeway Drive for testing

## Verification Steps

After rebuilding and deploying:

1. Check the notification appears when recording starts
2. Verify notification persists when app is backgrounded
3. Monitor logs using:
   ```bash
   npx expo start
   # Or for device logs:
   adb logcat | grep "Background Location Task"  # Android
   ```

4. Verify breadcrumb trail is continuous without gaps or straight-line jumps

## Additional Improvements

Consider these future enhancements:
- Battery optimization prompt at first launch
- User notification if background tracking fails
- Settings option to adjust GPS accuracy vs battery trade-off
- Fallback to cell tower location if GPS is unavailable

## Rollback

If these changes cause issues:

1. Remove the `expo-location` plugin from `app.config.ts`
2. Remove `FOREGROUND_SERVICE_LOCATION` and `POST_NOTIFICATIONS` permissions
3. Revert changes to `location.ts`
4. Rebuild the app

## References

- [Expo Location Documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Expo Task Manager Documentation](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Android Foreground Services](https://developer.android.com/develop/background-work/services/foreground-services)
