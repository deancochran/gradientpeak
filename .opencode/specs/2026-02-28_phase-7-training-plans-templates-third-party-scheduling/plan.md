# Technical Implementation Plan - Phase 7 MVP (Minimal Schema Change)

Date: 2026-02-28
Status: Ready for implementation
Owner: Mobile + Backend + Core Logic + QA
Inputs: `design.md`

## 1) Implementation Strategy

This plan intentionally minimizes schema churn:

- Keep existing `training_plans`, `activity_plans`, and `events` as core entities.
- Add one new table only: `library_items`.
- Add additive columns/indexes for template metadata, schedule batch tracking, and import identity.
- Reuse existing routers and screens where possible.

Performance-first rule:

- prefer two simple indexed queries over one complex polymorphic query.

Future-proof rule:

- define stable list contracts now so a future discover index can be introduced without mobile API breakage.

## 2) Technical Change Map (With Filepaths)

### A) Database (`packages/supabase/schemas/init.sql`)

1. Add template metadata columns to existing tables.
2. Add import identity columns to `activity_plans`.
3. Add schedule batch/source lineage columns to `events`.
4. Add new `library_items` table.

MVP SQL shape:

```sql
-- training_plans (template metadata)
alter table public.training_plans
  add column if not exists template_visibility text default 'private',
  add column if not exists template_sport text,
  add column if not exists template_ability text,
  add column if not exists template_weeks integer,
  add column if not exists template_source_plan_id uuid references public.training_plans(id) on delete set null,
  add column if not exists template_version integer not null default 1;

-- activity_plans (template + import identity)
alter table public.activity_plans
  add column if not exists template_visibility text default 'private',
  add column if not exists source_provider text,
  add column if not exists source_external_id text,
  add column if not exists source_hash text;

create unique index if not exists idx_activity_plans_import_identity
  on public.activity_plans(profile_id, source_provider, source_external_id)
  where source_provider is not null and source_external_id is not null;

alter table public.training_plans
  add constraint training_plans_template_visibility_check
  check (template_visibility in ('private', 'public'));

alter table public.activity_plans
  add constraint activity_plans_template_visibility_check
  check (template_visibility in ('private', 'public'));

create index if not exists idx_training_plans_visibility
  on public.training_plans(template_visibility);

create index if not exists idx_activity_plans_visibility
  on public.activity_plans(template_visibility);

-- events (schedule batch lineage)
alter table public.events
  add column if not exists schedule_batch_id uuid,
  add column if not exists schedule_source_type text,
  add column if not exists schedule_source_id uuid;

create index if not exists idx_events_schedule_batch
  on public.events(profile_id, schedule_batch_id)
  where schedule_batch_id is not null;

-- only new table in MVP
create table if not exists public.library_items (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('training_plan', 'activity_plan')),
  item_id uuid not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (profile_id, item_type, item_id)
);

create index if not exists idx_library_items_profile_type_created
  on public.library_items(profile_id, item_type, created_at desc);

create index if not exists idx_library_items_item_lookup
  on public.library_items(item_type, item_id);

-- ownership and visibility policy enforcement (mvp)
alter table public.training_plans enable row level security;
alter table public.activity_plans enable row level security;
alter table public.library_items enable row level security;

create policy training_plans_select_policy on public.training_plans
for select
using (
  profile_id = auth.uid()
  or is_system_template = true
  or template_visibility = 'public'
);

create policy training_plans_write_owner_policy on public.training_plans
for all
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy activity_plans_select_policy on public.activity_plans
for select
using (
  profile_id = auth.uid()
  or is_system_template = true
  or template_visibility = 'public'
);

create policy activity_plans_write_owner_policy on public.activity_plans
for all
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy library_items_owner_policy on public.library_items
for all
using (profile_id = auth.uid())
with check (profile_id = auth.uid());
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
  notes: z.string().max(1000).optional(),
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

- Extend training plan list/get/template endpoints to include metadata filters.
- Extend activity plan list/get for template visibility/public filters.
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
  - insert `events` with a generated `schedule_batch_id`.

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
    schedule_source_type: "training_plan",
    schedule_source_id: templateId,
  })),
);
```

#### 3) Library router (new)

- `add`, `remove`, `list` using `library_items`.
- Keep list endpoints split by item type to keep query plans simple:
  - `library.listTrainingPlans`
  - `library.listActivityPlans`
- Keep endpoint input contract discover-compatible:
  - `cursor`, `limit`, `visibility?`, `owner_scope?`, `sport?`

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
          notes: input.notes ?? null,
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

List query pattern (simple and fast):

```ts
const { data: saved } = await ctx.supabase
  .from("library_items")
  .select("item_id")
  .eq("profile_id", ctx.session.user.id)
  .eq("item_type", "training_plan")
  .order("created_at", { ascending: false })
  .limit(limit);

const ids = (saved ?? []).map((row) => row.item_id);
if (ids.length === 0) return [];

const { data: plans } = await ctx.supabase
  .from("training_plans")
  .select("*")
  .in("id", ids);
```

Normalized response mapping snippet:

```ts
return (plans ?? []).map((plan) => ({
  content_type: "training_plan" as const,
  content_id: plan.id,
  owner_profile_id: plan.profile_id,
  visibility: plan.template_visibility ?? "private",
  raw: plan,
}));
```

#### 4) Import endpoints

- Reuse `fit-files.ts` parse primitives for FIT.
- Add ZWO parser endpoint under `activity_plans` or `integrations`.
- Keep iCal feed sync in `integrations.ts` and `IcalSyncService` as read-only events.

### D) Mobile (`apps/mobile/app/*`)

Primary files:

- `apps/mobile/app/(internal)/(standard)/plan-library.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan.tsx`
- `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`
- `apps/mobile/app/(internal)/(standard)/integrations.tsx`

MVP UI changes:

- Add save-to-library actions for training/activity templates.
- Add template browse filters (sport/ability/weeks) with existing list screens.
- Add apply template CTA with start date/goal date picker.
- Add FIT/ZWO import entry in integrations/library flow.

Example TRPC usage in mobile:

```ts
const saveToLibrary = trpc.library.add.useMutation();
const applyTemplate = trpc.trainingPlans.applyTemplate.useMutation();

await saveToLibrary.mutateAsync({
  item_type: "training_plan",
  item_id: plan.id,
});
```

## 3) Delivery Slices

1. Schema additions (`init.sql`) + core schemas.
2. Backend template metadata + apply mutation + library router.
3. FIT/ZWO import endpoints and dedupe behavior.
4. Mobile template/library/apply UI and import entry points.
5. Regression stabilization against Phase 6.
6. Query-plan validation and index tuning for new list paths.
7. Contract stabilization for future discover index compatibility.

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
- TRPC: FIT/ZWO dedupe by source identity.
- Mobile: save template, apply template, and import happy/error paths.
- Regression: existing `events` router tests continue passing.

## 6) Performance Verification (Required)

- Run `EXPLAIN (ANALYZE, BUFFERS)` for:
  - library listing by `profile_id` + `item_type`
  - scheduled apply/remove by `events.schedule_batch_id`
- Verify index-backed plans on hot paths at expected row counts.
- Keep listing endpoints simple (no required multi-join polymorphic query).

## 7) Future Discover Compatibility Verification (Required)

- Ensure list responses include normalized identity fields (`content_type`, `content_id`, `owner_profile_id`, `visibility`).
- Ensure per-type endpoints share one pagination/filter contract shape.
- Ensure no Phase 7 migration introduces coupling that blocks a future read-optimized discover index.

## 8) Ownership/Visibility Verification (Required)

- Verify DB rejects invalid `template_visibility` values.
- Verify non-owners cannot update/delete other users' templates via direct SQL auth context.
- Verify non-owners can read only `public` or `is_system_template` items.
- Verify `library_items` cannot be created/read/modified across user boundaries.

(End of file)
