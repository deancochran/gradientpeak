# Mobile Charts

This folder contains reusable chart components used by mobile training and trends surfaces.

## Current components

- `TrainingLoadChart.tsx` for CTL, ATL, and TSB trends.
- `WeeklyProgressChart.tsx` for recent weekly completion summaries.
- `IntensityDistributionChart.tsx` for zone-distribution visualization.
- `index.ts` for public exports.

## Notes

- Keep chart props app-facing and data-source agnostic.
- Prefer shared formatting and labels over screen-specific copy in the components.
- Put screen orchestration, queries, and navigation behavior outside this folder.
