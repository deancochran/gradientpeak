# Plan

## Phase 1 - Onboarding And Auth Stability

Goal: make sign-up, verify, and onboarding deterministic and user-controlled.

1. Replace happy-path-only Jest coverage with capability-focused tests.
2. Keep real shared inputs in the critical onboarding regression suite.
3. Fix skip logic, validation gating, and estimate overwrite behavior.
4. Add or update one Maestro alternative onboarding journey after Jest coverage is stable.

Exit criteria:

- optional onboarding steps can be skipped
- required steps still gate progression
- derived estimates never overwrite manual user input unless explicitly chosen
- auth screen validation and routing errors are covered

## Phase 2 - Calendar Stability

Goal: make scrolling, snapping, and browse state feel stable and predictable.

1. Add failing Jest coverage for scroll lifecycle churn and explicit selection preservation.
2. Reduce scroll-driven state churn in the calendar tab.
3. Keep infinite extension behavior while preventing visible flicker.
4. Add or update one Maestro saved-event journey.

Exit criteria:

- passive scroll does not overwrite explicit selection
- week snapping happens predictably without duplicate jump behavior
- infinite scroll remains available without visible flicker

## Phase 3 - Discover Redesign

Goal: redesign Discover into a clearer mobile-first surface with smaller cognitive load.

1. Define the simplified default state.
2. Add Jest coverage for the redesigned mobile interaction model.
3. Implement the redesign and update the relevant Maestro browse journey.

Exit criteria:

- Discover has less forced copy and interaction density
- tests cover the intended mobile-first browse model

## Phase 4 - Maestro Journey Expansion

Goal: grow Maestro from smoke coverage into stable mutation and detail-page user journeys.

1. Add reusable seeded-session helpers and a fixture matrix.
2. Add stable `testID`s for mutation-heavy detail pages and composer tabs.
3. Add journey flows for onboarding skip paths, discover/profile opens, calendar mutations, activity-plan scheduling, training-plan duplication and scheduling, and plan-tab side effects.
4. Keep Maestro focused on runtime cross-screen confidence while Jest continues to own screen capability behavior.

Exit criteria:

- critical detail pages have stable selectors for major actions
- auth, onboarding, discover, calendar, activity-plan, and training-plan journeys are organized by domain
- seeded data requirements are explicit and reusable
