# Tasks

## Coordination Notes

- Keep the calendar visually simpler than the current implementation at every phase.
- Prefer one strong interaction surface over many visible buttons.
- Keep the mode switch visible, but consolidate secondary actions into a bottom sheet.
- Reuse current event mutations and scheduling flows unless the redesign proves they are insufficient.
- Preserve imported-event read-only behavior.
- Treat drag-and-drop as a follow-up phase after the dual-mode browse model is stable.
- Exact next step: runtime-check the simplified calendar header/day list on device or simulator, then continue day/month shell polish only if spacing or snap behavior still feels off.

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

- [x] Replace the current week-navigation shell with a smaller mode-driven header.
- [x] Create or extract the mode-switch shell under `apps/mobile/components/calendar/*` if `calendar.tsx` becomes too large.
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

- [x] Lock the transition rule: a day is a rest day when it has no scheduled `planned` event, even if other non-planned events exist.
- [ ] Introduce a shared Gorhom bottom-sheet controller for the calendar tab.
- [ ] Create extracted sheet components under `apps/mobile/components/calendar/*` for actions and event preview.
- [ ] Define bottom-sheet content states and transition rules.
- [x] Move create/utility actions into a `calendar-actions` sheet.
- [x] Remove explicit rest-day creation and sheet-level jump-to-today from `calendar-actions`.
- [x] Decide the exact remaining action list for `calendar-actions` after removing rest-day-specific actions.
- [x] Remove the calendar manual-create flow for `rest_day` and replace it with inferred rest-day UI treatment.
- [x] Open an event preview/detail sheet when users tap events in day mode.
- [x] Decide which event actions are allowed directly inside the preview sheet.
- [x] Keep advanced edit/detail flows reachable without making them the default interaction path.
- [x] Update `apps/mobile/lib/calendar/eventRouting.ts` so route pushes are fallback behavior rather than the default tap path.
- [x] Align `apps/mobile/app/(internal)/(standard)/event-detail.tsx` with the new sheet-first calendar behavior.
- [x] Preserve advanced schedule/edit handoff through `apps/mobile/components/ScheduleActivityModal.tsx`.
- [x] Redesign event cards so planned activities show title, intensity, duration, and one to two lines of useful description when available.
- [x] Redesign non-planned event cards so they show title, time state, and one short supporting line.
- [x] Reduce visible text and badge noise in the default event presentation.
- [x] Preserve read-only imported-event treatment in the new sheet and card model.
- [x] Add a calm inferred rest-day empty-state/day-state treatment for dates without planned activities.

### Phase 3.5 - Rest-Day Domain Migration

- [x] Decide the compatibility strategy for legacy persisted `rest_day` rows (temporary read-only compatibility, filtered reads, or explicit cleanup migration).
- [x] Remove `rest_day` from shared editable event schemas once transition safety is in place.
- [x] Stop allowing new `rest_day` creates/updates in `packages/api/src/routers/events.ts`.
- [x] Stop materializing explicit `rest_day` events from plan structures in `packages/core/plan/materializePlanToEvents.ts`.
- [x] Update plan verification helpers that count explicit `rest_day` rows so they infer rest from dates without planned sessions.
- [ ] Ensure remaining non-calendar summary consumers derive rest from lack of planned activities instead of a persisted `rest_day` event.

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
- [x] Add bottom-sheet interaction tests for calendar actions and event preview.
- [x] Add rendering tests for richer planned-activity event content.
- [ ] Add rendering tests for low-noise month-cell density indicators and calm empty-day states.
- [x] Add regression coverage proving days with only custom/race/imported events still count as rest when no `planned` event exists.
- [x] Add regression coverage proving explicit `rest_day` creation is no longer available from UI or API entry points.
- [ ] Add drag/drop gesture coverage once Phase 4 begins.
- [ ] Add failure-path tests for invalid drop attempts and drag-mutation rollback.
- [x] Run the narrowest relevant typecheck/test commands for touched mobile files before implementation handoff or commit.

## Completed Summary

- Reviewed the current mobile calendar architecture and confirmed that the existing week-strip agenda is not a clean extension point for the desired product vision.
- Captured a new spec for a simpler dual-mode calendar centered on infinite day and month browsing, bottom-sheet-driven actions, richer event cards, and a phased drag-and-drop follow-up.
- Prepared the implementation foundation: the current `calendar.tsx` is a 1600+ line coordinator tightly coupled to week-strip state, the schedule-query helper is still generic, and refresh logic does not preserve any calendar-specific context yet.
- Locked the implementation direction for Phase 1: `day` becomes the default mode, `Today` resets `activeDate` to today and snaps `visibleAnchor` to the current mode boundary, day/month use separate renderers backed by one normalized event-by-date map, and calendar context should persist in a small zustand + AsyncStorage store.
- Defined the extraction boundaries for implementation: keep `apps/mobile/app/(internal)/(tabs)/calendar.tsx` as the screen coordinator, move date math / anchor rules / query-range builders into `apps/mobile/lib/calendar/*`, and move the mode switcher, header shell, day list, month list, event card, and bottom-sheet surfaces into `apps/mobile/components/calendar/*`.
- Documented the first UI removals required by the redesign: the week strip, previous/next week controls, gap cards, large helper empty states, and route-first event tap behavior should all be removed or demoted behind the new compact shell and sheet-first interaction model.
- Started Wave 1 route thinning by extracting the manual-create modal/form slice out of `apps/mobile/app/(internal)/(tabs)/calendar.tsx` into a focused calendar component while keeping the route as the mutation and screen coordinator.
- Continued Wave 1 route thinning by extracting the remaining date-visibility, event-action, drag/drop, and sheet coordination callbacks into `apps/mobile/lib/calendar/useCalendarScreenController.ts`, leaving `calendar.tsx` closer to screen composition plus query/mutation ownership.
- Simplified the active calendar shell again: the header now keeps the day/month toggle left-aligned, uses a month-only reset-to-day button plus create button on the right, removes the duplicate context copy, and lets the day list render beneath lighter day-date text instead of a second card-like header.
- Synced visible-day scrolling back into `activeDate` so create flows follow the currently visible day, and expanded `calendar-screen.jest.test.tsx` coverage for month-reset behavior plus visible-day create targeting.
- Verified the current calendar slice with `pnpm --filter mobile check-types` and `pnpm --filter mobile test:jest:file calendar-screen.jest.test.tsx`.
- Rest-day migration summary: calendar actions now keep only planned activity, race target, and custom event creation; the mobile manual-create flow no longer accepts `rest_day`; `CalendarDayList.tsx` infers rest from dates without `planned` events; `packages/core` no longer materializes `rest_day` plan events or accepts them in editable write schemas; and `packages/api/src/routers/events.ts` blocks new `rest_day` writes while hiding legacy `rest_day` rows from router reads.
- Shared migration slice landed too: `packages/core` no longer materializes `rest_day` plan events or accepts `rest_day` in editable write schemas, while `packages/api/src/routers/events.ts` blocks new `rest_day` writes, hides legacy `rest_day` rows from router reads, and now infers weekly rest from unique planned dates instead of raw session count. Focused verification passed with `pnpm --filter @repo/core check-types`, targeted core Vitest, `pnpm --filter @repo/api exec vitest run src/routers/__tests__/events.test.ts`, and `pnpm --filter @repo/api check-types`.
- Phase 3 follow-up landed: day-card taps now stay sheet-first while routed detail/edit remains a fallback only for supported planned/custom/race-target paths; imported and legacy `rest_day` preview states stay read-only with no routed detail/edit affordances; non-start quick actions now read as `Preview`; and the remaining non-calendar legacy `rest_day` assumptions were removed from the home cards. Focused verification passed with `pnpm --filter mobile check-types`, `pnpm --filter mobile exec vitest run lib/calendar/__tests__/eventRouting.test.ts`, `pnpm --filter mobile test:jest:file calendar-screen.jest.test.tsx`, and `pnpm --filter mobile test:jest:file home-cards.jest.test.tsx`.
- Phase 3 bounded mobile polish is now in: the routed `event-detail` screen explicitly presents itself as the advanced fallback behind the default preview sheet, planned-event reschedule still hands off through `ScheduleActivityModal`, event cards now emphasize title/time plus category-duration-description content instead of badge rows, and preview sheet metadata now matches the calmer card model. Focused verification passed with `pnpm --filter mobile check-types`, `pnpm --filter mobile exec vitest run lib/calendar/__tests__/eventRouting.test.ts lib/calendar/__tests__/eventPresentation.test.ts`, and `pnpm --filter mobile test:jest:file calendar-screen.jest.test.tsx event-detail-delete-redirect.jest.test.tsx event-detail-fallback.jest.test.tsx`.
