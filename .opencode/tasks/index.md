### [20260304-120000] Social Network Enhancements

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Phase 1: Database & Types
  - [x] Phase 2: Backend Logic
  - [x] Phase 3: Mobile Frontend
  - [x] Phase 4: Web Frontend
- **Blockers**: None

---

### [20260304-150000] Search Tab Enhancement

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Phase 1: Backend (tRPC procedures)
    - [x] Create searchUsers procedure
    - [x] Add search to activityPlans.list
    - [x] Add search to trainingPlansCrud.listTemplates
    - [x] Verify/create routes search
  - [x] Phase 2: Frontend - Search Infrastructure
    - [x] Refactor discover.tsx with tabs
    - [x] Implement debounced search
    - [x] Create pagination hooks
  - [x] Phase 3: Result Components
    - [x] Create UserSearchCard (inline in discover.tsx)
    - [x] Create TrainingPlanSearchCard (inline in discover.tsx)
    - [x] Create RouteSearchCard (inline in discover.tsx)
  - [x] Phase 4: Navigation
    - [x] Wire up all entity navigations
  - [x] Phase 5: Polish & Error Handling
    - [x] Implement loading states (skeletons)
    - [x] Implement error states
    - [x] Implement empty states
    - [x] Implement pull-to-refresh
  - [x] Phase 6: Testing - type checked (pre-existing errors unrelated to this feature)
- **Blockers**: None
- **Spec Location**: `.opencode/specs/search-tab-enhancement/`

---

### [20260305-000001] Training Plan Template Library Enhancement Spec

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Archive current active spec in `.opencode/specs/archive/`
  - [x] Research online best practices for template vs execution modeling
  - [x] Define enhanced template structure contract for rich library visuals
  - [x] Define apply-time customization payload and guardrails
  - [x] Create new spec docs (`design.md`, `plan.md`, `tasks.md`)
- **Blockers**: None
- **Spec Location**: `.opencode/specs/2026-03-05_training-plan-template-library-enhancement/`

---

### [20260306-210000] Training Plan Minimal Model Implementation

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Complete remaining Phase 1 core schema/calc cutover
  - [x] Complete `expandMinimalGoalToPlan` caller replacement in core/tRPC/mobile
  - [x] Complete Phase 3 mobile navigation/dashboard/calendar refactor
  - [x] Update affected tests for removed library route and new plan dashboard
  - [x] Run Phase 4 web verification and full monorepo validation
- **Blockers**: None
- **Spec Location**: `.opencode/specs/2026-03-05_training-plan-template-library-enhancement/`

---

### [20260307-004500] Post-Cutover UX Fixes

- **Status**: completed
- **Complexity**: medium
- **Subtasks**:
  - [x] Restore profile goal target-date persistence in mobile plan dashboard + goals router write schema
  - [x] Prevent drag and long-press move interactions for read-only imported calendar events
  - [x] Run focused typecheck/tests for trpc and mobile
- **Blockers**: None

---

### [20260307-011500] Post-Cutover UX Completion Pass

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Replace calendar non-planned event open/edit placeholders with routed detail/edit flow
  - [x] Add dedicated editable training preferences screen and wire from Plan dashboard
  - [x] Add dedicated goal detail screen and route goal cards to it
  - [x] Add/extend tests for plan navigation, route declarations, and event routing helpers
  - [x] Run focused validation (`mobile` + `@repo/trpc` check-types and mobile tests)
- **Blockers**: None

---

### [20260307-172500] Plan Tab Projection UX + Goal Create Fix

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Show inline projection chart with settings entry and remove standalone training preferences summary card from Plan tab
  - [x] Add per-goal readiness list under projection with high-level percentage progress (supports >100%)
  - [x] Surface scheduled/in-progress training plans in Plan tab from scheduled events
  - [x] Fix `goals.create` 500 by backfilling `profile_goals.target_date` column and improve create error diagnostics
  - [x] Apply migration and regenerate Supabase types/schemas
  - [x] Run focused validation (`mobile` + `@repo/trpc` check-types and focused mobile tests)
- **Blockers**: None

---

### [20260307-182500] Calendar Day-Scroller Refactor

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Audit calendar terminology/layout drift and remove plan/preferences coupling from calendar tab
  - [x] Replace mixed card/dashboard layout with full-screen day-by-day schedule scroller
  - [x] Preserve core event workflows (create/open/edit/move/delete/start) in new schedule UI
  - [x] Add focused calendar screen tests for day section rendering and day focus changes
  - [x] Run focused validation (`mobile` check-types and calendar-focused tests)
- **Blockers**: None

---

### [20260308-120500] Training Plan CRUD Navigation + IA Split

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Add dedicated `training-plans-list` management screen for user-owned training plans
  - [x] Normalize training plan route declarations and route constants (`training-plan-detail`, `training-plans-list`)
  - [x] Rewire entry points from Plan tab and Profile to training plan list management flow
  - [x] Disable config-heavy projection tuning in training plan create/edit by default
  - [x] Ensure create/edit tabs degrade cleanly when creation config is hidden (no dead tabs)
  - [x] Update focused route/navigation/tests and run mobile validation
- **Blockers**: None

---

### [20260308-152500] Training Plan Scope + Preferences Tabbed Tuning

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Remove user-facing goal entry from training plan create/edit flow while preserving internal preview/create payload compatibility
  - [x] Add training plan detail hierarchy for template sessions grouped by microcycle (week) and day
  - [x] Rework training preferences into projection-first screen with tabbed adjustment groups
  - [x] Enable goal target metric/value editing and persistence in goal detail CRUD flow
  - [x] Run focused mobile validation (`check-types` + targeted vitest suites)
- **Blockers**: None

---

### [20260308-160500] Canonical Training Plans Audit + UI Alignment

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Audit `@repo/trpc` for legacy `user_training_plans` dependencies and canonical `training_plans` routing drift
  - [x] Remove runtime `user_training_plans`/`user_training_plan_id` dependencies from `@repo/trpc`
  - [x] Align template apply semantics to always schedule events with canonical `events.training_plan_id`
  - [x] Update affected mobile planning UI controls to match canonical training plan semantics
  - [x] Validate with focused `@repo/trpc` + `mobile` checks/tests
- **Blockers**: None

---

### [20260308-172500] Training Plan Session Activity Assignment UX

- **Status**: completed
- **Complexity**: medium
- **Subtasks**:
  - [x] Add owner-only session assign/replace/remove controls in training plan detail structure view
  - [x] Add activity plan picker powered by `activityPlans.list`
  - [x] Persist session `activity_plan_id` changes via `trainingPlans.update` with structure path patching
  - [x] Run focused mobile validation (`check-types` + training-plan deeplink test)
- **Blockers**: None

---

### [20260308-181500] System Template Remake + Publish

- **Status**: completed
- **Complexity**: medium
- **Subtasks**:
  - [x] Replace system training plan templates with deterministic curated set in a new migration
  - [x] Update core sample training plan registry to canonical session-driven template shape
  - [x] Update training-plan publish script to sync canonical training-plan fields
  - [x] Reset local Supabase DB and run template publish scripts for activity plans and training plans
- **Blockers**: None
