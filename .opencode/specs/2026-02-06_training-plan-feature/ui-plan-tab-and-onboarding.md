# Training Plan Mobile UI Spec (Plan Tab + Onboarding Quickstart)

Last Updated: 2026-02-09  
Status: Draft for implementation planning  
Owner: Mobile + Product + Design

This document defines the visual and interaction contract for the Training Plan MVP mobile experience. It complements `./design.md` and `./plan.md` by specifying exactly what users see and how they interact.

Document role alignment:

- `./design.md`: high-level product and experience intent.
- `./plan.md`: low-level technical architecture and implementation plan.
- `./ui-plan-tab-and-onboarding.md`: low-level UX and UI behavior contract.
- This document should not redefine backend architecture; it should translate approved product + technical contracts into actionable UX details.

This revision intentionally removes heavyweight interaction patterns and keeps onboarding changes incremental.

---

## 1) Goals and Scope

### In Scope

- Plan tab information architecture and visual hierarchy
- Plan tab component inventory and states
- Chart surfaces available in MVP
- Chart and interaction behaviors
- Onboarding integration updates inside the existing multi-step onboarding flow
- Related UI updates needed to keep setup and Plan tab coherent

### Out of Scope

- Workout interval-builder UI
- Coach or multi-user collaboration tooling
- New design system primitives

---

## 2) Plan Tab Information Architecture

Plan tab is a decision-support screen, not a settings screen.

Top-to-bottom order:

1. **Header strip**
   - active goal name
   - goal date badge
   - feasibility state chip (`feasible | aggressive | unsafe`)
2. **Status summary card**
   - boundary state badge (`safe | caution | exceeded`)
   - one-sentence divergence summary
   - quick confidence indicator (High/Medium/Low)
3. **Primary chart: Three-path load chart**
   - Ideal vs Scheduled vs Actual
4. **Secondary chart row**
   - adherence trend sparkline
   - capability/projection mini chart
5. **Action row**
   - Edit plan constraints
   - View calendar

---

## 3) Plan Tab Components

## 3.1 Header Strip

- Goal title (single-line truncation)
- Date chip (`target_date`)
- Priority chip (always present in UI, sourced from defaulted/stored priority)
- If multiple goals: compact goal switcher control with current goal highlighted

## 3.2 Status Summary Card

- Boundary badge with semantic color only:
  - safe = green
  - caution = amber
  - exceeded = red
- Feasibility badge shown beside boundary when goal is aggressive/unsafe
- Primary sentence pattern:
  - "Actual load is {x}% over/under scheduled this week"
- Secondary sentence:
  - top driver (example: "2 missed key sessions on Tue/Thu")

## 3.3 Three-Path Chart Container

- Title: "Load Path"
- Legend order fixed: Ideal, Scheduled, Actual
- Time range chips: `7D`, `30D`, `90D`
- Optional empty state when timeline has insufficient data

## 3.4 Secondary Chart Row

1. Adherence mini chart

- Y-axis hidden, percentage labels at start/end only
- State tint on latest point (safe/caution/exceeded context)

2. Capability/projection mini chart

- Current estimated capability marker
- Goal-date projection marker with confidence tint
- Supports CP or CS presentation by activity category

## 3.5 Action Row

- `Adjust Plan`
- `Open Calendar`

Action row remains visible below the chart row and uses low-emphasis styling.

---

## 4) Charts Available in MVP

1. **Three-Path Load Chart (Primary)**
   - Lines: `ideal_tss`, `scheduled_tss`, `actual_tss`
   - Supports date scrub and point tooltip
2. **Adherence Trend Sparkline**
   - Line: `adherence_score`
   - Optional threshold guides: 60 and 80
3. **Capability/Projection Mini Chart**
   - Points: capability timeline (`cp_or_cs`)
   - Marker: projected value at goal date

No additional chart types are required for MVP in Plan tab.

---

## 5) Plan Tab Interactions

## 5.1 Global Interactions

- Pull-to-refresh triggers `getInsightTimeline` refetch
- Time range chip selection updates all chart windows together
- Goal switcher updates summary and charts in one transaction
- Plan tab passively refreshes when active plan data changes (goal edits, calendar updates, completed/missed sessions)
- No manual recalculate control is shown in Plan tab

## 5.2 Chart Interactions

- Tap/drag on primary chart shows synchronized vertical cursor across mini charts
- Tooltip displays date + Ideal/Scheduled/Actual + adherence
- No long-press modal or drawer interactions in MVP
- Legend is static for MVP to keep interaction lightweight

## 5.3 Empty/Error/Loading States

- Loading: skeleton summary + skeleton chart blocks
- Empty: clear explanation and next action ("Schedule your first week")
- Error: inline retry action, no blocking full-screen takeover

---

## 6) Onboarding Integration Update (Incremental)

Goal: incorporate goal + training plan creation into the existing multi-step onboarding flow, not a full onboarding overhaul.

## 6.1 New Onboarding Step

- Add one new step in the current multi-step onboarding form:
  - step purpose: create first training goal and training plan
  - required inputs: goal name + target date
  - optional inputs: goal priority and collapsed precision helper
- Keep current onboarding step order and existing steps intact unless needed for routing.

## 6.2 In-Step Flow

1. Enter goal name + target date
2. Optionally expand precision helper
3. Fetch feasibility preview inline
4. Create plan and continue onboarding

## 6.3 Unsafe Goal Handling UX

- `aggressive`: allow create with warning banner
- `unsafe`: require explicit confirmation sheet before create
- Confirmation copy must state this is guidance, not prescription

---

## 7) Related UI Updates Outside Plan Tab

- **Today tab**: add compact boundary + adherence snapshot card that deep-links to Plan tab.
- **Calendar tab**: after schedule edits, show transient "Plan updated" state and provide one-tap return to Plan tab.
- **Training plan create screen**: collapse advanced controls by default and keep one-goal form above fold.
- **Profile settings**: advanced planning preferences remain optional and unchanged for MVP.

---

## 8) Accessibility and Usability Requirements

- Color is never the only state signal; all badges include text labels.
- Touch targets minimum 44x44 points.
- Charts must provide textual fallback summary for screen readers.
- Dynamic type support required for summary card and action row.
- Interaction count target: boundary state + top driver visible within 2 taps from app open.

---

## 9) Implementation Mapping

Primary files expected to change:

- `apps/mobile/app/(internal)/(tabs)/plan.tsx`
- `apps/mobile/components/charts/PlanVsActualChart.tsx`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

Supporting files likely:

- `apps/mobile/components/...` (new status summary, chart wrappers)
- `packages/trpc/src/routers/training_plans.ts` (payload fields consumed by UI)

---

## 10) Acceptance Criteria (UI-Specific)

- Plan tab shows boundary state, feasibility state, and divergence sentence above charts.
- User can view Ideal/Scheduled/Actual and adherence trend in a single scroll without entering another screen.
- Time window switching updates all chart surfaces consistently.
- Plan tab updates automatically when active plan state changes; no manual recalculate needed.
- No long-press modal interactions are required for MVP charts.
- Existing multi-step onboarding includes a new goal-and-plan step using only goal name + target date as required input.

---

## 11) Full File Inventory for This Update Scope

This section is the authoritative file-level checklist for planning-related UX updates.

### 11.1 Created in This Planning Update

- `.opencode/specs/2026-02-06_training-plan-feature/ui-plan-tab-and-onboarding.md`

### 11.2 Updated in This Planning Update

- `.opencode/specs/2026-02-06_training-plan-feature/design.md`
- `.opencode/specs/2026-02-06_training-plan-feature/plan.md`

### 11.3 Planned Updates in Implementation (Related to Requested Features)

Training plan edit form:

- `apps/mobile/app/(internal)/(standard)/training-plan-adjust.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-settings.tsx` (update)
- `apps/mobile/components/training-plan/QuickAdjustSheet.tsx` (update)
- `apps/mobile/components/training-plan/AdvancedConfigSheet.tsx` (update)
- `apps/mobile/components/training-plan/edit/TrainingPlanEditForm.tsx` (create)

Training plan view:

- `apps/mobile/app/(internal)/(standard)/training-plan.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plans-list.tsx` (update)
- `apps/mobile/components/training-plan/CurrentStatusCard.tsx` (update)
- `apps/mobile/components/training-plan/WeeklyProgressCard.tsx` (update)

Plan tab:

- `apps/mobile/app/(internal)/(tabs)/plan.tsx` (update)
- `apps/mobile/components/charts/PlanVsActualChart.tsx` (update)
- `apps/mobile/components/charts/TrainingLoadChart.tsx` (update)
- `apps/mobile/components/shared/DetailChartModal.tsx` (update, simplified interaction only)
- `apps/mobile/components/plan/PlanStatusSummaryCard.tsx` (create)
- `apps/mobile/components/plan/PlanAdherenceMiniChart.tsx` (create)
- `apps/mobile/components/plan/PlanCapabilityMiniChart.tsx` (create)

Calendar view:

- `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx` (update)
- `apps/mobile/components/plan/calendar/ActivityList.tsx` (update)

Schedule activity plans from detail view:

- `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx` (update)
- `apps/mobile/components/ScheduleActivityModal.tsx` (update)
- `packages/trpc/src/routers/planned_activities.ts` (update)

Onboarding integration (incremental, multi-step form):

- `apps/mobile/app/(external)/onboarding.tsx` (update)
- `apps/mobile/components/onboarding/steps/TrainingGoalPlanStep.tsx` (create)
- `packages/trpc/src/routers/training_plans.ts` (update: minimal create + feasibility preview consumption)

Core and shared contracts required by above screens:

- `packages/core/schemas/training_plan_structure.ts` (update)
- `packages/core/schemas/training-plan-insight.ts` (create)
- `packages/core/plan/normalizeGoalInput.ts` (create)
- `packages/core/plan/expandMinimalGoalToPlan.ts` (create)
- `packages/core/plan/goalPriorityWeighting.ts` (create)

### 11.4 Full Creation-Flow Inventory (Training Plan + Activity Plan)

After reviewing current implementation, the full creation flows should be included in the refactor scope.

Training plan creation and review flow (refactor + consolidate):

- `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` (update)
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx` (update)
- `apps/mobile/components/training-plan/create/steps/GoalSelectionStep.tsx` (update)
- `apps/mobile/components/training-plan/create/steps/CurrentFitnessStep.tsx` (update)
- `apps/mobile/components/training-plan/create/steps/SportMixStep.tsx` (update)
- `apps/mobile/components/training-plan/create/steps/AvailabilityStep.tsx` (update)
- `apps/mobile/components/training-plan/create/steps/ExperienceLevelStep.tsx` (update)
- `packages/trpc/src/routers/training_plans.ts` (update)

Activity plan creation flow (refactor + simplify):

- `apps/mobile/app/(internal)/(standard)/create-activity-plan.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/create-activity-plan-structure.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/create-activity-plan-repeat.tsx` (update)
- `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts` (update)
- `apps/mobile/lib/stores/activityPlanCreation.ts` (update)
- `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx` (update)
- `apps/mobile/components/ActivityPlan/IntervalWizard.tsx` (update)
- `packages/trpc/src/routers/activity_plans.ts` (update)

Activity scheduling from detail and calendar surfaces:

- `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx` (update)
- `apps/mobile/components/ScheduleActivityModal.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx` (update)
- `apps/mobile/components/plan/calendar/ActivityList.tsx` (update)
- `packages/trpc/src/routers/planned_activities.ts` (update)

Supporting schema/type files required for stronger type safety:

- `packages/core/schemas/training_plan_structure.ts` (update)
- `packages/core/schemas/activity_plan_v2.ts` (update)
- `packages/core/schemas/form-schemas.ts` (update)
- `packages/core/schemas/index.ts` (update)
- `packages/core/schemas/training-plan-insight.ts` (create)
- `packages/core/schemas/training-plan-form.ts` (create)
- `packages/core/schemas/activity-plan-form.ts` (create)

### 11.5 Explicitly Untouched (Related But Out of Scope)

Only unrelated recording/runtime execution surfaces remain untouched in this planning update:

- `apps/mobile/app/(internal)/record/*.tsx`
- `apps/mobile/components/recording/**/*.tsx`

### 11.6 Coverage Check for Athlete Types

Beginner support:

- onboarding goal + date step in existing flow
- simplified Plan tab summary + clear states

Amateur support:

- calendar scheduling flow from activity detail
- plan trend charts and adherence visibility

Pro support:

- richer plan edit controls (constraints/distribution/caps)
- projection and capability chart context without heavyweight interactions

---

## 12) Schema-to-Form Representation Review

Current observations:

- Training plan creation currently mixes multiple UI flows (`method-selector`, `wizard`, `review`, `single-page`) that map to different structure shapes and validation assumptions.
- Activity plan creation uses strong V2 structure types but combines local store-only state and form validation in a way that can drift.
- Training plan form validation is largely component-local instead of a single canonical form schema.

Recommended canonical form model:

1. Training plan form layers
   - `minimalTrainingPlanFormSchema`: required `goal.name`, `goal.target_date`, optional `goal.priority`, optional normalized metric payload.
   - `advancedTrainingPlanFormSchema`: constraints, activity mix, ramp/distribution overrides.
   - `trainingPlanSubmitSchema`: normalized payload consumed by `createFromMinimalGoal`.

2. Activity plan form layers
   - `activityPlanMetaFormSchema`: name/category/location/route/notes.
   - `activityPlanStructureFormSchema`: V2 intervals + steps.
   - `activityPlanSubmitSchema`: strict composition of meta + structure.

3. Shared typing rules
   - All form states should infer from Zod (`z.infer`) and avoid parallel handwritten interfaces.
   - All numeric inputs should parse through preprocessors (`string -> number`) in schema layer, not per component.
   - All defaults (priority, min rest days, versioning) should be applied in schema transformers, not scattered in screens.

---

## 13) Evaluation of Current Methods and Best Restructure

Current method issues:

- Training plan creation has overlapping entry points and duplicated validation paths.
- Review step receives large JSON payload through route params, increasing fragility.
- Activity plan creation has powerful editing features but feels fragmented across multiple screens for non-advanced users.
- Type safety is strong in parts (Activity V2) but inconsistent across training-plan create/edit flows.

Recommended restructure (best path):

Phase A - Unify training plan creation contract

- Make onboarding goal-and-plan step the primary entry for first plan creation.
- Keep one advanced edit flow for post-create adjustments.
- Route all create actions through one backend minimal-create path that expands defaults.

Phase B - Consolidate training plan UI paths

- Deprecate redundant create pathways in favor of:
  - minimal create step,
  - review/confirm screen,
  - advanced edit form.
- Keep wizard capability only as progressive advanced step sections, not a separate architecture.

Phase C - Simplify activity plan creation UX

- Keep a two-layer flow:
  - metadata screen,
  - structure builder screen.
- Move repeat editing and step editing into inline sheets/dialogs from one parent structure screen to reduce navigation complexity.

Phase D - Strengthen end-to-end type safety

- Introduce dedicated training/activity form schemas in `@repo/core` and infer UI types from them.
- Remove duplicated local validation logic where schema already defines constraints.
- Add integration tests for create/edit submissions to ensure schema-to-router contract stability.

Expected outcomes:

- Faster first-plan creation for beginners.
- Cleaner progression path for amateur athletes.
- Advanced controls preserved for pro users without cluttering default flows.
- More professional UX consistency with stronger, centralized type contracts.
