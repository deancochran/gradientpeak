# Plan

## Phase 1 - Inventory And Anchor Design

1. Confirm the mobile screen inventory across external, tab, standard, and record stacks.
2. Audit existing Maestro flows and current app-side selectors.
3. Identify missing high-value test anchors needed for broad deterministic coverage.

Exit criteria:

- A screen inventory and missing-anchor list are documented.

## Phase 2 - App Testability Pass

1. Add root readiness anchors to major screens that currently lack them.
2. Add stable CTA, input, and row anchors only where future flows need them.
3. Keep naming semantic and consistent across screen families.

Exit criteria:

- The app exposes the minimum stable anchors needed for the next flow wave.

## Phase 3 - Flow Expansion

1. Add or update reusable helpers where repeated navigation patterns emerge.
2. Implement screen-entry flows for major destinations.
3. Implement critical interaction journeys in priority order.

Exit criteria:

- The suite covers runtime gate, major screen entry, and the highest-value user journeys.

## Phase 4 - Verification And Iteration

1. Run focused flow checks while adding each coverage slice.
2. Re-run the standard local mobile E2E workflow after meaningful batches.
3. Record any remaining screen gaps or blocked journeys back into the active spec.

Exit criteria:

- Coverage expansion is verified proportionally and remaining gaps are explicit.
