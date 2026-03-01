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

(End of file)
