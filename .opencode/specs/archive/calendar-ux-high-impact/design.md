# Calendar UX High Impact

## Objective

Define a narrow set of calendar-tab UX refinements that make the existing planning workflow feel reliable, fast, and polished without turning this into a feature-expansion project.

## Why This Spec Exists

- The current calendar blends week context, selected date, and visible scroll position into one state path, which makes browsing feel unstable.
- The main interaction model behaves like an infinite agenda feed instead of a predictable calendar.
- Planned events cannot be rescheduled with time changes directly from the calendar tab.
- The app already has useful quick actions, so the best ROI comes from making current capabilities feel better rather than adding many new ones.

## Selected UX Refinements

This spec intentionally avoids a feature-heavy redesign.

### 1. Stabilize Calendar Navigation State

Split calendar state into separate concepts:

- `selectedDate`: the day the user intentionally chose
- `visibleDate`: the day/section currently leading the agenda viewport
- `browsedWeekAnchor`: the week shown in the sticky week strip

Rules:

- User taps, explicit week navigation, and jump actions update `selectedDate`.
- Passive scrolling updates `visibleDate`, not `selectedDate`.
- The week strip is driven by `browsedWeekAnchor`, not by whichever section happens to be visible during scroll.
- Programmatic jumps temporarily suppress passive viewport-driven updates until the jump settles.
- Returning to the calendar restores the last browsed anchor and selected date instead of resetting to today unless no prior session state exists.

Why this is included:

- This is the root fix for the current “forced back to current week / visible week” problem.
- It improves every other interaction without adding visual complexity.

### 2. Improve Time Navigation Around Existing Controls

Keep the current calendar structure, but make its existing browsing model feel intentional instead of accidental.

Primary navigation refinements:

- Preserve the existing previous/next week buttons as the primary control.
- Keep `Today` as the primary reset action.
- Keep the listing below the week selector vertically scrollable with infinite loading.
- Make the listing snap to week boundaries so browsing always settles on the start of a week.

Interaction rules:

- Week navigation changes `browsedWeekAnchor` and keeps weekday context when possible.
- Tapping previous/next moves the list to the prior or following week start.
- Infinite scroll extends the agenda in both directions without breaking the current week anchor.
- After manual scroll, the list should settle on the nearest week start instead of stopping mid-week.
- Pull-to-refresh must preserve the current browsing context.
- Empty-gap cards remain supportive only; they should not become the primary way users move through time.

Why this is included:

- Users need predictable temporal movement more than more controls.
- Snapping the agenda to week starts makes the current vertical browsing model feel more calendar-like without adding a new mode.

### 3. Improve Rescheduling UX Inside Existing Editing Flows

Do not introduce a large new editing system. Instead, improve the current rescheduling path so it supports the edits users already expect.

Core capabilities:

- Support `date`, `time`, and `all-day` editing for planned, custom, race target, and rest day events when editable.
- Improve the current calendar edit/reschedule entry points so users can make common timing changes without confusion.
- Preserve recurring-scope selection, but ask for scope only after the user commits the change.
- Keep full detail screens for advanced editing, notes, linked plan review, and destructive actions.

Behavior rules:

- Planned events no longer rely on a date-only scheduling modal for rescheduling.
- The most common task, “move this workout/event to another day or time,” should feel direct in the current flow.
- Imported events stay read-only and surface a clear explanation.

Why this is included:

- Direct time editing is the biggest missing capability in the calendar tab today.
- This improves an existing capability rather than creating a new planning feature.

## Deliberate Non-Goals

- No month-grid redesign in this pass.
- No drag-and-drop rescheduling in this pass.
- No new multi-day or overlapping-event layout system in this pass.
- No changes to backend event schema unless required by an existing update mutation contract gap.
- No new standalone quick-edit product surface unless the current editor cannot be extended cleanly.
- No week-strip swipe gesture in this pass.
- No jump-to-date flow in this pass.

## Recommended UX Model

### Header And Week Strip

- Sticky summary header with month label, selected day summary, `Today`, and `Create`.
- Sticky week strip below header.
- Week strip is driven by stable browse state, not passive scroll churn.
- Week strip uses explicit previous/next controls only.
- The strip should feel like a navigation control, not a reflection of incidental scroll position.

### Agenda Body

- Agenda list remains useful for day details and empty states.
- The list scrolls vertically with infinite loading.
- The list should snap to the start of a week after scrolling settles.
- Previous/next week controls should align with the same snapped week boundaries used by the list.
- Empty states keep `Create event` and `Go to today`, but gap cards should no longer be the main navigation pattern.

### Event Row Interactions

- Tap: open event detail.
- Keep the current quick actions easy to discover.
- Long press can remain secondary, but core edit/reschedule should not depend on hidden interactions.
- If swipe actions are added later, they should be treated as polish, not required scope for this spec.

## Technical Direction

### State Ownership

- Keep orchestration in `apps/mobile/app/(internal)/(tabs)/calendar.tsx`.
- Extract small calendar interaction helpers if state transitions grow beyond screen readability.
- Persist last browsed calendar context in app-local state or an existing lightweight store if one already fits.

### Gesture Approach

- Prefer established React Native gesture primitives already used by the app runtime.
- Do not make hidden gestures the only path for core planning actions.
- Favor reliable scroll snapping over adding more gesture types.

### Editing Surface

- Reuse existing event update mutations.
- Prefer extending or clarifying the current editing/rescheduling flow before adding a new surface.
- Keep `ScheduleActivityModal` focused on scheduling a planned activity from a plan unless a minimal extension is the cleanest way to support time edits.

## Success Criteria

- Users can browse away from today without the week strip snapping back unexpectedly.
- Users can move week-to-week with reliable, predictable controls.
- The vertically scrolling listing can extend infinitely while always settling on a week start.
- Pull-to-refresh and navigation return preserve current calendar context.
- Editable planned events can change time without a confusing detour.
- Core calendar actions remain visible and usable without relying on hidden gestures alone.

## Validation Focus

- Screen tests for state restoration, week navigation, week snapping, and improved reschedule behavior.
- Interaction tests for viewport scroll not overwriting explicit selection.
- Tests for planned-event editing supporting date, time, all-day, and recurring scopes.
