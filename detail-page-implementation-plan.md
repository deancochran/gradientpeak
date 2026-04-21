# Detail Page Implementation Plan

## Purpose

Use this plan to bring the main mobile detail screens into the shared detail-page system defined in `detail-page-spec.md`.

This plan is ordered to:

1. establish one strong reference implementation
2. propagate the same layout and action hierarchy to related screens
3. reduce rework by solving shared patterns early

## Recommended Order

1. `route-detail`
2. `event-detail`
3. `training-plan-detail`
4. `goal-detail`

`activity-plan-detail` is already the closest to the target and should be treated as the current reference.

## Shared Rules To Apply On Every Screen

- Move screen-level actions into the screen header overflow menu.
- Keep only one lightweight personal action in the identity card.
- Remove badge rows under titles unless they are truly necessary state.
- Show linked first-class content early and make it tappable.
- Put metrics above charts.
- Keep charts quiet.
- Put social and secondary content below the main object content.

## 1. Route Detail

### Goal

Make `route-detail` feel like the route equivalent of `activity-plan-detail`.

### Current Problems

- opens with a full map before identity
- uses badge rows under the title
- keeps like/save and delete actions in the page body
- has no elevation profile section
- lacks linked-content sections such as plans that use the route

### Target Structure

1. screen header overflow menu
2. route identity card
3. route preview/map block
4. elevation profile
5. route metrics/statistics
6. linked usage content
7. optional comments/history later

### Concrete Changes

#### Header

- Add a top-right overflow menu.
- Move delete into the header menu.
- Reserve room for future route actions such as edit/share.

#### Identity Card

- Add a route icon on the left.
- Show route title and description directly.
- Move the save/like control to the top-right of the identity card.
- Remove the badge row under the title.
- Convert any essential facts into either a status line or downstream metrics.

#### Linked Primary Content

- Keep the route map as the first linked/primary visual block under identity.
- Treat the map as the route preview rather than the page header hero.

#### Analytical Content

- Add elevation profile under the map.
- Move compact route metrics above or alongside the elevation section.
- Keep route statistics quieter and more compact than the current labeled card.

#### Structured Body

- Replace the current generic stats-first body with route-specific structure if available.
- If no segments/waypoints exist yet, keep a compact route facts section instead of a heavy card.

#### Linked Usage Content

- Add a section showing linked activity plans or recent usage when available.
- Those rows should be tappable and open the related detail page.

### Acceptance Checklist

- [ ] Route identity appears before the map.
- [ ] Save is inside the identity card, not at the page footer.
- [ ] Delete is in the header overflow menu.
- [ ] Elevation profile renders below the route preview when data exists.
- [ ] Route-linked objects are shown as tappable previews.

## 2. Event Detail

### Goal

Keep `event-detail` scheduling-focused while using the same section ordering and action hierarchy as the other detail screens.

### Current Problems

- still relies on a sticky footer for major actions
- mixes detail-screen reading flow with form/action flow
- planned events are close to the target, but actions remain in the body
- non-planned events still feel like a fallback utility screen

### Target Structure

1. screen header overflow menu
2. event identity card
3. linked activity plan preview if present
4. linked route/elevation/intensity content if present
5. schedule details
6. recurrence or editing details
7. secondary notes/social later

### Concrete Changes

#### Header

- Move event actions into the header overflow menu.
- For planned events include:
  - start activity
  - change schedule
  - open activity plan
  - delete
- For editable non-planned events include:
  - edit
  - save/cancel only when in edit mode
  - delete

#### Identity Card

- Add a clearer event identity card at the top.
- Use icon + title + short description/subtitle.
- For planned events, the card should describe the scheduled object and timing without duplicating the full plan preview.

#### Linked Primary Content

- Keep the linked activity plan as the first major content block for planned events.
- Keep it tappable.
- Ensure route preview inside the embedded plan also navigates.

#### Analytical Content

- Preserve the route -> elevation -> intensity -> session flow ordering inside the embedded plan content.

#### Structured Body

- Keep schedule details as the event-owned structure section.
- Keep recurrence details and scheduling-specific notes together.
- Avoid mixing scheduling fields into the linked plan section.

#### Editing Model

- Non-edit mode should read like a detail screen.
- Edit mode should remain a controlled state, but avoid turning the whole screen into a form-first layout.

### Acceptance Checklist

- [ ] Major event actions live in the header overflow menu.
- [ ] Planned event content still leads with the linked activity plan.
- [ ] Event-owned schedule information remains separate from plan-owned content.
- [ ] The screen reads as a detail page first and an editor second.

## 3. Training Plan Detail

### Goal

Refactor `training-plan-detail` away from admin-style cards into the shared detail-screen layout.

### Current Problems

- too many management controls live inside body cards
- visibility is editable directly on the detail screen
- linked activity plans are mostly inert text blocks
- the header section mixes summary, privacy, scheduling, duplicate/edit, and social controls together

### Target Structure

1. screen header overflow menu
2. training plan identity card
3. linked primary content preview
4. analytical section
5. plan structure section
6. secondary management/danger zone

### Concrete Changes

#### Header

- Move duplicate, edit, scheduling, privacy-management, and delete actions into the screen header overflow menu.
- Remove direct visibility toggling from the detail body.
- Keep visibility changes in edit mode only.

#### Identity Card

- Simplify the summary header to icon + title + description + save.
- Remove the current split between summary card, snapshot card, and actions card as separate top-level concepts.
- Keep only the most essential plan context visible in the first card.

#### Linked Primary Content

- Promote the most important linked content higher.
- Recommended default: a preview of upcoming or representative linked activity plans.
- Replace inert linked-plan text rows with tappable preview cards or list items that open `activity-plan-detail`.

#### Analytical Content

- Keep weekly load summary as the main analytical section.
- Present it as the plan’s core chart/metric region, not buried inside a large structure card.

#### Structured Body

- Keep the plan structure section, but split it into clearer subsections:
  - linked activity plans
  - weekly load
  - sessions by microcycle/day
- Treat the structure as readable content, not a control surface.

#### Secondary Content

- Move the danger zone lower and visually isolate it.
- Keep admin-like controls out of the reading flow.

### Acceptance Checklist

- [ ] Training plan actions move into the header overflow menu.
- [ ] Visibility is no longer directly toggled in detail view.
- [ ] The identity card becomes simpler and calmer.
- [ ] Linked activity plans are tappable previews, not inert metadata blocks.
- [ ] Weekly load is presented as the main analytical section.

## 4. Goal Detail

### Goal

Expand `goal-detail` from a thin summary card into a full detail-page pattern.

### Current Problems

- only one main card
- no header action model
- no linked content
- no analytical content
- no structured body beyond metadata rows
- bottom action bar duplicates screen-level controls in the content area

### Target Structure

1. screen header overflow menu
2. goal identity card
3. linked milestone or plan preview
4. progress analytics
5. milestones/target structure
6. notes/history/secondary content

### Concrete Changes

#### Header

- Move edit and delete into a screen header overflow menu.
- Keep the main body focused on understanding the goal.

#### Identity Card

- Add a goal icon.
- Show title and objective summary directly.
- Add one lightweight save/follow action if the product supports it.
- Remove the current badge-heavy summary style.

#### Linked Primary Content

- If a milestone event exists, show it as a tappable linked preview.
- If the goal is tied to a training plan or related entity, show that as an early linked section too.

#### Analytical Content

- Add progress metrics or progress summary cards.
- If trend/progress charts exist or can be derived, place them after linked content.

#### Structured Body

- Add a clear milestone or target section.
- Show target date, metric goal, and goal logic as content blocks rather than only metadata rows.

#### Secondary Content

- Leave room for notes, history, or related actions later.

### Acceptance Checklist

- [ ] Edit/delete moves into the screen header overflow menu.
- [ ] Goal page has a real identity card.
- [ ] Linked milestone or related plan content is visible early.
- [ ] Progress analytics exist as their own section.
- [ ] Goal structure reads like content instead of a metadata sheet.

## Suggested Execution Strategy

### Phase 1: Establish Shared Patterns

Do this while working on `route-detail` and `event-detail`:

- standardize header overflow usage
- standardize identity card shape
- standardize save action placement
- standardize linked preview navigation

### Phase 2: Apply To Complex Screens

Use the same patterns to refactor:

- `training-plan-detail`
- `goal-detail`

### Phase 3: Cross-Screen Consistency Pass

After the main refactors:

- align save/like naming globally
- align section spacing and card radius
- align chart density and label treatment
- align linked preview behavior
- align danger-zone placement

## Per-Screen Review Template

Use this after each refactor.

1. Does the first screenful explain what the object is?
2. Are screen-level actions in the header instead of the body?
3. Is there exactly one lightweight personal action in the identity card?
4. Is the main linked entity visible early and tappable?
5. Do metrics and charts appear before long structure content?
6. Does the structure section read like content rather than admin UI?
7. Is social or secondary content kept below the main object?

## Recommended First Implementation Slice

If you want the highest leverage next step, start with `route-detail`.

Why:

- it is the biggest visual mismatch today
- it is simpler than `training-plan-detail`
- it can become the route-side reference implementation
- it shares the same route/elevation design language already used by `activity-plan-detail`
