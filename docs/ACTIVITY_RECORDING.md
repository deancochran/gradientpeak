# Activity Recording Guide

Complete guide for the activity recording system in GradientPeak mobile app.

## Overview

The activity recording system uses a **local-first, offline-capable architecture** with the following flow:

```
Start Activity → Record Locally (SQLite) → Upload JSON (Supabase Storage)
                                                    ↓
                                     Generate Metadata + Streams
                                                    ↓
                                     Calculate IF/TSS (Core Package)
```

## Recording UI/UX

### Dashboard Cards

All cards are **always visible** with placeholder values when data is unavailable. Cards adapt based on activity type and plan selection.

#### 1. Dashboard Card

**Primary at-a-glance metrics:**

```
┌─────────────────────────────────┐
│         [Clock Icon]            │
│          DURATION               │
│         00:00:00                │  ← Large, dominant
│                                 │
│  [⚡]      [❤️]      [📊]      │  ← Top row
│  Power   Heart    Cadence       │
│  n/a W   n/a bpm  n/a rpm      │
│                                 │
│  [🏃]      [📍]                 │  ← Bottom row
│  Speed   Distance               │
│  n/a     n/a                    │
└─────────────────────────────────┘
```

**Metrics:**
- **Elapsed Time** (largest) - Most critical
- **Power** - Current watts
- **Heart Rate** - Current bpm
- **Cadence** - RPM
- **Speed** - km/h or mph
- **Distance** - km or miles

#### 2. Power Card

**Detailed power metrics and zones:**

```
┌─────────────────────────────────┐
│ ⚡ Power            [LIVE]      │
│                                 │
│            250                  │  ← Large current
│            watts                │
│                                 │
│   Avg    Max     NP             │
│   180    320     195            │
│                                 │
│   Total Work: 1,234 kJ          │
│                                 │
│   Zone Distribution             │
│   [████████░░░░░░░░░░]          │
│   Z1  Z2  Z3  Z4  Z5  Z6  Z7   │
└─────────────────────────────────┘
```

**Metrics:**
- Current Power (live)
- Average Power
- Max Power
- Normalized Power (NP)
- Total Work (kJ)
- 7-zone distribution

#### 3. Heart Rate Card

**Comprehensive HR monitoring:**

```
┌─────────────────────────────────┐
│ ❤️ Heart Rate       [LIVE]      │
│                                 │
│            145                  │
│            bpm                  │
│      Zone 3 - Tempo             │
│                                 │
│   Avg    Max     %              │
│   138    162     85%            │
│                                 │
│   Zone Distribution             │
│   Z1 [██░░░░] 5m                │
│   Z2 [████░░] 12m               │
│   Z3 [██████] 18m               │
│   Z4 [██░░░░] 3m                │
│   Z5 [░░░░░░] 0m                │
└─────────────────────────────────┘
```

**Metrics:**
- Current HR with zone
- Average HR
- Max HR
- Threshold %
- 5-zone time distribution

#### 4. Analysis Card

**Performance metrics:**

```
┌─────────────────────────────────┐
│ 📊 Analysis      [LIVE CALC]    │
│                                 │
│            85                   │
│    Training Stress Score        │
│         ● Moderate              │
│                                 │
│  Intensity     Variability      │
│  Factor (IF)   Index (VI)       │
│    0.85          1.03           │
│                                 │
│  Duration: 01:23:45             │
│  Distance: 42.5 km              │
│                                 │
│  Plan Adherence: 92%            │
│  [████████████████░░]           │
└─────────────────────────────────┘
```

**Metrics:**
- Training Stress Score (TSS)
- Intensity Factor (IF)
- Variability Index (VI)
- Efficiency Factor
- Duration & Distance
- Plan Adherence (if following plan)

#### 5. Elevation Card

**Elevation tracking:**

```
┌─────────────────────────────────┐
│ ⛰️ Elevation           [GPS]     │
│                                 │
│           342m                  │
│      current elevation          │
│                                 │
│  ↗️ Ascent  ↘️ Descent  Grade   │
│    245m      187m     +3.2%    │
│                                 │
│  Current Grade: +5.2%           │
│  Moderate climb                 │
│  [████████░░░░░░░░░░]          │
│                                 │
│  Elevation Profile              │
│  [Visual chart]                 │
└─────────────────────────────────┘
```

**Metrics:**
- Current Elevation
- Total Ascent
- Total Descent
- Average Grade
- Current Grade with description
- Elevation Profile chart
- VAM (when climbing)

#### 6. Map Card (Outdoor Only)

**Live GPS tracking:**

```
┌─────────────────────────────────┐
│        [Map View]               │
│                                 │
│    Live GPS route display       │
│    with current position        │
│                                 │
│  📍 Location:                   │
│  37.7749° N, 122.4194° W        │
│  Altitude: 15m                  │
└─────────────────────────────────┘
```

**Display Condition:** Only for outdoor activities (`outdoor_run`, `outdoor_bike`)

#### 7. Plan Card (When Plan Selected)

**Structured workout guidance:**

```
┌─────────────────────────────────┐
│ 📋 Activity Plan                 │
│ "Tempo Intervals"               │
│                                 │
│  Current Step: 3 of 5           │
│  ████████████░░░░░░             │
│                                 │
│  💪 Hard Effort                 │
│  Target: 250-280W               │
│  Duration: 5:00                 │
│  Time Remaining: 2:34           │
│                                 │
│  Next: Recovery (2 min)         │
│  [Next Step →]                  │
└─────────────────────────────────┘
```

**Display Condition:** Only when user selects a template or scheduled plan

### Card Visibility Logic

```typescript
const cards = useMemo((): CarouselCard[] => {
  const cardList: CarouselCard[] = ["dashboard"];

  // Always show core metrics
  cardList.push("power", "heartrate", "analysis", "elevation");

  // Map card - outdoor activities only
  if (isOutdoorActivity(activityType)) {
    cardList.push("map");
  }

  // Plan card - when template/plan selected
  if (activityPlan) {
    cardList.push("plan");
  }

  return cardList;
}, [activityType, activityPlan]);
```

## ActivityRecorderService

### Purpose

Singleton service managing local-first activity recording with background support.

### Architecture

**Key Features:**
- Event-driven architecture
- SQLite for local storage
- Background location tracking
- Automatic cloud sync when online
- Metrics streaming via hooks

### Service Lifecycle

```
Create Instance → Configure Sensors → Start Recording
                                            ↓
                            Track Metrics (power, HR, GPS)
                                            ↓
                            Save to SQLite Every N Seconds
                                            ↓
Stop Recording → Finalize SQLite → Upload JSON to Storage
                                            ↓
                            Process Metadata + Streams
                                            ↓
                            Calculate IF/TSS
```

### Usage Example

```typescript
import { ActivityRecorderService } from '@/lib/services/ActivityRecorder';

// Get singleton instance
const recorder = ActivityRecorderService.getInstance();

// Initialize recording
await recorder.initialize({
  activityType: 'outdoor_bike',
  activityPlan: selectedPlan,  // Optional
});

// Start recording
await recorder.start();

// Subscribe to metrics
recorder.on('metric:power', (power) => {
  console.log('Current power:', power);
});

// Pause/Resume
await recorder.pause();
await recorder.resume();

// Stop and finalize
await recorder.stop();
const activityId = await recorder.finalize();
```

### Event System

```typescript
// Lifecycle events
recorder.on('state:change', (state) => { ... });
recorder.on('recording:start', () => { ... });
recorder.on('recording:pause', () => { ... });
recorder.on('recording:stop', () => { ... });

// Metric events
recorder.on('metric:power', (watts) => { ... });
recorder.on('metric:heartRate', (bpm) => { ... });
recorder.on('metric:cadence', (rpm) => { ... });
recorder.on('metric:speed', (mps) => { ... });
recorder.on('metric:distance', (meters) => { ... });
recorder.on('metric:location', ({ lat, lng, altitude }) => { ... });

// Error events
recorder.on('error', (error) => { ... });
```

### React Hooks

```typescript
// Use in components for reactive updates
import { 
  useRecorderState, 
  useMetric,
  useActivityTime 
} from '@/lib/services/ActivityRecorder/hooks';

function PowerCard() {
  const currentPower = useMetric('power');
  const avgPower = useMetric('avgPower');
  const maxPower = useMetric('maxPower');
  
  return (
    <View>
      <Text>{currentPower ?? 'n/a'} W</Text>
      <Text>Avg: {avgPower ?? '--'}</Text>
      <Text>Max: {maxPower ?? '--'}</Text>
    </View>
  );
}

function DashboardCard() {
  const elapsedTime = useActivityTime();
  const state = useRecorderState();
  
  return (
    <View>
      <Text>{formatDuration(elapsedTime)}</Text>
      <Text>{state}</Text>
    </View>
  );
}
```

## Recording States

### State Machine

```
idle → pending → ready → recording → paused → recording → finished
  ↓       ↓        ↓         ↓          ↓          ↓           ↓
Initial  Setup   Sensors  Active   Temporary   Active   Complete
                 Ready            Stop
```

### State Descriptions

| State | Description | UI Behavior |
|-------|-------------|-------------|
| `idle` | Not initialized | Hidden |
| `pending` | Initializing sensors | "Preparing..." |
| `ready` | Sensors connected | "Ready to Start" button |
| `recording` | Activity in progress | Live metrics, "Pause" button |
| `paused` | Temporarily stopped | Last values, "Resume"/"Finish" buttons |
| `finished` | Recording complete | Processing, auto-redirect |

## Data Storage

### Local Storage (SQLite)

**Activity Record:**
```typescript
{
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  status: 'recording' | 'paused' | 'completed';
  payload: {
    activity_type: string;
    started_at: string;
    ended_at: string;
    streams: {
      time: number[];
      power?: number[];
      heart_rate?: number[];
      cadence?: number[];
      speed?: number[];
      distance?: number[];
      location?: [number, number][];  // [lat, lng]
      altitude?: number[];
      temperature?: number[];
    };
    laps?: Array<{
      start_time: number;
      end_time: number;
      total_elapsed_time: number;
      total_distance: number;
      avg_power?: number;
      avg_heart_rate?: number;
    }>;
  };
  activity_plan_id?: string;
}
```

**Storage Strategy:**
- Save to SQLite every 5 seconds during recording
- Compress streams for storage efficiency
- Keep local copy until successful upload
- Auto-retry failed uploads

### Cloud Storage (Supabase)

**JSON Upload:**
```
Local SQLite → Extract JSON Payload → Upload to Storage Bucket
                                            ↓
                            activities/{profile_id}/{activity_id}.json
```

**Post-Upload Processing:**
1. Generate activity metadata record
2. Extract and compress streams
3. Insert stream records
4. Calculate IF/TSS via core package
5. Update activity with analytics

## Post-Recording Analytics

### Intensity Factor (IF) Calculation

**After activity completion with power data:**

```typescript
import { 
  calculateNormalizedPower,
  calculateTrainingIntensityFactor,
  calculateTrainingTSS 
} from '@repo/core';

// 1. Get power stream from activity
const powerStream = activity.activity_streams.find(s => s.type === 'power');
const powerValues = decompressStream(powerStream);

// 2. Calculate Normalized Power (30s rolling average)
const np = calculateNormalizedPower(powerValues);

// 3. Get user's FTP
const profile = await getUserProfile();
const ftp = profile.ftp;

// 4. Calculate IF
const if_ = calculateTrainingIntensityFactor(np, ftp);

// 5. Calculate TSS
const tss = calculateTrainingTSS(activity.duration, if_);

// 6. Update activity
await updateActivity({
  id: activity.id,
  intensity_factor: Math.round(if_ * 100),  // Store as 0-200
  training_stress_score: Math.round(tss),
  normalized_power: Math.round(np),
});
```

### Zone Classification

**7-Zone System** (calculated post-activity):

| Zone | IF Range | Name | Description |
|------|----------|------|-------------|
| Z1 | < 0.55 | Recovery | Active recovery |
| Z2 | 0.55-0.75 | Endurance | Aerobic base |
| Z3 | 0.75-0.85 | Tempo | Sweet spot |
| Z4 | 0.85-0.95 | Threshold | FTP efforts |
| Z5 | 0.95-1.05 | VO2max | Race pace |
| Z6 | 1.05-1.15 | Anaerobic | Supra-threshold |
| Z7 | ≥ 1.15 | Neuromuscular | Max effort |

```typescript
import { getTrainingIntensityZone } from '@repo/core';

const zone = getTrainingIntensityZone(if_);
// Returns: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 
//          'vo2max' | 'anaerobic' | 'neuromuscular'
```

## Sensor Integration

### Bluetooth Sensors

**Supported Sensors:**
- Power meters (ANT+/Bluetooth)
- Heart rate monitors
- Cadence sensors
- Speed sensors

**Connection Flow:**
```typescript
// Scan for devices
const devices = await BluetoothLE.scan({ serviceUUIDs: ['180D'] });

// Connect to device
await recorder.connectSensor({
  type: 'heart_rate',
  device: selectedDevice,
});

// Sensor automatically starts streaming
recorder.on('metric:heartRate', (bpm) => {
  // Update UI
});
```

### GPS Tracking

**Background Location:**
```typescript
import * as Location from 'expo-location';

// Request permissions
const { status } = await Location.requestForegroundPermissionsAsync();

// Start background tracking
await Location.startLocationUpdatesAsync('ACTIVITY_TRACKING', {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,  // 1 second
  distanceInterval: 5,  // 5 meters
  foregroundService: {
    notificationTitle: 'Recording Activity',
    notificationBody: 'GradientPeak is tracking your activity',
  },
});
```

**Location Processing:**
```typescript
recorder.on('metric:location', ({ latitude, longitude, altitude, accuracy }) => {
  // Update map display
  // Calculate distance
  // Store in stream
});
```

## Performance Optimizations

### Metric Calculation

**Avoid Recalculation:**
```typescript
// ✅ Good - calculate once, cache result
const avgPower = useMemo(() => {
  if (!powerValues.length) return null;
  return powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
}, [powerValues]);

// ❌ Bad - recalculates every render
const avgPower = powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
```

### Stream Compression

**Compress before storage:**
```typescript
import pako from 'pako';

// Compress stream data
const compressed = pako.deflate(JSON.stringify(powerValues));

// Decompress when needed
const decompressed = JSON.parse(
  pako.inflate(compressed, { to: 'string' })
);
```

### UI Updates

**Throttle metric updates:**
```typescript
// Update UI max once per second
const throttledUpdate = useCallback(
  throttle((value) => {
    setPower(value);
  }, 1000),
  []
);

recorder.on('metric:power', throttledUpdate);
```

## Offline Support

### Offline Recording

1. Activity recorded → Saved to SQLite
2. Network unavailable → Queue for upload
3. Continue recording → Save locally
4. Network restored → Upload queued activities

### Sync Strategy

```typescript
// Check network status
import NetInfo from '@react-native-community/netinfo';

const unsubscribe = NetInfo.addEventListener(state => {
  if (state.isConnected) {
    // Sync queued activities
    syncQueuedActivities();
  }
});

async function syncQueuedActivities() {
  const queued = await getQueuedActivities();
  
  for (const activity of queued) {
    try {
      await uploadActivity(activity);
      await markAsSynced(activity.id);
    } catch (error) {
      console.error('Failed to sync:', error);
      // Will retry on next connection
    }
  }
}
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { ActivityRecorderService } from './ActivityRecorderService';

describe('ActivityRecorderService', () => {
  let recorder: ActivityRecorderService;

  beforeEach(() => {
    recorder = ActivityRecorderService.getInstance();
  });

  it('initializes with correct state', async () => {
    await recorder.initialize({ activityType: 'outdoor_bike' });
    expect(recorder.getState()).toBe('ready');
  });

  it('tracks metrics during recording', async () => {
    await recorder.start();
    
    // Simulate sensor data
    recorder.addMetric('power', 250);
    
    const metrics = recorder.getCurrentMetrics();
    expect(metrics.power).toBe(250);
  });
});
```

### Integration Tests

```typescript
describe('Activity Recording Flow', () => {
  it('completes full recording workflow', async () => {
    // 1. Initialize
    await recorder.initialize({ activityType: 'outdoor_bike' });
    
    // 2. Start recording
    await recorder.start();
    expect(recorder.getState()).toBe('recording');
    
    // 3. Record metrics
    for (let i = 0; i < 100; i++) {
      recorder.addMetric('power', 200 + Math.random() * 50);
      await wait(100);
    }
    
    // 4. Stop recording
    await recorder.stop();
    const activityId = await recorder.finalize();
    
    // 5. Verify saved to SQLite
    const activity = await getActivityFromDb(activityId);
    expect(activity).toBeDefined();
    expect(activity.payload.streams.power).toHaveLength(100);
  });
});
```

## Troubleshooting

### Common Issues

**Issue:** Sensors not connecting
```typescript
// Check Bluetooth permissions
const { status } = await requestBluetoothPermissions();
if (status !== 'granted') {
  alert('Bluetooth permission required');
}

// Check Bluetooth is enabled
const state = await BluetoothLE.getState();
if (state !== 'PoweredOn') {
  alert('Please enable Bluetooth');
}
```

**Issue:** GPS accuracy poor
```typescript
// Request best accuracy
await Location.requestForegroundPermissionsAsync();
await Location.requestBackgroundPermissionsAsync();

// Use highest accuracy setting
accuracy: Location.Accuracy.BestForNavigation,
```

**Issue:** Activity not uploading
```typescript
// Check network connectivity
const netInfo = await NetInfo.fetch();
if (!netInfo.isConnected) {
  console.log('Offline - will retry when online');
  return;
}

// Check Supabase connection
try {
  await supabase.storage.from('activities').list();
} catch (error) {
  console.error('Supabase connection failed:', error);
}
```

---

**Last Updated:** 2025-01-23
