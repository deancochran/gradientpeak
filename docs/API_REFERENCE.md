# API Reference

Complete reference for all tRPC endpoints in GradientPeak.

## Table of Contents

- [Activities](#activities)
- [Activity Plans](#activity-plans)
- [Planned Activities](#planned-activities)
- [Training Plans](#training-plans)
- [Profiles](#profiles)
- [Integrations](#integrations)
- [Authentication](#authentication)

## Setup

### Import tRPC Client

```typescript
import { trpc } from '@/lib/trpc';
```

### React Query Integration

All endpoints use React Query, providing:
- Automatic caching
- Background refetching
- Optimistic updates
- Loading/error states

---

## Activities

### `activities.list`

Query activities by date range.

**Input:**
```typescript
{
  start_date: string;  // ISO 8601 format
  end_date: string;    // ISO 8601 format
}
```

**Returns:**
```typescript
Activity[]  // Array of activity records
```

**Example:**
```typescript
const { data: activities, isLoading } = trpc.activities.list.useQuery({
  start_date: '2024-01-01T00:00:00Z',
  end_date: '2024-01-31T23:59:59Z',
});
```

### `activities.getById`

Get single activity by ID.

**Input:**
```typescript
{
  id: string;  // Activity UUID
}
```

**Returns:**
```typescript
Activity | null
```

**Example:**
```typescript
const { data: activity } = trpc.activities.getById.useQuery({ 
  id: activityId 
});
```

### `activities.update`

Update activity (typically for setting IF/TSS post-completion).

**Input:**
```typescript
{
  id: string;
  intensity_factor?: number;       // 0-200 (IF * 100)
  training_stress_score?: number;  // Integer TSS
  normalized_power?: number;       // Integer watts
  // ... other activity fields
}
```

**Returns:**
```typescript
Activity  // Updated activity
```

**Example:**
```typescript
const updateActivity = trpc.activities.update.useMutation();

await updateActivity.mutateAsync({
  id: activityId,
  intensity_factor: 85,  // IF = 0.85
  training_stress_score: 120,
  normalized_power: 255,
});
```

---

## Activity Plans

Activity plans are reusable activity templates.

### `activityPlans.list`

List activity plans with optional filtering.

**Input:**
```typescript
{
  activity_type?: 'outdoor_run' | 'outdoor_bike' | 'indoor_treadmill' | 
                  'indoor_bike_trainer' | 'indoor_strength' | 'indoor_swim';
  limit?: number;    // Default: 50
  offset?: number;   // Default: 0
}
```

**Returns:**
```typescript
{
  items: ActivityPlan[];
  total: number;
  hasMore: boolean;
}
```

**Example:**
```typescript
const { data, fetchNextPage } = trpc.activityPlans.list.useInfiniteQuery({
  activity_type: 'outdoor_bike',
  limit: 20,
});
```

### `activityPlans.getById`

Get single activity plan with full structure.

**Input:**
```typescript
{
  id: string;
}
```

**Returns:**
```typescript
ActivityPlan | null
```

**Example:**
```typescript
const { data: plan } = trpc.activityPlans.getById.useQuery({ 
  id: planId 
});

if (plan) {
  const steps = plan.structure.steps;
  // Process steps...
}
```

### `activityPlans.create`

Create new activity plan.

**Input:**
```typescript
{
  activity_type: ActivityType;
  name: string;
  description?: string;
  estimated_duration: number;  // Seconds
  estimated_tss?: number;
  structure: ActivityPlanStructure;
}
```

**Returns:**
```typescript
ActivityPlan  // Created plan
```

**Example:**
```typescript
const createPlan = trpc.activityPlans.create.useMutation();

await createPlan.mutateAsync({
  activity_type: 'indoor_bike_trainer',
  name: 'Sweet Spot Intervals',
  description: '3x10 min @ 88-94% FTP',
  estimated_duration: 3600,
  estimated_tss: 65,
  structure: {
    steps: [
      { name: 'Warm Up', duration: { value: 10, unit: 'minutes' }, ... },
      { repetitions: { repeat: 3, steps: [...] } },
      { name: 'Cool Down', duration: { value: 10, unit: 'minutes' }, ... },
    ],
  },
});
```

### `activityPlans.update`

Update existing activity plan.

**Input:**
```typescript
{
  id: string;
  name?: string;
  description?: string;
  structure?: ActivityPlanStructure;
  // ... partial update
}
```

**Returns:**
```typescript
ActivityPlan
```

### `activityPlans.delete`

Delete activity plan.

**Input:**
```typescript
{
  id: string;
}
```

**Returns:**
```typescript
{ success: boolean }
```

---

## Planned Activities

Planned activities are scheduled activities.

### `plannedActivities.list`

List all planned activities (optionally filtered by date).

**Input:**
```typescript
{
  start_date?: string;
  end_date?: string;
}
```

**Returns:**
```typescript
PlannedActivity[]
```

**Example:**
```typescript
const { data: planned } = trpc.plannedActivities.list.useQuery({
  start_date: startOfWeek.toISOString(),
  end_date: endOfWeek.toISOString(),
});
```

### `plannedActivities.getToday`

Get today's planned activities.

**Input:** None

**Returns:**
```typescript
PlannedActivity[]
```

**Example:**
```typescript
const { data: todaysActivities } = trpc.plannedActivities.getToday.useQuery();
```

### `plannedActivities.create`

Schedule a new activity.

**Input:**
```typescript
{
  activity_plan_id: string;     // Reference to activity plan
  scheduled_date: string;        // ISO 8601 date
  notes?: string;
}
```

**Returns:**
```typescript
PlannedActivity
```

**Example:**
```typescript
const schedulePlan = trpc.plannedActivities.create.useMutation();

await schedulePlan.mutateAsync({
  activity_plan_id: planId,
  scheduled_date: '2024-02-15T06:00:00Z',
  notes: 'Morning ride before work',
});
```

### `plannedActivities.update`

Update scheduled activity.

**Input:**
```typescript
{
  id: string;
  scheduled_date?: string;
  notes?: string;
  status?: 'pending' | 'completed' | 'skipped';
}
```

**Returns:**
```typescript
PlannedActivity
```

### `plannedActivities.delete`

Remove scheduled activity.

**Input:**
```typescript
{
  id: string;
}
```

**Returns:**
```typescript
{ success: boolean }
```

---

## Training Plans

Training plans define long-term training structure.

### `trainingPlans.get`

Get user's current training plan.

**Input:** None (uses authenticated user from context)

**Returns:**
```typescript
TrainingPlan | null
```

**Example:**
```typescript
const { data: plan, isLoading } = trpc.trainingPlans.get.useQuery();

if (plan) {
  const { target_weekly_tss_min, target_weekly_tss_max } = plan.structure;
}
```

### `trainingPlans.exists`

Check if user has a training plan.

**Input:** None

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
  // Show create plan CTA
}
```

### `trainingPlans.create`

Create new training plan (only one per user).

**Input:**
```typescript
{
  name: string;
  description?: string;
  structure: TrainingPlanStructure;
}
```

**TrainingPlanStructure:**
```typescript
{
  target_weekly_tss_min: number;
  target_weekly_tss_max: number;
  target_activities_per_week: number;  // 1-7
  max_consecutive_days: number;        // 1-7
  min_rest_days_per_week: number;      // 0-7
  min_hours_between_hard: number;      // Hours between hard activities
  max_hard_activities_per_week: number;  // 0-7
  periodization_template?: {
    starting_ctl: number;
    target_ctl: number;
    ramp_rate: number;         // 0-1
    target_date: string;       // ISO date
  };
}
```

**Returns:**
```typescript
TrainingPlan
```

**Example:**
```typescript
const createPlan = trpc.trainingPlans.create.useMutation();

await createPlan.mutateAsync({
  name: 'Marathon Training',
  description: '12-week build to spring marathon',
  structure: {
    target_weekly_tss_min: 300,
    target_weekly_tss_max: 450,
    target_activities_per_week: 5,
    max_consecutive_days: 6,
    min_rest_days_per_week: 1,
    min_hours_between_hard: 48,
    max_hard_activities_per_week: 2,
    periodization_template: {
      starting_ctl: 50,
      target_ctl: 80,
      ramp_rate: 0.05,
      target_date: '2024-05-01',
    },
  },
});
```

### `trainingPlans.update`

Update existing training plan.

**Input:**
```typescript
{
  id: string;
  name?: string;
  description?: string;
  structure?: Partial<TrainingPlanStructure>;
}
```

**Returns:**
```typescript
TrainingPlan
```

### `trainingPlans.delete`

Delete training plan.

**Input:**
```typescript
{
  id: string;
}
```

**Returns:**
```typescript
{ success: boolean }
```

**Note:** Warns if plan has linked activities.

### `trainingPlans.getCurrentStatus`

Get current training status (CTL/ATL/TSB).

**Input:** None

**Returns:**
```typescript
{
  ctl: number;         // Chronic Training Load (fitness)
  atl: number;         // Acute Training Load (fatigue)
  tsb: number;         // Training Stress Balance (form)
  form: 'fresh' | 'optimal' | 'neutral' | 'tired' | 'overreaching';
  weeklyTSS: number;   // Current week's TSS
  upcomingActivities: {
    id: string;
    name: string;
    scheduled_date: string;
    estimated_tss: number;
  }[];
}
```

**Example:**
```typescript
const { data: status } = trpc.trainingPlans.getCurrentStatus.useQuery();

if (status) {
  console.log(`CTL: ${status.ctl}, ATL: ${status.atl}, TSB: ${status.tsb}`);
  console.log(`Form: ${status.form}`);
}
```

### `trainingPlans.getIntensityDistribution`

Get intensity zone distribution (7 zones, TSS-weighted).

**Input:**
```typescript
{
  start_date: string;
  end_date: string;
}
```

**Returns:**
```typescript
{
  distribution: {
    recovery: number;      // % of total TSS
    endurance: number;
    tempo: number;
    threshold: number;
    vo2max: number;
    anaerobic: number;
    neuromuscular: number;
  };
  totalTSS: number;
  activityCount: number;
}
```

**Example:**
```typescript
const { data } = trpc.trainingPlans.getIntensityDistribution.useQuery({
  start_date: startOfMonth.toISOString(),
  end_date: endOfMonth.toISOString(),
});
```

### `trainingPlans.getIntensityTrends`

Get weekly intensity trends.

**Input:**
```typescript
{
  weeks_back: number;  // Number of weeks to analyze (default: 4)
}
```

**Returns:**
```typescript
{
  weeks: {
    week_start: string;
    distribution: IntensityDistribution;
    totalTSS: number;
    activityCount: number;
  }[];
  recommendation: string;
}
```

**Example:**
```typescript
const { data: trends } = trpc.trainingPlans.getIntensityTrends.useQuery({
  weeks_back: 12,
});
```

### `trainingPlans.checkHardActivitySpacing`

Analyze recovery between hard activities.

**Input:**
```typescript
{
  start_date: string;
  end_date: string;
  min_hours: number;  // Minimum hours between hard activities
}
```

**Returns:**
```typescript
{
  hasViolations: boolean;
  violations: {
    activity1: Activity;
    activity2: Activity;
    hoursBetween: number;
  }[];
  recommendation: string;
}
```

**Example:**
```typescript
const { data } = trpc.trainingPlans.checkHardActivitySpacing.useQuery({
  start_date: thirtyDaysAgo.toISOString(),
  end_date: today.toISOString(),
  min_hours: 48,
});
```

---

## Profiles

### `profiles.getCurrent`

Get authenticated user's profile.

**Input:** None

**Returns:**
```typescript
{
  id: string;
  username: string;
  threshold_hr: number | null;
  ftp: number | null;
  weight_kg: number;
  gender: string;
  dob: string;
  preferred_units: 'metric' | 'imperial';
  avatar_url: string | null;
  bio: string | null;
}
```

**Example:**
```typescript
const { data: profile } = trpc.profiles.getCurrent.useQuery();

if (profile) {
  console.log(`FTP: ${profile.ftp}W, HR: ${profile.threshold_hr}bpm`);
}
```

### `profiles.update`

Update profile settings.

**Input:**
```typescript
{
  username?: string;
  threshold_hr?: number;
  ftp?: number;
  weight_kg?: number;
  gender?: string;
  dob?: string;
  preferred_units?: 'metric' | 'imperial';
  avatar_url?: string;
  bio?: string;
}
```

**Returns:**
```typescript
Profile
```

**Example:**
```typescript
const updateProfile = trpc.profiles.update.useMutation();

await updateProfile.mutateAsync({
  ftp: 285,
  threshold_hr: 165,
  weight_kg: 72,
});
```

---

## Integrations

### `integrations.connectStrava`

Connect Strava account.

**Input:**
```typescript
{
  code: string;  // OAuth authorization code
}
```

**Returns:**
```typescript
{
  success: boolean;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
  };
}
```

### `integrations.syncActivities`

Sync activities from Strava.

**Input:**
```typescript
{
  since?: string;  // ISO date (default: last 30 days)
}
```

**Returns:**
```typescript
{
  synced: number;
  failed: number;
}
```

---

## Authentication

### `auth.signUp`

Create new user account.

**Input:**
```typescript
{
  email: string;
  password: string;
  username: string;
}
```

**Returns:**
```typescript
{
  user: User;
  session: Session;
}
```

### `auth.signIn`

Sign in existing user.

**Input:**
```typescript
{
  email: string;
  password: string;
}
```

**Returns:**
```typescript
{
  user: User;
  session: Session;
}
```

### `auth.signOut`

Sign out current user.

**Input:** None

**Returns:**
```typescript
{ success: boolean }
```

---

## Error Handling

### Error Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `UNAUTHORIZED` | Not authenticated | No session found |
| `FORBIDDEN` | Not authorized | Trying to access other user's data |
| `NOT_FOUND` | Resource not found | Invalid ID or deleted resource |
| `BAD_REQUEST` | Invalid input | Failed validation |
| `CONFLICT` | Resource conflict | Duplicate entry (e.g., second training plan) |
| `INTERNAL_SERVER_ERROR` | Server error | Database or unexpected error |

### Error Handling Pattern

```typescript
const createPlan = trpc.trainingPlans.create.useMutation({
  onError: (error) => {
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        router.push('/login');
        break;
      case 'CONFLICT':
        toast.error('You already have a training plan');
        break;
      case 'BAD_REQUEST':
        toast.error(`Invalid input: ${error.message}`);
        break;
      default:
        toast.error('Something went wrong');
    }
  },
  onSuccess: (data) => {
    toast.success('Plan created successfully!');
    router.push(`/plans/${data.id}`);
  },
});
```

## React Query Patterns

### Optimistic Updates

```typescript
const utils = trpc.useContext();

const updateActivity = trpc.activities.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.activities.getById.cancel({ id: newData.id });
    
    // Snapshot previous value
    const previous = utils.activities.getById.getData({ id: newData.id });
    
    // Optimistically update
    utils.activities.getById.setData({ id: newData.id }, (old) => ({
      ...old!,
      ...newData,
    }));
    
    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.activities.getById.setData(
      { id: newData.id }, 
      context?.previous
    );
  },
  onSettled: (data, error, variables) => {
    // Refetch after mutation
    utils.activities.getById.invalidate({ id: variables.id });
  },
});
```

### Infinite Queries

```typescript
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = trpc.activityPlans.list.useInfiniteQuery(
  { limit: 20 },
  {
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.offset + 20 : undefined,
  }
);

// Flatten pages
const allPlans = data?.pages.flatMap(page => page.items) ?? [];
```

### Dependent Queries

```typescript
// Only fetch activity details if ID is available
const { data: activity } = trpc.activities.getById.useQuery(
  { id: activityId },
  { enabled: !!activityId }
);

// Fetch streams only after activity is loaded
const { data: streams } = trpc.activities.getStreams.useQuery(
  { activityId: activity!.id },
  { enabled: !!activity }
);
```

---

**Last Updated:** 2025-01-23
