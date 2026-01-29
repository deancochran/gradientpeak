# Smart Performance Metrics: Implementation Tasks

## Phase 1: Database Schema Setup

- [ ] **Task 1.1:** Create a new Supabase migration script.
- [ ] **Task 1.2:** Add `normalized_speed_mps` and `temperature` columns to the `activities` table.
- [ ] **Task 1.3:** Create the `effort_type` enum.
- [ ] **Task 1.4:** Create the `activity_efforts` table with all specified columns and constraints.
- [ ] **Task 1.5:** Create the `profile_metric_type` enum.
- [ ] **Task 1.6:** Create the `profile_metrics` table with all specified columns and constraints.
- [ ] **Task 1.7:** Create the index `idx_profile_metrics_lookup` on the `profile_metrics` table.
- [ ] **Task 1.8:** Create the `notifications` table with all specified columns and constraints.
- [ ] **Task 1.9:** Apply the migration to the local development database.
- [ ] **Task 1.10:** Verify that all tables, columns, enums, and indexes are created correctly.

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
