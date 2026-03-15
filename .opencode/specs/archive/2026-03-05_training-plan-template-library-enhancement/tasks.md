# Tasks: Profile Goals + Training Plans Minimal Model

## Pre-requisites

- [x] Review `design.md` and `plan.md` to ensure full context understanding.
- [x] Ensure local database is running (`pnpm supabase start`).

## Cross-Reference Safety Gate (Run During Every Phase)

- [x] After removing/replacing any core schema export, run `pnpm check-types` and fix all downstream compiler errors before continuing.
- [x] After DB column removals (`is_active`, `status`, `primary_goal_id`), update all repository/router/application usages in the same phase (no deferred references).
- [x] After replacing `expandMinimalGoalToPlan`, update all imports/callers in core, tRPC, and mobile before proceeding.
- [x] Update tests and seed/scripts that reference removed fields or legacy plan shape in the same commit as production code changes.

## Phase 1: Database & Core Package Refactor

- [x] **DB**: Create migration for `profile_goals` table.
- [x] **DB**: Create migration for `profile_training_settings` table (single JSONB column).
- [x] **DB**: Create migration for `training_plans` (add `is_public`, remove `status`, `primary_goal_id`, `is_active`).
- [x] **DB**: Generate updated Supabase types (`pnpm run generate-types`).
- [x] **Core**: Create `packages/core/schemas/goals/profile_goals.ts` (reuse `goalV2Schema` logic).
- [x] **Core**: Create `packages/core/schemas/settings/profile_settings.ts` (repurpose `TrainingPlanCreationConfig`).
- [x] **Core**: Refactor `packages/core/schemas/training-plan-structure/*` to remove embedded goals from `periodizedPlanBaseShape`.
- [x] **Core**: Delete legacy `goalV2Schema` and `goalTargetV2Schema`.
- [x] **Core**: Implement `materializePlanToEvents(planStructure, startDate)` pure function.
- [x] **Core**: Remove outdated calculation functions that relied on embedded goals.
- [x] **Core/Refs**: Update `packages/core/schemas/index.ts` and `packages/core/schemas/form-schemas.ts` exports/usages after goal schema extraction.
- [x] **Validation**: Run `pnpm check-types` and `pnpm test` in `@repo/core`.

## Phase 2: tRPC API Layer

- [x] **tRPC**: Create `packages/trpc/src/routers/goals.ts` router with CRUD operations.
- [x] **tRPC**: Create `packages/trpc/src/routers/profile_settings.ts` router with `getForProfile` and `upsert` operations (ensure coach authorization).
- [x] **tRPC**: Refactor `training_plans.ts` to remove old procedures relying on embedded goals.
- [x] **tRPC**: Update `applyPlan` procedure in `training_plans.ts` using `materializePlanToEvents`.
- [x] **tRPC/Refs**: Update creation-config and feasibility call sites in `packages/trpc/src/application/training-plan/*` and `packages/trpc/src/routers/training-plans.base.ts`.
- [x] **tRPC/Refs**: Remove active-lifecycle assumptions tied to removed `training_plans` columns.
- [x] **Validation**: Run `pnpm check-types` and `pnpm test` in `@repo/trpc`.

## Phase 3: Mobile App Refactor

- [x] **Mobile/State**: Create hooks/stores for fetching `profile_goals` and `profile_settings` independently.
- [x] **Mobile/UI**: Reorganize components into `components/goals/`, `components/calendar/`, and `components/settings/`.
- [x] **Mobile/Navigation**: Remove the Library tab (`library.tsx` and `plan-library.tsx`).
- [x] **Mobile/Calendar**: Implement the new `calendar.tsx` tab (Month View and Schedule View with drag-and-drop).
- [x] **Mobile/Plan**: Refactor `plan.tsx` into the unified dashboard with Forecasted Projection, Goal Management, Training Plan Management, and Training Preferences.
- [x] **Mobile/Composer**: Repurpose `GoalSelectionStep.tsx` as a standalone Add/Edit Goal modal.
- [x] **Mobile/Profile**: Update User Profile screen with individual buttons linking to unique, private screens for user-owned records.
- [x] **Mobile/Refs**: Update `lib/training-plan-form/localPreview.ts`, `lib/training-plan-form/validation.ts`, `lib/hooks/useHomeData.ts`, and `lib/hooks/useTrainingPlanSnapshot.ts` to the new goal/settings sources.

## Phase 4: Web App Verification & Final Review

- [x] **Web**: Run `pnpm --filter web check-types && pnpm --filter web build` to ensure no shared type changes broke the web app.
- [x] **Final Review**: Run full monorepo CI checks: `pnpm check-types && pnpm lint && pnpm test`.

## Follow-up UX Adjustments

- [x] Add projection card header settings action in Plan tab that routes to training preferences.
- [x] Add unsaved draft-driven projection preview to training preferences with immediate chart updates.
- [x] Show goal readiness percentages directly under the Plan tab projection chart (supports readiness above 100%).
- [x] Surface scheduled/in-progress training plans in Plan tab training plan management section.
- [x] Remove standalone Training Preferences summary card from Plan tab.
- [x] Refactor Calendar tab into a calendar-first screen and remove plan/preferences summary cards.

## Post-Cutover UX Domain Updates (2026-03-08)

- [x] Remove user-facing goal entry from training plan create/edit composer while preserving internal generation payload defaults.
- [x] Add training plan detail structure breakdown grouped by microcycle/week and day with empty-state handling.
- [x] Reorganize training preferences controls into tabbed adjustment groups under the live projection preview.
- [x] Enable goal target metric/value display and edit/save flow in goal detail + modal editor.

## Backend Canonical Plan Cutover (2026-03-08)

- [x] Remove active tRPC runtime dependencies on `user_training_plans`.
- [x] Refactor `trainingPlans.applyTemplate` to always materialize events with canonical `events.training_plan_id` semantics.
- [x] Ensure non-owned/system/public template apply creates a user-owned `training_plans` copy and returns canonical `applied_plan_id`.
- [x] Refactor events/home/repository active-plan resolution to canonical `training_plans` + `events.training_plan_id` behavior.
- [x] Update impacted `@repo/trpc` tests for canonical apply-template semantics.

## Training Plan Detail Session Activity Assignment (2026-03-08)

- [x] Add owner-only per-session assign/replace/remove controls in training plan detail grouped structure view.
- [x] Add activity plan picker dialog sourced from `trpc.activityPlans.list` and patch session references via `trpc.trainingPlans.update`.
- [x] Persist updates by cloning `plan.structure`, updating only target session `activity_plan_id` and title fallback, then refetch/invalidate with success/error alerts.

## System Training Plan Template Remake (2026-03-08)

- [x] Add deterministic migration to replace all existing `is_system_template = true` rows.
- [x] Seed a curated session-driven system template set aligned to canonical `training_plans.structure` semantics.
- [x] Ensure inserted templates remain system/public (`profile_id = null`, `is_system_template = true`, `template_visibility = 'public'`).
- [x] Update `@repo/core` training plan sample registry to match the curated canonical template set.
- [x] Update training-plan publish script to sync canonical fields (`structure`, `sessions_per_week_target`, `duration_hours`, visibility/publicity flags).
- [x] Reset local Supabase DB and publish system activity + training plan templates via seed scripts.

## Mobile Detail + Calendar Routing Follow-up (2026-03-09)

- [x] Add microcycle weekly load bars and linked activity-plan structure visuals in training-plan detail for owner and non-owner templates.
- [x] Route calendar event taps directly to event detail and remove local slide-up event detail modal while preserving long-press action flows.
- [x] Update planned-event route semantics and event detail with linked activity-plan bridge card, compact timeline chart, and activity-plan detail navigation.

## Plan Tab Projection UX Alignment (2026-03-09)

- [x] Prefer `snapshot.insightTimeline.timeline` as the Forecasted Projection chart source on Plan tab while preserving curve-data fallback.
- [x] Update projection summary copy to reflect projection/planned/actual adherence semantics when timeline data exists.
- [x] Clarify timeline-mode chart labels and legend text to explicitly name Projection (Ideal), Planned (Scheduled), and Actual (Recorded).

## Compact Projection Chart + Active Plan Cleanup (2026-03-09)

- [x] Rework `PlanVsActualChart` into a compact reusable chart with sparse x-axis labels, series toggle chips, and selectable date scrubber metrics while preserving timeline + CTL fallback prop compatibility.
- [x] Move training preferences chart to the top with direct tab group under chart and rename tabs to `Profile`, `Behavior`, `Availability`, and `Limits`.
- [x] Remove Plan tab active-plan navigation redundancy and keep settings shortcut to training preferences.
- [x] Remove `ROUTES.PLAN.ACTIVE_PLAN` and retire the unreferenced `active-plan` screen route file.
- [x] Update focused mobile tests for plan navigation + training preferences tab labels and run targeted validation.

## PlanVsActualChart Victory Native Refactor (2026-03-09)

- [x] Replace `react-native-chart-kit` usage in `PlanVsActualChart` with compact `victory-native` `CartesianChart` + `Line` rendering while preserving existing props/types and timeline + fallback data behavior.

## Insight Timeline Semantic Alignment (2026-03-09)

- [x] Add projection-aware ideal TSS derivation in `trainingPlans.getInsightTimeline` using profile goals, profile settings defaults, and profile-aware creation context with safe fallback to block-based estimate.
- [x] Keep timeline API shape unchanged while preserving scheduled and actual TSS calculations.
- [x] Extend mobile default insight timeline window to include near-future projection context while preserving explicit `insightWindow` override behavior.

## Plan Tab Chart Focused Mobile UI Update (2026-03-09)

- [x] Remove date/week scrubber interaction and selected-point metrics panel from `PlanVsActualChart` so all timeline points remain visible without selection.
- [x] Increase Plan tab chart footprint and chart plotting area while keeping Y-axis domain anchored at `0`.
- [x] Add explicit chart axis labels (`time/date` for X-axis and `weekly TSS` for Y-axis).
- [x] Remove projection summary text block under the Plan tab chart while keeping compact legend/toggle affordances and projection settings shortcut.
- [x] Run focused mobile typecheck (`pnpm --filter mobile check-types`).

## Plan Tab Chart Axis + Planned Load Corrections (2026-03-09)

- [x] Move chart axis labels to a horizontal top row (`weekly TSS` on left, `time/date` on right) and remove rotated Y-axis label treatment.
- [x] Ensure chart renders explicit axis tick values with readable spacing and Y-axis range fixed to `0..derived weekly max TSS`.
- [x] Aggregate insight timeline series to weekly totals so planned load reflects scheduled event volume instead of daily near-zero flatline behavior.
- [x] Extend default insight timeline window to `today - 30 days` through latest goal target date, with a one-year future fallback when no goal exists.

## Planned Load Timeline Source Fix (2026-03-09)

- [x] Update `trainingPlans.getInsightTimeline` planned-load query to include all profile planned calendar events in the requested window (not only events tied to `input.training_plan_id`).
- [x] Keep planned-load TSS derivation based on linked activity-plan estimations so `scheduled_tss` reflects real planned calendar load.

## Deterministic Template UUID Normalization (2026-03-09)

- [x] Add core helpers to normalize system activity template IDs to deterministic RFC-compatible UUIDs while preserving stability for existing legacy IDs.
- [x] Normalize `SYSTEM_TEMPLATES` export IDs through core helper so publish scripts always upsert stable canonical UUIDs.
- [x] Normalize `ALL_SAMPLE_PLANS` session `activity_plan_id` values to the same canonical deterministic UUID space used by activity templates.
- [x] Relax `materializePlanToEvents` UUID lexical validation to accept canonical Postgres UUID format and prevent valid linked IDs from being dropped.
- [x] Re-seed system activity and training plan templates so canonical deterministic IDs are persisted in Supabase.
- [x] Backfill existing planned events with null `activity_plan_id` from unambiguous `(training_plan_id, session title)` mapping so timeline planned TSS can resolve.

## Plan Tab Minimal UX Clarity Pass (2026-03-09)

- [x] Add concise projection explainer copy above the chart to clarify recommended vs planned vs completed load semantics.
- [x] Rename chart series labels and legend text to user-first language (`Recommended`, `Planned`, `Completed`) while preserving minimal visual style.
- [x] Add lightweight chart context row (`Toggle visibility`, `Today`) and explicit checkbox-style toggle labels for clearer layer control.
- [x] Add a weekly load headline metric with delta vs last week to improve scanability without increasing layout complexity.
- [x] Add an actionable projection insight sentence under the chart explainer that reports over/under/on-track alignment.
- [x] Replace readiness dead-end copy with guidance and an inline `Log Workouts` CTA when readiness projection is unavailable.

## Planned Load Estimation Calibration (2026-03-09)

- [x] Fix structure-based distance duration estimation defaults to use activity-category-aware pace assumptions (prevents bike distance sessions from inflating duration/TSS).
- [x] Map athlete metrics from `profile_metrics` (including latest `lthr` -> threshold HR and `weight_kg`) into estimation context so TSS estimation uses athlete-specific baselines.
- [x] Add core regression tests covering bike distance estimation sanity and estimation-context metric mapping.
- [x] Source FTP and run threshold pace anchors from recent `activity_efforts` (20-minute best efforts) for estimation context calibration.

## Estimated Duration Unit Fixes (2026-03-09)

- [x] Fix linked activity plan duration display in event detail to treat `estimated_duration` as seconds (not minutes).
- [x] Fix scheduled activity detail estimated duration display to use seconds-based formatting.
- [x] Normalize shared activity plan card duration display to seconds-based formatting and remove duplicate TSS label rendering.

## Mobile Form Selection UX Pass (2026-03-09)

- [x] Replace free-text goal target metric entry in goal editor with goal-type-aware select options.
- [x] Replace goal importance free-text input with bounded integer stepper (`0..10`).
- [x] Replace external onboarding date-of-birth text input with date-picker control.
- [x] Replace external onboarding threshold pace free text with structured minutes/seconds control.
- [x] Replace profile edit date-of-birth text input with date-picker control.
- [x] Replace training plan apply-template start/target date text inputs with date-picker controls.
- [x] Constrain internal onboarding `TimeDurationInput` seconds to `0..59` via selector behavior.
- [x] Optional cleanup: replace periodization ramp-rate and weekly targets activities-per-week free-text inputs with bounded integer steppers.
- [x] Replace advanced recovery-rule free-text fields (`max_consecutive_days`, `min_rest_days_per_week`) with bounded integer steppers (`1..7`, `0..7`).
- [x] Replace advanced weekly TSS min/max free-text fields with bounded stepper controls and keep `max >= min` behavior by auto-adjusting max when needed.
- [x] Replace advanced periodization `target_ctl` free-text input with bounded integer stepper while preserving preview and payload behavior.
- [x] Run focused mobile validation (`pnpm --filter mobile check-types`).

## Training Plan Authorization Policy Hardening (2026-03-09)

- [x] Audit training plan and event permissions to document owner-only training-plan mutation policy and profile-scoped event mutation policy.
- [x] Remove hidden apply-template plan-copy behavior so applying a shared/system template schedules events against the source template ID without creating a user-owned training-plan clone.
- [x] Keep training-plan mutations (`update`, `delete`, structure assignment) owner-only while preserving user ability to edit/delete their own scheduled events.
- [x] Tighten training-plan detail UX to prevent non-owner edit/manage affordances and clarify apply-template ownership semantics in copy.
- [x] Update apply-template tests to assert no `training_plans` insert occurs during template apply and verify scheduled events reference the source template ID.

## Projection Defaults + Safety Hardening (2026-03-09)

- [x] Replace bucketed age safety rules with continuous age-sensitive calibration curves and shared no-history starter priors.
- [x] Unify no-history bootstrap, creation-context, and projection starting defaults so no-data users still receive conservative plans.
- [x] Enforce effective weekly TSS / CTL ramp caps as hard projection limits instead of diagnostics-only soft guidance.
- [x] Add youth-safe planning defaults and shorter duration caps while preserving unknown-age conservative fallback behavior.
- [x] Align readiness timeline calibration defaults with the documented `feasibility_blend_weight = 0` behavior and extend focused regression coverage.

## Continuous Modeling Follow-up (2026-03-09)

- [x] Replace remaining bucketed event-demand helpers with smoother continuous distance, pace, and horizon relationships where feasible.
- [x] Add tightly bounded gender-aware recovery modulation without using gender to inflate event demand.
- [x] Split Plan tab projection messaging into distinct physiological readiness and planning confidence summary cards.

## No-Data Projection Fallback Fix (2026-03-09)

- [x] Add insight timeline fallback ordering for projection artifacts, plan weekly TSS targets, scheduled activity estimates, and a conservative safe default.
- [x] Return non-null ideal curves for session-only plans without periodization metadata by deriving load from weekly targets or linked scheduled sessions.
- [x] Add focused `@repo/trpc` regression coverage for no-data plan/load fallback behavior.

## Plan Tab Load Semantics Clarification (2026-03-09)

- [x] Split current weekly load display from recommended/baseline guidance copy so the headline metric no longer reads like the recommendation itself.
- [x] Mark no-goal guidance as baseline load and cap no-goal/no-history recommendations to conservative starter defaults.
- [x] Add Plan tab fallback behavior so goal count/readiness messaging degrades sensibly when goal metadata exists server-side but the detailed goal list is not yet loaded locally.

## Goal Readiness Objective Alignment (2026-03-09)

- [x] Normalize optimizer semantics so every optimization profile still targets `100%` goal readiness when it is safely achievable.
- [x] Keep optimization profile differences focused on indirect tradeoffs (risk, volatility, churn), not different readiness ambitions.
- [x] Add focused core regression coverage for the profile-behavior contract.

## Low-Readiness Failure Mode Clarity (2026-03-09)

- [x] Distinguish low-readiness projections caused by short timeline pressure vs insufficient sustainable capacity.
- [x] Preserve the stricter safety/readiness behavior while making the rationale explicit in projection metadata.
- [x] Surface the clearer low-readiness interpretation in Plan tab copy without broad layout churn.
- [x] Add focused regression coverage for timeline-limited and capacity-limited scenarios.
