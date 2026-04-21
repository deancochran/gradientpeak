# Detail Page Design Spec

## Purpose

Use this spec to keep detail screens consistent across the mobile app.

This pattern is designed for screens such as:

- `activity-plan-detail`
- `route-detail`
- `event-detail`
- `goal-detail`
- `training-plan-detail`

The goal is to make each detail screen feel like part of one system:

- same information order
- same action hierarchy
- same visual density
- same navigation model
- same relationship between content, analytics, and social features

## Core Layout

Every detail screen should follow this order unless there is a strong reason not to:

1. Screen header actions
2. Identity card
3. Linked primary content
4. Analytical content
5. Structured body content
6. Engagement and secondary content

This is the default contract.

## Section 1: Screen Header Actions

Purpose:

- hold global actions for the entity
- keep management actions out of the main content body

Use the screen header for:

- overflow menu
- destructive actions
- management actions
- edit/navigation actions that affect the whole object

Examples:

- activity plan: start, schedule, duplicate, edit, delete
- route: edit, delete, share, save for later
- event: change schedule, delete, open linked plan
- goal: edit, archive, delete
- training plan: edit, duplicate, archive, delete

Rules:

- prefer one overflow menu in the top-right corner
- do not stack many buttons in the page body if they are screen-level actions
- actions in the header should be operational, not explanatory
- the page body should still work if the header menu is closed

## Section 2: Identity Card

Purpose:

- establish what the entity is
- show its most important human-readable summary
- provide one lightweight personal action

Recommended structure:

- left: entity icon
- center: title and description
- right: one lightweight personal action such as `Save`

Optional supporting content:

- state callout such as scheduled state or due state
- short notes block if it adds immediate context

Avoid:

- tag clouds
- badge rows under the title by default
- labels like `Overview` or `Summary`
- multiple competing action buttons inside this card
- redundant visibility labels when visibility is editable elsewhere

Rules:

- description should appear as content, not as a labeled field
- the card should feel editorial and readable, not administrative
- the top of the card should answer: what is this?
- the top-right slot inside the card should be reserved for a single personal action only

## Section 3: Linked Primary Content

Purpose:

- surface the most important related entity immediately after identity
- make the detail screen feel connected to the rest of the app

Examples:

- activity plan -> route preview
- event -> linked activity plan preview
- goal -> linked training plan preview
- training plan -> next session preview or calendar preview

Rules:

- linked content should look tappable and should navigate to its own detail page
- linked content should appear early, above charts and long text content
- linked content should use the same visual language as its own native detail page
- do not flatten linked content into plain text if a real preview is available

## Section 4: Analytical Content

Purpose:

- show the most useful metrics and charts after identity and linked content
- keep the page quantitatively informative without becoming noisy

Recommended order:

1. compact metrics row or pill set
2. route or elevation chart if relevant
3. intensity or progress chart if relevant

Rules:

- metrics should usually be above the chart they describe
- charts should be visually quiet
- avoid decorative axis labels unless they support a real task
- remove arbitrary labels that do not help interpretation
- prefer cleaner geometry and spacing over more labels
- chart chrome should be minimal; surrounding layout should provide context

Examples:

- activity plan: route -> elevation -> intensity
- route: map -> elevation -> route stats
- goal: progress metrics -> trend chart -> milestone health
- training plan: weekly load -> plan progression -> completion trend

## Section 5: Structured Body Content

Purpose:

- explain the internal structure of the entity
- let users read the object as content, not raw data

Examples:

- activity plan: session flow
- route: segments, notes, waypoints
- event: timing, recurrence, constraints
- goal: milestones, target definitions, progress rules
- training plan: weeks, blocks, sessions

Rules:

- use soft hierarchy, not heavy chrome
- titles inside the structure can share a similar weight when the hierarchy is already clear from layout
- only show counts when they help decision-making
- repeated blocks should be expressed minimally
- show notes and descriptions inline near the thing they describe
- avoid separate metadata sections when the data can live naturally with the content block

## Section 6: Engagement And Secondary Content

Purpose:

- hold social and collaborative features after the object itself is understood

Examples:

- comments
- activity feed
- collaborators
- reactions
- secondary notes

Rules:

- engagement content should be below the main object content
- social features should not displace identity or structure
- the object should remain understandable without scrolling into social sections

## Action Hierarchy

Every detail page should split actions into tiers.

### Tier 1: Screen-level actions

Use the screen header overflow menu.

Examples:

- edit
- delete
- duplicate
- schedule
- archive

### Tier 2: Personal affinity action

Use one lightweight control in the top-right of the identity card.

Examples:

- `Save`
- `Saved`
- like/save unified into one concept

### Tier 3: Local section navigation

Use directly tappable previews inside the relevant section.

Examples:

- tap route preview to open route detail
- tap linked plan preview to open plan detail

## Navigation Rules

Detail screens should be strongly connected.

Rules:

- if content looks tappable, it should navigate
- linked entity previews should open the linked detail screen
- do not strand the user on intermediate surfaces with no onward navigation
- embedded content should behave like a preview of a first-class page, not static decoration

## Visual Rules

Use these rules across detail pages.

### Density

- prefer medium density
- avoid giant empty gaps between related elements
- use tight internal spacing for structured content
- leave larger spacing only between major sections

### Labels

- remove labels like `Overview` when the content is obvious without them
- avoid duplicate labeling across icon, title, tags, and subtitle
- keep chart labels only when they improve interpretation

### Tags And Badges

- do not default to badge rows under titles
- use status callouts only when a state materially changes what the user can do
- if visibility is editable in edit mode, do not also repeat it as a decorative tag

### Charts

- prefer quiet charts
- minimize axis clutter
- minimize arbitrary reference labels
- put key metrics above charts
- keep chart spacing intentional and consistent

## Entity-Specific Mapping

Use this mapping when applying the pattern to other screens.

### Activity Plan Detail

1. header overflow actions
2. identity card with icon, title, description, save
3. route preview
4. elevation profile
5. intensity profile and estimates
6. session flow
7. comments

### Route Detail

1. header overflow actions
2. identity card with icon, title, description, save
3. route map preview
4. elevation profile
5. route statistics and route notes
6. linked plans or usage history

### Event Detail

1. header overflow actions focused on scheduling
2. identity card for the event itself
3. linked activity plan preview
4. route/elevation/intensity when linked plan supports them
5. schedule details and recurrence details
6. comments or secondary notes

Note:

- event detail owns schedule information
- embedded plan content is supporting linked content, not the owner of the screen

### Goal Detail

1. header overflow actions
2. identity card with icon, title, description, save
3. linked plan or milestone preview
4. progress metrics and charts
5. milestones and target logic
6. comments, history, and related actions

### Training Plan Detail

1. header overflow actions
2. identity card with icon, title, description, save
3. plan calendar or current phase preview
4. weekly load and progression charts
5. week/block/session structure
6. collaboration or comments

## Build Checklist

Apply this checklist to any new or refactored detail page.

### Identity

- [ ] The page has one clear identity card near the top.
- [ ] The identity card uses icon + title + description as the primary structure.
- [ ] The description is shown directly, without an unnecessary `Overview` label.
- [ ] The identity card avoids noisy badge rows by default.
- [ ] The top-right slot inside the identity card is reserved for one lightweight personal action.

### Actions

- [ ] Global actions live in the screen header overflow menu.
- [ ] The main content body does not contain a row of redundant management buttons.
- [ ] Destructive actions are not mixed into the primary reading flow.
- [ ] Visibility or privacy controls only appear in the correct editing context.

### Linked Content

- [ ] The most important linked entity is shown immediately after identity.
- [ ] The linked entity preview is tappable.
- [ ] Tapping the linked entity opens its detail page.
- [ ] The linked entity preview visually matches the rest of the app.

### Analytics

- [ ] Metrics are shown before the chart they describe.
- [ ] Charts are visually quiet and do not carry unnecessary labels.
- [ ] Axis labels are only shown when they materially help interpretation.
- [ ] Chart spacing is intentional and not overly loose.

### Structured Body

- [ ] The body content explains the object structure in a readable way.
- [ ] Repeated blocks are described minimally.
- [ ] Notes and descriptions appear near the relevant content block.
- [ ] Counts are only shown when useful.

### Navigation

- [ ] Every tappable-looking preview actually navigates somewhere.
- [ ] The user can move from this detail page to adjacent related detail pages.
- [ ] The page does not trap the user in a dead-end flow.

### Social And Secondary Content

- [ ] Social features appear after the object content, not before it.
- [ ] The screen remains understandable without reading the social section.
- [ ] Secondary content does not compete with identity or structure.

### Consistency

- [ ] The page uses the same section ordering as other detail pages unless there is a strong reason not to.
- [ ] The action hierarchy matches the shared detail-page pattern.
- [ ] The page feels like part of the same family as activity plan, route, event, goal, and training plan detail screens.

## Review Questions

Use these when auditing a page before shipping.

1. Can the user understand what this object is within the first screenful?
2. Is the most important linked entity visible early enough?
3. Are the main actions in the right place, or are they cluttering the body?
4. Are charts quiet and readable, or too decorated?
5. Does the page explain the object structure naturally?
6. Can the user navigate outward to related pages without friction?
7. Are social features present but subordinate?

## Recommended Implementation Strategy

When applying this to another page, do the work in this order:

1. Move screen-level actions into the screen header.
2. Simplify the identity card to icon, title, description, and one personal action.
3. Promote the main linked entity preview higher in the page.
4. Reorder metrics and charts to follow the linked entity.
5. Rewrite the structured body so it reads like content.
6. Push social and secondary content below the main object sections.

This usually produces the cleanest result with the fewest regressions.
