# Intensity Calculation API Documentation

**Version:** 2.0
**Date:** 2025-01-23
**Status:** Production Ready

---

## Overview

This document describes the tRPC API endpoints for the **7-zone intensity system** in GradientPeak. These endpoints provide retrospective analysis of training intensity based on actual workout data (Intensity Factor and TSS).

### Key Concepts

- **Intensity Factor (IF)**: Normalized Power ÷ FTP × 100, stored as integer 0-200 (representing 0%-200%)
- **Training Stress Score (TSS)**: Calculated from duration and IF
- **7 Intensity Zones**: Recovery, Endurance, Tempo, Threshold, VO2max, Anaerobic, Neuromuscular
- **TSS-Weighted Distribution**: Zones are weighted by TSS contribution, not workout count

---

## Endpoints

### 1. `activities.list`

**Type:** Query
**Description:** Fetch activities within a date range with intensity metrics.

#### Input Schema

```typescript
{
  date_from: string;  // ISO 8601 date string (e.g., "2025-01-01T00:00:00Z")
  date_to: string;    // ISO 8601 date string
}
```

#### Response Schema

```typescript
Array<{
  id: string;
  profile_id: string;
  name: string | null;
  activity_type: string;
  started_at: string;
  duration: number;                    // seconds
  distance: number | null;             // meters
  elevation_gain: number | null;       // meters
  intensity_factor: number | null;     // 0-200 (0%-200%)
  training_stress_score: number | null;
  normalized_power: number | null;     // watts
  average_heart_rate: number | null;
  max_heart_rate: number | null;
  average_power: number | null;
  max_power: number | null;
  // ... other activity fields
}>
```

#### Usage Example

```typescript
const activities = await trpc.activities.list.query({
  date_from: "2025-01-01T00:00:00Z",
  date_to: "2025-01-31T23:59:59Z",
});

// Display with zones
activities.forEach(activity => {
  if (activity.intensity_factor) {
    const if_value = activity.intensity_factor / 100;
    const zone = getTrainingIntensityZone(if_value);
    console.log(`${activity.name}: IF ${if_value.toFixed(2)} (${zone})`);
  }
});
```

---

### 2. `activities.update`

**Type:** Mutation
**Description:** Update an activity's calculated intensity metrics (IF, TSS, NP).

#### Input Schema

```typescript
{
  id: string;                         // Activity UUID
  intensity_factor?: number;          // 0-200 (optional)
  training_stress_score?: number;     // TSS value (optional)
  normalized_power?: number;          // Watts (optional)
}
```

#### Response Schema

Returns the updated activity object (same as `activities.list` item).

#### Usage Example

```typescript
// After processing workout data and calculating metrics
const updated = await trpc.activities.update.mutate({
  id: activityId,
  intensity_factor: 82,           // IF = 82% (0.82)
  training_stress_score: 65,
  normalized_power: 245,
});
```

#### Best Practices

- Calculate these values from activity streams after workout completion
- Use `calculateTrainingIntensityFactor()` from `@repo/core`
- Use `calculateTrainingTSS()` from `@repo/core`
- Only update activities owned by the authenticated user (enforced by RLS)

---

### 3. `training_plans.getIntensityDistribution`

**Type:** Query
**Description:** Get TSS-weighted intensity distribution across 7 zones from completed activities.

#### Input Schema

```typescript
{
  training_plan_id?: string;  // Optional - for UI context only
  start_date: string;         // ISO 8601 date string
  end_date: string;           // ISO 8601 date string
}
```

#### Response Schema

```typescript
{
  distribution: {
    recovery: number;       // Percentage (0-100)
    endurance: number;
    tempo: number;
    threshold: number;
    vo2max: number;
    anaerobic: number;
    neuromuscular: number;
  };
  totalActivities: number;
  totalTSS: number;
  activitiesWithIntensity: number;  // Activities that have IF data
  recommendations: string[];         // Training science-based suggestions
}
```

#### Zone Definitions

| Zone          | IF Range    | Description                              |
|---------------|-------------|------------------------------------------|
| Recovery      | < 0.55      | Active recovery, very easy               |
| Endurance     | 0.55-0.74   | Aerobic base building                    |
| Tempo         | 0.75-0.84   | Steady state, "gray zone"                |
| Threshold     | 0.85-0.94   | Lactate threshold training               |
| VO2max        | 0.95-1.04   | VO2max intervals                         |
| Anaerobic     | 1.05-1.14   | Anaerobic capacity                       |
| Neuromuscular | ≥ 1.15      | Sprint power, neuromuscular development  |

#### Calculation Method

1. For each activity with `intensity_factor`:
   - Convert IF to zone using `getTrainingIntensityZone()`
   - Add activity's TSS to that zone's total
2. Calculate percentage: `(zone_tss / total_tss) * 100`
3. Generate recommendations based on polarized training principles

#### Recommendations Logic

- **Polarized Training**: ~80% easy (recovery + endurance), ~20% hard
- **Easy < 70%**: Suggests adding more easy/recovery workouts
- **Easy > 90%**: Suggests adding high-intensity sessions
- **Hard > 30%**: Warns about overtraining risk
- **Tempo > 20%**: Warns about "gray zone" training limiting polarization

#### Usage Example

```typescript
const distribution = await trpc.training_plans.getIntensityDistribution.query({
  start_date: "2025-01-01T00:00:00Z",
  end_date: "2025-01-31T23:59:59Z",
});

console.log(`Recovery: ${distribution.distribution.recovery.toFixed(1)}%`);
console.log(`Endurance: ${distribution.distribution.endurance.toFixed(1)}%`);
console.log(`Recommendations: ${distribution.recommendations.join(', ')}`);
```

---

### 4. `training_plans.getIntensityTrends`

**Type:** Query
**Description:** Analyze intensity trends over time, grouped by week.

#### Input Schema

```typescript
{
  weeks_back?: number;  // Default: 12, Range: 1-52
}
```

#### Response Schema

```typescript
{
  weeks: Array<{
    weekStart: string;  // ISO date of Monday
    totalTSS: number;
    avgIF: number;      // Average IF for the week
    activities: number; // Count of activities
    zones: {
      recovery: number;       // TSS-weighted percentage
      endurance: number;
      tempo: number;
      threshold: number;
      vo2max: number;
      anaerobic: number;
      neuromuscular: number;
    };
  }>;
  totalActivities: number;
}
```

#### Usage Example

```typescript
const trends = await trpc.training_plans.getIntensityTrends.query({
  weeks_back: 8,
});

// Chart average IF over time
trends.weeks.forEach(week => {
  console.log(`Week of ${week.weekStart}: IF ${week.avgIF.toFixed(2)}, TSS ${week.totalTSS}`);
});

// Detect training load progression
const recentWeeks = trends.weeks.slice(-4);
const avgRecentTSS = recentWeeks.reduce((sum, w) => sum + w.totalTSS, 0) / 4;
console.log(`Recent 4-week avg TSS: ${avgRecentTSS.toFixed(0)}`);
```

#### Visualization Ideas

- Line chart: Average IF by week
- Stacked bar chart: TSS by zone per week
- Total TSS progression over time
- Zone distribution heat map

---

### 5. `training_plans.checkHardWorkoutSpacing`

**Type:** Query
**Description:** Identify hard workouts (IF ≥ 0.85) that are too close together.

#### Input Schema

```typescript
{
  start_date: string;       // ISO 8601 date string
  end_date: string;         // ISO 8601 date string
  min_hours?: number;       // Default: 48, Range: 24-168
}
```

#### Response Schema

```typescript
{
  violations: Array<{
    workout1: {
      id: string;
      name: string;
      started_at: string;
      intensity_factor: number;
    };
    workout2: {
      id: string;
      name: string;
      started_at: string;
      intensity_factor: number;
    };
    hoursBetween: number;
  }>;
  hardWorkoutCount: number;
  hasViolations: boolean;
}
```

#### Usage Example

```typescript
const spacing = await trpc.training_plans.checkHardWorkoutSpacing.query({
  start_date: "2025-01-01T00:00:00Z",
  end_date: "2025-01-31T23:59:59Z",
  min_hours: 48,
});

if (spacing.hasViolations) {
  console.log(`⚠️ Found ${spacing.violations.length} spacing violations:`);
  spacing.violations.forEach(v => {
    console.log(`${v.workout1.name} → ${v.workout2.name}: ${v.hoursBetween}h apart`);
  });
} else {
  console.log(`✅ Good recovery spacing between hard workouts`);
}
```

#### Use Cases

- **Retrospective Analysis**: Review past training for recovery issues
- **Training Insights**: Understand if insufficient recovery contributed to fatigue
- **Coaching Tool**: Identify patterns in successful vs. unsuccessful training blocks
- **Education**: Help users learn proper hard workout spacing

---

## Integration Guide

### Step 1: Calculate IF After Workout

When a user completes an activity:

```typescript
import {
  calculateTrainingIntensityFactor,
  calculateTrainingTSS
} from "@repo/core";

// 1. Calculate Normalized Power from power stream
const normalizedPower = calculateNormalizedPower(powerStream);

// 2. Get user's FTP from profile
const ftp = user.functional_threshold_power;

// 3. Calculate IF (as decimal, e.g., 0.82)
const intensityFactor = calculateTrainingIntensityFactor(normalizedPower, ftp);

// 4. Calculate TSS
const tss = calculateTrainingTSS(activity.duration, intensityFactor);

// 5. Store as percentage (0-200)
const ifPercent = Math.round(intensityFactor * 100);  // 0.82 → 82
const tssInt = Math.round(tss);

// 6. Update activity
await trpc.activities.update.mutate({
  id: activity.id,
  intensity_factor: ifPercent,  // Stored as percentage
  training_stress_score: tssInt,
  normalized_power: Math.round(normalizedPower),
});
```

### Step 2: Display Zone in UI

```typescript
import { getTrainingIntensityZone } from "@repo/core";

function ActivityCard({ activity }) {
  if (!activity.intensity_factor) {
    return <Text>No intensity data</Text>;
  }

  const ifValue = activity.intensity_factor / 100;
  const zone = getTrainingIntensityZone(ifValue);

  // Map zone to display properties
  const zoneConfig = {
    recovery: { label: "Recovery", color: "#10b981" },
    endurance: { label: "Endurance", color: "#3b82f6" },
    tempo: { label: "Tempo", color: "#f59e0b" },
    threshold: { label: "Threshold", color: "#ef4444" },
    vo2max: { label: "VO2max", color: "#dc2626" },
    anaerobic: { label: "Anaerobic", color: "#991b1b" },
    neuromuscular: { label: "Neuromuscular", color: "#7c2d12" },
  };

  const config = zoneConfig[zone];

  return (
    <View>
      <Text>{activity.name}</Text>
      <Text>IF: {ifValue.toFixed(2)}</Text>
      <Badge color={config.color}>{config.label}</Badge>
      <Text>TSS: {activity.training_stress_score}</Text>
    </View>
  );
}
```

### Step 3: Show Intensity Distribution

```typescript
function IntensityDistributionChart({ startDate, endDate }) {
  const { data, isLoading } = trpc.training_plans.getIntensityDistribution.useQuery({
    start_date: startDate,
    end_date: endDate,
  });

  if (isLoading) return <Spinner />;

  const zones = [
    { key: "recovery", label: "Recovery", color: "#10b981" },
    { key: "endurance", label: "Endurance", color: "#3b82f6" },
    { key: "tempo", label: "Tempo", color: "#f59e0b" },
    { key: "threshold", label: "Threshold", color: "#ef4444" },
    { key: "vo2max", label: "VO2max", color: "#dc2626" },
    { key: "anaerobic", label: "Anaerobic", color: "#991b1b" },
    { key: "neuromuscular", label: "Neuromuscular", color: "#7c2d12" },
  ];

  return (
    <View>
      <Text>Intensity Distribution ({data.totalActivities} workouts)</Text>

      {/* Stacked bar chart */}
      <StackedBar>
        {zones.map(zone => (
          <BarSegment
            key={zone.key}
            width={`${data.distribution[zone.key]}%`}
            color={zone.color}
          />
        ))}
      </StackedBar>

      {/* Legend */}
      {zones.map(zone => (
        <View key={zone.key}>
          <ColorDot color={zone.color} />
          <Text>{zone.label}: {data.distribution[zone.key].toFixed(1)}%</Text>
        </View>
      ))}

      {/* Recommendations */}
      <View>
        <Text>Recommendations:</Text>
        {data.recommendations.map((rec, i) => (
          <Text key={i}>• {rec}</Text>
        ))}
      </View>
    </View>
  );
}
```

### Step 4: Show Intensity Trends

```typescript
function IntensityTrendsChart() {
  const { data } = trpc.training_plans.getIntensityTrends.useQuery({
    weeks_back: 12,
  });

  return (
    <LineChart
      data={data?.weeks || []}
      xKey="weekStart"
      yKey="avgIF"
      label="Average Intensity Factor by Week"
    />
  );
}
```

---

## Error Handling

All endpoints use tRPC error handling:

```typescript
try {
  const result = await trpc.training_plans.getIntensityDistribution.query({
    start_date: startDate,
    end_date: endDate,
  });
} catch (error) {
  if (error.code === "UNAUTHORIZED") {
    // User not authenticated
  } else if (error.code === "NOT_FOUND") {
    // Resource not found
  } else if (error.code === "INTERNAL_SERVER_ERROR") {
    // Database or server error
  }
}
```

---

## Performance Considerations

### Query Optimization

- **Date Range**: Limit queries to reasonable date ranges (< 1 year)
- **Caching**: Use tRPC's built-in caching for frequently accessed data
- **Indexing**: Ensure `started_at` and `profile_id` are indexed in database

### Data Volume

- Activities table can grow large over time
- Consider pagination for `activities.list` if returning > 100 activities
- Use date range filtering to limit result sets

---

## Testing

### Unit Tests

```typescript
describe("getIntensityDistribution", () => {
  it("calculates 7-zone distribution correctly", async () => {
    const result = await caller.training_plans.getIntensityDistribution({
      start_date: "2025-01-01T00:00:00Z",
      end_date: "2025-01-31T23:59:59Z",
    });

    expect(result.distribution.recovery).toBeGreaterThanOrEqual(0);
    expect(result.distribution.recovery).toBeLessThanOrEqual(100);

    const total = Object.values(result.distribution).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("handles no activities gracefully", async () => {
    const result = await caller.training_plans.getIntensityDistribution({
      start_date: "2030-01-01T00:00:00Z",
      end_date: "2030-01-31T23:59:59Z",
    });

    expect(result.totalActivities).toBe(0);
    expect(result.recommendations).toContain("No completed activities");
  });
});
```

---

## Migration Notes

### From Old 5-Zone System

If you previously used a 5-zone system:

**Old Zones:**
- Recovery
- Easy
- Moderate
- Hard
- Race

**New 7-Zone Mapping:**
- Recovery → Recovery (< 55%)
- Easy → Endurance (55-74%)
- Moderate → Tempo (75-84%) + Threshold (85-94%)
- Hard → VO2max (95-104%)
- Race → Anaerobic (105-114%) + Neuromuscular (≥ 115%)

**Note:** IF is stored as percentage (0-200 range), so 82 = 82% = 0.82 IF

### Data Migration

No database migration needed:
- Old `intensity` fields (if any) can be ignored
- New system only uses `intensity_factor` and `training_stress_score`
- Existing activities without IF will be excluded from analysis

---

## References

- **Training Peaks TSS**: https://www.trainingpeaks.com/blog/what-is-tss/
- **Intensity Factor**: https://www.trainingpeaks.com/blog/normalized-power-intensity-factor-training-stress/
- **Polarized Training**: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6683776/
- **Core Calculations**: `packages/core/calculations.ts`
- **Zone Documentation**: `apps/mobile/docs/INTENSITY_CALCULATION.md`

---

## Support

For questions or issues:
1. Check `INTENSITY_CALCULATION.md` for architecture overview
2. Review `INTENSITY_REFACTOR_TODO.md` for implementation status
3. See code examples in `packages/trpc/src/routers/training_plans.ts`
