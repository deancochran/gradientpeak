# Fault Tolerance Improvements - Implementation Plan

**Objective**: Implement viable fault tolerance improvements for GradientPeak based on analysis of Auuki's implementation.

**Date**: 2025-12-13  
**Status**: Ready for Implementation  
**Priority**: High (Critical Gaps) → Medium (Quality Improvements)

---

## Executive Summary

This document outlines **actionable, viable improvements** to GradientPeak's fault tolerance, validation, and error handling based on the comprehensive comparison with Auuki. The improvements are prioritized by **impact, feasibility, and risk**.

### Implementation Philosophy

- ✅ **Fix critical gaps immediately** (data corruption risks)
- ✅ **Leverage GradientPeak's strengths** (file-based storage, React Native ecosystem)
- ✅ **Avoid over-engineering** (no full architectural rewrites)
- ✅ **Maintain simplicity** (minimal complexity increase)
- ❌ **Skip low-ROI items** (watchAdvertisements not available in React Native)

### Scope

This plan focuses on **6 high-impact improvements**:
1. ⚠️ **Concurrent Recording Prevention** (Critical - Data Corruption Risk)
2. ⚠️ **Metric Bounds Enforcement** (Critical - Data Integrity Risk)
3. 🔧 **Enhanced Reconnection Strategy** (Medium - User Experience)
4. 🔧 **Battery Monitoring** (Medium - User Experience)
5. 🔧 **Visual Disconnect Feedback** (Medium - User Experience)
6. 🔧 **Pre-Recording Validation** (Low - User Experience)

**Out of Scope** (Not Viable for React Native):
- ❌ watchAdvertisements API (Web Bluetooth feature, not available in react-native-ble-plx)
- ❌ Event-driven state bus (architectural rewrite, low ROI)

---

## Table of Contents

1. [Critical Improvements (Must Implement)](#1-critical-improvements-must-implement)
2. [Medium Priority Improvements (Recommended)](#2-medium-priority-improvements-recommended)
3. [Low Priority Improvements (Optional)](#3-low-priority-improvements-optional)
4. [Implementation Sequence](#4-implementation-sequence)
5. [Testing Strategy](#5-testing-strategy)
6. [Risk Assessment](#6-risk-assessment)

---

## 1. Critical Improvements (Must Implement)

### 1.1 Concurrent Recording Prevention

**Priority**: ⚠️ **CRITICAL**  
**Risk**: Data corruption, duplicate activities, state confusion  
**Effort**: Low (5 minutes)  
**Impact**: High

#### Problem

GradientPeak's `startRecording()` method doesn't check if a recording is already in progress. This allows:
- User accidentally tapping "Start" twice
- Navigation bugs triggering duplicate starts
- Race conditions in UI state management

**Result**: Metadata overwritten, multiple timers running, corrupted StreamBuffer files.

#### Solution

Add state validation at the beginning of `startRecording()`:

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:344`

```typescript
async startRecording() {
  console.log("[Service] Starting recording");

  // NEW: Prevent concurrent recordings
  if (this.state === "recording") {
    const error = "Cannot start recording: A recording is already in progress";
    console.error(`[Service] ${error}`);
    throw new Error(error);
  }

  if (this.state === "paused") {
    const error = "Cannot start recording: Please resume the paused recording first";
    console.error(`[Service] ${error}`);
    throw new Error(error);
  }

  // Check all necessary permissions
  const allGranted = await areAllPermissionsGranted();
  if (!allGranted) {
    console.error("[Service] Cannot start recording - missing permissions");
    throw new Error(
      "All permissions (Bluetooth, Location, and Background Location) are required to start recording",
    );
  }

  // ... rest of implementation
}
```

#### Testing

```typescript
// Test case 1: Double start should throw
service.startRecording();
expect(() => service.startRecording()).toThrow("already in progress");

// Test case 2: Start while paused should throw
service.startRecording();
service.pauseRecording();
expect(() => service.startRecording()).toThrow("resume the paused recording");
```

#### UI Changes (Optional)

Disable the "Start Recording" button when `state === "recording"`:

**File**: `apps/mobile/app/(internal)/record/index.tsx`

```typescript
<Button
  onPress={handleStart}
  disabled={service.state === "recording" || service.state === "paused"}
>
  <Text>Start Recording</Text>
</Button>
```

---

### 1.2 Metric Bounds Enforcement

**Priority**: ⚠️ **CRITICAL**  
**Risk**: Invalid sensor data enters system (e.g., HR=500 bpm, Power=10000W)  
**Effort**: Low (2 minutes)  
**Impact**: High

#### Problem

GradientPeak has `validateSensorReading()` but it's **never called** during BLE data parsing. Invalid values can:
- Corrupt metric calculations (avg, max, zones)
- Display nonsensical data to users
- Break FIT file export
- Skew training load calculations

#### Solution

Call validation in `parseBleData()` before returning:

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:520`

```typescript
parseBleData(
  metricType: BleMetricType,
  raw: ArrayBuffer,
  deviceId: string,
): SensorReading | null {
  let reading: SensorReading | null = null;

  switch (metricType) {
    case BleMetricType.HeartRate:
      reading = this.parseHeartRate(raw, deviceId);
      break;
    case BleMetricType.Power:
      reading = this.parsePower(raw, deviceId);
      break;
    case BleMetricType.Cadence:
      reading = this.parseCSCMeasurement(raw, deviceId);
      break;
    case BleMetricType.Speed:
      reading = this.parseRSCMeasurement(raw, deviceId);
      break;
    default:
      return null;
  }

  // NEW: Validate reading before returning
  if (!reading) return null;
  
  const validated = this.validateSensorReading(reading);
  if (!validated) {
    console.warn(
      `[SensorsManager] Invalid ${reading.metric} reading rejected: ${reading.value}`,
    );
  }
  
  return validated;
}
```

#### Current Bounds (Already Defined)

```typescript
validateSensorReading(reading: SensorReading): SensorReading | null {
  switch (reading.metric) {
    case "heartrate":
      if (typeof reading.value === "number" && reading.value >= 30 && reading.value <= 250)
        return reading;
      break;
    case "power":
      if (typeof reading.value === "number" && reading.value >= 0 && reading.value <= 4000)
        return reading;
      break;
    case "cadence":
      if (typeof reading.value === "number" && reading.value >= 0 && reading.value <= 300)
        return reading;
      break;
    case "speed":
      if (typeof reading.value === "number" && reading.value >= 0 && reading.value <= 100)
        return reading;
      break;
  }
  return null;
}
```

#### Testing

```typescript
// Test case 1: Valid reading passes
const validHR = { metric: "heartrate", value: 150, timestamp: Date.now() };
expect(validateSensorReading(validHR)).not.toBeNull();

// Test case 2: Invalid reading rejected
const invalidHR = { metric: "heartrate", value: 500, timestamp: Date.now() };
expect(validateSensorReading(invalidHR)).toBeNull();

// Test case 3: Edge case at boundary
const boundaryHR = { metric: "heartrate", value: 250, timestamp: Date.now() };
expect(validateSensorReading(boundaryHR)).not.toBeNull();
```

#### Logging Enhancement (Optional)

Track rejected readings for debugging:

```typescript
private rejectedReadingsCount: Map<string, number> = new Map();

// In parseBleData after validation fails:
if (!validated) {
  const key = `${reading.metric}_${deviceId}`;
  const count = (this.rejectedReadingsCount.get(key) || 0) + 1;
  this.rejectedReadingsCount.set(key, count);
  
  if (count % 10 === 0) {
    console.warn(
      `[SensorsManager] ${count} invalid ${reading.metric} readings from ${deviceId}`,
    );
  }
}
```

---

## 2. Medium Priority Improvements (Recommended)

### 2.1 Enhanced Reconnection Strategy

**Priority**: 🔧 **MEDIUM**  
**Risk**: Sensor remains disconnected after transient network issues  
**Effort**: Medium (30 minutes)  
**Impact**: Medium

#### Problem

GradientPeak's single reconnection attempt (`reconnectAttempted` flag) is conservative. If the first attempt fails due to:
- Bluetooth stack temporarily busy
- Sensor just out of range (moving closer)
- OS-level BLE service restart

...the sensor remains disconnected until user manually reconnects or app is foregrounded.

#### Solution

Implement exponential backoff with 3-5 attempts:

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:126`

```typescript
// Add to SensorsManager class
private reconnectionAttempts: Map<string, number> = new Map();
private readonly MAX_RECONNECTION_ATTEMPTS = 5;
private readonly RECONNECTION_BACKOFF_BASE_MS = 500;

/**
 * Attempt reconnection with exponential backoff
 * @param sensorId - Sensor to reconnect
 * @param attempt - Current attempt number (1-indexed)
 */
private async attemptReconnection(sensorId: string, attempt: number = 1): Promise<void> {
  const sensor = this.connectedSensors.get(sensorId);
  if (!sensor) {
    console.warn(`[SensorsManager] Sensor ${sensorId} not found for reconnection`);
    return;
  }

  // Check if max attempts reached
  if (attempt > this.MAX_RECONNECTION_ATTEMPTS) {
    console.error(
      `[SensorsManager] Max reconnection attempts (${this.MAX_RECONNECTION_ATTEMPTS}) reached for ${sensor.name}`,
    );
    sensor.connectionState = "failed";
    this.reconnectionAttempts.delete(sensorId);
    this.connectionCallbacks.forEach((cb) => cb(sensor));
    return;
  }

  // Update state
  sensor.connectionState = "connecting";
  this.reconnectionAttempts.set(sensorId, attempt);
  this.connectionCallbacks.forEach((cb) => cb(sensor));

  console.log(
    `[SensorsManager] Reconnection attempt ${attempt}/${this.MAX_RECONNECTION_ATTEMPTS} for ${sensor.name}`,
  );

  try {
    const reconnected = await this.connectSensor(sensorId);
    
    if (reconnected) {
      console.log(`[SensorsManager] Successfully reconnected to ${sensor.name}`);
      this.reconnectionAttempts.delete(sensorId);
      return;
    }
    
    throw new Error("Reconnection returned null");
  } catch (error) {
    console.error(
      `[SensorsManager] Reconnection attempt ${attempt} failed for ${sensor.name}:`,
      error,
    );

    // Calculate exponential backoff: 500ms, 1s, 2s, 4s, 8s
    const delayMs = this.RECONNECTION_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
    console.log(`[SensorsManager] Retrying in ${delayMs}ms...`);

    // Schedule next attempt
    setTimeout(() => {
      this.attemptReconnection(sensorId, attempt + 1);
    }, delayMs);
  }
}

/**
 * Check health of all connected sensors
 * (Update existing method to use new reconnection logic)
 */
private async checkSensorHealth() {
  const now = Date.now();
  const sensors = Array.from(this.connectedSensors.values());

  for (const sensor of sensors) {
    if (sensor.connectionState === "connecting" || sensor.connectionState === "failed") {
      continue;
    }

    if (sensor.lastDataTimestamp) {
      const timeSinceLastData = now - sensor.lastDataTimestamp;

      if (
        timeSinceLastData > this.DISCONNECT_TIMEOUT_MS &&
        sensor.connectionState === "connected" &&
        !this.reconnectionAttempts.has(sensor.id) // NEW: Check if reconnection in progress
      ) {
        console.log(
          `[SensorsManager] Sensor ${sensor.name} disconnected (no data for ${timeSinceLastData}ms)`,
        );
        sensor.connectionState = "disconnected";
        this.connectionCallbacks.forEach((cb) => cb(sensor));

        // Start reconnection with exponential backoff
        await this.attemptReconnection(sensor.id, 1);
      }
    }
  }
}

/**
 * Cancel all ongoing reconnection attempts
 * Call this during cleanup or manual disconnection
 */
private cancelReconnectionAttempts(sensorId?: string): void {
  if (sensorId) {
    this.reconnectionAttempts.delete(sensorId);
  } else {
    this.reconnectionAttempts.clear();
  }
}

/**
 * Update disconnectSensor to cancel reconnection attempts
 */
async disconnectSensor(deviceId: string) {
  // Cancel any ongoing reconnection attempts
  this.cancelReconnectionAttempts(deviceId);

  const sensor = this.connectedSensors.get(deviceId);
  if (!sensor) {
    console.log(`[SensorsManager] Sensor ${deviceId} not found for disconnection`);
    return;
  }

  // ... rest of existing implementation
}
```

#### Configuration

Make backoff configurable via constructor options (optional):

```typescript
export interface SensorsManagerOptions {
  maxReconnectionAttempts?: number;
  reconnectionBackoffBaseMs?: number;
  disconnectTimeoutMs?: number;
  healthCheckIntervalMs?: number;
}

constructor(options: SensorsManagerOptions = {}) {
  this.MAX_RECONNECTION_ATTEMPTS = options.maxReconnectionAttempts ?? 5;
  this.RECONNECTION_BACKOFF_BASE_MS = options.reconnectionBackoffBaseMs ?? 500;
  this.DISCONNECT_TIMEOUT_MS = options.disconnectTimeoutMs ?? 30000;
  this.HEALTH_CHECK_INTERVAL_MS = options.healthCheckIntervalMs ?? 10000;
  
  this.initialize();
  this.startConnectionMonitoring();
}
```

#### Testing

```typescript
// Mock setTimeout to test backoff timing
jest.useFakeTimers();

const manager = new SensorsManager();
manager.connectSensor("device-1");

// Simulate disconnect
manager["checkSensorHealth"]();

// Verify attempts with correct delays
expect(connectSensor).toHaveBeenCalledTimes(1); // Initial
jest.advanceTimersByTime(500);
expect(connectSensor).toHaveBeenCalledTimes(2); // Attempt 1
jest.advanceTimersByTime(1000);
expect(connectSensor).toHaveBeenCalledTimes(3); // Attempt 2
jest.advanceTimersByTime(2000);
expect(connectSensor).toHaveBeenCalledTimes(4); // Attempt 3
```

---

### 2.2 Battery Monitoring

**Priority**: 🔧 **MEDIUM**  
**Risk**: Sensor dies mid-recording with no warning  
**Effort**: Medium (20 minutes)  
**Impact**: Medium (User Experience)

#### Problem

Users have no visibility into BLE sensor battery levels. Common scenario:
1. Start 2-hour workout
2. Heart rate monitor dies at 90 minutes
3. No warning, data gap, user frustrated

#### Solution

Monitor Battery Service (BAS - UUID 0x180F) if available:

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:478`

```typescript
/**
 * Monitor known characteristics including battery service
 */
private async monitorKnownCharacteristics(sensor: ConnectedSensor) {
  // Existing code for HR, Power, Cadence, Speed...

  // NEW: Monitor battery service if available
  await this.monitorBatteryService(sensor);
}

/**
 * Monitor Battery Service (BAS - 0x180F)
 * https://www.bluetooth.com/specifications/specs/battery-service-1-0/
 */
private async monitorBatteryService(sensor: ConnectedSensor): Promise<void> {
  const batteryServiceUuid = "0000180f-0000-1000-8000-00805f9b34fb";
  const batteryLevelCharUuid = "00002a19-0000-1000-8000-00805f9b34fb";

  if (!sensor.characteristics.has(batteryLevelCharUuid.toLowerCase())) {
    console.log(`[SensorsManager] ${sensor.name} does not support Battery Service`);
    return;
  }

  console.log(`[SensorsManager] Monitoring battery for ${sensor.name}`);

  try {
    const service = (await sensor.device.services()).find(
      (s) => s.uuid.toLowerCase() === batteryServiceUuid.toLowerCase(),
    );

    if (!service) {
      console.warn(`[SensorsManager] Battery service not found for ${sensor.name}`);
      return;
    }

    const characteristic = (await service.characteristics()).find(
      (c) => c.uuid.toLowerCase() === batteryLevelCharUuid.toLowerCase(),
    );

    if (!characteristic) {
      console.warn(`[SensorsManager] Battery level characteristic not found`);
      return;
    }

    // Read initial battery level
    const initialValue = await characteristic.read();
    if (initialValue?.value) {
      const buffer = Buffer.from(initialValue.value, "base64");
      const batteryLevel = buffer.readUInt8(0);
      console.log(`[SensorsManager] Initial battery level for ${sensor.name}: ${batteryLevel}%`);
      this.handleBatteryUpdate(sensor.id, sensor.name, batteryLevel);
    }

    // Monitor for changes (some devices support notifications)
    characteristic.monitor((error, char) => {
      if (error) {
        console.warn(`[SensorsManager] Battery monitoring error for ${sensor.name}:`, error);
        return;
      }

      if (!char?.value) return;

      const buffer = Buffer.from(char.value, "base64");
      const batteryLevel = buffer.readUInt8(0);

      console.log(`[SensorsManager] Battery level for ${sensor.name}: ${batteryLevel}%`);
      this.handleBatteryUpdate(sensor.id, sensor.name, batteryLevel);
    });
  } catch (error) {
    console.error(`[SensorsManager] Failed to monitor battery for ${sensor.name}:`, error);
  }
}

/**
 * Handle battery level updates
 * @param sensorId - Sensor device ID
 * @param sensorName - Sensor name for display
 * @param level - Battery level (0-100)
 */
private handleBatteryUpdate(sensorId: string, sensorName: string, level: number): void {
  // Store battery level in sensor metadata
  const sensor = this.connectedSensors.get(sensorId);
  if (sensor) {
    sensor.batteryLevel = level;
  }

  // Emit warning if battery is low
  if (level <= 20 && level > 10) {
    console.warn(`[SensorsManager] Low battery warning: ${sensorName} at ${level}%`);
    // Emit event for UI notification
    this.batteryCallbacks.forEach((cb) => 
      cb({ sensorId, sensorName, level, status: "low" })
    );
  } else if (level <= 10) {
    console.error(`[SensorsManager] Critical battery: ${sensorName} at ${level}%`);
    // Emit critical event
    this.batteryCallbacks.forEach((cb) => 
      cb({ sensorId, sensorName, level, status: "critical" })
    );
  }
}

/**
 * Add battery callback system
 */
private batteryCallbacks: Set<(info: BatteryInfo) => void> = new Set();

subscribeBattery(cb: (info: BatteryInfo) => void) {
  this.batteryCallbacks.add(cb);
  return () => this.batteryCallbacks.delete(cb);
}

export interface BatteryInfo {
  sensorId: string;
  sensorName: string;
  level: number;
  status: "normal" | "low" | "critical";
}
```

#### Update ConnectedSensor Interface

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:17`

```typescript
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionState: SensorConnectionState;
  lastDataTimestamp?: number;
  reconnectAttempted?: boolean;

  // FTMS control support
  isControllable?: boolean;
  ftmsController?: FTMSController;
  ftmsFeatures?: FTMSFeatures;
  currentControlMode?: ControlMode;

  // NEW: Battery monitoring
  batteryLevel?: number; // 0-100
}
```

#### UI Integration

Display battery level in sensors screen:

**File**: `apps/mobile/app/(internal)/record/sensors.tsx`

```tsx
{/* Battery indicator */}
{(() => {
  const connectedSensor = connectedSensors.find((s) => s.id === device.id);
  if (connectedSensor?.batteryLevel !== undefined) {
    const level = connectedSensor.batteryLevel;
    const color = level > 20 ? "text-green-600" : level > 10 ? "text-yellow-600" : "text-red-600";
    
    return (
      <View className="flex-row items-center gap-1">
        <Icon as={Battery} size={14} className={color} />
        <Text className={`text-xs ${color}`}>{level}%</Text>
      </View>
    );
  }
  return null;
})()}
```

Show alert for low battery:

**File**: `apps/mobile/app/(internal)/record/index.tsx`

```tsx
useEffect(() => {
  if (!service) return;

  const unsubscribe = service.sensorsManager.subscribeBattery((info) => {
    if (info.status === "low") {
      Alert.alert(
        "Low Battery",
        `${info.sensorName} battery is at ${info.level}%. Consider replacing the battery soon.`,
        [{ text: "OK" }],
      );
    } else if (info.status === "critical") {
      Alert.alert(
        "Critical Battery",
        `${info.sensorName} battery is critically low (${info.level}%). The sensor may disconnect soon.`,
        [{ text: "OK" }],
      );
    }
  });

  return unsubscribe;
}, [service]);
```

#### Testing

```typescript
// Mock BLE characteristic for battery
const mockBatteryChar = {
  read: jest.fn().mockResolvedValue({
    value: Buffer.from([85]).toString("base64"), // 85%
  }),
  monitor: jest.fn(),
};

const manager = new SensorsManager();
const sensor = await manager.connectSensor("device-1");

// Verify battery monitoring started
expect(mockBatteryChar.monitor).toHaveBeenCalled();

// Simulate battery update
const monitorCallback = mockBatteryChar.monitor.mock.calls[0][0];
monitorCallback(null, {
  value: Buffer.from([15]).toString("base64"), // 15% - should trigger warning
});

expect(batteryCallback).toHaveBeenCalledWith({
  sensorId: "device-1",
  sensorName: expect.any(String),
  level: 15,
  status: "low",
});
```

---

### 2.3 Visual Disconnect Feedback

**Priority**: 🔧 **MEDIUM**  
**Risk**: User unaware of sensor disconnect during recording  
**Effort**: Low (15 minutes)  
**Impact**: Medium (User Experience)

#### Problem

When a sensor disconnects during recording, metrics simply freeze. User may not notice until reviewing the recording later. GradientPeak needs clearer visual feedback similar to Auuki's approach (metrics → 0, device name → '--').

#### Solution

**Option A: Reset metrics to 0 on disconnect** (Auuki's approach)

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:330`

```typescript
// Enhanced disconnect handler with visual feedback
device.onDisconnected((error) => {
  console.log("Disconnected:", device.name, error?.message || "");
  connectedSensor.connectionState = "disconnected";
  connectedSensor.lastDataTimestamp = undefined;
  
  // NEW: Reset metrics to 0 to provide clear visual feedback
  this.dataCallbacks.forEach((cb) => {
    // Send zero readings for all metrics this sensor was providing
    const metrics = this.getMetricsForSensor(connectedSensor);
    metrics.forEach((metric) => {
      cb({
        metric,
        dataType: "float",
        value: 0,
        timestamp: Date.now(),
        metadata: { 
          deviceId: connectedSensor.id,
          disconnected: true, // Flag for UI handling
        },
      });
    });
  });
  
  this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
});

/**
 * Get metrics that a sensor provides based on its services
 */
private getMetricsForSensor(sensor: ConnectedSensor): string[] {
  const metrics: string[] = [];
  
  for (const [charUuid] of sensor.characteristics) {
    const metricType = KnownCharacteristics[charUuid.toLowerCase()];
    if (metricType) {
      metrics.push(metricType);
    }
  }
  
  return metrics;
}
```

**Option B: Add disconnected badge to recording screen** (Less disruptive)

**File**: `apps/mobile/app/(internal)/record/index.tsx`

```tsx
{/* Sensor Disconnect Warning */}
{(() => {
  const disconnectedSensors = service?.sensorsManager
    .getConnectedSensors()
    .filter((s) => s.connectionState === "disconnected");

  if (!disconnectedSensors || disconnectedSensors.length === 0) return null;

  return (
    <View className="bg-yellow-500/20 px-4 py-2 border-b border-yellow-500/40">
      <View className="flex-row items-center gap-2">
        <Icon as={AlertTriangle} size={16} className="text-yellow-600" />
        <Text className="text-xs text-yellow-600 font-medium">
          {disconnectedSensors.length} sensor(s) disconnected - attempting reconnection
        </Text>
      </View>
      <Text className="text-xs text-yellow-600 mt-1">
        {disconnectedSensors.map((s) => s.name).join(", ")}
      </Text>
    </View>
  );
})()}
```

**Recommendation**: Implement **Option B** (less disruptive, preserves last known values).

---

## 3. Low Priority Improvements (Optional)

### 3.1 Pre-Recording Validation

**Priority**: 🔧 **LOW**  
**Risk**: User starts recording without sensors connected  
**Effort**: Low (10 minutes)  
**Impact**: Low (User Experience)

#### Problem

Users can start a recording without any sensors connected, resulting in empty data files.

#### Solution

Add optional sensor check with user confirmation:

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:344`

```typescript
async startRecording() {
  console.log("[Service] Starting recording");

  // Concurrent recording prevention (already added)
  if (this.state === "recording") {
    throw new Error("Cannot start recording: A recording is already in progress");
  }

  // Check all necessary permissions
  const allGranted = await areAllPermissionsGranted();
  if (!allGranted) {
    throw new Error(
      "All permissions (Bluetooth, Location, and Background Location) are required to start recording",
    );
  }

  // NEW: Optional sensor check
  const connectedSensors = this.sensorsManager.getConnectedSensors();
  const hasActiveSensors = connectedSensors.some(
    (s) => s.connectionState === "connected",
  );

  if (!hasActiveSensors) {
    console.warn("[Service] Starting recording without any connected sensors");
    
    // Option 1: Throw error (strict validation)
    // throw new Error("No sensors connected. Please connect at least one sensor before recording.");
    
    // Option 2: Just log warning (permissive - allows manual/GPS-only activities)
    // This is recommended for flexibility
  }

  // ... rest of implementation
}
```

**Recommendation**: **Log warning only** (permissive approach). Some activities are GPS-only or manual entry.

---

## 4. Implementation Sequence

### Phase 1: Critical Fixes (Day 1)

**Time**: 30 minutes

1. ✅ **Concurrent Recording Prevention** (5 min)
   - Add state check in `startRecording()`
   - Add UI button disable logic
   - Test: Attempt double start

2. ✅ **Metric Bounds Enforcement** (10 min)
   - Call `validateSensorReading()` in `parseBleData()`
   - Add logging for rejected readings
   - Test: Inject invalid readings

3. ✅ **Visual Disconnect Feedback** (15 min)
   - Add disconnect warning banner to recording screen
   - Test: Manually disconnect sensor during recording

**Deliverable**: Core data integrity issues resolved.

---

### Phase 2: Enhanced Reconnection (Day 2)

**Time**: 1-2 hours

1. ✅ **Exponential Backoff Implementation** (45 min)
   - Add `attemptReconnection()` with backoff
   - Update `checkSensorHealth()` to use new logic
   - Add `cancelReconnectionAttempts()` to cleanup

2. ✅ **Configuration Options** (15 min)
   - Add `SensorsManagerOptions` interface
   - Make backoff configurable

3. ✅ **Testing** (30 min)
   - Unit tests for backoff timing
   - Integration tests with mock BLE devices
   - Manual testing with real sensors

**Deliverable**: Robust reconnection strategy with configurable retry logic.

---

### Phase 3: Battery Monitoring (Day 3)

**Time**: 1-2 hours

1. ✅ **Battery Service Integration** (30 min)
   - Add `monitorBatteryService()` method
   - Update `ConnectedSensor` interface
   - Add battery callbacks

2. ✅ **UI Integration** (30 min)
   - Display battery level in sensors screen
   - Add low battery alerts
   - Add battery icon with color coding

3. ✅ **Testing** (30 min)
   - Mock battery service responses
   - Test low/critical battery thresholds
   - Manual testing with real sensors

**Deliverable**: Battery monitoring with visual feedback and alerts.

---

## 5. Testing Strategy

### 5.1 Unit Tests

**File**: `apps/mobile/lib/services/ActivityRecorder/__tests__/sensors.test.ts`

```typescript
describe("SensorsManager - Fault Tolerance", () => {
  describe("Concurrent Recording Prevention", () => {
    it("should throw error when starting recording twice", async () => {
      const service = new ActivityRecorderService(mockProfile);
      await service.startRecording();
      
      await expect(service.startRecording()).rejects.toThrow("already in progress");
    });

    it("should throw error when starting while paused", async () => {
      const service = new ActivityRecorderService(mockProfile);
      await service.startRecording();
      await service.pauseRecording();
      
      await expect(service.startRecording()).rejects.toThrow("resume the paused");
    });
  });

  describe("Metric Bounds Validation", () => {
    it("should accept valid heart rate", () => {
      const manager = new SensorsManager();
      const reading = { metric: "heartrate", value: 150, timestamp: Date.now() };
      
      expect(manager.validateSensorReading(reading)).not.toBeNull();
    });

    it("should reject invalid heart rate", () => {
      const manager = new SensorsManager();
      const reading = { metric: "heartrate", value: 500, timestamp: Date.now() };
      
      expect(manager.validateSensorReading(reading)).toBeNull();
    });

    it("should reject out-of-bounds power", () => {
      const manager = new SensorsManager();
      const reading = { metric: "power", value: 5000, timestamp: Date.now() };
      
      expect(manager.validateSensorReading(reading)).toBeNull();
    });
  });

  describe("Exponential Backoff Reconnection", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should attempt reconnection with exponential backoff", async () => {
      const manager = new SensorsManager();
      const connectSpy = jest.spyOn(manager, "connectSensor");
      
      // Simulate disconnect
      manager["attemptReconnection"]("device-1", 1);
      
      expect(connectSpy).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(500);
      expect(connectSpy).toHaveBeenCalledTimes(2);
      
      jest.advanceTimersByTime(1000);
      expect(connectSpy).toHaveBeenCalledTimes(3);
    });

    it("should stop after max attempts", async () => {
      const manager = new SensorsManager({ maxReconnectionAttempts: 3 });
      const connectSpy = jest.spyOn(manager, "connectSensor").mockResolvedValue(null);
      
      manager["attemptReconnection"]("device-1", 1);
      
      jest.advanceTimersByTime(10000); // Advance past all retries
      
      expect(connectSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("Battery Monitoring", () => {
    it("should read initial battery level", async () => {
      const mockChar = {
        read: jest.fn().mockResolvedValue({
          value: Buffer.from([85]).toString("base64"),
        }),
        monitor: jest.fn(),
      };
      
      const manager = new SensorsManager();
      await manager["monitorBatteryService"](mockSensor);
      
      expect(mockChar.read).toHaveBeenCalled();
      expect(mockSensor.batteryLevel).toBe(85);
    });

    it("should emit low battery warning", () => {
      const manager = new SensorsManager();
      const callback = jest.fn();
      manager.subscribeBattery(callback);
      
      manager["handleBatteryUpdate"]("device-1", "HRM", 15);
      
      expect(callback).toHaveBeenCalledWith({
        sensorId: "device-1",
        sensorName: "HRM",
        level: 15,
        status: "low",
      });
    });
  });
});
```

### 5.2 Integration Tests

**File**: `apps/mobile/lib/services/ActivityRecorder/__tests__/integration.test.ts`

```typescript
describe("ActivityRecorderService - Integration", () => {
  it("should handle sensor disconnect during recording", async () => {
    const service = new ActivityRecorderService(mockProfile);
    await service.startRecording();
    
    // Connect sensor
    const sensor = await service.sensorsManager.connectSensor("mock-device");
    expect(sensor).not.toBeNull();
    
    // Simulate disconnect
    mockBleDevice.simulateDisconnect();
    
    // Wait for reconnection attempts
    await jest.advanceTimersByTimeAsync(5000);
    
    // Verify reconnection attempted
    expect(service.sensorsManager.getConnectedSensors()[0].connectionState).toBe("connecting");
  });

  it("should complete recording with disconnected sensor", async () => {
    const service = new ActivityRecorderService(mockProfile);
    await service.startRecording();
    
    // Connect sensor
    await service.sensorsManager.connectSensor("mock-device");
    
    // Simulate disconnect
    mockBleDevice.simulateDisconnect();
    
    // Finish recording
    await service.finishRecording();
    
    // Verify recording metadata exists
    expect(service.getRecordingMetadata()).not.toBeNull();
  });
});
```

### 5.3 Manual Testing Checklist

**Critical Fixes**:
- [ ] Start recording twice - should throw error
- [ ] Inject invalid HR reading (e.g., 500 bpm) - should be rejected
- [ ] Disconnect sensor during recording - should show warning banner

**Enhanced Reconnection**:
- [ ] Disconnect sensor briefly (< 5s) - should reconnect automatically
- [ ] Disconnect sensor for 30s - should see multiple reconnection attempts
- [ ] Disconnect sensor permanently - should show "failed" after 5 attempts

**Battery Monitoring**:
- [ ] Connect sensor with battery service - should display battery %
- [ ] Simulate low battery (< 20%) - should show warning
- [ ] Simulate critical battery (< 10%) - should show critical alert

---

## 6. Risk Assessment

### Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Exponential backoff delays reconnection** | Low | Medium | Make backoff configurable, use conservative base (500ms) |
| **Battery monitoring increases BLE overhead** | Low | Low | Read battery only on connect + monitor changes (not polling) |
| **False disconnect warnings (transient errors)** | Medium | Low | Use 30s timeout before marking disconnected |
| **Validation rejects valid edge cases** | Low | Medium | Log all rejections, review in production data |
| **State machine complexity increases** | Low | Low | Minimal changes to existing state machine |

### Deployment Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Breaking changes to existing recordings** | Low | High | All changes backward compatible |
| **User confusion from new disconnect warnings** | Low | Low | Clear messaging, dismissable alerts |
| **Increased battery drain from reconnection** | Low | Medium | Limit to 5 attempts, exponential backoff reduces frequency |

---

## 7. Success Metrics

### Phase 1 (Critical Fixes)

- ✅ Zero duplicate recording incidents in production
- ✅ Zero invalid metric values in uploaded activities
- ✅ User awareness of sensor disconnects increased (qualitative feedback)

### Phase 2 (Enhanced Reconnection)

- ✅ Sensor reconnection success rate > 80% (target: 90%)
- ✅ Average reconnection time < 5 seconds
- ✅ Failed reconnection alerts reduced by 50%

### Phase 3 (Battery Monitoring)

- ✅ 100% of sensors with BAS display battery level
- ✅ Low battery warnings received before sensor dies (> 90% of cases)
- ✅ User reports of "unexpected sensor disconnects" reduced by 30%

---

## Conclusion

This plan provides **actionable, high-impact improvements** to GradientPeak's fault tolerance without requiring architectural rewrites. The 3-phase approach allows for incremental delivery and testing:

1. **Phase 1** (30 min): Fix critical data integrity issues
2. **Phase 2** (1-2 hours): Enhance reconnection reliability
3. **Phase 3** (1-2 hours): Improve user experience with battery monitoring

**Total Effort**: 3-4 hours  
**Total Impact**: High (data integrity + user experience)

All improvements leverage GradientPeak's existing strengths (file-based storage, React Native ecosystem) while addressing gaps identified in the Auuki comparison.

---

## Appendix: Files to Modify

### Critical Fixes (Phase 1)

1. `apps/mobile/lib/services/ActivityRecorder/index.ts`
   - Add concurrent recording prevention in `startRecording()`

2. `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
   - Call `validateSensorReading()` in `parseBleData()`

3. `apps/mobile/app/(internal)/record/index.tsx`
   - Add disconnect warning banner

### Enhanced Reconnection (Phase 2)

1. `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
   - Add `attemptReconnection()` with exponential backoff
   - Update `checkSensorHealth()` to use new logic
   - Add `cancelReconnectionAttempts()`
   - Add configuration options

### Battery Monitoring (Phase 3)

1. `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
   - Add `monitorBatteryService()` method
   - Update `ConnectedSensor` interface
   - Add battery callbacks

2. `apps/mobile/app/(internal)/record/sensors.tsx`
   - Display battery level with icon

3. `apps/mobile/app/(internal)/record/index.tsx`
   - Add low battery alerts

### Testing

1. `apps/mobile/lib/services/ActivityRecorder/__tests__/sensors.test.ts` (new)
2. `apps/mobile/lib/services/ActivityRecorder/__tests__/integration.test.ts` (new)

---

**End of Document**
