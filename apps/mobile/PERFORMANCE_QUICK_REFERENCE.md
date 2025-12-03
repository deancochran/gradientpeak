# Performance Quick Reference Card

**Last Updated**: January 28, 2025  
**Purpose**: Quick copy-paste patterns for common optimizations

---

## 🚀 Query Configuration

### Import Query Keys
```typescript
import { queryKeys } from "@repo/trpc";
```

### Override Query Config
```typescript
// Real-time data (always fresh)
const { data } = trpc.query.useQuery(params, {
  staleTime: 0,
  refetchInterval: 1000,
});

// Static data (never stale)
const { data } = trpc.query.useQuery(params, {
  staleTime: Infinity,
  gcTime: 24 * 60 * 60 * 1000,
});
```

---

## 🎯 Optimistic Updates

### Basic Field Update
```typescript
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import { queryKeys } from "@repo/trpc";

const updateMutation = useOptimisticMutation(
  async (data: UpdateData) => trpc.resource.update.mutate(data),
  {
    queryKey: queryKeys.resource.detail(id),
    updater: (old, vars) => ({ ...old, ...vars }),
    invalidateKeys: [queryKeys.resource.lists()],
    successMessage: "Updated!",
  }
);

// Usage
<Button onPress={() => updateMutation.mutate({ name: "New Name" })} />
```

### List Item Addition
```typescript
import { useListAddMutation } from "@/lib/hooks/useOptimisticMutation";

const createMutation = useListAddMutation(
  async (data) => trpc.resource.create.mutate(data),
  {
    listQueryKey: queryKeys.resource.lists(),
    optimisticItem: (vars) => ({
      id: "temp-" + Date.now(),
      ...vars,
      created_at: new Date().toISOString(),
    }),
    successMessage: "Created!",
  }
);
```

### List Item Removal
```typescript
import { useListRemoveMutation } from "@/lib/hooks/useOptimisticMutation";

const deleteMutation = useListRemoveMutation(
  async (id: string) => trpc.resource.delete.mutate({ id }),
  {
    listQueryKey: queryKeys.resource.lists(),
    getItemId: (id) => id,
    successMessage: "Deleted!",
  }
);
```

### Simple Invalidation (No Optimistic Update)
```typescript
import { useInvalidatingMutation } from "@/lib/hooks/useOptimisticMutation";

const mutation = useInvalidatingMutation(
  async (data) => trpc.resource.action.mutate(data),
  {
    invalidateKeys: [
      queryKeys.resource.lists(),
      queryKeys.resource.detail(id),
    ],
    successMessage: "Success!",
  }
);
```

---

## 🔍 Search & Filters

### Debounced Search Input
```typescript
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

function SearchComponent() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data } = trpc.search.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length > 0 }
  );

  return (
    <TextInput
      value={search}
      onChangeText={setSearch}
      placeholder="Search..."
    />
  );
}
```

### Debounced Callback
```typescript
import { useDebouncedCallback } from "@/lib/hooks/useDebouncedValue";

const debouncedUpdate = useDebouncedCallback(
  async (value: string) => {
    await updateAPI(value);
  },
  300
);

<TextInput onChangeText={debouncedUpdate} />
```

---

## 🧮 Computation Optimization

### Correct Memoization
```typescript
// ❌ BAD: Object reference
const result = useMemo(() => calculate(data), [data]);

// ✅ GOOD: Specific values
const result = useMemo(() => {
  if (!data) return DEFAULT;
  return calculate(data);
}, [data?.id, data?.value, data?.status]);
```

### Query Select (Transform Once)
```typescript
const { data } = trpc.query.useQuery(params, {
  select: (data) => {
    // Transform once when query data changes
    return {
      items: data.items.map(item => ({ ...item, formatted: true })),
      total: data.total,
    };
  },
});
```

### React.memo for List Items
```typescript
import { memo } from "react";

const ListItem = memo(
  ({ item }: { item: Item }) => (
    <View>
      <Text>{item.name}</Text>
    </View>
  ),
  (prev, next) => prev.item.id === next.item.id && prev.item.name === next.item.name
);
```

---

## 📋 Cache Invalidation

### Specific Key
```typescript
queryClient.invalidateQueries({ 
  queryKey: queryKeys.resource.detail(id) 
});
```

### All Lists
```typescript
queryClient.invalidateQueries({ 
  queryKey: queryKeys.resource.lists(),
  exact: false // Invalidates all list queries with filters
});
```

### Multiple Keys
```typescript
await Promise.all([
  queryClient.invalidateQueries({ queryKey: queryKeys.resource.lists() }),
  queryClient.invalidateQueries({ queryKey: queryKeys.related.all }),
]);
```

### Optimistic Update (Manual)
```typescript
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData(key);
  queryClient.setQueryData(key, (old) => ({ ...old, ...variables }));
  return { previous };
},
onError: (err, vars, context) => {
  queryClient.setQueryData(key, context.previous);
},
```

---

## 🎨 Loading States

### Mutation Loading
```typescript
const mutation = useOptimisticMutation(...);

<Button 
  onPress={() => mutation.mutate(data)}
  disabled={mutation.isLoading}
>
  {mutation.isLoading ? "Saving..." : "Save"}
</Button>
```

### Query Loading
```typescript
const { data, isLoading, error } = trpc.query.useQuery(params);

if (isLoading) return <Skeleton />;
if (error) return <ErrorView error={error} />;
return <DataView data={data} />;
```

---

## 🐛 Debugging

### Log Render Count
```typescript
import { useEffect, useRef } from "react";

function Component() {
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    console.log(`[Component] Rendered ${renderCount.current} times`);
  });
}
```

### Measure Render Time
```typescript
import { Profiler } from "react";

<Profiler
  id="ComponentName"
  onRender={(id, phase, actualDuration) => {
    console.log(`${id} ${phase}: ${actualDuration}ms`);
  }}
>
  <Component />
</Profiler>
```

### Check Cache
```typescript
// Get cached data
const cached = queryClient.getQueryData(queryKeys.resource.detail(id));
console.log("Cached:", cached);

// Get query state
const state = queryClient.getQueryState(queryKeys.resource.detail(id));
console.log("State:", state);
```

---

## 📊 Query Keys Reference

```typescript
// Activities
queryKeys.activities.all                    // ["activities"]
queryKeys.activities.lists()                // ["activities", "list"]
queryKeys.activities.list({ limit: 10 })    // ["activities", "list", { limit: 10 }]
queryKeys.activities.detail(id)             // ["activities", "detail", id]

// Training Plans
queryKeys.trainingPlans.all                 // ["trainingPlans"]
queryKeys.trainingPlans.lists()             // ["trainingPlans", "list"]
queryKeys.trainingPlans.detail(id)          // ["trainingPlans", "detail", id]
queryKeys.trainingPlans.status()            // ["trainingPlans", "status"]
queryKeys.trainingPlans.weeklySummary(id)   // ["trainingPlans", "weeklySummary", id]
queryKeys.trainingPlans.curve(id, "actual") // ["trainingPlans", "curve", id, "actual"]

// Planned Activities
queryKeys.plannedActivities.all             // ["plannedActivities"]
queryKeys.plannedActivities.lists()         // ["plannedActivities", "list"]
queryKeys.plannedActivities.detail(id)      // ["plannedActivities", "detail", id]
queryKeys.plannedActivities.weekCount()     // ["plannedActivities", "weekCount"]

// Profile
queryKeys.profile.all                       // ["profile"]
queryKeys.profile.current()                 // ["profile", "current"]
```

---

## ⚡ Common Patterns

### Profile Settings Update
```typescript
const updateProfile = useOptimisticMutation(
  async (data: ProfileQuickUpdateData) => 
    trpc.profile.quickUpdate.mutate(data),
  {
    queryKey: queryKeys.profile.current(),
    updater: (old, vars) => ({ ...old, ...vars }),
    invalidateKeys: [queryKeys.trainingPlans.status()],
    successMessage: "Profile updated!",
  }
);
```

### Activity Scheduling
```typescript
const scheduleActivity = useListAddMutation(
  async (data) => trpc.plannedActivities.create.mutate(data),
  {
    listQueryKey: queryKeys.plannedActivities.lists(),
    optimisticItem: (vars) => ({
      id: "temp-" + Date.now(),
      ...vars,
      created_at: new Date().toISOString(),
    }),
    invalidateKeys: [queryKeys.plannedActivities.weekCount()],
    successMessage: "Activity scheduled!",
  }
);
```

### Activity Deletion
```typescript
const deleteActivity = useListRemoveMutation(
  async (id: string) => trpc.activities.delete.mutate({ id }),
  {
    listQueryKey: queryKeys.activities.lists(),
    getItemId: (id) => id,
    invalidateKeys: [queryKeys.trainingPlans.status()],
    successMessage: "Activity deleted!",
  }
);
```

---

## 🎯 Checklist

Before committing optimizations:

- [ ] Using query key factory (not manual keys)
- [ ] Optimistic updates for user-initiated actions
- [ ] Search inputs debounced (300ms)
- [ ] Expensive calculations memoized with correct deps
- [ ] List items wrapped in React.memo
- [ ] Mutations show loading states
- [ ] Error handling with rollback
- [ ] Success messages where appropriate
- [ ] Tested error cases
- [ ] Profiled with React DevTools

---

## 📚 Full Documentation

- **Patterns**: `packages/trpc/QUERY_OPTIMIZATION_GUIDE.md` (711 lines)
- **Implementation**: `apps/mobile/PERFORMANCE_IMPLEMENTATION_GUIDE.md` (673 lines)
- **Summary**: `apps/mobile/PERFORMANCE_SUMMARY.md` (527 lines)
- **Analysis**: `apps/mobile/ANALYSIS.md` (tracking progress)

---

**Remember**: Optimize what matters, measure everything, test thoroughly!