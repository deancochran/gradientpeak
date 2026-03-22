# Implementation Plan: Scheduled Training Plan Management Flow

## 1. Strategy

Deliver the smallest safe product correction first: introduce explicit scheduled-plan management using derived event-group queries, keep the one-active-plan invariant, and avoid database changes.

## 2. Planned File Areas

### Backend

- `packages/trpc/src/routers/training-plans.base.ts`
- `packages/trpc/src/routers/__tests__/training-plans.*.test.ts`

### Mobile

- `apps/mobile/app/(internal)/(tabs)/plan.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plans-list.tsx`
- `apps/mobile/app/(internal)/(standard)/scheduled-plans-list.tsx`
- `apps/mobile/app/(internal)/(standard)/scheduled-plan-detail.tsx`
- `apps/mobile/app/(internal)/(standard)/event-detail.tsx`
- route constants under `apps/mobile/lib/constants/routes*`

## 3. Backend Change Map

### Phase 1: Derived scheduled-plan read model

Add helper utilities in `training-plans.base.ts` to:

- load current-user plan-backed events,
- group by `training_plan_id` and `schedule_batch_id`,
- derive summary fields,
- hydrate accessible source-plan metadata.

Add procedures:

1. `trainingPlans.listScheduled`
2. `trainingPlans.getScheduledByKey`

Recommended input contracts:

```ts
listScheduled: protectedProcedure
  .input(
    z
      .object({
        includePast: z.boolean().default(true),
      })
      .optional(),
  )

getScheduledByKey: protectedProcedure
  .input(
    z.object({
      training_plan_id: z.string().uuid(),
      schedule_batch_id: z.string().uuid().nullable().optional(),
    }),
  )
```

### Phase 2: Bulk operations

Add procedures:

1. `trainingPlans.deleteScheduledEvents`
2. `trainingPlans.detachScheduledEvents`

Recommended contracts:

```ts
deleteScheduledEvents: protectedProcedure
  .input(
    z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("future"),
        training_plan_id: z.string().uuid(),
        schedule_batch_id: z.string().uuid().nullable().optional(),
      }),
      z.object({
        mode: z.literal("selected"),
        training_plan_id: z.string().uuid(),
        schedule_batch_id: z.string().uuid().nullable().optional(),
        event_ids: z.array(z.string().uuid()).min(1),
      }),
    ]),
  )

detachScheduledEvents: protectedProcedure
  .input(
    z.object({
      training_plan_id: z.string().uuid(),
      schedule_batch_id: z.string().uuid().nullable().optional(),
      event_ids: z.array(z.string().uuid()).min(1),
    }),
  )
```

Implementation rules:

- always filter by `events.profile_id = ctx.session.user.id`,
- always constrain the mutation by the grouped scheduled-plan key,
- reject mutations when any selected event falls outside the grouped key,
- return `affected_count`, `affected_event_ids`, and cache-refresh hints.

### Phase 3: Active-plan lifecycle surface

No new router contract is required if `trainingPlans.updateActivePlanStatus` is reused. The client should call it from scheduled-plan detail for:

- `completed`
- `abandoned`

## 4. Mobile Change Map

### Phase 1: Route and IA split

- add route constants for scheduled-plan list/detail,
- update Plan tab buttons:
  - `Manage Scheduled Plan`
  - `Edit My Templates`
- route the current-plan card into scheduled-plan detail when an active scheduled plan exists.

### Phase 2: Scheduled-plan list

Build `scheduled-plans-list.tsx` using `trainingPlans.listScheduled`.

Each row should show:

- plan name,
- source badge,
- next session date,
- upcoming count,
- status.

### Phase 3: Scheduled-plan detail

Build `scheduled-plan-detail.tsx` using `trainingPlans.getScheduledByKey`.

Required features:

- source summary card,
- grouped event list,
- multi-select mode,
- `Remove Future Sessions`,
- `Remove Selected`,
- `Detach Selected`,
- `Open Source Template`,
- `Make Editable Copy` for non-owned sources,
- `Complete Plan` / `Abandon Plan` when the scheduled plan is active.

### Phase 4: Apply-flow handoff

Update `training-plan-detail.tsx` so apply success routes to scheduled-plan detail using:

- `training_plan_id = result.training_plan_id`
- `schedule_batch_id = result.schedule_batch_id`

Do not route to the source template detail as if it were the applied instance.

### Phase 5: Copy cleanup

- rename the owned-only list experience to clarify template ownership,
- update empty states and helper text to reflect the new split,
- avoid promising editability for scheduled public plans.

## 5. Exact Router-Level Notes

### `trainingPlans.listScheduled`

Derivation rules:

- `status = "scheduled"` when no past sessions exist and future sessions remain,
- `status = "in_progress"` when past sessions exist and future sessions remain,
- omit fully ended groups from default list unless `includePast` is true.

Source-kind rules:

- `owned` when `training_plans.profile_id = current user`,
- `system` when `is_system_template = true`,
- `public` when `template_visibility = "public"` and not owned.

### `trainingPlans.getScheduledByKey`

Detail payload should include:

- `summary`
- `source_training_plan`
- `events`
- `is_active`
- `can_make_editable_copy`
- `can_update_lifecycle`

### `trainingPlans.deleteScheduledEvents`

Deletion should use direct `events` deletion rather than delegating to the generic `events.delete` series scope, because the grouping key is scheduled-plan lineage, not recurrence.

### `trainingPlans.detachScheduledEvents`

This mutation is intentionally specialized because generic `events.update` currently validates `training_plan_id` ownership and is optimized for single-event editing rather than grouped lineage removal.

## 6. Validation

Focused validation should include:

```bash
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/trpc test -- training-plans
pnpm --filter mobile check-types
pnpm --filter mobile test -- --runInBand scheduled-plan
```

Manual product checks:

- apply a public plan and confirm the success CTA opens scheduled-plan detail,
- confirm `Edit My Templates` still shows owned plans only,
- confirm `Manage Scheduled Plan` shows the applied public plan,
- remove all future sessions from the scheduled plan,
- remove selected sessions only,
- detach selected sessions and confirm they remain on calendar but no longer appear in the scheduled plan group,
- duplicate the public source from scheduled-plan detail and confirm the copy opens in editable template detail.

## 7. Risk Controls

- Keep the one-active-plan rule for MVP to avoid ambiguity in coarse lifecycle mutations.
- Keep bulk operations scoped by both `training_plan_id` and `schedule_batch_id` when present.
- Preserve legacy fallback for older rows with null `schedule_batch_id`.
- Do not repurpose recurrence `series_id` for training-plan grouping.

## 8. Follow-Up Boundary

If implementation reveals repeated grouping complexity or client-side workarounds, stop and write the follow-up persistence spec for first-class applied-plan instances instead of continuing to expand the derived-event approach.
