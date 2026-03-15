# Design: Scheduling UX + Refresh Simplification

## 1. Vision

GradientPeak should make scheduling feel immediate, trustworthy, and low-friction. A user should be able to move from intent to a visible scheduled event without learning internal product concepts, bouncing across multiple screens, or manually refreshing to confirm success.

This spec focuses on the end-to-end scheduling experience across:

- event creation,
- activity-plan scheduling,
- training-plan scheduling,
- calendar and plan surfaces that reflect those changes.

This spec also covers correctness and clarity issues discovered during implementation review:

- simplifying the training-plan date anchoring interaction,
- ensuring scheduled training sessions materialize onto the correct calendar days,
- ensuring plan projection visuals reflect all goals rather than only the first goal.

## 2. Product Objectives

- Remove stale-state moments that force manual refresh after scheduling mutations.
- Reduce the number of screens, decisions, and taps needed to create a scheduled event.
- Reframe actions around user outcomes instead of internal system concepts.
- Keep calendar, plan, and event detail surfaces consistent after scheduling changes.
- Preserve necessary distinctions in the data model without exposing that complexity unnecessarily in the UI.

## 3. Current Product Problems

### A. Mutation success does not guarantee visible UI success

Users can successfully schedule or modify an event, then land on a screen that still shows old state until they pull to refresh, switch tabs, or re-open the screen.

### B. Scheduling paths are fragmented

Users can start from calendar, discover, activity-plan detail, training-plan detail, or plan surfaces, but those entry points do not feel like one coherent scheduling system.

### C. The app asks users to think in product internals

Users must currently understand distinctions such as:

- duplicate,
- apply template,
- owned vs shared,
- plan structure vs scheduled instance.

Some of these distinctions are valid internally, but they should not block or confuse a user whose real goal is simply to get something onto their calendar.

### D. Some CTA language and behaviors are misleading

Examples include:

- schedule actions that only produce an alert,
- template language for actions that the user experiences as scheduling,
- success actions that do not route into a working next step,
- labels such as `Edit Structure` when the destination may not match the label.

## 4. Core Product Decisions

### A. Scheduling is the primary job to be done

When a user chooses an action from calendar, discover, or plan detail, the app should optimize for one of these clear intents:

1. schedule one activity,
2. schedule a full training plan,
3. create an editable copy first.

### B. UI language should describe outcomes

Use outcome-first labels such as:

- `Schedule Activity`,
- `Schedule Plan`,
- `Schedule Sessions`,
- `Make Editable Copy`,
- `Edit Plan`.

Avoid requiring the user to decode backend semantics such as `apply template` unless that language is strictly necessary.

### C. Shared content should not create dead ends

If a shared activity plan requires duplication before scheduling, the UI should handle that inline as one continuous flow wherever possible.

The user experience should prefer:

- `Duplicate and Schedule`

over:

- tapping `Schedule`,
- seeing an alert,
- dismissing it,
- then separately duplicating,
- then finding the duplicate,
- then scheduling.

### D. Post-mutation freshness is part of product correctness

After scheduling, rescheduling, deleting, or applying a plan, the user should see updated state in the relevant surfaces without manual refresh.

This is not a polish issue; it is part of the core product contract.

## 5. Scope

### In scope

- audit and simplify event creation and scheduling flows,
- unify refresh behavior after scheduling mutations,
- simplify activity-plan scheduling from calendar and plan detail,
- simplify training-plan scheduling language and action hierarchy,
- simplify training-plan schedule anchoring so users choose one clear date mode at a time,
- repair broken or misleading CTA flows,
- correct training-plan materialization issues that collapse sessions onto incorrect dates,
- ensure plan projection chart annotations represent the full goal set,
- improve consistency across calendar, plan, scheduled activities, and event detail surfaces.

### Out of scope

- broad visual redesign unrelated to scheduling,
- unrelated discover or social feature changes,
- replacing core training-plan modeling beyond what is necessary to stabilize the scheduling UX contract,
- full backend domain redesign unless a targeted follow-up spec is needed.

## 6. UX Principles

### A. Keep users in context

If a user starts in calendar on a specific day, scheduling should stay anchored to that day and context rather than redirecting them into a broad browsing flow.

### B. Prefer one continuous flow over multi-screen choreography

Whenever possible, the app should complete prerequisite ownership or validation steps inside the same user flow rather than handing users off to separate screens.

### C. Make the primary action obvious

Each scheduling surface should expose one clear primary CTA that reflects the most likely user intent.

### D. Remove false affordances

Do not show actions that appear available but only produce warnings, dead ends, or contradictory disabled states.

### E. Reflect success immediately

After a write succeeds, the receiving UI should visibly confirm that the schedule changed, either through updated list/detail state, optimistic UI, or deterministic refetch.

## 7. Technical Direction

### A. Refresh contract

Scheduling mutations should use a single, explicit refresh contract for the queries they affect. The app should not rely on scattered manual refetch workarounds across screens.

### B. Mutation ordering

Mutation success handlers should not navigate away before invalidation and required refresh work complete.

### C. Shared scheduling primitives

The mobile app should move toward shared scheduling helpers/hooks so calendar, plan, and detail surfaces react to the same data changes predictably.

### D. CTA flow repair

Broken or incomplete routes such as create -> `Schedule Now` should be repaired so every primary CTA lands in a usable next step.

### E. Schedule materialization must match the user-facing structure

If the training-plan detail screen shows sessions spread across multiple weeks or offsets, the scheduled event payload must preserve that structure exactly enough for calendar and plan projections to remain trustworthy.

### F. Projection visuals must represent the whole goal story

If a user has multiple active goals, the plan chart should show all relevant goal markers rather than silently picking the first goal.

## 8. Success Criteria

- Users no longer need manual refresh in normal scheduling workflows.
- Calendar scheduling does not redirect users into unrelated browsing surfaces when a direct scheduling flow is possible.
- Shared activity plans can be scheduled through a continuous duplicate-first experience without alert dead ends.
- Training-plan scheduling copy emphasizes user outcomes rather than backend terminology.
- Training-plan scheduling uses one clear date anchor mode at a time and removes confusion around start date vs finish-by date.
- The main scheduling surfaces agree on updated state immediately after mutation success.
- Scheduled training sessions appear on the correct calendar days after plan scheduling.
- Plan projection chart surfaces all relevant goals, not just the first goal.
- The number of interactions required to get a usable scheduled event is materially reduced.
