# Production workload and load testing plan

This plan is intentionally tool-agnostic and dependency-free. It documents the first production-readiness workload pass without adding k6, Artillery, or other runner dependencies to the workspace. Use existing smoke/performance coverage to prove user journeys, then run controlled HTTP load from an external runner against a staging or production-like environment.

## Existing coverage to reuse

- Web E2E: `pnpm --filter web test:e2e` runs Playwright specs in `apps/web/e2e/specs/` for auth and smoke coverage.
- Mobile E2E: `pnpm --filter mobile test:e2e` runs Maestro flows under `apps/mobile/.maestro/flows/main`.
- Mobile performance budgets: start the app with `pnpm --filter mobile dev:e2e:perf`, then run `pnpm --filter mobile test:e2e:perf`. The performance flow currently covers tab navigation budgets via `apps/mobile/.maestro/flows/performance/tab_navigation_budgets.yaml`.
- API performance unit/integration coverage exists in `packages/api/src/test/performance.ts` and `packages/api/src/routers/__tests__/endpoint-performance.test.ts`; treat these as contract/per-request regression checks, not production load tests.

## Environment requirements

Run load tests only against an approved target with production-like data shape, rate limits, storage, webhook secrets, and OAuth callback configuration. Do not run destructive or high-volume tests against production without a maintenance window and rollback owner.

Minimum target information:

- Public app origin and API origin.
- Dedicated load-test user accounts and OAuth provider sandbox/test applications.
- Service-role or admin fixture setup path for creating users, followers, activities, routes, and provider links before the run.
- Wahoo webhook token and callback URL for the approved target.
- Upload storage quota and max file size policy for FIT/GPX files.
- Observability dashboard links for app errors, p95/p99 latency, database CPU/connections, queue/backlog depth, storage failures, webhook failure rate, and auth/email delivery.

## Workload model

Start with three profiles and scale only after SLOs are stable:

| Profile | Purpose | Suggested duration |
| --- | --- | --- |
| Smoke load | Verifies scripts and fixtures safely. | 5-10 minutes |
| Expected peak | Simulates near-term peak launch traffic. | 30-60 minutes |
| Stress/soak | Finds saturation point or long-tail leaks. | 2-4 hours for stress, 8+ hours for soak when approved |

Do not begin stress/soak until smoke load passes without elevated 5xx, webhook failures, auth lockouts, or runaway database/storage cost.

## Critical scenarios

### 1. Auth and session lifecycle

- Sign in existing users, refresh active sessions, sign out, and request passwordless/email flows if enabled.
- Exercise web and mobile redirect paths separately.
- Metrics: auth success rate, p95/p99 sign-in latency, session refresh error rate, email delivery latency, lockout/rate-limit counts.

### 2. Feed and social graph

- Load home/feed views, profile views, activity detail, likes, comments, follows, messages/notifications inbox views, and read-all notifications.
- Use fixture users with realistic follower counts and mixed public/private content.
- Metrics: feed query p95/p99, database rows scanned, cache hit rate if available, mutation latency, notification fanout lag, realtime/subscription errors.

### 3. Activity file upload and processing

- Upload representative FIT/GPX files from web and mobile routes, including small, normal, and max-policy files.
- Validate async processing, storage write/read behavior, duplicate upload handling, and user-visible result availability.
- Metrics: upload success rate, upload p95/p99, processing queue latency, storage errors, parser failures, memory/CPU spikes, time to activity-visible.

### 4. Trends, charts, and training-load views

- Open dashboard/trends, activity detail charts, plan projections, training preferences, and load-related views for users with sparse, normal, and high-volume histories.
- Metrics: chart/data endpoint p95/p99, expensive-query count, database CPU, payload size, client render/performance beacons where available.

### 5. OAuth callback and provider sync

- Use sandbox OAuth applications where possible to connect/disconnect providers and complete `/api/integrations/callback/<provider>` flows.
- Include failed callback states: missing code, invalid state, expired state, duplicate callback, provider error response.
- Metrics: callback success/error rate by provider, token persistence failures, retry count, redirect latency, provider API throttling.

### 6. Wahoo webhook ingestion

- Replay valid Wahoo webhook payloads to `/api/webhooks/wahoo` using the approved webhook token.
- Include duplicate events, bursts, invalid signatures/tokens, missing user/provider mapping, and provider-sync drain behavior.
- Metrics: accepted/rejected counts, p95/p99 ingestion latency, idempotency hit rate, queue/drain backlog, provider API errors, dead-letter/manual-retry count.

### 7. Mobile startup sync

- Measure cold launch, warm relaunch, authenticated home readiness, tab navigation, offline-to-online recovery, and startup with large cached account data.
- Reuse Maestro performance beacons first; use a release/preview-style build for final gates because dev-client mode adds overhead.
- Metrics: cold start to interactive, authenticated home ready, startup sync p95/p99, runtime errors, memory growth, failed query retries.

## Metrics and release gates

Define exact SLOs before the first official run. Until product SLOs are approved, capture at minimum:

- HTTP request rate, p50/p95/p99 latency, 4xx/5xx rate, and timeout rate by route/procedure.
- Database CPU, memory, active connections, slow queries, lock waits, and connection pool saturation.
- Storage upload/read error rate and p95/p99 upload time.
- Background processing queue depth, oldest job age, retry count, and failure count.
- Auth/email provider success rate, rate-limit counts, and callback errors.
- Mobile perf beacons for launch and navigation budgets.
- Cost indicators: database/storage egress, provider API quota consumption, and error-reporting volume.

Suggested go/no-go defaults for the first production-readiness run:

- No sustained 5xx rate above 1% for critical paths.
- No unbounded queue growth after load stops.
- No data loss, duplicate side effects, or broken auth/session recovery.
- p95 latency remains inside the agreed user-facing SLO for auth, feed, upload, trends, callbacks, and webhook ingestion.

## Dependency-free runner skeleton

If a no-dependency local probe is needed before adopting a dedicated load runner, use a small shell loop from outside the app host. Keep concurrency low and avoid authenticated mutations unless fixture accounts and cleanup are approved.

```bash
TARGET_ORIGIN="https://staging.example.com"
for i in $(seq 1 100); do
  curl --fail --silent --show-error "$TARGET_ORIGIN/" >/dev/null &
  if [ $((i % 10)) -eq 0 ]; then wait; fi
done
wait
```

For real workload testing, prefer an external runner with explicit concurrency, arrival rate, thresholds, structured metrics export, and secret handling. Add that tool only after selecting k6, Artillery, or a hosted load-testing provider and accepting the lockfile/CI impact.

## Reporting template

Each run should produce a short report with:

- Target environment, commit SHA, data fixture version, runner location, date/time, and approver.
- Scenario mix, duration, peak concurrency/arrival rate, and total requests/events/uploads.
- Pass/fail summary against SLOs and go/no-go gates.
- Top bottlenecks with dashboard links and representative request IDs.
- Follow-up work items for fixes, missing instrumentation, data-fixture gaps, or safer runner automation.
