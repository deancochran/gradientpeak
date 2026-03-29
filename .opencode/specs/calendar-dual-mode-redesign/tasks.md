# Tasks

## Coordination Notes

- Keep the calendar visually simpler than the current implementation at every phase.
- Prefer one strong interaction surface over many visible buttons.
- Keep the mode switch visible, but consolidate secondary actions into a bottom sheet.
- Reuse current event mutations and scheduling flows unless the redesign proves they are insufficient.
- Preserve imported-event read-only behavior.
- Treat drag-and-drop as a follow-up phase after the dual-mode browse model is stable.

## Open

### Phase 1 - Foundation And Architecture

- [x] Audit `apps/mobile/app/(internal)/(tabs)/calendar.tsx` and identify which week-specific assumptions must be removed.
- [x] Audit `apps/mobile/lib/trpc/scheduleQueryOptions.ts` and `apps/mobile/lib/scheduling/refreshScheduleViews.ts` for query-window and refresh-context changes.
- [x] Define the shared calendar state contract for `mode`, `activeDate`, `visibleAnchor`, selected event, and sheet state.
- [x] Define exact mode-switch rules for `day -> month`, `month -> day`, and `Today` actions.
- [x] Decide how calendar context should persist across tab switches and refreshes.
- [x] Define the windowed data-fetching/cache strategy for infinite day and month rendering.
- [x] Define the normalized event-by-date data shape shared by day and month renderers.
- [x] Decide whether day and month views share one scroller abstraction or use separate renderers.
- [x] Decide whether to extract shared calendar view-model helpers from `apps/mobile/app/(internal)/(tabs)/calendar.tsx`.
- [x] If extraction is needed, define target helper/component file boundaries under `apps/mobile/lib/calendar/*` and `apps/mobile/components/calendar/*`.
- [x] Document which current UI elements are removed in the redesign: week strip, previous/next controls, gap cards, and large empty-state helper blocks.

### Phase 2 - Dual-Mode Browsing

- [ ] Replace the current week-navigation shell with a smaller mode-driven header.
- [ ] Create or extract the mode-switch shell under `apps/mobile/components/calendar/*` if `calendar.tsx` becomes too large.
- [ ] Implement the compact visible date label tied to the snapped anchor.
- [ ] Implement infinite day-mode scrolling with day-start snapping.
- [ ] Decide and implement the day-page event layout structure.
- [ ] Implement infinite month-mode scrolling with month-start snapping.
- [ ] Implement active-day highlighting inside month cells.
- [ ] Implement lightweight month-cell event density indicators.
- [ ] Preserve `activeDate` correctly when switching between day and month modes.
- [ ] Make month-cell taps open day mode on the selected date.
- [ ] Keep `Today` behavior intuitive and low-chrome in both modes.
- [ ] Replace large empty-day/gap treatments with calmer empty-day rendering.
- [ ] Preserve snapped position through refresh and navigation return.

### Phase 3 - Bottom Sheets And Event UX

- [ ] Introduce a shared Gorhom bottom-sheet controller for the calendar tab.
- [ ] Create extracted sheet components under `apps/mobile/components/calendar/*` for actions and event preview.
- [ ] Define bottom-sheet content states and transition rules.
- [ ] Move create/utility actions into a `calendar-actions` sheet.
- [ ] Decide the exact action list for `calendar-actions`.
- [ ] Open an event preview/detail sheet when users tap events in day mode.
- [ ] Decide which event actions are allowed directly inside the preview sheet.
- [ ] Keep advanced edit/detail flows reachable without making them the default interaction path.
- [ ] Update `apps/mobile/lib/calendar/eventRouting.ts` so route pushes are fallback behavior rather than the default tap path.
- [ ] Align `apps/mobile/app/(internal)/(standard)/event-detail.tsx` with the new sheet-first calendar behavior.
- [ ] Preserve advanced schedule/edit handoff through `apps/mobile/components/ScheduleActivityModal.tsx`.
- [ ] Redesign event cards so planned activities show title, intensity, duration, and one to two lines of useful description when available.
- [ ] Redesign non-planned event cards so they show title, time state, and one short supporting line.
- [ ] Reduce visible text and badge noise in the default event presentation.
- [ ] Preserve read-only imported-event treatment in the new sheet and card model.

### Phase 4 - Drag And Drop

- [ ] Define editable-event drag affordances in day mode.
- [ ] Decide whether drag starts from long press, drag handle, or both.
- [ ] Create or extend draggable day/event surface components under `apps/mobile/components/calendar/*`.
- [ ] Implement drag movement between days with auto-scroll support.
- [ ] Implement target highlighting for valid drop days.
- [ ] Preserve recurring-scope confirmation after drag-based rescheduling.
- [ ] Keep imported/read-only events non-draggable.
- [ ] Add clear visual feedback for drag targets and invalid drops.
- [ ] Define rollback behavior if a drag-based mutation fails.
- [ ] Preserve drag-to-edit handoff through existing scheduling/edit surfaces where scope confirmation is still required.
- [ ] Decide whether the first drag phase moves dates only or also supports time-slot placement.

## Pending Validation

- [ ] Add or update architecture/state tests for mode rules and visible-anchor behavior.
- [ ] Add or update mobile screen tests for day/month mode switching and active-date preservation.
- [ ] Add or update tests for snapped day and month scrolling behavior.
- [ ] Add interaction tests for month-cell tap -> day-mode transition.
- [ ] Add bottom-sheet interaction tests for calendar actions and event preview.
- [ ] Add rendering tests for richer planned-activity event content.
- [ ] Add rendering tests for low-noise month-cell density indicators and calm empty-day states.
- [ ] Add drag/drop gesture coverage once Phase 4 begins.
- [ ] Add failure-path tests for invalid drop attempts and drag-mutation rollback.
- [ ] Run the narrowest relevant typecheck/test commands for touched mobile files before implementation handoff or commit.

## Completed Summary

- Reviewed the current mobile calendar architecture and confirmed that the existing week-strip agenda is not a clean extension point for the desired product vision.
- Captured a new spec for a simpler dual-mode calendar centered on infinite day and month browsing, bottom-sheet-driven actions, richer event cards, and a phased drag-and-drop follow-up.
- Prepared the implementation foundation: the current `calendar.tsx` is a 1600+ line coordinator tightly coupled to week-strip state, the schedule-query helper is still generic, and refresh logic does not preserve any calendar-specific context yet.
- Locked the implementation direction for Phase 1: `day` becomes the default mode, `Today` resets `activeDate` to today and snaps `visibleAnchor` to the current mode boundary, day/month use separate renderers backed by one normalized event-by-date map, and calendar context should persist in a small zustand + AsyncStorage store.
- Defined the extraction boundaries for implementation: keep `apps/mobile/app/(internal)/(tabs)/calendar.tsx` as the screen coordinator, move date math / anchor rules / query-range builders into `apps/mobile/lib/calendar/*`, and move the mode switcher, header shell, day list, month list, event card, and bottom-sheet surfaces into `apps/mobile/components/calendar/*`.
- Documented the first UI removals required by the redesign: the week strip, previous/next week controls, gap cards, large helper empty states, and route-first event tap behavior should all be removed or demoted behind the new compact shell and sheet-first interaction model.
