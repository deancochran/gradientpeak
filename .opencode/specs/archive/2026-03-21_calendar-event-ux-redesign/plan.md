# Implementation Plan: Calendar + Event UX Redesign

## 1. Strategy

Treat this as a focused mobile information-architecture and interaction redesign pass.

Implementation should proceed in this order:

1. unify event-detail ownership,
2. redesign event rows and calendar interactions,
3. simplify scheduling flow surfaces,
4. repurpose or retire duplicate supporting list surfaces,
5. validate cross-screen navigation and usability.

The goal is not to add more screens. The goal is to reduce ambiguity and make scheduling workflows faster to understand and complete.

## 2. Problems To Solve

### A. Calendar naming and behavior are misaligned

The current tab is named `Calendar`, but the experience is primarily an agenda scroller with weak date-navigation affordances.

### B. Event-row information density is too low

The current rows do not make type, status, plan linkage, and quick actions obvious enough for fast scanning.

### C. Scheduled-event details have split ownership

The current detail flow is divided between `event-detail.tsx` and `scheduled-activity-detail.tsx`, creating overlap and uneven action hierarchy.

### D. Scheduling surfaces are visually heavy

The schedule modal and picker work, but they are not as quick or supportive as they could be.

### E. The scheduled-activities list is not clearly differentiated

It overlaps with calendar instead of offering a distinct operational value.

## 3. Target Product Behavior

### A. Calendar tab

- the tab keeps the `Calendar` name,
- the top of the screen clearly behaves like a calendar,
- the main content remains a fast agenda for selected-day action,
- empty and busy days are both easy to interpret.

### B. Event rows

- each row communicates event type, state, and actionability quickly,
- planned workouts show richer metadata than generic events,
- quick actions are more discoverable than long-press-only behavior.

### C. Event detail

- all event types route to the same detail screen,
- planned-event actions are available without navigating to a second detail screen,
- the top of the screen emphasizes next actions rather than passive metadata.

### D. Schedule modal and picker

- plan selection supports both browse and search,
- scheduling defaults to a compact confirmation flow,
- rich preview and constraint details remain available but are not mandatory reading.

### E. Supporting list surface

- the scheduled-activities screen becomes a clearly differentiated `Upcoming` screen,
- it no longer acts as a second general-purpose calendar,
- it is optimized for short-horizon triage rather than date browsing.

`Upcoming` should use a fixed section model so the implementation does not drift into another generic grouped list:

- `Needs Attention` for urgent review items,
- `Today` for actionable current-day work,
- `Next 7 Days` for near-term visibility,
- `Recently Completed` for short-window confirmation.

## 4. Planned File Areas

### Core screens and components

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
- `apps/mobile/app/(internal)/(standard)/event-detail.tsx`
- `apps/mobile/components/ScheduleActivityModal.tsx`
- `apps/mobile/components/calendar/CalendarPlannedActivityPickerModal.tsx`
- `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx`

### Supporting routes and legacy detail ownership

- `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx`
- `apps/mobile/lib/calendar/eventRouting.ts`
- `apps/mobile/lib/constants/routes.ts`

### Optional extracted UI pieces

- a reusable calendar week-strip component,
- a reusable event-row component,
- shared event-status badge helpers.

## 5. Phase Plan

### Phase 1: Canonical Detail Ownership

- audit parity gaps between `event-detail.tsx` and `scheduled-activity-detail.tsx`,
- migrate planned-event actions into `event-detail.tsx`,
- route all scheduled-event opens through the canonical event-detail path,
- demote or retire `scheduled-activity-detail.tsx` once parity is reached.

### Phase 2: Calendar Tab Redesign

- replace the current `Focus Day` presentation with a calendar-native header/control band,
- add a compact week strip and month/date-jump behavior,
- redesign agenda rows for higher state density and clearer interactions,
- refine empty-state handling so blank ranges do not feel like dead space.

### Phase 3: Schedule Flow Simplification

- simplify `ScheduleActivityModal.tsx` to make date/confirmation the primary path,
- move rich workout preview and constraint details into collapsible sections,
- upgrade the planned-activity picker with filters, grouping, and richer previews.

### Phase 4: Upcoming Surface Repurpose

- repurpose `scheduled-activities-list.tsx` into `Upcoming`,
- restructure the screen around short-horizon operational sections such as `Today`, `Next 7 Days`, `Needs Attention`, and `Recently Completed`,
- enforce one-section-per-event assignment with explicit section priority rules,
- redesign rows around action-led metadata and trailing contextual actions,
- align route names, headers, and navigation entry points with the new purpose,
- ensure no stale CTA points users to a redundant surface.

### Phase 5: Cross-Screen Validation

- verify calendar row interactions and detail routing,
- verify planned-event start/reschedule/open-plan flows from the canonical detail screen,
- verify schedule modal, picker, and calendar entry points feel coherent,
- verify the supporting list surface no longer competes with calendar.

## 6. Design Constraints

### A. Keep users in context

Date selection and scheduling should remain anchored to the day the user started from whenever possible.

### B. Avoid mode sprawl

Do not add multiple heavy calendar modes before the core hybrid calendar-plus-agenda interaction is solid.

### C. Preserve event-type nuance without multiplying screens

Different event types may need different actions, but that should happen inside one detail architecture.

### D. Keep the primary path light

The default schedule flow should optimize for fast completion, not exhaustive preview.

## 7. Validation

Focused checks should include:

```bash
pnpm --filter mobile check-types
pnpm --filter mobile test -- --runInBand
```

Required product validations:

- selecting a day from the new calendar control updates the agenda correctly,
- a busy day is easier to scan because rows show richer state,
- planned, custom, rest, race-target, and imported events all open into one canonical detail screen,
- planned-event actions like start and reschedule remain available after detail unification,
- scheduling from calendar feels lighter and stays anchored to the chosen day,
- the planned-activity picker supports browse and search equally well,
- the new `Upcoming` screen is clearly differentiated from `Calendar` and supports fast triage.
- the new `Upcoming` screen consistently places items into the correct section and makes the next action obvious.

## 8. Expected Outcomes

- The `Calendar` tab feels like a true calendar without losing agenda speed.
- Event rows become meaningfully faster to scan.
- Event-detail ownership becomes simpler and more maintainable.
- Scheduling feels more like confirmation and less like secondary research.
- Supporting navigation becomes easier to understand because `Upcoming` has a distinct operational role from `Calendar`.
