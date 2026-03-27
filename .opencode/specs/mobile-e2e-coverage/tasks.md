# Tasks

## Coordination Notes

- Keep this spec focused on the active expansion plan, not historical stabilization detail.
- Add app-side anchors before writing flows that would otherwise depend on brittle copy.
- Prefer one stable root readiness anchor plus a small set of CTA anchors per screen.

## Open

### Phase 1 - Inventory And Anchor Design

- [x] Inventory the mobile screen surfaces across external, tabs, standard, and record stacks.
- [x] Audit existing Maestro flow coverage and reusable helpers.
- [x] Identify missing high-priority test anchors for deterministic flow expansion.

### Phase 2 - App Testability Pass

- [x] Add root readiness anchors for Home, Discover, Plan, and Record screens.
- [x] Add stable Discover search, tab, filter, and result-item anchors.
- [x] Add stable Record screen, activity picker, and plan picker anchors.
- [x] Add missing medium-priority list/detail screen anchors needed for the next planned journeys.

### Phase 3 - Flow Expansion

- [x] Add screen-entry Maestro flows for major destinations that still lack one.
- [ ] Add high-value journey flows for plans, calendar, profile, messages, and notifications.

## Pending Validation

- [ ] Targeted mobile typecheck after anchor additions.
- [ ] Focused Maestro flow runs for the first expanded journey batch.

## Completed Summary

- Captured the initial mobile E2E coverage specification, including app screen inventory, target coverage model, and a prioritized missing `testID` inventory.
- Added the first high-priority app testability anchors across Home, Discover, Plan, Record, record activity selection, and record plan selection; targeted mobile typecheck passed.
- Added a second anchor pass across training plans list, activities list, activity detail, routes list/detail, profile edit, training preferences, and integrations; targeted mobile typecheck passed again.
- Added reusable profile-opening flow scaffolding plus first-pass screen-entry and journey flows for plans, activities, routes, profile edit, integrations, training preferences, and sign-out without requiring full-suite execution during build-out.
