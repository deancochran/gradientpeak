# Calibration Release Gate: Readiness Full Controls

Date: 2026-02-15
Scope: Phase 5 stabilization for core -> trpc -> mobile calibration replay

## Gate Checklist

- [x] Core deterministic golden fixtures cover representative calibration presets.
- [x] Core seeded fuzz/property tests cover bounded random calibration values.
- [x] Core assertions enforce bounded readiness and finite MPC objective outputs.
- [x] Preview/create parity validates calibration replay invariants and diagnostics parity.
- [x] Mobile adapter payload mapping remains deterministic for preview/create replay input.

## Evidence

- Core preset golden fixtures: `packages/core/plan/__tests__/projection-parity-fixtures.test.ts`
- Core fuzz/property + finite objective assertions: `packages/core/plan/__tests__/phase4-stabilization.test.ts`
- tRPC preview/create replay + diagnostics parity: `packages/trpc/src/routers/__tests__/training-plans.test.ts`
- Mobile replay serialization parity: `apps/mobile/lib/training-plan-form/adapters/adapters.test.ts`

## Rollout Checklist

- [x] Run core targeted stabilization suite.
- [x] Run trpc preview/create parity suite.
- [x] Run mobile calibration and preview request-state suite.
- [x] Confirm no legacy alias fields are introduced in replay payloads.
- [x] Confirm persisted calibration snapshot/version parity with preview normalization.
