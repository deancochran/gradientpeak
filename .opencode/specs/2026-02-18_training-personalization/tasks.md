# Training Personalization Tasks

**Spec:** `2026-02-18_training-personalization`
**Plan:** `./plan.md`
**Execution Model:** Hard cut (no schema versioning or compatibility shims)

---

## Phase 0 - Preflight and Guardrails

- [ ] Lock hard-cut policy in implementation notes and PR description
- [ ] Add feature flags with all personalization flags defaulted to off
- [ ] Verify all flags compile and produce no behavior change when off
- [ ] Confirm acceptance criteria and backtest cohort definitions are documented

---

## Phase 1 - Schema Hard Cut (Gender)

- [ ] Update canonical `init.sql` first to include nullable `profiles.gender` with check constraint
- [ ] Verify `init.sql` reflects intended final schema before diff generation
- [ ] Run `supabase db diff` to generate migration from updated `init.sql`
- [ ] Validate generated migration includes only intended gender schema changes
- [ ] Run `supabase migration up` only after successful diff validation
- [ ] Run `pnpm run update-types` and confirm `gender?: "male" | "female" | null`
- [ ] Confirm no versioned schema paths or compatibility branches were introduced

---

## Phase 2 - Age Personalization

- [ ] Implement age-adjusted ATL/CTL helpers in `packages/core/plan/calibration-constants.ts`
- [ ] Thread `userAge` from `deriveCreationContext.ts` into CTL/ATL call sites
- [ ] Ensure invalid/missing DOB degrades to baseline constants
- [ ] Add tests for age bucket boundaries (29/30, 39/40, 49/50)

---

## Phase 3 - Gender Personalization (Corrected Semantics)

- [ ] Implement `getGenderAdjustedFatigueTimeMultiplier` with correct ATL semantics
- [ ] Ensure female adjustment increases ATL time constant (slower recovery behavior)
- [ ] Ensure null/undefined gender falls back to age-only behavior
- [ ] Add tests asserting female ATL constant > male ATL constant for same age

---

## Phase 4 - Ramp Learning

- [ ] Implement weekly grouping (ISO week, Monday start) in ramp learning helper
- [ ] Implement p75 learned cap with clamp `[30, 70]`
- [ ] Implement confidence levels: low (<15), medium (15-30), high (>30)
- [ ] Integrate learned cap in `projection/safety-caps.ts`
- [ ] Enforce sparse-data fallback: cap `40`, confidence `low`
- [ ] Add deterministic tests for week boundaries and percentile stability

---

## Phase 5 - Training Quality

- [ ] Create `packages/core/calculations/training-quality.ts`
- [ ] Implement zone distribution analysis (power -> HR -> neutral fallback)
- [ ] Implement rolling 28-day quality profile weighted by TSS
- [ ] Implement ATL extension from intensity load (`+0/+1/+2` days)
- [ ] Fix and verify `hasPowerZones` naming in implementation
- [ ] Ensure null-heavy/zone-missing data cannot throw runtime errors
- [ ] Keep `activity_efforts` optional and out of MVP critical path

---

## Phase 6 - Integration and Readiness Flow

- [ ] Wire personalization outputs into `deriveCreationContext.ts`
- [ ] Keep context shape backward compatible (additive fields only)
- [ ] Verify with all flags off outputs are bit-for-bit baseline equivalent
- [ ] Verify with flags on each layer modifies only intended components

---

## Phase 7 - Testing and Validation

- [ ] Add/extend tests:
  - [ ] `packages/core/plan/__tests__/calibration-constants.test.ts`
  - [ ] `packages/core/plan/__tests__/age-gender-personalization.test.ts`
  - [ ] `packages/core/plan/__tests__/ramp-learning.test.ts`
  - [ ] `packages/core/calculations/__tests__/training-quality.test.ts`
- [ ] Add edge-case tests (invalid dates, no activities, all zero/null TSS, HR-only zones)
- [ ] Run full validation: `pnpm check-types && pnpm lint && pnpm test`
- [ ] Run backtest by cohort (<10 weeks, 10-26 weeks, >26 weeks)
- [ ] Record baseline vs personalized deltas for CTL/ATL/TSB/readiness

---

## Phase 8 - Rollout and Observability

- [ ] Add structured telemetry for constants, caps, flags, quality factors
- [ ] Stage rollout: internal -> 10% -> 50% -> 100%
- [ ] Validate go/no-go thresholds at each gate
- [ ] Keep immediate rollback path via feature flags
- [ ] Publish release notes for CTL/ATL interpretation shift

---

## PR Review Checklist (Hard-Cut Enforcement)

- [ ] `init.sql` was updated **before** running `supabase db diff`
- [ ] `supabase db diff` was run **before** `supabase migration up`
- [ ] No schema versioning patterns were introduced
- [ ] No compatibility shims were introduced
- [ ] Migration SQL is minimal and matches design intent
- [ ] Types regenerated after migration apply

---

## Definition of Done

- [ ] All phase checklists complete
- [ ] Acceptance criteria in `plan.md` section 6 are met
- [ ] Tests and validation commands pass
- [ ] Rollout completed or safely paused behind flags
