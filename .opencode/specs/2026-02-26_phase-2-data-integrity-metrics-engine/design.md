# Phase 2 Specification - Data Integrity & Metrics Engine (MVP)

Date: 2026-02-26
Owner: Mobile + Core + Backend + QA
Status: Active
Type: Sensor correctness + workload metrics foundation

## Executive Summary

Phase 2 MVP ensures two outcomes:

1. Live workout sensor values are physically plausible and spec-correct.
2. Workload metrics are computed consistently from a single canonical logic layer.

This phase intentionally prioritizes correctness, deterministic behavior, and testability over advanced modeling.

## MVP Scope

### In Scope

- Bluetooth parsing correctness for currently used characteristics:
  - CSC Measurement
  - Cycling Power Measurement
  - Heart Rate Measurement
  - FTMS Indoor Bike Data
  - FTMS control point response/state handling
- Raw payload observability in dev/debug mode (hex payload + parsed result).
- Canonical metrics computation and persistence:
  - TRIMP (HR-based primary)
  - TRIMP fallback when HR quality is insufficient
  - ACWR (7-day acute / 28-day chronic)
  - Training Monotony (7-day mean / standard deviation)
- Sparse-history behavior without Bayesian modeling:
  - explicit status envelopes (`insufficient_history`, `provisional`, `stable`)
  - safe null/guard behavior instead of fabricated precision

### Out of Scope (Post-MVP)

- Bayesian priors/posteriors for workload metrics.
- Uncertainty propagation for downstream weighting engines.
- UI redesign/polish work from later phases.
- New recommendation or readiness model behavior beyond metrics inputs.

## Problem Statement

- Current cadence behavior indicates parsing defects (counter interpreted as instantaneous rate and/or offset issues).
- Flag-dependent characteristics are susceptible to incorrect fixed-offset parsing.
- Workload metrics are not yet centralized through one canonical compute path.
- Sparse-history users need clear outputs that do not imply false confidence.

## Architecture Decisions

1. BLE transport remains in mobile (`apps/mobile`), but parsing math should be pure and testable.
2. Metric formulas must live in `@repo/core` as single source of truth.
3. Persistence and orchestration belong in backend (`@repo/trpc`), not in mobile or core.
4. `@repo/core` remains database-independent and framework-independent.

## Functional Requirements

### A) Bluetooth Parsing Integrity

- Parser behavior must be flag-driven and offset-safe for all variable-length characteristics.
- Endianness and unit scaling must follow spec for every parsed field.
- Cadence must be derived from delta crank revolutions and delta event time, including wrap-around handling.
- No cumulative counter is allowed to be emitted as instantaneous cadence.
- Truncated/invalid payloads must fail safely (skip reading, no crash).
- FTMS control point responses must be validated against request opcode and result code.

### B) Metrics Engine Integrity

- TRIMP is computed for every completed activity when sufficient inputs are available.
- TRIMP source must be explicit:
  - `hr` when HR quality threshold is met
  - `power_proxy` fallback when HR quality is insufficient but power-based load exists
- ACWR must use 7-day acute and 28-day chronic windows from a canonical daily-load series.
- Monotony must use 7-day mean/stddev from the same canonical daily-load series.
- Divide-by-zero and low-sample conditions must return safe values + explicit status.

### C) Sparse-History MVP Behavior

- Status envelope must be emitted with metric values:
  - `insufficient_history`
  - `provisional`
  - `stable`
- Recommended thresholds:
  - `<7 days`: insufficient for ACWR/Monotony
  - `7-27 days`: provisional
  - `>=28 days`: stable for ACWR
- Monotony with zero variance must not return Infinity/NaN.

## Data Contracts (MVP)

- Parsed reading contract includes:
  - metric type
  - value
  - source characteristic
  - timestamp
- Workload metric contract includes:
  - `value: number | null`
  - `status: "insufficient_history" | "provisional" | "stable"`
  - `coverageDays: number`
  - `requiredDays: number`
  - `source` (where applicable)

## Non-Functional Requirements

- Deterministic outputs for identical inputs.
- No parser crash from malformed payloads.
- Minimal overhead in recording hot path.
- Strong unit coverage for pure parsing/metric logic.
- Traceable debug logs in development mode.
- Database change hygiene: schema changes must be authored in `init.sql` first, then diffed/migrated/applied, then types regenerated.

## Acceptance Criteria

1. Controlled validation sessions show plausible cadence/power/HR traces.
2. No flag-dependent parser path uses fixed offsets where flags control layout.
3. Raw hex + parsed output can be captured in debug mode.
4. TRIMP, ACWR, and Monotony are produced by canonical core logic.
5. Sparse-history users receive explicit statuses rather than misleading stable values.
6. All edge-case tests pass (wrap-around, truncation, zero variance, small windows).

## Exit Criteria

- Phase 2 checklist in `tasks.md` is complete.
- Metrics and parser behaviors are validated by tests and at least one controlled ride replay.
- Remaining advanced modeling items are documented in post-MVP backlog.
