# Training Plans API Usage Guide

Complete reference for using the training plans tRPC endpoints in the GradientPeak mobile app.

---

## Table of Contents
1. [Setup](#setup)
2. [API Endpoints](#api-endpoints)
3. [Usage Examples](#usage-examples)
4. [Error Handling](#error-handling)
5. [Type Definitions](#type-definitions)

---

## Setup

### Import tRPC Client
```typescript
import { trpc } from '@/lib/trpc';
```

### React Query Hooks
All endpoints use React Query under the hood, providing automatic caching, refetching, and optimistic updates.

---

## API Endpoints

### 1. Get Training Plan
Retrieves the user's training plan. Returns `null` if no plan exists.

```typescript
trpc.trainingPlans.get.useQuery()
```

**Returns:**
```typescript
{
  id: string;
  idx: number;
  name: string;
  description: string | null;
  structure: TrainingPlanStructure;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile_id: string;
} | null
```

**Example:**
```typescript
const { data: plan, isLoading, error } = trpc.trainingPlans.get.useQuery();

if (isLoading) return <LoadingSpinner />;
if (!plan) return <CreatePlanCTA />;

return <PlanOverview plan={plan} />;
```

---

### 2. Check Plan Exists
Quickly check if user has a training plan without fetching full data.

```typescript
trpc.trainingPlans.exists.useQuery()
```

**Returns:**
```typescript
{
  exists: boolean;
  count: number;
}
```

**Example:**
```typescript
const { data } = trpc.trainingPlans.exists.useQuery();

if (data?.exists) {
  // Show plan management UI
} else {
  // Show create plan wizard
}
```

---

### 3. Create Training Plan
Creates a new training plan. **Only one plan allowed per user.**

```typescript
trpc.trainingPlans.create.useMutation()
```

**Input Schema:**
```typescript
{
  name: string;                    // Required, 1-255 chars
  description?: string | null;     // Optional, max 1000 chars
  structure: TrainingPlanStructure; // Required, see structure below
}
```

**TrainingPlanStructure:**
```typescript
{
  // Weekly TSS targets
  target_weekly_tss_min: number;     // >= 0
  target_weekly_tss_max: number;     // >= target_weekly_tss_min
  
  // Activity frequency
  target_activities_per_week: number; // 1-7
  
  // Recovery constraints
  max_consecutive_days: number;       // 1-7
  min_rest_days_per_week: number;     // 0-7
  
  // Intensity distribution (must sum to 1.0)
  intensity_distribution: {
    recovery: number;  // 0-1
    easy: number;      // 0-1
    moderate: number;  // 0-1
    hard: number;      // 0-1
    race: number;      // 0-1
  };
  
  // Hard workout spacing
  min_hours_between_hard: number;     // >= 0
  max_hard_activities_per_week: number; // 0-7
  
  // Periodization (optional)
  periodization_template?: {
    starting_ctl: number;  // >= 0
    target_ctl: number;    // >= starting_ctl
    ramp_rate: number;     // 0-1
    target_date: string;   // ISO date format
  };
}
```

**Example:**
```typescript
const createPlan = trpc.trainingPlans.create.useMutation();

const handleCreatePlan = async () => {
  try {
    const newPlan = await createPlan.mutateAsync({
      name: "Marathon Training Plan",
      description: "12-week plan for spring marathon",
      structure: {
        target_weekly_tss_min: 300,
        target_weekly_tss_max: 450,
        target_activities_per_week: 5,
        max_consecutive_days: 6,
        min_rest_days_per_week: 1,
        intensity_distribution: {
          recovery: 0.20,
          easy: 0.50,
          moderate: 0.20,
          hard: 0.08,
          race: 0.02,
        },
        min_hours_between_hard: 48,
        max_hard_activities_per_week: 2,
        periodization_template: {
          starting_ctl: 50,
          target_ctl: 80,
          ramp_rate: 0.05,
          target_date: "2024-05-01",
        },
      },
    });
    
    console.log("Created plan:", newPlan.id);
  } catch (error) {
    if (error.message.includes("already have")) {
      alert("You already have a training plan. Delete it first.");
    }
  }
};
```

**Errors:**
- `BAD_REQUEST` - User already has a plan or invalid structure
- `INTERNAL_SERVER_ERROR` - Database error

---

### 4. Update Training Plan
Updates an existing training plan. All fields are optional.

```typescript
trpc.trainingPlans.update.useMutation()
```

**Input:**
```typescript
{
  id: string;                       // Required
  name?: string;                    // Optional
  description?: string | null;      // Optional
  structure?: TrainingPlanStructure; // Optional
}
```

**Example:**
```typescript
const updatePlan = trpc.trainingPlans.update.useMutation();

const handleUpdatePlan = async (planId: string) => {
  await updatePlan.mutateAsync({
    id: planId,
    name: "Updated Marathon Plan",
    structure: {
      // Only fields you want to change
      target_weekly_tss_max: 500, // Increase max TSS
      // ... rest of structure unchanged
    },
  });
};
```

**Optimistic Update Pattern:**
```typescript
const utils = trpc.useContext();
const updatePlan = trpc.trainingPlans.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.trainingPlans.get.cancel();
    
    // Snapshot previous value
    const previous = utils.trainingPlans.get.getData();
    
    // Optimistically update
    utils.trainingPlans.get.setData(undefined, (old) => ({
      ...old!,
      ...newData,
    }));
    
    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.trainingPlans.get.setData(undefined, context?.previous);
  },
  onSettled: () => {
    // Refetch after mutation
    utils.trainingPlans.get.invalidate();
  },
});
```

**Errors:**
- `NOT_FOUND` - Plan doesn't exist or user doesn't own it
- `BAD_REQUEST` - Invalid structure

---

### 5. Delete Training Plan
Deletes the user's training plan. Warns if there are linked activities.

```typescript
trpc.trainingPlans.delete.useMutation()
```

**Input:**
```typescript
{
  id: string; // Required
}
```

**Returns:**
```typescript
{
  success: boolean;
}
```

**Example:**
```typescript
const deletePlan = trpc.trainingPlans.delete.useMutation();

const handleDeletePlan = async (planId: string) => {
  if (!confirm("Are you sure? This cannot be undone.")) return;
  
  try {
    await deletePlan.mutateAsync({ id: planId });
    // Navigate to create plan screen
    router.push('/plan/create');
  } catch (error) {
    if (error.message.includes("scheduled activity")) {
      alert("This plan has scheduled activities. They will be unlinked.");
    }
  }
};
```

**With Invalidation:**
```typescript
const utils = trpc.useContext();
const deletePlan = trpc.trainingPlans.delete.useMutation({
  onSuccess: () => {
    // Invalidate all related queries
    utils.trainingPlans.get.invalidate();
    utils.trainingPlans.exists.invalidate();
    utils.plannedActivities.invalidate(); // If you have this
  },
});
```

**Errors:**
- `NOT_FOUND` - Plan doesn't exist or user doesn't own it
- `BAD_REQUEST` - Database error or constraint violation

---

### 6. Get Plan by ID
Retrieves a specific plan by ID. Mainly used for verification/debugging.

```typescript
trpc.trainingPlans.getById.useQuery({ id: string })
```

**Example:**
```typescript
const { data: plan } = trpc.trainingPlans.getById.useQuery(
  { id: planId },
  { enabled: !!planId } // Only run if planId exists
);
```

---

## Usage Examples

### Complete Plan Management Hook
```typescript
// hooks/useTrainingPlan.ts
import { trpc } from '@/lib/trpc';

export const useTrainingPlan = () => {
  const utils = trpc.useContext();
  
  const { data: plan, isLoading } = trpc.trainingPlans.get.useQuery();
  const { data: exists } = trpc.trainingPlans.exists.useQuery();
  
  const createMutation = trpc.trainingPlans.create.useMutation({
    onSuccess: () => {
      utils.trainingPlans.get.invalidate();
      utils.trainingPlans.exists.invalidate();
    },
  });
  
  const updateMutation = trpc.trainingPlans.update.useMutation({
    onSuccess: () => {
      utils.trainingPlans.get.invalidate();
    },
  });
  
  const deleteMutation = trpc.trainingPlans.delete.useMutation({
    onSuccess: () => {
      utils.trainingPlans.get.invalidate();
      utils.trainingPlans.exists.invalidate();
    },
  });
  
  return {
    plan,
    hasPlan: exists?.exists ?? false,
    isLoading,
    createPlan: createMutation.mutateAsync,
    updatePlan: updateMutation.mutateAsync,
    deletePlan: deleteMutation.mutateAsync,
    isCreating: createMutation.isLoading,
    isUpdating: updateMutation.isLoading,
    isDeleting: deleteMutation.isLoading,
  };
};

// Usage in component
const MyComponent = () => {
  const { plan, hasPlan, createPlan, updatePlan, deletePlan, isLoading } = useTrainingPlan();
  
  if (isLoading) return <LoadingSpinner />;
  if (!hasPlan) return <CreatePlanButton onClick={() => createPlan(data)} />;
  
  return <PlanDetails plan={plan} onUpdate={updatePlan} onDelete={deletePlan} />;
};
```

### Create Plan with Form Validation
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trainingPlanCreateSchema } from '@repo/core';

const CreatePlanForm = () => {
  const createPlan = trpc.trainingPlans.create.useMutation();
  
  const form = useForm({
    resolver: zodResolver(trainingPlanCreateSchema),
    defaultValues: {
      name: '',
      description: '',
      structure: {
        target_weekly_tss_min: 200,
        target_weekly_tss_max: 400,
        target_activities_per_week: 4,
        max_consecutive_days: 5,
        min_rest_days_per_week: 2,
        intensity_distribution: {
          recovery: 0.25,
          easy: 0.50,
          moderate: 0.15,
          hard: 0.08,
          race: 0.02,
        },
        min_hours_between_hard: 48,
        max_hard_activities_per_week: 2,
      },
    },
  });
  
  const onSubmit = async (data) => {
    try {
      await createPlan.mutateAsync(data);
      router.push('/plan');
    } catch (error) {
      form.setError('root', { message: error.message });
    }
  };
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
    </form>
  );
};
```

---

## Error Handling

### Common Error Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `UNAUTHORIZED` | User not authenticated | No session found |
| `NOT_FOUND` | Resource not found | Plan doesn't exist or wrong owner |
| `BAD_REQUEST` | Invalid input | Failed validation or duplicate plan |
| `INTERNAL_SERVER_ERROR` | Server error | Database connection issue |

### Error Handling Pattern
```typescript
const createPlan = trpc.trainingPlans.create.useMutation({
  onError: (error) => {
    if (error.data?.code === 'BAD_REQUEST') {
      if (error.message.includes('already have')) {
        toast.error('You already have a training plan');
      } else {
        toast.error('Invalid plan configuration');
      }
    } else if (error.data?.code === 'UNAUTHORIZED') {
      router.push('/login');
    } else {
      toast.error('Something went wrong');
    }
  },
});
```

---

## Type Definitions

### Import Types
```typescript
import type {
  TrainingPlanStructure,
  IntensityDistribution,
  PeriodizationTemplate,
  TrainingPlanCreate,
  TrainingPlanUpdate,
} from '@repo/core';
```

### Database Types (after regeneration)
```typescript
import type { Database } from '@repo/supabase';

type TrainingPlan = Database['public']['Tables']['training_plans']['Row'];
type TrainingPlanInsert = Database['public']['Tables']['training_plans']['Insert'];
type TrainingPlanUpdate = Database['public']['Tables']['training_plans']['Update'];
```

---

## Best Practices

1. **Always use the custom hook** for consistent query invalidation
2. **Validate on the frontend** before submitting to reduce errors
3. **Handle loading states** to prevent duplicate submissions
4. **Use optimistic updates** for better UX on updates
5. **Invalidate related queries** after mutations (e.g., planned activities)
6. **Check exists before showing create UI** to prevent confusion
7. **Show helpful error messages** based on error codes
8. **Use TypeScript** for full type safety

---

## Related Documentation
- [HANDOFF.md](../HANDOFF.md) - Feature requirements
- [Implementation Status](./training-plans-implementation-status.md) - Current progress
- [Core Schemas](../../../packages/core/schemas/training_plan_structure.ts) - Validation schemas