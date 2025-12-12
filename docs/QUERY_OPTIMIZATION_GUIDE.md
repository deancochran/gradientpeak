# Query Optimization Guide

**Last Updated**: January 28, 2025  
**Package**: `@repo/trpc`  
**Purpose**: Performance optimization patterns for React Query + tRPC

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Query Configuration](#query-configuration)
3. [Cache Invalidation Patterns](#cache-invalidation-patterns)
4. [Optimistic Updates](#optimistic-updates)
5. [Query Key Management](#query-key-management)
6. [Performance Best Practices](#performance-best-practices)
7. [Common Pitfalls](#common-pitfalls)
8. [Migration Guide](#migration-guide)

---

## Overview

This guide covers optimization strategies for React Query in our mobile React Native app. Our configuration prioritizes:

- **Aggressive caching** to reduce network requests
- **Smart invalidation** to keep data fresh
- **Optimistic updates** for instant UI feedback
- **Mobile-optimized** refetch policies

---

## Query Configuration

### Default Settings

Our `createQueryClient()` provides mobile-optimized defaults:

```typescript
{
  queries: {
    staleTime: 5 * 60 * 1000,        // 5 minutes
    gcTime: 10 * 60 * 1000,          // 10 minutes
    retry: 3,                         // 3 retries with exponential backoff
    refetchOnWindowFocus: false,      // Disabled for mobile
    refetchOnReconnect: true,         // Refetch when back online
    refetchOnMount: false,            // Don't refetch if data is fresh
    networkMode: "online",            // Only run when online
  },
  mutations: {
    retry: 1,                         // Single retry for mutations
    networkMode: "online",            // Only run when online
  }
}
```

### When to Override

Override defaults when:

1. **Real-time data**: Set `staleTime: 0` for frequently changing data
2. **Static data**: Set `staleTime: Infinity` for rarely changing data
3. **Background updates**: Enable `refetchOnMount: true` for critical data
4. **No retries**: Set `retry: 0` for operations that shouldn't retry

**Example: Real-time activity tracking**

```typescript
const { data: liveActivity } = trpc.activities.getLive.useQuery(
  { id: activityId },
  {
    staleTime: 0,              // Always consider stale
    refetchInterval: 1000,     // Refetch every second
    refetchOnMount: true,      // Always refetch on mount
  }
);
```

**Example: Static user profile**

```typescript
const { data: profile } = trpc.profile.get.useQuery(undefined, {
  staleTime: Infinity,         // Never consider stale
  gcTime: 24 * 60 * 60 * 1000, // Keep for 24 hours
});
```

---

## Cache Invalidation Patterns

### 1. Basic Invalidation

❌ **BEFORE (Over-invalidation)**

```typescript
const createActivity = trpc.activities.create.useMutation({
  onSuccess: () => {
    // Invalidates EVERYTHING - very expensive!
    queryClient.invalidateQueries();
  },
});
```

✅ **AFTER (Targeted invalidation)**

```typescript
const createActivity = trpc.activities.create.useMutation({
  onSuccess: () => {
    // Only invalidate activity lists
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.activities.lists() 
    });
  },
});
```

### 2. Multiple Invalidations

When a mutation affects multiple data types:

```typescript
const completeActivity = trpc.activities.complete.useMutation({
  onSuccess: (data) => {
    // Invalidate multiple related queries
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.activities.detail(data.id) 
    });
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.trainingPlans.status() 
    });
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.plannedActivities.weekCount() 
    });
  },
});
```

### 3. Conditional Invalidation

Invalidate only when necessary:

```typescript
const updateActivity = trpc.activities.update.useMutation({
  onSuccess: (data, variables) => {
    // Always invalidate the specific activity
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.activities.detail(variables.id) 
    });

    // Only invalidate lists if completion status changed
    if (variables.completed !== undefined) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.activities.lists() 
      });
    }
  },
});
```

### 4. Partial Invalidation

Use `exact: false` to invalidate all queries matching a prefix:

```typescript
// Invalidates all queries starting with ["trainingPlans"]
queryClient.invalidateQueries({ 
  queryKey: queryKeys.trainingPlans.all,
  exact: false 
});
```

---

## Optimistic Updates

Optimistic updates provide instant UI feedback by updating the cache before the mutation completes.

### Pattern 1: Simple Field Update

```typescript
const updateActivityName = trpc.activities.update.useMutation({
  onMutate: async (variables) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ 
      queryKey: queryKeys.activities.detail(variables.id) 
    });

    // Snapshot previous value for rollback
    const previousActivity = queryClient.getQueryData(
      queryKeys.activities.detail(variables.id)
    );

    // Optimistically update
    queryClient.setQueryData(
      queryKeys.activities.detail(variables.id),
      (old) => ({ ...old, name: variables.name })
    );

    // Return rollback function
    return { previousActivity };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    if (context?.previousActivity) {
      queryClient.setQueryData(
        queryKeys.activities.detail(variables.id),
        context.previousActivity
      );
    }
  },
  onSettled: (data, error, variables) => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.activities.detail(variables.id) 
    });
  },
});
```

### Pattern 2: List Item Addition

```typescript
const createActivity = trpc.activities.create.useMutation({
  onMutate: async (newActivity) => {
    await queryClient.cancelQueries({ 
      queryKey: queryKeys.activities.lists() 
    });

    const previousList = queryClient.getQueryData(
      queryKeys.activities.lists()
    );

    // Add new item to list
    queryClient.setQueryData(
      queryKeys.activities.lists(),
      (old) => {
        if (!old) return old;
        return {
          ...old,
          items: [newActivity, ...old.items],
          total: old.total + 1,
        };
      }
    );

    return { previousList };
  },
  onError: (err, newActivity, context) => {
    if (context?.previousList) {
      queryClient.setQueryData(
        queryKeys.activities.lists(),
        context.previousList
      );
    }
  },
  onSuccess: (data) => {
    // Update with server response (has ID, timestamps, etc.)
    queryClient.setQueryData(
      queryKeys.activities.detail(data.id),
      data
    );
  },
});
```

### Pattern 3: List Item Deletion

```typescript
const deleteActivity = trpc.activities.delete.useMutation({
  onMutate: async (variables) => {
    await queryClient.cancelQueries({ 
      queryKey: queryKeys.activities.lists() 
    });

    const previousList = queryClient.getQueryData(
      queryKeys.activities.lists()
    );

    // Remove item from list
    queryClient.setQueryData(
      queryKeys.activities.lists(),
      (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((item) => item.id !== variables.id),
          total: old.total - 1,
        };
      }
    );

    return { previousList };
  },
  onError: (err, variables, context) => {
    if (context?.previousList) {
      queryClient.setQueryData(
        queryKeys.activities.lists(),
        context.previousList
      );
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.activities.lists() 
    });
  },
});
```

---

## Query Key Management

### Use Query Key Factory

Always use the `queryKeys` factory from `query-client.ts`:

```typescript
import { queryKeys } from "@repo/trpc/client";

// ✅ Good: Consistent keys
queryClient.invalidateQueries({ 
  queryKey: queryKeys.activities.lists() 
});

// ❌ Bad: Manual keys (typo-prone, inconsistent)
queryClient.invalidateQueries({ 
  queryKey: ["activities", "list"] 
});
```

### Query Key Hierarchy

Our keys follow a hierarchical structure:

```typescript
queryKeys.activities.all             // ["activities"]
queryKeys.activities.lists()         // ["activities", "list"]
queryKeys.activities.list({ ... })   // ["activities", "list", { filters }]
queryKeys.activities.details()       // ["activities", "detail"]
queryKeys.activities.detail(id)      // ["activities", "detail", id]
```

This allows targeted or broad invalidation:

```typescript
// Invalidate ALL activity queries
queryClient.invalidateQueries({ 
  queryKey: queryKeys.activities.all,
  exact: false 
});

// Invalidate only list queries
queryClient.invalidateQueries({ 
  queryKey: queryKeys.activities.lists(),
  exact: false 
});

// Invalidate specific activity
queryClient.invalidateQueries({ 
  queryKey: queryKeys.activities.detail(activityId) 
});
```

---

## Performance Best Practices

### 1. Avoid Cascading Queries

❌ **BEFORE (Waterfall loading)**

```typescript
const { data: plan } = trpc.trainingPlans.get.useQuery();

const { data: status } = trpc.trainingPlans.getStatus.useQuery(
  { planId: plan?.id },
  { enabled: !!plan } // Waits for plan to load
);
```

✅ **AFTER (Parallel loading)**

```typescript
const { data: plan } = trpc.trainingPlans.get.useQuery();

// Load in parallel with graceful handling
const { data: status } = trpc.trainingPlans.getStatus.useQuery(
  { planId: plan?.id ?? "" },
  // No enabled check - query handles missing planId gracefully
);
```

### 2. Memoize Heavy Computations

❌ **BEFORE (Runs on every render)**

```typescript
const weeklyStats = useMemo(() => {
  // Heavy calculation
  return calculateStats(weeklySummary, status);
}, [weeklySummary, status]); // Recalculates when object references change
```

✅ **AFTER (Only recalculates when data actually changes)**

```typescript
const weeklyStats = useMemo(() => {
  // Early return for empty data
  if (!weeklySummary || weeklySummary.length === 0) {
    return DEFAULT_STATS;
  }
  
  // Heavy calculation
  return calculateStats(weeklySummary, status);
}, [
  weeklySummary?.length,  // Only when length changes
  status?.ctl,             // Only when specific values change
  status?.atl,
]);
```

### 3. Use Query Select for Data Transformation

Transform data in the query layer to prevent recalculations:

```typescript
const { data: activityNames } = trpc.activities.list.useQuery(
  { limit: 100 },
  {
    select: (data) => data.items.map((item) => item.name),
    // Only re-runs select when query data changes, not on component re-render
  }
);
```

### 4. Debounce Search Queries

```typescript
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

function SearchActivities() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data } = trpc.activities.search.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length > 0 }
  );
}
```

### 5. Implement Virtual Lists

For long lists, use virtualization:

```typescript
import { FlashList } from "@shopify/flash-list";

function ActivityList({ activities }) {
  return (
    <FlashList
      data={activities}
      estimatedItemSize={80}
      renderItem={({ item }) => <ActivityCard activity={item} />}
    />
  );
}
```

### 6. Use React.memo for List Items

```typescript
import { memo } from "react";

const ActivityCard = memo(({ activity }) => {
  return (
    <Card>
      <Text>{activity.name}</Text>
    </Card>
  );
}, (prev, next) => {
  // Custom comparison - only re-render if ID or name changes
  return prev.activity.id === next.activity.id && 
         prev.activity.name === next.activity.name;
});
```

---

## Common Pitfalls

### 1. Over-Invalidation

❌ **DON'T**: Invalidate everything

```typescript
onSuccess: () => queryClient.invalidateQueries();
```

✅ **DO**: Target specific queries

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ 
    queryKey: queryKeys.activities.lists() 
  });
};
```

### 2. Forgetting Rollback

❌ **DON'T**: Optimistic updates without error handling

```typescript
onMutate: (variables) => {
  queryClient.setQueryData(key, newData);
  // No rollback context returned!
};
```

✅ **DO**: Always provide rollback

```typescript
onMutate: async (variables) => {
  const previous = queryClient.getQueryData(key);
  queryClient.setQueryData(key, newData);
  return { previous };
},
onError: (err, variables, context) => {
  if (context?.previous) {
    queryClient.setQueryData(key, context.previous);
  }
};
```

### 3. Forgetting to Cancel Queries

❌ **DON'T**: Race conditions

```typescript
onMutate: (variables) => {
  // Query refetch might override optimistic update
  queryClient.setQueryData(key, newData);
};
```

✅ **DO**: Cancel in-flight queries

```typescript
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: key });
  queryClient.setQueryData(key, newData);
};
```

### 4. Not Using Query Keys Factory

❌ **DON'T**: Manual query keys

```typescript
invalidateQueries({ queryKey: ["activities", "list"] });
```

✅ **DO**: Use factory

```typescript
invalidateQueries({ queryKey: queryKeys.activities.lists() });
```

### 5. Blocking Queries with `enabled`

❌ **DON'T**: Create waterfalls

```typescript
const { data: plan } = trpc.plans.get.useQuery();
const { data: activities } = trpc.activities.list.useQuery(
  { planId: plan?.id },
  { enabled: !!plan } // Blocks parallel loading
);
```

✅ **DO**: Allow parallel loading

```typescript
const { data: plan } = trpc.plans.get.useQuery();
const { data: activities } = trpc.activities.list.useQuery({
  planId: plan?.id ?? ""
  // Let server handle missing planId gracefully
});
```

---

## Migration Guide

### Step 1: Update Mutations to Use Query Keys

**Find all mutations:**

```bash
grep -r "useMutation" apps/mobile/
```

**Update each mutation:**

```typescript
// Before
const mutation = trpc.activities.create.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries();
  }
});

// After
const mutation = trpc.activities.create.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.activities.lists() 
    });
  }
});
```

### Step 2: Add Optimistic Updates to Critical Mutations

Priority mutations for optimistic updates:

1. Activity completion
2. Activity name updates
3. Planned activity scheduling
4. Profile quick updates

### Step 3: Profile and Measure

Before and after each optimization:

```typescript
import { startTransition } from "react";

// Wrap expensive updates
startTransition(() => {
  setData(processedData);
});
```

Use React DevTools Profiler to measure:

- Render count
- Render time
- Committed at timestamp

### Step 4: Document Custom Configurations

Any query with custom config should have a comment:

```typescript
const { data } = trpc.activities.live.useQuery(
  { id },
  {
    // Real-time updates needed for live tracking
    staleTime: 0,
    refetchInterval: 1000,
  }
);
```

---

## Checklist

Use this checklist when implementing queries and mutations:

### Queries

- [ ] Uses appropriate `staleTime` for data freshness needs
- [ ] Doesn't block other queries with `enabled` unnecessarily
- [ ] Uses `select` for data transformation when appropriate
- [ ] Handles loading and error states
- [ ] Uses query keys from factory

### Mutations

- [ ] Invalidates only affected queries
- [ ] Uses optimistic updates for critical UX
- [ ] Handles errors with rollback
- [ ] Cancels in-flight queries in `onMutate`
- [ ] Shows loading state during mutation
- [ ] Prevents double submissions

### Performance

- [ ] No unnecessary re-renders (use React.memo)
- [ ] Heavy computations are memoized with correct dependencies
- [ ] Long lists use virtualization
- [ ] Search inputs are debounced
- [ ] Data transformations use `select` when possible

---

## Resources

- [React Query Docs](https://tanstack.com/query/latest)
- [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [Query Keys Guide](https://tanstack.com/query/latest/docs/react/guides/query-keys)
- [React DevTools Profiler](https://react.dev/learn/react-developer-tools)

---

**Remember**: Premature optimization is the root of all evil, but measured optimization based on profiling is engineering excellence.