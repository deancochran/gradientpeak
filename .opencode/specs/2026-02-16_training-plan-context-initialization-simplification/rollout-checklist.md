# Rollout Checklist: Context-First Initialization Simplification

Date: 2026-02-16
Spec: `.opencode/specs/2026-02-16_training-plan-context-initialization-simplification/`

## Release Preconditions

- [x] Phase 0-4 implementation merged and validated in package-level suites.
- [x] Hard safety bounds unchanged (`max_weekly_tss_ramp_pct` <= 20, `max_ctl_ramp_per_week` <= 8).
- [x] Preview/create initialization uses shared load bootstrap outputs (`starting_ctl`, `starting_atl`, `starting_tsb`).
- [x] Standard mobile creation flow hides raw optimizer multipliers by default.

## Validation Evidence

- [x] `pnpm --filter @repo/core check-types`
- [x] `pnpm --filter @repo/core test`
- [x] `pnpm --filter @repo/trpc check-types`
- [x] `pnpm --filter @repo/trpc test`
- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter mobile test`
- [x] `pnpm check-types && pnpm lint && pnpm test`

## Determinism and Safety

- [x] Repeated identical preview inputs produce deterministic baseline snapshot outputs.
- [x] Lock conflict handling preserved for inferred cap suggestions.
- [x] Safety cap clamping regression tests cover both floor and ceiling contracts.

## Fallback Strategy

- [x] Keep existing hard cap normalization unchanged (core safety-caps remains authoritative).
- [x] Keep advanced optimizer controls available behind explicit toggle for coach override.
- [x] If unexpected initialization regressions appear, disable advanced context heuristics by feature-flagging suggestion blend to conservative defaults while retaining bootstrap utility.

## Post-Release Monitoring

- [x] Track ratio of plans created without manual cap/tuning edits.
- [x] Track suggestion conflict frequency for locked fields.
- [x] Track preview recompute latency and stale-response suppression behavior.
