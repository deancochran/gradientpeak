# Garmin Training structured-workout export

## Status

**Supported local subset; live delivery verification remains pending.** The provider-authorized Garmin Connect Training API V2.0 document is available locally. The server-only HTTP adapter, pure Core V5 prescription projection, generation-fenced durable worker, bounded admission, and internal drain route are registered together. Credentials configure the runtime; there is no separate user-facing enable flag.

`garminProviderManifest.capabilities.planned_activity_push` is supported for the bounded Garmin subset: connected accounts with `WORKOUT_IMPORT` automatically admit eligible upcoming running and cycling sessions. It is not a claim that Garmin, a device, or a production deployment has been verified. Garmin activity ingestion, swim, strength, routes, profile import, and completed-activity export remain unsupported.

## Verified current behavior

- The Core capability registry is the source of truth: Garmin declares `planned_activity_push` with `WORKOUT_IMPORT` and the registered `garmin-training-sync` worker requirement. Wahoo remains isolated in its own queue and is not used for Garmin admission.
- A missing grant, disconnected integration, incompatible plan, or unavailable internal worker never makes Garmin delivery healthy. The overview distinguishes queued/syncing work, recovery-required receipts, unsupported projections, and a missing grant.
- Garmin's runtime exposes OAuth connection/disconnect plus bounded planned-session admission; it does not expose data ingestion or profile synchronization.
- Wahoo's provider-specific availability window, sync-lane, projection, and update policy are intentionally unchanged. There is one real planned-workout adapter today, so a speculative cross-provider delivery seam would add surface area without leverage.

## Implemented, documented subset

- `packages/api/src/lib/integrations/garmin/training-mapper.ts` projects a frozen V5 `ActivityPlanStructure` for **single-segment running and cycling only**. It preserves time/distance, fixed repeats, exact watts/bpm/cadence, and speed by converting Core km/h to Garmin `SPEED` m/s. It emits Garmin's documented one-based order and rejects relative targets, RPE, multiple targets, repetitions/open completions, unsupported sports, and more than 100 expanded steps rather than degrading them.
- Pool swim is deliberately not projected: the Core prescription has no pool length, stroke, drill, equipment, or documented swim-target contract. Multisport and exercise mappings are also excluded; no Appendix A/B exercise mapping is fabricated.
- `training-client.ts` implements documented workout and schedule CRUD plus schedule retrieval by calendar date. Workout create uses `/workoutportal/workout/v2`; other workout operations use `/training-api/workout/v2`. It accepts a fresh bearer token from existing credential orchestration and never refreshes it. Writes treat transport failure and empty 204 create as `unknown_outcome`, never retry automatically, and return remote IDs only from validated bodies.
- `admitGarminPlannedSessionSyncWindow` performs bounded rolling admission before the internal drain claims work. Each drain selects at most 10 eligible integrations and keyset-reads at most 5 sessions per locked integration (at most 50 session rows); it never loads all connected profiles, all active lanes, or a whole 14-day session window. A dedicated existing `provider_sync_state` resource stores each integration's `(planningDate, sessionId)` cursor and its last scan time. The least-recently-scanned integrations run first, and integration row locks plus a cursor reread fence concurrent drains from rewinding progress. It uses each profile's validated planning timezone, skips unchanged links by current projection hash/date/generation, preserves recovery lanes, and treats unsupported projections as unadmitted rather than retrying them. It does not delete cancelled, out-of-window, or completed historical remote work automatically.
- The guarded disposable-DB suite proves repeated unchanged admission creates no job, an eleventh profile is reached across successive bounded drains after the first ten converge, more than fifty converged sessions require successive keyset pages before later work is admitted, a same-date projection edit is admitted, unsupported plans do not create terminal lanes, and a stale-generation resource link is retained as recovery evidence without provider mutation.
- `runGarminPlannedSessionSyncJobs` in `drizzle-garmin-training-sync-repository.ts` transactionally leases only active, granted `garmin.training_planned_session` rows, re-reads the current owned session and plan for publish, resolves credentials outside the transaction, and passes an injected-safe `GarminTrainingClient` adapter to the durable state machine. Each create marker records the job/attempt/generation, phase, payload digest, and returned resource identifiers when available. A returned create identity is receipt-persisted under the existing claimed lease even if disconnect/revocation wins the subsequent authorization check; the lane then remains terminal recovery and performs no schedule/update. Resource links carry their writing generation; a generation mismatch becomes explicit recovery and is never adopted, overwritten, or deleted by the new generation. This is recovery evidence, not authorization to reuse or clean up a remote resource. The internal route is called by the local provider-drain startup loop and is declared as the Core `garmin-training-sync` worker requirement.

## Operational boundary

The rolling admission default is **14 days** (`GARMIN_TRAINING_SYNC_WINDOW_DAYS`); it is a product policy, not a Garmin requirement. `pnpm dev:web:local` and the tunneled web development command start one local provider-drain process that calls both the Wahoo and Garmin internal routes using the existing `INTERNAL_PROVIDER_SYNC_SECRET`. Missing Garmin credentials make its route unavailable and the loop remains interval-bounded; credentials are configuration, not a delivery enable flag. `start:provider-drains` and `start:provider-drains:once` are available for the existing worker topology, but no external deployment configuration was changed by this work. Do not treat local registration, configuration presence, or an internal drain response as deployment, partner approval, or end-to-end delivery proof.

Example (server-side only):

```ts
const workout = projectGarminTrainingWorkout({ name, description, structure });
const client = new GarminTrainingClient({ accessToken: freshAccessToken });
const { workoutId } = await client.createWorkout(workout);
```

## Live-verification and release blockers

The implementation below is present locally. Keep the Core prescription provider-neutral and do not elevate the supported subset to live-verified delivery until the remaining evidence is available and reviewed.

| Concern | Existing insertion point | Required Garmin-specific work |
| --- | --- | --- |
| Capability truth | `packages/core/integrations/provider-capabilities.ts` | Change only the Garmin planned-delivery declaration after adapter, worker, and operation coverage exist. Do not infer support from OAuth permissions alone. |
| Runtime registration | `packages/api/src/application/integrations/garmin-provider-runtime.ts` | Add only documented delivery overview/admission components and preserve connection/disconnect fences. |
| Frozen planned-session input | `packages/api/src/lib/provider-sync/planned-activities/wahoo-planned-workout-provider.ts` and its projection inputs | Consume the existing frozen prescription, planning date, and timezone as immutable input; create a Garmin-specific projection/adapter rather than changing Wahoo semantics. |
| Mutation admission | `packages/api/src/lib/provider-sync/planned-activities/wahoo-calendar-mutation-sync.ts` and calendar mutation callers | Add Garmin admission only if a second real adapter proves a shared seam. It must select by provider capability, connection, grant, generation, and documented schedule compatibility. |
| Durable jobs and links | Wahoo planned-activity repository/job conventions | Define Garmin-specific resource identity, retry classification, idempotency/convergence behavior, and generation-fenced link writes from Garmin's documented API. No guessed reuse of Wahoo payloads or remote IDs. |
| Worker execution | registered `garmin-training-sync` worker and internal drain route | Keep the generation/grant/receipt fences; live Garmin and device evidence is still required before calling the subset live-verified. |

## Training delivery checklist

All items are release blockers for actual export; none may be filled in from Garmin FIT SDK APIs, consumer/mobile reverse engineering, Wahoo documentation, or an OAuth permission name.

### Provider-authorized contract evidence

- [ ] Garmin Training API base URL, authentication method, required partner program approval, and environment behavior.
- [ ] Exact permission/grant relationship for workout import, including post-consent changes and revocation behavior.
- [ ] Authoritative request and response contracts for create, read/list, update, delete, and schedule/unschedule operations.
- [ ] HTTP status/error vocabulary, rate limits, retries, pagination, asynchronous processing, and remote resource identity.
- [ ] Idempotency key support or documented lookup/convergence method for uncertain create/update/delete outcomes.
- [ ] Device-delivery acknowledgement/proof semantics, including what is known after a device is offline or a sync fails.

### Prescription fidelity and compatibility

- [ ] Freeze the exact source prescription/version before projection; never regenerate a mutable plan while retrying.
- [ ] Map supported sports from Core canonical categories only after Garmin's accepted sport enum is documented.
- [ ] Map every step duration (time, distance, open/other), including inclusivity, precision, minimums, and unit conversions.
- [ ] Map targets with explicit units and ranges (pace/speed, power, heart rate, cadence, RPE, zones, and any Garmin-specific forms); reject values without a documented lossless or explicitly accepted conversion.
- [ ] Model nested repeats, repeat counts, transitions, warmup/cooldown, rests/recovery, and termination behavior from documented Training schemas.
- [ ] Define a strict compatibility result for unsupported sport, duration, target, repeat, rest, multi-target, boundary, or precision behavior. Rejection must be visible and must converge/remove a previously published remote workout only when the remote contract proves that safe.
- [ ] Preserve enough source version/provenance to explain a rejected or degraded export; do not claim equivalent device execution when fidelity is unknown.

### Schedule, lifecycle, and convergence

- [ ] Define whether a workout is an unassigned library item, a scheduled calendar workout, or both; document local-date, timezone, DST, and date-change semantics.
- [ ] Implement create/edit/delete/unschedule against documented resource identifiers and ownership rules.
- [ ] Fence every queued operation by integration generation and disconnect state; a stale job may not create, update, or delete after reconnect/disconnect.
- [ ] Define duplicate delivery behavior and safe retry for every external effect. An ambiguous timeout is unknown, not a failed create.
- [ ] Reconcile local links with documented remote reads/listing; prove convergence for lost acknowledgements, partial writes, edits, deletes, and remote user changes.
- [ ] Handle permission updates by immediately withdrawing admission when the required Garmin permission is absent, while retaining a recoverable account of uncertain remote state.
- [ ] Define disconnect cleanup/retention and remote deletion behavior without weakening the existing pending-disconnect lifecycle.

### Evidence and tests before enablement

- [ ] Contract tests using provider-authorized fixtures for each accepted sport, step duration, target/unit, repeat, rest, and schedule timezone case.
- [ ] Negative tests for every documented incompatibility and for unsupported Core semantics.
- [ ] Queue/worker tests for no grant, revoked grant, stale generation, disconnect race, duplicate mutation, retry, timeout, and lost acknowledgement.
- [ ] Integration proof for idempotency/convergence against Garmin's approved test environment, including create/edit/delete and schedule changes.
- [ ] Device proof on the supported Garmin device/application path that shows the intended workout and schedule are available, with documented limits represented honestly in product status.

## Sources inspected

1. Garmin Connect Developer Program, *Training API V2*, version 2.0 (2026-10-15), locally provided at `/tmp/opencode/garmin-training-v2/Training_API V2 2.0.pdf` and extracted at `/tmp/opencode/garmin-training-v2/training.txt`.
2. Garmin Connect Developer Program, *OAuth2.0 PKCE Specification* (provided locally at `/tmp/opencode/garmin-oauth2-pkce.txt`).

Remaining blockers are durable queue/link/reconciliation design, documented convergence/idempotency proof in an approved non-production environment, and device delivery proof. Credentials are not a substitute and must not be requested.
