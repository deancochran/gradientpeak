# 📐 Recording Service Architecture

## Overview

The recording service has been simplified to focus on two core concerns:
1. **Real-time metric calculations** (every 1 second)
2. **Periodic database persistence** (every 60 seconds)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ActivityRecorderService                       │
│  (Main orchestrator - manages lifecycle & state)                │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │  delegates to
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LiveMetricsManager                           │
│  (2 Timers: 1s updates, 60s persistence)                        │
└─────┬───────────────────────────────────────────────┬───────────┘
      │                                               │
      │  uses                                         │  uses
      ▼                                               ▼
┌─────────────────┐                         ┌────────────────────┐
│   DataBuffer    │                         │  DataAccumulator   │
│  (60s window)   │                         │  (batch writes)    │
│                 │                         │                    │
│ • Real-time     │                         │ • Collects data    │
│   calculations  │                         │ • Writes to DB     │
│ • Rolling data  │                         │ • Clears memory    │
└─────────────────┘                         └────────────────────┘
```

---

## 🔄 Data Flow

### Sensor Data Ingestion

```
Bluetooth Sensor
      │
      │  SensorReading
      ▼
ActivityRecorderService.handleSensorData()
      │
      │  passes to
      ▼
LiveMetricsManager.ingestSensorData()
      │
      ├─────────────────┬─────────────────┐
      │                 │                 │
      ▼                 ▼                 ▼
 DataBuffer.add()  DataAccumulator   Update max values
 (for calcs)       .add()            (power, HR, etc)
                   (for DB)
```

### Location Data Ingestion

```
GPS / Location Services
      │
      │  LocationObject
      ▼
ActivityRecorderService.handleLocationData()
      │
      │  passes to
      ▼
LiveMetricsManager.ingestLocationData()
      │
      ├─────────────────┬─────────────────┐
      │                 │                 │
      ▼                 ▼                 ▼
 Calculate distance  DataAccumulator   Update elevation
 Update speed        .addLocation()    Track ascent/descent
```

---

## ⏱️ Timer Architecture

### Timer 1: UI Update (1 second interval)

```
┌──────────────────────────────────────────────────┐
│  setInterval(() => {                             │
│    calculateAndEmitMetrics();                    │
│  }, 1000);                                       │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│  calculateAndEmitMetrics() {                     │
│    • updateTiming()          (elapsed time)      │
│    • updateDistanceMetrics() (speed, distance)   │
│    • updatePowerMetrics()    (avg, max, work)    │
│    • updateHeartRateMetrics() (avg, max, zones)  │
│    • updateCadenceMetrics()  (avg, max)          │
│    • updateTemperatureMetrics() (avg, max)       │
│    • updateZoneMetrics()     (time in zones)     │
│    • updateCalories()        (estimated kcal)    │
│    • updateTier2Metrics()    (NP, IF, TSS, EF)   │
│    │                                              │
│    └─→ emit("metricsUpdate", metrics)            │
│       → UI Updates                                │
│  }                                                │
└──────────────────────────────────────────────────┘
```

### Timer 2: Persistence (60 second interval)

```
┌──────────────────────────────────────────────────┐
│  setInterval(() => {                             │
│    persistAndCleanup();                          │
│  }, 60000);                                      │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│  persistAndCleanup() {                           │
│    │                                              │
│    ├─→ accumulator.flushToDatabase(recordingId)  │
│    │   • Group readings by metric                │
│    │   • Insert into activityRecordingStreams    │
│    │   • Clear accumulator                       │
│    │   • Increment chunkIndex                    │
│    │                                              │
│    └─→ buffer.cleanup()                          │
│        • Remove data older than 60 seconds       │
│        • Free memory                             │
│  }                                                │
└──────────────────────────────────────────────────┘
```

---

## 📊 Component Details

### DataBuffer (Real-time Calculations)

**Purpose**: Maintain a 60-second rolling window of sensor data for calculations

```typescript
interface DataBuffer {
  data: BufferedReading[];  // Simple array
  windowMs: number;         // 60,000 (60 seconds)
  
  // API
  add(reading): void;                    // Add sensor reading
  getRecent(metric, seconds): number[];  // Get last N seconds
  getAverage(metric): number;            // Calculate average
  getMax(metric): number;                // Get maximum
  getLatest(metric): number;             // Get most recent
  cleanup(): void;                       // Remove old data
}
```

**Memory Management**:
- Stores ~60 seconds of data at 1Hz = ~60 readings per metric
- Multiple metrics: power, heartrate, cadence, altitude, temperature
- Estimated memory: ~100KB for typical workout
- Cleaned every 60 seconds

### DataAccumulator (Batch Persistence)

**Purpose**: Collect all data and write to database every 60 seconds

```typescript
interface DataAccumulator {
  readings: SensorReading[];      // All sensor data since last flush
  locations: LocationReading[];   // All location data since last flush
  chunkIndex: number;             // Sequential chunk number
  lastFlushTime: Date;            // When we last wrote to DB
  
  // API
  add(reading): void;                     // Collect sensor data
  addLocation(location): void;            // Collect location data
  flushToDatabase(recordingId): Promise;  // Write everything to DB
  clear(): void;                          // Clear without writing
}
```

**Database Schema**:
```sql
-- Each flush creates multiple stream entries
INSERT INTO activity_recording_streams (
  activity_recording_id,
  metric,              -- 'power', 'heartrate', 'cadence', etc.
  data_type,           -- 'float', 'latlng', 'boolean'
  chunk_index,         -- Sequential: 0, 1, 2, 3...
  start_time,          -- Beginning of this chunk
  end_time,            -- End of this chunk (now)
  data,                -- JSON array of values
  timestamps,          -- JSON array of timestamps
  sample_count         -- Number of samples
)
```

---

## 🎯 Metric Calculation Details

### Tier 1: Real-time Metrics (Updated every 1s)

| Metric | Source | Calculation |
|--------|--------|-------------|
| **elapsedTime** | Timer | `now - startTime` |
| **movingTime** | Timer | `elapsedTime - pauseTime` |
| **distance** | GPS | Haversine distance sum |
| **avgSpeed** | Derived | `distance / movingTime` |
| **maxSpeed** | GPS | Max of all speed readings |
| **avgPower** | Sensor | `buffer.getAverage("power")` |
| **maxPower** | Sensor | Track max across all readings |
| **avgHeartRate** | Sensor | `buffer.getAverage("heartrate")` |
| **maxHeartRate** | Sensor | Track max across all readings |
| **avgCadence** | Sensor | `buffer.getAverage("cadence")` |
| **totalWork** | Power | `Σ(power * 1 second)` in Joules |
| **calories** | Power/HR | Power-based or HR-based formula |
| **totalAscent** | GPS | Sum of positive elevation changes |
| **totalDescent** | GPS | Sum of negative elevation changes |
| **hrZone[1-5]Time** | Zones | Time spent in each HR zone (seconds) |
| **powerZone[1-7]Time** | Zones | Time spent in each power zone (seconds) |

### Tier 2: Approximated Metrics (Updated every 1s)

| Metric | Formula | Notes |
|--------|---------|-------|
| **normalizedPowerEst** | `avgRecent30s * 1.05` | Simplified NP estimate |
| **intensityFactorEst** | `NP / FTP` | Requires FTP |
| **trainingStressScoreEst** | `(hours * NP * IF) / (FTP * 36)` | TSS estimate |
| **variabilityIndexEst** | `NP / avgPower` | Smoothness indicator |
| **efficiencyFactorEst** | `NP / avgHeartRate` | Power efficiency |
| **powerHeartRateRatio** | `avgPower / avgHeartRate` | Fitness indicator |

---

## 🔧 Configuration

### Simple, Tunable Settings

```typescript
// config.ts
export const RECORDING_CONFIG = {
  UPDATE_INTERVAL: 1000,         // How often to calculate & emit (1s)
  PERSISTENCE_INTERVAL: 60000,   // How often to write DB (60s)
  BUFFER_WINDOW_SECONDS: 60,     // Rolling window size (60s)
} as const;

export const MOVEMENT_THRESHOLDS = {
  SPEED_THRESHOLD_MPS: 0.5,              // Moving vs stopped
  ELEVATION_NOISE_THRESHOLD_M: 1,        // Ignore GPS noise
  DISTANCE_MIN_DELTA_M: 1,               // Minimum distance change
  GPS_ACCURACY_THRESHOLD_M: 50,          // Filter poor GPS
} as const;
```

**Tuning Guide**:
- **Faster UI updates**: Decrease `UPDATE_INTERVAL` (e.g., 500ms)
  - ⚠️ More CPU, more battery drain
- **More frequent DB writes**: Decrease `PERSISTENCE_INTERVAL` (e.g., 30s)
  - ⚠️ More I/O, less data loss risk on crash
- **Longer calculations**: Increase `BUFFER_WINDOW_SECONDS` (e.g., 120s)
  - ✅ Better averages for NP, but more memory

---

## 🚀 Performance Characteristics

### CPU Usage
- **UI Timer (1s)**: ~2-5ms per calculation cycle
- **Persistence Timer (60s)**: ~10-50ms per DB write cycle
- **Total CPU**: < 1% average during recording

### Memory Usage
- **DataBuffer**: ~100-200 KB (60s of multi-metric data)
- **DataAccumulator**: ~500KB - 2MB (60s of accumulated data)
- **Total Memory**: ~2-3 MB average (bounded by cleanup)

### Database I/O
- **Write frequency**: Every 60 seconds
- **Write size**: 50-200 readings per metric per minute
- **Total per hour**: ~60 writes (vs 720 writes in old system)

### Battery Impact
- **Estimated improvement**: 20-30% reduction in recording-related drain
- **Primary savings**: 92% fewer DB writes
- **Secondary savings**: Simpler calculations, fewer timers

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
describe('DataBuffer', () => {
  it('maintains 60-second window', () => {
    const buffer = new DataBuffer(60);
    buffer.add({ metric: 'power', value: 250, timestamp: now() });
    expect(buffer.getRecent('power', 30)).toHaveLength(1);
  });
});

describe('DataAccumulator', () => {
  it('flushes to database', async () => {
    const acc = new DataAccumulator();
    acc.add(reading);
    await acc.flushToDatabase(recordingId);
    // Verify DB write
  });
});

describe('LiveMetricsManager', () => {
  it('calculates metrics every second', () => {
    jest.useFakeTimers();
    manager.startRecording(recordingId);
    jest.advanceTimersByTime(1000);
    expect(emitSpy).toHaveBeenCalledWith('metricsUpdate', ...);
  });
});
```

### Integration Tests

```typescript
describe('Recording Flow', () => {
  it('completes full recording with persistence', async () => {
    await service.startRecording();
    
    // Simulate 90 seconds of data
    for (let i = 0; i < 90; i++) {
      await service.handleSensorData(mockReading());
      await delay(1000);
    }
    
    await service.finishRecording();
    
    // Verify DB has at least 1 chunk (60s mark)
    const streams = await db.query.activityRecordingStreams.findMany();
    expect(streams.length).toBeGreaterThan(0);
  });
});
```

---

## 📝 Migration Guide

### From Old ChunkProcessor

```typescript
// ❌ OLD WAY
const processor = new ChunkProcessor(recordingId);
processor.start();
processor.addReading(reading);
await processor.flush();
processor.stop();

// ✅ NEW WAY
// Just pass data to LiveMetricsManager
liveMetricsManager.ingestSensorData(reading);
// Persistence happens automatically every 60s
```

### From Old Batch Events

```typescript
// ❌ OLD WAY
liveMetricsManager.on('batchWriteComplete', (event) => {
  console.log('Wrote', event.totalReadings, 'readings');
});

// ✅ NEW WAY
// No batch events needed - just listen to metrics updates
liveMetricsManager.on('metricsUpdate', (event) => {
  updateUI(event.metrics);
});
```

---

## 🎓 Design Principles

1. **Simplicity First**: Two timers, two concerns
2. **Predictable Performance**: Fixed intervals, no race conditions
3. **Bounded Memory**: Regular cleanup prevents growth
4. **Battery Conscious**: Fewer writes, efficient calculations
5. **Testable**: No hidden state, clear interfaces
6. **Maintainable**: Easy to understand, modify, and debug

---

## 🔮 Future Optimizations

### Potential Improvements:
- [ ] Adaptive persistence (more frequent during high-intensity intervals)
- [ ] Compression for old data chunks
- [ ] Smart buffer sizing based on available memory
- [ ] Background thread for calculations (Web Workers)
- [ ] Incremental zone calculations (avoid full recalc every second)

### Performance Monitoring:
- [ ] Add telemetry for calculation times
- [ ] Track battery usage correlation
- [ ] Monitor memory growth patterns
- [ ] Measure DB write performance

---

## 📚 References

- [HANDOFF.md](./HANDOFF.md) - Original redesign plan
- [REFACTOR_SUMMARY.md](./REFACTOR_SUMMARY.md) - Implementation details
- [config.ts](./src/lib/services/ActivityRecorder/config.ts) - Configuration
- [LiveMetricsManager.ts](./src/lib/services/ActivityRecorder/LiveMetricsManager.ts) - Core logic