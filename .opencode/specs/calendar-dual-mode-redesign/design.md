# Calendar Dual-Mode Redesign

## Objective

Redesign the mobile calendar tab around a simpler, lower-chrome planning experience: an infinite day view, an infinite month view, compact bottom-sheet-driven actions, and richer event cards that surface the actual content users care about.

## Why This Spec Exists

- The current week-strip plus previous/next controls make time navigation feel mechanical instead of fluid.
- The top-of-screen calendar chrome takes too much space relative to the value it provides.
- The current calendar is optimized around week navigation, but the desired experience is direct browsing through time.
- Creating, inspecting, and moving events are split across too many interaction surfaces.
- The product goal is not more UI; it is fewer visible controls with more useful interaction depth behind them.

## User Intent Behind The Change

This redesign is driven by three product needs:

1. Browsing time should feel continuous.
2. The screen should stay visually quiet.
3. Event interaction should become more powerful without adding more text or visible buttons.

In practice, that means:

- replace explicit week stepping with infinite scrolling
- support both `day` and `month` mental models
- preserve the user's active date while switching modes
- move secondary actions into a bottom sheet
- show richer event content directly inside calendar cards so users need fewer taps

## Product Principles

- Minimal chrome: every always-visible control must justify its footprint.
- One anchor date: the calendar should always know the user's active day and preserve it across mode switches.
- Scroll over buttons: movement through time should primarily happen through swiping and scrolling, not repeated taps.
- Sheets over screen clutter: advanced actions should live in a Gorhom bottom sheet instead of persistent button rows.
- Content over labels: event cards should show meaningful event information, not just generic type names.
- Fast interpretation: users should understand where they are and what is scheduled with very little reading.

## Current-State Audit

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx` is a week-strip-driven agenda built around explicit previous/next week controls.
- The current header, week strip, gap cards, and empty-state cards add multiple layers of UI before the event content starts.
- Infinite browsing exists today, but it is structured around snapped weeks rather than the desired day/month modes.
- Event actions are fragmented across alerts, modal flows, route pushes, and screen-level detail.
- The app already includes `@gorhom/bottom-sheet`, so the desired sheet interaction pattern fits the existing runtime.

## Selected UX Direction

### 1. Two Calendar Modes

The calendar gets two primary modes only:

- `day`
- `month`

These are peer modes, not separate products.

Shared rules:

- The screen keeps a single `activeDate`.
- Switching from `day` to `month` snaps to the start of `activeDate`'s month.
- Switching from `month` to `day` snaps to the start of `activeDate`.
- Tapping a day in month mode sets `activeDate` to that day and immediately opens day mode.
- `Today` resets `activeDate` to today, then snaps the current mode to its natural boundary.

Natural boundaries:

- `day` mode snaps to the start of a day.
- `month` mode snaps to the start of a month.

### 2. Minimal Calendar Shell

Remove the current large week-navigation shell.

Keep only:

- `AppHeader` title
- a compact mode switcher for `day` and `month`
- a single primary icon affordance for actions/options
- lightweight contextual date labeling tied to the visible page

Guidance:

- Avoid text buttons like `Create`, `Previous`, and `Next` in the default layout.
- Keep `Today` available, but prefer an icon-first treatment or sheet action if it can remain intuitive.
- Do not reintroduce stacked helper text, gap cards, or explanatory copy unless the screen is otherwise empty.

### 3. Day Mode

Day mode becomes the primary planning and interaction surface.

Behavior:

- Render as an infinite vertically scrolling list of day pages.
- Each page snaps cleanly to the top of a day.
- The visible page drives the contextual date label.
- Each day page can show a lightweight time-based layout or stacked event layout, but it must feel like one focused day at a time.
- Empty days should stay visually calm: no large empty-state card unless the page would otherwise feel broken.

Interaction rules:

- Tap event card -> open event detail bottom sheet.
- Long press or drag handle -> enter drag state for editable events.
- While dragging, users can move an event to another day by dragging across day boundaries with auto-scroll support.
- Imported/read-only events never enter drag/edit state.

### 4. Month Mode

Month mode is the browse-and-jump surface.

Behavior:

- Render as an infinite vertically scrolling list of month blocks.
- Each month snaps to its first row / month start.
- Month cells should stay lightweight and dense.
- The active day remains visually highlighted.
- Event density indicators should stay minimal: dots, compact chips, or small stacked hints instead of verbose labels.

Interaction rules:

- Tap day cell -> set `activeDate` and switch to day mode.
- Month mode should not become a second full event editor.
- If a day needs extra actions from month mode, use the bottom sheet rather than expanding the cell UI.

### 5. Bottom-Sheet Model

Adopt `@gorhom/bottom-sheet` as the main secondary interaction surface.

Use one shared bottom-sheet system with clear content states:

- `calendar-actions`
- `event-preview`
- `day-actions` if needed later

`calendar-actions` should consolidate creation and utility actions such as:

- create goal
- create activity
- create rest/race/custom event
- jump to today if it is not already obvious from the shell

`event-preview` should open from an event tap inside day mode and provide:

- key event details
- edit/move/delete actions when allowed
- start action for startable planned activities
- open full detail only if the user needs a deeper screen

Design rule:

- If an action can live in the sheet, keep it out of the always-visible UI.

### 6. Event Card Content

Event cards should present the content of the event, not just its event type.

Planned activity cards should prefer:

- activity title
- intensity or effort label
- duration or other key metric
- one to two lines of useful description when available

Other event cards should prefer:

- event title
- scheduled time or all-day state
- one short supporting line from notes or metadata

Presentation rules:

- keep cards compact but information-rich
- use iconography and color sparingly
- avoid long badge rows unless they add scheduling value

## State Model

The redesign should replace the current week-centered state with a simpler calendar state model.

Minimum shared state:

- `mode`: `day | month`
- `activeDate`: the user's selected date
- `visibleAnchor`: the snapped day start or month start currently leading the viewport
- `selectedEventId`: optional event selected for bottom-sheet preview
- `sheetState`: closed or specific content mode

Rules:

- Passive scroll updates `visibleAnchor`.
- Explicit day taps and mode-switch actions update `activeDate`.
- Mode switches derive the next `visibleAnchor` from `activeDate`, not from incidental scroll noise.
- The app should restore the last `mode`, `activeDate`, and `visibleAnchor` when returning to the calendar tab.

## Detailed Changes By Phase

### Phase 1 - Foundation And Architecture

Detailed changes:

- Remove week-first assumptions from `apps/mobile/app/(internal)/(tabs)/calendar.tsx`, especially `weekAnchorDate`, week-strip rendering, and week-snap orchestration.
- Replace the current week-centered screen state with a shared `mode`, `activeDate`, `visibleAnchor`, `selectedEventId`, and `sheetState` model.
- Move from one ever-expanding agenda query toward a windowed visible-range strategy that can support both day and month renderers.
- Normalize event data by date so day mode and month mode can read from one source of truth.
- Decide which logic remains in `apps/mobile/app/(internal)/(tabs)/calendar.tsx` and which logic moves into extracted calendar helpers.
- Persist and restore calendar context so the tab returns to the last mode and anchor instead of resetting unexpectedly.

Implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
- `apps/mobile/lib/calendar/*` or extracted calendar view-model helpers
- `apps/mobile/lib/trpc/scheduleQueryOptions.ts`
- `apps/mobile/lib/scheduling/refreshScheduleViews.ts`
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`

### Phase 2 - Dual-Mode Browsing

Detailed changes:

- Remove the large week strip and previous/next week buttons from the default UI.
- Add a compact mode switcher that keeps `day` and `month` visible without adding extra copy.
- Build day mode as an infinite vertically scrolling day pager that snaps to day starts.
- Build month mode as an infinite vertically scrolling month list that snaps to month starts.
- Keep the visible date label tied to the snapped anchor so the header reflects where the user is, not transient scroll noise.
- Preserve the active date across mode switches using the exact rules defined earlier: `day -> month` snaps to month start for the active day; `month -> day` snaps to active day start.
- Make tapping a day cell in month mode switch directly into day mode on that chosen date.
- Replace large gap cards and verbose empty-state blocks with calmer empty-day rendering.

Implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
- extracted UI under `apps/mobile/components/calendar/*`
- mode/date helpers under `apps/mobile/lib/calendar/*`
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`
- related Maestro calendar flows under `apps/mobile/.maestro/flows/*`

### Phase 3 - Bottom Sheets And Event Presentation

Detailed changes:

- Introduce a shared Gorhom bottom-sheet controller inside the calendar tab.
- Consolidate create and utility actions into a `calendar-actions` sheet rather than exposing multiple always-visible buttons.
- Open an `event-preview` sheet when users tap an event in day mode.
- Keep advanced full-screen routes available only for deeper editing or detail cases that do not fit the sheet.
- Redesign event cards so they show event content instead of generic event-type labels.
- Planned activity cards should show title, intensity, duration, and up to two lines of useful description when available.
- Non-planned events should show title, time or all-day state, and one short supporting metadata line.
- Imported events remain clearly readable but non-editable.

Implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
- extracted sheets/cards under `apps/mobile/components/calendar/*`
- `apps/mobile/components/ScheduleActivityModal.tsx`
- `apps/mobile/lib/calendar/eventRouting.ts`
- `apps/mobile/app/(internal)/(standard)/event-detail.tsx`
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`
- `apps/mobile/components/__tests__/ScheduleActivityModal.jest.test.tsx`

### Phase 4 - Drag And Drop Rescheduling

Detailed changes:

- Add drag affordances for editable events in day mode.
- Support dragging an event from one day to another with auto-scroll between adjacent day pages.
- Show clear valid-drop and invalid-drop feedback without adding persistent UI clutter.
- Keep imported/read-only events non-draggable.
- Preserve recurring-scope handling after drop so recurring events still update safely.
- Define rollback behavior when a drag-based mutation fails.
- Decide whether the first drag pass moves dates only or also supports time-slot placement; the default recommendation is date movement first.

Implementation targets:

- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
- draggable day/event surfaces under `apps/mobile/components/calendar/*`
- drag helpers under `apps/mobile/lib/calendar/*`
- recurring/edit handoff surfaces such as `apps/mobile/components/ScheduleActivityModal.tsx`
- `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx`
- drag-focused Maestro flows under `apps/mobile/.maestro/flows/*`

## Technical Direction

- Use windowed visible-range fetching rather than repeatedly growing one large agenda query forever.
- Keep one normalized event-by-date source of truth for both modes.
- Keep month mode lightweight by rendering density and selection state instead of full event detail in cells.
- Reuse existing event mutation contracts unless the dual-mode architecture proves a contract gap.
- Build drag-and-drop on top of the new day-mode renderer, not on top of the old week agenda.

## Deliberate Non-Goals

- No return to previous/next week button navigation.
- No large explanatory text blocks inside the default calendar layout.
- No permanent toolbar full of labeled actions.
- No attempt to make month mode a full editing surface in the first pass.
- No backend event-schema rewrite unless the dual-mode fetch model proves it necessary.

## Success Criteria

- Users can browse time primarily through infinite scrolling, not repeated week-step taps.
- The calendar supports both `day` and `month` modes while preserving the active day correctly.
- Month mode always snaps to month starts, and day mode always snaps to day starts.
- Tapping a month cell opens day mode on the chosen date.
- Event taps in day mode open a Gorhom bottom sheet inside the calendar tab.
- The default screen shows less chrome and less text than the current implementation.
- Event cards show real event content, especially planned activity details, instead of generic labels only.
- Editable events can eventually be dragged between days without adding visible UI clutter.

## Validation Focus

- Screen tests for mode switching, active-date preservation, and snapped day/month scrolling.
- Interaction tests for month-cell tap -> day-mode transition.
- Bottom-sheet tests for calendar actions and event preview behavior.
- Event-card rendering tests proving planned activities surface intensity/title/description details.
- Gesture tests for drag/drop once that phase begins.
