# Plan

## Phase 1 - Reproduce And Triage

1. Run `pnpm run test:e2e` through a delegated worker.
2. If it fails, collect the narrowest useful logs and Maestro artifacts.
3. Identify whether the primary blocker is orchestration, app runtime, seeded data, or Maestro selector/flow drift.

Exit criteria:

- One concrete failing boundary is identified with evidence.

## Phase 2 - Targeted Fix

1. Delegate the smallest code or flow change that can address the identified blocker.
2. Keep changes focused on scripts, selectors, flow steps, or app runtime behavior that the smoke path actually depends on.
3. Avoid expanding smoke coverage while stabilizing it.

Exit criteria:

- The identified blocker is fixed or reduced to a smaller verified blocker.

## Phase 3 - Verify And Iterate

1. Re-run `pnpm run test:e2e` after each fix.
2. If a new blocker appears, repeat triage and targeted repair.
3. Stop only when the suite passes or when an external blocker prevents safe continuation.

Exit criteria:

- Local `pnpm run test:e2e` passes, or a truthful blocker and next action are recorded.
