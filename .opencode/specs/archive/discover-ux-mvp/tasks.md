# Discover UX MVP Tasks

## Open

- [x] Refresh Discover browse and search presentation.
- [x] Improve Discover list cards for training plans, routes, and users.
- [x] Reorder and simplify `activity-plan-detail` summary/actions flow.
- [x] Polish `training-plan-detail`, `route-detail`, and `user/[userId]` for browse-entry clarity.
- [x] Run targeted validation and record outcomes.

## Completed

- Added a lightweight browse intro, tab-aware search copy, activity category chips, and clearer result headers on Discover.
- Upgraded Discover cards so training plans, routes, and profiles expose better context before navigation.
- Added a follow-up Discover Jest screen test covering guided browse copy, category filter behavior, and tab-aware search helper text.
- Applied a second-pass visual polish to the Discover type switcher and metadata chips to improve hierarchy without changing flows.
- Added focused detail-screen Jest coverage for the new summary-first UX across activity plan, training plan, route, and profile screens.
- Reordered activity-plan detail to show summary context before actions and moved comments below the workout content.
- Added summary polish to training-plan, route, and profile detail screens without changing core flows.
- Validation passed: `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`, `pnpm --dir apps/mobile exec biome lint ...`, and targeted Jest for `tabs-layout.jest.test.tsx` and `user-detail-screen.jest.test.tsx`.
