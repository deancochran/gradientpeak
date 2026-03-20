# Global CTL Override for Advanced Athletes

## Problem

Advanced athletes who join GradientPeak without importing historical data (e.g., from Strava or Garmin) start with a Chronic Training Load (CTL) of 0. When they attempt to generate a training plan for an ambitious goal (like a 2:30 marathon), the projection engine's safety heuristics cap their weekly volume growth (e.g., max 10% TSS increase per week). This results in plans with insufficient volume to meet their goals, leading to low readiness scores and frustration.

While adding `activity_efforts` establishes an athlete's _intensity_ capabilities (how fast they are), it does not establish their _durability_ (how much volume they can handle).

## Solution

Introduce a **Global CTL Override** feature within the user's profile training settings. This allows advanced athletes to manually declare their baseline fitness (CTL and ATL) without needing to upload historical FIT files.

This setting must be **togglable**, meaning users can explicitly enable or disable the override. By default, the override is disabled (`false`).

## Architecture

### 1. Core Schema Updates

Update `athletePreferenceProfileSchema` in `@repo/core` to include a new `baseline_fitness` configuration.

```typescript
export const athletePreferenceBaselineSchema = z
  .object({
    is_enabled: z.boolean().default(false),
    override_ctl: z.number().min(0).max(250).optional(),
    override_atl: z.number().min(0).max(250).optional(),
    override_date: z.string().datetime().optional(),
  })
  .strict();
```

Add this to `athletePreferenceProfileSchema`:

```typescript
export const athletePreferenceProfileSchema = z
  .object({
    // ... existing fields
    baseline_fitness: athletePreferenceBaselineSchema.optional(),
  })
  .strict();
```

### 2. Dashboard Calculation (`home.ts`)

Update the fitness trends calculation in `packages/trpc/src/routers/home.ts`.

- Fetch the user's `profile_training_settings`.
- If `baseline_fitness.is_enabled` is true and `override_ctl` is set, initialize the calculation with that value on the `override_date`.
- Apply standard decay from the `override_date` to the present day, adding any new activities along the way.

### 3. Plan Creation (`training-plans.base.ts`)

Update the plan generator's context builder (`resolveNoHistoryAnchor`).

- If the user doesn't explicitly provide a `starting_ctl_override` in the plan creation form, fall back to their global profile override:
  ```typescript
  const startingCtlOverride =
    input.startingCtlOverride ??
    (profileSettings?.baseline_fitness?.is_enabled
      ? profileSettings?.baseline_fitness?.override_ctl
      : undefined);
  ```

### 4. Mobile UI

Add the baseline fitness controls to the existing Training Preferences screen.

- Location: `apps/mobile/app/(internal)/(standard)/training-preferences.tsx`.
- Add controls within the existing form (after the Goal Strategy tab or as a new section).
- Controls:
  - Toggle switch for "Enable Manual Fitness Baseline".
  - Number inputs for CTL and ATL (visible only when enabled).
  - Date picker for when this baseline was established (defaults to today).
