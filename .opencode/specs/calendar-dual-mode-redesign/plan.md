# Plan

## Phase 1 - Calendar Foundation

Goal: replace week-centered state and shell assumptions with a dual-mode calendar foundation.

Scope:

- Reframe the calendar around day/month navigation instead of week-strip navigation.
- Identify which pieces of the current `SectionList` agenda can be reused versus replaced.
- Establish the shared screen state contract before UI work starts.

Implementation detail:

1. Define the shared `mode`, `activeDate`, `visibleAnchor`, `selectedEventId`, and bottom-sheet state model.
2. Replace `selectedDate` / `visibleDate` / `weekAnchorDate` assumptions with a mode-aware anchor model.
3. Decide whether one list can safely power both modes or whether day/month need separate renderers backed by shared normalized data.
4. Define how calendar context persists across focus returns, refreshes, and app-local navigation.
5. Define the fetch/windowing strategy needed for infinite day and month browsing.
6. Identify whether shared helpers should move out of `apps/mobile/app/(internal)/(tabs)/calendar.tsx` into a smaller view-model layer.

Primary decisions required:

- whether `day` is the default landing mode
- how `Today` behaves in each mode
- whether month mode fetches full event cards or only day-level density summaries
- how much of the current event routing remains route-based versus sheet-based

Deliverables:

- a documented state model
- a documented render/data architecture choice
- a migration note describing which current week-specific behaviors are removed

File-by-file implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`: replace week-centered state ownership, remove week-strip assumptions, and become the mode/sheet coordinator.
- `apps/mobile/lib/calendar/*` or new extracted helpers such as `apps/mobile/lib/calendar/calendar-view-model.ts`: hold date math, normalized visible-range logic, and mode-aware anchor helpers.
- `apps/mobile/lib/trpc/scheduleQueryOptions.ts`: adapt query-option helpers if the calendar moves from expanding-range fetches to windowed visible-range fetches.
- `apps/mobile/lib/scheduling/refreshScheduleViews.ts`: preserve the new calendar context when schedule invalidation/refetch happens.
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`: replace week-strip assumptions with state-model and visible-anchor coverage.

Exit criteria:

- week-based browse state is no longer the core calendar abstraction
- mode switching rules are explicit and testable
- the rendering model can support both day and month snapping
- persistence and fetch strategy are defined well enough to start UI implementation without revisiting core architecture

## Phase 2 - Day And Month Modes

Goal: ship the new browse model with minimal chrome and stable snapping behavior.

Scope:

- Replace the current week strip and previous/next week controls.
- Deliver the core browsing experience before layering in richer event interactions.
- Keep the top shell visually smaller than the current implementation.

Implementation detail:

1. Build infinite day mode that snaps to day starts.
2. Build infinite month mode that snaps to month starts.
3. Add the compact mode switcher and minimal top-shell controls.
4. Keep the visible date label tied to the snapped anchor, not incidental scroll churn.
5. Ensure month-cell taps switch into day mode on the tapped date.
6. Preserve `activeDate` correctly when switching between day and month modes.
7. Keep `Today` behavior consistent within both modes.
8. Replace large gap and empty-state cards with calmer empty-day treatments where possible.

Primary decisions required:

- whether day mode uses a timeline layout, stacked cards, or a hybrid
- how much event density month cells can show before they become visually noisy
- whether the top shell needs a visible `Today` icon or can keep that action inside the sheet

Deliverables:

- a functioning day-mode renderer
- a functioning month-mode renderer
- stable snapping behavior in both modes
- a reduced-chrome top shell with mode switching

File-by-file implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`: remove the current week strip, previous/next controls, gap-card-heavy body, and wire in the new day/month shells.
- `apps/mobile/components/calendar/*`: add extracted components such as `CalendarModeSwitcher`, `CalendarDayPager`, `CalendarMonthList`, `CalendarMonthCell`, and calm empty-day states if the screen file becomes too large.
- `apps/mobile/lib/calendar/*`: add mode-switch rules, snapped-anchor helpers, day-page/month-page builders, and active-day highlight helpers.
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`: add coverage for day snapping, month snapping, month-cell tap -> day transition, and preserved active date.
- Maestro coverage under `apps/mobile/.maestro/flows/reusable/open_calendar_tab.yaml` and related calendar flows: refresh journeys once the visible shell changes enough to break current assumptions.

Exit criteria:

- users can browse in day and month modes without week buttons
- active date stays stable across mode changes
- the top-of-screen UI is smaller and simpler than the current screen
- empty days and busy days both feel visually calm
- passive scrolling no longer rewrites the user's intentional date choice unexpectedly

## Phase 3 - Sheets And Event Presentation

Goal: consolidate actions and quick event detail without increasing visible UI clutter.

Scope:

- Shift secondary actions out of the always-visible layout.
- Make event cards more useful at a glance.
- Keep existing create/edit/update flows usable while the new sheet layer is introduced.

Implementation detail:

1. Add a Gorhom bottom sheet for calendar actions.
2. Add an event preview/detail bottom sheet opened from day-mode event taps.
3. Define shared sheet states and transitions so actions, preview, and follow-up flows do not conflict.
4. Reduce always-visible action buttons to the minimum necessary.
5. Redesign event cards to prioritize real event content, especially planned activity details.
6. Make planned activity cards show title, intensity, duration, and one to two lines of useful description when available.
7. Keep imported events readable but clearly read-only.
8. Keep advanced edit/detail flows reachable without making them the default interaction path.

Primary decisions required:

- what actions live in `calendar-actions` versus `event-preview`
- which event mutations can happen directly from the sheet
- when to route to full detail instead of expanding the sheet surface

Deliverables:

- shared bottom-sheet controller for the calendar tab
- compact actions sheet
- event preview sheet
- redesigned event-card presentation rules

File-by-file implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`: own sheet open/close state, event selection, and action dispatch from the calendar surface.
- `apps/mobile/components/calendar/*`: add extracted sheet components such as `CalendarActionsSheet`, `CalendarEventPreviewSheet`, and updated event-card components.
- `apps/mobile/components/ScheduleActivityModal.tsx`: stay as the deeper scheduling/edit surface where the sheet hands off to advanced editing rather than duplicating complex scheduling logic.
- `apps/mobile/lib/calendar/eventRouting.ts`: narrow event routing so full-screen detail becomes a secondary path instead of the default tap behavior.
- `apps/mobile/app/(internal)/(standard)/event-detail.tsx`: remain the advanced detail/edit fallback and align with any new sheet-first entry behavior.
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`: add bottom-sheet and event-card interaction coverage.
- `apps/mobile/components/__tests__/ScheduleActivityModal.jest.test.tsx`: confirm advanced scheduling/reschedule handoff still works after the sheet-first redesign.

Exit criteria:

- primary create/utility actions are available through the bottom sheet
- event taps no longer depend on a separate screen for the default quick-detail path
- event cards surface richer content without growing visually noisy
- the default calendar shell shows fewer visible controls than the current screen
- imported/read-only behavior remains clear and safe

## Phase 4 - Drag And Drop Rescheduling

Goal: allow direct movement of editable events between days.

Scope:

- Add direct manipulation only after the new day-mode browsing model is stable.
- Limit drag behavior to moving events between days, not to a full freeform calendar editor.
- Preserve the simple visual language established in earlier phases.

Implementation detail:

1. Define the drag gesture model and drop targets in day mode.
2. Decide whether drag starts from long press, drag handle, or both.
3. Add auto-scroll between day pages during drag.
4. Preserve recurring-scope handling after a drop.
5. Keep read-only/imported events non-draggable with clear feedback.
6. Define invalid-drop behavior and rollback rules.
7. Ensure drag feedback works with all-day and timed events.

Primary decisions required:

- whether drag should move only dates in the first pass or also support time-slot movement
- how much target feedback is needed to feel confident without adding visual clutter
- whether recurring events drop immediately then confirm scope, or preview scope before mutation

Deliverables:

- drag affordance rules
- drag target and auto-scroll behavior
- mutation and rollback rules for drop completion

File-by-file implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`: coordinate drag state, drop completion, and mutation handoff if drag logic is not fully extracted.
- `apps/mobile/components/calendar/*`: add or extend draggable event-card/day-surface components for gesture handling, drop targets, and visual feedback.
- `apps/mobile/lib/calendar/*`: hold drag state helpers, target-resolution helpers, and optimistic rollback helpers if extracted.
- `apps/mobile/components/ScheduleActivityModal.tsx` and/or mutation handoff helpers: preserve recurring-scope and advanced edit rules after drag-based date changes.
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`: add drag target, invalid-drop, and rollback coverage where feasible.
- Maestro calendar journeys under `apps/mobile/.maestro/flows/main/calendar_custom_event.yaml` or new drag-focused flows: add integration coverage once drag interactions are stable enough for end-to-end automation.

Exit criteria:

- editable events can move between days through direct manipulation
- drag behavior does not make the screen visually heavier
- recurring events remain safe and understandable to reschedule
- invalid or read-only drag attempts fail gracefully

## Cross-Phase Validation Strategy

- Phase 1: validate architecture and state rules with focused screen-state tests.
- Phase 2: validate snapped scrolling, active-date preservation, and month-cell-to-day transitions.
- Phase 3: validate bottom-sheet open/close flows, event-card content rendering, and advanced-flow escape hatches.
- Phase 4: validate drag gestures, auto-scroll, drop confirmation, and rollback/error behavior.

## Recommended Execution Order

1. Phase 1 foundation
2. Phase 2 day/month modes
3. Phase 3 bottom sheets and event-card redesign
4. Phase 4 drag-and-drop rescheduling
