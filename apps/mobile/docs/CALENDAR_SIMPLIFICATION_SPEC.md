# Calendar Simplification Spec

## Goal

Reduce calendar complexity by making month scroll the primary browsing surface and replacing the full day-view mode with a lightweight selected-day agenda.

## Problem

The current calendar maintains two parallel interaction models:

1. a scrollable month view for scanning dates
2. a scrollable day view for browsing event details

This increases product and implementation complexity because users must understand two modes, and the code must maintain duplicated viewport logic, range extension behavior, and mode persistence.

## Product Direction

The calendar should become a single month-first experience:

1. Users browse the calendar by vertically scrolling months.
2. Users tap a day to select it.
3. The selected day shows a compact agenda beneath the month grid.
4. Event actions remain in sheets and detail flows rather than on the primary calendar surface.

## Scope

In scope:

1. Remove the explicit day/month mode switcher from the calendar header.
2. Make month view the only primary calendar viewport.
3. Add a selected-day agenda panel beneath the month list.
4. Preserve event preview, create, edit, delete, and start flows.
5. Preserve month scrolling and visible month tracking.

Out of scope:

1. redesigning event detail flows
2. changing event creation schemas or backend APIs
3. adding a new weekly view
4. introducing inline drag-and-drop rescheduling in the simplified month surface

## Interaction Rules

1. Calendar opens into the month-first experience.
2. `Today` selects the current date and ensures its month is visible.
3. Selecting a day updates agenda content in place.
4. Event tap opens the existing preview sheet.
5. Quick-create uses the selected date as the action context.

## Technical Design

1. Reuse `CalendarMonthList` as the primary surface.
2. Add a focused `CalendarSelectedDayAgenda` component beneath the month list.
3. Simplify the header to context label + `Today` + create.
4. Default persisted calendar mode to month behavior while tolerating older stored values.

## Testing

Targeted validation should cover:

1. initial render shows month content and selected-day agenda
2. tapping a month cell updates the agenda
3. `Today` selects today and keeps the correct month visible
4. event tap still opens preview behavior
5. quick-create still uses the selected date context
