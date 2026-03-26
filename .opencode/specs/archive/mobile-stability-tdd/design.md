# Mobile Stability TDD

## Objective

Stabilize the highest-friction mobile product flows by shifting test ownership to the right layers and fixing regressions with test-driven development.

## Scope

- Use Maestro for real user journeys across auth, onboarding, calendar, plans, detail pages, mutations, and the later Discover redesign.
- Use Jest native screen/component tests for capability-level behavior inside screens and components.
- Start with onboarding and auth stability.
- Continue with calendar interaction stability.
- Redesign Discover after the stability work is in place.

## Testing Ownership

### Maestro owns runtime journeys

- sign up to verify
- onboarding happy path
- onboarding skip-heavy path
- tab smoke
- calendar create or edit saved-event journey
- one Discover browse journey after redesign
- detail-page open, edit, duplicate, and delete journeys for activity plans, training plans, events, routes, goals, and profiles where supported
- cross-tab side-effect journeys where calendar, plan, and detail pages must stay in sync

### Jest owns capability and regression behavior

- required vs optional onboarding steps
- skip availability and skip effects
- generated estimates only applying on explicit user action
- input values staying user-controlled during rerenders
- auth validation and error mapping
- calendar explicit selection vs passive scroll behavior
- calendar infinite extension and snap behavior
- Discover tab, filter, pagination, and mobile-first interaction behavior

## Key Product Rules

- Do not mock shared input widgets in the critical regression suites when the bug could live inside those widgets.
- Mock external boundaries only: router, network, Supabase, tRPC, and native OS surfaces.
- Prefer visible behavior assertions and stable `testID`s over tree-shape assertions.
- Fix the tests first, then fix the product behavior to satisfy them.

## Initial Work Order

1. Onboarding and auth stability
2. Calendar stability
3. Discover redesign and simplified coverage

## Success Criteria

- Onboarding users can skip optional steps and are not blocked by forced derived values.
- Auth and onboarding routing regressions are covered by both Jest and Maestro where appropriate.
- Calendar scroll interactions no longer flicker or override explicit selection.
- Discover redesign ships with a smaller, clearer mobile interaction surface and matching tests.
