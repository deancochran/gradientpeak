# Tasks: Library Removal + Duplicate-First MVP

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused tests pass, and the success check in the task text is satisfied.
- [ ] Each subagent must leave the task unchecked if blocked and add a short blocker note inline.

## Phase 1: Audit + Contract Decisions

- [ ] Task A - Library dependency audit. Success: all app, router, and persistence usages of `library`/`library_items` are enumerated and the removal path is confirmed.
- [ ] Task B - Route scope decision. Success: implementation explicitly records whether public-route duplication is in scope now or deferred because routes are not yet a public-template surface.

## Phase 2: Backend Duplicate Support

- [ ] Task C - Activity-plan duplicate contract verification. Success: `activityPlans.duplicate` supports accessible public/shared source plans, returns navigation-ready owned records, and focused tests pass.
- [ ] Task D - Training-plan duplicate mutation. Success: `packages/trpc/src/routers/training-plans.base.ts` exposes a duplicate mutation for accessible shared plans that creates owned private editable copies without scheduling events.
- [ ] Task E - Library router deprecation. Success: no required runtime path depends on `packages/trpc/src/routers/library.ts`, and router exports/tests are removed or clearly deprecated.

## Phase 3: Mobile Cleanup

- [ ] Task F - Activity-plan detail duplicate UX. Success: `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx` removes `Save` library UX, performs real duplication, and routes the user into the owned flow.
- [ ] Task G - Training-plan detail duplicate UX. Success: `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx` replaces `Save` with `Duplicate` for non-owned shared plans while preserving `Apply Template`.
- [ ] Task H - Library wording cleanup. Success: obsolete library wording is removed from scheduling/detail surfaces and replaced with ownership/duplicate/apply language.

## Phase 4: Persistence Cleanup

- [ ] Task I - `library_items` persistence cleanup. Success: once no active runtime path depends on saved pointers, the table is dropped or explicitly marked deprecated with a short follow-up plan.

## Validation Gate

- [ ] Validation 1 - tRPC validation. Success: `pnpm --filter @repo/trpc check-types` and focused duplicate-flow tests pass.
- [ ] Validation 2 - Mobile validation. Success: `pnpm --filter mobile check-types` and focused detail-screen/scheduling tests pass.
- [ ] Validation 3 - Schema validation. Success: if `library_items` is removed, migration apply and generated type updates complete successfully.
