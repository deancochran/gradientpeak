# Phase 3: Mobile Integration Guide

**Version:** 1.0  
**Date:** 2025-01-23  
**Status:** Ready to Implement  
**Priority:** High

---

## Overview

Phase 3 integrates the new 7-zone intensity backend endpoints with the mobile app. This guide provides step-by-step instructions for implementing the activity completion pipeline and updating the UI to display real intensity data.

---

## Goals

1. ✅ Calculate IF/TSS when activities are completed
2. ✅ Display intensity zones on completed activities
3. ✅ Show real intensity distribution in trends screen
4. ✅ Add recovery insights (hard workout spacing)
5. ✅ Handle edge cases (no power data, no FTP, etc.)

---

## Implementation Tasks

### Task 1: Activity Completion Hook

**File:** `apps/mobile/src/hooks/useCompleteActivity.ts`  
**Priority:** Critical  
**Estimated Time:** 2 hours

Create a new hook to handle activity completion and IF calculation:

```typescript
import { trpc } from "@/lib/trpc";
import {
  calculateTrainingIntensityFactor,
  calculateTrainingTSS,
  calculateNormalizedPower,
} from "@repo/core";
import { decompressActivityStream } from "@/utils/compression";

export function useCompleteActivity() {
  const updateActivity = trpc.activities.update.useMutation();
  const getActivity = trpc.activities.getActivityWithStreams.useQuery;

  const completeActivity = async (activityId: string) => {
    try {
      // 1. Fetch activity with streams
      const activity = await getActivity({ id: activityId });

      if (!activity) {
        console.error("Activity not found:", activityId);
        return { success: false, error: "Activity not found" };
      }

      // 2. Find power stream
      const powerStream = activity.activity_streams?.find(
        (s) => s.type === "power"
      );

      if (!powerStream) {
        console.log("No power data for activity:", activityId);
        return { success: true, warning: "No power data" };
      }

      // 3. Decompress power values
      const powerValues = decompressActivityStream(
        powerStream.compressed_values,
        powerStream.data_type
      );

      // 4. Calculate Normalized Power (30-second rolling average)
      const normalizedPower = calculateNormalizedPower(powerValues);

      // 5. Get user's FTP from profile
      const profile = await trpc.profiles.getCurrent.query();
      const ftp = profile?.functional_threshold_power;

      if (!ftp || ftp === 0) {
        console.warn("No FTP set for user");
        return { success: true, warning: "No FTP set" };
      }

      // 6. Calculate Intensity Factor
      const intensityFactor = calculateTrainingIntensityFactor(
        normalizedPower,
        ftp
      );

      // 7. Calculate TSS
      const tss = calculateTrainingTSS(activity.duration, intensityFactor);

      // 8. Update activity with calculated metrics
      await updateActivity.mutateAsync({
        id: activityId,
        intensity_factor: Math.round(intensityFactor * 100), // 0.82 → 82 (stored as percentage)
        training_stress_score: Math.round(tss),
        normalized_power: Math.round(normalizedPower),
      });

      console.log("Activity completed:", {
        id: activityId,
        if: intensityFactor,
        tss,
        np: normalizedPower,
      });

      return {
        success: true,
        metrics: {
          intensityFactor,
          tss,
          normalizedPower,
        },
      };
    } catch (error) {
      console.error("Error completing activity:", error);
      return { success: false, error: error.message };
    }
  };

  return {
    completeActivity,
    isLoading: updateActivity.isLoading,
  };
}
```

**Testing:**
```typescript
// __tests__/useCompleteActivity.test.ts
describe("useCompleteActivity", () => {
  it("calculates IF and TSS correctly", async () => {
    const result = await completeActivity(mockActivityId);
    expect(result.success).toBe(true);
    expect(result.metrics.intensityFactor).toBeGreaterThan(0);
  });

  it("handles missing power data gracefully", async () => {
    const result = await completeActivity(noPowerActivityId);
    expect(result.success).toBe(true);
    expect(result.warning).toBe("No power data");
  });
});
```

---

### Task 2: Update RecordingScreen

**File:** `apps/mobile/src/app/(tabs)/record.tsx`  
**Priority:** Critical  
**Estimated Time:** 1 hour

Trigger IF calculation when user finishes recording:

```typescript
import { useCompleteActivity } from "@/hooks/useCompleteActivity";

export default function RecordingScreen() {
  const { completeActivity } = useCompleteActivity();

  const handleFinishRecording = async () => {
    try {
      // 1. Stop recording and save activity
      const activity = await stopRecording();
      
      // 2. Navigate to summary
      router.push(`/activities/${activity.id}`);

      // 3. Calculate IF in background
      const result = await completeActivity(activity.id);

      if (result.success && result.metrics) {
        // Show success toast
        showToast({
          type: "success",
          message: `Activity saved • IF: ${(result.metrics.intensityFactor * 100).toFixed(0)}%`,
        });
      } else if (result.warning) {
        // Show warning toast
        showToast({
          type: "info",
          message: `Activity saved • ${result.warning}`,
        });
      }
    } catch (error) {
      console.error("Error finishing recording:", error);
      showToast({
        type: "error",
        message: "Failed to save activity",
      });
    }
  };

  return (
    <View>
      {/* Recording UI */}
      <Button onPress={handleFinishRecording}>Finish</Button>
    </View>
  );
}
```

---

### Task 3: Display Intensity Zone on Activities

**File:** `apps/mobile/src/components/ActivityCard.tsx`  
**Priority:** High  
**Estimated Time:** 1.5 hours

Update activity cards to show intensity zone:

```typescript
import { getTrainingIntensityZone } from "@repo/core";

const ZONE_COLORS = {
  recovery: "#10b981",      // green
  endurance: "#3b82f6",     // blue
  tempo: "#f59e0b",         // amber
  threshold: "#ef4444",     // red
  vo2max: "#dc2626",        // dark red
  anaerobic: "#991b1b",     // darker red
  neuromuscular: "#7c2d12", // brown
};

const ZONE_LABELS = {
  recovery: "Recovery",
  endurance: "Endurance",
  tempo: "Tempo",
  threshold: "Threshold",
  vo2max: "VO2max",
  anaerobic: "Anaerobic",
  neuromuscular: "Neuromuscular",
};

export function ActivityCard({ activity }) {
  const hasIntensity = activity.intensity_factor !== null;
  
  let zone = null;
  let ifValue = null;
  let ifPercent = null;

  if (hasIntensity) {
    ifPercent = activity.intensity_factor; // Already stored as percentage (0-400)
    ifValue = activity.intensity_factor / 100; // Convert to decimal for zone calculation
    zone = getTrainingIntensityZone(ifValue);
  }

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-lg font-semibold">{activity.name}</Text>
          <Text className="text-sm text-gray-500">
            {formatDuration(activity.duration)} • {formatDistance(activity.distance)}
          </Text>
        </View>

        {hasIntensity && zone && (
          <View className="items-end">
            <Badge 
              color={ZONE_COLORS[zone]}
              label={ZONE_LABELS[zone]}
            />
            <Text className="text-xs text-gray-500 mt-1">
              IF: {ifPercent}% ({ifValue.toFixed(2)})
            </Text>
            {activity.training_stress_score && (
              <Text className="text-xs text-gray-500">
                TSS: {activity.training_stress_score}
              </Text>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}
```

**Badge Component:**
```typescript
// components/Badge.tsx
export function Badge({ color, label }) {
  return (
    <View
      style={{ backgroundColor: color }}
      className="px-2 py-1 rounded-full"
    >
      <Text className="text-xs font-medium text-white">{label}</Text>
    </View>
  );
}
```

---

### Task 4: Update Trends Screen

**File:** `apps/mobile/src/app/(tabs)/trends.tsx`  
**Priority:** High  
**Estimated Time:** 2 hours

Replace mock data with real API calls:

```typescript
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

export default function TrendsScreen() {
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(subMonths(new Date(), 1)),
    end: endOfMonth(new Date()),
  });

  // Fetch intensity distribution
  const { data: distribution, isLoading: distLoading } =
    trpc.training_plans.getIntensityDistribution.useQuery({
      start_date: dateRange.start.toISOString(),
      end_date: dateRange.end.toISOString(),
    });

  // Fetch weekly trends
  const { data: trends, isLoading: trendsLoading } =
    trpc.training_plans.getIntensityTrends.useQuery({
      weeks_back: 12,
    });

  if (distLoading || trendsLoading) {
    return <LoadingSpinner />;
  }

  return (
    <ScrollView>
      {/* Intensity Distribution */}
      <Section title="Intensity Distribution">
        {distribution && distribution.totalActivities > 0 ? (
          <>
            <IntensityDistributionChart data={distribution.distribution} />
            
            <View className="mt-4">
              <Text className="text-sm font-medium">
                {distribution.totalActivities} workouts • {distribution.totalTSS} TSS
              </Text>
              <Text className="text-xs text-gray-500">
                {distribution.activitiesWithIntensity} with power data
              </Text>
            </View>

            {/* Recommendations */}
            {distribution.recommendations.length > 0 && (
              <View className="mt-4 p-3 bg-blue-50 rounded-lg">
                <Text className="text-sm font-medium mb-2">💡 Insights</Text>
                {distribution.recommendations.map((rec, i) => (
                  <Text key={i} className="text-sm text-gray-700 mb-1">
                    • {rec}
                  </Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <EmptyState message="Complete workouts with power data to see intensity distribution" />
        )}
      </Section>

      {/* Weekly Trends */}
      <Section title="Weekly Trends">
        {trends && trends.weeks.length > 0 ? (
          <WeeklyTrendsChart data={trends.weeks} />
        ) : (
          <EmptyState message="Not enough data for trends analysis" />
        )}
      </Section>
    </ScrollView>
  );
}
```

**Intensity Distribution Chart:**
```typescript
// components/IntensityDistributionChart.tsx
export function IntensityDistributionChart({ data }) {
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
      {/* Stacked bar */}
      <View className="flex-row h-8 rounded-lg overflow-hidden">
        {zones.map((zone) => {
          const percentage = data[zone.key];
          if (percentage === 0) return null;

          return (
            <View
              key={zone.key}
              style={{
                width: `${percentage}%`,
                backgroundColor: zone.color,
              }}
            />
          );
        })}
      </View>

      {/* Legend */}
      <View className="mt-4 space-y-2">
        {zones.map((zone) => (
          <View key={zone.key} className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View
                style={{ backgroundColor: zone.color }}
                className="w-3 h-3 rounded-full mr-2"
              />
              <Text className="text-sm">{zone.label}</Text>
            </View>
            <Text className="text-sm font-medium">
              {data[zone.key].toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

---

### Task 5: Add Recovery Insights

**File:** `apps/mobile/src/screens/RecoveryInsightsScreen.tsx`  
**Priority:** Medium  
**Estimated Time:** 1.5 hours

Create new screen for hard workout spacing analysis:

```typescript
import { trpc } from "@/lib/trpc";
import { subDays } from "date-fns";

export default function RecoveryInsightsScreen() {
  const { data, isLoading } = trpc.training_plans.checkHardWorkoutSpacing.useQuery({
    start_date: subDays(new Date(), 30).toISOString(),
    end_date: new Date().toISOString(),
    min_hours: 48,
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <ScrollView>
      <Section title="Hard Workout Recovery">
        <Text className="text-sm text-gray-600 mb-4">
          Hard workouts (IF ≥ 0.85) should be spaced at least 48 hours apart
          for optimal recovery.
        </Text>

        {data?.hasViolations ? (
          <>
            <Alert type="warning">
              <Text className="font-medium">⚠️ Recovery Warnings</Text>
              <Text className="text-sm mt-1">
                Found {data.violations.length} instances of insufficient recovery
                between hard workouts.
              </Text>
            </Alert>

            <View className="mt-4 space-y-3">
              {data.violations.map((violation, i) => (
                <Card key={i}>
                  <Text className="text-sm font-medium text-red-600">
                    {violation.hoursBetween.toFixed(1)} hours between workouts
                  </Text>
                  
                  <View className="mt-2">
                    <WorkoutSummary
                      name={violation.workout1.name}
                      date={violation.workout1.started_at}
                      if={violation.workout1.intensity_factor / 100}
                    />
                    <Text className="text-xs text-gray-400 my-1">↓</Text>
                    <WorkoutSummary
                      name={violation.workout2.name}
                      date={violation.workout2.started_at}
                      if={violation.workout2.intensity_factor / 100}
                    />
                  </View>

                  <Text className="text-xs text-gray-500 mt-2">
                    💡 Consider adding 24+ more hours of recovery
                  </Text>
                </Card>
              ))}
            </View>
          </>
        ) : (
          <Card>
            <Text className="text-lg">✅ Good Recovery Spacing</Text>
            <Text className="text-sm text-gray-600 mt-1">
              All hard workouts in the last 30 days were properly spaced.
            </Text>
            <Text className="text-xs text-gray-500 mt-2">
              {data?.hardWorkoutCount} hard workouts analyzed
            </Text>
          </Card>
        )}
      </Section>
    </ScrollView>
  );
}

function WorkoutSummary({ name, date, if: ifValue }) {
  const zone = getTrainingIntensityZone(ifValue);
  
  return (
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-sm font-medium">{name}</Text>
        <Text className="text-xs text-gray-500">
          {format(new Date(date), "MMM d, h:mm a")}
        </Text>
      </View>
      <Badge color={ZONE_COLORS[zone]} label={`IF ${ifValue.toFixed(2)}`} />
    </View>
  );
}
```

---

### Task 6: Handle Edge Cases

**Priority:** High  
**Estimated Time:** 1 hour

#### 6.1 No Power Data

Show helpful message when activity has no power data:

```typescript
// components/NoPowerDataBanner.tsx
export function NoPowerDataBanner() {
  return (
    <View className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
      <Text className="text-sm font-medium text-yellow-800">
        ℹ️ No Power Data
      </Text>
      <Text className="text-xs text-yellow-700 mt-1">
        Intensity metrics require power data. Use a power meter or smart trainer
        to track IF and TSS.
      </Text>
    </View>
  );
}
```

#### 6.2 No FTP Set

Prompt user to set FTP in profile:

```typescript
// components/SetFTPPrompt.tsx
export function SetFTPPrompt() {
  const router = useRouter();

  return (
    <View className="p-4 bg-blue-50 rounded-lg border border-blue-200">
      <Text className="text-sm font-medium text-blue-800">
        🎯 Set Your FTP
      </Text>
      <Text className="text-xs text-blue-700 mt-1">
        To see intensity metrics, set your Functional Threshold Power in your profile.
      </Text>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onPress={() => router.push("/profile/settings")}
      >
        Set FTP
      </Button>
    </View>
  );
}
```

#### 6.3 Loading States

```typescript
// components/IntensityLoadingSkeleton.tsx
export function IntensityLoadingSkeleton() {
  return (
    <View className="space-y-3">
      <Skeleton className="h-8 w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </View>
  );
}
```

---

## Testing Checklist

### Unit Tests
- [ ] `useCompleteActivity` calculates IF correctly
- [ ] `useCompleteActivity` handles missing power data
- [ ] `useCompleteActivity` handles missing FTP
- [ ] `getTrainingIntensityZone` returns correct zones
- [ ] Activity card renders intensity badge

### Integration Tests
- [ ] Activity completion triggers IF calculation
- [ ] Trends screen fetches and displays real data
- [ ] Recovery insights shows spacing violations
- [ ] Error states handled gracefully

### E2E Tests
- [ ] Record activity with power data → IF calculated
- [ ] Complete activity → zone displayed on card
- [ ] View trends → distribution chart rendered
- [ ] Check recovery → violations shown if present

---

## Deployment Steps

### 1. Backend First
```bash
cd packages/trpc
bun run build
bun run test

# Deploy backend
fly deploy
```

### 2. Mobile App
```bash
cd apps/mobile
bun run build
bun run test

# Deploy to Expo
eas build --platform ios
eas build --platform android
eas submit
```

### 3. Verify Production
- [ ] Complete test activity
- [ ] Check IF calculated
- [ ] View trends screen
- [ ] Check recovery insights
- [ ] Monitor error logs

---

## Rollback Procedure

If critical issues found:

```bash
# Revert backend
git revert <commit-hash>
fly deploy

# Revert mobile
git revert <commit-hash>
eas build --platform all
```

---

## Success Metrics

### Week 1
- [ ] 80%+ activity completions calculate IF
- [ ] Zero critical errors
- [ ] API response times < 500ms

### Week 2
- [ ] Users viewing trends screen daily
- [ ] Positive feedback on recommendations
- [ ] Data quality > 90%

---

## Support Resources

- **Architecture**: `INTENSITY_CALCULATION.md`
- **API Docs**: `INTENSITY_API.md`
- **TODO List**: `INTENSITY_REFACTOR_TODO.md`
- **Production Readiness**: `PRODUCTION_READINESS.md`

---

**Next Steps:**
1. Review this guide with team
2. Set up development environment
3. Implement Task 1 (activity completion)
4. Test with real power data
5. Proceed to remaining tasks

**Questions?** Check the docs or ask in #dev-gradientpeak