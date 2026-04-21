# List Page Implementation Plan

## Purpose

Use this plan to bring the main mobile list screens into the shared list-page system defined in `list-page-spec.md`.

This plan is ordered to:

1. establish one strong grouped agenda reference
2. establish one strong flat library/history reference
3. propagate the same hierarchy and row language across the remaining lists

## Recommended Reference Screens

- Grouped agenda reference: `calendar-day`
- Flat library/history reference: `training-plans-list` or `activities-list`

`calendar-day` is already the closest to a calm agenda surface.

## Shared Rules To Apply On Every Screen

- Use a short page intro instead of ad hoc body headers.
- Default page-level actions to the top-right header dropdown.
- Keep controls in one top block.
- Keep result counts quiet and consistent.
- Make rows feel like previews of detail pages.
- Use one create entry point, not duplicates.
- Keep delete/archive out of list rows unless there is a strong management reason.
- Keep unread state compact on communication surfaces.
- Treat `My ...` owner-library screens as read/manage-first by default.
- Do not use body-level `Create`, `Record`, or similar encouragement on `My ...` screens unless the list is intentionally the creation hub.
- Do not default `My ...` screens into search/filter surfaces unless those controls solve a clear browsing problem.

## 1. Calendar Day

### Goal

Treat `calendar-day` as the agenda-style reference implementation for grouped time-based lists.

### Current Strengths

- already reads as a calm agenda surface
- uses one clear intro card
- rows are action-oriented but still navigable

### Target Adjustments

- keep the intro and count model as the grouped-list reference
- ensure quick actions remain visually secondary to row navigation
- use this screen as the model for other grouped schedule lists

### Acceptance Checklist

- [ ] Day intro remains concise and calm.
- [ ] Agenda rows remain detail-first with quick action second.
- [ ] Loading, empty, and retry states stay aligned with the shared pattern.

## 2. Scheduled Activities List

### Goal

Refactor `scheduled-activities-list` so it feels like the broader agenda companion to `calendar-day`.

### Current Problems

- count strip feels detached from the rest of the page
- no real page intro
- create action is duplicated through copy and FAB patterns
- list relies on older grouped component styling

### Target Structure

1. header dropdown for calendar navigation or scheduling
2. page intro for upcoming scheduled activities
3. optional controls only if they materially change the results
4. compact count summary
5. grouped agenda list
6. one schedule entry point

### Concrete Changes

- Add a short intro block above the grouped list.
- Fold the count strip into the intro or result summary.
- Pick one schedule action model: header dropdown or FAB.
- Bring `ActivityList` grouping headers closer to the `calendar-day` tone.

### Acceptance Checklist

- [ ] The screen opens with context, not a detached count bar.
- [ ] The schedule action is not duplicated.
- [ ] Grouped rows feel consistent with `calendar-day`.

## 3. Training Plans List

### Goal

Make `training-plans-list` the flat library reference for authored objects.

### Current Problems

- create action lives as a large body button above the list
- visibility badge is too prominent for a list row
- row footer copy is explanatory filler rather than useful context
- no intro or result summary
- the screen reads too much like a creation hub instead of a personal library index

### Target Structure

1. header dropdown with create action
2. short plans-library intro
3. optional scope controls later
4. plans count summary
5. compact plan rows

### Concrete Changes

- Remove `Create Training Plan` encouragement from the list body and empty state.
- Replace the explanatory footer copy with useful state or remove it.
- Quiet the visibility treatment so it only appears when it changes expectations.
- Add a short intro and a small count summary.

### Acceptance Checklist

- [ ] The screen no longer pushes training-plan creation from the list surface.
- [ ] Rows scan quickly without filler text.
- [ ] The page reads as a library, not a management form.

## 4. Activities List

### Goal

Refactor `activities-list` into the standard history-list pattern.

### Current Problems

- filter chips dominate the opening of the screen
- row cards are verbose and feel feed-like rather than history-like
- metric labels are heavy
- no page intro beyond controls
- the screen behaves more like a filter/search surface than a personal activity index

### Target Structure

1. header dropdown for sort and list-level actions
2. short activity-history intro
3. one unified control block for type and sort
4. result count summary
5. compact activity rows with metrics

### Concrete Changes

- Remove default filter chips unless a clear browsing need remains.
- Reduce row chrome and metadata repetition.
- Make metrics easier to compare at a glance.
- Remove `Record Activity` encouragement from the empty state unless this screen becomes the recording hub.

### Acceptance Checklist

- [ ] Filters are removed or demoted unless they solve a real browsing problem.
- [ ] Activity rows are more compact and comparison-friendly.
- [ ] The list feels connected to `activity-detail`.

## 5. Routes List

### Goal

Bring `routes-list` into the same library pattern without losing map context.

### Current Problems

- delete lives directly on every row
- upload action is duplicated between empty state and FAB patterns
- route map preview is visually dominant relative to row identity
- no intro or count summary

### Target Structure

1. header dropdown with upload action
2. routes-library intro
3. compact count summary
4. route rows with subordinate preview
5. no row-level delete by default

### Concrete Changes

- Move upload to the header dropdown or keep FAB, but not both.
- Remove per-row delete once the detail flow is considered authoritative.
- Reduce map preview dominance so the route name and stats lead.
- Add intro and result summary.

### Acceptance Checklist

- [ ] Upload action is not duplicated.
- [ ] Row identity reads before the map preview.
- [ ] Delete is no longer the loudest secondary affordance.

## 6. Activity Efforts List

### Goal

Refactor `activity-efforts-list` into a compact performance-history list.

### Current Problems

- row delete is still present even though a detail flow now exists
- card header/content split is heavier than needed
- no intro or result summary
- create action only exists as a FAB

### Target Structure

1. header dropdown with create action
2. efforts-history intro
3. optional filters later
4. result summary
5. compact effort rows

### Concrete Changes

- Move create into the header dropdown unless usage proves FAB is essential.
- Simplify each row into one compact press target.
- Move delete to detail once that flow is fully trusted.
- Add intro and count summary.

### Acceptance Checklist

- [ ] Each row is one compact readable preview.
- [ ] Delete is not competing with navigation on the row.
- [ ] The page feels like history, not an edit list.

## 7. Profile Metrics List

### Goal

Align `profile-metrics-list` with the same history-list system while keeping it very quiet.

### Current Problems

- no intro or summary
- rows are visually consistent but still isolated from the broader system
- empty and loading states are more generic than the other lists

### Target Structure

1. optional header dropdown action later
2. metrics-history intro
3. optional metric-type filters later
4. result summary or latest-record summary
5. compact metric rows

### Concrete Changes

- Add a short intro and summary.
- Keep the current row calmness, but align spacing and hierarchy with the list standard.
- Only add create/logging actions if the product exposes metric entry here.

### Acceptance Checklist

- [ ] The page opens with context.
- [ ] Rows remain calm and compact.
- [ ] The screen feels like part of the same list system as activities and efforts.

## 8. Messages

### Goal

Audit `messages` as the reference communication list for conversation browsing.

### Current Problems

- no intro or summary state
- loading and empty states are generic
- row styling is functional but still closer to a raw inbox than the shared list system
- unread badge treatment may end up heavier than necessary next to the row emphasis itself

### Target Structure

1. header title and optional dropdown action later
2. optional inbox intro or unread summary
3. no extra controls by default
4. compact conversation list
5. empty state with a more helpful next-step explanation

### Concrete Changes

- Decide whether this screen needs a short unread summary or should open directly into the list.
- Keep conversation rows compact and preview-oriented.
- Ensure unread treatment uses one strong signal, not several competing ones.
- Improve empty state language so it explains how conversations begin.

### Acceptance Checklist

- [ ] Rows scan quickly for name, preview, timestamp, and unread state.
- [ ] Empty and loading states match the shared list language.
- [ ] The screen feels deliberate, not like a raw transport list.

## 9. Notifications

### Goal

Audit `notifications` as the reference actionable inbox list.

### Current Problems

- no intro or unread summary beyond `Read All`
- every row uses the same structural weight even when only some are actionable
- actionable follow-request buttons may make those rows visually heavy
- timestamp formatting is more generic than the messages screen

### Target Structure

1. header dropdown action for `Read All`
2. optional unread summary
3. no extra controls by default
4. compact notification list
5. inline response actions only where required

### Concrete Changes

- Add a light unread summary if it improves orientation.
- Tighten row hierarchy so title, description, unread state, and time are easy to scan.
- Keep action buttons visually secondary to the notification itself.
- Align timestamp tone with the messages list where possible.

### Acceptance Checklist

- [ ] `Read All` remains the primary page-level action.
- [ ] Actionable rows stay readable without overpowering non-actionable rows.
- [ ] Unread state and timestamps are easy to scan but visually quiet.
