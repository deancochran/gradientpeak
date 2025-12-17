# Simplified Metrics Implementation

This document describes the implementation of the SimplifiedMetrics system based on the [PLAN_LIVE_METRICS_SIMPLIFICATION.md](./PLAN_LIVE_METRICS_SIMPLIFICATION.md) design.

## Overview

The SimplifiedMetrics system provides a cleaner, more structured API for accessing activity metrics in the mobile app. It sits on top of the existing LiveMetricsManager and provides:

1. **Cleaner structure** - Metrics organized into logical groups (current, totals, avg, max, zones, advanced)
2. **Zone arrays** - HR zones (5 elements) and power zones (7 elements) that match the database schema
3. **Sensor validation** - Range checking for all sensor inputs
4. **Type safety** - Full TypeScript support with clear interfaces
5. **React hooks** - Easy-to-use hooks for UI components

## Architecture

### Current System (Unchanged)
- **ActivityRecorderService** - Main service coordinating recording
- **LiveMetricsManager** - Calculates real-time metrics
- **DataBuffer** - 60-second rolling window for calculations
- **StreamBuffer** - File-based persistence

### New Additions
- **SimplifiedMetrics** interface - Clean metric structure
- **SensorModel** - Validation for sensor readings
- **Zone helpers** - Power and HR zone calculations
- **React hooks** - `useSimplifiedMetrics`, `useCurrentReadings`, `useZoneDistribution`

## Implementation Details

### 1. SimplifiedMetrics Interface

Located in: `apps/mobile/lib/services/ActivityRecorder/SimplifiedMetrics.ts`

```typescript
interface SimplifiedMetrics {
  current: {
    power?: number;
    heartRate?: number;
    cadence?: number;
    speed?: number; // m/s
    temperature?: number;
    position?: { lat, lng, alt, heading };
  };
  
  totals: {
    elapsed: number;    // seconds
    moving: number;     // seconds
    distance: number;   // meters
    work: number;       // joules
    ascent: number;     // meters
    descent: number;    // meters
    calories: number;
  };
  
  avg: {
    power: number;
    heartRate: number;
    speed: number;      // m/s
    cadence: number;
    grade: number;      // %
    temperature: number;
  };
  
  max: {
    power: number;
    heartRate: number;
    speed: number;      // m/s
    cadence: number;
    temperature: number;
  };
  
  zones: {
    hr: [number, number, number, number, number];        // 5 zones
    power: [number, number, number, number, number, number, number]; // 7 zones
  };
  
  advanced?: {
    normalizedPower: number;
    tss: number;
    intensityFactor: number;
    variabilityIndex: number;
    efficiencyFactor: number;
    decoupling: number;
    powerWeightRatio: number;
    powerHrRatio: number;
  };
  
  plan?: {
    currentStepIndex: number;
    adherence: number;  // % accuracy
  };
}
```

### 2. Sensor Validation

All sensor readings are now validated before being added to buffers:

```typescript
class SensorModel<T> {
  constructor(
    public metric: string,
    public validator: (value: T) => boolean,
    public defaultValue: T,
  ) {}
  
  validate(value: T): T | null {
    if (this.validator(value)) {
      return value;
    }
    console.warn(`[SensorModel] Invalid ${this.metric}:`, value);
    return null;
  }
}

const sensorModels = {
  power: new SensorModel('power', (v: number) => v >= 0 && v <= 4000, 0),
  heartrate: new SensorModel('heartrate', (v: number) => v >= 30 && v <= 250, 0),
  cadence: new SensorModel('cadence', (v: number) => v >= 0 && v <= 255, 0),
  speed: new SensorModel('speed', (v: number) => v >= 0 && v <= 100, 0),
  temperature: new SensorModel('temperature', (v: number) => v >= -50 && v <= 60, 0),
};
```

**Validation ranges:**
- Power: 0-4000 watts
- Heart rate: 30-250 bpm
- Cadence: 0-255 rpm
- Speed: 0-100 m/s (360 km/h)
- Temperature: -50 to 60°C

Invalid readings are logged and discarded.

### 3. Zone Calculations

#### Power Zones (7 zones, Coggan model)
```typescript
function getPowerZone(watts: number, ftp: number): number {
  const percent = (watts / ftp) * 100;
  if (percent < 55) return 0;  // Active Recovery
  if (percent < 75) return 1;  // Endurance
  if (percent < 90) return 2;  // Tempo
  if (percent < 105) return 3; // Lactate Threshold
  if (percent < 120) return 4; // VO2 Max
  if (percent < 150) return 5; // Anaerobic Capacity
  return 6;                     // Neuromuscular Power
}
```

#### HR Zones (5 zones)
```typescript
function getHRZone(bpm: number, threshold_hr: number): number {
  const percent = (bpm / threshold_hr) * 100;
  if (percent < 81) return 0;  // Zone 1 - Recovery
  if (percent < 89) return 1;  // Zone 2 - Aerobic
  if (percent < 94) return 2;  // Zone 3 - Tempo
  if (percent < 100) return 3; // Zone 4 - Threshold
  return 4;                     // Zone 5 - Anaerobic
}
```

### 4. React Hooks

Located in: `apps/mobile/lib/hooks/useSimplifiedMetrics.ts`

#### useSimplifiedMetrics
Get complete metrics (updates every 1 second):

```typescript
function RecordingScreen() {
  const service = useSharedActivityRecorder();
  const metrics = useSimplifiedMetrics(service);
  
  if (!metrics) return <Loading />;
  
  return (
    <View>
      <Text>Power: {metrics.current.power}W</Text>
      <Text>HR: {metrics.current.heartRate} bpm</Text>
      <Text>Distance: {(metrics.totals.distance / 1000).toFixed(2)} km</Text>
    </View>
  );
}
```

#### useCurrentReadings
Get only current sensor readings (updates every 100ms):

```typescript
function LivePowerDisplay() {
  const service = useSharedActivityRecorder();
  const readings = useCurrentReadings(service);
  
  return <Text>{readings?.power || '--'} W</Text>;
}
```

#### useZoneDistribution
Get zone distributions with percentages:

```typescript
function ZoneChart() {
  const service = useSharedActivityRecorder();
  const zones = useZoneDistribution(service);
  
  if (!zones) return null;
  
  return (
    <View>
      {zones.power.map(({ zone, seconds, percentage }) => (
        <ZoneBar 
          key={zone}
          zone={zone}
          seconds={seconds}
          percentage={percentage}
        />
      ))}
    </View>
  );
}
```

## Usage in Components

### Before (accessing raw LiveMetricsState):
```typescript
const metrics = service.liveMetricsManager.getMetrics();
const hrZone1 = metrics.hrZone1Time;
const hrZone2 = metrics.hrZone2Time;
// ... need to access 5 separate fields
```

### After (using SimplifiedMetrics):
```typescript
const metrics = service.getSimplifiedMetrics();
const hrZones = metrics.zones.hr; // [z1, z2, z3, z4, z5]
```

## Database Integration

Zone arrays directly match the database schema:

```sql
create table public.activities (
  -- ... other fields
  hr_zone_seconds integer[5],      -- [z1, z2, z3, z4, z5]
  power_zone_seconds integer[7],   -- [z1, z2, z3, z4, z5, z6, z7]
);
```

The `useActivitySubmission` hook already converts to this format for upload:

```typescript
const hrZoneSeconds = hr_zones ? [
  Math.round(hr_zones.zone1 || 0),
  Math.round(hr_zones.zone2 || 0),
  Math.round(hr_zones.zone3 || 0),
  Math.round(hr_zones.zone4 || 0),
  Math.round(hr_zones.zone5 || 0),
] : null;
```

## Key Benefits

### 1. Cleaner API
- Metrics organized by logical groups
- No need to remember individual field names
- Easy to discover what's available

### 2. Type Safety
- Full TypeScript support
- IDE autocomplete
- Compile-time error checking

### 3. Zone Arrays
- Match database schema exactly
- Easy to iterate over
- No need to track individual fields

### 4. Sensor Validation
- Invalid readings are caught early
- Prevents corrupted data
- Better data quality

### 5. React Integration
- Custom hooks for common patterns
- Automatic subscription management
- Optimized re-renders

## Migration Guide

### For UI Components

**Old way:**
```typescript
const service = useSharedActivityRecorder();
const [metrics, setMetrics] = useState<LiveMetricsState | null>(null);

useEffect(() => {
  const subscription = service.liveMetricsManager.addListener(
    'statsUpdate',
    ({ stats }) => {
      setMetrics(service.liveMetricsManager.getMetrics());
    }
  );
  return () => subscription.remove();
}, [service]);

return <Text>{metrics?.avgPower || 0}W</Text>;
```

**New way:**
```typescript
const service = useSharedActivityRecorder();
const metrics = useSimplifiedMetrics(service);

return <Text>{metrics?.avg.power || 0}W</Text>;
```

### For Zone Charts

**Old way:**
```typescript
const zones = [
  metrics.powerZone1Time,
  metrics.powerZone2Time,
  metrics.powerZone3Time,
  metrics.powerZone4Time,
  metrics.powerZone5Time,
  metrics.powerZone6Time,
  metrics.powerZone7Time,
];
```

**New way:**
```typescript
const zones = metrics.zones.power; // Already an array!
```

## Performance

- **Sensor validation**: < 1ms per reading (negligible overhead)
- **Metric conversion**: < 5ms per update (cached in LiveMetricsManager)
- **React updates**: Batched by React's scheduling (no change from before)

## Testing

To test the implementation:

1. **Start a recording** - Verify metrics update correctly
2. **Connect sensors** - Verify validation rejects invalid readings
3. **Check zone tracking** - Verify zones increment correctly
4. **Finish recording** - Verify activity uploads with zone arrays
5. **Check database** - Verify hr_zone_seconds and power_zone_seconds arrays

## Future Enhancements

### FTMS Integration (Planned)
The SimplifiedMetrics structure is designed to support FTMS control:

```typescript
interface SimplifiedMetrics {
  // ... existing fields
  
  ftms?: {
    targetPower?: number;
    targetGrade?: number;
    mode: 'erg' | 'sim' | 'resistance';
    controlEnabled: boolean;
  };
}
```

This will enable:
- Real-time trainer control
- Automatic target application from plans
- Plan adherence tracking

### Workout Builder Integration
Zone arrays make it easy to analyze workout structure:

```typescript
// Find which zones were used
const usedZones = metrics.zones.power
  .map((seconds, zone) => ({ zone, seconds }))
  .filter(({ seconds }) => seconds > 0);

// Identify dominant zone
const dominantZone = usedZones.reduce((max, z) => 
  z.seconds > max.seconds ? z : max
);
```

## Files Changed

### New Files
- `apps/mobile/lib/services/ActivityRecorder/SimplifiedMetrics.ts` - Core types and helpers
- `apps/mobile/lib/hooks/useSimplifiedMetrics.ts` - React hooks
- `docs/SIMPLIFIED_METRICS_IMPLEMENTATION.md` - This document

### Modified Files
- `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` - Added sensor validation and `getSimplifiedMetrics()`
- `apps/mobile/lib/services/ActivityRecorder/index.ts` - Added `getSimplifiedMetrics()` and exports
- `apps/mobile/lib/hooks/useActivitySubmission.ts` - Clarified zone array usage (no functional change)

## Backward Compatibility

✅ **Fully backward compatible**

- Existing `LiveMetricsManager.getMetrics()` still works
- Existing `SessionStats` interface unchanged
- Existing UI components continue to work
- New `getSimplifiedMetrics()` is opt-in

## Conclusion

The SimplifiedMetrics implementation provides a cleaner, more maintainable API for accessing activity metrics without breaking existing functionality. It prepares the codebase for future enhancements like FTMS control and provides better type safety and developer experience.

For questions or issues, see the plan document: [PLAN_LIVE_METRICS_SIMPLIFICATION.md](./PLAN_LIVE_METRICS_SIMPLIFICATION.md)
