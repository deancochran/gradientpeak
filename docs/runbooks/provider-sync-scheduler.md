# Provider sync scheduler

The Wahoo drain endpoint claims due work under database leases, serializes each `sync_lane_key` by immutable queue sequence, and runs independent lanes with bounded concurrency. A lane head's `run_at` controls eligibility but never changes precedence. Expired `running` leases are reclaimable; every invocation receives a unique fencing identity, so an old worker cannot renew or finalize a reclaimed job. Queue dedupe keys and provider-side sync records remain the idempotency boundary.

## Configuration

Set these server-side variables (never include their values in logs):

- `INTERNAL_PROVIDER_SYNC_SECRET`: bearer credential used by the scheduler.
- `WAHOO_PROVIDER_SYNC_CONCURRENCY`: shared cap across planned-workout, webhook, and history lanes; default `4`, maximum `16`.
- `WAHOO_PROVIDER_SYNC_DRAIN_LIMIT`: claim limit per job family and invocation; default `20`, maximum `100`.
- `WAHOO_PROVIDER_SYNC_LEASE_MS`: lease duration; default 10 minutes, maximum 30 minutes. Keep this above the expected p99 job duration.
- `WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS`: scheduler HTTP timeout; default 8 seconds, maximum 9 seconds so it remains below the existing `pg_net` 10-second timeout.
- `WAHOO_PROVIDER_SYNC_DRAIN_INTERVAL_MS`: local scheduler interval; default 60 seconds.

The database scheduler calls `POST /api/internal/provider-sync/wahoo/drain` every minute. The process rejects overlapping drain requests with `202 already_running`, caps total claims to currently allocated process capacity, and renews leases while long provider operations remain active. An HTTP timeout does not cancel server execution. Do not immediately retry manually: leases prevent concurrent reclaims, and expired leases provide stale-lock recovery.

## Monitoring and response

Each job-family drain emits one aggregate `Provider sync drain completed` event with **ending** queue depth, ending oldest due-job age, total attempts, duration, completion/failure/dead-letter counts, ending dead-letter depth, and stale leases recovered. Events intentionally omit job, profile, integration, receipt, resource, lane, and provider-account IDs.

Alert when queue age grows across three scheduler intervals, dead-letter depth increases, or stale-lock recovery repeats. First check scheduler HTTP status and runtime availability, then provider rate-limit/error health. Reduce concurrency when provider throttling rises; increase it gradually only when queue age grows without throttling. Keep the claim limit large enough to feed configured concurrency but small enough to finish within the lease.

For dead letters, inspect the authenticated internal diagnostics surface, correct the underlying payload/provider issue, and use its retry action. Never edit attempts, lock fields, or status directly. A retry resets the existing job; it must not enqueue a second side effect.

## Local verification

Run one authenticated drain with `pnpm dev:wahoo-drain:once`, or run the direct worker with `pnpm dev:wahoo-drain:direct`. Confirm aggregate telemetry and that a second drain does not repeat completed provider effects. Do not paste bearer tokens, raw payloads, or record identifiers into tickets or logs.
