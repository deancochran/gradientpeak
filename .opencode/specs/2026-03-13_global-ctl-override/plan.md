# Implementation Plan: Global CTL Override

## Phase 1: Core Schema Updates

1. Modify `packages/core/schemas/settings/profile_settings.ts`.
   - Define `athletePreferenceBaselineSchema`.
   - Add `baseline_fitness` to `athletePreferenceProfileSchema`.
   - Update `defaultAthletePreferenceProfile` to include `baseline_fitness: { is_enabled: false }`.
2. Ensure types are exported and available to the tRPC routers.

## Phase 2: tRPC Router Updates

1. **Home Router (`packages/trpc/src/routers/home.ts`)**:
   - Fetch `profile_training_settings` alongside activities.
   - Refactor the CTL/ATL calculation loop to respect `baseline_fitness` if `is_enabled` is true.
   - Handle the decay calculation from `override_date` to the start of the chart window.
2. **Training Plans Router (`packages/trpc/src/routers/training-plans.base.ts`)**:
   - In the plan creation/preview flows, fetch `profile_training_settings`.
   - Inject the global `override_ctl` into the `resolveNoHistoryAnchor` context if `is_enabled` is true and no explicit form override is provided.

## Phase 3: Mobile UI Implementation

1. Update `apps/mobile/app/(internal)/(standard)/training-preferences.tsx`.
   - Add a new tab "Baseline Fitness".
   - Form to toggle `is_enabled`.
   - Inputs for `override_ctl`, `override_atl`, and `override_date`.
