# List Page Design Spec

## Purpose

Use this spec to keep list-based mobile screens consistent across the app.

This pattern is designed for screens such as:

- `calendar-day`
- `scheduled-activities-list`
- `activities-list`
- `routes-list`
- `training-plans-list`
- `activity-efforts-list`
- `profile-metrics-list`
- `messages`
- `notifications`

The goal is to make each list screen feel like part of one system:

- same page opening hierarchy
- same relationship between filters, counts, and rows
- same placement of create and management actions
- same row density and navigation behavior
- same empty/loading/error treatment

For owner-library screens named like `My Activities`, `My Training Plans`, or other `My ...` entity lists, default to browse/manage-first behavior.

- these screens are primarily index surfaces for things the user already owns
- do not treat them as creation hubs by default
- do not encourage `Create`, `Record`, or similar primary actions in the body unless the workflow truly depends on that screen being the creation entry point

This spec is the companion to `detail-page-spec.md`.

## Core Layout

Every list screen should follow this order unless there is a strong reason not to:

1. Screen header actions
2. Page intro
3. Primary controls
4. Result summary
5. List content
6. Persistent create action

This is the default contract.

## List Families

There are three default list families.

### Family 1: Agenda Lists

Use for time-ordered work the user is expected to act on soon.

Examples:

- `calendar-day`
- `scheduled-activities-list`

Characteristics:

- grouped by day or time bucket
- action-oriented
- stronger schedule context
- rows may show quick actions such as `Start Activity`

### Family 2: Library Or History Lists

Use for collections the user browses, reviews, or manages.

Examples:

- `activities-list`
- `routes-list`
- `training-plans-list`
- `activity-efforts-list`
- `profile-metrics-list`

Characteristics:

- flat or lightly grouped
- browse-oriented
- filtering and sorting are more important than quick actions
- destructive actions should usually move off the row and into detail/header flows

### Family 3: Communication Or Inbox Lists

Use for collections where unread state, recency, and response urgency matter more than analytical comparison.

Examples:

- `messages`
- `notifications`

Characteristics:

- ordered by recency
- unread state is central
- rows should scan quickly and feel calm
- page-level actions are usually lightweight, such as `Read All`
- destructive actions are rare; preference should be given to row tap and small inline response actions only when necessary

## Section 1: Screen Header Actions

Purpose:

- hold page-level actions
- keep the body focused on browsing and selection

Use the screen header for:

- overflow menu
- sort mode when it affects the whole page
- bulk or library-level actions
- alternate views when needed later
- create or schedule actions when they apply to the whole screen

Examples:

- activities list: sort, filter reset
- routes list: import or upload route
- training plans list: sort or scope actions if they are later needed
- scheduled activities: calendar jump or schedule entry point

Rules:

- prefer one top-right header overflow trigger that opens a dropdown menu
- the dropdown menu should be the default home for page-level actions on list screens
- use a direct header button only when there is exactly one lightweight global action and a menu would add friction
- do not stack many body buttons above the first row
- row-level management should not become the primary visual language of the page

Recommended dropdown actions by screen type:

- agenda lists: `Schedule`, `Open Calendar`, alternate date scope actions
- library/history lists: `Create`, `Upload`, `Sort`, `Reset Filters`
- communication lists: `Read All`, future inbox filters, lightweight settings entry points

For `My ...` screens:

- prefer browse/manage actions such as `Sort`, `Filter`, or `Reset Filters`
- do not default to `Create` or `Record` in the header dropdown
- only expose creation from the list screen when that screen is intentionally the creation hub

## Section 2: Page Intro

Purpose:

- establish what the list is for
- explain the collection in human terms before controls begin

Recommended structure:

- title should come from the screen title
- body intro should be a calm card or text block with:
  - one sentence explaining the collection
  - optional state callout when it changes behavior

Examples:

- agenda: `Today, April 19` with `3 events`
- routes library: `Saved routes you can reuse in plans and workouts.`
- profile metrics: `Recent body and performance measurements.`

Avoid:

- generic labels like `Overview`
- repeating the exact nav title as a body heading
- large empty hero regions
- badge clouds under the intro by default

Rules:

- the intro should answer: what lives here?
- if the count is important, keep it near the intro or result summary, not as decorative chrome

## Section 3: Primary Controls

Purpose:

- give the user the minimum controls needed to shape the list
- keep controls coherent instead of scattered above and below the content

Examples:

- filter chips
- segmented scope control
- search field
- date scope switcher
- sort control

Rules:

- controls should live in one block near the top
- use only controls that materially change the result set
- prefer one control family over several competing ones
- do not add placeholder controls for future possibilities
- if there are no useful controls, skip this section entirely
- for `My ...` screens, do not default to search/filter controls unless the collection is large enough and the browsing problem is real

## Section 4: Result Summary

Purpose:

- confirm what the user is looking at after filters are applied
- provide light orientation without becoming another toolbar

Recommended content:

- result count
- active scope summary such as `Bike activities` or `This week`
- optional short explanation when results are filtered heavily

Rules:

- keep this compact and quiet
- do not use a heavy card unless the page needs strong schedule context
- if the intro already communicates the same information clearly, combine them

## Section 5: List Content

Purpose:

- present a scannable collection of first-class objects
- make each row feel like a preview of its detail page

Recommended row order:

1. identity
2. supporting context
3. key metrics or state
4. forward navigation affordance only if needed

### Identity

Show the clearest human-readable identity first.

Examples:

- activity: name and date
- route: name and route type
- effort: effort type and recorded date
- profile metric: metric name and recorded date
- training plan: name and short description

### Supporting Context

Use one secondary line or compact cluster for the most useful context.

Examples:

- linked route or plan
- schedule timing
- device source
- visibility or ownership only when it changes user expectations

### Key Metrics Or State

Use a compact row or pill set for the facts users compare most often.

Examples:

- duration, distance, TSS
- ascent and distance
- value and unit
- completion or scheduled state
- unread count or unread dot
- relative timestamp

Rules:

- rows should be scannable before they are expressive
- avoid full admin cards as the default row style
- avoid stacking too many labeled metrics
- if a row contains a preview image or map, keep it compact and subordinate to identity
- row tap should open detail whenever a detail page exists

### Communication-Specific Row Rules

- unread state should be visible without overpowering the row
- timestamp should be short and low-emphasis
- preview copy should be one line by default
- inline response controls should appear only when they are essential to the notification type
- use badges for unread counts sparingly; do not turn every row into a badge cluster

## Section 6: Persistent Create Action

Purpose:

- give create-heavy lists a clear entry point without overpowering browsing

Recommended pattern:

- use the header overflow dropdown first when the page naturally supports it
- use a floating action button only when creation is frequent and always available

Rules:

- do not use both a top body button and a FAB for the same action
- do not use both a header dropdown action and a top body button for the same action
- empty states may include the same action as the primary recovery path
- for `My ...` screens, empty states should usually explain what will appear here rather than pushing the user into `Create` or `Record`
- creation should use consistent wording:
  - `Create` for authored objects
  - `Schedule` for placing something on the calendar
  - `Upload` for imports

### `My ...` Screen Rule

Use a stricter CRUD-style index model for owner-library screens.

Rules:

- `My ...` screens should primarily support reading and managing owned entities
- row tap should be the main action
- create flows should usually live on dedicated create screens, global actions, or other purpose-built entry points
- do not add motivational `Create one now`, `Record now`, or equivalent promotional copy inside the list body by default
- do not add search/filter chrome by default unless it clearly improves browsing of an already-large owned collection
- empty states should be calm and descriptive first

## Empty, Loading, And Error States

### Loading

- prefer skeletons for card-based lists
- use calm loading copy for grouped agenda surfaces
- loading should preserve the expected page frame when possible

### Empty State

- explain what is missing
- explain the next useful action
- offer one primary action only

Examples:

- `No routes yet` -> `Upload Route`
- `No training plans yet` -> `Your training plans will appear here.`
- `Nothing scheduled` -> `Open Calendar`

### Error State

- keep error states simple
- offer retry when feasible
- do not strand the user in a dead-end message

## Action Hierarchy

Every list page should split actions into tiers.

### Tier 1: Page-level actions

Use the top-right header overflow dropdown by default.

Examples:

- create
- sort
- reset filters
- open calendar

### Tier 2: Row navigation

Use row press to open the first-class detail page.

Examples:

- open activity detail
- open route detail
- open training plan detail

### Tier 3: Row quick actions

Use only for time-sensitive or high-frequency actions.

Examples:

- `Start Activity` from agenda rows
- `Accept` or `Reject` on actionable follow requests

Rules:

- destructive actions should usually not live directly on list rows
- do not put edit and delete on every row unless the list is explicitly a management console
- if an object has a full detail page, prefer doing delete/archive there via header overflow
- communication rows may include lightweight inline response actions when the action is intrinsic to the notification itself

## Header Dropdown Rules

List screens should mirror the detail screen action model closely.

Rules:

- prefer the same top-right overflow affordance used on detail screens
- the dropdown should contain page-level actions, not row-level actions
- the body should remain understandable and useful if the dropdown is never opened
- when the page has filters in the body, the dropdown should hold only global actions, not duplicate those controls unnecessarily
- avoid combining a large in-body primary button with a header dropdown entry for the same action

Examples:

- `training-plans-list`: `Create`, future template-scope actions
- `routes-list`: `Upload`, future sort/view actions
- `activity-efforts-list`: `Create`
- `scheduled-activities-list`: `Schedule`, `Open Calendar`
- `notifications`: `Read All`

## Navigation Rules

List pages should connect clearly to detail pages.

Rules:

- if a row looks tappable, it should navigate
- rows should preview the detail page, not replace it
- linked objects inside rows should not create confusing nested tap targets
- quick actions must not make row navigation unreliable

## Visual Rules

Use these rules across list pages.

### Density

- prefer medium density
- keep vertical rhythm tight between rows
- do not use giant hero cards above compact rows

### Labels

- remove labels that repeat what the row already says
- avoid uppercase metric labels unless comparison really needs them
- keep helper text short

### Counts And Status

- counts should be quiet orientation, not decoration
- status badges should be reserved for states that change decisions
- private/public labels should appear only when they materially affect sharing or editing expectations
- unread indicators should be compact and visually lighter than the row title

### Row Chrome

- prefer calm cards or clean list rows
- use rounded surfaces consistently
- chevrons are optional, not mandatory, when tappability is already obvious

## Entity-Specific Mapping

Use this mapping when applying the pattern to existing screens.

### Calendar Day

1. header title and optional day actions
2. day intro card
3. no extra controls by default
4. event count summary
5. grouped agenda rows
6. quick action only where time-sensitive

### Scheduled Activities List

1. header action for calendar entry
2. short intro for upcoming scheduled work
3. optional grouping controls later if needed
4. scheduled count summary
5. grouped activity rows
6. schedule action in header or FAB, not both

### Activities List

1. header sort/filter action
2. short intro for recorded activities
3. type filters and sort control in one control block
4. result count summary
5. activity history rows with compact metrics
6. no create action inside the list body unless recording from here is a deliberate product decision

### Routes List

1. header upload action
2. routes library intro
3. no extra controls initially
4. route count summary
5. compact route rows with optional small preview
6. upload action in header or FAB, not both

### Training Plans List

1. header create action
2. plans library intro
3. optional scope controls later
4. plan count summary
5. training plan rows that preview name, description, and useful state
6. create action should not also live as a large top body button

### Activity Efforts List

1. header create action
2. efforts history intro
3. optional type filters later
4. effort count summary
5. compact rows with effort value, duration, and recorded date
6. delete should move off the row when the detail flow is mature enough

### Profile Metrics List

1. header action if metric logging is supported here later
2. metrics history intro
3. optional metric-type filters later
4. result count or latest-record summary
5. compact rows with metric identity, value, and date
6. no decorative cards that add no navigational value

### Messages

1. optional header action for composing later if product supports it
2. inbox intro only if it adds orientation; otherwise the list can open directly
3. no heavy controls by default
4. optional unread or conversation count summary
5. compact conversation rows with name, preview, timestamp, unread state
6. row tap opens the conversation thread

### Notifications

1. header action such as `Read All`
2. lightweight notifications intro only if needed
3. no heavy controls by default
4. optional unread summary
5. compact notification rows with type, description, timestamp, unread state
6. inline response actions only for notifications that truly require them
