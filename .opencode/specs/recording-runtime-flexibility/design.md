# Recording Runtime Flexibility
## Objective
Redesign mobile recording so users can attach/detach plans and routes before or during a workout while preserving clear session meaning, predictable trainer behavior, and distinct GPS vs indoor route behavior.

## Why This Spec Exists
- The current recorder locks plan, route, and GPS identity once recording starts.
- That protects data quality but blocks the desired UX.
- Routes need to be first-class features, not just pre-start metadata.
- GPS-backed route following and indoor virtual-route riding are different product behaviors and should not share one mutable model.

Repo grounding: `ActivityRecorder/index.ts` currently blocks post-start identity changes, `FooterExpandedContent.tsx` reflects setup-before-start semantics, `ZoneA.tsx`/`VirtualRouteMap.tsx` already separate GPS-route vs indoor-virtual-route rendering, and `packages/core/schemas/recording-session.ts` already provides a base for session identity, runtime overrides, and trainer intents.

## Product Goals
1. Users can attach/detach/swap routes during a workout.
2. Users can attach/detach/swap plans during a workout.
3. A GPS-started session stays GPS-classed for its full lifetime.
4. A non-GPS-started session stays indoor/non-GPS-classed for its full lifetime.
5. GPS sessions use routes for live route-following guidance.
6. Non-GPS sessions use routes for virtual-course guidance.
7. Plans and routes can both contribute to estimated load/TSS.
8. Trainer behavior stays predictable across ERG, route simulation, reconnect recovery, and manual override.
9. Route UX should culminate in an elevation-profile surface with a live user marker that riders can watch during the workout, analogous to the activity-plan intervals chart.

## Non-Goals
- No switching session class after start.
- No requirement for full turn-by-turn navigation in the first slice.
## Core Design Decision
Split recording into three layers:
1. `SessionIdentity` — immutable after recording begins.
2. `GuidanceBindings` — mutable plan/route attachments during the session.
3. `RuntimeEvents` — timestamped changes that explain what changed during the workout.
## Locked Session Identity
Lock these at start:
- `activityCategory`
- `sessionClass`
- `gpsModeAtStart`
- `modeAtStart` (`free` or `planned`)
- starting `eventId` if launched from a scheduled event
### `sessionClass`
Add a locked session-class field:
- `gps_tracked`
- `indoor_simulated`

Rules:
- GPS enabled at start -> `gps_tracked`
- GPS disabled at start -> `indoor_simulated`
- session class never changes after start
- GPS loss degrades fidelity but does not reclassify the workout
- enabling GPS later in an indoor-simulated workout does not turn it into a GPS-tracked navigation workout

## Mutable Guidance Bindings
These may change before or during a workout:
- attached activity plan
- attached route
- trainer automatic authority selection where allowed

Rules:
- plan attach is allowed only when plan category matches locked session category
- route attach/detach is allowed during recording
- session route overrides plan route
- detach affects future guidance only and does not rewrite prior session meaning
- attaching a plan mid-session begins plan execution at attach time only

## GPS Model
Separate these concepts:
1. `gpsModeAtStart` — locked identity
2. `gpsCollectionState` — runtime collection on/off
3. `gpsAvailability` — hardware/permission/signal availability
Rules:
- `gpsModeAtStart` determines session class and export semantics
- `gpsCollectionState` may change only within the bounds allowed by the locked session class
- `gpsAvailability` may degrade independently
- a GPS-started session never becomes indoor/non-GPS because GPS became unavailable

## Route Behavior
### GPS-Tracked Session
When `sessionClass = gps_tracked`, an attached route is a live route-following artifact with:
- route overlay on map
- breadcrumb/current position tracking
- route progress
- distance/elevation remaining
- a prominent elevation profile with a live user marker riders can reference while moving
In this mode, the route is navigational, not an indoor simulation authority.
### Indoor-Simulated Session
When `sessionClass = indoor_simulated`, an attached route is a virtual course artifact with:
- virtual position progression along route geometry
- distance/elevation/grade remaining
- optional trainer simulation inputs where machine capabilities allow it
- merged plan + route guidance for indoor workouts
- the same elevation profile pattern with a live virtual rider marker, comparable in prominence to the activity-plan intervals chart
In this mode, the route is not presented as live navigation.

### Route Progress Rules
- GPS sessions derive route progress from position/GPS path.
- Indoor sessions derive route progress from the recorder’s canonical distance source.
- Indoor virtual-route progress must not depend on GPS callbacks.

## Activity Plan Behavior
Plans remain the structured workout authority for steps, targets, and intended workout logic.

Rules:
- plans may be attached at start or mid-session
- plan category must match locked session category
- plan may carry a default route
- direct session route attachment overrides a plan route
- detaching a plan stops future guidance only

## Estimated Load / TSS
Both plans and routes should contribute to estimated demand.
- plan contributes interval structure, targets, and intended duration
- route contributes terrain, grade distribution, and route-demand assumptions
- plan + route should support a merged estimate better than either one alone
- indoor route simulation may modify expected resistance/pacing even without GPS
- this logic belongs in shared/core code, not mobile UI

## Trainer / ERG Rules
### Automatic Authorities
Trainer control should recognize:
- plan control
- route simulation control
- reconnect recovery of the active auto mode
Manual control is always separate.

### Global Precedence
For each actuator family, precedence is:
1. manual
2. reconnect recovery of the active auto authority
3. plan control
4. route simulation control

Only one automatic authority may control a trainer actuator family at a time.

### Machine Guidance
#### Indoor Bike / Smart Trainer
- default with plan + route attached: plan ERG / plan target control wins
- route is informational unless the user explicitly selects route simulation authority
- if route simulation is selected, prefer FTMS simulation or equivalent resistance-grade behavior where supported
- manual mode suspends automatic plan and route control until explicitly released

#### Treadmill
- plan may control speed
- route may control incline
- split-axis control is allowed only if implementation and UX can explain it clearly
- otherwise plan control wins and route remains informational

#### Rower / Elliptical / Generic Trainer
- route simulation is informational unless a machine-specific mapping is intentionally designed
- plan and manual controls remain primary

### ERG Rules
- ERG is plan-centric by default
- route simulation must not silently fight ERG control
- switching from plan ERG to route simulation requires explicit user action when both exist
- reconnect recovery restores the last active authority but may not override active manual mode

## Runtime Event Model
Add explicit timestamped session events for at least:
- `plan_attached`
- `plan_detached`
- `route_attached`
- `route_detached`
- `gps_collection_changed`
- `gps_availability_changed`
- `auto_authority_changed`
- `trainer_mode_changed`

These events should feed the active UI, finalized local artifacts, and support tooling.

## UI Direction
### Before Start
Expose:
- activity category
- GPS start mode
- plan attach/detach
- route attach/detach
- sensors/trainer readiness

### During Recording
Expose a dedicated runtime guidance surface for:
- attach/detach/swap route
- attach/detach/swap plan
- review GPS state and degraded status
- select trainer authority where relevant

Route guidance should include a dedicated watchable route surface, not only a map. The target experience is an elevation-profile chart with a live rider marker and progress context that users can monitor while riding, similar in utility and persistence to the activity-plan intervals chart.

The active summary should clearly show:
- locked session class
- active plan/route bindings
- active trainer authority
- degraded warnings

## Data Contract Changes
### Shared/Core
Add:
- `sessionClass`
- guidance-binding structures separate from immutable activity snapshot
- runtime attachment/detachment event types
- trainer automatic-authority state
- plan-only, route-only, and plan+route estimation hooks

### Mobile Recorder
Refactor so it:
- keeps identity locking for category and session class
- treats plan/route changes as runtime guidance operations
- publishes runtime guidance separately from immutable snapshot identity
- drives indoor route progress from canonical distance sources
- makes trainer authority explicit instead of implicit

## Required Invariants
1. A GPS-started session never becomes an indoor/non-GPS session.
2. An indoor-started session never becomes a true live-navigation workout.
3. Mid-session plan attach must match locked activity category.
4. Detach stops future guidance only.
5. Manual trainer mode always overrides automatic control until released.
6. Only one automatic authority controls a trainer actuator family at a time.
7. Indoor virtual-route progress is based on canonical distance, not GPS-only callbacks.
8. Finalization/export uses locked session identity rather than latest mutable UI state.

## Implementation Phases
### Phase 1 - Contract And Invariants
- add `sessionClass`
- define immutable identity vs mutable guidance bindings
- add runtime event contracts
- define finalization/export semantics

### Phase 2 - Recorder Runtime Refactor
- refactor plan/route changes into runtime guidance operations
- separate `gpsModeAtStart`, `gpsCollectionState`, and `gpsAvailability`
- publish canonical session view with identity + guidance + authority state

### Phase 3 - Route Runtime Modes
- complete live route-following for GPS sessions
- complete canonical-distance-based indoor virtual-route progression
- clarify route precedence and degraded handling

### Phase 4 - Trainer Authority And ERG
- encode authority selection and precedence
- support bike plan-vs-route authority decisions
- define or defer treadmill split-axis behavior explicitly

### Phase 5 - Estimation And UX
- add shared route-only and plan+route estimated demand modeling
- redesign the recording UI around runtime guidance changes
- add focused validation for attach/detach, degradation, and authority transitions

## Open Questions
- Should indoor-simulated sessions be allowed to enable telemetry-only GPS later without changing session class?
- For indoor bikes with both route and plan attached, should route simulation be opt-in or selected at attach time?
- Which runtime events must persist in finalized artifacts in v1?
