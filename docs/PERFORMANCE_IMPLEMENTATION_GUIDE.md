# Performance Implementation Guide

**Last Updated**: January 28, 2025  
**Purpose**: Step-by-step guide for applying performance optimizations  
**Estimated Time**: 6-8 hours total

---

## 📋 Overview

This guide walks through implementing the performance optimizations we've built. All infrastructure is ready - now we need to apply it to existing code.

**What's Ready**:
- ✅ Query configuration optimized in `@repo/trpc`
- ✅ Query key factory available
- ✅ Optimistic mutation hooks ready
- ✅ Debouncing utilities available
- ✅ Comprehensive documentation

**What We'll Do**:
1. Update mutations to use new patterns
2. Add optimistic updates to critical operations
3. Optimize heavy computations
4. Add debouncing to search inputs
5. Profile and measure improvements

---

## 🎯 Priority Order

### Phase 1: Low-Hanging Fruit (1-2 hours)
1. Add debouncing to search inputs
2. Update simple mutations to use `useInvalidatingMutation`
3. Export query key factory from `@repo/trpc`

### Phase 2: Critical UX (2-3 hours)
4. Add optimistic updates to activity submission
5. Add optimistic updates to profile settings
6. Add optimistic updates to activity plan creation

### Phase 3: Heavy Lifting (2-3 hours)
7. Optimize trends screen computations
8. Optimize home screen computations
9. Add React.memo to list items
10. Profile and measure

---

## Phase 1: Low-Hanging Fruit

### Step 1.1: Export Query Keys from @repo/trpc

**File**: `packages/trpc/src/index.ts`

Add export:

```typescript
export { queryKeys, invalidateQueries, updateQueryData } from "./query-client";
```

**Verify**: Check that mobile app can import:

```typescript
import { queryKeys } from "@repo/trpc";
```

### Step 1.2: Add Debouncing to Search Inputs

**Example: Activity Search (if exists)**

```typescript
// Before
function ActivitySearch() {
  const [search, setSearch] = useState("");
  
  const { data } = trpc.activities.search.useQuery({ query: search });
  
  return <TextInput value={search} onChangeText={setSearch} />;
}

// After
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

function ActivitySearch() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  
  const { data } = trpc.activities.search.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length > 0 }
  );
  
  return <TextInput value={search} onChangeText={setSearch} />;
}
```

**Files to Check**:
- Search any files with search inputs: `grep -r "search" apps/mobile/app/`
- Look for filter inputs that change frequently

### Step 1.3: Update Simple Mutations

Find mutations that just need invalidation (no optimistic updates needed):

**Example Pattern**:

```typescript
// Before
const deleteMutation = trpc.activities.delete.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries();
  }
});

// After
import { useInvalidatingMutation } from "@/lib/hooks/useOptimisticMutation";
import { queryKeys } from "@repo/trpc";

const deleteMutation = useInvalidatingMutation(
  async (id: string) => {
    return await trpc.activities.delete.mutate({ id });
  },
  {
    invalidateKeys: [
      queryKeys.activities.lists(),
      queryKeys.activities.detail(id),
    ],
    successMessage: "Activity deleted successfully",
  }
);

// Usage stays the same
deleteMutation.mutate(activityId);
```

**Find candidates**: `grep -r "useMutation" apps/mobile/`

---

## Phase 2: Critical UX - Optimistic Updates

### Step 2.1: Activity Submission Optimistic Update

**File**: `apps/mobile/lib/hooks/useActivitySubmission.ts`

This is complex - we need to show immediate feedback when activity uploads.

**Current State** (line 378-379):
```typescript
const createActivityWithStreamsMutation =
  trpc.activities.createWithStreams.useMutation();
```

**After**:
```typescript
import { queryKeys } from "@repo/trpc";
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();

const createActivityWithStreamsMutation = trpc.activities.createWithStreams.useMutation({
  onSuccess: (data) => {
    // Invalidate relevant queries
    queryClient.invalidateQueries({ queryKey: queryKeys.activities.lists() });
    queryClient.invalidateQueries({ queryKey: queryKeys.trainingPlans.status() });
    queryClient.invalidateQueries({ queryKey: queryKeys.trainingPlans.weeklySummary(data.training_plan_id) });
    
    // Set the new activity in cache
    queryClient.setQueryData(queryKeys.activities.detail(data.id), data);
  },
  onError: (error) => {
    console.error("[useActivitySubmission] Upload failed:", error);
    Alert.alert("Upload Failed", error.message || "Please try again");
  },
});
```

### Step 2.2: Profile Settings Optimistic Update

**File**: `apps/mobile/app/(internal)/(tabs)/settings/index.tsx`

Find the mutation (should be around line ~200-300):

**Before**:
```typescript
const updateMutation = trpc.profile.quickUpdate.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries();
    Alert.alert("Success", "Profile updated");
  },
});
```

**After**:
```typescript
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import { queryKeys } from "@repo/trpc";

const updateMutation = useOptimisticMutation(
  async (data: ProfileQuickUpdateData) => {
    return await trpc.profile.quickUpdate.mutate(data);
  },
  {
    queryKey: queryKeys.profile.current(),
    updater: (old, variables) => {
      if (!old) return old;
      return {
        ...old,
        weight_kg: variables.weight_kg ?? old.weight_kg,
        ftp: variables.ftp ?? old.ftp,
        threshold_hr: variables.threshold_hr ?? old.threshold_hr,
      };
    },
    invalidateKeys: [
      queryKeys.trainingPlans.status(),
    ],
    successMessage: "Profile updated successfully",
    showSuccessMessage: true,
  }
);

// Usage - form submission
const onSubmit = handleSubmit(async (data) => {
  try {
    await updateMutation.mutate(data);
    router.back();
  } catch (error) {
    // Error already handled by hook
  }
});
```

**Benefits**:
- Profile updates appear instantly in UI
- Form feels much more responsive
- Automatic rollback if server rejects
- Consistent error handling

### Step 2.3: Planned Activity Scheduling Optimistic Update

**File**: Find scheduled activity creation - likely in plan screens

**Pattern**:
```typescript
import { useListAddMutation } from "@/lib/hooks/useOptimisticMutation";
import { queryKeys } from "@repo/trpc";

const scheduleActivity = useListAddMutation(
  async (data: PlannedActivityScheduleFormData) => {
    return await trpc.plannedActivities.create.mutate(data);
  },
  {
    listQueryKey: queryKeys.plannedActivities.lists(),
    optimisticItem: (variables) => ({
      id: "temp-" + Date.now(),
      ...variables,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    }),
    invalidateKeys: [
      queryKeys.plannedActivities.weekCount(),
    ],
    successMessage: "Activity scheduled!",
    showSuccessMessage: true,
  }
);
```

---

## Phase 3: Heavy Computation Optimization

### Step 3.1: Optimize Trends Screen

**File**: `apps/mobile/app/(internal)/(tabs)/trends/index.tsx`

**Current Issues** (based on outline):
- Multiple queries with heavy data transformations
- Calculations in render functions
- No memoization of expensive operations

**Optimization 1: Memoize with Correct Dependencies**

Find computations like weekly stats, intensity distributions, etc.

**Before**:
```typescript
const distributionPercent = useMemo(() => {
  return {
    recovery: intensityData?.recovery ?? 0,
    endurance: intensityData?.endurance ?? 0,
    tempo: intensityData?.tempo ?? 0,
    threshold: intensityData?.threshold ?? 0,
    vo2max: intensityData?.vo2max ?? 0,
    anaerobic: intensityData?.anaerobic ?? 0,
    neuromuscular: intensityData?.neuromuscular ?? 0,
  };
}, [intensityData]); // Recalculates when object reference changes
```

**After**:
```typescript
const distributionPercent = useMemo(() => {
  if (!intensityData) return DEFAULT_DISTRIBUTION;
  
  return {
    recovery: intensityData.recovery ?? 0,
    endurance: intensityData.endurance ?? 0,
    tempo: intensityData.tempo ?? 0,
    threshold: intensityData.threshold ?? 0,
    vo2max: intensityData.vo2max ?? 0,
    anaerobic: intensityData.anaerobic ?? 0,
    neuromuscular: intensityData.neuromuscular ?? 0,
  };
}, [
  // Only recalculate when actual values change
  intensityData?.recovery,
  intensityData?.endurance,
  intensityData?.tempo,
  intensityData?.threshold,
  intensityData?.vo2max,
  intensityData?.anaerobic,
  intensityData?.neuromuscular,
]);
```

**Optimization 2: Use Query Select**

Transform data in query layer:

```typescript
const { data: intensityData } = trpc.trainingPlans.getIntensityDistribution.useQuery(
  {
    training_plan_id: trainingPlan?.id ?? "",
    start_date: dateRange.start,
    end_date: dateRange.end,
  },
  {
    enabled: !!trainingPlan?.id,
    select: (data) => {
      // Transform once in query layer
      return {
        distribution: {
          recovery: data.recovery ?? 0,
          endurance: data.endurance ?? 0,
          tempo: data.tempo ?? 0,
          threshold: data.threshold ?? 0,
          vo2max: data.vo2max ?? 0,
          anaerobic: data.anaerobic ?? 0,
          neuromuscular: data.neuromuscular ?? 0,
        },
        totalActivities: data.total_activities ?? 0,
        totalTSS: data.total_tss ?? 0,
      };
    },
  }
);
```

### Step 3.2: Optimize Home Screen

**File**: `apps/mobile/lib/hooks/useHomeData.ts`

**Already Good**:
- ✅ Parallel loading (no cascading)
- ✅ Early returns in useMemo
- ✅ Null checks

**Potential Optimization**: Use `select` in queries

**Example**:
```typescript
const { data: status } = trpc.trainingPlans.getCurrentStatus.useQuery(
  undefined,
  {
    select: (data) => {
      if (!data) return null;
      
      // Pre-calculate form status in query layer
      const tsb = data.tsb ?? 0;
      let label: string;
      let color: string;
      
      if (tsb > 10) {
        label = "Fresh";
        color = "green";
      } else if (tsb >= -10) {
        label = "Optimal";
        color = "blue";
      } else if (tsb >= -20) {
        label = "Productive";
        color = "purple";
      } else {
        label = "Fatigued";
        color = "orange";
      }
      
      return {
        ...data,
        formLabel: label,
        formColor: color,
        formPercentage: Math.max(0, Math.min(100, ((tsb + 30) / 60) * 100)),
      };
    },
  }
);
```

### Step 3.3: Add React.memo to List Items

Find list item components (activity cards, plan cards, etc.)

**Before**:
```typescript
function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Card>
      <Text>{activity.name}</Text>
      <Text>{activity.distance_km} km</Text>
    </Card>
  );
}
```

**After**:
```typescript
import { memo } from "react";

const ActivityCard = memo(
  ({ activity }: { activity: Activity }) => {
    return (
      <Card>
        <Text>{activity.name}</Text>
        <Text>{activity.distance_km} km</Text>
      </Card>
    );
  },
  (prev, next) => {
    // Only re-render if these specific fields change
    return (
      prev.activity.id === next.activity.id &&
      prev.activity.name === next.activity.name &&
      prev.activity.distance_km === next.activity.distance_km
    );
  }
);

export default ActivityCard;
```

---

## 📊 Measurement & Profiling

### Before Starting Optimizations

1. **Install React DevTools** (if not already)
2. **Record baseline metrics**:

```typescript
// Add to key screens temporarily
import { useEffect } from "react";

function TrendsScreen() {
  useEffect(() => {
    const start = performance.now();
    
    return () => {
      const end = performance.now();
      console.log(`[Trends] Render time: ${end - start}ms`);
    };
  });
  
  // rest of component
}
```

3. **Measure with Profiler**:

```typescript
import { Profiler } from "react";

function App() {
  return (
    <Profiler
      id="TrendsScreen"
      onRender={(id, phase, actualDuration) => {
        console.log(`[Profiler] ${id} ${phase}: ${actualDuration}ms`);
      }}
    >
      <TrendsScreen />
    </Profiler>
  );
}
```

### After Each Optimization

1. **Compare render times**
2. **Check network tab** - fewer refetches?
3. **Test user flows**:
   - Update profile → check instant feedback
   - Schedule activity → check instant list update
   - Navigate back/forth → check cached data
4. **Document improvements**

### Target Metrics

- **Query refetches**: < 5 per screen navigation
- **Render time**: < 50ms for most screens
- **Time to interactive**: < 1s on good network
- **Optimistic update lag**: 0ms (instant)

---

## 🔍 Finding Opportunities

### Search for Anti-patterns

```bash
# Find over-invalidation
grep -r "invalidateQueries()" apps/mobile/

# Find missing memoization
grep -r "\.map(" apps/mobile/ | grep -v "useMemo"

# Find uncontrolled queries
grep -r "useQuery" apps/mobile/ | grep -v "enabled"

# Find manual query keys
grep -r 'queryKey: \["' apps/mobile/
```

### Code Review Checklist

When reviewing/updating any component:

- [ ] Are mutations using query key factory?
- [ ] Do critical mutations have optimistic updates?
- [ ] Are search inputs debounced?
- [ ] Are list items memoized?
- [ ] Are expensive calculations in useMemo with correct deps?
- [ ] Are queries using `select` for transformations?
- [ ] Is data being transformed once (not on every render)?

---

## 🚨 Common Pitfalls to Avoid

### 1. Over-Optimization

Don't optimize everything:
- ✅ DO: Optimize frequent operations (list renders, mutations)
- ❌ DON'T: Optimize rarely-used screens or simple components

### 2. Breaking Functionality

Test thoroughly after each change:
- ✅ DO: Test form submission, data updates, navigation
- ❌ DON'T: Optimize without testing

### 3. Incorrect Memoization Dependencies

```typescript
// ❌ BAD: Will never update
useMemo(() => calculate(data), []);

// ❌ BAD: Updates too often
useMemo(() => calculate(data), [data]);

// ✅ GOOD: Updates when actual values change
useMemo(() => calculate(data), [data?.id, data?.value]);
```

### 4. Optimistic Updates Without Rollback

```typescript
// ❌ BAD: No rollback on error
onMutate: (variables) => {
  queryClient.setQueryData(key, newData);
};

// ✅ GOOD: Always provide rollback
onMutate: async (variables) => {
  const previous = queryClient.getQueryData(key);
  queryClient.setQueryData(key, newData);
  return { previous };
},
onError: (err, vars, context) => {
  queryClient.setQueryData(key, context.previous);
};
```

---

## 📝 Implementation Tracking

### Phase 1: Low-Hanging Fruit
- [ ] Export query keys from `@repo/trpc`
- [ ] Add debouncing to search inputs (if any)
- [ ] Update simple mutations to `useInvalidatingMutation`
- [ ] Test: Navigation, mutations, search performance

### Phase 2: Critical UX
- [ ] Optimize activity submission hook
- [ ] Add optimistic update to profile settings
- [ ] Add optimistic update to activity scheduling
- [ ] Test: Form submissions, data updates, error handling

### Phase 3: Heavy Lifting
- [ ] Optimize trends screen computations
- [ ] Optimize home screen (if needed)
- [ ] Add React.memo to list items
- [ ] Test: Scroll performance, navigation speed

### Phase 4: Measurement
- [ ] Profile before/after with React DevTools
- [ ] Measure render times
- [ ] Measure network requests
- [ ] Document improvements in ANALYSIS.md

---

## 🎯 Expected Results

### Performance Gains
- **Network requests**: 40-60% reduction in refetches
- **Render time**: 30-50% faster for heavy screens
- **Perceived performance**: Near-instant for optimistic updates
- **Search inputs**: No lag during typing

### User Experience
- ✨ Instant feedback on form submissions
- ✨ Smooth scrolling in long lists
- ✨ Fast navigation between screens
- ✨ No lag when typing in search
- ✨ Graceful error handling with rollback

### Code Quality
- 📦 Consistent mutation patterns across app
- 📦 Reusable hooks for common operations
- 📦 Well-documented optimization strategies
- 📦 Easy to add new optimized mutations

---

## 🆘 When You Need Help

### If Performance Doesn't Improve

1. **Profile with React DevTools** - find actual bottleneck
2. **Check query config** - are queries actually cached?
3. **Verify memo dependencies** - are they correct?
4. **Look for other issues** - large images, animations, etc.

### If Optimistic Updates Break

1. **Check rollback logic** - is previous data captured?
2. **Verify query keys** - are they correct?
3. **Test error cases** - does rollback work?
4. **Check type safety** - are updaters typed correctly?

### If Mutations Don't Invalidate

1. **Check query key factory** - exported correctly?
2. **Verify invalidation keys** - matching query keys?
3. **Check cache** - is data actually stale?
4. **Test refetch** - does manual refetch work?

---

**Remember**: Optimize what matters, measure everything, test thoroughly!