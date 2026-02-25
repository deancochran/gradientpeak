# Technical Implementation Plan: Plan Tab + Training Plan View Redesign

Date: 2026-02-24
Status: Ready for implementation
Owner: Mobile App
Inputs: `design.md`

## 1) Implementation Intent

This plan implements the redesign in `design.md` by **reassigning screen responsibilities** while preserving existing architecture, data contracts, and route patterns.

Primary intent:

1. Keep Plan Tab execution-first (today + near-term schedule, quick start, quick routing).
2. Keep Training Plan View (TPV) as analysis + management + editing authority.
3. Reuse existing hooks, cards, and modals wherever practical.
4. Avoid a rewrite: prefer extraction/refactoring over replacement.

## 2) Non-Negotiable Guardrails (Prevent Overhaul)

The implementation must not become a full redesign rewrite.

1. **Reuse `useTrainingPlanSnapshot` as the data orchestration backbone** (`apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts`).
2. **Keep existing route topology** (`ROUTES.PLAN.*`) and deepen via params, not new route families (`apps/mobile/lib/constants/routes.ts`).
3. **Keep Manage Plan and Edit Structure in existing screens**:
   - `apps/mobile/app/(internal)/(standard)/training-plan-settings.tsx`
   - `apps/mobile/app/(internal)/(standard)/training-plan-edit.tsx`
4. **Use additive UI composition**: extract section components from current screens before behavior shifts.
5. **No backend schema migration**; only additive response fields if modal requirements demand them.

## 3) Current Baseline (Code Reality)

### Plan Tab currently contains mixed ownership

`apps/mobile/app/(internal)/(tabs)/plan.tsx` currently imports and renders both execution and deeper analysis/manage controls:

```ts
import { PlanAdherenceMiniChart } from "@/components/plan/PlanAdherenceMiniChart";
import { PlanCapabilityMiniChart } from "@/components/plan/PlanCapabilityMiniChart";
import { TrainingPlanSummaryHeader } from "@/components/training-plan/TrainingPlanSummaryHeader";
import { QuickAdjustSheet } from "@/components/training-plan/QuickAdjustSheet";
```

### TPV is broad dashboard but missing required top gallery pattern

`apps/mobile/app/(internal)/(standard)/training-plan.tsx` already owns detail and structure editing affordances, but does not yet expose the specified adherence/readiness horizontal gallery with metric deep-dive modals.

### Data layer is already reusable

`apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts` already provides:

- `plan`
- `status`
- `insightTimeline`
- `actualCurveData`
- `idealCurveData`
- `weeklySummaries`

This supports the redesign without introducing a new data-access architecture.

## 4) Reuse Matrix (What stays, what shifts)

### Reuse as-is

1. `useTrainingPlanSnapshot` query composition and refresh behavior.
2. `TrainingPlanSummaryHeader` and `TrainingPlanKpiRow` shell components.
3. `DetailChartModal` for top-level insight card drill-down presentation.
4. Existing planned-activity status lifecycle from `plannedActivities.list` usage.

### Reuse with minor extension

1. `PlanAdherenceMiniChart` can be reused as gallery-card body (or wrapped).
2. `PlanCapabilityMiniChart` should be relabeled/reframed to Readiness surface.
3. TPV `nextStep` deep-link behavior should be extended to support focused edit context (no route rewrite).

### New additive components only where required

1. Plan Tab execution sections (modular extraction):
   - `NextUpCard`
   - `UpcomingObligationsList`
   - `WeeklySnapshotStrip`
   - `HealthIndicatorChips`
2. TPV gallery wrappers:
   - `InsightGalleryCard`
   - `AdherenceDetailModalContent`
   - `ReadinessDetailModalContent`

## 5) Target File Changes

## 5.1 Plan Tab (`apps/mobile/app/(internal)/(tabs)/plan.tsx`)

Goal: narrow to **Read + Navigate + Start**.

Planned changes:

1. Keep calendar and near-term planned activity sections.
2. Keep `Open Full Plan` route into TPV.
3. Remove ownership-violating controls from Plan Tab:
   - `Manage Plan`
   - `Edit Structure`
4. Reduce heavy analytics cards to lightweight readiness/adherence chips.
5. Keep quick execution CTA behavior (`Start`, `View Details`).

Implementation tactic:

- First extract large chunks into local components, then remove/replace sections. This reduces regression risk in an existing 1000+ line file.

### 5.2 TPV (`apps/mobile/app/(internal)/(standard)/training-plan.tsx`)

Goal: become **Read + Analyze + Edit + Manage** authority surface.

Planned changes:

1. Insert top horizontal gallery near header:
   - `Adherence`
   - `Readiness` (rename from capability language where shown)
2. Tap on each card opens modal with:
   - definition
   - current interpretation
   - contributors
   - time range toggles
   - recommended action CTA
3. Preserve current Manage/Edit routing and structure card behavior.
4. Extend existing `id` / `nextStep` deep-link parsing for focused edit mode.

### 5.3 Shared Modal + Card Composition

Use existing modal primitive:

`apps/mobile/components/shared/DetailChartModal.tsx`

Current signature already supports date range toggles and injected content:

```ts
interface DetailChartModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  defaultDateRange?: DateRange;
  showDateRangeSelector?: boolean;
  children: (dateRange: DateRange) => React.ReactNode;
}
```

Plan is to reuse this directly and provide metric-specific content children.

### 5.4 Routes (`apps/mobile/lib/constants/routes.ts`)

No structural route rewrite. Add only optional typed helpers if needed for focus params:

```ts
// possible additive helper (example)
buildTrainingPlanRoute({ id, focus: "edit_note", activityId });
```

This preserves existing route constants while making deep-link intent explicit.

### 5.5 Tests

Update and extend tests around new ownership boundaries.

Files to update:

1. `apps/mobile/app/(internal)/(tabs)/__tests__/plan-navigation.test.tsx`
   - remove assertions expecting `Manage Plan` / `Edit Structure` in Plan Tab
   - add assertions for one-tap primary destinations and `Open Full Plan`
2. `apps/mobile/app/(internal)/(standard)/__tests__/training-plan-deeplink.test.tsx`
   - add focused-edit param behavior
   - ensure deep-link context persists
3. Add TPV gallery interaction tests:
   - card visibility
   - modal open/close
   - range toggle behavior

## 6) Implementation Phases

### Phase 0 - Safe Refactor Foundation (No UX contract changes)

1. Extract Plan Tab sections into dedicated components under `apps/mobile/components/plan/`.
2. Keep behavior and output equivalent.
3. Confirm baseline tests pass before ownership changes.

Success criteria:

- No user-visible change yet.
- Reduced cognitive complexity in `plan.tsx`.

### Phase 1 - Plan Tab Ownership Cleanup

1. Remove Manage/Edit structure controls from Plan Tab.
2. Keep and prioritize:
   - Active plan summary
   - next up card (single highest-priority session)
   - Upcoming obligations (next 72h)
   - compact calendar block
   - weekly snapshot strip
   - lightweight health chips
3. Ensure one-tap routing is present for primary destinations.

Success criteria:

- Plan Tab does not duplicate TPV management surfaces.
- Daily execution still fast.

### Phase 2 - TPV Gallery + Insight Drill-Down

1. Add horizontal insight gallery near top.
2. Add mandatory cards:
   - adherence
   - readiness
3. Wire cards to `DetailChartModal` with metric-specific content.
4. Replace visible "Capability" naming with "Readiness" across TPV surfaces.

Success criteria:

- Cards visible and interactive.
- Modals expose rationale and action path.

### Phase 3 - Focused Edit Deep-Link Flows

1. Extend Plan Tab obligation rows with deep-link intents to TPV focused editors.
2. Add parser/dispatcher in TPV for focus params.
3. Implement two-interaction happy path patterns:
   - tap row action from Plan Tab
   - save/submit in focused TPV view

Success criteria:

- Common edit+submit tasks complete in two interactions from Plan Tab entry.

### Phase 4 - Data Contract Additions (Only if needed)

If readiness/adherence contributor details are insufficient:

1. Add non-breaking fields to training plan analytics response.
2. Keep old fields intact.
3. Add contract tests first, then UI wiring.

Possible touchpoint:

- `packages/trpc/src/routers/training-plans.base.ts`

Success criteria:

- Additive only; no downstream breakage.

## 7) Code-Level Patterns to Follow

### 7.1 Avoid route churn

Prefer params on existing TPV route:

```ts
router.push({
  pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
  params: { id: plan.id, nextStep: "edit_note", activityId },
});
```

### 7.2 Keep data fetching centralized

Avoid new parallel hooks for the same snapshot data.

```ts
const snapshot = useTrainingPlanSnapshot({
  planId: id,
  includeWeeklySummaries: false,
  curveWindow: "overview",
});
```

### 7.3 Keep naming migration incremental

Do not rename files immediately if risky. First rename labels from "Capability" to "Readiness", then consider component/file renames after behavior parity.

## 8) Regression + Risk Management

## High-risk areas

1. Existing Plan Tab tests currently assert deprecated controls (`Manage Plan`, `Edit Structure`).
2. `plan.tsx` size and state density increase accidental break risk.
3. Readiness modal detail requirements may exceed current timeline payload.

## Mitigations

1. Refactor-by-extraction before behavior edits.
2. Feature-flag style local booleans during transition if needed.
3. Add modal content fallback states when contributor fields are unavailable.

## 9) Acceptance Mapping (Design -> Engineering)

1. Plan Tab schedule focus only -> remove TPV ownership controls and heavy analytics duplication.
2. Manage/Edit controls only in TPV -> enforce in UI and tests.
3. TPV adherence/readiness gallery cards -> implement with modal drill-down.
4. One-tap primary nav from Plan Tab -> validate route entry points in tests.
5. Two-interaction common edit flows -> validate deep-link focused-edit path tests.

## 10) Validation Checklist

Required commands after implementation:

```bash
pnpm check-types
pnpm lint
pnpm test
```

Targeted mobile checks during phases:

```bash
pnpm --filter @apps/mobile test
pnpm --filter @apps/mobile check-types
```

## 11) Deliverables

1. Updated Plan Tab implementation aligned to execution-first ownership.
2. Updated TPV with adherence/readiness gallery + detail modals.
3. Deep-link focused-edit flow for two-interaction common edits.
4. Updated and new tests reflecting the new IA contract.
5. No backend schema overhaul, no route system rewrite, no full UI replacement.

## 12) Definition of Done

This redesign is complete when:

1. Plan Tab is operational and lightweight, not analytical/managerial.
2. TPV is the only place for management and structure editing.
3. Adherence and Readiness cards exist, open detail modals, and communicate rationale.
4. Existing architecture is preserved (same snapshot hook, same route family, additive component changes).
5. Test suite and type/lint checks pass without introducing broad unrelated refactors.
