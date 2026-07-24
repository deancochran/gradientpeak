# API contract changes

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

Activity-plan and training-plan responses no longer include the legacy `is_public` field. Clients must use
`template_visibility` (`"private"` or `"public"`); system-template access remains represented separately by
`is_system_template`. No transport alias is retained because this repository has no supported-old-client policy,
and all current source clients use the canonical field after this change.
