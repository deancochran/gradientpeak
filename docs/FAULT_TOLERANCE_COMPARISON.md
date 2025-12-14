# Fault Tolerance, Validation, and Recording Process Comparison

**Objective**: Document the fault tolerance, validation, and recording processes implemented in Auuki that GradientPeak doesn't have, to identify gaps and improvement opportunities.

**Date**: 2025-12-12  
**Author**: System Analysis

---

## Executive Summary

This document compares the fault tolerance, validation, and recording processes between **Auuki** (reference implementation) and **GradientPeak** (current implementation). The analysis focuses on edge cases like sensor disconnection during recording, mid-recording sensor connection, validation processes, and error handling.

### Key Findings

1. **GradientPeak has robust basic fault tolerance** - single reconnection attempts, health monitoring
2. **Auuki uses more aggressive reconnection** - automatic, repeated attempts with `watchAdvertisements` API
3. **GradientPeak has superior data persistence** - file-based StreamBuffer with compression vs. Auuki's in-memory arrays
4. **Both systems handle gaps honestly** - no interpolation, preserving data integrity
5. **GradientPeak has more comprehensive validation** - submission-time metric calculations and error handling

### Critical Gaps in GradientPeak

| Gap | Severity | Impact |
|-----|----------|--------|
| No watchAdvertisements API usage | Medium | Slower reconnection on iOS/Android |
| No event-driven state bus | Low | More tightly coupled architecture |
| No concurrent recording prevention | **HIGH** | Risk of data corruption |
| No recording validation checks | Medium | May save incomplete recordings |
| Missing metric bounds validation during parsing | Medium | Invalid data can enter system |
| No compression failure handling | Low | Already implemented in useActivitySubmission |

---

## Table of Contents

1. [Sensor Disconnection During Recording](#1-sensor-disconnection-during-recording)
2. [Sensor Connection Mid-Recording](#2-sensor-connection-mid-recording)
3. [Recording Validation](#3-recording-validation)
4. [Error Handling Edge Cases](#4-error-handling-edge-cases)
5. [Data Integrity](#5-data-integrity)
6. [Gap Analysis Summary](#6-gap-analysis-summary)
7. [Recommendations](#7-recommendations)

---

## 1. Sensor Disconnection During Recording

### 1.1 Auuki Implementation

**File**: `apps/Auuki/src/ble/connectable.js:428-443`

```javascript
function _onDisconnect() {
    _status = Status.disconnected;
    onDisconnect();
    if(_autoReconnect) onDropout();
}

async function onDropout() {
    print.warn(`ble: dropout: ${_device.name}`);

    if(watchAdvertisementsSupported()) {
        connect({watching: true, requesting: false});
    } else {
        print.log(`:connectable 'watchAdvertisements not supported falling back to device.connect ${_device.name}'`);
        connect({watching: false, requesting: false});
    }
}
```

**Key Features**:
- **Automatic reconnection** via `gattserverdisconnected` event
- Uses `watchAdvertisements` Web Bluetooth API to detect device reappearance
- Fallback to regular connection if API unavailable
- `_autoReconnect` flag controls behavior (default: true)

**User Notifications**:

**File**: `apps/Auuki/src/ble/reactive-connectable.js:43-68`

```javascript
function onDisconnect() {
    xf.dispatch(`${getIdentifier()}:disconnected`);
    xf.dispatch(`${getIdentifier()}:name`, '--');

    if(models.sources.isSource('power', getIdentifier())) {
        xf.dispatch(`power`, 0);
    }
    // ... resets all metrics to 0
}
```

**Notification Strategy**:
- Event-driven dispatch via `xf` (reactive event framework)
- Device name set to `'--'` to indicate disconnection
- All sensor metrics reset to **0 immediately**
- UI components listen to `${identifier}:disconnected` event

**Data Gap Handling**:

**File**: `apps/Auuki/src/models/models.js:1050-1100`

```javascript
function elapsed(x, db) {
    if(equals(db.watchStatus, TimerStatus.stopped)) {
        db.elapsed = x;
        return;
    };

    db.elapsed = x;

    const record = {
        timestamp:  Date.now(),
        power:      db.power1s,
        cadence:    db.cadence,
        speed:      speed,
        heart_rate: db.heartRate,
        // ... other metrics
    };

    db.records.push(record);
    
    // Backup every 60 seconds
    if(equals(db.elapsed % 60, 0)) {
        backup(db);
    }
}
```

**Gap Strategy**:
- Records captured only when `watchStatus === 'started'`
- During disconnection, data flow stops; **gaps are implicit in timestamp sequence**
- **No interpolation or gap-filling** - data integrity prioritized
- Records backed up every 60 seconds to IndexedDB

**Recording State Management**:

**File**: `apps/Auuki/src/watch.js:94-96, 280-304`

- States: `'stopped'`, `'started'`, `'paused'`
- Disconnect **does NOT auto-stop recording**
- Recording continues, capturing zeros or gaps
- Event markers logged with precise timestamps

---

### 1.2 GradientPeak Implementation

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:79-124`

```typescript
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
        !sensor.reconnectAttempted
      ) {
        console.log(`Sensor ${sensor.name} disconnected (no data for ${timeSinceLastData}ms)`);
        sensor.connectionState = "disconnected";
        this.connectionCallbacks.forEach((cb) => cb(sensor));

        await this.attemptReconnection(sensor.id);
      }
    }
  }
}

private async attemptReconnection(sensorId: string) {
  const sensor = this.connectedSensors.get(sensorId);
  if (!sensor) return;

  sensor.reconnectAttempted = true;
  sensor.connectionState = "connecting";
  this.connectionCallbacks.forEach((cb) => cb(sensor));

  console.log(`Attempting reconnection for ${sensor.name}...`);

  try {
    const reconnected = await this.connectSensor(sensorId);
    if (reconnected) {
      console.log(`Successfully reconnected to ${sensor.name}`);
      sensor.reconnectAttempted = false;
    } else {
      throw new Error("Reconnection returned null");
    }
  } catch (error) {
    console.error(`Reconnection failed for ${sensor.name}:`, error);
    sensor.connectionState = "failed";
    this.connectionCallbacks.forEach((cb) => cb(sensor));
  }
}
```

**Key Features**:
- **Health monitoring** via timer (every 10 seconds)
- Detects disconnection via data timeout (30 seconds)
- **Single reconnection attempt** per disconnection
- `reconnectAttempted` flag prevents retry loops
- Manual reconnection via `reconnectAll()` when app returns to foreground

**User Notifications**:
- Connection state callbacks notify UI components
- Connection state: `"disconnected"` → `"connecting"` → `"connected"` or `"failed"`
- No automatic metric reset to 0 (metrics simply stop updating)

**Data Gap Handling**:

**File**: `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` (implicit)

```typescript
// Data ingestion from sensors
ingestSensorData(reading: SensorReading) {
  if (this.recordingState !== "recording") return;
  
  // Data written to StreamBuffer with timestamps
  // Gaps naturally appear in timestamp sequences
}
```

**Gap Strategy**:
- StreamBuffer writes data to files with timestamps
- Gaps implicit in timestamp sequence (same as Auuki)
- **No interpolation**
- File-based persistence (more resilient than in-memory)

**Recording State Management**:

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:374-392`

- States: `"pending"`, `"ready"`, `"recording"`, `"paused"`, `"finished"`
- Disconnect **does NOT auto-stop recording**
- Recording continues with gaps

---

### 1.3 Comparison

| Feature | Auuki | GradientPeak | Winner |
|---------|-------|--------------|--------|
| **Reconnection Strategy** | Automatic, repeated, uses watchAdvertisements | Single attempt, health monitoring | **Auuki** (more aggressive) |
| **User Notification** | Event-driven, metrics reset to 0 | Callback-based, metrics freeze | **Auuki** (clearer UX) |
| **Data Gap Handling** | Implicit via timestamps | Implicit via timestamps | **Tie** |
| **Data Persistence** | In-memory + IndexedDB backup (60s) | File-based StreamBuffer (real-time) | **GradientPeak** (more resilient) |
| **Recording State** | Continues during disconnect | Continues during disconnect | **Tie** |

---

## 2. Sensor Connection Mid-Recording

### 2.1 Auuki Implementation

**File**: `apps/Auuki/src/ble/connectable.js:314-345`

```javascript
async function connect(args = {}) {
    if(equals(getStatus(), Status.connecting) ||
       equals(getStatus(), Status.connected)) return;

    const requesting = args.requesting ?? false;
    const watching = args.watching ?? false;

    _device.addEventListener('gattserverdisconnected', _onDisconnect, signal);
    
    let resSetup = await setup();
    onConnected();
}
```

**Hot-Plug Support**:
- Services initialized via `defaultSetup()` which probes available GATT services
- Device type determined dynamically based on discovered services
- Multi-service support: Battery (BAS), Heart Rate (HRS), Power (CPS), Speed/Cadence (CSCS), etc.
- New device can connect while recording active **without state corruption**

**Data Stream Integration**:

**File**: `apps/Auuki/src/ble/service.js:180-210`

```javascript
async function start() {
    for(const key in spec) {
        characteristics[key] = Characteristic({
            characteristic: _characteristics[spec[key].uuid]
        });

        if(exists(spec[key].notify)) {
            await characteristics[key].startNotificationsWithRetry(
                compose2(
                    spec[key].notify?.callback ?? defaultCallback,
                    spec[key].notify?.parser?.decode ?? defaultParser,
                ),
            );
        }
    }

    _started = true;
    return true;
}
```

**Integration Strategy**:
- Notifications restarted with retry logic (10 attempts, 250ms intervals)
- Data callbacks composed with decoders
- **Parallel service support**: Multiple sensors can feed data simultaneously
- New data streams trigger `onData` callbacks immediately

**State Synchronization**:

**File**: `apps/Auuki/src/ble/reactive-connectable.js:70-90`

```javascript
function onData(data) {
    if('power' in data && models.sources.isSource('power', identifier)) {
        xf.dispatch(`power`, data.power);
    }
    // ... other metrics
}
```

**Synchronization Approach**:
- Central event dispatch (`xf`) acts as state bus
- Only dispatches data if identifier matches configured source
- **Source configuration stored per metric** - allows switching between devices
- Newly connected sensors immediately available if source not already assigned

---

### 2.2 GradientPeak Implementation

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:242-355`

```typescript
async connectSensor(deviceId: string): Promise<ConnectedSensor | null> {
  try {
    let sensor = this.connectedSensors.get(deviceId);
    if (sensor) {
      sensor.connectionState = "connecting";
    } else {
      sensor = {
        id: deviceId,
        name: "Unknown",
        connectionState: "connecting",
      } as ConnectedSensor;
      this.connectedSensors.set(deviceId, sensor);
    }
    this.connectionCallbacks.forEach((cb) => cb(sensor!));

    const device = await this.bleManager.connectToDevice(deviceId, { timeout: 10000 });
    const discovered = await device.discoverAllServicesAndCharacteristics();
    const services = await discovered.services();

    const characteristics = new Map<string, string>();
    for (const service of services) {
      const chars = await service.characteristics();
      chars.forEach((c) => characteristics.set(c.uuid.toLowerCase(), service.uuid));
    }

    const connectedSensor: ConnectedSensor = {
      id: device.id,
      name: device.name || "Unknown Device",
      services: services.map((s) => s.uuid),
      device: discovered,
      connectionState: "connected",
      characteristics,
    };

    this.connectedSensors.set(device.id, connectedSensor);
    await this.monitorKnownCharacteristics(connectedSensor);

    // Check if device supports FTMS control
    const hasFTMS = services.some((s) => s.uuid.toLowerCase().includes("1826"));
    if (hasFTMS) {
      console.log(`[SensorsManager] Detected FTMS trainer: ${connectedSensor.name}`);
      await this.setupFTMSControl(connectedSensor);
    }

    device.onDisconnected((error) => {
      console.log("Disconnected:", device.name, error?.message || "");
      connectedSensor.connectionState = "disconnected";
      connectedSensor.lastDataTimestamp = undefined;
      this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
    });

    console.log(`Connected to ${connectedSensor.name} with ${services.length} services`);
    this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
    return connectedSensor;
  } catch (err) {
    console.error("Connect error", err);
    const existingSensor = this.connectedSensors.get(deviceId);
    if (existingSensor) {
      existingSensor.connectionState = "failed";
      this.connectionCallbacks.forEach((cb) => cb(existingSensor));
    }
    return null;
  }
}
```

**Hot-Plug Support**:
- Can connect new sensors at any time
- Dynamic service discovery
- FTMS detection and setup during connection
- No state corruption risk

**Data Stream Integration**:

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:478-518`

```typescript
private async monitorKnownCharacteristics(sensor: ConnectedSensor) {
  for (const [charUuid, serviceUuid] of sensor.characteristics) {
    const metricType = KnownCharacteristics[charUuid.toLowerCase()];
    if (!metricType) continue;

    const service = (await sensor.device.services()).find((s) => s.uuid === serviceUuid);
    if (!service) continue;

    const characteristic = (await service.characteristics()).find((c) => c.uuid === charUuid);
    if (!characteristic) continue;

    let retries = 0;
    const maxRetries = 2;

    const monitorCallback = (error: BleError | null, char: Characteristic | null) => {
      if (error) {
        console.warn(`Error monitoring ${metricType}:`, error);
        if (retries < maxRetries) {
          retries++;
          console.log(`Retrying monitor for ${metricType} (${retries}/${maxRetries})`);
          characteristic.monitor(monitorCallback);
        }
        return;
      }

      if (!char?.value) return;

      const reading = this.parseBleData(
        metricType,
        Buffer.from(char.value, "base64").buffer,
        sensor.id,
      );
      if (reading) {
        this.updateSensorDataTimestamp(sensor.id);
        this.dataCallbacks.forEach((cb) => cb(reading));
      }
    };

    characteristic.monitor(monitorCallback);
  }
}
```

**Integration Strategy**:
- Retry logic (2 attempts)
- Data callbacks invoked immediately
- Parallel sensor support
- Timestamp update triggers health monitoring

**State Synchronization**:

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:437-445`

```typescript
private handleSensorData(reading: SensorReading) {
  if (this.state !== "recording") return;

  // Send to LiveMetricsManager for processing
  this.liveMetricsManager.ingestSensorData(reading);

  // Update notification with key metrics
  // ...
}
```

**Synchronization Approach**:
- Direct method calls (tighter coupling)
- Recording state check before ingestion
- LiveMetricsManager handles all processing

---

### 2.3 Comparison

| Feature | Auuki | GradientPeak | Winner |
|---------|-------|--------------|--------|
| **Hot-Plug Support** | Yes, dynamic service discovery | Yes, dynamic service discovery | **Tie** |
| **Data Integration** | Event-driven (`xf` bus) | Direct callbacks | **Auuki** (more decoupled) |
| **Retry Logic** | 10 attempts × 250ms | 2 attempts | **Auuki** (more resilient) |
| **Source Management** | Per-metric source configuration | All sensors contribute | **Auuki** (more flexible) |
| **State Corruption Risk** | None | None | **Tie** |

---

## 3. Recording Validation

### 3.1 Auuki Implementation

**Pre-Recording Checks**:

**File**: `apps/Auuki/src/watch.js:141-165`

```javascript
startWorkout() {
    if(self.isWorkoutStarted() || (
        self.isWorkoutDone() && self.intervalIndex > 0
    )) {
        return;  // Prevents duplicate starts
    }

    let intervalTime = 0;
    let stepTime     = 0;

    if(exists(self.intervals)) {
        intervalTime = self.intervals[0]?.duration ?? 0;
        stepTime     = self.intervals[0]?.steps[0].duration ?? 0;

        xf.dispatch('watch:intervalIndex',  0);
        xf.dispatch('watch:stepIndex', 0);
    }

    if(!self.isStarted()) {
        self.start();
    }
}
```

**Pre-Recording Validation**:
- ✅ Checks if workout already started (prevents duplicate starts)
- ✅ Validates interval structure exists
- ✅ Confirms timer not already running
- ❌ **NO explicit sensor presence check**

**During-Recording Validations**:

**File**: `apps/Auuki/src/ble/characteristic.js:45-80`

```javascript
async function startNotificationsWithRetry(handler, attempts = 10, txRate = 250) {
    const success = await startNotifications(handler);
    if(success) {
        return true;
    } else {
        if(attempts > 0) {
            await wait(txRate);
            return await startNotificationsWithRetry(handler, attempts-1);
        } else {
            print.log(`tx: startNotificationsWithRetry: fail: 'give up'`);
            return false;
        }
    }
}
```

**During-Recording Validations**:
- ✅ Notifications validated with automatic retry (10 attempts)
- ❌ Failed notifications logged but **don't halt recording**

**Metric Bounds Validation**:

**File**: `apps/Auuki/src/models/models.js:65-95`

```javascript
class Power extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 2500);
    }
    defaultIsValid(value) {
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

class HeartRate extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 255);
    }
    defaultIsValid(value) {
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}
```

**Bounds**:
- Power: 0-2500W
- Heart Rate: 0-255 bpm
- Cadence: 0-255 rpm

**Post-Recording Data Integrity**:

**File**: `apps/Auuki/src/fit/local-activity.js:55-100`

```javascript
function findFirstRecord(records = []) {
    for(let i = 0; i < records.length; i+=1) {
        if(records[i].timestamp !== undefined) {
            return records[i];
        }
    }
    console.error(`:fit :records 'has no valid records'`);
    return records[0];
}

function calcTotalTimerTime(args) {
    const records = args.records ?? [];
    const events = args.events ?? [];

    if(empty(events)) {
        if(records.length > 1) {
            return type.timestamp.elapsed(
                findFirstRecord(records)?.timestamp,
                findLastRecord(records)?.timestamp
            );
        } else {
            console.warn(`fit: calcTotalTimerTime: 'not enough records'`);
            return 0;
        }
    }

    return events.reduce(function(acc, event, i) {
        if(event.type === EventType.stop) {
            const startEvent = events[i-1] ?? undefined;
            if(startEvent?.type === EventType.start) {
                acc += type.timestamp.elapsed(
                    startEvent?.timestamp, event?.timestamp,
                );
            } else {
                console.warn(`fit: calcTotalTimerTime: 'invalid event order'`);
            }
            return acc;
        }
        return acc;
    }, 0);
}
```

**Integrity Checks**:
- ✅ Searches for first/last records with valid timestamps
- ✅ Validates event pairs (start must precede stop)
- ✅ Logs warnings for invalid event sequences
- ✅ Falls back to record timestamps if events unavailable
- ✅ Rejects recordings with insufficient data (`records.length < 2`)

---

### 3.2 GradientPeak Implementation

**Pre-Recording Checks**:

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:344-392`

```typescript
async startRecording() {
  console.log("[Service] Starting recording");

  // Check all necessary permissions
  const allGranted = await areAllPermissionsGranted();
  if (!allGranted) {
    console.error("[Service] Cannot start recording - missing permissions");
    throw new Error(
      "All permissions (Bluetooth, Location, and Background Location) are required to start recording",
    );
  }

  // Create recording metadata (in-memory)
  this.recordingMetadata = {
    startedAt: new Date().toISOString(),
    activityType: this.selectedActivityType,
    profileId: this.profile.id,
    profile: this.profile,
    plannedActivityId: this._plannedActivityId,
    activityPlan: this._plan,
  };

  this.state = "recording";

  // Start LiveMetricsManager (initializes StreamBuffer)
  await this.liveMetricsManager.startRecording();

  // Initialize timing
  this.startTime = Date.now();
  this.pausedTime = 0;
  this.lastPauseTime = undefined;
  this._stepStartMovingTime = 0;
  this.startElapsedTimeUpdates();

  // Start location tracking
  await this.locationManager.startForegroundTracking();
  await this.locationManager.startBackgroundTracking();

  // Start foreground service notification
  const activityName = this._plan?.name || this.selectedActivityType.replace(/_/g, " ");
  this.notificationsManager = new NotificationsManager(activityName);
  await this.notificationsManager.startForegroundService();

  // Emit initial sensor state
  this.emit("sensorsChanged", this.sensorsManager.getConnectedSensors());
  this.emit("stateChanged", this.state);
  console.log("[Service] Recording started successfully");
}
```

**Pre-Recording Validation**:
- ✅ **Checks all permissions (Bluetooth, Location, Background Location)**
- ✅ Throws error if permissions not granted
- ❌ **NO check if recording already started** (risk of duplicate starts)
- ❌ **NO sensor presence validation** (records empty data if no sensors)

**During-Recording Validations**:

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:478-518`

```typescript
const monitorCallback = (error: BleError | null, char: Characteristic | null) => {
  if (error) {
    console.warn(`Error monitoring ${metricType}:`, error);
    if (retries < maxRetries) {
      retries++;
      console.log(`Retrying monitor for ${metricType} (${retries}/${maxRetries})`);
      characteristic.monitor(monitorCallback);
    }
    return;
  }

  if (!char?.value) return;

  const reading = this.parseBleData(
    metricType,
    Buffer.from(char.value, "base64").buffer,
    sensor.id,
  );
  if (reading) {
    this.updateSensorDataTimestamp(sensor.id);
    this.dataCallbacks.forEach((cb) => cb(reading));
  }
};
```

**During-Recording Validations**:
- ✅ Retry logic (2 attempts)
- ❌ Failed monitoring doesn't halt recording

**Metric Bounds Validation**:

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:637-662`

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

**Bounds**:
- Power: 0-4000W (wider than Auuki)
- Heart Rate: 30-250 bpm (rejects resting HR below 30)
- Cadence: 0-300 rpm (wider than Auuki)
- Speed: 0-100 m/s

❌ **Validation exists but is NOT called during parsing** - this is a critical gap!

**Post-Recording Data Integrity**:

**File**: `apps/mobile/lib/hooks/useActivitySubmission.ts:100-230`

```typescript
function calculateActivityMetrics(
  metadata: RecordingMetadata,
  aggregatedStreams: Map<string, AggregatedStream>,
): { ... } {
  if (!metadata.startedAt || !metadata.endedAt) {
    throw new Error(
      `Invalid recording: startedAt=${metadata.startedAt}, endedAt=${metadata.endedAt}`,
    );
  }

  // Extract stream references
  const hrStream = aggregatedStreams.get("heartrate");
  const powerStream = aggregatedStreams.get("power");
  const distanceStream = aggregatedStreams.get("distance");
  
  // ... comprehensive metric calculations
  
  // Zone calculations
  const hr_zones = calculateHRZones(hrStream, metadata.profile.threshold_hr);
  const power_zones = calculatePowerZones(powerStream, metadata.profile.ftp);

  // ... many more calculations
}
```

**Integrity Checks**:
- ✅ **Validates metadata timestamps exist**
- ✅ **Comprehensive metric calculations** (TSS, IF, VI, EF, decoupling, etc.)
- ✅ **Zone distribution analysis**
- ✅ **Compression with fallback** (stores uncompressed if compression fails)
- ✅ **Error handling per stream** (continues if one stream fails)

---

### 3.3 Comparison

| Validation Type | Auuki | GradientPeak | Winner |
|----------------|-------|--------------|--------|
| **Pre-Recording** | Prevents duplicate starts, validates plan structure | **Missing duplicate start check**, validates permissions | **Auuki** |
| **During-Recording** | 10 retry attempts, continues on failure | 2 retry attempts, continues on failure | **Auuki** (more attempts) |
| **Metric Bounds** | Validated during parsing | **Not called during parsing** (critical gap) | **Auuki** |
| **Post-Recording** | Basic integrity checks | **Comprehensive metric calculations + compression fallback** | **GradientPeak** |

---

## 4. Error Handling Edge Cases

### 4.1 Battery Drain Scenarios

| Platform | Auuki | GradientPeak |
|----------|-------|--------------|
| **Monitoring** | ✅ BAS (Battery Service) monitored and dispatched | ❌ No battery monitoring |
| **Auto-Shutdown** | ❌ No automatic shutdown | ❌ No automatic shutdown |
| **User Notification** | ✅ Battery level logged to console | ❌ Not monitored |
| **Winner** | **Auuki** | |

---

### 4.2 Bluetooth Permission Loss

| Platform | Auuki | GradientPeak |
|----------|-------|--------------|
| **Detection** | Error caught in `requestDevice()` | Error caught in `connectToDevice()` |
| **Recovery** | ❌ No recovery mechanism | ❌ No recovery mechanism |
| **User Action** | Manual reconnection required | Manual reconnection required |
| **Winner** | **Tie** | |

---

### 4.3 Background Mode Interruptions

| Platform | Auuki | GradientPeak |
|----------|-------|--------------|
| **Web Bluetooth** | ❌ WebBluetooth unavailable in background | N/A (React Native) |
| **Recording State** | Stops implicitly (BLE drops) | ✅ **Continues with background location tracking** |
| **Sensor Reconnection** | ❌ Not applicable | ✅ **reconnectAll() on app foreground** |
| **Winner** | **GradientPeak** | |

---

### 4.4 Memory Pressure Handling

**Auuki**:

**File**: `apps/Auuki/src/models/models.js:1238-1256`

```javascript
class Activity extends Model {
    name = 'activity';
    postInit(args) {
        this.api = args.api;
        this.capacity = 7;  // MAX 7 activities in memory
    }
    
    add(activity, activityList) {
        activityList.unshift(activity);
        if(activityList.length > this.capacity) {
            const summary = activityList.pop();
            idb.remove('activity', summary.id);
        }
        return activityList;
    }
}
```

- FIFO eviction policy (capacity = 7)
- Oldest activities removed when limit exceeded

**GradientPeak**:

**File**: `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` (implicit)

- File-based StreamBuffer writes to disk
- No in-memory limit (constrained by device storage)
- Automatic cleanup after successful upload

| Feature | Auuki | GradientPeak | Winner |
|---------|-------|--------------|--------|
| **In-Memory Limit** | 7 activities | Unlimited (file-based) | **GradientPeak** |
| **Eviction Policy** | FIFO | N/A | N/A |
| **Persistence** | IndexedDB | File system | **GradientPeak** |

---

### 4.5 Concurrent Recording Prevention

**Auuki**:

**File**: `apps/Auuki/src/watch.js:141-154`

```javascript
startWorkout() {
    if(self.isWorkoutStarted() || (
        self.isWorkoutDone() && self.intervalIndex > 0
    )) {
        return;  // Silent return - prevents concurrent workout
    }
    // ... continue with start
}
```

- ✅ **Prevents duplicate start via state machine**
- Silent failure (no error notification)

**GradientPeak**:

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:344-392`

```typescript
async startRecording() {
  console.log("[Service] Starting recording");

  // ❌ NO CHECK IF ALREADY RECORDING!
  // This allows duplicate starts and data corruption risk

  this.recordingMetadata = { /* ... */ };
  this.state = "recording";
  // ...
}
```

- ❌ **NO concurrent recording prevention**
- ❌ **Critical data corruption risk**

| Feature | Auuki | GradientPeak | Winner |
|---------|-------|--------------|--------|
| **Concurrent Prevention** | ✅ State machine prevents duplicate starts | ❌ **Missing** | **Auuki** |
| **Severity** | N/A | **HIGH RISK** | |

---

## 5. Data Integrity

### 5.1 Timestamp Validation

| Feature | Auuki | GradientPeak | Winner |
|---------|-------|--------------|--------|
| **Capture Method** | `Date.now()` on every record | `Date.now()` on every sample | **Tie** |
| **Gap Detection** | Post-hoc via timestamp sequences | Post-hoc via timestamp sequences | **Tie** |
| **Validation** | FIT encoder validates timestamps | useActivitySubmission validates timestamps | **Tie** |

---

### 5.2 Metric Bounds Checking

| Metric | Auuki Bounds | GradientPeak Bounds | Notes |
|--------|-------------|---------------------|-------|
| **Power** | 0-2500W | 0-4000W | GradientPeak allows higher power (e.g., sprint efforts) |
| **Heart Rate** | 0-255 bpm | 30-250 bpm | GradientPeak rejects low HR (< 30 bpm), Auuki allows 0 |
| **Cadence** | 0-255 rpm | 0-300 rpm | GradientPeak allows higher cadence |
| **Speed** | N/A | 0-100 m/s (360 km/h) | GradientPeak validates speed |

**Critical Gap**:
- Auuki: ✅ Bounds checked **during parsing** via `defaultIsValid()`
- GradientPeak: ❌ `validateSensorReading()` exists but **NOT called during parsing**

**Winner**: **Auuki** (validation enforced)

---

### 5.3 Null/Undefined Handling

**Auuki**:

**File**: `apps/Auuki/src/functions.js:50-65`

```javascript
function exists(x) {
    if(isNull(x) || isUndefined(x)) { return false; }
    return true;
}

function existance(value, fallback) {
    if(exists(value))    return value;
    if(exists(fallback)) return fallback;
    throw new Error(`existance needs a fallback value `, value);
}

function expect(x, msg = 'expected value here') {
    if(exists(x)) return x;
    throw new Error(msg);
}
```

- ✅ Utility functions: `exists()`, `existance()`, `expect()`
- Used throughout service initialization
- Throws on missing required values

**GradientPeak**:

```typescript
// Uses TypeScript type system + optional chaining
const hrStream = aggregatedStreams.get("heartrate");
if (!hrStream) return null;

const value = reading?.value ?? 0;
```

- ✅ TypeScript type safety
- ✅ Optional chaining (`?.`)
- ✅ Nullish coalescing (`??`)

**Winner**: **Tie** (different approaches, both effective)

---

### 5.4 Data Persistence Failure Recovery

**Auuki**:

**File**: `apps/Auuki/src/storage/idb.js:108-150`

```javascript
function transaction(storeName, method, param = undefined, type = 'readonly') {
    if(!db.objectStoreNames.contains(storeName)) return undefined;

    let transaction = db.transaction(storeName, type);
    let store = transaction.objectStore(storeName);
    let req;

    if(param === undefined) {
        req = store[method]();
    } else {
        req = store[method](param);
    }

    return promisify(req).then(res => {
        console.log(`:idb :${method} :store '${storeName}' :success`);
        return res;
    }).catch(err => {
        console.error(`:idb :error :${method} :store '${storeName}'`, err);
        return [];  // RECOVERY: Return empty array on failure
    });
}
```

- ✅ IndexedDB errors caught and logged
- ✅ Returns empty array on failure (non-blocking)
- ✅ Automatic retry via backup timing (every 60 seconds)

**GradientPeak**:

**File**: `apps/mobile/lib/hooks/useActivitySubmission.ts:184-215`

```typescript
// Compress streams with error handling
const compressedStreams: Omit<PublicActivityStreamsInsert, "activity_id">[] = [];
const compressionErrors: Array<{ stream: string; error: Error }> = [];

for (const [key, aggregated] of aggregatedStreams.entries()) {
  try {
    const compressed = await compressStreamData(aggregated);
    compressedStreams.push(compressed);
    console.log(`[useActivitySubmission] Successfully compressed stream: ${key}`);
  } catch (error) {
    console.error(`[useActivitySubmission] Failed to compress stream ${key}:`, error);
    compressionErrors.push({
      stream: key,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    // Store uncompressed data as fallback
    console.warn(`[useActivitySubmission] Storing ${key} as uncompressed fallback`);

    const fallbackStream: Omit<PublicActivityStreamsInsert, "activity_id"> = {
      type: aggregated.metric,
      data_type: aggregated.dataType,
      compressed_values: JSON.stringify(aggregated.values),
      compressed_timestamps: JSON.stringify(aggregated.timestamps),
      // ... other fields
    };
    compressedStreams.push(fallbackStream);
  }
}

// Warn user if compression failed for any streams
if (compressionErrors.length > 0) {
  const streamNames = compressionErrors.map((e) => e.stream).join(", ");
  Alert.alert(
    "Compression Warning",
    `Some activity data (${streamNames}) couldn't be compressed. Your activity will be uploaded with a larger file size. All data is preserved.`,
    [{ text: "OK" }],
  );
}
```

- ✅ **Per-stream error handling**
- ✅ **Fallback to uncompressed data** (prevents data loss)
- ✅ **User notification** for compression failures
- ✅ **Continues processing** even if some streams fail

**Winner**: **GradientPeak** (more sophisticated fallback strategy)

---

## 6. Gap Analysis Summary

### Critical Gaps (Must Fix)

| Gap | Current Status | Impact | Recommendation |
|-----|---------------|--------|----------------|
| **No concurrent recording prevention** | Missing in `startRecording()` | **HIGH** - Risk of data corruption | Add state check: `if (this.state === "recording") throw new Error("Already recording")` |
| **Metric bounds not enforced during parsing** | `validateSensorReading()` exists but not called | **MEDIUM** - Invalid data can enter system | Call validation in `parseBleData()` before returning |

### Medium Priority Gaps

| Gap | Current Status | Impact | Recommendation |
|-----|---------------|--------|----------------|
| **No watchAdvertisements API usage** | Not implemented | **MEDIUM** - Slower reconnection on iOS/Android | Investigate Web Bluetooth API support in React Native |
| **Single reconnection attempt** | `reconnectAttempted` flag prevents retries | **MEDIUM** - Device may not reconnect if first attempt fails | Implement exponential backoff (3-5 attempts) |
| **No battery monitoring** | BAS not monitored | **LOW** - No warning before sensor dies | Add battery service monitoring and low-battery alerts |

### Strengths (Already Superior)

| Feature | GradientPeak Implementation | Advantage |
|---------|---------------------------|-----------|
| **File-based StreamBuffer** | Real-time disk writes | More resilient than Auuki's in-memory + 60s backup |
| **Background tracking** | Continues in background with location tracking | Auuki stops when backgrounded |
| **Compression fallback** | Stores uncompressed data if compression fails | Prevents data loss |
| **Comprehensive metrics** | TSS, IF, VI, EF, decoupling, zones, etc. | More detailed post-recording analysis |
| **Permission validation** | Checks all permissions before recording | Prevents recording with missing permissions |

---

## 7. Recommendations

### Immediate Actions (Critical)

1. **Add Concurrent Recording Prevention**

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:344`

```typescript
async startRecording() {
  console.log("[Service] Starting recording");

  // NEW: Prevent concurrent recordings
  if (this.state === "recording") {
    throw new Error("Recording already in progress");
  }

  // Check all necessary permissions
  const allGranted = await areAllPermissionsGranted();
  // ... rest of implementation
}
```

2. **Enforce Metric Bounds During Parsing**

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:520-540`

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
  return this.validateSensorReading(reading);
}
```

### Short-Term Improvements (Medium Priority)

3. **Implement Exponential Backoff for Reconnection**

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:126-160`

```typescript
private async attemptReconnection(sensorId: string, attempt: number = 1) {
  const MAX_ATTEMPTS = 5;
  const BACKOFF_BASE_MS = 500;

  const sensor = this.connectedSensors.get(sensorId);
  if (!sensor || attempt > MAX_ATTEMPTS) {
    if (sensor) {
      sensor.connectionState = "failed";
      this.connectionCallbacks.forEach((cb) => cb(sensor));
    }
    return;
  }

  sensor.connectionState = "connecting";
  this.connectionCallbacks.forEach((cb) => cb(sensor));

  console.log(`[SensorsManager] Reconnection attempt ${attempt}/${MAX_ATTEMPTS} for ${sensor.name}`);

  try {
    const reconnected = await this.connectSensor(sensorId);
    if (reconnected) {
      console.log(`[SensorsManager] Successfully reconnected to ${sensor.name}`);
      return;
    }
    throw new Error("Reconnection returned null");
  } catch (error) {
    console.error(`[SensorsManager] Reconnection attempt ${attempt} failed:`, error);

    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s
    const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
    console.log(`[SensorsManager] Retrying in ${delayMs}ms...`);

    setTimeout(() => {
      this.attemptReconnection(sensorId, attempt + 1);
    }, delayMs);
  }
}
```

4. **Add Battery Service Monitoring**

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts:478-518`

```typescript
private async monitorKnownCharacteristics(sensor: ConnectedSensor) {
  // Existing code...

  // NEW: Monitor battery service if available
  const batteryServiceUuid = "0000180f-0000-1000-8000-00805f9b34fb";
  const batteryLevelCharUuid = "00002a19-0000-1000-8000-00805f9b34fb";

  if (sensor.characteristics.has(batteryLevelCharUuid.toLowerCase())) {
    console.log(`[SensorsManager] Monitoring battery for ${sensor.name}`);

    const service = (await sensor.device.services()).find(
      (s) => s.uuid.toLowerCase() === batteryServiceUuid.toLowerCase(),
    );

    if (service) {
      const characteristic = (await service.characteristics()).find(
        (c) => c.uuid.toLowerCase() === batteryLevelCharUuid.toLowerCase(),
      );

      if (characteristic) {
        characteristic.monitor((error, char) => {
          if (error || !char?.value) return;

          const buffer = Buffer.from(char.value, "base64");
          const batteryLevel = buffer.readUInt8(0);

          console.log(`[SensorsManager] Battery level for ${sensor.name}: ${batteryLevel}%`);

          // Warn if battery below 20%
          if (batteryLevel < 20) {
            console.warn(`[SensorsManager] Low battery warning: ${sensor.name} at ${batteryLevel}%`);
            // Emit event for UI notification
            this.emit("lowBattery", { sensorId: sensor.id, level: batteryLevel });
          }
        });
      }
    }
  }
}
```

### Long-Term Enhancements (Optional)

5. **Investigate watchAdvertisements API**

- Research if `react-native-ble-plx` supports watchAdvertisements
- If not, consider contributing to library or using alternative approach
- Benefit: Faster device reappearance detection on iOS/Android

6. **Add Pre-Recording Sensor Check**

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts:344-392`

```typescript
async startRecording() {
  console.log("[Service] Starting recording");

  // ... existing permission check

  // NEW: Warn if no sensors connected (optional)
  const connectedSensors = this.sensorsManager.getConnectedSensors();
  if (connectedSensors.length === 0) {
    console.warn("[Service] Starting recording without any connected sensors");
    // Optionally prompt user confirmation
  }

  // ... continue with recording
}
```

7. **Implement Event-Driven State Bus**

- Consider adopting event-driven architecture similar to Auuki's `xf` dispatch system
- Benefits: More decoupled components, easier testing, better event tracing
- Trade-off: More complexity, steeper learning curve

---

## Conclusion

### Summary of Findings

**GradientPeak's Strengths**:
- ✅ **Superior data persistence** (file-based StreamBuffer)
- ✅ **Background tracking support** (continues in background)
- ✅ **Comprehensive post-recording metrics** (TSS, IF, VI, EF, etc.)
- ✅ **Sophisticated compression fallback** (prevents data loss)
- ✅ **Permission validation** (checks before recording)

**Auuki's Strengths**:
- ✅ **Aggressive reconnection strategy** (10 retry attempts, watchAdvertisements)
- ✅ **Event-driven architecture** (decoupled via `xf` bus)
- ✅ **Concurrent recording prevention** (state machine)
- ✅ **Metric bounds enforced during parsing**
- ✅ **Battery monitoring** (BAS service)

### Critical Actions Required

1. **Add concurrent recording prevention** (HIGH priority)
2. **Enforce metric bounds during parsing** (MEDIUM priority)

### Optional Improvements

3. Exponential backoff for reconnection (improves success rate)
4. Battery service monitoring (user experience enhancement)
5. watchAdvertisements API investigation (faster reconnection)

### Overall Assessment

GradientPeak has a **solid foundation** with superior data persistence and comprehensive metrics calculation. The critical gaps are **minor and easily fixed** (concurrent prevention, bounds enforcement). The architectural differences (event-driven vs. direct calls) are **stylistic rather than functional** - both approaches work well for their respective platforms.

**Recommendation**: Focus on the 2 critical fixes first, then consider medium-priority improvements based on user feedback and real-world testing with actual BLE sensors.

---

## Appendix A: File Reference Index

### Auuki Files Analyzed

| File | Purpose | Key Insights |
|------|---------|--------------|
| `apps/Auuki/src/ble/connectable.js` | BLE connection management | watchAdvertisements, auto-reconnect |
| `apps/Auuki/src/ble/reactive-connectable.js` | Event-driven BLE adapter | xf dispatch, metric reset on disconnect |
| `apps/Auuki/src/ble/service.js` | BLE service abstraction | Notification retry (10 attempts) |
| `apps/Auuki/src/ble/characteristic.js` | BLE characteristic wrapper | Retry logic implementation |
| `apps/Auuki/src/ble/ftms/indoor-bike-data.js` | FTMS data decoder | Bounds checking in decode |
| `apps/Auuki/src/models/models.js` | Data models and validation | Bounds enforcement, in-memory storage |
| `apps/Auuki/src/watch.js` | Recording coordinator | Concurrent prevention, state machine |
| `apps/Auuki/src/fit/local-activity.js` | FIT file export | Post-recording integrity checks |
| `apps/Auuki/src/storage/idb.js` | IndexedDB persistence | Error recovery strategy |
| `apps/Auuki/src/functions.js` | Utility functions | Null/undefined handling |

### GradientPeak Files Analyzed

| File | Purpose | Key Insights |
|------|---------|--------------|
| `apps/mobile/lib/services/ActivityRecorder/sensors.ts` | BLE sensor management | Health monitoring, single reconnect |
| `apps/mobile/lib/services/ActivityRecorder/index.ts` | Recording coordinator | Permission checks, no concurrent prevention |
| `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` | Metrics processing | StreamBuffer integration |
| `apps/mobile/lib/hooks/useActivitySubmission.ts` | Activity upload | Compression fallback, comprehensive metrics |
| `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` | FTMS control implementation | Protocol encoding/decoding |

---

## Appendix B: Edge Case Matrix

| Scenario | Auuki Behavior | GradientPeak Behavior | Recommended Action |
|----------|---------------|----------------------|-------------------|
| Sensor disconnects during recording | Auto-reconnect (unlimited), metrics → 0 | Single reconnect attempt, metrics freeze | ✅ Implement exponential backoff |
| New sensor connects mid-recording | Hot-plug supported, immediate integration | Hot-plug supported, immediate integration | ✅ Already working |
| Start recording twice | Silently rejected via state machine | ❌ **No check - data corruption risk** | ⚠️ **CRITICAL: Add check** |
| Invalid metric value (e.g., HR=500) | Rejected during parsing | ❌ **Not enforced** (validation exists but not called) | ⚠️ **FIX: Call validation** |
| Bluetooth permission revoked | Manual reconnect required | Manual reconnect required | ✅ Already handled |
| App backgrounded | Recording stops (BLE unavailable) | Recording continues with location tracking | ✅ GradientPeak superior |
| Compression fails | N/A | Stores uncompressed with user alert | ✅ Already handled |
| Battery low on sensor | User notification (logged) | ❌ Not monitored | ✅ Add battery monitoring |
| Memory pressure | FIFO eviction (capacity=7) | File-based (unlimited) | ✅ GradientPeak superior |
| Storage failure | Returns empty array, retries after 60s | Compression fallback, continues processing | ✅ GradientPeak superior |

---

**End of Document**
