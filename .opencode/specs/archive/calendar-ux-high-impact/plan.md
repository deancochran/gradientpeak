# Plan

## Phase 1 - Navigation Stability

Goal: stop the calendar from overriding user intent while browsing.

1. Separate explicit selection state from passive viewport state.
2. Prevent `onViewableItemsChanged` style updates from rewriting explicit user choice during programmatic jumps.
3. Restore last browsed calendar context when returning to the tab.
4. Ensure refresh flows preserve current anchor date and week.

Exit criteria:

- selected date no longer drifts during normal scroll
- returning to the tab preserves browsing context
- week strip no longer snaps unexpectedly while agenda content moves

## Phase 2 - Better Time Navigation

Goal: make movement across time feel deliberate without expanding the calendar into a new navigation product.

1. Preserve and strengthen previous/next week buttons as explicit controls.
2. Keep the agenda listing infinitely scrollable in both directions.
3. Add snapping so scroll settles on the start of a week.
4. Keep `Today` reset reliable and context-preserving.

Exit criteria:

- users can move week to week with reliable controls
- infinite browsing remains available, but it feels structured around week boundaries

## Phase 3 - Better Rescheduling UX

Goal: let users change event timing cleanly using the existing editing model.

1. Improve the current event edit/reschedule path for editable event types.
2. Support date, time, and all-day editing in the chosen existing flow.
3. Reuse recurring scope prompts after change commit, not before editing starts.
4. Keep the path understandable from the calendar tab and event detail.

Exit criteria:

- planned events can change time from the calendar tab
- the edit flow feels direct and understandable
- recurring edits still preserve scope selection safely

## Recommended Execution Order

1. Phase 1 navigation stability
2. Phase 2 better week navigation
3. Phase 3 better rescheduling UX
4. Follow-up polish only after the above interactions feel stable in testing
