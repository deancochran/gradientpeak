# Smart Performance Metrics: Implementation Tasks

## Phase 1: Database Schema Setup

**Strict Workflow:**

1. Modify `packages/supabase/schemas/init.sql` (Declarative Source of Truth).
2. Generate migration: `supabase db diff --use-migra -f <name>`.
3. Sync types: `pnpm update-types`.

- [ ] **Task 1.1:** Modify `packages/supabase/schemas/init.sql` to include:
  - New columns for `activities` table: `normalized_speed_mps`, `avg_temperature`, `efficiency_factor`, `aerobic_decoupling`, `training_effect` (enum).
  - New Enums: `effort_type`, `profile_metric_type`, `training_effect_label`.
  - New Tables: `activity_efforts`, `profile_metrics`, `notifications`.
  - Add necessary indexes and foreign key constraints.
- [ ] **Task 1.2:** Generate the migration file by running:
  ```bash
  cd packages/supabase && supabase db diff -f smart-performance-metrics
  ```
- [ ] **Task 1.3:** Update Supabase types and Supazod schemas by running:
  ```bash
  cd packages/supabase && pnpm run update-types
  ```

## Phase 2: Backend Logic Implementation

- [ ] **Task 2.1:** Update the FIT file parsing logic to extract max heart rate.
- [ ] **Task 2.2:** Implement logic to compare peak heart rate with the existing `max_hr` in `profile_metrics` and create a new entry if it's higher.
- [ ] **Task 2.4:** Create a new tRPC procedure or update an existing one to trigger VO2 Max recalculation when a new `max_hr` or `resting_hr` is recorded and uploaded to the profile_metrics table.
- [ ] **Task 2.5:** Update the activity file upload process to extract best efforts for standard durations: Short (Sprints) 5s, 10s, 30s Medium (Hard Efforts) 1m, 2m, 5m, 8m, Long (Endurance) 10m, 20m, 30m, 60m, Ultra (Pacing) 90m, 3 hours
- [ ] **Task 2.5.1** Implement sliding best effort window to ensure the best effort within a time frame is selected, ensuring the first found effort for specified duration isn't evaulated as the best and checks all possible acceptable activity window periods
- [ ] **Task 2.6:** Implement logic to save ALL extracted best efforts to the `activity_efforts` table (for redundancy and fault tolerance), not just personal records.
- [ ] **Task 2.7:** Implement logic to compare new efforts with recent bests and create notifications in the `notifications` table if improvements are detected.
- [ ] **Task 2.8:** Implement Weather API integration: Fetch temperature using Google Weather API based on Start/End GPS coordinates if device data is missing, and store the average in `avg_temperature`.
- [ ] **Task 2.9:** Ensure the final `activities` insert payload is validated against the zod schema.

Note: Unit Testing, E2E Testing, and validation of changes will happen later. Use `tsc --noEmit` on the packages and apps that were changed (`core`, `trpc`, `mobile`, `web`). Ensure that the type check / linting pass. Manual testing will be run to ensure the results of the changes are as expected
