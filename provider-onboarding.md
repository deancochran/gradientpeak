# Provider Onboarding

## Purpose

This document explains how to onboard a new third-party training provider into GradientPeak.

The goal is to keep the process small, lean, and repeatable:

- start with one provider at a time
- keep GradientPeak as the source of truth
- reuse the existing queue and webhook framework
- avoid adding new infrastructure or app dependencies unless the provider truly requires it

Today, Wahoo is the reference implementation.

## Current baseline

The repo now has a provider integration foundation with these pieces:

- `integrations`
  - connected provider account and tokens
- `integration_resource_links`
  - mapping between internal resources and provider resources
- `provider_sync_state`
  - integration-level sync state, publish horizon, failures, next sync time
- `provider_sync_jobs`
  - durable queued sync work
- `provider_webhook_receipts`
  - immutable inbound webhook inbox

Current runtime pieces:

- Wahoo webhook route
  - `apps/web/src/routes/api/webhooks/wahoo.ts`
- internal Wahoo drain endpoint
  - `apps/web/src/routes/api/internal/provider-sync/wahoo/drain.ts`
- internal Wahoo status endpoint
  - `apps/web/src/routes/api/internal/provider-sync/wahoo/status.ts`
- internal Wahoo retry endpoint
  - `apps/web/src/routes/api/internal/provider-sync/wahoo/retry.ts`
- Wahoo sync job service
  - `packages/api/src/lib/provider-sync/wahoo-job-service.ts`
- Wahoo webhook job service
  - `packages/api/src/lib/provider-sync/wahoo-webhook-job-service.ts`

## Recommended onboarding flow

### 1. Confirm provider fit first

Before writing code, answer these questions:

- Is this provider a destination for planned workouts, a source of completed activities, or both?
- Is access public API access, partner API access, or private/approval-gated?
- Does it use OAuth? If so, what scopes are required?
- Does it support webhooks?
- Does it have a publish window like Wahoo's 6-day rule?
- Does it reject certain workout types or payload shapes?
- Is reconciliation needed because the provider is pull-based or eventually consistent?

If these answers are unclear, stop there and do research before implementing.

### 2. Decide the smallest viable integration

Do not build every direction at once.

Choose one of these first:

- outbound planned workouts only
- inbound completed activities only
- OAuth connect only

For most providers, the smallest useful slice is:

- OAuth connect
- one outbound publish flow for planned workouts
- optional inbound webhook import only if the provider makes it straightforward

### 3. Add the provider to the account surface

If the provider is truly being added to the product:

- add it to the `integration_provider` enum if not already present
- add OAuth auth/token config in `packages/api/src/routers/integrations.ts`
- make sure disconnect and token refresh behavior are supported

Do not add provider-specific business logic into the generic router beyond config and delegation.

### 4. Define provider sync policy

Each provider should have an explicit sync policy, even if some values are provisional.

At minimum document:

- `publishHorizonDays`
- `syncMode`
  - `push_windowed`, `push_full`, `pull`, or `hybrid`
- `supportsWebhooks`
- supported resource kinds
- payload restrictions

Example:

```ts
const providerPolicy = {
  provider: "wahoo",
  publishHorizonDays: 6,
  syncMode: "push_windowed",
  supportsWebhooks: true,
};
```

### 5. Implement provider adapter logic

Provider-specific logic should live behind an adapter/service boundary.

Current shared adapter contract:

- `packages/api/src/lib/provider-sync/provider-adapter.ts`

Current scaffold example:

- `packages/api/src/lib/provider-sync/garmin-planned-workout-adapter.ts`

Use that shape to isolate:

- eligibility checks
- publish behavior
- unsync behavior
- reconcile behavior

This keeps the queue framework generic and prevents provider behavior from leaking into routers.

### 6. Reuse the queue system

For outbound work:

- enqueue publish jobs into `provider_sync_jobs`
- store resource mapping in `integration_resource_links`
- update per-integration status in `provider_sync_state`

For inbound work:

- verify webhook/auth first
- store raw delivery in `provider_webhook_receipts`
- enqueue receipt processing job
- return `2xx` immediately

Do not do long provider work directly in request/response handlers.

### 7. Add only the runtime entrypoints you need

Use this checklist:

- public webhook route if provider supports webhooks
- internal drain endpoint if queued jobs need processing
- optional status/retry endpoints for operations
- scheduler trigger if work must run continuously

Do not add a UI or admin dashboard until there is an operational need.

### 8. Add scheduler wiring only after the flow works manually

The current Wahoo pattern is the reference:

- internal drain endpoint in the web app
- Supabase `pg_cron` + `pg_net` to call it on a schedule
- secrets stored in Vault

That should remain the default approach unless a provider requires a different execution model.

## New provider checklist

Use this checklist when onboarding any new provider.

### Product and API

- confirm provider business value
- confirm public vs partner API access
- confirm OAuth scopes
- confirm webhook support
- confirm publish horizon and payload limits
- confirm whether the provider is source, destination, or both

### Data model

- add provider enum only if needed
- decide which `resource_kind` values the provider will use
- decide whether `provider_sync_state` needs custom metadata
- define `dedupe_key` strategy for jobs

### Backend

- add provider auth config
- add provider repository methods if new data access is needed
- add provider adapter/service
- add job types
- add webhook receipt handling if supported
- add reconcile path if needed

### Web app

- add callback route support if needed
- add webhook route if needed
- add internal drain endpoint if needed
- add internal status/retry endpoints only if operations need them

### Scheduler

- confirm manual drain works first
- add scheduled invocation
- store secrets in Vault or hosting secret manager
- verify cron history and HTTP response behavior

### Validation

- typecheck `@repo/db`, `@repo/api`, and `web`
- add focused unit tests for job service and webhook processor
- test duplicate webhook receipt handling
- test retry path
- test outside-horizon scheduling behavior

## Wahoo as the reference example

Wahoo is the right reference provider because it exercises the main system concerns:

- OAuth account connection
- planned workout publishing
- publish horizon logic
- webhook ingestion
- completed activity import
- queue-based retries

That means future providers should usually copy the Wahoo shape first, then remove pieces they do not need.

Example:

- if a provider has no webhooks, skip `provider_webhook_receipts` usage
- if a provider has no publish horizon, eligibility is simpler
- if a provider is inbound-only, skip publish/unsync jobs entirely

## Small-start recommendation

Since you only have Wahoo live today, the best path is:

1. keep Wahoo as the only fully integrated provider
2. treat the current queue/webhook architecture as the default provider template
3. do not implement another provider until its API requirements are confirmed
4. when you do add one, ship only the smallest useful direction first

That keeps the codebase lean while still documenting a real onboarding path for the next provider.

## Suggested first steps for a future provider

When the next provider becomes real, do these in order:

1. write a short provider requirements note
2. confirm auth scopes and publish limits
3. add or verify provider enum and OAuth config
4. add provider adapter with `getPublishEligibility()` first
5. enqueue one publish job path
6. add inbound webhooks only if clearly supported and useful
7. add scheduler/reconcile only after the basic flow works

## Related files

- `provider-sync-audit.md`
- `packages/api/src/lib/provider-sync/provider-adapter.ts`
- `packages/api/src/lib/provider-sync/wahoo-job-service.ts`
- `packages/api/src/lib/provider-sync/wahoo-webhook-job-service.ts`
- `apps/web/src/routes/api/internal/provider-sync/wahoo/drain.ts`
- `apps/web/src/routes/api/internal/provider-sync/wahoo/status.ts`
- `apps/web/src/routes/api/internal/provider-sync/wahoo/retry.ts`
