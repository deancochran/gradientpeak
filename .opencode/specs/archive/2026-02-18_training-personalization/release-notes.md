# Training Personalization Release Notes

## Version

`training-personalization-mvp` (hard cut)

## What changed

- CTL and ATL now support age-adjusted time constants when feature flags are enabled.
- ATL now supports corrected gender fatigue semantics (female -> longer ATL time constant).
- Ramp learning infrastructure was added (ISO-week p75 learning with confidence gating).
- Training quality analysis was added (power -> HR -> neutral fallback) and can extend ATL by `+0/+1/+2` days.
- Creation context now carries additive personalization signals:
  - `user_age`
  - `user_gender`
  - `max_sustainable_ctl`
  - `learned_ramp_rate`
  - `training_quality`
- Dashboard/trends responses include `personalizationTelemetry` for rollout observability.

## Interpretation updates

- ATL may remain elevated longer for older/female athletes when corresponding flags are enabled.
- High-intensity-biased training distributions can increase fatigue persistence via ATL extension.
- Suggested weekly ramp cap can be informed by historical ramp learning (medium/high confidence only).

## Rollback

Use feature flags for immediate rollback, in this order:

1. `personalization_training_quality`
2. `personalization_ramp_learning`
3. `personalization_gender_adjustment`
4. `personalization_age_constants`

Disabling all personalization flags restores baseline CTL/ATL behavior.
