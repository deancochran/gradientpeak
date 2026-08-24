# Maestro flows

Use Maestro against an already-running Expo dev-client server by default.

## Local loop

```bash
pnpm run dev:e2e
pnpm --filter mobile android:dev
pnpm --filter mobile android:launch
pnpm --filter mobile test:e2e
```

To reuse your normal development server instead, leave that server running and set the label Maestro should tap in Expo Dev Client when it differs from the Android emulator default:

```bash
EXPO_DEV_SERVER_LABEL="http://192.168.1.20:8081" pnpm --filter mobile test:e2e
```

When running the E2E stack on alternate ports, export the same values for both server and test
commands. Maestro derives its default Android server label and ADB reverse from `EXPO_PORT`:

```bash
PORT=3100 EXPO_PORT=8082 pnpm dev:e2e
PORT=3100 EXPO_PORT=8082 pnpm --filter mobile test:e2e
```

Run one smoke flow:

```bash
pnpm --filter mobile test:e2e:flow -- .maestro/flows/smoke/auth_navigation.yaml
```

Run performance budgets:

```bash
pnpm --filter mobile dev:e2e:perf
pnpm --filter mobile test:e2e:perf
```

Performance flows read app-side `perf-metric-*` beacons that are enabled only when `EXPO_PUBLIC_MAESTRO_E2E=1` or `EXPO_PUBLIC_PERF_TEST=1`. Prefer a preview/release-style build for final performance gates because React Native development mode adds runtime overhead.

## Expected runtime

- Metro/dev client should already be running. `pnpm --filter mobile test:e2e` does not start Expo.
- `pnpm --filter mobile dev:e2e` remains available for pipeline-style runs and uses the same `apps/mobile/.env.local` values as normal development.
- Maestro prepares the emulator, reverses local ports, and then runs against the existing dev client session.
- The default server row is `http://10.0.2.2:8081` on Android emulators. Override it with `EXPO_DEV_SERVER_LABEL` or `MAESTRO_EXPO_DEV_SERVER_LABEL` when reusing a LAN dev server.

## Smoke suite

`pnpm --filter mobile test:e2e` and `pnpm --filter mobile maestro:check` run only:

- `smoke/auth_navigation.yaml`: launch into signed-out authentication navigation.
- `smoke/plan_available.yaml`: authenticate with the standard fixture and open Plan.
- `smoke/record_lifecycle.yaml`: authenticate with the standard fixture, then start, pause,
  resume, and finish a recording.
- `smoke/ui_preview_contract.yaml`: deep-link to the development-only shared UI preview and
  exercise generated scenario selectors, tabs, selection controls, and form validation.

The smoke suite does not capture or require video evidence. It needs an already-running E2E-enabled
dev client and the standard authenticated fixture for the Plan and recorder flows. Every smoke flow
asserts `E2E_RUNTIME_ERRORS=0` before and after its maintained behavior. This beacon covers classified
query/mutation-cache and captured `console.error` messages; it is not a catch-all native crash signal.

`pnpm --filter mobile maestro:check` statically syntax-checks both maintained `flows/smoke/` and
`flows/reusable/` files; it does not prove that a flow executed on a device or execute reusable flows
as independent scenarios. `pnpm --filter mobile test:e2e` still executes only `flows/smoke/` and is
the explicit runtime verification gate. It requires a provisioned simulator/emulator or device plus
the running E2E dev server.

## Fixtures

Set the vars your flow needs before running Maestro:

- `STANDARD_USER_EMAIL` / `STANDARD_USER_PASS` for the authenticated smoke flows.

Copy `apps/mobile/.maestro/fixtures.env.example` to
`apps/mobile/.maestro/fixtures.env` and supply the stable standard account.

To regenerate that account safely, create a disposable user through the loopback E2E web app,
verify and complete only that user's local profile, then replace `STANDARD_USER_EMAIL` and
`STANDARD_USER_PASS` in the ignored `fixtures.env`. Use a unique local-only password, keep the file
mode `0600`, never reuse real credentials, and never reset or broadly delete shared fixture data.
Confirm the new account can sign in before running `pnpm --filter mobile maestro:fixtures:check`.

### Fixture contracts and fail-closed preflight

The flat `fixtures.env` names remain compatible with existing flows, but ownership is now compiled
into domain-readable contracts. Contract output declares the scenario ID and revision, actors,
required and secret variable names, owned records, preconditions, mutation scope, exact reset,
picker prerequisites, and supported/manual/intentional-red status. It never emits secret values.
The `properties.junitId` already present in each of the 194 primary variation files is its fixture
contract ID. The contract compiler also links each A/B pair to its source flow and creates a baseline
declaration for all 97 sources. Extra domain variations are declared as manual or intentional-red,
and the unsupported activity-efforts source stays explicitly unsupported rather than disappearing.

Run the local, dependency-free checks from `apps/mobile`:

```bash
node .maestro/fixture-tool.mjs validate
node --test .maestro/fixture-contracts/lib.test.mjs
node .maestro/fixture-tool.mjs inventory --domain routes
node .maestro/fixture-tool.mjs manifest --domain routes
node .maestro/fixture-tool.mjs summarize
```

The supported fixture-owned execution entry point is one command:

```bash
node .maestro/fixture-tool.mjs run \
  --flow flows/variations/by-source/routes/contracts-p1-route-delete-persists/variation-a.yaml \
  --suite primary-expected-pass \
  --env .maestro/fixtures.env
```

`run` generates a unique run ID and lease ID, validates the flow's lifecycle/suite classification and
fixture values, provisions through the loopback service, writes and re-reads a fresh READY receipt,
and only then starts Maestro. It runs one flow per ownership receipt. Exact reset is in the outer
Node runner's `finally` path, so it is still
attempted after syntax/startup/device/runtime failure. A service or provision failure occurs before
the app or Maestro starts and is reported as `BLOCKED`, not as a product failure. Do not compose the
separate `provision`, `preflight`, Maestro, and `reset` commands for supported runs; they remain
diagnostic protocol commands.

Omit `--run-id` for the safe default: a new validated ID is generated for every invocation. Supply a
lowercase 8-64 character `--run-id` only when CI retries must be correlated. Every retry still gets a
new lease ID; an older active lease with the same run ID must make the service reject the retry.

Before selecting a flow, validate its values and require a matching provision state:

```bash
node .maestro/fixture-tool.mjs preflight \
  --flow flows/variations/by-source/routes/contracts-p1-route-delete-persists/variation-a.yaml \
  --run-id ci-mobile-route-delete-01 \
  --lease-id lease-00000000-0000-4000-8000-000000000000 \
  --env .maestro/fixtures.env
```

Preflight rejects missing or blank required values, unknown names, invalid dates/UUIDs/host paths,
A/B collisions, invalid picker declarations, unsupported status, and stale or absent provisioning.
READY state must reference an existing READY receipt created in the last 15 minutes and match the
run ID, lease ID, fixture revision, and SHA-256 fingerprint of the selected flow plus all nested
lifecycle flows. Editing either invalidates the receipt. State, receipts, and test output use separate
run-ID/lease-ID paths, so simultaneous invocations cannot share local ownership.
No provision state is `BLOCKED`; it is not a product failure. `INTENTIONAL_RED` is a separate
classification from `EXPECTED_PASS`, and neither is runtime evidence.

Picker display-name variables describe files already visible to the device picker. When a matching
`<DISPLAY_NAME_VARIABLE>_HOST_PATH` is supplied, preflight also requires an existing absolute host
file whose basename matches the display name. Host validation cannot prove that the file was copied
to a device.

### Local provision/reset protocol

Provision and reset are executable clients, but they deliberately do not implement a fake data
store. They require a real fixture service that owns the local database/application fixture boundary.
Mutation fails closed unless both of these are set:

```bash
export MAESTRO_FIXTURE_ENABLE=1
export MAESTRO_FIXTURE_SERVICE_URL=http://127.0.0.1:43123/
node .maestro/fixture-tool.mjs provision --flow <flow> --env .maestro/fixtures.env
node .maestro/fixture-tool.mjs reset --flow <flow> --run-id <printed-run-id> --lease-id <printed-lease-id>
```

Only numeric plain-HTTP loopback origins (`127.0.0.1` or `::1`) are accepted. Hostnames such as
`localhost` are rejected to avoid name-resolution ambiguity. URLs with credentials, paths, query
strings, fragments, HTTPS, or non-local hosts are rejected. Requests use `redirect: error`, and every
response must expose the exact requested URL on the validated origin. The service must attest
`gradientpeak-maestro-fixtures/v2` and `environment: local`, then implement:

- `GET /v2/health`
- `POST /v2/scenarios/provision`: accept the contract ID/revision, run ID, unique lease ID, fixture
  instance, mutation scope, categorized ownership requirements, and reset contract. Reject a second
  active lease for the same contract/run ID. Return the exact run/lease/instance, `READY`, a complete
  categorized inventory with globally unique non-empty IDs, and an ownership token. Mutating
  scenarios must own at least one actor and record; empty inventories are valid only for contracts
  that declare no mutation and no owned records.
- `POST /v2/scenarios/reset`: accept that exact run ID, lease ID, fixture instance, ownership token,
  and provisioned inventory; return `CLEAN`, echo the matching ownership token, and return exactly the
  same categorized affected inventory.
  Extra, missing, duplicated, recategorized, or substituted IDs fail cleanup and cannot report CLEAN.

Contract requests contain no email/password values. State and receipts are written mode `0600`
under ignored `.maestro/artifacts/fixture-contracts/`. Receipts include run/lease identity, source
commit/base when Git can resolve them, flow/source/variation, fixture revision, non-secret
actor/record IDs, device/platform/app ID/scheme, and provisioning and cleanup disposition.
Non-runtime receipts say `runtime: NOT_RUN` and `isRuntimeProof: false`; only a matching Maestro
runtime receipt can prove device execution. `summarize --run-id <id>` counts PASSED/FAILED only from
receipts matching that run ID, lease, fixture revision, and fingerprint. No receipts are reported as
`UNKNOWN / NOT_RUN`, never as an observed zero-failure run.

There is currently no product-owned fixture service endpoint with exact per-scenario snapshot/reset
semantics. Until that boundary exists, `provision` produces a `BLOCKED` receipt rather than touching
the database directly or pretending static fixture declarations are provisioned records.

### App lifecycle contracts

App-local state, backend fixtures, and navigation are separate boundaries:

- `clean_app_launch_signed_out.yaml` first launches without clearing state to refuse a destructive
  reset while active recorder pause/resume controls are visible. It then uses `clearState: true`,
  handles only transient Expo/system UI conditionally, and requires `sign-in-screen` while proving
  the protected tab shell is absent.
- `authenticated_home.yaml` performs that clean launch, requires the sign-in form, signs in with no
  optional app-owned steps, resets navigation only, and requires `home-screen` with sign-in absent.
- `preserve_state_relaunch.yaml` is the only supported `clearState: false` primitive. Callers must
  pass `EXPECTED_BOUNDARY_ID`; the primitive waits for and asserts that hydrated boundary. The caller
  then asserts the feature-specific persisted result after reopening it.
- `require_signed_out.yaml` and `require_authenticated_home.yaml` are mandatory postconditions.
- `reset_navigation_to_home.yaml` only closes bounded navigation and selects Home. The retained
  `reset_to_home.yaml` filename is a compatibility wrapper and does not claim to clear data or cache.
- `handle_transient_system_ui.yaml` is the only conditional adaptation layer. Optional commands are
  forbidden elsewhere; app readiness and feature state always fail at the setup boundary.

All 194 primary A/B contracts compile a lifecycle policy and flow fingerprint. Policies are `clean`,
`authenticated-clean`, `preserve-session`, `persistence-relaunch`, `system-ui`, `hardware-manual`,
or `recording-safe`. Smoke flows also declare their policy in the header. Static validation rejects a
primary contract without policy metadata, a direct preserve-state launch outside the primitive, or
an optional app-owned command. It also compares every primary header's `properties.sourceIdentity`
to `variation-coverage.json` and checks argument declarations and supplied `runFlow.env` values for
every nested flow. Deliberately inherited runtime and standard-login globals are listed explicitly in
`fixture-contracts/policy.json`; other nested values must be declared and passed.

### Suite policies

Static classification is selection metadata, never a runtime result. The configs are deliberately
separate:

- `config.smoke-expected-pass.yaml`: maintained smoke tagged `smoke-expected-pass`.
- `config.primary-expected-pass.yaml`: primary variations excluding intentional-red, provider,
  document-picker, hardware, and manual boundaries.
- `config.intentional-red.yaml`: specifications expected to expose approved missing behavior.
- `config.provider-system-picker.yaml`: provider and document-picker prerequisites, excluding red or
  manual/hardware work.
- `config.hardware-manual.yaml`: explicitly tagged hardware/manual flows only.

The runner checks its selected scenario against exactly one execution class before provision and
passes matching include/exclude tags to Maestro. Maestro's comma-separated include tags are OR, not
AND; the configs use exclusion gates where intersection semantics are needed.

Each local fixture-owned invocation runs one flow and device. Separate invocations may coexist only
because each has a unique lease, fixture instance, state, receipt, and artifact path; the fixture
service must reject conflicting active leases for the same run. Maestro otherwise discovers flows
in non-deterministic order. `executionOrder` is
not used because official guidance says even ordered flows should remain isolated; dependent steps
belong in one nested flow. Maestro local shards or Cloud can run in parallel, but this runner refuses
to share ownership: parallel lanes require distinct leases, fixture instances, receipts, and devices.

## Manual and experimental flows

Flows outside `flows/smoke/` are retained only for manual or experimental investigation. They are
not part of the supported suite: many mutate data, depend on provider or seeded-resource fixtures,
or assert unstable presentation details. Run one explicitly with `test:e2e:flow`; do not treat its
result as smoke-suite coverage.

## Test-first capability contracts

`flows/contracts/` contains independently runnable device-flow specifications grouped by product
priority. These flows are deliberately separate from the maintained smoke suite. Some are expected
to fail until the approved mobile behavior exists; a failure at the named control or persisted
outcome is the specification doing its job, not permission to weaken the assertion.

Contract flows require the deterministic records documented in `fixtures.env.example`. Destructive
flows use separate disposable records so they remain order-independent. Load the fixture file and
run one flow explicitly, for example:

```bash
MAESTRO_ENV_FILE=.maestro/fixtures.env pnpm --filter mobile test:e2e:flow -- \
  .maestro/flows/contracts/p0/record_route_retained_on_activity.yaml
```

The contract suite is not included in `test:e2e` or `maestro:check`, and has not been reclassified as
maintained while approved product controls are still missing. Standard contract flows do not cover
BLE, FTMS, or live GPS behavior. File-upload flows additionally require the named fixture file in the
device document picker; Android share-handoff coverage requires an installed share target.

Dedicated by-source A/B variations are fixture-isolated specifications, not self-cleaning flows.
Before every individual run, the fixture provisioner must restore the named account and disposable
records to the state described beside their variables. Variables with `_A` and `_B` suffixes must
resolve to different accounts, records, provider states, or picker files. Maestro does not perform
database cleanup, reset a provider's fail-once state, or restore deleted records; a runner that cannot
restore the declared fixture state must not report the variation as repeatable.

## Official Maestro guidance applied

- [Nested flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows.md)
  recommends small, atomic reusable flows and passes scoped values through `runFlow.env`. Existing
  `flows/reusable/` remains the UI composition boundary; fixture persistence stays outside UI flows.
- [Hooks](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks.md) defines
  `onFlowStart` and `onFlowComplete`; completion still runs when start fails, and a cleanup failure
  fails the flow. App-state setup is kept in atomic nested flows instead of recursive workspace
  hooks. Backend reset stays in the outer Node runner because hooks cannot clean up when Maestro
  itself never starts. No lifecycle subflow invokes a top-level flow, so hook recursion is impossible.
- [`launchApp`](https://docs.maestro.dev/reference/commands-available/launchapp.md) stops/restarts the
  app by default; `clearState` is opt-in and `stopApp: false` only foregrounds. Supported flows make
  destructive versus preserving launches explicit through the lifecycle primitives.
- [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions.md) recommends
  bounded `runFlow.when` branches and warns against unstable conditional state. Conditions here are
  limited to transient Expo/system chrome; app-owned boundaries are mandatory assertions.
- [Labeling and error handling](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/labeling-and-error-handling.md)
  says commands fail fast by default and `optional: true` continues with a warning. Lifecycle static
  checks therefore reserve optional handling for transient system/Expo UI only.
- [Parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants.md)
  distinguishes external `-e` parameters from flow `env` constants; values are case-sensitive and
  CLI values are strings. Secrets therefore stay in ignored external env files rather than headers.
- [JavaScript HTTP](https://docs.maestro.dev/maestro-flows/javascript/make-http-requests.md) supports
  GET/POST/PUT/DELETE and generic requests, and
  [the global output object](https://docs.maestro.dev/maestro-flows/javascript/manage-data-and-states.md)
  can pass namespaced response data through one flow. The Node preflight client is used here because
  it can enforce target safety and durable receipts before Maestro starts; in-flow HTTP is deferred
  until the real fixture endpoint exists.
- [Project configuration](https://docs.maestro.dev/maestro-flows/workspace-management/project-configuration.md)
  and [test discovery/tags](https://docs.maestro.dev/maestro-flows/workspace-management/test-discovery-and-tags.md)
  say nested discovery must be explicit and tag filters use OR within include/exclude groups. The
  workspace config discovers only smoke by default and excludes `intentional-red`; variation runs
  remain explicit.
- [Sequential execution](https://docs.maestro.dev/maestro-flows/workspace-management/sequential-execution.md)
  says default order is non-deterministic, `executionOrder.continueOnFailure: false` stops a dependent
  sequence, and flows should still be independently reset. Fixture ownership therefore wraps one
  flow rather than relying on cross-flow order.
- [Maestro CLI options](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.md)
  exposes local `--shards`/shard splitting for multiple connected devices. Parallel execution is not
  enabled by this ownership runner until each lane has a distinct fixture instance and receipt.
- [Reports and artifacts](https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts.md)
  separates `testOutputDir` from CLI-only `--format/--output` reports. Fixture receipts are separate
  evidence and never substitute for Maestro's command/artifact manifest or JUnit/HTML report.
- [`clearState`](https://docs.maestro.dev/reference/commands-available/clearstate.md) clears app-local
  data (Android package data, iOS reinstall, or web origin data); it does not reset server records,
  provider fail-once state, notification state, or picker files.
- [Repository architecture](https://docs.maestro.dev/maestro-flows/workspace-management/design-your-test-architecture/repository-configuration.md)
  supports colocating flows with the app and organizing by journeys or features. Domain contracts
  preserve the current hybrid journey/feature structure while giving fixture state one owner.

## Notes

- `pnpm --filter mobile maestro:prepare` preps the emulator, opens the Expo dev client into the running dev server, and handles the Android-side port reverses before Maestro starts.
- Maintained smoke and reusable flows resolve `appId` from `MAESTRO_APP_ID` (default
  `com.deancochran.gradientpeak.dev`) and deep links from `MAESTRO_APP_SCHEME` (default
  `gradientpeak-dev`). Override both together for preview or production builds.
- Pipeline runners can set `MAESTRO_SKIP_PREPARE=1`, `MAESTRO_DEVICE_ID`, `MAESTRO_PLATFORM`, `EXPO_DEV_SERVER_LABEL`, `MAESTRO_APP_ID`, and `MAESTRO_APP_SCHEME` as needed.
- `apps/mobile/.maestro/flows/reusable/handle_transient_system_ui.yaml` is the single Expo/system
  adaptation flow. The old `expo_dev_client_setup.yaml` is a non-launching compatibility wrapper.
- `apps/mobile/.maestro/flows/reusable/reset_navigation_to_home.yaml` returns an authenticated app to
  Home and explicitly does not clear data, cache, auth, or backend fixtures.
- `pnpm --filter mobile maestro -- <flow>` is the underlying local Maestro runner. It keeps output under `apps/mobile/.maestro/`.
- `pnpm --filter mobile maestro:check` checks maintained smoke and reusable flow syntax without a
  connected device; `test:e2e` executes smoke flows only.
- `flows/reusable/login.yaml` requires the sign-in screen, performs every app-owned step mandatorily,
  and requires the authenticated tab shell afterward.

## Clean artifacts

```bash
pnpm --filter mobile test:e2e:clean
```
