# Training Personalization Implementation Plan

**Spec:** `2026-02-18_training-personalization`
**Status:** Implementation-ready after preflight checks below
**Target Window:** 2 weeks
**Owners:** Core calculations + plan projection maintainers

---

## 1) Purpose and Scope

Implement four MVP personalization improvements on top of existing CTL/ATL/TSB:

1. Age-adjusted training constants
2. Optional gender-based recovery adjustment
3. Individual ramp-rate learning from history
4. Zone-based training quality adjustment for fatigue modeling

All changes must degrade gracefully when optional data is missing.

---

## 2) Preflight Decisions (Must Be Locked Before Coding)

### A. Gender multiplier semantic fix (required)

**Issue found:** Existing design text says female recovery is slower, but multiplier `0.92` was applied to ATL time constant, which shortens ATL and implies faster recovery.

**Decision:** ATL time constant is a fatigue-decay constant. Slower recovery must increase ATL time constant.

Use one of these implementations (pick one and keep naming consistent):

- `fatigueTimeConstantMultiplier`: female = `1.08`, default = `1.0`
- or `recoveryCapacityMultiplier`: female = `0.92`, then invert when applied to ATL time constant (`base / recoveryCapacityMultiplier`)

**Plan default:** Use `fatigueTimeConstantMultiplier` (`1.08`) for clarity.

### B. activity_efforts dependency gate (required)

**Issue found:** `activity_efforts` availability is pending.

**Decision:** Training quality MVP must run from `activities` zone data only. `activity_efforts` is optional enhancement for validation/trending, not required for go-live.

### C. Pseudocode correctness guard (required)

Fix naming typo in implementation (`hasPowerZones`, not `hasePowerZones`) and ensure all snippets compile in real code.

---

## 3) Technical Design Details

## 3.1 Feature Flags

Introduce granular flags to de-risk rollout:

- `personalization_age_constants`
- `personalization_gender_adjustment`
- `personalization_ramp_learning`
- `personalization_training_quality`

Default all off in production, then enable progressively.

## 3.2 File-Level Implementation Map

### A. Calibration helpers

**File:** `packages/core/plan/calibration-constants.ts`

Add:

- `getAgeAdjustedATLTimeConstant(age?: number): number`
- `getAgeAdjustedCTLTimeConstant(age?: number): number`
- `getMaxSustainableCTL(age?: number): number`
- `getAgeAdjustedRampRateMultiplier(age?: number): number`
- `getGenderAdjustedFatigueTimeMultiplier(gender?: "male" | "female" | null): number`
- `getPersonalizedATLTimeConstant(age?: number, gender?: "male" | "female" | null): number`
- `learnIndividualRampRate(activities): { maxSafeRampRate: number; confidence: "low" | "medium" | "high" }`

Behavior requirements:

- Missing age -> standard defaults
- Missing gender -> no additional adjustment
- Ramp learning <10 weeks -> default `40`, confidence `low`
- Clamp learned ramp to safe range `[30, 70]`

### B. Core CTL/ATL calculations

**File:** `packages/core/calculations.ts`

Update signatures:

- `calculateCTL(history, startCTL = 0, userAge?: number)`
- `calculateATL(history, startATL = 0, userAge?: number, userGender?: "male" | "female" | null, trainingQuality?: TrainingQualityProfile)`

Rules:

- Use age-adjusted CTL constant when flag enabled
- Use age+gender ATL constant when enabled
- Apply training-quality ATL extension (`+0/+1/+2 days`) when enabled
- Preserve old behavior when flags off

### C. Training quality module

**File:** `packages/core/calculations/training-quality.ts` (new)

Add:

- `analyzeActivityIntensity(activity): TrainingQualityProfile`
- `calculateRollingTrainingQuality(activities, days = 28): TrainingQualityProfile`
- `getIntensityAdjustedATLTimeConstant(baseTimeConstant, trainingQuality): number`

Data fallback order:

1. Power zones
2. HR zones
3. Neutral profile (`70/20/10`, load factor `1.0`)

### D. Plan context derivation

**File:** `packages/core/plan/deriveCreationContext.ts`

Add:

- `user_age` derived from `profiles.dob` when present
- `user_gender` from profile when present
- `max_sustainable_ctl` from age helper
- rolling training quality profile (if enabled)

### E. Safety cap integration

**File:** `packages/core/plan/projection/safety-caps.ts`

Replace/augment static ramp cap with learned cap:

- medium/high confidence -> learned cap
- low confidence -> conservative default cap `40`

### F. Database and types

Migration (Supabase):

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female'));
```

Then regenerate types:

- `pnpm run update-types`

Expected type:

- `gender?: "male" | "female" | null`

## 3.3 Algorithm Contracts and Exact Formulas

### CTL and ATL update equations

For both CTL and ATL, use EWMA with configurable time constant:

```ts
alpha = 2 / (timeConstant + 1);
nextValue = prevValue + alpha * (todayTSS - prevValue);
```

Contract:

- `timeConstant >= 1`
- `todayTSS` is finite, negative values coerced to `0`
- output rounded to one decimal place (to preserve existing behavior)

### Time constant assembly order (ATL)

Apply ATL constant composition in this exact order:

1. `baseATL = getAgeAdjustedATLTimeConstant(age)`
2. `genderAdjustedATL = round(baseATL * getGenderAdjustedFatigueTimeMultiplier(gender))`
3. `finalATL = getIntensityAdjustedATLTimeConstant(genderAdjustedATL, trainingQuality?)`

If a flag for a step is disabled, skip only that step.

### Ramp learning contract

- input window: previous 365 days of activities
- grouping grain: ISO week (Monday start)
- ramp value: positive week-over-week TSS increase only
- learned cap: `p75(rampValues)`
- clamp: `[30, 70]`
- confidence:
  - `low`: <15 positive ramps
  - `medium`: 15-30
  - `high`: >30

## 3.4 Data Contracts (Types and Nullability)

### Minimal activity shape used by personalization

```ts
type PersonalizationActivityInput = {
  date: string; // ISO date for ramp grouping
  start_time: string; // ISO timestamp for rolling window
  tss: number | null;
  power_z1_seconds?: number | null;
  power_z2_seconds?: number | null;
  power_z3_seconds?: number | null;
  power_z4_seconds?: number | null;
  power_z5_seconds?: number | null;
  power_z6_seconds?: number | null;
  power_z7_seconds?: number | null;
  hr_z1_seconds?: number | null;
  hr_z2_seconds?: number | null;
  hr_z3_seconds?: number | null;
  hr_z4_seconds?: number | null;
  hr_z5_seconds?: number | null;
};
```

Normalization rules before calculations:

- `null`/`undefined` zone seconds -> `0`
- negative zone seconds -> `0`
- `tss === null` -> `0`
- invalid timestamps -> drop record and increment diagnostic counter

### Profile contract

```ts
type PersonalizationProfileInput = {
  dob?: string | null;
  gender?: "male" | "female" | null;
};
```

Age derivation:

- compute once in context derivation
- floor by 365.25-day year
- if invalid DOB -> `undefined`

## 3.5 End-to-End Execution Flow

```text
deriveCreationContext
  -> load profile + 365d activities
  -> compute userAge/userGender
  -> compute trainingQuality (optional/flagged)
  -> compute CTL(age-aware?)
  -> compute ATL(age+gender+intensity-aware?)
  -> compute TSB = CTL - ATL
  -> compute learnedRampCap (flagged)
  -> apply safety caps with learned/default ramp
  -> pass enriched context into projection and readiness
```

Integration invariants:

- When all flags off, resulting context is numerically identical to current baseline.
- Readiness functions consume the same shape, with additive optional fields only.

## 3.6 Persistence and Migration Runbook

### Hard-cut schema policy (required)

This enhancement uses a **hard cut** for schema alignment:

- Do not introduce parallel schema versions.
- Do not maintain compatibility shims for old/new profile shapes.
- Do not add custom migration-pattern abstractions in app code.
- Treat `profiles.gender` as part of the canonical schema once applied.

Perform migration in this order:

1. **Update `init.sql` first** to include `profiles.gender` as nullable with check constraint.
2. Commit/verify `init.sql` is the intended source-of-truth schema state.
3. Generate migration from that state (`supabase db diff`).
4. Validate generated SQL includes only intended gender changes.
5. Apply migration in local/staging (`supabase migration up`).
6. Regenerate types (`pnpm run update-types`).
7. Run full checks (`pnpm check-types && pnpm lint && pnpm test`).

Command order requirement:

- `init.sql` update **must occur before** `supabase db diff`.
- `supabase db diff` **must occur before** `supabase migration up`.
- `supabase migration up` should never be run against stale schema intent.

Rollback strategy for migration errors:

- if migration fails before apply: fix SQL and regenerate
- if applied and app issue appears: keep column, disable `personalization_gender_adjustment` flag

## 3.7 Deterministic Edge-Case Matrix

The following cases must be deterministic and test-covered:

1. No activities in window -> CTL/ATL from start values, neutral training quality
2. All activity TSS null/0 -> no drift beyond start values
3. DOB missing/invalid -> standard constants
4. Gender missing -> age-only ATL
5. Zone data missing -> neutral quality profile
6. Only HR zones present -> HR fallback path
7. Week boundary crossing and Sunday activities -> grouped to correct Monday week
8. Ramp data sparse (<10 weeks) -> cap 40, confidence low

## 3.8 Performance Budget

Personalization compute budget at p95 per user context build:

- +15% max latency over baseline
- +10 MB max transient memory growth

Optimization requirements:

- single pass accumulation where possible
- avoid repeated date parsing inside nested loops
- no O(n^2) operations on activity history

---

## 4) Implementation Sequence (Executable)

## Phase 0 - Preflight (0.5 day)

1. Lock decisions A/B/C above.
2. Add feature flags and wiring.
3. Define acceptance metrics (Section 6) in code comments/tests.

Exit criteria:

- All flags compile and default to off.
- No behavior change with all flags off.

## Phase 1 - Age Personalization (1 day)

1. Add age helper functions.
2. Thread `userAge` into CTL/ATL call sites.
3. Add unit tests for age buckets and `undefined` fallback.
4. Ensure all age call sites use precomputed `userAge` (no duplicate derivation).

Exit criteria:

- Deterministic output for each age bucket.
- No regression when age absent.

## Phase 2 - Gender Restoration (0.5 day)

1. Add migration + regenerate types.
2. Add gender multiplier helper with corrected semantics.
3. Integrate in ATL path.
4. Add tests asserting same-age female ATL constant > same-age male ATL constant.

Exit criteria:

- Female adjustment increases ATL time constant vs same-age male.
- Null/undefined gender remains age-only behavior.

## Phase 3 - Ramp Learning (2 days)

1. Implement weekly grouping + ramp extraction.
2. Add percentile-based learned cap + confidence levels.
3. Integrate in safety-caps.
4. Add deterministic percentile helper (stable sort behavior for equal values).

Exit criteria:

- Synthetic fixtures classify high/medium/low confidence correctly.
- Learned cap is clamped and stable.

## Phase 4 - Training Quality (2-3 days)

1. Implement zone-distribution profile.
2. Implement rolling weighted quality over 28 days.
3. Integrate ATL time-constant extension.
4. If `activity_efforts` unavailable, skip effort-based enhancement.
5. Validate no runtime throw when activities are missing all zone fields.

Exit criteria:

- Power->HR->neutral fallback verified.
- ATL extension logic verified for high-intensity distributions.

## Phase 5 - Rollout and Validation (1 day)

1. Enable flags in staging in this order: age -> gender -> ramp -> quality.
2. Compare baseline vs personalized outputs on backtest cohort.
3. Ship progressively in production.

### Suggested PR breakdown

1. PR-1: feature flags + no-op plumbing
2. PR-2: age helpers + CTL/ATL age threading + tests
3. PR-3: gender migration/types + ATL gender semantics + tests
4. PR-4: ramp learning + safety-caps integration + tests
5. PR-5: training quality module + ATL intensity adjustment + tests
6. PR-6: telemetry + rollout config + documentation

---

## 5) Testing Plan (Required)

Create/extend tests in:

- `packages/core/plan/__tests__/calibration-constants.test.ts`
- `packages/core/plan/__tests__/age-gender-personalization.test.ts`
- `packages/core/calculations/__tests__/training-quality.test.ts`
- `packages/core/plan/__tests__/ramp-learning.test.ts` (new)

Test cases:

- Age bucket boundaries (29/30, 39/40, 49/50)
- Gender semantic correctness (female -> higher ATL constant)
- Missing DOB/gender fallback
- Ramp learning with sparse/medium/rich data
- Zone fallback path (power present, HR-only, none)
- Feature-flag off parity with current production math
- Deterministic week grouping around month/year boundaries
- Invalid date inputs do not throw and are safely ignored
- Performance budget guard test for large synthetic history (e.g., 365-730 activities)

Backtest requirements:

- Cohort split: new users (<10 weeks), intermediate (10-26 weeks), experienced (>26 weeks)
- Evaluate each flag independently, then cumulatively
- Log deltas for CTL/ATL/TSB and readiness components per user-day
- Store baseline vs personalized outputs for regression snapshots

Validation command set:

```bash
pnpm check-types && pnpm lint && pnpm test
```

---

## 6) Acceptance Criteria (Go/No-Go)

Must define and track on a validation cohort before full rollout.

### Primary metrics

- **Overload false-positive rate**: reduce by >= 20% vs baseline
- **Readiness error (proxy)**: reduce MAE by >= 10% on held-out historical windows
- **Ramp violation incidence** (weeks exceeding safe cap): reduce by >= 25%
- **Calibration stability**: no metric drift > 5% week-over-week after rollout gate change

### Safety/compatibility metrics

- With all flags off, outputs are bit-for-bit unchanged
- For users without DOB/gender/zone data, deviation from baseline <= 1%
- No increase in calculation runtime > 15% at p95
- No unhandled exceptions in personalization path for null-heavy data

If primary thresholds are not met, keep feature behind flags and iterate.

---

## 7) Rollout, Observability, and Rollback

## 7.1 Observability

Emit structured debug telemetry (non-PII):

- active personalization flags
- chosen ATL/CTL time constants
- learned ramp cap + confidence
- training quality load factor
- final readiness components

## 7.2 Rollout order

1. Internal cohort
2. 10% users
3. 50% users
4. 100% users

Monitor acceptance metrics at each gate.

## 7.3 Rollback

- Immediate rollback: disable individual flags
- Full rollback: disable all personalization flags
- Database rollback for gender column is not required for app safety; keep nullable field even if feature disabled

---

## 8) Grey-Area Findings Resolved in This Plan

1. **Gender logic conflict** -> fixed via explicit ATL-time multiplier semantics.
2. **Pseudocode compile risk** -> corrected naming and compile-first requirement.
3. **`activity_efforts` uncertainty** -> decoupled from MVP critical path.
4. **Missing acceptance gates** -> quantified go/no-go thresholds added.
5. **Operational risk** -> feature flags + staged rollout + rollback paths added.

---

## 9) Optional Low-Effort, High-Impact Add-On (Post-MVP)

If team has 2-3 extra hours, add these from existing TSS data:

- ACWR (7d / 28d) as a readiness modifier
- Training monotony (7-day mean / stddev)

These can be implemented without schema changes and provide strong early warning for overload.

---

## 10) Definition of Done

- All phases complete with tests passing
- Acceptance criteria met on validation cohort
- Flags staged and progressively enabled
- Release notes published for CTL/ATL interpretation changes
- Documentation updated in spec and developer references

_End of implementation plan._
