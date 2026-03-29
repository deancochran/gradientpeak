# Historical Activity Imports

## Objective

Define a narrow first pass for manual historical activity import: let mobile users upload supported activity files, parse them safely, store canonical historical `activities`, and keep the system simple by favoring dynamic, time-causal calculations over aggressively persisted derived state.

Current implementation note:

- implement FIT upload first
- defer `TCX`, `GPX`, `ZWO`, and other file formats until a later phase

## Why This Spec Exists

- The mobile app already has a working recorded FIT submission path, but no focused manual historical import flow.
- The current integrations screen still reflects placeholder import behavior rather than a real file upload surface.
- Historical activities are a useful onboarding and cold-start lever, but the first implementation should stay narrow.
- The main product risk is not file upload itself; it is how imported history should influence downstream profile state without adding premature architectural complexity.

## Scope

This spec is intentionally narrow.

### In Scope

- Mobile file-based upload entry for historical completed activities.
- First-wave activity format: `FIT` only.
- Parsing the uploaded file.
- Storing one canonical historical activity record.
- Capturing minimal provenance needed to know that the activity came from manual historical import.
- Auditing and defining how imported activities should affect:
  - `activities`
  - `activity_efforts`
  - `profile_metrics`
  - activity-driven views such as home/trends that already read from `activities`
- Favoring dynamic calculation of load- and threshold-dependent values at read time, even when that is more computationally expensive.

### Out Of Scope

- Workout template import in this spec.
- Broad provider-specific archive ingestion programs.
- Complex import jobs, queue orchestration, or retry systems unless they are strictly required to upload and process a single file safely.
- Rich dedupe systems beyond minimal safeguards.
- Large recomputation frameworks or generalized orchestration layers.
- Expanding onboarding, OAuth, or provider sync flows.

## Current-State Audit

### Existing mobile surfaces

- `apps/mobile/app/(internal)/(standard)/integrations.tsx` is the best existing user-facing home for manual import, but its import area is placeholder-oriented today.
- `apps/mobile/app/(internal)/(standard)/route-upload.tsx` already demonstrates a workable document-picker pattern for file-based mobile upload.
- `apps/mobile/lib/hooks/useActivitySubmission.ts` already shows the signed-upload plus backend-processing pattern for recorded FIT activity submission.

### Existing backend surfaces

- `packages/trpc/src/routers/fit-files.ts` already parses FIT files, creates activities, derives best efforts, and appends limited profile metrics.
- `packages/trpc/src/routers/home.ts` and `packages/trpc/src/routers/trends.ts` already read canonical `activities`, so historical imports can improve those views if the imported activities are stored cleanly.
- `packages/trpc/src/routers/activities.ts`, `packages/trpc/src/routers/activity_efforts.ts`, and `packages/trpc/src/routers/profile-metrics.ts` already represent the main downstream state surfaces that will be affected.

### Main current gap

The important missing decision is not whether a file can be parsed, but what downstream state should be created or inferred from that parsed activity and what should remain untouched.

## Product Direction

### Mobile UI

Keep the first manual import surface inside `apps/mobile/app/(internal)/(standard)/integrations.tsx`.

First-pass UX:

- Add a focused `Import Activity History` section.
- Let users pick a supported file from device storage.
- Accept `FIT` only in the first implementation wave.
- Show a lightweight file summary before submit when the parse path can provide it cheaply.
- Show success or failure clearly.

This first pass does not need:

- separate workout template UX
- archive upload UX
- advanced job history dashboard
- multi-file batch flows

### UX rules

- The user should understand that this imports a completed historical activity.
- The UI should state what file types are supported.
- The success state should clarify that importing history may influence training insights and profile-derived metrics.
- The failure state should explain unsupported or unparseable files without exposing backend implementation details.

## Technical Direction

### Minimal router strategy

The backend may add a small dedicated import surface, but it does not need to introduce a broad generalized orchestration system in this first spec.

Acceptable directions:

- extend `fit-files.ts` carefully for first-pass historical activity import, or
- add a small new router dedicated to historical activity import only

The important requirement is not router naming. The important requirement is that parse-store behavior and downstream effects stay explicit and testable.

### Parsing and storage

The first pass should:

1. accept uploaded historical activity files
2. detect supported file type
3. parse the file into a normalized activity shape
4. persist a canonical `activities` row
5. apply only the explicitly approved downstream derived-state updates

The normalization shape should be sufficient to carry:

- activity type
- start and finish timestamps
- duration
- distance
- summary metrics when available
- stream-derived signals when available
- minimal import provenance

### Time-causal processing rule

All derived calculations for an imported activity must be resolved "as of" that activity's completed timestamp.

Required rule:

- when processing an imported activity at time `T`, only use prior user state with timestamps `<= T`

This applies to:

- threshold-like profile metrics used for TSS / IF / TRIMP calculation
- prior `activity_efforts` used as performance context
- prior inferred `profile_metrics`

This prevents future knowledge from leaking backward into older imported activities.

### MVP dynamic architecture rule

For this first implementation, prefer dynamic read-time calculation over persisting large amounts of derived state on activity rows.

Preferred approach:

- keep raw parsed activity facts on `activities`
- keep timestamped inferred user state in `profile_metrics`
- create `activity_efforts` only when they represent raw or directly derivable historical performance outputs from the imported file
- calculate load, TSS-context, IF-context, and similar threshold-dependent views dynamically from raw activities plus prior profile state

Intentional tradeoff:

- reads may become more computationally expensive
- historical backfill stays simpler because imported older activities do not force a rewrite of later activity rows

### Schema simplification rule

If the implementation stops treating stale-prone threshold-dependent fields on `activities` as durable truth, the database schema should be simplified to match.

Required behavior:

- remove no-longer-authoritative derived columns from the database instead of leaving them as misleading cached fields
- generate the schema change with the Supabase CLI
- apply the schema change with `supabase migration up`
- regenerate database types with `pnpm run update-types`

This spec prefers schema honesty over keeping unused or misleading derived fields around.

### Minimal provenance

The first pass should retain enough provenance to know:

- this activity came from manual historical import
- which source file type was used
- original file name when available

This spec does not require a full import-job model.

## Downstream State Audit

This is the core of the spec.

### 1. Activities

Imported historical files should create canonical `activities` rows.

Required behavior:

- imported activities are stored in the same canonical history surface used by trends and home
- imported activities must preserve their actual historical timestamps
- imported activities should remain visible through normal activity-history flows
- activity rows should primarily store raw parsed facts and only durable fields that remain correct after backfill

Questions this implementation must answer:

- what minimal provenance fields need to be stored on the activity record or adjacent model
- whether imported activities should be editable and deletable through existing activity controls with no special restrictions
- which current activity columns are stale-prone derived fields and should be removed by migration rather than retained as false sources of truth

### Recommended `activities` column policy

The first-pass dynamic architecture should make an explicit distinction between columns to keep and columns to remove.

#### Keep on `activities` as raw or activity-local facts

These remain appropriate to persist because they come from the file itself, user input, or activity-local stream calculations that do not depend on later threshold timeline changes.

- identity and ownership: `id`, `profile_id`, `activity_plan_id`, `external_id`, `provider`, `idx`
- core activity facts: `name`, `notes`, `type`, `is_private`, `started_at`, `finished_at`, `duration_seconds`, `moving_seconds`, `distance_meters`
- summary facts from source data: `calories`, `elevation_gain_meters`, `elevation_loss_meters`, `avg_heart_rate`, `max_heart_rate`, `avg_power`, `max_power`, `avg_cadence`, `max_cadence`, `avg_speed_mps`, `max_speed_mps`, `total_strokes`, `pool_length`, `avg_swolf`, `avg_temperature`
- file and map facts: `fit_file_path`, `fit_file_size`, `laps`, `polyline`, `map_bounds`, `device_manufacturer`, `device_product`
- activity-local derived metrics that do not depend on user threshold history: `normalized_power`, `normalized_speed_mps`, `normalized_graded_speed_mps`, `efficiency_factor`, `aerobic_decoupling`
- standard metadata and social counters: `created_at`, `updated_at`, `likes_count`, `comments_count`

#### Remove from `activities` as stale-prone threshold-dependent fields

These should no longer be treated as durable database truth once the dynamic model is adopted.

- `training_stress_score`
- `intensity_factor`
- `trimp`
- `trimp_source`
- `training_effect`
- `hr_zone_1_seconds`
- `hr_zone_2_seconds`
- `hr_zone_3_seconds`
- `hr_zone_4_seconds`
- `hr_zone_5_seconds`
- `power_zone_1_seconds`
- `power_zone_2_seconds`
- `power_zone_3_seconds`
- `power_zone_4_seconds`
- `power_zone_5_seconds`
- `power_zone_6_seconds`
- `power_zone_7_seconds`

Reasoning:

- `training_stress_score`, `intensity_factor`, and `trimp` depend on threshold or profile state that may legitimately change when older history is backfilled.
- `training_effect` is threshold-relative interpretation rather than immutable source fact.
- HR and power zone-second columns depend on threshold definitions such as LTHR, max/resting HR, and FTP, so they are especially prone to becoming stale when historical profile state changes.

This keep/remove split should be the source of truth for the migration.

## Impacted Logic And Dynamic Replacements

Removing the stale-prone columns affects several existing read paths. The implementation should replace direct column reads with dynamic calculation or a dedicated derived read layer.

### Load and TSS consumers

- `packages/trpc/src/routers/home.ts`
  - currently sums `activities.training_stress_score` for daily load replay and weekly TSS
  - must switch to dynamic per-activity stress calculation before building `tssByDate`

- `packages/trpc/src/routers/trends.ts`
  - currently uses `activities.training_stress_score` for load replay and trend charts
  - must switch to dynamic per-activity stress calculation for CTL/ATL/TSB and trend summaries

- `packages/trpc/src/routers/profiles.ts`
  - currently totals `training_stress_score` for profile stats
  - must switch to dynamic aggregation of activity stress

### Intensity and zone consumers

- `packages/trpc/src/routers/trends.ts`
  - `getZoneDistributionTrends` currently reads `training_stress_score` and `intensity_factor`
  - must compute intensity zone classification dynamically from raw activity facts plus prior profile state

- `packages/trpc/src/routers/planning/training-plans/base.ts`
  - creation-context loading currently reads `training_stress_score` plus stored HR/power zone seconds
  - intensity distribution and hard-activity spacing currently read `training_stress_score` and `intensity_factor`
  - these flows must move to dynamic activity analysis using raw activity facts, `activity_efforts`, and prior `profile_metrics`

- `packages/core/calculations/training-quality.ts`
  - currently expects stored HR/power zone second fields on activities
  - must be updated to accept dynamically derived zone distributions or a new intermediate activity-analysis shape

- `packages/core/plan/deriveCreationContext.ts`
  - currently models completed activity signals with stored `tss` and zone-second fields
  - must move to a signal model fed by dynamic analysis rather than direct persisted columns

### Mobile UI consumers

- `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
  - currently renders TSS, IF, and HR/power zone cards directly from activity columns
  - must read from a dynamic derived metrics payload returned with activity detail

- `apps/mobile/app/(internal)/(standard)/activities-list.tsx`
- `apps/mobile/components/feed/ActivityFeedItem.tsx`
- `apps/mobile/components/ActivityListModal.tsx`
  - currently display or filter by `training_stress_score` and `intensity_factor`
  - must switch to dynamically provided activity-analysis values or stop showing those fields until the derived read path exists

- `apps/mobile/lib/hooks/useActivitySubmission.ts`
  - currently writes `training_stress_score`, `intensity_factor`, and zone-second columns into the activity payload
  - must stop writing removed columns once the migration lands

### FIT import write path

- `packages/trpc/src/routers/fit-files.ts`
  - currently inserts `training_stress_score`, `intensity_factor`, `trimp`, `trimp_source`, `training_effect`, and zone-second columns onto `activities`
  - must stop persisting removed fields to `activities`
  - may still calculate those values transiently for response payloads or dynamic read helpers if useful

## Implementation Migration Checklist

Use this checklist when executing the schema transition.

1. Update write paths first so new code stops depending on removed `activities` columns.
2. Introduce or identify the dynamic read-time calculation path for:
   - activity load/TSS
   - intensity factor
   - intensity classification
   - HR/power zone distributions
3. Update impacted routers and mobile views to consume the dynamic derived values instead of direct columns.
4. Generate a Supabase migration that removes:
   - `training_stress_score`
   - `intensity_factor`
   - `trimp`
   - `trimp_source`
   - `training_effect`
   - `hr_zone_1_seconds` through `hr_zone_5_seconds`
   - `power_zone_1_seconds` through `power_zone_7_seconds`
5. Apply the migration with `supabase migration up`.
6. Regenerate DB types with `pnpm run update-types`.
7. Update all broken type references in:
   - `packages/supabase/database.types.ts`
   - `packages/supabase/supazod/schemas.ts`
   - affected mobile, core, and tRPC call sites
8. Run focused tests for routers, mobile screens, and core calculations that previously depended on the removed columns.

## Recommended Implementation Order

Use this sequence to keep the codebase compiling while the schema changes land.

### Step 1 - Define shared dynamic analysis shape

- introduce one shared activity-analysis shape for dynamic derived values
- ensure it can carry per-activity stress, intensity, trimp, training-effect label, and zone distributions without storing them on `activities`
- use this as the boundary for router responses and mobile rendering

### Step 2 - Stop writing removed columns

- update `packages/trpc/src/routers/fit-files.ts`
- update `apps/mobile/lib/hooks/useActivitySubmission.ts`
- ensure write payloads no longer rely on removed `activities` fields

### Step 3 - Add dynamic read helpers

- add read-time helpers that accept raw activity facts plus prior `profile_metrics` and `activity_efforts`
- use them to derive:
  - stress/TSS
  - intensity factor
  - trimp
  - training effect
  - HR/power zone distributions

### Step 4 - Migrate highest-value routers first

- update `packages/trpc/src/routers/home.ts`
- update `packages/trpc/src/routers/trends.ts`
- update `packages/trpc/src/routers/profiles.ts`

These are the most important because they currently rely directly on removed stress columns.

### Step 5 - Migrate planning and context consumers

- update `packages/trpc/src/routers/planning/training-plans/base.ts`
- update `packages/core/calculations/training-quality.ts`
- update `packages/core/plan/deriveCreationContext.ts`

These need a dynamic activity-analysis input rather than direct persisted zone/TSS fields.

### Step 6 - Migrate mobile consumers

- update `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
- update `apps/mobile/app/(internal)/(standard)/activities-list.tsx`
- update `apps/mobile/components/feed/ActivityFeedItem.tsx`
- update `apps/mobile/components/ActivityListModal.tsx`

Each should render dynamic derived values from router payloads, not direct `activities` columns.

### Step 7 - Remove schema columns

- generate the Supabase migration
- apply it with `supabase migration up`
- run `pnpm run update-types`

### Step 8 - Clean up generated-type fallout and tests

- update generated type consumers
- remove stale references that the compiler surfaces
- run focused validation

## Dynamic Derived Payload Sketches

Use a dedicated dynamic payload instead of overloading the raw `activities` row.

### Activity detail payload

`activity-detail` should receive:

```ts
type ActivityDerivedMetrics = {
  stress?: {
    tss: number | null;
    intensity_factor: number | null;
    trimp: number | null;
    trimp_source?: "hr" | "power_proxy" | null;
    training_effect?: "recovery" | "base" | "tempo" | "threshold" | "vo2max" | null;
  };
  zones?: {
    hr: Array<{ zone: number; seconds: number; label: string }>;
    power: Array<{ zone: number; seconds: number; label: string }>;
  };
  computed_as_of: string;
}
```

Recommended shape:

- raw activity stays under `activity`
- dynamic values live under `activity.derived` or sibling `derived`
- mobile detail should render TSS/IF/zone cards from this payload only

### Activities list / feed payload

List surfaces need a lighter derived payload:

```ts
type ActivityListDerivedSummary = {
  tss: number | null;
  intensity_factor: number | null;
  computed_as_of: string;
}
```

Recommended use:

- enough for badges, chips, feed summary, and modal filtering
- avoid sending full zone breakdowns on list surfaces

### Home payload

`home` should not read stored `training_stress_score`. It should build daily replay from dynamic per-activity stress summaries.

Recommended intermediate shape:

```ts
type DynamicActivityStressPoint = {
  activity_id: string;
  started_at: string;
  tss: number;
}
```

Use this to:

- sum daily TSS
- compute CTL / ATL / TSB replay
- compute weekly actual TSS totals

### Trends payload

`trends` should use two dynamic layers:

```ts
type DynamicTrendActivity = {
  activity_id: string;
  started_at: string;
  tss: number;
  intensity_factor: number | null;
  intensity_zone?: "recovery" | "endurance" | "tempo" | "threshold" | "vo2max" | "anaerobic" | "neuromuscular";
}
```

Use this to:

- replay load trends
- build intensity distribution trends
- support activity list modal filters driven by intensity zone

### Planning / creation-context payload

Planning consumers should stop reading stored zone-second columns from the DB row and instead receive an analyzed summary:

```ts
type ActivityAnalysisForPlanning = {
  occurred_at: string;
  activity_category?: string | null;
  duration_seconds?: number | null;
  tss?: number | null;
  hr_zone_seconds?: [number, number, number, number, number] | null;
  power_zone_seconds?: [number, number, number, number, number, number, number] | null;
}
```

This keeps planning logic compatible with the current algorithms while removing direct DB dependence on stale-prone columns.

## Concrete tRPC Contract Direction

Prefer extending existing activity-facing procedures with dynamic derived payloads before introducing brand-new route surfaces.

### `activities.getById`

Current role:

- returns raw `activities` row plus `activity_plans`

Recommended response shape:

```ts
type ActivityGetByIdResponse = {
  activity: ActivityRow;
  has_liked: boolean;
  derived: ActivityDerivedMetrics;
  activity_plan?: ActivityPlan | null;
}
```

Notes:

- `activity-detail.tsx` should stop reading TSS/IF/zones from `activity`
- `derived` should become the sole source for training-load and zone cards on detail view

### `activities.list`

Current role:

- returns raw rows for date-range screens and modals

Recommended response shape:

```ts
type ActivityListItemResponse = ActivityRow & {
  has_liked: boolean;
  derived?: ActivityListDerivedSummary;
}
```

Notes:

- enough for `activities-list.tsx` and `ActivityListModal.tsx`
- include lightweight derived summary only, not full zones

### `activities.listPaginated`

Current role:

- paginated activity list with sort/filter support

Recommended response shape:

```ts
type ActivityPaginatedItem = ActivityRow & {
  has_liked: boolean;
  derived?: ActivityListDerivedSummary;
}
```

Notes:

- if `sort_by: "tss"` remains supported, sorting must move off a DB column and into a dynamic path or be removed for MVP
- simplest MVP choice is to remove dynamic-sort-by-TSS until a dedicated derived query path exists

### `social` / feed activity payloads

Feed surfaces should not carry raw removed columns anymore.

Recommended shape:

```ts
type FeedActivityItem = {
  ...ActivityRowSummary;
  has_liked: boolean;
  profile?: FeedProfileSummary;
  derived?: ActivityListDerivedSummary;
}
```

Notes:

- `ActivityFeedItem.tsx` should render `activity.derived?.tss`

### `home.getDashboardData`-style payload

Home should not expose stored TSS values from raw activities.

Recommended internal contract:

```ts
type HomeDynamicActivityStress = {
  activity_id: string;
  started_at: string;
  tss: number;
}
```

Recommended outward contract:

- fitness trends remain in the existing chart-friendly shape
- weekly actuals remain in the existing summary shape
- all TSS totals should come from dynamic analysis, not direct row reads

### `trends.getTrainingLoadTrends`

Recommended internal contract:

```ts
type TrendDynamicActivity = {
  activity_id: string;
  started_at: string;
  tss: number;
  intensity_factor: number | null;
}
```

Notes:

- replay uses `tss`
- intensity distribution uses `intensity_factor` and dynamic intensity zone classification

### `trends.getZoneDistributionTrends`

Recommended shape:

```ts
type DynamicZoneDistributionPoint = {
  weekStart: string;
  totalTss: number;
  zones: Record<
    "recovery" | "endurance" | "tempo" | "threshold" | "vo2max" | "anaerobic" | "neuromuscular",
    number
  >;
}
```

Notes:

- router should derive zone assignments dynamically, not from stored `intensity_factor`

## Exact Helper Responsibilities

To keep router code small, add explicit dynamic-analysis helpers and keep all threshold lookups time-causal.

### Helper 1: `resolveActivityContextAsOf`

Purpose:

- resolve prior profile state for one activity timestamp

Inputs:

- `profileId`
- `activityTimestamp`
- optional raw activity facts for sport/type hints

Outputs:

- latest usable `profile_metrics` as of the timestamp
- prior relevant `activity_efforts` as of the timestamp
- any fallback profile signals needed for dynamic calculation

Primary consumers:

- `home.ts`
- `trends.ts`
- `activities.getById`
- planning/intensity analysis helpers

### Helper 2: `analyzeActivityDerivedMetrics`

Purpose:

- derive threshold-dependent metrics for a single raw activity using the as-of context

Inputs:

- raw activity summary facts
- optional streams/laps when available
- result of `resolveActivityContextAsOf`

Outputs:

- `tss`
- `intensity_factor`
- `trimp`
- `trimp_source`
- `training_effect`
- HR zone distribution
- power zone distribution

Primary consumers:

- `activities.getById`
- `activities.list` / `listPaginated`
- feed/list response mappers

### Helper 3: `buildDynamicStressSeries`

Purpose:

- derive the daily TSS inputs needed for load replay from raw activities

Inputs:

- ordered raw activities
- access to per-activity derived analysis

Outputs:

- array of `{ activity_id, started_at, tss }`
- daily summed TSS map for replay

Primary consumers:

- `home.ts`
- `trends.ts`
- `profiles.ts`

### Helper 4: `buildDynamicIntensitySeries`

Purpose:

- derive intensity-factor-based trend summaries without stored IF columns

Inputs:

- ordered raw activities
- dynamic per-activity derived analysis

Outputs:

- per-activity `intensity_factor`
- per-activity intensity zone label
- weekly TSS-weighted zone aggregates

Primary consumers:

- `trends.getZoneDistributionTrends`
- `planning/training-plans/base.ts` intensity distribution and hard-session spacing

### Helper 5: `mapActivityToDerivedResponse`

Purpose:

- standardize how raw activities and dynamic metrics are returned to clients

Inputs:

- raw activity row
- derived metrics summary

Outputs:

- detail or list response shape with a `derived` field

Primary consumers:

- `activities.getById`
- `activities.list`
- `activities.listPaginated`
- feed/router mappers

## Router-by-Router Helper Plan

### `packages/trpc/src/routers/home.ts`

Should call:

- `buildDynamicStressSeries`

Should stop doing:

- direct `training_stress_score` reads from `activities`

Should return:

- same fitness trend output shape as now
- weekly actuals based on dynamic TSS

### `packages/trpc/src/routers/trends.ts`

Should call:

- `buildDynamicStressSeries`
- `buildDynamicIntensitySeries`

Should stop doing:

- direct `training_stress_score` and `intensity_factor` reads from `activities`

Should return:

- existing load-trend chart shape
- existing zone-distribution trend shape
- values backed by dynamic derived analysis

### `packages/trpc/src/routers/activities.ts`

Should call:

- `analyzeActivityDerivedMetrics`
- `mapActivityToDerivedResponse`

Should stop doing:

- storing or updating removed columns in `create` and `update`
- sorting paginated lists by DB `training_stress_score`

Recommended MVP decision:

- remove `sort_by: "tss"` until there is a dedicated dynamic-sort strategy

### `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`

Should consume:

- `activityData.activity`
- `activityData.derived`

Should stop doing:

- reading TSS/IF/zone seconds directly from the raw activity row

### `apps/mobile/app/(internal)/(standard)/activities-list.tsx`

Should consume:

- `activity.derived?.tss`

Should stop doing:

- reading `activity.training_stress_score`

### `apps/mobile/components/feed/ActivityFeedItem.tsx`

Should consume:

- `activity.derived?.tss`

Should stop doing:

- defining `training_stress_score` as a required feed item field

## Proposed File Layout

Keep pure, reusable analysis in `@repo/core` and keep database-backed orchestration in `packages/trpc`.

### `@repo/core`

Recommended additions:

- `packages/core/activity-analysis/contracts.ts`
  - shared output schemas and types for dynamic derived payloads
  - owns `ActivityDerivedMetrics`, `ActivityListDerivedSummary`, and planning-analysis shapes

- `packages/core/activity-analysis/stress.ts`
  - pure single-activity derived calculations for TSS, IF, TRIMP, and training-effect labels

- `packages/core/activity-analysis/zones.ts`
  - pure conversion of raw stream/context inputs into HR/power zone distributions

- `packages/core/activity-analysis/intensity.ts`
  - pure intensity-zone classification from dynamic IF/TSS analysis

- `packages/core/activity-analysis/index.ts`
  - barrel for public exports

- `packages/core/contracts/activity-analysis.ts`
  - optional contract re-export if you want router/app consumers to import from the `contracts` surface first

Why core:

- these calculations are deterministic and reusable
- they should not depend on Supabase or router context

### `packages/trpc`

Recommended additions:

- `packages/trpc/src/lib/activity-analysis/context.ts`
  - owns `resolveActivityContextAsOf`
  - performs Supabase reads for prior `profile_metrics`, prior `activity_efforts`, and related profile state

- `packages/trpc/src/lib/activity-analysis/series.ts`
  - owns `buildDynamicStressSeries` and `buildDynamicIntensitySeries`
  - orchestrates per-activity analysis over ordered activity rows

- `packages/trpc/src/lib/activity-analysis/response-mappers.ts`
  - owns `mapActivityToDerivedResponse`
  - converts raw activity rows plus derived outputs into router payloads

- `packages/trpc/src/lib/activity-analysis/index.ts`
  - local barrel for router imports

Why trpc:

- these helpers need authenticated DB access, query scoping, and router-facing response mapping

## First Router Change To Unblock Mobile Migration

The safest first response-shape change is to start with `activities.getById`.

Reasoning:

- `activity-detail.tsx` is the richest current consumer of stale-prone activity fields
- a new `derived` block can be added without immediately breaking list/feed contracts
- detail view is the best place to prove the new dynamic model before expanding to `list` and `listPaginated`

### First-cut `activities.getById` target shape

Move from:

```ts
{
  ...activityRow,
  activity_plans,
  has_liked,
}
```

To:

```ts
{
  activity: {
    ...activityRow,
    activity_plans,
  },
  has_liked: boolean,
  derived: {
    stress: {
      tss: number | null,
      intensity_factor: number | null,
      trimp: number | null,
      trimp_source: string | null,
      training_effect: string | null,
    },
    zones: {
      hr: Array<{ zone: number; seconds: number; label: string }>,
      power: Array<{ zone: number; seconds: number; label: string }>,
    },
    computed_as_of: string,
  },
}
```

### First-cut `activities.getById` implementation sequence

1. keep the existing raw `activities` query
2. add `resolveActivityContextAsOf` for the activity timestamp
3. add `analyzeActivityDerivedMetrics` using raw activity facts plus as-of context
4. return `activity` and `derived` separately
5. update `activity-detail.tsx` to read only `activityData.derived` for TSS/IF/zones

### Follow-on order after `getById`

After detail view is working:

1. extend `activities.list`
2. extend `activities.listPaginated`
3. update feed/list/modal consumers
4. then remove DB-backed TSS sorting or replace it with a dynamic alternative

## Exact `derived` Schema For The First Cut

The first concrete shared schema should be added in `packages/core/activity-analysis/contracts.ts` and exported through `packages/core/index.ts`.

Recommended schema:

```ts
import { z } from "zod";

export const activityDerivedStressSchema = z.object({
  tss: z.number().nullable(),
  intensity_factor: z.number().nullable(),
  trimp: z.number().nullable(),
  trimp_source: z.enum(["hr", "power_proxy"]).nullable().optional(),
  training_effect: z
    .enum(["recovery", "base", "tempo", "threshold", "vo2max"])
    .nullable()
    .optional(),
});

export const activityZoneEntrySchema = z.object({
  zone: z.number().int().positive(),
  seconds: z.number().int().nonnegative(),
  label: z.string(),
});

export const activityDerivedZonesSchema = z.object({
  hr: z.array(activityZoneEntrySchema),
  power: z.array(activityZoneEntrySchema),
});

export const activityDerivedMetricsSchema = z.object({
  stress: activityDerivedStressSchema,
  zones: activityDerivedZonesSchema,
  computed_as_of: z.string(),
});

export const activityListDerivedSummarySchema = z.object({
  tss: z.number().nullable(),
  intensity_factor: z.number().nullable(),
  computed_as_of: z.string(),
});

export type ActivityDerivedMetrics = z.infer<typeof activityDerivedMetricsSchema>;
export type ActivityListDerivedSummary = z.infer<typeof activityListDerivedSummarySchema>;
```

Why this first cut is good:

- it is small enough to adopt quickly
- it supports the current mobile detail UI needs
- it supports list/feed migration without forcing full planning payload adoption yet
- it keeps the output boundary explicit while raw `activities` rows are still in transition

## First Implementation Diff Outline

The first build step should touch only `activities.getById` and `activity-detail.tsx`.

### `packages/trpc/src/routers/activities.ts`

First change set:

1. keep the existing raw activity fetch in `getById`
2. add a call to `resolveActivityContextAsOf({ profileId, activityTimestamp })`
3. add a call to `analyzeActivityDerivedMetrics({ activity, context })`
4. change the return shape from a flattened activity object to:

```ts
return {
  activity: {
    ...data,
    activity_plans: data.activity_plans,
  },
  has_liked: !!likeData,
  derived,
};
```

5. leave `list` and `listPaginated` unchanged in this first step
6. do not remove schema columns yet; just stop depending on them in detail view

### `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`

First change set:

1. keep using the same query hook
2. treat the response as:

```ts
const activity = activityData?.activity;
const derived = activityData?.derived;
```

3. move TSS/IF rendering to:

```ts
derived?.stress.tss
derived?.stress.intensity_factor
```

4. move zone rendering to:

```ts
derived?.zones.hr
derived?.zones.power
```

5. stop reading these raw activity fields in detail view:
   - `training_stress_score`
   - `intensity_factor`
   - `hr_zone_1_seconds` through `hr_zone_5_seconds`
   - `power_zone_1_seconds` through `power_zone_7_seconds`

6. leave the rest of the screen unchanged so the migration scope stays small

### Success condition for the first build step

- `activities.getById` proves the `derived` contract shape
- `activity-detail.tsx` renders dynamic derived values from `derived`
- the codebase is ready to extend the same pattern to list/feed/home/trends next

## First PR Checklist

The first PR should stay narrow and prove one end-to-end path only.

### Scope

- add shared dynamic derived schemas
- add the first context/analysis helpers
- migrate `activities.getById`
- migrate `activity-detail.tsx`
- do not remove database columns yet
- do not migrate list/feed/home/trends yet

### Files expected in the first PR

- `packages/core/activity-analysis/contracts.ts`
- `packages/core/activity-analysis/index.ts`
- `packages/core/index.ts`
- `packages/trpc/src/lib/activity-analysis/context.ts`
- `packages/trpc/src/lib/activity-analysis/response-mappers.ts`
- `packages/trpc/src/routers/activities.ts`
- `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`

### First PR steps

1. Create `packages/core/activity-analysis/contracts.ts` with:
   - `activityDerivedStressSchema`
   - `activityZoneEntrySchema`
   - `activityDerivedZonesSchema`
   - `activityDerivedMetricsSchema`
   - `activityListDerivedSummarySchema`
2. Export the new contracts through `packages/core/activity-analysis/index.ts` and `packages/core/index.ts`.
3. Add `packages/trpc/src/lib/activity-analysis/context.ts` with a first implementation of `resolveActivityContextAsOf`.
4. Add `packages/trpc/src/lib/activity-analysis/response-mappers.ts` with a first implementation of `mapActivityToDerivedResponse`.
5. Add a temporary first-pass analysis function usage in `packages/trpc/src/routers/activities.ts` for `getById` only.
6. Change `getById` to return `{ activity, has_liked, derived }`.
7. Update `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` to read:
   - `activityData.activity`
   - `activityData.derived`
8. Remove direct TSS/IF/zone-second reads from detail view.
9. Run focused typecheck/tests for `packages/core`, `packages/trpc`, and the touched mobile screen path.

### Explicitly out of scope for the first PR

- `activities.list`
- `activities.listPaginated`
- feed surfaces
- `home.ts`
- `trends.ts`
- planning/training-plan dynamic migration
- Supabase migration and column removal

Keeping those out of scope should make the first PR easier to review and debug.

## First Helper Signatures

Start with narrow signatures that are easy to evolve.

### `resolveActivityContextAsOf`

Recommended location:

- `packages/trpc/src/lib/activity-analysis/context.ts`

Recommended signature:

```ts
type ResolveActivityContextAsOfInput = {
  supabase: unknown;
  profileId: string;
  activityTimestamp: string;
};

type ResolvedActivityContext = {
  profile_metrics: {
    ftp?: number | null;
    lthr?: number | null;
    max_hr?: number | null;
    resting_hr?: number | null;
    weight_kg?: number | null;
  };
  recent_efforts: Array<{
    recorded_at: string;
    effort_type: "power" | "speed";
    duration_seconds: number;
    value: number;
    activity_category?: string | null;
  }>;
  profile: {
    dob?: string | null;
    gender?: "male" | "female" | "other" | null;
  };
};

async function resolveActivityContextAsOf(
  input: ResolveActivityContextAsOfInput,
): Promise<ResolvedActivityContext>
```

Notes:

- keep this DB-facing and tRPC-owned
- return only what the first dynamic analysis needs
- expand later if home/trends require more context

### `analyzeActivityDerivedMetrics`

Recommended location:

- pure calculation pieces in `packages/core/activity-analysis/*`
- thin orchestration wrapper can live in `packages/trpc/src/lib/activity-analysis/response-mappers.ts` or a sibling file

Recommended signature:

```ts
type AnalyzeActivityDerivedMetricsInput = {
  activity: {
    id: string;
    type: string;
    started_at: string;
    finished_at: string;
    duration_seconds: number;
    moving_seconds: number;
    distance_meters: number;
    avg_heart_rate?: number | null;
    max_heart_rate?: number | null;
    avg_power?: number | null;
    max_power?: number | null;
    avg_speed_mps?: number | null;
    max_speed_mps?: number | null;
    normalized_power?: number | null;
    normalized_speed_mps?: number | null;
    normalized_graded_speed_mps?: number | null;
  };
  context: ResolvedActivityContext;
  streams?: {
    heart_rate?: { values: number[]; timestamps: number[] } | null;
    power?: { values: number[]; timestamps: number[] } | null;
    speed?: { values: number[]; timestamps: number[] } | null;
  } | null;
};

function analyzeActivityDerivedMetrics(
  input: AnalyzeActivityDerivedMetricsInput,
): ActivityDerivedMetrics
```

Notes:

- return the exact shared `ActivityDerivedMetrics` contract
- allow `streams` to be optional so the first PR can succeed even if detail initially uses summary-only fallbacks
- keep this deterministic and side-effect free

### `mapActivityToDerivedResponse`

Recommended location:

- `packages/trpc/src/lib/activity-analysis/response-mappers.ts`

Recommended signature:

```ts
function mapActivityToDerivedResponse(input: {
  activity: ActivityRow;
  has_liked: boolean;
  derived: ActivityDerivedMetrics;
}): {
  activity: ActivityRow;
  has_liked: boolean;
  derived: ActivityDerivedMetrics;
}
```

Notes:

- start very thin
- centralize the response shape so later `list` and `listPaginated` can follow the same pattern

### 2. Activity Efforts

This needs explicit policy, not an automatic assumption.

Recommended first-pass rule:

- derive `activity_efforts` only when the imported file contains enough trustworthy stream data to support the existing effort calculations

Implications by format:

- `FIT`: likely eligible for best-effort derivation when power/speed streams exist
- `TCX`: possibly eligible for limited effort derivation depending on field richness
- `GPX`: usually poor candidate for meaningful effort derivation beyond route/location history

Decision needed:

- whether to insert no efforts for low-fidelity imports, rather than creating weak or misleading effort records

Required timing rule:

- efforts created from an imported activity must be timestamped to that activity's historical completion time so they become available for later activities, but not for earlier ones

MVP simplification rule:

- `activity_efforts` should remain historical performance facts, not a cache of every threshold-dependent interpretation needed by later views

### 3. Profile Metrics

This also needs explicit policy.

Recommended first-pass rule:

- imported historical activities may append inferred metrics only when the inference is already supported by current logic and the signal quality is high enough

Strong candidates:

- `lthr` detection from rich heart-rate files
- possibly `max_hr` observations when clearly supported by the source file and current metric policy

Not required in first pass:

- broad body-composition imports
- wellness imports
- new metric types unrelated to activity-derived signals

Decision needed:

- when to append inferred metric rows versus when to leave the profile unchanged
- how imported metric inference should be labeled so it is distinguishable from manually entered values

Required timing rule:

- inferred `profile_metrics` created during import must be written with the imported activity timestamp so later activities can see them and earlier ones cannot

### 4. Home, Trends, And Load-Driven Views

These views already read from canonical `activities`, so the first-pass design should prefer leveraging existing reads rather than building a special recomputation layer.

Expected behavior:

- once historical activities are stored correctly, `home` and `trends` should reflect them through their existing activity queries
- only the necessary invalidation or refresh behavior should be added

This spec does not require:

- a new load replay subsystem
- a new bulk recomputation framework

### 5. Out-of-order historical imports

This is the main correctness edge case.

Example:

1. user imports an activity from June
2. the system creates efforts and inferred metrics dated in June
3. later the user imports an older activity from May

If the May activity is processed against the current database state without time-causal rules, the June-derived state leaks backward and corrupts May calculations.

Required policy:

- each imported activity must be processed against prior state only
- older imports must become visible to later dynamic calculations without requiring a rewrite of later raw activity rows

MVP simplification decision:

- do not require recomputing all later activities after an out-of-order import
- instead, avoid storing threshold-dependent derived state on activity rows when that state would become stale
- compute those values dynamically from raw activity facts plus prior `profile_metrics` and prior `activity_efforts` at read time

This gives the system a causal history model with a simpler write path, at the known cost of more expensive reads.

## Format Decision Table

Use this table to keep the first implementation conservative.

| Format | Parse and store `activities` | Create `activity_efforts` | Append inferred `profile_metrics` | Notes |
| --- | --- | --- | --- | --- |
| `FIT` | Yes | Yes, when streams support existing effort logic | Yes, but only for existing high-confidence inferences such as `lthr` and possibly observed `max_hr` | Best first-pass fidelity; closest to current `fit-files.ts` behavior |
| `TCX` | Yes | Maybe, only when parsed fields are rich enough to support existing speed/HR effort logic without guesswork | Maybe, only when current inference logic can operate confidently on the parsed HR data | Treat as partial-fidelity import, not guaranteed parity with FIT |
| `GPX` | Yes | No by default | No by default | Good for timestamps, distance, and route/location history; poor source for effort and metric inference |

Interpretation rules:

- `Yes` means the behavior is allowed in the first pass.
- `Maybe` means the implementation must gate behavior on actual parsed fidelity and should default to doing less, not more.
- `No by default` means the first pass should avoid creating weak derived state from thin source data.

## Current FIT Logic Reuse Guidance

The existing `packages/trpc/src/routers/fit-files.ts` logic is useful, but it should be reused selectively.

### Reuse directly or with light extraction

- signed upload pattern
- FIT download and parse flow
- canonical activity summary extraction
- activity record field mapping for strong summary metrics
- best-effort creation when trustworthy power/speed streams exist
- existing `lthr` inference only when current signal quality rules are satisfied

### Reuse carefully or make optional

- default metric lookups used to estimate TSS and IF when user baselines are missing
- advanced calculations such as aerobic decoupling, training effect, and normalized graded speed
- weather lookup enrichment

These are valuable, but they are not necessary to prove the first historical import pass and should not expand scope if they complicate parse-and-store behavior.

### Skip from first-pass historical import unless clearly needed

- notification side effects for newly inferred metrics
- placeholder FIT file status and list management features unrelated to manual import submission
- any behavior that requires a broad new orchestration or retry system

The first implementation should prefer: store the activity correctly, then apply only the smallest approved derived-state updates.

## Recommended Implementation Policy

For the first pass:

- parse and store historical activities cleanly
- keep provenance minimal but explicit
- calculate imported-activity side effects using only prior state at or before the activity timestamp
- derive `activity_efforts` only for high-confidence imports
- append `profile_metrics` only for high-confidence existing inferences
- prefer dynamic read-time calculation for threshold-dependent stress/load views rather than persisting stale-prone derived activity fields
- remove stale-prone derived database columns when the application stops treating them as authoritative
- accept higher read-time computation cost in exchange for a simpler and more change-friendly MVP architecture

## Success Criteria

- Mobile exposes a real file-based historical activity import flow.
- Supported files can be parsed and stored as canonical historical `activities`.
- The implementation explicitly defines when imported activities do and do not create `activity_efforts`.
- The implementation explicitly defines when imported activities do and do not append `profile_metrics`.
- Derived calculations for an imported activity never use future efforts or future profile metrics.
- Out-of-order historical imports do not require rewriting later raw activities to preserve correctness.
- The MVP remains simple by pushing stale-prone threshold-dependent calculations to dynamic reads.
- Existing activity-driven views reflect imported history without unnecessary new orchestration complexity.

## Validation Focus

- Mobile screen tests for file selection, supported-type validation, success, and failure states.
- Backend tests for parse-and-store behavior per supported file type.
- Tests covering the approved downstream behavior for `activity_efforts`.
- Tests covering the approved downstream behavior for `profile_metrics`.
- Tests covering time-causal processing so older imports cannot see future-derived state.
- Tests covering out-of-order imports so later dynamic reads incorporate older history without rewriting later raw activity rows.
- Regression tests confirming imported historical activities appear in normal activity-driven views.
