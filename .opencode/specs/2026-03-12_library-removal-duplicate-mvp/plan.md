# Implementation Plan: Library Removal + Duplicate-First MVP

## 1. Strategy

Treat this as a product-surface simplification pass with light backend cleanup.

Implementation should proceed in this order:

1. identify and remove app dependencies on `library`,
2. make duplicate flows first-class for shared plans,
3. clean up backend contracts and invalidations,
4. remove persistence and router dead weight once the app no longer depends on it.

The goal is to reduce concepts, not add a new system.

## 2. Current Issues To Address

### A. Library adds complexity without ownership

`library_items` stores saved pointers, but those pointers do not make content editable or schedule-ready.

### B. Save flows are weak or invisible in the app

The mobile app surfaces `Save` actions for shared plans, but there is no strong user-facing saved-library workflow that justifies the concept.

### C. Duplicate support is inconsistent

`activity_plans` already have backend duplication support, but the mobile duplicate button is not wired to that mutation cleanly. `training_plans` need an explicit duplication path separate from `apply`.

### D. Copy still reflects an outdated library mental model

Scheduling and detail-screen copy still refers to library usage when the desired outcome is ownership or immediate use.

## 3. Target Product Behavior

### Activity plan behavior

- public/shared activity plan detail shows `Duplicate`, not `Save`,
- duplication creates a private owned copy,
- app routes to the duplicate or refreshes into the owned context,
- schedule/edit actions operate on the owned copy.

### Training plan behavior

- shared training plan detail shows `Duplicate` and `Apply Template`,
- duplicate creates an owned private editable plan,
- apply keeps current scheduling semantics,
- shared training plans remain read-only unless duplicated.

### Copy cleanup behavior

- remove `library` wording from plan detail, scheduling prompts, and related affordances,
- replace with `your plans`, `duplicate first`, or `apply template`, depending on intent.

## 4. Backend Changes

### A. Deprecate library router usage

- remove mobile calls to `trpc.library.add`,
- remove now-unused invalidations and cache tags,
- remove or deprecate `packages/trpc/src/routers/library.ts` once nothing depends on it.

### B. Activity plan duplication

- keep `activityPlans.duplicate` as the canonical backend mutation,
- verify it accepts accessible public/shared plans,
- ensure the returned payload is sufficient for mobile navigation.

### C. Training plan duplication

Add a new duplication mutation in the training-plans router with these rules:

- input: source plan id and optional new name,
- source must be accessible to the user through ownership, system-template visibility, or public visibility,
- output is a new owned private training plan,
- structure is copied as content, not linked by reference,
- plan-level ownership/visibility fields are reset for the duplicate,
- duplicate does not create scheduled events automatically.

### D. Persistence cleanup

Preferred order:

1. remove runtime use of `library_items`,
2. remove library router exports and tests,
3. drop the `library_items` table in a migration if no dependency remains.

If staged cleanup is safer, mark the table/router deprecated first and remove them in a short follow-up.

## 5. Mobile App Changes

### A. Activity plan detail

- replace `Save` button and mutation with a real duplicate flow,
- on success, route to the new owned plan detail or edit flow,
- keep social actions intact.

### B. Training plan detail

- replace `Save` button with `Duplicate` for non-owned shared plans,
- keep `Apply Template` as a separate primary action,
- add owned-copy routing after duplication.

### C. Scheduling copy and guards

- change copy like `Save or duplicate first` to duplication-first wording,
- remove remaining references to library as a user concept where the underlying behavior is ownership.

### D. Minimal surface rule

Do not redesign unrelated plan, discover, or route screens. Only remove obsolete library affordances and add duplication actions where users actually need them.

## 6. Route Handling Decision

This spec should explicitly audit routes during implementation, but route duplication should only be implemented if public route visibility/discovery already exists or can be added without expanding scope materially.

Default decision for this spec:

- do not add a new route-sharing model just to keep parity with plan cleanup,
- document route duplication as deferred if public routes are not already first-class.

## 7. Validation

Required checks after backend/mobile changes:

```bash
pnpm --filter @repo/trpc check-types
pnpm --filter mobile check-types
```

Required focused test areas:

- activity-plan duplicate mutation and access rules,
- training-plan duplicate mutation and access rules,
- mobile activity-plan detail duplicate action,
- mobile training-plan detail duplicate action,
- removal of library-specific UI flows,
- apply-template flow still working after duplicate additions,
- copy/guard updates around scheduling from shared content.

If the table is dropped:

```bash
supabase db diff -f <filename>
supabase migration up
pnpm run update-types
```

## 8. Rollout Order

1. Remove mobile `Save to library` usage for shared plans.
2. Wire `activityPlans.duplicate` into mobile.
3. Add `trainingPlans.duplicate` and wire it into mobile.
4. Clean up invalidations, copy, tests, and router exports.
5. Drop or deprecate `library_items` and the `library` router.

## 9. Expected Outcomes

- Fewer concepts in the product and codebase.
- Clearer ownership transitions for shared content.
- Less dead UI around saved pointers.
- A cleaner MVP aligned to discover -> inspect -> duplicate/use.
