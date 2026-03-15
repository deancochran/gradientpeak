# Tasks: Library Removal + Duplicate-First MVP

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused tests pass, and the success check in the task text is satisfied.
- [ ] Each subagent must leave the task unchecked if blocked and add a short blocker note inline.

## Phase 1: Audit + Contract Decisions

- [x] Task A - Library dependency audit. Success: all app, router, and persistence usages of `library`/`library_items` are enumerated and the removal path is confirmed.
- [x] Task B - Route scope decision. Success: implementation explicitly records whether public-route duplication is in scope now or deferred because routes are not yet a public-template surface. Deferred: routes remain owner-only and do not yet expose public visibility/discovery.

## Phase 2: Backend Duplicate Support

- [x] Task C - Activity-plan duplicate contract verification. Success: `activityPlans.duplicate` supports accessible public/shared source plans, returns navigation-ready owned records, and focused tests pass.
- [x] Task D - Training-plan duplicate mutation. Success: `packages/trpc/src/routers/training-plans.base.ts` exposes a duplicate mutation for accessible shared plans that creates owned private editable copies without scheduling events.
- [x] Task E - Library router removal. Success: no required runtime path depends on `packages/trpc/src/routers/library.ts`, and the router file, exports, invalidations, and tests are removed.

## Phase 3: Mobile Cleanup

- [x] Task F - Activity-plan detail duplicate UX. Success: `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx` removes `Save` library UX, performs real duplication, and routes the user into the owned flow.
- [x] Task G - Training-plan detail duplicate UX. Success: `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx` replaces `Save` with `Duplicate` for non-owned shared plans while preserving `Apply Template`.
- [x] Task H - Library wording cleanup. Success: obsolete library wording is removed from scheduling/detail surfaces and replaced with ownership/duplicate/apply language.

## Phase 4: Persistence Cleanup

- [x] Task I - `library_items` persistence removal. Success: once no active runtime path depends on saved pointers, the table is dropped, generated types are updated, and no active code path still references library persistence.

## Validation Gate

- [x] Validation 1 - tRPC validation. Success: `pnpm --filter @repo/trpc check-types` and focused duplicate-flow tests pass.
- [x] Validation 2 - Mobile validation. Success: `pnpm --filter mobile check-types` and focused detail-screen/scheduling tests pass.
- [x] Validation 3 - Schema validation. Success: if `library_items` is removed, migration apply and generated type updates complete successfully.
