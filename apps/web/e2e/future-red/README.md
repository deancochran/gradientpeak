# Future-red web journeys

This directory is an intentionally failing Playwright contract for the canonical mobile-to-web
journey inventory. It is a delegation surface for closing product behavior, fixture, and selector
gaps; it is not evidence that those journeys currently work.

## Isolation

- The normal `playwright.config.ts` collects only `e2e/specs` and does not collect this directory.
- `playwright.future-red.config.ts` collects only `e2e/future-red/specs/*.red.spec.ts`.
- Future-red artifacts stay under `test-results/future-red/`.
- Do not add `test.fail`, `test.skip`, unconditional failures, or weaken an observable assertion to
  make this suite green.

List the contract without starting the web server or a browser:

```sh
pnpm --filter web exec playwright test --config playwright.future-red.config.ts --list
```

Run one journey once its prerequisites are available:

```sh
pnpm --filter web exec playwright test --config playwright.future-red.config.ts \
  --grep '^.*routes\.edit:'
```

The local PostgreSQL/Supabase stack and actor-specific resources named in each test's
`future-red-prerequisites` annotation must be available for runtime execution. The suite uses one
worker because the existing fixture actors and mutable resources are shared.

## Contract shape

- `registry.ts` owns one blueprint per canonical journey ID.
- `registry-contract.ts` rejects missing, extra, duplicate, or malformed blueprints during test
  collection.
- `executors.ts` contains custom, observable browser flows for journeys whose required fixture lane
  already exists. Executor IDs are checked against the canonical inventory.
- `specs/journeys.red.spec.ts` registers exactly one test per blueprint and maps its actor to the
  existing locked fixture lifecycle.
- Captured-email sign-up/recovery journeys use the dedicated auth lane; messaging and notification
  journeys use the isolated three-actor messaging harness rather than a single shared page.
- `run-journey.ts` records prerequisites and acceptance criteria, navigates to the journey, and then
  runs a custom behavioral executor when one exists. Otherwise it executes the current observable
  checkpoints with soft assertions so one run can expose more than one missing boundary.

The acceptance annotations are implementation guidance, not runtime proof by themselves. Before a
journey is treated as complete, add a custom executor with concrete user actions and assertions for
persistence, authorization, failure/retry, and cleanup described by its acceptance criteria. A
journey must not be promoted merely because matching `data-testid` attributes were added. The
`future-red-execution` annotation distinguishes a behavioral executor from a checkpoint boundary.

## Delegation loop

1. Choose one journey ID and read its canonical inventory entry, blueprint prerequisites,
   checkpoints, acceptance criteria, and referenced normal E2E evidence.
2. Establish deterministic data, actor locks, external-boundary adapters, and cleanup before
   changing product behavior.
3. Expand the future-red test into executable user actions and observable outcomes before or with
   the implementation. Prefer roles and labels; use stable test IDs only where semantic selectors
   are ambiguous.
4. Implement the smallest product slice that satisfies the journey without bypassing access,
   persistence, error, or retry behavior.
5. Run the journey by ID, then its owning normal E2E spec and package checks. Keep unrelated
   future-red journeys red.
6. Update the canonical status/evidence only after a successful supported runtime run. Collection,
   typechecking, fixtures, annotations, or selectors alone are not runtime verification.

If the browser, local services, credentials, hardware profile, or fixture ownership is unavailable,
stop with the prerequisite named explicitly. Do not replace the missing boundary with a mock that
would overclaim browser or hardware parity.
