# Tasks

## Coordination Notes

- Keep this scope limited to the three high-impact improvements in `design.md`.
- Do not start drag-and-drop, month-grid redesign, jump-to-date expansion, week-swipe gestures, or broader event-editor unification in this spec.
- Prefer focused screen-level changes over a large calendar rewrite.
- Prefer improving existing controls and flows before introducing new surfaces or gestures.

## Open

### Phase 1 - Navigation Stability

- [x] Audit `apps/mobile/app/(internal)/(tabs)/calendar.tsx` state transitions and split explicit selection from passive viewport tracking.
- [x] Prevent passive visibility updates from overriding explicit date changes during programmatic scrolls.
- [x] Preserve calendar context across focus, refresh, and return navigation.
- [x] Add or update tests covering week persistence, scroll behavior, and return behavior.

### Phase 2 - Time Navigation

- [x] Strengthen existing week navigation so it remains stable and predictable while browsing.
- [x] Keep the listing below the week selector infinitely scrollable in both directions.
- [x] Make vertical scrolling snap to the nearest week start when scrolling settles.
- [x] Ensure previous/next controls move to the same snapped week boundaries used by the list.
- [x] Add or update tests covering week navigation behavior, week snapping, infinite scroll extension, and refresh preserving context.

### Phase 3 - Quick Edit

- [x] Improve the current edit/reschedule flow so timing changes are clear and direct.
- [x] Support date, time, and all-day updates for planned and manual editable events.
- [x] Keep imported events read-only with a clear non-editable path.
- [x] Move recurring-scope prompts to change confirmation rather than editor entry.
- [ ] Add or update tests covering planned-event time changes and recurring edit scope behavior.

## Pending Validation

- [x] Run focused mobile calendar tests after each phase.
- [ ] Run the narrowest relevant typecheck/test commands for touched packages before handoff.

## Completed Summary

- Spec created to prioritize only the highest-impact calendar UX refinements: stable navigation state, button-driven week navigation plus infinite week-snapping list behavior, and a clearer rescheduling/editing flow for event timing.
- Implemented the navigation-focused portion in `apps/mobile/app/(internal)/(tabs)/calendar.tsx` by anchoring the week strip to stable week state, extending the agenda automatically in both directions, and snapping vertical browsing back to week starts.
- Updated `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx` to cover the new snapped-week behavior and refreshed the existing week-navigation assertions.
- Extended `apps/mobile/components/ScheduleActivityModal.tsx` so planned-event rescheduling now supports date, time, and all-day changes through the existing schedule update flow, and added focused coverage in `apps/mobile/components/__tests__/ScheduleActivityModal.jest.test.tsx`.
- Updated recurring reschedule behavior so `apps/mobile/app/(internal)/(tabs)/calendar.tsx`, `apps/mobile/app/(internal)/(standard)/event-detail.tsx`, and `apps/mobile/components/ScheduleActivityModal.tsx` now defer recurring scope selection until save/confirm time instead of interrupting users before editing.
- Refined calendar browse state in `apps/mobile/app/(internal)/(tabs)/calendar.tsx` so passive scroll and week snapping update visible context without overwriting the user’s explicit selected day.
