# Technical Implementation Plan - Phase 2 Data Integrity & Metrics Engine (MVP)

Date: 2026-02-26
Status: Ready for implementation (with contract lock)
Owner: Mobile + Core + Backend + QA
Inputs: `design.md`

## 1) Target Architecture

- `apps/mobile`:
  - BLE discovery, subscription, and lifecycle management
  - conversion of characteristic payload to byte array
  - dispatch parsed readings to recording pipeline
- `@repo/core`:
  - pure parser utilities and characteristic parsers (new module)
  - pure BLE parsing helpers and delta/wrap arithmetic
  - pure workload calculations (TRIMP, ACWR, Monotony)
  - sparse-history status policy
- `@repo/trpc`:
  - orchestrate ingestion and persistence
  - call canonical `@repo/core` formulas
  - expose metric values + status metadata in endpoints

## 2) File-Level Implementation Map

### Mobile (recording and BLE parsing call sites)

- `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
  - fix CSC cadence derivation and offset handling
  - harden FTMS/HR/Cycling Power parsing paths
  - add debug payload logging toggle path
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts`
  - validate control point response opcode/result handling
  - preserve single in-flight request behavior

### Core (canonical logic)

- `packages/core/bluetooth/` (new)
  - characteristic parsers and shared byte/offset helpers
  - delta/wrap arithmetic helpers used by mobile call sites
- `packages/core/calculations/workload.ts` (new)
  - `computeTrimp(...)`
  - `computeAcwr(...)`
  - `computeMonotony(...)`
  - status envelope helpers
- `packages/core/calculations/index.ts`
  - export new workload functions
- `packages/core/calculations/__tests__/workload.test.ts` (new)
  - deterministic unit coverage for formulas and guards

### Backend (ingestion and persistence)

- `packages/trpc/src/routers/fit-files.ts`
  - compute TRIMP at ingestion and persist
- `packages/trpc/src/routers/activities.ts`
  - preserve mapping consistency for metric fields
- `packages/trpc/src/routers/home.ts`
- `packages/trpc/src/routers/trends.ts`
  - expose ACWR/Monotony + sparse-history status from canonical calculations

## 3) Canonical Formula and Policy Decisions

### TRIMP

- Primary: HR-based TRIMP when HR quality threshold is satisfied.
- Fallback: power-proxy load when HR quality fails and power load exists.
- Emit source tag: `hr` or `power_proxy`.
- Contract lock required before implementation: define exact HR quality threshold and exact fallback algorithm inputs/formula.

### ACWR

- `acute = average(dailyLoad, last 7 days)`
- `chronic = average(dailyLoad, last 28 days)`
- `acwr = acute / chronic` with denominator guard.
- Contract lock required before implementation: define canonical daily-load series semantics (day boundary/timezone, zero-load day handling, inclusion rules).

### Monotony

- `monotony = mean(last 7 dailyLoad) / stddev(last 7 dailyLoad)`
- if stddev is zero or near-zero, return safe null/status (never Infinity/NaN).

### Sparse-History Policy (MVP)

- status thresholds:
  - `<7 days`: `insufficient_history`
  - `7-27 days`: `provisional`
  - `>=28 days`: `stable`

## 4) Data and API Contract Updates

### Metric Value Envelope

Use this response shape for ACWR and Monotony outputs:

```ts
type MetricStatus = "insufficient_history" | "provisional" | "stable";

type MetricValueEnvelope = {
  value: number | null;
  status: MetricStatus;
  coverageDays: number;
  requiredDays: number;
  source?: "hr" | "power_proxy";
  reasonCode?: string;
};
```

### Persistence

- Persist TRIMP per completed activity when compute inputs exist.
- Keep ACWR/Monotony computed from canonical daily load history for MVP.
- If schema changes are required, follow the required DB workflow exactly (below).

### Required DB Workflow (Order Is Mandatory)

When a schema update is needed for this phase, execute these steps in order:

1. Update `packages/supabase/schemas/init.sql` first.
2. Generate migration via `supabase db diff`.
3. Apply migration via `supabase migration up`.
4. Update generated types/schemas via `pnpm --filter @repo/supabase run update-types`.

Notes:

- Do not skip directly to migration edits before `init.sql` is updated.
- Keep migration SQL and `init.sql` consistent in the same change set.
- Verify all three generated outputs are updated by `pnpm --filter @repo/supabase run update-types` before closing the task.

## 5) Implementation Phases (Low-Risk Order)

### Phase 1 - Core math foundation

- Add workload module in `@repo/core` + tests.
- No runtime wiring changes yet.

### Phase 2 - Parser extraction and hardening

- Extract parser logic to pure helpers (`@repo/core`) with fixture-driven tests.
- Fix CSC cadence + wrap-around behavior.
- Harden FTMS/HR/Cycling Power parsing.
- Add parser fixtures and branch tests.

### Phase 3 - Mobile and backend wiring

- Wire mobile recording call sites to canonical parsers.
- Call core workload functions in ingestion path.
- Persist TRIMP and return ACWR/Monotony envelopes in read endpoints.

### Phase 4 - Validation and cleanup

- run controlled replay/validation sessions
- normalize naming mismatches and remove duplicate formulas

## 6) QA and Test Strategy

### Parser Tests

- fixtures for each characteristic with flags on/off combinations
- wrap-around delta tests (counter and timestamp)
- truncated payload safety tests

### Metrics Tests

- TRIMP HR-valid, HR-invalid fallback, no-input behavior
- ACWR exact boundary windows (7/28)
- Monotony zero-variance guard
- sparse-history status transitions

### Integration Tests

- ingestion path persists expected metric fields
- endpoint responses include `MetricValueEnvelope`
- duplicate-ingestion/idempotency guard for daily-load history integrity

## 7) Quality Gates

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
pnpm --filter @repo/core test
pnpm --filter @repo/core check-types
pnpm --filter @repo/trpc test
pnpm --filter @repo/trpc check-types
pnpm check-types
pnpm lint
```

## 8) Risks and Mitigations

1. Parser regressions from offset errors -> fixture-first tests + per-flag coverage.
2. Formula drift across packages -> all formulas in `@repo/core` only.
3. Metric compute failures blocking activity insert -> fail-open with null/status + logging.
4. Sparse-history confusion -> explicit status + coverage metadata.
5. Naming drift between payload and DB fields -> single mapping adapter and test coverage.

## 9) Definition of Done

1. Parser behavior is spec-correct and test-covered for required characteristics.
2. TRIMP/ACWR/Monotony are computed by canonical `@repo/core` logic.
3. Sparse-history outputs are explicit and safe.
4. Endpoint outputs and persisted values match contract and tests.
5. All checklist items in `tasks.md` are completed.

## 10) Post-MVP Extension Points

- Bayesian sparse-history estimation.
- uncertainty propagation to readiness/recommendation systems.
- precomputed workload snapshots if query performance requires it.
