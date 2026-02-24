# Training Personalization Tasks

**Spec:** `2026-02-18_training-personalization`
**Plan:** `./plan.md`
**Execution Model:** Hard cut (no schema versioning or compatibility shims)

---

## Phase 0 - Preflight and Guardrails

- [x] Lock hard-cut policy in implementation notes and PR description
- [x] Add feature flags with all personalization flags defaulted to off
- [x] Verify all flags compile and produce no behavior change when off
- [x] Confirm acceptance criteria and backtest cohort definitions are documented

---

## Phase 1 - Schema Hard Cut (Gender)

- [x] Update canonical `init.sql` first to include nullable `profiles.gender` with check constraint
- [x] Verify `init.sql` reflects intended final schema before diff generation
- [x] Generate migration from updated `init.sql` (`supabase db diff` or equivalent explicit SQL migration)
- [x] Validate migration includes only intended gender schema changes
- [x] Run `supabase migration up` only after successful diff validation
- [x] Run `pnpm run update-types` and confirm `gender?: "male" | "female" | null`
- [x] Confirm no versioned schema paths or compatibility branches were introduced

---

## Phase 2 - Age Personalization

- [x] Implement age-adjusted ATL/CTL helpers in `packages/core/plan/calibration-constants.ts`
- [x] Thread `userAge` from `deriveCreationContext.ts` into CTL/ATL call sites
- [x] Ensure invalid/missing DOB degrades to baseline constants
- [x] Add tests for age bucket boundaries (29/30, 39/40, 49/50)

---

## Phase 3 - Gender Personalization (Corrected Semantics)

- [x] Implement `getGenderAdjustedFatigueTimeMultiplier` with correct ATL semantics
- [x] Ensure female adjustment increases ATL time constant (slower recovery behavior)
- [x] Ensure null/undefined gender falls back to age-only behavior
- [x] Add tests asserting female ATL constant > male ATL constant for same age

---

## Phase 4 - Ramp Learning

- [x] Implement weekly grouping (ISO week, Monday start) in ramp learning helper
- [x] Implement p75 learned cap with clamp `[30, 70]`
- [x] Implement confidence levels: low (<15), medium (15-30), high (>30)
- [x] Integrate learned cap in `projection/safety-caps.ts`
- [x] Enforce sparse-data fallback: cap `40`, confidence `low`
- [x] Add deterministic tests for week boundaries and percentile stability

---

## Phase 5 - Training Quality

- [x] Create `packages/core/calculations/training-quality.ts`
- [x] Implement zone distribution analysis (power -> HR -> neutral fallback)
- [x] Implement rolling 28-day quality profile weighted by TSS
- [x] Implement ATL extension from intensity load (`+0/+1/+2` days)
- [x] Fix and verify `hasPowerZones` naming in implementation
- [x] Ensure null-heavy/zone-missing data cannot throw runtime errors
- [x] Keep `activity_efforts` optional and out of MVP critical path

---

## Phase 6 - Integration and Readiness Flow

- [x] Wire personalization outputs into `deriveCreationContext.ts`
- [x] Keep context shape backward compatible (additive fields only)
- [x] Verify with all flags off outputs are bit-for-bit baseline equivalent
- [x] Verify with flags on each layer modifies only intended components

---

## Phase 7 - Testing and Validation

- [ ] Add/extend tests:
  - [x] `packages/core/plan/__tests__/calibration-constants.test.ts`
  - [x] `packages/core/plan/__tests__/age-gender-personalization.test.ts`
  - [x] `packages/core/plan/__tests__/ramp-learning.test.ts`
  - [x] `packages/core/calculations/__tests__/training-quality.test.ts`
- [x] Add edge-case tests (invalid dates, no activities, all zero/null TSS, HR-only zones)
- [ ] Run full validation: `pnpm check-types && pnpm lint && pnpm test`
- [ ] Run backtest by cohort (<10 weeks, 10-26 weeks, >26 weeks)
- [ ] Record baseline vs personalized deltas for CTL/ATL/TSB/readiness

---

## Phase 8 - Rollout and Observability

- [x] Add structured telemetry for constants, caps, flags, quality factors
- [ ] Stage rollout: internal -> 10% -> 50% -> 100%
- [ ] Validate go/no-go thresholds at each gate
- [x] Keep immediate rollback path via feature flags
- [x] Publish release notes for CTL/ATL interpretation shift

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
