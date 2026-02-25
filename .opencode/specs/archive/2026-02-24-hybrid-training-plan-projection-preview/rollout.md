# Rollout Notes - Hybrid Projection Preview

Date: 2026-02-24
Status: Prepared
Owner: Mobile + tRPC

## Feature Flag Gate

- Hybrid local preview path remains gated by `trainingPlanCreateConfigMvp` in composer flow.
- Server-authoritative create/update path is always active in config mode.

## Rollout Steps

1. Enable `trainingPlanCreateConfigMvp` for internal users.
2. Verify create/edit saves with stale/conflict handling in mobile.
3. Verify no per-change calls to `previewCreationConfig` in composer interaction loop.
4. Expand rollout percentage after validation window.

## Monitoring Signals

- Save failures by typed cause:
  - `TRAINING_PLAN_COMMIT_STALE_PREVIEW`
  - `TRAINING_PLAN_COMMIT_CONFLICT`
  - `TRAINING_PLAN_COMMIT_INVALID_PAYLOAD`
  - `TRAINING_PLAN_COMMIT_NOT_FOUND`
- Client preview error frequency (`Could not compute the local projection preview`).
- Legacy payload rejection count on create/update parse paths.

## Rollback Criteria

- Roll back feature flag if any of the following hold for two consecutive observation windows:
  - Stale/conflict save errors spike above agreed baseline threshold.
  - Local preview errors are sustained and user-impacting.
  - Create/update success rate regresses materially from baseline.

## Rollback Plan

1. Disable `trainingPlanCreateConfigMvp` for affected audience.
2. Confirm composer returns to non-hybrid path.
3. Keep server-side validation and strict hard-cutover contract unchanged.
4. Triage root cause and re-enable gradually after fix.
