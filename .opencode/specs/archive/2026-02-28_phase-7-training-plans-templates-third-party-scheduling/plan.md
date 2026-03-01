# Technical Implementation Plan - Phase 7 MVP (Lean Schema)

Date: 2026-03-01
Status: Ready for implementation
Owner: Mobile + Backend + Core Logic + QA
Inputs: `design.md`

## 1) Implementation Strategy

This plan keeps schema and code churn low while preserving current sync behavior:

- Keep existing `training_plans`, `activity_plans`, `events`, `synced_events`, and iCal identity model.
- Add only one new table in Phase 7 MVP: `library_items`.
- Add only additive columns needed for MVP template visibility, import dedupe, and schedule batch delete.
- Reuse existing routers/screens and avoid mixed polymorphic listing queries.

### Zero-ambiguity guardrails

- `provider_sync_records` is out of scope for Phase 7 MVP.
- `template_source`, `template_source_id`, and `events.schedule_source_id` are out of scope for Phase 7 MVP.
- `synced_events` remains in use for Wahoo sync paths in this phase.
- Existing iCal identity columns on `events` remain in use in this phase.
- If any legacy spec text conflicts with this plan, this plan is authoritative for implementation.

Performance-first rule:

- Prefer two simple indexed queries over one complex polymorphic query.

Future-proof rule:

- Keep stable list contracts now so a future discover index can be introduced without mobile API breakage.

## 2) Technical Change Map (With Filepaths)

### A) Database (`packages/supabase/schemas/init.sql`)

1. Add template visibility columns to existing content tables.
2. Add import dedupe identity columns to `activity_plans`.
3. Add `schedule_batch_id` to `events` for apply/remove lineage.
4. Add `library_items` table.
5. Keep existing iCal/Wahoo sync identity tables and columns as-is in MVP.

MVP SQL shape:

```sql
-- training_plans (visibility only)
alter table public.training_plans
  add column if not exists template_visibility text not null default 'private';

alter table public.training_plans
  add constraint training_plans_template_visibility_check
  check (template_visibility in ('private', 'public'));

-- keep system-template semantics explicit
alter table public.training_plans
  add constraint training_plans_system_templates_public_check
  check (is_system_template = false or template_visibility = 'public');

create index if not exists idx_training_plans_visibility
  on public.training_plans(template_visibility);

-- activity_plans (visibility + import identity)
alter table public.activity_plans
  add column if not exists template_visibility text not null default 'private',
  add column if not exists import_provider text,
  add column if not exists import_external_id text;

alter table public.activity_plans
  add constraint activity_plans_template_visibility_check
  check (template_visibility in ('private', 'public'));

alter table public.activity_plans
  add constraint activity_plans_system_templates_public_check
  check (is_system_template = false or template_visibility = 'public');

alter table public.activity_plans
  add constraint activity_plans_import_provider_non_empty_check
  check (import_provider is null or btrim(import_provider) <> '');

alter table public.activity_plans
  add constraint activity_plans_import_external_id_non_empty_check
  check (import_external_id is null or btrim(import_external_id) <> '');

create index if not exists idx_activity_plans_visibility
  on public.activity_plans(template_visibility);

create unique index if not exists idx_activity_plans_import_identity
  on public.activity_plans(profile_id, import_provider, import_external_id)
  where import_provider is not null and import_external_id is not null;

-- events (batch lineage only)
alter table public.events
  add column if not exists schedule_batch_id uuid;

create index if not exists idx_events_schedule_batch
  on public.events(profile_id, schedule_batch_id)
  where schedule_batch_id is not null;

-- only new table in MVP
create table if not exists public.library_items (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('training_plan', 'activity_plan')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (profile_id, item_type, item_id)
);

create index if not exists idx_library_items_profile_type_created
  on public.library_items(profile_id, item_type, created_at desc);

create index if not exists idx_library_items_item_lookup
  on public.library_items(item_type, item_id);

-- NOTE: no provider_sync_records table in Phase 7 MVP.
-- NOTE: keep events imported identity and synced_events unchanged in this phase.
-- NOTE: do not add schedule_source_id/template_source/template_source_id in this phase.
```

### B) Core Contracts (`packages/core/schemas/*`)

Add MVP schema module and exports:

- `packages/core/schemas/template_library.ts` (new)
- `packages/core/schemas/index.ts` (export)

MVP schema snippet:

```ts
import { z } from "zod";

export const templateItemTypeSchema = z.enum([
  "training_plan",
  "activity_plan",
]);

export const templateApplyInputSchema = z.object({
  template_type: templateItemTypeSchema,
  template_id: z.string().uuid(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  goal_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const libraryItemCreateSchema = z.object({
  item_type: templateItemTypeSchema,
  item_id: z.string().uuid(),
});
```

### C) tRPC Backend (`packages/trpc/src/routers/*`)

Primary files:

- `packages/trpc/src/routers/training-plans.base.ts`
- `packages/trpc/src/routers/activity_plans.ts`
- `packages/trpc/src/routers/events.ts`
- `packages/trpc/src/routers/integrations.ts`
- `packages/trpc/src/routers/index.ts`
- `packages/trpc/src/routers/library.ts` (new)

#### 1) Template CRUD on existing entities

- Extend training plan list/get/template endpoints to include visibility filters.
- Extend activity plan list/get for visibility/public filters.
- Return normalized identity fields in responses:
  - `content_type`
  - `content_id`
  - `owner_profile_id`
  - `visibility`

#### 2) Template apply flow

- Add apply mutation on training plans:
  - read template record,
  - clone to user-owned plan,
  - compute schedule from offsets in `structure`,
  - insert `events` with generated `schedule_batch_id`.

MVP apply snippet:

```ts
const batchId = crypto.randomUUID();

await ctx.supabase.from("events").insert(
  projectedSessions.map((session) => ({
    profile_id: ctx.session.user.id,
    event_type: "planned",
    title: session.title,
    starts_at: session.startsAt,
    ends_at: session.endsAt,
    activity_plan_id: session.activityPlanId,
    training_plan_id: appliedPlanId,
    schedule_batch_id: batchId,
  })),
);
```

#### 3) Library router (new)

- `add`, `remove`, `list` using `library_items`.
- Keep list endpoints split by item type to keep query plans simple:
  - `library.listTrainingPlans`
  - `library.listActivityPlans`
- Keep endpoint input contract discover-compatible:
  - `cursor`, `limit`, `visibility?`, `owner_scope?`

```ts
add: protectedProcedure
  .input(libraryItemCreateSchema)
  .mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("library_items")
      .upsert(
        {
          profile_id: ctx.session.user.id,
          item_type: input.item_type,
          item_id: input.item_id,
        },
        { onConflict: "profile_id,item_type,item_id" },
      )
      .select("*")
      .single();
    if (error)
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    return data;
  });
```

#### 4) Import endpoints

- Reuse `fit-files.ts` parse primitives for FIT.
- Add ZWO parser endpoint under `activity_plans` or `integrations`.
- Keep iCal feed sync in `integrations.ts` and `IcalSyncService` as read-only events using existing `events` import identity columns.
- Keep Wahoo sync lifecycle on existing `synced_events` in this phase.
- Use `activity_plans.import_provider/import_external_id` for FIT/ZWO dedupe identity.

Migration safety rule:

- Do not cut over `synced_events` or introduce `provider_sync_records` in this phase.
- Do not introduce dual-write/backfill to a new sync registry in this phase.

### D) Mobile (`apps/mobile/app/*`)

Primary files:

- `apps/mobile/app/(internal)/(standard)/plan-library.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan.tsx`
- `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`
- `apps/mobile/app/(internal)/(standard)/integrations.tsx`

MVP UI changes:

- Add save-to-library actions for training/activity templates.
- Add template browse filters (visibility + owner scope) in existing list screens.
- Add apply template CTA with start date/goal date picker.
- Add FIT/ZWO import entry in integrations/library flow.

## 3) Delivery Slices

1. Schema additions (`init.sql`) + core schemas.
2. Backfill defaults: set existing system templates to `template_visibility = 'public'`.
3. Backend template metadata + apply mutation + library router.
4. FIT/ZWO import endpoints and dedupe behavior on `activity_plans.import_*`.
5. Mobile template/library/apply UI and import entry points.
6. Regression stabilization against Phase 6.
7. Query-plan validation and index tuning for new list paths.
8. Contract stabilization for future discover index compatibility.

## 4) Validation and Quality Gates

- `pnpm --filter core check-types`
- `pnpm --filter core test`
- `pnpm --filter trpc check-types`
- `pnpm --filter trpc test`
- `pnpm --filter mobile check-types`
- `pnpm --filter mobile test`

## 5) MVP Test Plan

- Core: apply input validation and offset projection behavior.
- TRPC: template apply inserts expected schedule rows with `schedule_batch_id`.
- TRPC: library upsert uniqueness and list behavior.
- TRPC: FIT/ZWO dedupe by `activity_plans.import_provider/import_external_id`.
- TRPC: existing iCal and Wahoo sync paths unchanged.
- Mobile: save template, apply template, and import happy/error paths.
- Regression: existing `events` router tests continue passing.

## 6) Performance Verification (Required)

- Run `EXPLAIN (ANALYZE, BUFFERS)` for:
  - library listing by `profile_id` + `item_type`
  - scheduled apply/remove by `events.schedule_batch_id`
  - import dedupe lookup by `activity_plans(profile_id, import_provider, import_external_id)`
- Verify index-backed plans on hot paths at expected row counts.
- Keep listing endpoints simple (no required multi-join polymorphic query).

## 7) Future Discover Compatibility Verification (Required)

- Ensure list responses include normalized identity fields (`content_type`, `content_id`, `owner_profile_id`, `visibility`).
- Ensure per-type endpoints share one pagination/filter contract shape.
- Ensure no Phase 7 migration introduces coupling that blocks a future read-optimized discover index.

## 8) Ownership/Visibility Verification (Required)

- Verify DB rejects invalid `template_visibility` values.
- Verify system-template rows satisfy visibility consistency checks.
- Verify protected procedures enforce owner-only writes (`profile_id = ctx.session.user.id`).
- Verify non-owners can only read `public` or `is_system_template` templates through API filters.

## 9) Explicit Non-Requirements (Phase 7 MVP)

- No `provider_sync_records` table.
- No `synced_events` replacement/cutover.
- No dual-write/backfill migration from `synced_events` to any new sync registry.
- No `template_source` / `template_source_id` columns.
- No `events.schedule_source_id` column.
- No RLS policy rollout in this phase (service-role + protected tRPC model remains).

(End of file)
