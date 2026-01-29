# Smart Performance Metrics: Implementation Tasks

## Phase 1: Database Schema Setup

**Strict Workflow:**

1. Modify `packages/supabase/schemas/init.sql` (Declarative Source of Truth).
2. Generate migration: `supabase db diff --use-migra -f <name>`.
3. Sync types: `pnpm update-types`.

- [x] **Task 1.1:** Modify `packages/supabase/schemas/init.sql` to include:
  - New columns for `activities` table: `normalized_speed_mps`, `temperature`.
  - New Enums: `effort_type`, `profile_metric_type`.
  - New Tables: `activity_efforts`, `profile_metrics`, `notifications`.
  - Add necessary indexes and foreign key constraints.
- [ ] **Task 1.2:** Generate the migration file by running:
  ```bash
  cd packages/supabase && supabase db diff --use-migra -f smart-performance-metrics
  ```
- [ ] **Task 1.3:** Update Supabase types and Supazod schemas by running:
  ```bash
  cd packages/supabase && pnpm run update-types
  ```

## Phase 2: Backend Logic Implementation

- [ ] **Task 2.1:** Update the FIT file parsing logic to extract peak heart rate.
- [ ] **Task 2.2:** Implement logic to compare peak heart rate with the existing `max_hr` in `profile_metrics` and create a new entry if it's higher.
- [ ] **Task 2.3:** Implement the VO2 Max calculation logic.
- [ ] **Task 2.4:** Create a new tRPC procedure or update an existing one to trigger VO2 Max recalculation when a new `max_hr` or `resting_hr` is recorded.
- [ ] **Task 2.5:** Update the activity file upload process to extract best efforts for standard durations based on the sport.
- [ ] **Task 2.6:** Implement logic to save the extracted best efforts to the `activity_efforts` table.
- [ ] **Task 2.7:** Implement logic to compare new efforts with recent bests and create notifications in the `notifications` table if improvements are detected.
- [ ] **Task 2.8:** Update the zod schema for `PublicActivitiesInsert` to include the new columns.
- [ ] **Task 2.9:** Ensure the final `activities` insert payload is validated against the updated zod schema.
- [ ] **Task 2.10:** Create a new tRPC procedure to handle logging of user metrics to the `profile_metrics` table.

## Phase 3: API and Frontend Integration (Optional - for initial testing)

- [ ] **Task 3.1:** Create a simple UI on the web or mobile app to upload a FIT file.
- [ ] **Task 3.2:** Create a UI to display notifications to the user.
- [ ] **Task 3.3:** Create a UI for users to log their weight, sleep, HRV, and resting heart rate.
- [ ] **Task 3.4:** Display the calculated performance metrics on the user's profile or activity pages.

## Phase 4: Testing and Validation

- [ ] **Task 4.1:** Write unit tests for the new calculation logic in the `@repo/core` package.
- [ ] **Task 4.2:** Write integration tests for the tRPC procedures.
- [ ] **Task 4.3:** Perform end-to-end testing by uploading various FIT files and verifying the data in the database.
- [ ] **Task 4.4:** Test the notification generation by uploading a FIT file with a new personal record.
- [ ] **Task 4.5:** Test the VO2 Max recalculation by manually adding new `max_hr` and `resting_hr` data.
