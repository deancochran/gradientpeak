# Activity Recorder Improvements Plan

## Overview
Improvements to the mobile app's ActivityRecorder system:

1. **Activity-Type Based Permissions** - Different permissions based on activity type
2. **Service Lifecycle Management** - Service created on modal entry, permissions checked on start
3. **Simplified Live Metrics** - Continue reading from live sensors (no DB sync needed)
4. **Smart BLE Reconnection** - Single retry with 30s timeout, then mark as failed

---

## 1. Activity-Type Based Permissions

### Permission Requirements by Activity Type

| Activity Type | Bluetooth | GPS (Location) | Background GPS |
|--------------|-----------|----------------|----------------|
| `outdoor_run` | ✅ | ✅ | ✅ |
| `outdoor_bike` | ✅ | ✅ | ✅ |
| `indoor_treadmill` | ✅ | ❌ | ❌ |
| `indoor_bike_trainer` | ✅ | ❌ | ❌ |
| `indoor_strength` | x | ❌ | ❌ |
| `indoor_swim` | ✅ | ❌ | ❌ |
| `other` | ✅ | ✅ | ✅ |

**Rule**:
- **Bluetooth**: Required for all activities (heart rate, power, cadence sensors)
- **GPS**: Required only for outdoor activities (`outdoor_run`, `outdoor_bike`, `other`)
- **Background GPS**: Required when GPS is required (for continuous tracking)

---

## 2. Enhanced PermissionsManager

Update the existing `PermissionsManager` to handle activity-type-based permission requirements.

**File**: `apps/mobile/src/lib/services/ActivityRecorder/permissions.ts`

### A. Add Activity-Type Permission Mapping

```typescript
import { PublicActivityType } from "@repo/core";
import * as Location from "expo-location";
import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";

export type PermissionType = "bluetooth" | "location" | "location-background";

/** Permission state for UI display */
export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  loading: boolean;
  name: string;
  description: string;
  required?: boolean;
}

/** Result of permission check for activity */
export interface ActivityPermissionCheckResult {
  canStart: boolean;
  missing: PermissionType[];
  denied: PermissionType[];
}

/** Centralized permission manager */
export class PermissionsManager {
  permissions: Record<PermissionType, PermissionState> = {} as Record<
    PermissionType,
    PermissionState
  >;

  // ================================
  // Activity-Type Permission Mapping
  // ================================

  /**
   * Get required permissions for an activity type
   */
  static getRequiredPermissions(activityType: PublicActivityType): PermissionType[] {
    const isOutdoor = ["outdoor_run", "outdoor_bike", "other"].includes(activityType);

    if (isOutdoor) {
      return ["bluetooth", "location", "location-background"];
    } else {
      return ["bluetooth"];
    }
  }

  /**
   * Check if activity type requires GPS
   */
  static requiresGPS(activityType: PublicActivityType): boolean {
    return ["outdoor_run", "outdoor_bike", "other"].includes(activityType);
  }

  // ================================
  // Permission Checking for Activity
  // ================================

  /**
   * Check if all required permissions are granted for activity type
   * Does NOT request permissions - only checks current state
   */
  async checkForActivity(
    activityType: PublicActivityType
  ): Promise<ActivityPermissionCheckResult> {
    const required = PermissionsManager.getRequiredPermissions(activityType);
    const missing: PermissionType[] = [];
    const denied: PermissionType[] = [];

    for (const permType of required) {
      // Check current permission state
      const result = await this.check(permType);

      if (!result.granted) {
        missing.push(permType);

        // Check if permanently denied
        if (!result.canAskAgain) {
          denied.push(permType);
        }
      }
    }

    return {
      canStart: missing.length === 0,
      missing,
      denied,
    };
  }

  /**
   * Request all required permissions for activity type
   * Returns true only if ALL required permissions are granted
   */
  async requestForActivity(activityType: PublicActivityType): Promise<boolean> {
    const required = PermissionsManager.getRequiredPermissions(activityType);
    const results: boolean[] = [];

    for (const permType of required) {
      const granted = await this.ensure(permType);
      results.push(granted);
    }

    // All required permissions must be granted
    return results.every((granted) => granted);
  }

  /**
   * Get user-friendly error message for missing permissions
   */
  getMissingPermissionsMessage(
    activityType: PublicActivityType,
    missing: PermissionType[]
  ): string {
    if (missing.length === 0) return "";

    const activityName = activityType.replace(/_/g, " ");
    const isOutdoor = PermissionsManager.requiresGPS(activityType);

    const permList = missing
      .map((p) => {
        const name = PermissionsManager.permissionNames[p];
        const desc = PermissionsManager.permissionDescriptions[p];
        return `• ${name}: ${desc}`;
      })
      .join("\n");

    return `To track ${activityName}${isOutdoor ? " with GPS" : ""}, enable:\n\n${permList}`;
  }

  /**
   * Get message for permanently denied permissions
   */
  getDeniedPermissionsMessage(denied: PermissionType[]): string {
    if (denied.length === 0) return "";

    const permList = denied
      .map((p) => PermissionsManager.permissionNames[p])
      .join(", ");

    return `${permList} permission(s) denied. Enable in Settings to continue.`;
  }

  // ================================
  // Individual Permission Management
  // ================================

  /**
   * Check a single permission (does not request)
   */
  async check(type: PermissionType): Promise<{ granted: boolean; canAskAgain: boolean }> {
    switch (type) {
      case "bluetooth":
        return await PermissionsManager.checkBluetooth();
      case "location":
        return await PermissionsManager.checkLocationForeground();
      case "location-background":
        return await PermissionsManager.checkLocationBackground();
      default:
        return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Ensure a permission is granted (requests if possible)
   */
  async ensure(type: PermissionType): Promise<boolean> {
    let result: { granted: boolean; canAskAgain: boolean };

    switch (type) {
      case "bluetooth":
        result = await PermissionsManager.checkBluetooth();
        if (!result.granted && result.canAskAgain) {
          result = await PermissionsManager.requestBluetooth();
        }
        break;

      case "location":
        result = await PermissionsManager.ensureLocationForeground();
        break;

      case "location-background":
        result = await PermissionsManager.ensureLocationBackground();
        break;

      default:
        return false;
    }

    if (!result.granted && !result.canAskAgain) {
      PermissionsManager.showPermissionAlert(type);
    }

    this.permissions[type] = {
      ...result,
      name: PermissionsManager.permissionNames[type],
      description: PermissionsManager.permissionDescriptions[type],
      loading: false,
    };

    return result.granted;
  }

  // ================================
  // Permission Check/Request Helpers
  // ================================

  /** Check location (foreground) - does not request */
  private static async checkLocationForeground() {
    const status = await Location.getForegroundPermissionsAsync();
    return {
      granted: status.status === "granted",
      canAskAgain: status.canAskAgain,
    };
  }

  /** Check location (background) - does not request */
  private static async checkLocationBackground() {
    const status = await Location.getBackgroundPermissionsAsync();
    return {
      granted: status.status === "granted",
      canAskAgain: status.canAskAgain,
    };
  }

  /** Check + request location (foreground) */
  private static async ensureLocationForeground() {
    const status = await Location.getForegroundPermissionsAsync();
    if (status.status === "granted") {
      return { granted: true, canAskAgain: status.canAskAgain };
    }

    const request = await Location.requestForegroundPermissionsAsync();
    return {
      granted: request.status === "granted",
      canAskAgain: request.canAskAgain,
    };
  }

  /** Check + request location (background) */
  private static async ensureLocationBackground() {
    const status = await Location.getBackgroundPermissionsAsync();
    if (status.status === "granted") {
      return { granted: true, canAskAgain: status.canAskAgain };
    }

    const request = await Location.requestBackgroundPermissionsAsync();
    return {
      granted: request.status === "granted",
      canAskAgain: request.canAskAgain,
    };
  }

  /** Bluetooth permissions (Android-specific) */
  private static async checkBluetooth() {
    if (Platform.OS !== "android") return { granted: true, canAskAgain: true };

    const apiLevel = Platform.constants?.Version ?? 0;
    try {
      if (apiLevel >= 31) {
        const scan = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
        );
        const connect = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        );
        return { granted: scan && connect, canAskAgain: true };
      } else {
        const location = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
        );
        return { granted: location, canAskAgain: true };
      }
    } catch (error) {
      console.error("Error checking BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  }

  private static async requestBluetooth() {
    if (Platform.OS !== "android") return { granted: true, canAskAgain: true };

    const apiLevel = Platform.constants?.Version ?? 0;
    try {
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        const granted = Object.values(results).every(
          (r) => r === PermissionsAndroid.RESULTS.GRANTED
        );
        const denied = Object.values(results).some(
          (r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        );
        return { granted, canAskAgain: !denied };
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {
            title: "Location Permission for Bluetooth",
            message:
              "This app needs location access to scan for Bluetooth devices.",
            buttonPositive: "OK",
          }
        );
        return {
          granted: result === PermissionsAndroid.RESULTS.GRANTED,
          canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        };
      }
    } catch (error) {
      console.error("Error requesting BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  }

  // ================================
  // Convenience Helpers
  // ================================

  /** Get permission state */
  get(type: PermissionType): PermissionState | null {
    return this.permissions[type] || null;
  }

  /** Check all permissions (legacy - prefer checkForActivity) */
  async checkAll() {
    const types: PermissionType[] = [
      "bluetooth",
      "location",
      "location-background",
    ];
    for (const t of types) {
      await this.check(t);
    }
  }

  static showPermissionAlert(type: PermissionType) {
    Alert.alert(
      `${this.permissionNames[type]} Permission Required`,
      `Please enable ${this.permissionNames[type]} in settings to use this feature.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
  }

  static permissionNames: Record<PermissionType, string> = {
    bluetooth: "Bluetooth",
    location: "Location",
    "location-background": "Background Location",
  };

  static permissionDescriptions: Record<PermissionType, string> = {
    bluetooth: "Connect to heart rate monitors and cycling sensors",
    location: "Track your route and calculate distance",
    "location-background": "Continue tracking your route in background",
  };
}
```

---

## 3. Service Lifecycle Management

Update the hook to create service on modal entry and check permissions only when user clicks start.

**File**: `apps/mobile/src/lib/hooks/useActivityRecorder.ts`

```typescript
import { useState, useEffect, useSyncExternalStore } from "react";
import { AppState, AppStateStatus } from "react-native";
import { ActivityRecorderService } from "../services/ActivityRecorder";
import { useRequireAuth } from "./useAuth";

/**
 * Direct access to ActivityRecorderService with automatic re-renders
 * Service is created on first call and persists until cleanup
 */
export const useActivityRecorder = () => {
  const { profile } = useRequireAuth();

  if (!profile) {
    throw new Error("useActivityRecorder requires authentication");
  }

  // Create service instance (lazy initialization on modal entry)
  const [service] = useState(() => {
    console.log("🎯 ActivityRecorderService created");
    return new ActivityRecorderService({ id: profile.id } as any);
  });

  // Subscribe to service changes - React will re-render automatically
  useSyncExternalStore(
    (callback) => service.subscribe(callback),
    () => service
  );

  // Cleanup on unmount (only if not recording)
  useEffect(() => {
    return () => {
      if (service.state !== "recording" && service.state !== "paused") {
        service.cleanup().catch(console.error);
        console.log("🧹 Service cleaned up (modal closed, not recording)");
      } else {
        console.log("⚠️ Service kept alive (recording in progress)");
      }
    };
  }, [service]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (service.state === "recording") {
        if (nextAppState === "background") {
          console.log("📱 App backgrounded - recording continues");
          // Foreground service keeps GPS and BLE active
        } else if (nextAppState === "active") {
          console.log("📱 App resumed - sensors continue from live data");
          // Live metrics continue naturally from sensor readings
          // No DB sync needed
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription?.remove();
  }, [service]);

  return service;
};
```

---

## 4. Update Activity Modal with Permission Checks

**File**: `apps/mobile/src/app/modals/record/activity.tsx`

Add permission checking before allowing recording to start:

```typescript
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { PublicActivityType } from "@repo/core";
import { useRouter } from "expo-router";
import { CheckCircle, ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";

const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Outdoor Run",
  outdoor_bike: "Outdoor Cycling",
  indoor_bike_trainer: "Indoor Cycling",
  indoor_treadmill: "Indoor Treadmill",
  indoor_strength: "Indoor Strength Training",
  indoor_swim: "Swimming",
  other: "Other Activity",
};

export default function ActivitySelectionModal() {
  const service = useActivityRecorder(); // Service created on modal entry
  const [mode, setMode] = useState<ActivityMode>("unplanned");
  const [selectedType, setSelectedType] = useState<PublicActivityType>("outdoor_run");
  const [selectedPlanned, setSelectedPlanned] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const router = useRouter();

  /**
   * Handle start button click - check permissions first
   */
  const handleStartActivity = async () => {
    setIsStarting(true);

    try {
      // Step 1: Check permissions for selected activity type
      const permCheck = await service.permissionsManager.checkForActivity(selectedType);

      if (!permCheck.canStart) {
        // Permissions missing - show appropriate message
        if (permCheck.denied.length > 0) {
          // Some permissions permanently denied
          Alert.alert(
            "Permissions Required",
            service.permissionsManager.getDeniedPermissionsMessage(permCheck.denied),
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => Linking.openSettings(),
              },
            ]
          );
        } else {
          // Permissions not granted yet - offer to request
          Alert.alert(
            "Permissions Needed",
            service.permissionsManager.getMissingPermissionsMessage(
              selectedType,
              permCheck.missing
            ),
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Grant Permissions",
                onPress: async () => {
                  // Request all required permissions
                  const granted = await service.permissionsManager.requestForActivity(
                    selectedType
                  );

                  if (granted) {
                    // All permissions granted - start recording
                    await startRecording();
                  } else {
                    Alert.alert(
                      "Cannot Start",
                      "All required permissions must be granted to start recording."
                    );
                  }
                },
              },
            ]
          );
        }

        setIsStarting(false);
        return;
      }

      // Step 2: All permissions granted - start recording
      await startRecording();
    } catch (error) {
      console.error("Error starting activity:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
      setIsStarting(false);
    }
  };

  /**
   * Start the recording (permissions already verified)
   */
  const startRecording = async () => {
    try {
      await service.startRecording();

      // Verify recording actually started
      if (service.state === "recording" && service.recording) {
        console.log("✅ Recording started successfully");
        router.back();
      } else {
        Alert.alert("Error", "Recording failed to start. Please try again.");
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">Select Activity</Text>
        <View className="w-10" />
      </View>

      {/* Mode Selection Tabs */}
      <View className="px-4 py-3 bg-muted/50">
        <View className="flex-row bg-background rounded-lg p-1">
          <Button
            variant={mode === "unplanned" ? "default" : "ghost"}
            onPress={() => setMode("unplanned")}
            className="flex-1"
          >
            <Text
              className={
                mode === "unplanned"
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }
            >
              Quick Start
            </Text>
          </Button>
          <Button
            variant={mode === "planned" ? "default" : "ghost"}
            onPress={() => setMode("planned")}
            className="flex-1"
          >
            <Text
              className={
                mode === "planned"
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }
            >
              Planned Workout
            </Text>
          </Button>
        </View>
      </View>

      {/* Content Area */}
      <ScrollView className="flex-1 px-4">
        {/* Activity selection components */}
      </ScrollView>

      {/* Footer Actions */}
      <View className="border-t border-border p-4">
        <Button
          onPress={handleStartActivity}
          className="w-full"
          disabled={isStarting || service.state === "recording"}
        >
          <Text className="font-semibold">
            {isStarting
              ? "Starting..."
              : mode === "planned" && selectedPlanned
                ? "Start Planned Workout"
                : `Start ${ACTIVITY_NAMES[selectedType]}`}
          </Text>
        </Button>

        {service.state === "recording" && (
          <Text className="text-center text-sm text-muted-foreground mt-2">
            Recording already in progress
          </Text>
        )}
      </View>
    </View>
  );
}
```

---

## 5. Smart BLE Reconnection (Single Retry)

Update `SensorsManager` to detect disconnection after 30s and attempt single reconnection.

**File**: `apps/mobile/src/lib/services/ActivityRecorder/sensors.ts`

### A. Update Sensor Types

```typescript
export type SensorConnectionState =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "failed";

export interface ConnectedSensor {
  id: string;
  name: string;
  type: string;
  connectionState: SensorConnectionState;
  lastDataTimestamp: number;
  reconnectAttempted: boolean; // Track if reconnection already attempted
  device: Device;
}
```

### B. Add Connection Monitoring

```typescript
export class SensorsManager {
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private connectionMonitorTimer?: ReturnType<typeof setInterval>;
  private readonly DISCONNECT_TIMEOUT_MS = 30000; // 30 seconds no data = disconnected

  constructor() {
    // Start monitoring sensor health
    this.startConnectionMonitoring();
  }

  /**
   * Monitor sensors for data timeouts (check every 10s)
   */
  private startConnectionMonitoring(): void {
    this.connectionMonitorTimer = setInterval(() => {
      this.checkSensorHealth();
    }, 10000);
  }

  private stopConnectionMonitoring(): void {
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer);
      this.connectionMonitorTimer = undefined;
    }
  }

  /**
   * Check each sensor's last data timestamp
   * If no data for 30s, attempt ONE reconnection
   */
  private async checkSensorHealth(): Promise<void> {
    const now = Date.now();

    for (const [id, sensor] of this.connectedSensors.entries()) {
      // Skip if already failed or reconnecting
      if (sensor.connectionState === "failed" || sensor.connectionState === "reconnecting") {
        continue;
      }

      const timeSinceLastData = now - sensor.lastDataTimestamp;

      // Disconnected if no data for 30 seconds
      if (timeSinceLastData > this.DISCONNECT_TIMEOUT_MS) {
        console.warn(`⚠️ Sensor ${sensor.name} disconnected (no data for ${timeSinceLastData}ms)`);

        sensor.connectionState = "disconnected";
        this.notifyConnectionChange(sensor);

        // Attempt reconnection ONCE if not already attempted
        if (!sensor.reconnectAttempted) {
          console.log(`🔄 Attempting to reconnect ${sensor.name} (first attempt)`);
          await this.attemptReconnection(id, sensor);
        } else {
          // Already tried once - mark as failed permanently
          console.error(`❌ Sensor ${sensor.name} marked as FAILED (reconnection already attempted)`);
          sensor.connectionState = "failed";
          this.notifyConnectionChange(sensor);
        }
      }
    }
  }

  /**
   * Single reconnection attempt
   */
  private async attemptReconnection(id: string, sensor: ConnectedSensor): Promise<void> {
    sensor.connectionState = "reconnecting";
    sensor.reconnectAttempted = true; // Mark that we tried
    this.notifyConnectionChange(sensor);

    try {
      // Attempt to reconnect
      await sensor.device.connect();
      await this.setupCharacteristics(sensor.device);

      // Success!
      sensor.connectionState = "connected";
      sensor.lastDataTimestamp = Date.now();
      console.log(`✅ Successfully reconnected ${sensor.name}`);
      this.notifyConnectionChange(sensor);
    } catch (error) {
      // Failed - mark as permanently failed
      console.error(`❌ Failed to reconnect ${sensor.name}:`, error);
      sensor.connectionState = "failed";
      this.notifyConnectionChange(sensor);
    }
  }

  /**
   * Update sensor's last data timestamp (called when data received)
   */
  private updateSensorDataTimestamp(deviceId: string): void {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor) {
      sensor.lastDataTimestamp = Date.now();

      // If sensor was disconnected but now receiving data, mark as connected
      if (sensor.connectionState === "disconnected") {
        console.log(`✅ Sensor ${sensor.name} reconnected automatically`);
        sensor.connectionState = "connected";
        this.notifyConnectionChange(sensor);
      }
    }
  }

  /**
   * Called when BLE data is received - update timestamp
   */
  private handleBLEData(deviceId: string, characteristic: string, data: Buffer): void {
    // Update timestamp to prevent false disconnection
    this.updateSensorDataTimestamp(deviceId);

    // Parse and emit sensor reading
    const reading = this.parseCharacteristic(characteristic, data);
    if (reading) {
      this.emitReading(reading);
    }
  }

  /**
   * Cleanup
   */
  async disconnectAll(): Promise<void> {
    this.stopConnectionMonitoring();

    for (const sensor of this.connectedSensors.values()) {
      try {
        await sensor.device.cancelConnection();
      } catch (error) {
        console.warn(`Failed to disconnect ${sensor.name}:`, error);
      }
    }

    this.connectedSensors.clear();
  }
}
```

---

## Implementation Checklist

### Phase 1: Enhanced PermissionsManager (High Priority)
- [ ] Add `getRequiredPermissions()` static method
- [ ] Add `requiresGPS()` static method
- [ ] Add `ActivityPermissionCheckResult` interface
- [ ] Add `checkForActivity()` method
- [ ] Add `requestForActivity()` method
- [ ] Add `getMissingPermissionsMessage()` method
- [ ] Add `getDeniedPermissionsMessage()` method
- [ ] Add `check()` method for individual permission checks
- [ ] Add helper methods: `checkLocationForeground()`, `checkLocationBackground()`

### Phase 2: Service Lifecycle (High Priority)
- [ ] Update `useActivityRecorder` hook with lazy service initialization
- [ ] Add cleanup logic that preserves service during active recording
- [ ] Remove old singleton pattern (if exists)
- [ ] Test service creation on modal entry
- [ ] Test service cleanup on modal exit (without recording)
- [ ] Test service persistence during active recording

### Phase 3: Activity Modal Integration (High Priority)
- [ ] Update `handleStartActivity()` to check permissions first
- [ ] Add permission checking logic with `checkForActivity()`
- [ ] Add missing permission alert with request option
- [ ] Add denied permission alert with settings link
- [ ] Block start button if permissions missing
- [ ] Add loading state during permission requests
- [ ] Test full flow with different activity types
- [ ] Test denied permission handling

### Phase 4: BLE Reconnection Logic (Medium Priority)
- [ ] Add `SensorConnectionState` type with "failed" state
- [ ] Add `reconnectAttempted` flag to `ConnectedSensor` interface
- [ ] Implement `startConnectionMonitoring()` with 10s interval
- [ ] Implement `checkSensorHealth()` with 30s timeout detection
- [ ] Implement `attemptReconnection()` with single retry
- [ ] Add `updateSensorDataTimestamp()` method
- [ ] Update `handleBLEData()` to call timestamp update
- [ ] Add `stopConnectionMonitoring()` to cleanup
- [ ] Test disconnect detection (30s timeout)
- [ ] Test single reconnection attempt
- [ ] Test failed state after retry failure

### Phase 5: Documentation (Low Priority)
- [ ] Update mobile README with permission flow
- [ ] Document activity-type permission requirements
- [ ] Document BLE reconnection behavior
- [ ] Update CHANGELOG with improvements

---

## Summary

### Key Changes
1. **PermissionsManager Enhanced** - Activity-type aware permission checking integrated into existing manager
2. **Service Lifecycle** - Created on modal entry, destroyed on exit (unless recording)
3. **Permission Blocking** - Cannot start recording without required permissions
4. **BLE Reconnection** - Single retry after 30s timeout, then permanent "failed" state
5. **Live Metrics** - No DB sync needed; sensors continue naturally

### Files Modified
- `apps/mobile/src/lib/services/ActivityRecorder/permissions.ts` (Enhanced)
- `apps/mobile/src/lib/hooks/useActivityRecorder.ts` (Service lifecycle)
- `apps/mobile/src/app/modals/record/activity.tsx` (Permission checking)
- `apps/mobile/src/lib/services/ActivityRecorder/sensors.ts` (Reconnection logic)
