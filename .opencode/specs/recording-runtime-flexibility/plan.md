# Plan

## Phase 1 - Contract Design

Goal: define the new recording contract before implementation changes split across mobile and core.

Implementation detail:

1. Add locked `sessionClass` semantics for `gps_tracked` vs `indoor_simulated`.
2. Separate immutable session identity from mutable guidance bindings.
3. Add runtime event contracts for plan/route/GPS/authority changes.
4. Decide what must persist into finalized artifacts and what can remain session-local in v1.
5. Define how plan+route estimated load should be modeled in shared/core logic.

Primary decisions required:

- whether non-GPS-started sessions may later enable telemetry-only GPS collection
- whether route simulation on indoor bikes is opt-in when plan control also exists
- whether treadmill split-axis control ships now or later

Deliverables:

- updated recording contract design
- explicit invariant list
- export/finalization semantics note

## Phase 2 - Recorder Runtime Refactor

Goal: make the mobile recorder dynamic where intended without allowing session-class drift.

Implementation detail:

1. Refactor route/plan changes into runtime guidance operations instead of identity mutation.
2. Keep category and session class locked after start.
3. Split `gpsModeAtStart`, `gpsCollectionState`, and `gpsAvailability`.
4. Publish a canonical session view that includes identity, guidance, and authority state.
5. Remove UI assumptions that route/plan changes are pre-start only.

Deliverables:

- recorder runtime APIs for attach/detach/swap behaviors
- canonical session-view update path
- updated mobile state ownership rules

## Phase 3 - Route Runtime Modes

Goal: make routes meaningfully different in GPS and non-GPS sessions.

Implementation detail:

1. Complete live route-following behavior for GPS-tracked sessions.
2. Complete virtual-route progression for indoor-simulated sessions.
3. Derive indoor route progress from canonical distance sources.
4. Define route attachment precedence: session route over plan route.
5. Add degraded handling for GPS loss without session reclassification.

Deliverables:

- GPS route-following contract
- indoor virtual-course contract
- route-progress source rules

## Phase 4 - Trainer Authority And ERG

Goal: encode predictable trainer behavior across manual, plan, and route-driven scenarios.

Implementation detail:

1. Define explicit automatic authority selection and precedence.
2. Keep manual mode as top priority.
3. Default indoor bike behavior to plan ERG when both plan and route are attached.
4. Define reconnect recovery rules.
5. Either define treadmill split-axis control fully or defer it explicitly.

Deliverables:

- trainer authority matrix
- ERG / route simulation interaction rules
- reconnect and degraded recovery rules

## Phase 5 - UX And Validation

Goal: expose the new flexibility clearly and validate the high-risk scenarios.

Implementation detail:

1. Redesign record setup and in-session guidance surfaces.
2. Surface locked session class, active bindings, and active trainer authority clearly.
3. Add behavior-focused tests for runtime attach/detach, route progression mode, and trainer precedence.
4. Add focused validation for finalization semantics.

Deliverables:

- updated recording UX
- focused test plan and verification commands
- handoff note for any deferred route-navigation polish
