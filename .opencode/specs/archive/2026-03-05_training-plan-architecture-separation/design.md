# Training Plan Architecture Separation

## Problem Statement

Currently, the `training_plans` table and the `training-plan.tsx` UI screen conflate two entirely different concepts:

1. **The Template (The "What")**: The reusable structure of a plan (e.g., "12-Week Marathon Prep").
2. **The Execution (The "How it's going")**: A specific user's active enrollment in that plan, complete with their personal start dates, fitness curves, and scheduled events.

This conflation causes several issues:

- `training-plan.tsx` shows template actions (Save to Library) next to highly personal execution data (Plan Insights, Fitness Progress Chart).
- The `is_active` flag is on the template itself, which shouldn't exist on a template.
- Deleting a template warns that it will delete all associated planned activities, which shouldn't happen if it's just a template.
- When a user applies a template multiple times (e.g., for different races), all events link back to the exact same template ID, making it impossible to group executions separately.

## Proposed Architecture

### 1. Database Schema Changes

#### A. The Template (`training_plans` table)

This becomes a pure, stateless template.

- **Keep:** `id`, `profile_id` (Author), `name`, `description`, `structure`, `is_system_template`, `template_visibility`, `likes_count`, `comments_count`, `created_at`, `updated_at`.
- **Remove:** `is_active`.
- **Behavior:** When a user edits a template they own, it updates the structure for _future_ applications, but shouldn't retroactively change the calendars of users who already applied it.

#### B. The Execution (`user_training_plans` - NEW TABLE)

When a user clicks "Apply Template", a record is created in this new table.

- `id` (uuid)
- `profile_id` (uuid)
- `training_plan_id` (uuid) -> references the template
- `status` (enum: 'active', 'paused', 'completed', 'abandoned') -> Replaces `is_active`
- `start_date` (date)
- `target_date` (date)
- `snapshot_structure` (jsonb) -> Copies the template's structure at the time of application.
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### C. The Schedule (`events` table)

- Change `training_plan_id` to point to the new `user_training_plans.id` (the enrollment), OR add a `user_training_plan_id` column. This groups the scheduled events under that specific application of the plan.

### 2. UI Architecture Split & Screen Audit

The current UI heavily mixes these concepts. Here is how the screens will be refactored:

#### Screen 1: `training-plan-detail.tsx` (The Template View)

_Replaces the template-viewing portions of the current `training-plan.tsx`._

- **Route:** `/(internal)/(standard)/training-plan?id={id}` (Keeps existing route for deep links).
- **Purpose:** Viewing a plan from the Library or Social Feed.
- **Content:** Plan Name, Author, Description, Likes/Comments, Privacy toggle (if owner), and a visual breakdown of the `structure` (e.g., "4 days/week", "Target TSS: 300-500", "12 Weeks").
- **Actions:** "Save to Library", "Apply to Calendar" (prompts for start/end dates).
- **Rules:** NO user-specific fitness data. NO `is_active` toggle. Read-only unless you are the author (in which case you get an "Edit Template" button).

#### Screen 2: `active-plan-dashboard.tsx` (The Execution View)

_Extracts the execution-tracking portions of the current `training-plan.tsx`._

- **Route:** `/(internal)/(standard)/active-plan` (New route).
- **Purpose:** The user's personal dashboard for their currently active plan.
- **Content:** `<PlanVsActualChart>`, `<WeeklyProgressCard>`, Adherence/Readiness insights, and Upcoming Activities.
- **Actions:** "Pause Plan", "Adjust Schedule", "End Plan".

#### Component 1: `TrainingPlanListItem.tsx`

- **Current:** Shows an "Active" badge based on `plan.is_active`.
- **Change:** Remove the "Active" badge logic entirely. This component is used in the Library/Discover tabs to show _templates_, which are inherently stateless.

#### Screen 3: `plan.tsx` (The Plan Tab)

- **Current:** The top summary card points to the conflated `training-plan.tsx` and relies on the template's `is_active` flag.
- **Change:** The summary card must now fetch the user's `active` record from `user_training_plans`. The "Open Full Plan" button will route to the new `/active-plan` dashboard instead of the template detail view.

#### Screens 4 & 5: `training-plan-edit.tsx` & `training-plan-create.tsx`

- **Current:** Wraps `TrainingPlanComposerScreen`.
- **Change:** These remain focused purely on editing the _template_ structure. They should no longer have any concept of `is_active` or execution state.

### 3. Implications & User Experience

#### Plan Configuration & Customization

- **During Application:** When applying a template, users must configure their specific execution by selecting either a `start_date` or a `target_date` (e.g., race day). The system will map the template's relative weeks/days to absolute calendar dates.
- **During Execution:** Because `user_training_plans` stores a `snapshot_structure`, users can safely modify their active plan (e.g., dragging a long run from Sunday to Saturday, or scaling down the intensity of a week) without altering the original author's template.

#### Restrictions on Applying Plans

- Users can only apply templates they own, or templates where `template_visibility` allows access (e.g., public library plans).
- A template must be fully valid (complete structure) before it can be applied.

#### Active Plan Limits (Concurrency)

- **Rule:** Users may only have **one 'active' training plan at a time**.
- **Why:** Training metrics (Target TSS, Readiness, Fatigue modeling) assume a singular holistic training load. Conflating multiple active plans makes daily recommendations impossible to calculate accurately.
- **Behavior:** If a user attempts to apply a new template while another plan is currently `active`, the UI must prompt them to either `pause`, `complete`, or `abandon` their current plan before the new application can proceed.
