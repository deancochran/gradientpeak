# Tasks: Global CTL Override

## Phase 1: Core Schema Updates

- [ ] Define `athletePreferenceBaselineSchema` in `packages/core/schemas/settings/profile_settings.ts`.
- [ ] Add `baseline_fitness` to `athletePreferenceProfileSchema`.
- [ ] Update `defaultAthletePreferenceProfile` with default `baseline_fitness` values.

## Phase 2: tRPC Router Updates

- [ ] Update `packages/trpc/src/routers/home.ts` to fetch `profile_training_settings`.
- [ ] Refactor CTL/ATL calculation in `home.ts` to use `override_ctl`, `override_atl`, and `override_date` when `is_enabled` is true.
- [ ] Update `packages/trpc/src/routers/training-plans.base.ts` to fall back to the global CTL override during plan creation/preview.

## Phase 3: Mobile UI Implementation

- [ ] Update `apps/mobile/app/(internal)/(standard)/training-preferences.tsx` to include a "Baseline Fitness" tab.
- [ ] Implement form with toggle, CTL/ATL inputs, and date picker within the new tab.
