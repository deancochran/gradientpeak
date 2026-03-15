# Design: Library Removal + Duplicate-First MVP

## 1. Vision

GradientPeak should stop treating saved-library state as a core product concept for shared planning content. For MVP, the simpler and more useful user model is:

1. users create their own private content,
2. users may publish selected content publicly,
3. other users can discover and like public content,
4. when a user wants to use public content as their own, they duplicate it into an owned private record.

This removes the extra mental step of bookmarking pointers into a separate library and replaces it with an action that creates clear ownership and editability.

## 2. Product Objectives

- Remove non-essential library UX that no longer matches the product direction.
- Preserve public/private visibility and like flows for shared content.
- Replace `Save` actions with `Duplicate` only where duplication creates immediate user value.
- Keep shared content read-only until duplicated or explicitly applied.
- Avoid expanding scope into new social or curation features that are not needed for MVP.

## 3. Core Product Decision

### A. Library is not an MVP primitive

The `library_items` pointer model stores saved references to shared templates, but it does not create ownership, editability, or scheduling readiness. In practice, it adds another concept without solving the user's main job.

For MVP, `library` should be treated as removable product debt rather than an area for further enhancement.

### B. Duplicate is the canonical ownership transition

The canonical transition from shared content to personal content is:

- discover shared item,
- inspect shared item,
- duplicate shared item,
- edit/schedule/use the duplicate as owned content.

This should be the primary action for public `activity_plans` and public `training_plans`.

### C. Apply remains distinct from duplicate

Training-plan `apply` is not the same as `duplicate`.

- `apply` means use the shared training plan to materialize scheduled events.
- `duplicate` means create an owned editable copy of the training plan.

Both may exist, but they solve different user intents and should be labeled clearly.

## 4. Scope

### In scope

- remove mobile UI that promotes saving plans to a library,
- deprecate tRPC library procedures and their app usage,
- remove library-specific copy that no longer reflects the product,
- add or repair duplication flows for shared `activity_plans`,
- add duplication support for shared `training_plans`,
- ensure duplicated records become owned, private records by default,
- update scheduling/edit flows to assume ownership comes from duplication rather than saving.

### Out of scope

- new bookmarking/favorites systems,
- richer collection or curation systems,
- web parity unless an existing web surface depends on the same contract,
- full public-routes social expansion if routes do not already support public/private discovery cleanly.

## 5. Entity Decisions

### A. Activity plans

Public activity plans should support duplication. The result should be a new user-owned private activity plan that preserves the source structure while recomputing derived metrics and ownership fields.

The detail screen for a public activity plan should prefer `Duplicate` over `Save`.

### B. Training plans

Public training plans should support both:

- `Duplicate` for ownership and editing,
- `Apply Template` for immediate scheduling.

These actions should remain distinct in UI copy and backend semantics.

### C. Routes

Routes do not currently fit the same public-template model cleanly. This spec should not force a route-sharing expansion just to match the plan/template cleanup.

If the current route model does not already support public visibility and public discovery, route duplication should be explicitly deferred. The duplicate-first pattern remains the intended future model once public routes exist, but this spec should prioritize removing bad library UX over inventing a new route-sharing surface.

## 6. UX Principles

### A. Remove dead-end actions

Users should not see `Save` actions that create an invisible pointer record with weak follow-up value.

### B. Prefer action language that matches outcomes

- use `Duplicate` when the user gets a personal editable copy,
- use `Apply Template` when the user schedules from a shared training plan,
- avoid `Save to library` language for template content.

### C. Keep public content read-only until owned

Shared content detail views may show social actions and usage actions, but editing should require ownership or duplication first.

### D. Replace only necessary UI

This cleanup should remove or relabel minimal surfaces instead of redesigning unrelated screens. The goal is less UI and clearer intent, not a new broad feature set.

## 7. Data and API Direction

### A. Remove the saved-pointer model

`library_items` and the `library` router should be treated as removable product and code debt. This spec should remove active app dependencies, remove the router and related tests once no caller remains, and remove the persistence table in the same implementation unless a concrete blocker prevents it.

The intended end state is no user-facing library concept, no runtime library flow, and no dead fallback library code kept around in the app.

### B. Duplicate outputs

Every duplicate mutation should return the newly created owned record id plus enough fields for the app to route immediately to the owned detail or edit flow.

### C. Ownership invariants

Duplicated records must:

- belong to the current user,
- default to `private`,
- preserve relevant content payloads,
- not mutate the original shared record,
- preserve source readability without creating hidden coupling.

## 8. Success Criteria

- No primary mobile flow encourages `save to library` for shared plans.
- No obsolete library UI, copy, router path, or saved-pointer runtime flow remains in the app.
- Public `activity_plans` can be duplicated into owned private records.
- Public `training_plans` can be duplicated into owned private records.
- Training-plan shared detail continues to support `apply` separately from `duplicate`.
- Scheduling copy no longer depends on the library concept.
- The app has fewer dead-end UI actions and clearer ownership transitions.
