# Design: Calendar + Event UX Redesign

## 1. Vision

GradientPeak's `Calendar` tab should feel unmistakably like a calendar while still being the fastest place to scan, open, create, and adjust scheduled events.

The target experience is a hybrid:

- a calendar-native header and date-navigation control that gives users temporal orientation,
- an agenda-style event list that stays optimized for quick action,
- one canonical event detail screen for every event type,
- one lightweight scheduling flow that keeps users in context,
- one supporting list surface that complements calendar instead of duplicating it.

## 2. Product Goals

- Preserve `Calendar` as the correct tab name by making the tab visibly calendar-native.
- Improve event-row scanning so users can identify event type, state, and next action at a glance.
- Collapse split planned-event vs generic-event detail behavior into one canonical screen.
- Simplify scheduling so the modal feels like confirmation, not a secondary deep-detail screen.
- Improve plan selection so users can find the right activity plan quickly without depending entirely on search.
- Remove or repurpose redundant schedule surfaces that compete with `Calendar`.

## 3. Current Problems

### A. The Calendar tab behaves more like a long schedule list than a calendar

`apps/mobile/app/(internal)/(tabs)/calendar.tsx` currently centers the experience on a long `SectionList` with a `Focus Day` label and a `Today` jump, but it lacks strong date-navigation affordances such as a week strip, month context, or quick date jumping.

This creates expectation drift: the tab is named `Calendar`, but the interaction model is closer to `Schedule`.

### B. Event rows are too visually flat

The current agenda rows show time, title, and a small event-type label, but they do not strongly surface:

- event type,
- completion state,
- recurring/imported/read-only state,
- linked-plan context,
- quick actionability.

This makes the list slower to scan than it should be, especially on busy days.

### C. Event detail behavior is split across overlapping screens

`apps/mobile/app/(internal)/(standard)/event-detail.tsx` and `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx` both represent event details, but they differ in structure and action emphasis.

This creates product drift, duplicate logic, and inconsistent expectations about where planned-event actions live.

### D. The schedule modal asks users to absorb too much before acting

`apps/mobile/components/ScheduleActivityModal.tsx` includes plan preview, charting, date selection, notes, and constraint messaging in one long flow.

The modal should support fast scheduling, but it currently behaves more like a mini detail screen.

### E. The plan picker is functional but not very helpful

`apps/mobile/components/calendar/CalendarPlannedActivityPickerModal.tsx` primarily offers search plus a flat list of saved plans.

That works for power users who already know what they want, but it does not help users browse by sport, recency, favorites, or likely-fit recommendations.

### F. Scheduled activities list duplicates calendar value

`apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx` currently acts as a second schedule surface. It overlaps with the `Calendar` tab instead of serving a distinct operational purpose.

## 4. Core Product Decisions

### A. Calendar remains the tab name

The app should keep the `Calendar` tab label, but the screen must earn that label through clear date-navigation controls.

### B. The main body remains agenda-first

The primary content area should stay optimized for fast event scanning and action-taking. A dense month-grid-first design would slow the most common execution workflows.

### C. Calendar shell + agenda body is the target interaction model

The redesigned screen should combine:

- a compact calendar control band for orientation and date selection,
- a selected-day summary,
- an agenda list for the selected day and nearby continuity.

### D. One canonical event detail screen owns all event types

There should be one routed detail surface for planned, rest-day, race-target, custom, and imported events. Type-specific actions and sections can vary within that single screen, but the route and mental model should remain unified.

### E. Scheduling flows should be lightweight and context-preserving

Scheduling from calendar should feel like confirming a choice on a day, not launching into a second, denser planning experience.

### F. Supporting schedule surfaces should complement, not compete

The current scheduled activities list will be retained and repurposed into an `Upcoming` operational list rather than removed.

This preserves a useful secondary surface for triage and quick-following actions, while giving it a clearly different job than `Calendar`.

## 5. Target UX

### A. Calendar tab structure

The redesigned `apps/mobile/app/(internal)/(tabs)/calendar.tsx` should include:

1. app header with `Calendar`, `Today`, and create action,
2. compact calendar control band with week-strip navigation,
3. selected-day summary,
4. agenda list for the selected day and adjacent continuity,
5. empty states that lead directly into creation.

### B. Calendar control band

The control band should provide the missing calendar affordances:

- visible month label,
- horizontal week strip,
- selected day state,
- today state,
- day-level event dots or counts,
- week navigation,
- tap-to-open date jump or month picker.

This is the key move that makes the tab feel like a true calendar.

### C. Event-row redesign

Each event row in `apps/mobile/app/(internal)/(tabs)/calendar.tsx` should show:

- left rail for time or all-day state,
- title and event subtype,
- compact metadata such as sport, duration, or TSS when available,
- type icon and color treatment,
- badges such as `Completed`, `Recurring`, `Read-only`, or `From Plan`,
- a visible quick-action affordance.

Long press may remain as a secondary gesture, but primary quick actions should be more discoverable than they are today.

### D. Canonical event detail

`apps/mobile/app/(internal)/(standard)/event-detail.tsx` should become the only detail screen for scheduled events.

Its structure should be:

1. hero summary,
2. primary action row,
3. event details,
4. linked plan or training context,
5. notes and recurrence information,
6. destructive actions at the bottom.

Planned events should surface `Start`, `Reschedule`, and `Open Plan` near the top. Imported events should be clearly read-only. Simpler event types should expose lighter edit and move controls.

### E. Schedule modal redesign

`apps/mobile/components/ScheduleActivityModal.tsx` should become lighter and more action-led.

The modal should foreground:

- selected activity plan,
- selected date,
- optional notes,
- concise validation state,
- one clear submit action.

Detailed workout preview, charts, and constraint specifics should move into collapsible sections so they are available without dominating the default flow.

### F. Plan picker redesign

`apps/mobile/components/calendar/CalendarPlannedActivityPickerModal.tsx` should support both browse and search modes.

The picker should add:

- sport/category filter chips,
- grouped sections such as `Suggested`, `Recent`, `Favorites`, and `All Plans`,
- richer row metadata,
- stronger guidance on which plan is likely a good fit.

### G. Upcoming screen decision

`apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx` should be repurposed into `Upcoming`.

Its job is not date navigation. Its job is operational triage and quick re-entry into the next important scheduled items.

The screen should be organized with sections such as:

- `Today`,
- `Next 7 Days`,
- `Needs Attention`,
- `Recently Completed`.

This creates a distinct operational view rather than a second calendar.

The `Upcoming` surface should also bias toward actionability:

- stronger emphasis on the next startable workout,
- obvious empty states for "nothing today" vs "nothing scheduled at all",
- quick routing into canonical event detail,
- optional lightweight filters such as `All`, `Planned`, and `Needs Attention` if needed later.

### H. Upcoming section rules

`Upcoming` should use deterministic section rules so users can predict where an item will appear.

The screen should evaluate items in this priority order:

1. `Needs Attention`
2. `Today`
3. `Next 7 Days`
4. `Recently Completed`

Each event should appear in only one section at a time.

#### Needs Attention

This section appears first when it has content.

It should include scheduled items that need user review, such as:

- overdue planned workouts that were not completed,
- items with blocking or warning state the user should notice,
- events whose current state makes them poor candidates for passive browsing.

This section is for triage, so it should stay compact and high-signal.

#### Today

This section should include all non-completed items scheduled for the current local day that are not already captured by `Needs Attention`.

Items here should be ordered by:

- startable planned activity first,
- then timed events in chronological order,
- then all-day items.

The top item in `Today` should read as the user's next obvious action.

#### Next 7 Days

This section should include future non-completed scheduled items from tomorrow through seven days ahead that are not already captured elsewhere.

Items should be grouped visually by day label inside the section, but the section itself should remain a single short-horizon list rather than another calendar.

#### Recently Completed

This section should include recently completed planned events for reassurance and quick review.

The default window should stay short, such as the last seven days, so the section supports confirmation rather than turning into a history screen.

Completed items should never appear above active work that still needs attention.

### I. Upcoming row behavior

Rows in `Upcoming` should feel denser and more action-led than the calendar agenda rows.

Each row should include:

- event title,
- date label when not already implied by the section,
- time or all-day label,
- event-type icon or sport icon,
- compact state badges,
- one line of supporting metadata.

#### Row metadata rules

Planned-event rows should prefer:

- sport type,
- duration,
- TSS,
- completion or overdue state.

Non-planned rows should prefer:

- event type,
- notes preview when useful,
- read-only or recurring indicators when relevant.

#### Primary and secondary actions

Tap should always open canonical event detail.

The row should reserve a trailing affordance area for context-sensitive actions such as:

- `Start` for the next startable planned workout,
- `Reschedule` for missed or upcoming planned workouts,
- overflow actions for less common operations.

The row should not depend on long press as the primary discovery path.

#### Visual hierarchy

The most actionable row in `Today` should have the strongest emphasis on the screen.

Rows in `Recently Completed` should deliberately step down in emphasis so they read as confirmation rather than urgent next steps.

## 6. File Ownership

### Primary implementation files

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
- `apps/mobile/app/(internal)/(standard)/event-detail.tsx`
- `apps/mobile/components/ScheduleActivityModal.tsx`
- `apps/mobile/components/calendar/CalendarPlannedActivityPickerModal.tsx`
- `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx` (repurposed to `Upcoming`)

### Supporting files likely affected

- `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx`
- `apps/mobile/lib/calendar/eventRouting.ts`
- `apps/mobile/lib/constants/routes.ts`
- shared event-row or schedule-list child components if extracted from `calendar.tsx`

## 7. Non-Goals

- Do not introduce a full month-grid-first navigation model as the default primary body.
- Do not redesign unrelated `Plan`, `Discover`, or recording surfaces.
- Do not change event-domain semantics beyond what is needed to unify UI behavior.
- Do not keep multiple overlapping scheduled-event detail screens once the canonical screen reaches parity.

## 8. Success Criteria

- Users can immediately understand time placement because the `Calendar` tab includes real calendar controls.
- Users can scan a busy day faster because event rows expose richer state and metadata.
- All event types open into one canonical detail screen with consistent interaction patterns.
- Scheduling a plan from calendar takes fewer cognitive steps and presents less non-essential detail by default.
- The plan picker is useful even when the user does not begin with search.
- The new `Upcoming` screen no longer competes with calendar as a duplicate schedule surface.
