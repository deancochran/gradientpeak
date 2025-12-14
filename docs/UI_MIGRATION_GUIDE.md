# UI Components Migration Guide

## Overview

The mobile app UI components are **already using zone arrays correctly** through the existing `useCurrentReadings` and `useSessionStats` hooks. No migration is required for the core functionality.

However, we've added a new **optional** `useSimplifiedMetrics` hook that provides an even cleaner API for components that want it.

## Current Implementation Status

### ✅ Already Working Correctly

The existing UI components are well-structured and use zone arrays:

**Components:**
- `DashboardCard.tsx` - Uses `useCurrentReadings` + `useSessionStats`
- `PowerCard.tsx` - Accesses `stats.powerZones[0-6]` (7 zones) ✅
- `HeartRateCard.tsx` - Accesses `stats.hrZones[0-4]` (5 zones) ✅
- `ElevationCard.tsx` - Uses elevation metrics
- `EnhancedPlanCard.tsx` - Uses plan-specific data

**Example from PowerCard.tsx:**
```typescript
const zones = {
  z1: stats.powerZones[0],
  z2: stats.powerZones[1],
  z3: stats.powerZones[2],
  z4: stats.powerZones[3],
  z5: stats.powerZones[4],
  z6: stats.powerZones[5],
  z7: stats.powerZones[6],
};
```

This is **correct** and matches the database schema perfectly.

## Optional Migration to SimplifiedMetrics

If you want to use the new `useSimplifiedMetrics` hook for cleaner code, here's how:

### Option 1: Keep Current Approach (Recommended)

The current approach works well and requires no changes:

```typescript
import { useCurrentReadings, useSessionStats } from "@/lib/hooks/useActivityRecorder";

export const MyCard = ({ service }) => {
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);
  
  return (
    <View>
      <Text>{current.power ?? "--"}</Text>
      <Text>{stats.avgPower}</Text>
      <Text>{stats.distance / 1000} km</Text>
      <ZoneChart zones={stats.powerZones} />
    </View>
  );
};
```

**Pros:**
- Already implemented and tested
- Two hooks with clear separation of concerns
- Type-safe with existing types

### Option 2: Migrate to SimplifiedMetrics (Optional)

Use the new hook for a more organized structure:

```typescript
import { useSimplifiedMetrics } from "@/lib/hooks/useSimplifiedMetrics";

export const MyCard = ({ service }) => {
  const metrics = useSimplifiedMetrics(service);
  
  if (!metrics) return <Loading />;
  
  return (
    <View>
      <Text>{metrics.current.power ?? "--"}</Text>
      <Text>{metrics.avg.power}</Text>
      <Text>{metrics.totals.distance / 1000} km</Text>
      <ZoneChart zones={metrics.zones.power} />
    </View>
  );
};
```

**Pros:**
- Single hook call
- More organized structure (current, totals, avg, max, zones, advanced)
- Easy to check for advanced metrics: `if (metrics.advanced) { ... }`
- Zone arrays directly available: `metrics.zones.power`, `metrics.zones.hr`

## Migration Steps (If Desired)

### Step 1: Update Imports

**Before:**
```typescript
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";
```

**After:**
```typescript
import { useSimplifiedMetrics } from "@/lib/hooks/useSimplifiedMetrics";
```

### Step 2: Replace Hook Calls

**Before:**
```typescript
const current = useCurrentReadings(service);
const stats = useSessionStats(service);
```

**After:**
```typescript
const metrics = useSimplifiedMetrics(service);
```

### Step 3: Update Metric Access

| Old Approach | New Approach | Notes |
|-------------|--------------|-------|
| `current.power` | `metrics.current.power` | Current sensor readings |
| `current.heartRate` | `metrics.current.heartRate` | Current HR |
| `stats.duration` | `metrics.totals.elapsed` | Elapsed time (seconds) |
| `stats.distance` | `metrics.totals.distance` | Distance (meters) |
| `stats.calories` | `metrics.totals.calories` | Calories burned |
| `stats.avgPower` | `metrics.avg.power` | Average power |
| `stats.maxPower` | `metrics.max.power` | Maximum power |
| `stats.powerZones` | `metrics.zones.power` | Power zone array (7 zones) |
| `stats.hrZones` | `metrics.zones.hr` | HR zone array (5 zones) |
| `stats.normalizedPower` | `metrics.advanced?.normalizedPower` | Optional advanced metrics |

### Step 4: Handle Loading State

The new hook returns `null` when metrics aren't available:

```typescript
const metrics = useSimplifiedMetrics(service);

if (!metrics) {
  return <Text>Loading...</Text>;
}

// Use metrics safely
return <Text>{metrics.current.power}</Text>;
```

## Component-by-Component Examples

### DashboardCard Migration

**Before (Current - Works Fine):**
```typescript
const current = useCurrentReadings(service);
const stats = useSessionStats(service);

<Text>{current.power ?? "--"}</Text>
<Text>{stats.distance / 1000}</Text>
<Text>{stats.calories}</Text>
```

**After (Optional):**
```typescript
const metrics = useSimplifiedMetrics(service);

if (!metrics) return <Loading />;

<Text>{metrics.current.power ?? "--"}</Text>
<Text>{metrics.totals.distance / 1000}</Text>
<Text>{metrics.totals.calories}</Text>
```

### PowerCard Migration

**Before (Current - Works Fine):**
```typescript
const current = useCurrentReadings(service);
const stats = useSessionStats(service);

const zones = {
  z1: stats.powerZones[0],
  z2: stats.powerZones[1],
  // ... etc
};

<Text>{current.power ?? "--"}</Text>
<Text>{stats.avgPower}</Text>
<ZoneChart zones={zones} maxZones={7} />
```

**After (Optional):**
```typescript
const metrics = useSimplifiedMetrics(service);

if (!metrics) return <Loading />;

// No need to manually build zones object!
const zones = {
  z1: metrics.zones.power[0],
  z2: metrics.zones.power[1],
  // ... etc
};

<Text>{metrics.current.power ?? "--"}</Text>
<Text>{metrics.avg.power}</Text>
<ZoneChart zones={zones} maxZones={7} />

// Or even better, pass the array directly if ZoneChart supports it:
<ZoneChart zones={metrics.zones.power} maxZones={7} />
```

### HeartRateCard Migration

**Before (Current - Works Fine):**
```typescript
const current = useCurrentReadings(service);
const stats = useSessionStats(service);

const zones = {
  z1: stats.hrZones[0],
  z2: stats.hrZones[1],
  // ... etc
};

<Text>{current.heartRate ?? "--"}</Text>
<Text>{stats.avgHeartRate}</Text>
<ZoneChart zones={zones} maxZones={5} />
```

**After (Optional):**
```typescript
const metrics = useSimplifiedMetrics(service);

if (!metrics) return <Loading />;

const zones = {
  z1: metrics.zones.hr[0],
  z2: metrics.zones.hr[1],
  // ... etc
};

<Text>{metrics.current.heartRate ?? "--"}</Text>
<Text>{metrics.avg.heartRate}</Text>
<ZoneChart zones={zones} maxZones={5} />
```

## Advanced Features

### Conditional Advanced Metrics

The new hook makes it easy to show advanced metrics only when available:

```typescript
const metrics = useSimplifiedMetrics(service);

if (!metrics) return <Loading />;

return (
  <View>
    {/* Always available */}
    <Text>Power: {metrics.avg.power}W</Text>
    
    {/* Only show if advanced metrics are calculated */}
    {metrics.advanced && (
      <View>
        <Text>NP: {metrics.advanced.normalizedPower}W</Text>
        <Text>TSS: {metrics.advanced.tss}</Text>
        <Text>IF: {metrics.advanced.intensityFactor.toFixed(2)}</Text>
        <Text>VI: {metrics.advanced.variabilityIndex.toFixed(2)}</Text>
      </View>
    )}
  </View>
);
```

### Plan Adherence Display

```typescript
const metrics = useSimplifiedMetrics(service);

if (!metrics) return <Loading />;

return (
  <View>
    {metrics.plan && (
      <View>
        <Text>Step {metrics.plan.currentStepIndex + 1}</Text>
        <Text>Adherence: {metrics.plan.adherence}%</Text>
      </View>
    )}
  </View>
);
```

### Zone Distribution with useZoneDistribution

For zone charts with percentages:

```typescript
import { useZoneDistribution } from "@/lib/hooks/useSimplifiedMetrics";

const zoneData = useZoneDistribution(service);

if (!zoneData) return null;

return (
  <View>
    {zoneData.power.map(({ zone, seconds, percentage }) => (
      <ZoneBar
        key={zone}
        zone={zone}
        seconds={seconds}
        percentage={percentage}
        label={POWER_ZONE_NAMES[zone]}
      />
    ))}
  </View>
);
```

## Performance Considerations

Both approaches have identical performance:

- **Current approach**: Two hooks, two subscriptions (sensor updates + stats updates)
- **New approach**: One hook, same two subscriptions internally

The `useSimplifiedMetrics` hook is just a convenience wrapper that calls the same underlying LiveMetricsManager methods.

**Update Frequencies:**
- Current sensor readings: 10Hz (100ms batched updates)
- Session stats: 1Hz (1 second updates)
- Simplified metrics: Same as above

## Recommendation

### For Existing Components
**Keep the current implementation** - it works well and there's no need to change working code.

### For New Components
**Use `useSimplifiedMetrics`** if you want:
- Cleaner single-hook API
- More organized metric structure
- Easy access to advanced metrics
- Simpler zone array access

### Migration Priority
Components don't need migration unless you're already making changes to them. When updating a component for other reasons, consider using the new hook for cleaner code.

## Testing After Migration

If you do migrate a component:

1. **Start a recording** - Verify metrics display correctly
2. **Check all metrics** - Power, HR, cadence, speed, distance, etc.
3. **Verify zones** - Zone charts should display correctly
4. **Check advanced metrics** - Should appear after 5+ minutes
5. **Test plan adherence** - Should display when following a plan

## Rollback Plan

If you migrate and encounter issues, rolling back is simple:

```typescript
// Remove new import
- import { useSimplifiedMetrics } from "@/lib/hooks/useSimplifiedMetrics";

// Restore old imports
+ import {
+   useCurrentReadings,
+   useSessionStats,
+ } from "@/lib/hooks/useActivityRecorder";

// Replace hook call
- const metrics = useSimplifiedMetrics(service);
+ const current = useCurrentReadings(service);
+ const stats = useSessionStats(service);

// Update metric access (reverse the changes from Step 3)
```

## Files Reference

### New Files
- `/apps/mobile/lib/hooks/useSimplifiedMetrics.ts` - New hook
- `/apps/mobile/lib/services/ActivityRecorder/SimplifiedMetrics.ts` - Types and helpers
- `/apps/mobile/components/RecordingCarousel/cards/DashboardCardSimplified.example.tsx` - Example implementation

### Existing Files (No Changes Required)
- `/apps/mobile/lib/hooks/useActivityRecorder.ts` - Existing hooks (still work)
- `/apps/mobile/components/RecordingCarousel/cards/DashboardCard.tsx` - Working correctly
- `/apps/mobile/components/RecordingCarousel/cards/PowerCard.tsx` - Working correctly
- `/apps/mobile/components/RecordingCarousel/cards/HeartRateCard.tsx` - Working correctly

## Conclusion

**The UI components are already implemented correctly** with zone arrays and require no migration. The new `useSimplifiedMetrics` hook is an **optional enhancement** that provides a cleaner API for future components or component updates.

Choose the approach that works best for your use case:
- **Current approach**: Proven, tested, works great
- **New approach**: Cleaner, more organized, easier to work with

Both approaches are fully supported and have identical performance characteristics.
