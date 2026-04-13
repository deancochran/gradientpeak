# tRPC Runtime Regression Hardening

## Goal

Catch the class of regressions that currently survive unit tests and shallow mobile smoke coverage, especially:

1. schema and migration drift that only fails when a real query reaches Postgres
2. mobile tRPC client failures that only appear after sign-in and tab navigation
3. raw backend failures that leak through as runtime tRPC errors instead of being caught earlier

This improvement should catch the two issues already observed:

1. `routes.list` failing at runtime because repo schema and applied migrations drifted
2. `events.list` timing out or aborting during signed-in mobile tab usage without any current test surfacing it

It should also raise confidence against similar failures across other routers and screens.

## Current Failures And Why They Escaped

### 1. Router unit tests mock the database boundary

Current router tests validate procedure logic, input validation, and result shaping, but they do not execute queries against a migrated database.

Example:

1. `packages/api/src/routers/__tests__/routes.test.ts` stubs `db.select(...).from(...).where(...).orderBy(...).limit(...)`
2. the test never validates that the generated query is compatible with the actual migrated schema
3. missing columns such as `activity_routes.is_public` can therefore pass tests and fail only at runtime

### 2. Mobile screen tests mock the tRPC hooks

Current mobile Jest coverage replaces `@/lib/api` with mocked `useQuery` and `useInfiniteQuery` results.

That means those tests do not exercise:

1. the real `httpBatchLink`
2. mobile request timeout and abort behavior in `apps/mobile/lib/api.ts`
3. tRPC batching under real screen mount patterns
4. the backend under realistic signed-in navigation

### 3. PR mobile E2E smoke is too shallow for data regressions

`validate.yml` does run mobile E2E on runtime-related changes, but the current smoke flows mainly confirm route entry and visible chrome.

Examples:

1. `apps/mobile/.maestro/flows/main/tabs_smoke.yaml` opens tabs but does not prove that data-bearing subviews finished loading successfully
2. `open_discover_tab.yaml` waits for a tab label, not for routes or search results to load
3. `open_calendar_tab.yaml` waits for controls to appear, not for event data to resolve without runtime errors

This leaves a gap where a screen can mount, show basic structure, and still emit tRPC failures in the background.

### 4. There is no schema-to-migration drift gate

The repo currently allows `packages/db/src/schema/**` to drift from the SQL migrations that local CI databases actually apply.

That creates the exact failure seen in `routes.list`:

1. TypeScript schema expects a column
2. migration history does not create it
3. local mocked tests still pass
4. runtime query fails against a real database

## Desired Outcome

The validation stack should fail before merge when any of the following is true:

1. a Drizzle table definition has changed without a matching migration
2. a critical signed-in mobile flow emits an unexpected runtime tRPC error while opening tabs or data screens
3. a seeded end-to-end screen path issues a real query that fails against the migrated local database

## Design Principles

1. keep the existing unit and component tests; do not replace them
2. add the smallest higher-fidelity checks that cover the current blind spots
3. make runtime failures visible in CI with actionable output
4. distinguish expected navigation cancellations from genuine timeouts and backend failures
5. prefer one shared guardrail per failure class over many one-off tests

## Recommended Design

### Layer 1: Schema Drift Gate In CI

Add a dedicated validation step that proves the checked-in migrations fully realize the checked-in Drizzle schema.

Recommended behavior:

1. start the local Supabase/Postgres stack in CI
2. reset the database using repo migrations only
3. compare the migrated database to `packages/db/src/schema/**`
4. fail if the diff is non-empty or if generated pull output would change tracked schema artifacts

Implementation options:

1. preferred: add a script under `packages/db/scripts/**` that runs a deterministic schema parity check and exits non-zero on drift
2. acceptable: use `pnpm --filter @repo/db db:diff` in a machine-checkable way if its output is stable enough for CI

Success criteria:

1. adding `is_public` to `activity_routes` without a migration fails CI immediately
2. the failure points to schema drift, not to a later opaque runtime stack trace

### Layer 2: Runtime Error Sentinel For Mobile E2E

Add an E2E-only runtime error collector in the mobile app so Maestro can fail when a signed-in journey logs unexpected runtime problems.

The collector should record:

1. unexpected `console.error` events
2. unhandled promise rejections
3. tRPC client errors surfaced through the mobile transport or query layer
4. optionally, React Query observer errors that do not crash the screen

The collector should expose:

1. a reset action at app start or before each flow
2. a test-visible status surface, such as a hidden debug panel or testID-driven text node
3. a summary of captured errors with procedure name and message when available

Error classification rules:

1. user-driven unmount cancellation should not fail the suite
2. timeout-driven aborts should fail the suite
3. raw backend failures such as `Failed query:` should fail the suite
4. unknown tRPC client errors should fail the suite by default

Why this matters:

1. it catches the `events.list` abort class when the screen still renders enough UI to fool a shallow smoke test
2. it turns background runtime noise into a deterministic CI signal

### Layer 3: Replace Chrome-Only Smoke With Data-Bearing Signed-In Smoke

Expand PR mobile smoke from simple tab entry to seeded journeys that require real reads to complete.

The minimum signed-in regression lane should cover:

1. sign in with a seeded verified user
2. open Plan and wait for a real data-bearing selector that depends on successful queries
3. open Calendar and wait for an event-backed selector or a deterministic seeded empty state
4. open Discover, switch to Routes, and assert a real route result or deterministic seeded empty state
5. open the Routes library screen and assert the list or empty state after the query settles
6. assert the runtime error sentinel is still empty after the lane

Important requirement:

These flows must rely on local seeded data that exercises the relevant queries, not only on empty chrome.

That means the E2E seed setup should include at least:

1. one verified user used by Maestro login
2. at least one event in the calendar query window
3. at least one route owned by that profile
4. optional discover-visible route data if discover route coverage should prove non-empty rendering

This change would have caught the current `routes.list` issue because the flow would execute the real query against the migrated local database and fail before merge.

### Layer 4: Critical Router Live-DB Smoke

Add a small set of API integration tests that run critical routers against a real migrated local database instead of a mocked `db` object.

Scope should stay narrow. This is not a full router integration rewrite.

Start with procedures that are both common and schema-sensitive:

1. `routes.list`
2. `routes.get`
3. `events.list`
4. one or two additional heavily used signed-in reads

Each test should:

1. boot a test database from local migrations
2. seed the minimum rows needed for the procedure
3. call the real router through its caller
4. assert success shape and absence of raw SQL leakage

Why this layer is still useful even with Maestro:

1. it gives faster, more local feedback than full mobile E2E
2. it catches backend-only regressions without requiring emulator setup
3. it gives sharper failure localization than a UI journey

## Options Considered

### Option A: Add more mocked unit tests only

Reject.

This does not solve the root blind spots because mocked DB and mocked hook tests still cannot observe live schema drift or mobile transport behavior.

### Option B: Rely only on broader Maestro coverage

Reject as the only solution.

This would catch more runtime failures, but it would still surface schema drift too late and with slower feedback than a direct schema parity gate.

### Option C: Combine schema parity, runtime sentinel, and a stronger signed-in smoke lane

Recommend.

This is the smallest layered solution that catches both known failures and improves coverage for adjacent ones.

## Proposed CI Ownership

### Validate workflow

Add or update jobs so PR validation includes:

1. schema parity check when `packages/db/**`, `packages/api/**`, or other schema-owning files change
2. existing unit and Jest coverage
3. mobile E2E signed-in smoke with runtime error sentinel checks when mobile runtime paths change

### Full mobile regression workflow

Keep the broader nightly matrix, but make the new signed-in tRPC/runtime lane one of the required fast lanes as well, not just a nightly-only concern.

## Required Fixtures And Seed Strategy

The local E2E seed path must become intentional about data-bearing reads.

Required seed fixtures:

1. verified standard user
2. route owned by the standard user
3. calendar-visible event for the standard user
4. any supporting profile rows needed for the above reads

Fixture guidance:

1. keep seeds minimal and deterministic
2. prefer one shared seed function for the signed-in smoke lane
3. avoid relying on production-like large datasets

## Reporting And Failure Output

When the new checks fail, the output should be explicit:

### Schema parity failure

Report:

1. which schema artifact drifted
2. whether a migration is missing or stale
3. the relevant command to reproduce locally

### Mobile runtime sentinel failure

Report:

1. procedure name if known, such as `events.list` or `routes.list`
2. normalized error type such as `timeout_abort`, `server_query_failure`, or `unexpected_client_error`
3. first captured message and flow name

## Implementation Plan

### Phase 1: Schema drift protection

1. add a deterministic schema parity script under `packages/db`
2. add a `package.json` script for it
3. run it in `validate.yml`

### Phase 2: Mobile runtime sentinel

1. add an E2E-only runtime error collector in mobile
2. classify aborts vs true failures in one place
3. expose a test-visible assertion surface

### Phase 3: Stronger PR mobile smoke lane

1. seed one route and one event for the standard E2E user
2. expand the signed-in smoke flow to visit data-bearing screens
3. assert the runtime sentinel remains clear at the end of the flow

### Phase 4: Narrow live-DB router smoke tests

1. create a small integration suite for `routes.list` and `events.list`
2. run it in the API test job or a dedicated backend integration job

## Acceptance Criteria

This work is complete when all of the following are true:

1. introducing a Drizzle schema change without a migration fails CI before merge
2. a background mobile tRPC failure during sign-in-plus-tab smoke fails CI with an actionable error summary
3. PR mobile smoke proves at least one real event read and one real route read after sign-in
4. `routes.list`-style schema mismatches and `events.list`-style timeout regressions both have a direct automated detection path
5. the new checks are documented and reproducible locally

## Non-Goals

This spec does not require:

1. converting all router tests to real-database integration tests
2. adding full E2E coverage for every mobile screen in the first pass
3. failing on every abort unconditionally, since some navigation cancellations are expected

## Recommended First Slice

If this is implemented incrementally, the first slice should be:

1. schema parity gate
2. seeded signed-in mobile smoke that opens Plan, Calendar, Discover Routes, and Routes library
3. runtime error sentinel with timeout-vs-cancel classification

That first slice is enough to catch both failures already observed while establishing a pattern that can be extended to other routers and screens.

## First-Slice Implementation Tasks

1. add `packages/db` schema parity script and expose it as a package script
2. add a PR validation job that starts local Supabase, applies migrations, and runs the schema parity script
3. add an E2E-only mobile runtime error collector with a test-visible status surface
4. classify `TRPCClientError: Aborted` by elapsed time so near-timeout aborts fail while fast unmount cancels do not
5. seed one deterministic route and one deterministic calendar event for `test@example.com`
6. export deterministic seed IDs into Maestro fixture env so flows can assert exact records
7. strengthen `tabs_smoke.yaml` to assert the seeded calendar event and discover route load after sign-in
8. strengthen the routes journey to assert the seeded route item instead of generic list chrome
9. add focused unit coverage for runtime error classification logic
