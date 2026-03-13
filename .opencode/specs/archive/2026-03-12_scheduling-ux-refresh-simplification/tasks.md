# Tasks: Scheduling UX + Refresh Simplification

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused tests pass, and the success check in the task text is satisfied.
- [ ] Each subagent must leave the task unchecked if blocked and add a short blocker note inline.

## Phase 1: Audit + Contract Alignment

- [x] Task A - Scheduling query/mutation audit. Success: all event creation, activity-plan scheduling, training-plan apply/schedule, and downstream read surfaces are mapped with their invalidation/refetch behavior.
- [x] Task B - Refresh contract decision. Success: the implementation explicitly defines the shared refresh strategy for scheduling-sensitive queries and mutations.

## Phase 2: Freshness + State Propagation

- [x] Task C - Mutation helper ordering fix. Success: scheduling-related mutation success paths do not navigate before required invalidation/refetch work is completed or queued deterministically.
- [x] Task D - Scheduling invalidation standardization. Success: event and training-plan scheduling mutations refresh all required plan/calendar/detail query families consistently.
- [x] Task E - Cross-screen stale-state cleanup. Success: calendar, scheduled activities, plan, and event/training-plan detail screens no longer rely on ad hoc refresh behavior for the normal happy path.

## Phase 3: Scheduling Flow Simplification

- [x] Task F - Calendar planned-activity flow simplification. Success: users can start from calendar and enter a direct planned-activity scheduling flow without being redirected to discover.
- [x] Task G - Activity-plan duplicate-and-schedule UX. Success: shared activity plans support a continuous duplicate-first scheduling flow without alert dead ends.
- [x] Task H - Activity-plan create success flow repair. Success: `Schedule Now` from activity-plan creation opens a working scheduling step for the newly created plan.

## Phase 4: Training-Plan UX Cleanup

- [x] Task I - Training-plan CTA language cleanup. Success: primary scheduling actions use outcome-based language and secondary actions clearly communicate editable-copy behavior.
- [x] Task J - Training-plan warning/state alignment. Success: concurrency warnings, success destinations, and downstream refresh behavior match actual backend behavior.

## Phase 5: Training-Plan Scheduling Clarity + Projection Correctness

- [x] Task K - Training-plan date-anchor simplification. Success: the scheduling UI exposes one clear date mode at a time (for example `Start on` vs `Finish by`), impossible mixed states are removed, and helper copy explains the chosen mode clearly.
- [x] Task K.1 - Training-plan schedule date picker reliability fix. Success: the schedule dialog date field opens a working native/modal picker so users can actually choose a different anchor date without losing the one-anchor-at-a-time flow.
- [x] Task L - Training-plan materialization date correction. Success: scheduled sessions preserve intended block/week/day offsets so calendar and projection views no longer collapse sessions onto the wrong dates.
- [x] Task M - Multi-goal projection chart support. Success: the Plan tab chart accepts and renders all relevant goal markers instead of only the first goal.

## Phase 6: Validation

- [x] Validation 1 - Mobile type validation. Success: `pnpm --filter mobile check-types` passes.
- [x] Validation 2 - tRPC type validation. Success: `pnpm --filter @repo/trpc check-types` passes.
- [x] Validation 3 - Scheduling workflow verification. Success: focused tests or manual verification cover calendar, activity-plan, and training-plan scheduling happy paths without manual refresh.
- [x] Validation 4 - Training-plan scheduling correctness verification. Success: focused tests or manual verification confirm scheduled sessions land on correct dates, appear on calendar after scheduling, and projection chart shows all goal markers.
