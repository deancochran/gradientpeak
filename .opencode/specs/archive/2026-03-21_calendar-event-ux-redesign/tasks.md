# Tasks: Calendar + Event UX Redesign

## Coordination Rules

- [ ] A task is complete only when the code lands, focused validation passes, and the success check in the task text is satisfied.
- [ ] If implementation reveals a better extraction boundary for shared row or header controls, note the chosen boundary inline before marking the task complete.
- [ ] Do not leave overlapping scheduled-event detail ownership in place once canonical detail parity is complete.

## Phase 1: Canonical Event Detail

- [x] Task A - Detail parity audit. Success: the implementation explicitly maps all planned-event actions and UI sections still owned by `scheduled-activity-detail.tsx` that must move into `event-detail.tsx`.
  - Audit notes:
    - planned-event-only actions to migrate into `event-detail.tsx`: `Start Activity` via `activitySelectionStore` -> `/record`, `Reschedule` via `ScheduleActivityModal`, and planned-event delete copy/behavior parity.
    - planned-event state logic to migrate: completion detection, past-vs-startable gating, stronger action hierarchy for planned events, and redirect behavior after delete.
    - planned-event presentation still only present in `scheduled-activity-detail.tsx`: completion status card, activity-type summary card, schedule summary card, richer activity-plan metrics block, structure preview, and notes section optimized for scheduled workouts.
    - route ownership to consolidate after parity: `ROUTES.PLAN.ACTIVITY_DETAIL(...)`, direct `/scheduled-activity-detail?id=...` pushes, and any screen/test still targeting `scheduled-activity-detail.tsx`.
- [x] Task B - Canonical event-detail redesign. Success: `apps/mobile/app/(internal)/(standard)/event-detail.tsx` supports all scheduled-event types with type-specific actions and sections inside one screen architecture.
- [x] Task C - Planned-event detail consolidation. Success: planned events no longer require `scheduled-activity-detail.tsx` for primary detail behavior, and navigation routes into the canonical screen.
  - Current consolidation status: `ROUTES.PLAN.ACTIVITY_DETAIL(...)` and direct scheduled-activity entry points now open `event-detail`; legacy screen registration can be removed during later route/header cleanup.

## Phase 2: Calendar Tab Redesign

- [x] Task D - Calendar control-band redesign. Success: `apps/mobile/app/(internal)/(tabs)/calendar.tsx` includes a calendar-native header/control area with week-strip day selection and month/date context.
  - Chosen boundary: kept the week-strip control inline in `calendar.tsx` for this pass so the selected-date state, range extension, and section scrolling stay co-located during the tab redesign.
- [x] Task E - Event-row redesign. Success: calendar agenda rows expose richer type, status, linked-plan, and quick-action information while remaining easy to scan.
  - Chosen boundary: kept the richer row treatment inline in `calendar.tsx` for now so planned-event quick actions, event-type presentation, and long-press/edit behavior can evolve together before extracting a shared agenda-row component.
- [x] Task F - Empty-state and continuity cleanup. Success: empty selected days and sparse ranges guide users toward creation without relying on long blank scrolling.
  - Implementation note: collapsed long empty stretches into inline continuity cards inside `calendar.tsx` while keeping selected-day empty states as dedicated day sections so week-strip selection, create flows, and agenda scrolling still share one state model.
  - Validation note: `pnpm --filter mobile check-types` now passes again, so the earlier unrelated `packages/core/goals/goalDraft.ts` blocker no longer prevents completion.

## Phase 3: Schedule Flow Simplification

- [x] Task G - Schedule modal simplification. Success: `apps/mobile/components/ScheduleActivityModal.tsx` makes date/notes/submit the primary path and moves heavy preview content behind secondary disclosure.
  - Chosen boundary: kept the simplification inside `ScheduleActivityModal.tsx` rather than splitting summary and disclosure subcomponents yet, so create/edit scheduling, validation state, and submission gating stay in one place during the flow redesign.
  - Validation note: `pnpm exec vitest run components/__tests__/ScheduleActivityModal.test.tsx` passes, covering collapsed-by-default preview/constraint details and disclosure behavior.
- [x] Task H - Planned-activity picker improvement. Success: `apps/mobile/components/calendar/CalendarPlannedActivityPickerModal.tsx` supports browse-oriented filters/groups in addition to search.
  - Chosen boundary: kept browse sections, category filters, and richer plan rows inline in the picker modal for now so search behavior and section heuristics can be tuned together before extracting shared plan-list primitives.
  - Validation note: `pnpm exec vitest run components/calendar/__tests__/CalendarPlannedActivityPickerModal.test.tsx` passes, covering browse sections plus filter/search behavior.

## Phase 4: Upcoming Surface Repurpose

- [ ] Task I - Upcoming screen repurpose. Success: `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx` is redesigned into a clearly differentiated `Upcoming` screen with deterministic sections: `Needs Attention`, `Today`, `Next 7 Days`, and `Recently Completed`.
- [ ] Task I.1 - Upcoming section rules. Success: each event appears in exactly one `Upcoming` section according to explicit priority and date/state rules.
- [ ] Task I.2 - Upcoming row redesign. Success: `Upcoming` rows emphasize next action, compact state badges, and context-sensitive trailing actions without relying on long press.
- [ ] Task J - Route and header alignment. Success: route constants, screen titles, and navigation helpers match the new `Upcoming` purpose and canonical event-detail flow.

## Phase 5: Validation

- [x] Validation 1 - Mobile type validation. Success: `pnpm --filter mobile check-types` passes.
- [ ] Validation 2 - Focused mobile tests. Success: updated tests for calendar interaction, event routing, and scheduling flows pass.
- [ ] Validation 3 - Cross-screen workflow verification. Success: manual or automated verification confirms the calendar hybrid layout, canonical detail flow, simplified schedule modal, improved picker, and new `Upcoming` surface all behave coherently.
