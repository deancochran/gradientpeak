# Phase 2 Specification - Data Integrity & Metrics Engine

Date: 2026-02-26
Owner: Mobile + Core + Backend
Status: Proposed
Type: Sensor data correctness + training metrics computation

## Executive Summary

Phase 2 ensures raw workout data is trustworthy and derived training load metrics are stable with a practical MVP implementation.

This phase is complete only when:

1. Bluetooth characteristic parsers are spec-correct and validated against known-good references.
2. TRIMP, ACWR, and Training Monotony are computed consistently for all completed activities.
3. Sparse-history users receive safe, explicit provisional behavior without misleading precision.

## Problem Statement

- At least one live metric (cadence) shows physiologically impossible behavior, indicating parser defects.
- Variable-length and flag-dependent characteristics are vulnerable to offset and width parsing mistakes.
- Training metrics may be present but not computed from a single canonical ruleset.
- Sparse-history users still need understandable output without over-engineered estimation.

## Goals

1. Audit and correct all currently parsed workout Bluetooth characteristics.
2. Guarantee cadence is derived from cumulative counters and event time deltas.
3. Add developer debug instrumentation to map raw hex payloads to parsed values.
4. Standardize TRIMP, ACWR, and Training Monotony calculations behind one computation layer.
5. Define MVP sparse-history behavior (provisional/null-safe outputs) for ACWR and Monotony.

## Non-Goals

- No UI redesign work from Phase 9 in this phase.
- No calendar/training plan schema expansions from Phase 3.
- No coaching/messaging features from Phase 10.
- No Bayesian modeling in MVP scope for this phase.

## Functional Requirements

### 2.1 Bluetooth Parsing Integrity

- Every parsed Bluetooth characteristic must follow official field layout, flags, width, endianness, and unit scaling.
- CSC cadence must be computed from delta crank revolutions over delta event time; raw cumulative counters are never displayed as rate.
- Cycling Power, Heart Rate, and Indoor Bike Data parsers must be flag-driven and offset-safe.
- FTMS control/status parsing and command mapping must be validated for correctness.
- Parsed values written to persistence must match validated interpreted values.

### 2.2 Metrics Engine

- TRIMP must be computed for every completed activity, using HR-based method when valid HR data exists.
- If HR data is absent or unreliable, fallback to a documented power-based proxy.
- ACWR must use 7-day acute load over rolling 28-day chronic baseline.
- Training Monotony must use rolling 7-day daily TRIMP mean divided by standard deviation.
- Sparse-history behavior must be deterministic and explicit (e.g., provisional status and/or null-safe values until minimum history threshold is met).

## Non-Functional Requirements

- Determinism: parser outputs and metrics are reproducible for same input stream.
- Observability: debug mode can emit raw hex + parsed output for each notification.
- Safety: metric calculations must avoid divide-by-zero and invalid-window conditions.
- Maintainability: centralize parsing and metric formulas; avoid duplicated logic.

## Acceptance Criteria

1. Live workout validation against reference device/app shows plausible cadence/power/HR trajectories.
2. No flag-dependent characteristic parser uses hardcoded fixed offsets.
3. Developer debug logs can map payload bytes to parsed fields for targeted sessions.
4. Every completed activity receives a TRIMP value (direct or fallback path).
5. ACWR and Monotony compute for users with sufficient history and behave predictably for sparse-history users.
6. Unit tests cover parser edge cases and metrics window boundaries.

## Exit Criteria for Phase 2

- Sensor parsing defects are resolved and validated in controlled workouts.
- Metrics pipeline is consistent, documented, and test-covered.
- Sparse-history behavior is clear, safe, and non-misleading for downstream readiness/recommendation phases.

## Post-MVP Enhancements (Explicitly Out of Scope)

- Bayesian priors/posteriors for ACWR and Monotony.
- Uncertainty propagation fields for downstream model weighting.
