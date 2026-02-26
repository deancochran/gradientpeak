# Tasks - Phase 2 Data Integrity & Metrics Engine

Last Updated: 2026-02-26
Status: Active
Owner: Mobile + Core + Backend + QA

Implements `./design.md` and `./plan.md`.

## Phase A - Bluetooth Characteristic Parsing Audit & Fix

- [ ] Inventory all parsed workout Bluetooth characteristics and owning files.
- [ ] Build characteristic-to-spec audit matrix (UUID, flags, fields, units, widths).
- [ ] Verify and correct CSC Measurement cadence derivation from deltas.
- [ ] Verify and correct Cycling Power Measurement flag/offset parsing.
- [ ] Verify and correct Heart Rate Measurement width parsing (8-bit vs 16-bit).
- [ ] Verify and correct FTMS Indoor Bike Data flag-dependent parsing.
- [ ] Verify FTMS control/status parse and command-state handling.
- [ ] Add parser tests for all corrected characteristics and edge cases.
- [ ] Add developer debug mode logging raw hex payload + parsed output.

## Phase B - Training Metrics Engine

- [ ] Audit existing TRIMP/ACWR/Monotony compute points and storage writes.
- [ ] Define canonical metrics computation path at activity completion.
- [ ] Ensure TRIMP is always computed and persisted for completed activities.
- [ ] Implement and validate HR-quality gate + power-based TRIMP fallback.
- [ ] Standardize ACWR rolling-window computation (acute 7d, chronic 28d baseline).
- [ ] Standardize Training Monotony rolling-window computation.
- [ ] Implement sparse-history Bayesian priors by sport + ability level.
- [ ] Implement posterior updates and expose estimate uncertainty internally.
- [ ] Add tests for sparse-history transitions and convergence behavior.

## Validation - End-to-End

- [ ] Validate cadence, HR, and power against reference app/head unit on same ride.
- [ ] Validate persisted parsed metrics match validated live values.
- [ ] Validate ACWR/Monotony outputs for users with >= 28 days of history.
- [ ] Validate Bayesian estimates for users with < 28 days of history.
- [ ] Validate no divide-by-zero or undefined metrics in edge cases.

## Quality Gates

- [ ] `pnpm --filter mobile test`
- [ ] `pnpm --filter mobile check-types`
- [ ] `pnpm --filter @repo/core test`
- [ ] `pnpm --filter @repo/core check-types`
- [ ] `pnpm check-types`
- [ ] `pnpm lint`

## Definition of Done

- [ ] Phase 2 acceptance criteria in `design.md` are satisfied.
- [ ] Parser audit matrix is complete and linked to implementation files.
- [ ] Metrics engine behavior is test-covered for full-history and sparse-history users.
