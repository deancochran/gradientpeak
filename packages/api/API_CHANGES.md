# API contract changes

## 2026-08-10 — fresh-baseline compatibility hard cut

Activity-plan list callers now use `ownerScope` and `activityCategories`; the removed
`includeEstimation`, singular `activityCategory`, and unused direction compatibility inputs are no
longer accepted. Training plans use `trainingPlans.get({ id })` and
`trainingPlans.getPlanTabProjection(...)`; `getById`, `getActivePlan`, and their application aliases
were removed.

Personal events no longer accept imported/rest-day event types, read-only flags, lifecycle wrappers,
or recurrence exception fields. The fresh database baseline likewise omits the imported enum value
and dead event source, external-calendar, lifecycle, recurrence-JSON, and payload columns. Profile
metrics no longer accept or persist LTHR; published performance-target facts and calibration evidence
own threshold-heart-rate state.

Personal planned sessions now accept calendar date keys and content links only. Client-authored
datetime, timezone, all-day, recurrence, and training-plan-linkage fields were removed while generic
custom and race-target events retain their timed/recurring schedule contracts. The
`events.validateConstraints` preflight route was removed; create and update mutations are the sole
schedule authority. Training-plan writes no longer accept the legacy `is_active` field.

Executable provider capability contracts are now Wahoo-only. Neutral provider identifiers remain for
durable source identity and recovery, but unsupported providers no longer receive runtime capability,
sync-mode, setup-action, or planned-activity-readiness definitions.

## 2026-07-24 — public API hard-cut cleanup

Removed unused activity-plan imports/counts; legacy training-plan creation, feasibility, audit,
periodization, schedule, intensity, and totals procedures; `analytics`; legacy `coaching`; and
the unused activity-effort, feed, profile-metric, profile, route, and social leaves. There is no
old-client compatibility layer. Current onboarding clients use `onboarding.completeLifecycleSetup`
and organization coaching access uses `organizations.coachingAccess`.

Trends clients now use `trends.getDashboard` for volume, performance, training-load, zone, and
consistency data. The former `trends.getVolumeTrends`, `trends.getPerformanceTrends`,
`trends.getTrainingLoadTrends`, `trends.getZoneDistributionTrends`, and
`trends.getConsistencyMetrics` procedures were removed; `trends.getPeakPerformances` remains.

The corresponding unused `@repo/core` compatibility exports were also removed:
`getCreationSuggestionsInputSchema`, `GetCreationSuggestionsInput`,
`createFromCreationConfigInputSchema`, `CreateFromCreationConfigInput`,
`createFromCreationConfigResponseCompatSchema`, and `CreateFromCreationConfigResponseCompat`.
The `previewCreationConfig*` contracts remain the supported shared planning-preview surface.

## 2026-07-15 — plan visibility

Activity-plan and training-plan responses no longer include the legacy `is_public` field. Clients use
`content_visibility` (`"private"`, `"followers"`, or `"public"`); system-template access remains represented
separately by `is_system_template`. No transport alias is retained because this repository has no
supported-old-client policy, and all current source clients use the canonical field after this change.
