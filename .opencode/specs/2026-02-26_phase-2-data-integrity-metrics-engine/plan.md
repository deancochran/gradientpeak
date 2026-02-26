# Technical Implementation Plan - Phase 2 Data Integrity & Metrics Engine

Date: 2026-02-26
Status: Ready for implementation
Owner: Mobile + Core + Backend
Inputs: `design.md`

## 1) Implementation Intent

Deliver Phase 2 in two parallel workstreams:

1. Sensor parser audit and corrections.
2. Metrics computation hardening with practical sparse-history handling.

## 2) Guardrails

1. Do not ship parser changes without byte-level validation references.
2. Do not duplicate formulas across packages; keep one source of truth per metric.
3. Do not block metrics output for sparse-history users; use clear MVP provisional behavior.
4. Keep scope limited to correctness and compute layer (no UI refactor coupling).
5. Defer Bayesian inference to post-MVP.

## 3) Workstream A - Bluetooth Parser Audit

### A0 - Current-state inventory

- Identify all GATT notifications currently parsed during recording.
- Map each parser to source characteristic UUID and spec section.
- Record current field assumptions (offsets, widths, scale, endianness).

Deliverable:

- Parser inventory table with file references and risk levels.

### A1 - Spec-conformance corrections

- Fix CSC cadence derivation from cumulative counters and event times.
- Make Cycling Power parser flag-aware and optional-field safe.
- Make Heart Rate parser width-aware based on flags (8-bit/16-bit).
- Make FTMS Indoor Bike parser fully flag-driven with dynamic offsets.

Deliverable:

- Corrected parser implementations and focused tests per characteristic.

### A2 - Observability and regression diagnostics

- Add dev debug mode for raw hex payload + parsed field output.
- Add guardrails for timestamp wrap-around and missing previous samples.

Deliverable:

- Reproducible debug output for targeted recording sessions.

## 4) Workstream B - Metrics Engine

### B0 - Formula baseline and data path mapping

- Locate current TRIMP/ACWR/Monotony computations and storage writes.
- Define one canonical computation path from activity completion to persistence.

Deliverable:

- Canonical metrics flow diagram and ownership map.

### B1 - Metric computation implementation hardening

- Enforce TRIMP computation for each completed activity.
- Add HR-quality check and power-based fallback path.
- Standardize ACWR and Monotony rolling-window computations.
- Add protections for small sample sizes and zero variance denominator.
- Define and implement sparse-history MVP behavior (provisional/null-safe outputs).

Deliverable:

- Stable metric outputs across complete and partial histories.

### B2 - Post-MVP placeholder (Bayesian estimation)

- Not implemented in MVP.
- Document extension points only, no production dependency.

## 5) Execution Order

1. A0 and B0 in parallel.
2. A1 parser fixes.
3. B1 metric hardening.
4. A2 observability.
5. Document post-MVP extension points.
6. Controlled workout validation and test pass.

## 6) Test Strategy

### Parser tests

- Synthetic fixtures per characteristic with flag combinations and edge offsets.
- Counter/timestamp delta tests for CSC cadence.
- Width and conditional-field parsing tests for HR/Cycling Power/FTMS.

### Metrics tests

- TRIMP with and without valid HR input.
- ACWR/Monotony window boundary conditions.
- Sparse-history provisional behavior snapshots.
- Divide-by-zero and missing-data safety checks.

### Field validation

- Run a controlled ERG session and compare to head unit/reference app.
- Confirm persisted metrics and plotted trends are physiologically plausible.

## 7) Quality Gates

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
pnpm --filter @repo/core test
pnpm --filter @repo/core check-types
pnpm check-types
pnpm lint
```

## 8) Definition of Done

1. Parser outputs match spec and reference behavior.
2. TRIMP/ACWR/Monotony are consistently computed and stored.
3. Sparse-history behavior is explicit, safe, and test-covered.
4. Tests cover key parser branches and metrics edge cases.

## 9) Post-MVP Notes

- Bayesian priors/posteriors and uncertainty propagation are intentionally deferred.
- Revisit after MVP metrics are validated in production-like usage.
