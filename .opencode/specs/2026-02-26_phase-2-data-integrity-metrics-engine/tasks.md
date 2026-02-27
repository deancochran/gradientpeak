# Tasks - Phase 2 Data Integrity & Metrics Engine (MVP)

Last Updated: 2026-02-26
Status: Active
Owner: Mobile + Core + Backend + QA

Implements `./design.md` and `./plan.md`.

## 0) Readiness and Scope Lock

- [ ] Confirm MVP scope excludes Bayesian and uncertainty propagation.
- [ ] Confirm sparse-history statuses and thresholds (`<7`, `7-27`, `>=28`).
- [ ] Confirm TRIMP fallback policy (`power_proxy`) when HR quality fails.
- [ ] Confirm canonical ownership: formulas in `@repo/core`, orchestration in `@repo/trpc`.
- [ ] Lock exact HR quality threshold used for TRIMP source selection.
- [ ] Lock exact `power_proxy` fallback formula and required inputs.
- [ ] Lock canonical daily-load series semantics (timezone/day boundary, inclusion rules, missing day handling).
- [ ] Lock `MetricValueEnvelope` fields (including optional `source` and `reasonCode`) for endpoint contracts.

## 1) Parser Inventory and Audit Matrix

- [ ] Enumerate all currently parsed GATT characteristics in mobile recorder paths.
- [ ] Build audit matrix with UUID, flags, field widths, endianness, units, optional-field layout.
- [ ] Link each matrix row to source file and parsing function.
- [ ] Mark current risk level per parser (`low`, `medium`, `high`).

## 2) Bluetooth Parser Corrections (Mobile)

- [ ] Extract parser logic into pure helpers (canonical in `@repo/core`) before mobile call-site rewiring.

### CSC Measurement

- [ ] Implement cadence as delta crank rev / delta event time only.
- [ ] Implement wrap-around-safe unsigned deltas for counters/timestamps.
- [ ] Ensure wheel-block offsets are consumed before crank parse when present.
- [ ] Prevent emitting cumulative counters as instantaneous cadence.

### Cycling Power Measurement

- [ ] Ensure flag-driven parse path with dynamic offsets.
- [ ] Validate mandatory instantaneous power parse and scaling.
- [ ] Handle truncated payloads safely without crashes.

### Heart Rate Measurement

- [ ] Verify 8-bit/16-bit HR width handling by flags.
- [ ] Ensure optional field paths do not corrupt base HR parsing.
- [ ] Apply plausibility guardrails for impossible HR values.

### FTMS Indoor Bike Data

- [ ] Ensure flag-driven parse path with dynamic offsets.
- [ ] Validate speed/cadence/power field scaling and presence rules.
- [ ] Handle payload truncation and optional-field absence safely.

### FTMS Control and Status

- [ ] Validate response opcode matches request opcode in control-point responses.
- [ ] Validate result codes and failure handling paths.
- [ ] Ensure single in-flight command behavior is preserved.

## 3) Parser Debug Observability

- [ ] Add dev-mode toggle for parser debug logs.
- [ ] Log raw payload in hex + parsed output for each relevant notification.
- [ ] Ensure debug logs are disabled in normal production runtime.

## 4) Core Metrics Module (`@repo/core`)

- [ ] Create `packages/core/calculations/workload.ts`.
- [ ] Implement `computeTrimp` with HR-primary path.
- [ ] Implement `computeTrimp` fallback (`power_proxy`) path.
- [ ] Implement `computeAcwr` (7d acute / 28d chronic with denominator guard).
- [ ] Implement `computeMonotony` (7d mean/stddev with zero-variance guard).
- [ ] Implement shared sparse-history status helper.
- [ ] Export workload functions from `packages/core/calculations/index.ts`.

## 5) Backend Wiring (`@repo/trpc`)

- [ ] Wire canonical workload calculations into ingestion path.
- [ ] Persist TRIMP for completed activities when inputs exist.
- [ ] Return ACWR and Monotony envelopes from read endpoints.
- [ ] Include status metadata (`insufficient_history`, `provisional`, `stable`).
- [ ] Ensure failures in metric computation do not block activity persistence.
- [ ] Add idempotency guard/test for duplicate ingestion and daily-load integrity.

## 6) Naming and Mapping Consistency

- [ ] Audit metric naming across mobile payload, API schema, and DB fields.
- [ ] Add/adjust adapter mapping to normalize naming mismatches.
- [ ] Add tests that verify mapping correctness end-to-end.

## 7) Data Schema and Types (If Needed)

- [ ] Determine whether migration is required for TRIMP persistence.
- [ ] Update `packages/supabase/schemas/init.sql` first.
- [ ] Run `supabase db diff` to generate migration from schema changes.
- [ ] Run `supabase migration up` to apply migration.
- [ ] Run `pnpm --filter @repo/supabase run update-types` after migration is applied.
- [ ] Verify all three generated type/schema outputs are updated by `pnpm --filter @repo/supabase run update-types`.
- [ ] Validate no type drift in routers and shared schemas.

## 8) Unit Tests - Parser Layer

- [ ] Add fixture-based tests for CSC flag combinations and offset paths.
- [ ] Add CSC wrap-around tests for event time and counters.
- [ ] Add Cycling Power flag/optional-field branch tests.
- [ ] Add Heart Rate width and optional-field tests.
- [ ] Add FTMS flag branch tests for common payload patterns.
- [ ] Add malformed/truncated payload safety tests (no throws).

## 9) Unit Tests - Metrics Layer

- [ ] TRIMP HR-valid test cases.
- [ ] TRIMP fallback test cases.
- [ ] TRIMP source-selection threshold boundary tests.
- [ ] ACWR boundary tests for exact 7-day and 28-day windows.
- [ ] ACWR day-boundary/timezone semantics tests from locked contract.
- [ ] Monotony zero-variance guard test.
- [ ] Sparse-history transition tests across threshold boundaries.
- [ ] NaN/Infinity safety tests for all workload outputs.

## 10) Integration and E2E Validation

- [ ] Verify ingestion persists expected metric fields.
- [ ] Verify endpoint responses include status envelope fields.
- [ ] Run controlled ride validation against reference device/app.
- [ ] Confirm cadence/power/HR traces are physiologically plausible.
- [ ] Confirm persisted values align with validated session traces.

## 11) Quality Gates

- [ ] `pnpm --filter mobile test`
- [ ] `pnpm --filter mobile check-types`
- [ ] `pnpm --filter @repo/core test`
- [ ] `pnpm --filter @repo/core check-types`
- [ ] `pnpm --filter @repo/trpc test`
- [ ] `pnpm --filter @repo/trpc check-types`
- [ ] `pnpm check-types`
- [ ] `pnpm lint`

## 12) Completion Criteria

- [ ] All checklist items in sections 0-11 are complete.
- [ ] `design.md` acceptance criteria are satisfied.
- [ ] `plan.md` architecture and contract decisions are reflected in code.
- [ ] Known post-MVP items remain deferred and documented.

## Post-MVP Backlog (Deferred)

- [ ] Bayesian priors/posteriors for sparse-history estimates.
- [ ] Uncertainty propagation for readiness/recommendation weighting.
- [ ] Performance snapshot caching if endpoint compute latency requires it.
