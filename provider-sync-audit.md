# Provider Sync Audit

## Scope

- Audit current GradientPeak integrations for Wahoo, TrainingPeaks, and Garmin.
- Confirm relevant provider requirements for planned workouts, scheduling, and webhooks.
- Recommend a lean TypeScript-friendly background sync architecture without adding new app dependencies.

## Current Repo State

### Implemented today

- Wahoo has real outbound sync code in `packages/api/src/lib/integrations/wahoo/`.
- Wahoo sync is triggered inline from event create, update, and delete mutations in `packages/api/src/routers/events.ts`.
- Wahoo webhook ingestion exists at `apps/web/src/routes/api/webhooks/wahoo.ts`.
- OAuth connect/callback plumbing exists for Wahoo, TrainingPeaks, Garmin, Strava, and Zwift.
- `integrations` stores provider tokens and external account IDs.
- `synced_events` stores one `event_id` to one `provider` outbound mapping with an `external_id`.

### Not implemented today

- No Garmin outbound workout or training-plan sync implementation.
- No Garmin webhook receiver.
- No TrainingPeaks outbound sync implementation.
- No TrainingPeaks webhook receiver.
- No durable background job system.
- No provider sync state table for rolling windows, checkpoints, retries, or reconciliation health.

### Current design gaps

- Wahoo sync runs inside request/response mutation handlers instead of durable background work.
- Wahoo webhook processing also performs the import inline before returning.
- `synced_events` only tracks a thin external mapping and is not enough for queued work, retries, or rolling-window publishing.
- `getProfileSyncMetrics()` currently returns null sync metrics, so FTP and threshold HR are not actually sourced for Wahoo plan conversion.
- Wahoo warns when a workout is more than 6 days out, but still creates it immediately instead of scheduling a future publish job.

## Provider Requirements

### Wahoo

Confirmed:

- Wahoo uses a library-first flow: create a plan, then create a scheduled workout that references that plan.
- Wahoo supports webhook delivery for completed workout summaries.
- `offline_data` scope is required for webhook-driven access.
- Wahoo devices/app only surface scheduled workouts from today through 6 days ahead.

Implications:

- GradientPeak should treat Wahoo as a rolling-window publisher, not a long-range full mirror.
- Future planned workouts should be queued for publication when they enter the 6-day window.
- Outbound sync must be idempotent because retries and duplicates are expected.

### Garmin

Confirmed:

- Garmin's Training API supports publishing workouts and training plans into the Garmin Connect calendar.
- Garmin Connect is the delivery bridge to the device.
- Garmin Activity API supports push or ping/pull inbound activity integration.

Unclear from public docs:

- A public workout scheduling window like Wahoo's 6-day rule.
- Public webhook semantics for training-plan publication acknowledgements.

Implications:

- Keep Garmin horizon logic configurable.
- Model Garmin as outbound calendar publication plus separate inbound activity processing.
- Do not assume training-plan webhook acknowledgements exist.

### TrainingPeaks

Confirmed:

- TrainingPeaks is a planning system that can push planned structured workouts to Garmin and Wahoo.
- TrainingPeaks' Wahoo integration publicly states the next 5 planned workouts sync automatically.

Unclear from public docs available here:

- Public official API access details, webhook support, and current OAuth scope model.

Implications:

- Treat TrainingPeaks as a provider with uncertain webhook support until partner docs confirm it.
- Plan for polling or reconciliation rather than assuming event-driven delivery.

## Recommended Architecture

## Keep `synced_events`, but narrow its role

Use `synced_events` only for the current external projection of an internal event:

- `event_id`
- `provider`
- `external_id`
- timestamps relevant to the latest successful publish

Do not expand it into a generic queue or mutable workflow table.

## Add a durable jobs table

Use Postgres for job durability instead of adding Redis or another queue service.

Recommended fields:

- `id`
- `job_type`
- `provider`
- `profile_id`
- `status`
- `run_at`
- `attempt`
- `max_attempts`
- `dedupe_key`
- `payload jsonb`
- `last_error`
- `locked_at`
- `lock_expires_at`
- `locked_by`
- `created_at`
- `updated_at`

Recommended job types:

- `provider.publish_event`
- `provider.unsync_event`
- `provider.reconcile_account`
- `provider.process_webhook_receipt`
- `provider.refresh_token`

## Add provider sync state

Add a table for per-account and optionally per-resource sync control:

- `provider`
- `integration_id`
- `resource`
- `publish_horizon_days`
- `last_sync_started_at`
- `last_sync_succeeded_at`
- `last_sync_failed_at`
- `next_sync_at`
- `consecutive_failures`
- `last_error`
- `cursor` or `high_watermark`
- `metadata jsonb`

This is where Wahoo's 6-day horizon belongs, not hardcoded as a warning only.

## Add a webhook inbox table

Create an immutable receipt table for provider deliveries:

- `provider`
- `provider_account_id`
- `provider_event_id`
- `event_type`
- `object_id`
- `payload jsonb`
- `received_at`
- `processed_at`
- `processing_status`
- `job_id`

Use a unique key on provider + provider account + provider event ID when available.

## Processing model

### Outbound planned workout sync

1. Event or activity plan changes enqueue a publish job instead of calling the provider inline.
2. The job computes provider-specific eligibility.
3. If the event is outside the provider horizon, the job reschedules itself for the earliest eligible `run_at`.
4. If inside the horizon, it publishes idempotently and updates `synced_events`.

### Inbound webhooks

1. Verify signature/token.
2. Insert webhook receipt and enqueue processing in the same transaction.
3. Return `2xx` immediately.
4. Process receipt asynchronously and idempotently.

### Reconciliation

1. Cron wakes a lightweight worker or endpoint.
2. The worker claims due jobs.
3. Periodic reconcile jobs backfill missed webhooks, refresh tokens, and ensure rolling-window publication stays current.

## Lean implementation choices

### Best fit for this repo

- Keep job execution in TypeScript in the existing server codebase.
- Use PostgreSQL tables for durability and visibility.
- Use Supabase Cron only to wake workers or enqueue reconcile jobs.

### Good optional upgrade path

- If you want stronger queue primitives without adding app dependencies, enable `pgmq` later.
- `pgmq` is not currently installed in this project, so a plain jobs table is the leanest first step.

### Avoid as the primary durability layer

- `pg_net` request/response tables are unlogged and response retention is short-lived.
- It is useful for wake-up or fan-out calls, but not as the system of record for jobs.

## Recommended rollout order

1. Move Wahoo outbound sync from inline mutation execution into durable jobs.
2. Move Wahoo webhook processing to receipt + async job handling.
3. Add `provider_sync_state` and implement rolling-window Wahoo publication based on the 6-day rule.
4. Add Garmin outbound publishing behind the same job contract.
5. Add TrainingPeaks only after confirming the partner API and webhook model you will use.

## Recommendation

Build one shared provider sync framework with provider-specific adapters.

- Canonical source of truth stays in GradientPeak events and activity plans.
- `synced_events` stays as the latest external mapping.
- `jobs` handles durable execution and retries.
- `provider_sync_state` handles horizons, checkpoints, and health.
- `webhook_receipts` handles dedupe and replay.

That keeps the architecture lean, TypeScript-first, and aligned with the current monorepo without bringing in another queue dependency too early.

## Other Platform Sync Conditions

Wahoo is not an outlier. A broader survey shows many training and device platforms use rolling windows, polling intervals, workout-type restrictions, or partner gating.

### Decision Matrix

| Platform | Outbound planned workouts from third parties | Confirmed sync conditions or limits | Confidence | Architecture implication |
| --- | --- | --- | --- | --- |
| Wahoo | Yes | Device visibility is effectively today through 6 days ahead; webhook support exists; structured bike/run focus | High | Provider needs rolling-window publishing and webhook ingestion |
| Garmin Connect | Yes | Public partner API exists; TrainingPeaks publicly documents next 15 days of eligible structured workouts syncing into Garmin Connect | High | Keep Garmin horizon configurable; treat Garmin Connect as middleware to device |
| Zwift | Yes | TrainingPeaks documents today-only sync; only certain structured bike/run workouts; heart-rate-only workouts do not sync | High | Same-day publishing only; validate workout compatibility before enqueue |
| TrainerRoad | Yes | TrainingPeaks documents structured workouts only within 2 days; pulls 4 times per day | High | Expect polling-style downstream behavior; reconcile and retry |
| COROS | Yes | COROS documents next 7 days of workouts; supported types include run, bike, swim, strength | High | Use 7-day horizon and workout-type eligibility checks |
| Final Surge to Garmin | Yes | Final Surge documents today plus next 3 days to Garmin Connect; daily auto-sync plus manual push | High | Rolling horizon plus periodic reconcile plus optional user-triggered sync |
| Polar | Yes through partner flows | Public docs emphasize supported device and workout mappings; title and note limits; some day types unsupported | High | Enforce payload normalization and capability filtering |
| Suunto | Yes through partner flows | Public partner/help docs confirm sync but no clear public horizon limit found | Medium | Keep horizon configurable and test rather than assume |
| TrainingPeaks | Unclear as a generic destination | Strongly documented as a source to other platforms, but public generic inbound API constraints remain unclear here | Medium | Treat as source-first until partner API surface is confirmed |
| Strava | No public planned-workout destination support found | Public API is activity-centric; no planned-workout publish endpoint | High | Do not design workout publication around Strava |
| intervals.icu | Likely yes | Publicly integration-friendly, but destination-specific visibility limits not clearly documented | Medium | Keep adapter contract flexible |
| Nolio | Likely yes | Public marketing confirms workout/device export, but hard operational limits are not clearly documented | Low | Treat conditions as unknown until partner validation |

### Design takeaway

The system should not hardcode only one special case like `wahoo = 6 days`.

Instead, each provider should expose its own sync policy:

- publish horizon in days
- supported workout types
- supported payload shapes
- sync model: push, pull, or hybrid
- reconcile cadence
- webhook availability

## Concrete Design

### Goals

- Keep GradientPeak as the canonical planner.
- Make provider publication durable and retryable.
- Support rolling-window publication for platforms like Wahoo, Garmin, COROS, Zwift, and TrainerRoad-like destinations.
- Keep the implementation lean and TypeScript-native.
- Avoid adding non-essential runtime dependencies.

### Design options

#### Option 1: Reuse `synced_events` for everything

Pros:

- Minimal schema surface.

Cons:

- Mixes projection state, queue state, retries, and receipts.
- Hard to reason about idempotency and reconciliation.
- Becomes provider-specific very quickly.

Verdict:

- Not recommended.

#### Option 2: Generic jobs plus provider state plus receipts

Pros:

- Clear separation of concerns.
- Minimal new primitives.
- Works with existing server and DB stack.
- Supports both push and pull style providers.

Cons:

- Requires a few new tables and worker code.

Verdict:

- Recommended.

#### Option 3: Use `pgmq` immediately

Pros:

- Better queue semantics out of the box.

Cons:

- New extension and new operational surface.
- Unnecessary for first implementation.

Verdict:

- Good future upgrade, not required for v1.

## Recommended Shape

### New tables

#### `provider_sync_jobs`

Purpose:

- Durable execution, scheduling, retries, and visibility.

Suggested columns:

- `id uuid primary key`
- `job_type text not null`
- `provider integration_provider not null`
- `profile_id uuid not null`
- `integration_id uuid null`
- `event_id uuid null`
- `status text not null`
- `priority integer not null default 100`
- `run_at timestamptz not null`
- `attempt integer not null default 0`
- `max_attempts integer not null default 8`
- `dedupe_key text null`
- `payload jsonb not null`
- `last_error text null`
- `locked_at timestamptz null`
- `lock_expires_at timestamptz null`
- `locked_by text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Suggested indexes:

- `(status, run_at, priority)`
- `(provider, profile_id, status, run_at)`
- unique partial index on active `dedupe_key`

#### `provider_sync_state`

Purpose:

- Per integration/provider/resource policy and health.

Suggested columns:

- `id uuid primary key`
- `integration_id uuid not null`
- `provider integration_provider not null`
- `resource text not null`
- `publish_horizon_days integer null`
- `sync_mode text not null`
- `last_sync_started_at timestamptz null`
- `last_sync_succeeded_at timestamptz null`
- `last_sync_failed_at timestamptz null`
- `next_sync_at timestamptz null`
- `consecutive_failures integer not null default 0`
- `last_error text null`
- `cursor text null`
- `high_watermark timestamptz null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Suggested unique key:

- `(integration_id, resource)`

#### `provider_webhook_receipts`

Purpose:

- Immutable inbox for inbound provider deliveries.

Suggested columns:

- `id uuid primary key`
- `provider integration_provider not null`
- `integration_id uuid null`
- `provider_account_id text null`
- `provider_event_id text null`
- `event_type text not null`
- `object_type text null`
- `object_id text null`
- `payload jsonb not null`
- `payload_hash text null`
- `received_at timestamptz not null`
- `processed_at timestamptz null`
- `processing_status text not null`
- `job_id uuid null`

Suggested unique key:

- `(provider, provider_account_id, provider_event_id)` when event IDs exist

### Keep existing tables with narrower roles

#### `integrations`

Keep as the credential and account-identity store.

Potential improvements:

- add token health metadata if needed later
- do not overload it with queue state

#### `synced_events`

Keep as the latest successful outbound projection record.

Potential additions if needed:

- `provider_payload_hash`
- `provider_updated_at`
- `last_synced_job_id`

Avoid adding:

- retry counters
- lock fields
- queue status
- webhook receipt state

## TypeScript Contracts

### Provider adapter interface

```ts
type PublishEligibility = {
  eligible: boolean;
  reason?: string;
  nextEligibleAt?: string;
  warnings?: string[];
};

type ProviderPublishResult = {
  success: boolean;
  externalId?: string;
  action?: "created" | "updated" | "recreated" | "deleted" | "noop";
  warnings?: string[];
  error?: string;
};

interface PlannedWorkoutProviderAdapter {
  provider: "wahoo" | "garmin" | "trainingpeaks";
  getPublishEligibility(input: {
    startsAt: string;
    activityCategory: string;
    structure: unknown;
    integration: { id: string; externalId: string };
  }): Promise<PublishEligibility>;
  publishEvent(input: {
    eventId: string;
    profileId: string;
    integrationId: string;
  }): Promise<ProviderPublishResult>;
  unsyncEvent(input: {
    eventId: string;
    profileId: string;
    integrationId: string;
  }): Promise<ProviderPublishResult>;
  reconcileIntegration(input: {
    integrationId: string;
    profileId: string;
  }): Promise<void>;
}
```

### Why this contract works

- `getPublishEligibility()` handles provider-specific windows and restrictions.
- `publishEvent()` owns create/update semantics.
- `reconcileIntegration()` supports pull-based or hybrid providers.
- The job system does not need to know Wahoo or Garmin details.

## Job Flow

### When an event is created or updated

1. Persist the event normally.
2. Enqueue one `publish_event` job per connected provider that supports planned workouts.
3. The worker loads the provider adapter.
4. The adapter checks eligibility.
5. If not eligible yet, the job is rescheduled at `nextEligibleAt`.
6. If eligible, the adapter publishes and updates `synced_events`.

### When an event is deleted or becomes unsupported

1. Enqueue `unsync_event`.
2. Provider adapter removes or archives remote state as supported.
3. Delete or update `synced_events`.

### When a webhook arrives

1. Verify signature or token.
2. Insert a `provider_webhook_receipts` row.
3. Enqueue `process_webhook_receipt`.
4. Return `200` immediately.
5. Worker processes receipt idempotently.

### Periodic reconcile

1. Supabase Cron calls a protected endpoint or edge function every few minutes.
2. That code enqueues `reconcile_integration` jobs for integrations with `next_sync_at <= now()`.
3. Reconcile jobs backfill missed state, refresh rolling windows, and recover from lost webhooks.

## Provider Policies

Represent provider policies in code, not in ad hoc conditionals inside job handlers.

Example:

```ts
const providerPolicies = {
  wahoo: {
    publishHorizonDays: 6,
    supportsWebhooks: true,
    syncModel: "push_windowed",
  },
  garmin: {
    publishHorizonDays: 15,
    supportsWebhooks: false,
    syncModel: "push_windowed",
  },
  trainingpeaks: {
    publishHorizonDays: null,
    supportsWebhooks: false,
    syncModel: "poll_or_partner_defined",
  },
} as const;
```

This should remain overrideable as partner details are verified.

## Recommendation For Your Repo

Start with one bounded implementation slice:

1. Add `provider_sync_jobs`.
2. Refactor Wahoo event sync to enqueue jobs instead of syncing inline.
3. Add `provider_sync_state` and use it for Wahoo's 6-day horizon.
4. Add `provider_webhook_receipts` and move Wahoo webhook imports behind it.
5. Once that path is stable, add Garmin with the same adapter and worker contract.

That gives you a clean base for all the provider-specific conditions above without overbuilding.

## Drain Scheduling

Minimal runtime shape implemented in this audit branch:

- public Wahoo webhook route stores receipts and enqueues jobs
- internal Wahoo drain endpoint processes due sync jobs and webhook receipt jobs

Internal drain endpoint:

- `POST /api/internal/provider-sync/wahoo/drain`
- auth via `INTERNAL_PROVIDER_SYNC_SECRET`

Recommended scheduler setup:

- use Supabase Cron or your hosting scheduler to call this endpoint every 1 to 5 minutes
- send `Authorization: Bearer <INTERNAL_PROVIDER_SYNC_SECRET>`

This keeps the app lean while still giving you durable async processing.

### Supabase-backed scheduler setup in this branch

Migration added:

- `packages/db/drizzle/0005_schedule_wahoo_provider_sync_drain.sql`

It does three things:

- enables `pg_cron`
- creates `public.invoke_wahoo_provider_sync_drain()`
- schedules a `provider-sync-wahoo-drain` cron job every minute

Required Vault secrets:

- `provider_sync_base_url`
  - example: `https://your-app.example.com`
- `provider_sync_internal_secret`
  - same value as `INTERNAL_PROVIDER_SYNC_SECRET`

If either secret is missing, the function exits with a notice instead of failing the whole run.

To change cadence later:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'provider-sync-wahoo-drain'),
  schedule := '*/5 * * * *'
);
```

## Operational Endpoints

Internal endpoints added in this audit branch:

- `POST /api/internal/provider-sync/wahoo/drain`
- `GET /api/internal/provider-sync/wahoo/status?limit=25`
- `POST /api/internal/provider-sync/wahoo/retry`

Retry body format:

```json
{
  "jobId": "<uuid>",
  "receiptId": "<uuid>"
}
```

Either field may be sent by itself.

## Garmin Scaffold

This branch now includes a shared provider adapter contract and a Garmin planned-workout adapter scaffold.

- `packages/api/src/lib/provider-sync/provider-adapter.ts`
- `packages/api/src/lib/provider-sync/garmin-planned-workout-adapter.ts`

Current Garmin scaffold behavior:

- exposes the same publish eligibility and publish/unsync contract shape used for future providers
- defaults to a configurable 15-day horizon assumption for scheduling decisions
- does not attempt real Garmin API publication yet

That keeps the next Garmin implementation bounded to adapter logic instead of changing the queue architecture again.

## `synced_events` Recommendation

### Question

Should `synced_events` be removed and replaced by a more abstract integration-level sync table?

### Short answer

- Replacing it with an integration-level-only table would be hurtful.
- Generalizing it into a broader per-resource link table could be helpful.
- My recommendation is to keep an event-level projection table, but make it more explicit and attach it to `integrations`.

### Why an integration-level-only table is the wrong replacement

Your schema currently has two different scopes:

- `integrations`: one connected provider account per `profile_id + provider`
- `synced_events`: one external projection per internal event and provider

Those are not the same thing.

An integration-level sync table can answer questions like:

- when was this Wahoo account last reconciled?
- what is the publish horizon for this Garmin integration?
- what is the next sync time?

But it cannot correctly answer event-level questions like:

- which remote Wahoo workout corresponds to this specific planned event?
- has this event been published already?
- what external ID should be deleted when this event is unsynced?
- which planned event should an inbound webhook completion attach back to?

The current code relies on those answers directly.

### Schema audit findings

#### `integrations`

Current role:

- credential store
- provider account identity
- token lifecycle

Current constraint:

- unique on `profile_id + provider`

Implication:

- today a user can only have one connection per provider
- if you ever support multiple Garmin/Wahoo accounts, this table will need to change

#### `synced_events`

Current role:

- remote mapping from internal `event_id` to provider `external_id`
- lookup bridge for Wahoo webhook import back to planned event

Current weakness:

- no `integration_id`
- no resource type
- no provider payload fingerprint
- name is too narrow if you later sync plans, routes, or non-event resources

#### `events`

Current role:

- canonical planner record
- already has source-side integration identity fields for imported calendar events

Implication:

- inbound source identity already lives on `events`
- outbound projection identity should not be overloaded into `integrations`

### Recommended options

#### Option A: Keep `synced_events`, add `integration_id`

Best if you want the smallest change.

Suggested improvements:

- add `integration_id uuid not null references integrations(id)`
- keep unique constraint on logical event projection
- optionally add `provider_updated_at` and `provider_payload_hash`

Pros:

- minimal migration
- preserves current Wahoo lookup patterns
- clean separation from integration-level state

Cons:

- table name remains event-specific
- less future-friendly if you later sync routes or plans independently of events

#### Option B: Replace `synced_events` with a generalized resource projection table

Best if you want a cleaner long-term abstraction.

Suggested name:

- `integration_resource_links`
- or `provider_resource_links`

Suggested columns:

- `id`
- `integration_id`
- `profile_id`
- `provider`
- `resource_kind` such as `event`, `activity_plan`, `route`, `activity`
- `internal_resource_id`
- `external_id`
- `sync_direction` such as `outbound` or `inbound`
- `synced_at`
- `provider_updated_at`
- `payload_hash`
- `created_at`
- `updated_at`

Suggested unique keys:

- `(integration_id, resource_kind, internal_resource_id, sync_direction)`
- `(integration_id, resource_kind, external_id, sync_direction)`

Pros:

- better naming
- future-ready for routes, plans, and activity links
- works naturally with multiple accounts per provider later

Cons:

- more migration work
- more generic API surface than you currently need

#### Option C: Remove event/resource links entirely and rely on integration-level state only

Verdict:

- not recommended

Why:

- breaks remote object addressing
- weakens idempotency
- makes inbound completion matching harder
- forces expensive provider API reads to rediscover mappings

### Recommendation

I recommend Option B if you are about to invest in a provider sync framework now.

Specifically:

- replace `synced_events` with a generalized `integration_resource_links` table
- keep it resource-level, not integration-level-only
- add `integration_id`
- keep `provider_sync_state` as the separate integration-level state table

If you want the least disruption for a Wahoo-first rollout, use Option A first, then rename/generalize later.

### Final guidance

The right split is:

- `integrations`: credentials and connected account identity
- `provider_sync_state`: account-level sync health, horizon, checkpoint, cadence
- `integration_resource_links` or `synced_events`: per-resource remote mapping
- `provider_sync_jobs`: durable execution
- `provider_webhook_receipts`: inbound dedupe and replay

So:

- remove `synced_events` only if you replace it with a more general per-resource link table
- do not remove it in favor of integration-level state alone
