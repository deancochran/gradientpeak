# Tasks

## Coordination Notes

- Preserve one singular recorder/session owner throughout this redesign.
- Keep `@repo/core` as the owner of pure contracts, invariants, and estimation logic.
- Do not allow runtime flexibility to silently rewrite saved workout meaning.
- Exact next step: lock the Phase 1 recording contract decisions for `sessionClass`, runtime guidance bindings, runtime events, and trainer automatic-authority semantics.

## Open

### Phase 1 - Contract Design

- [ ] Add `sessionClass` to the shared recording session contract.
- [ ] Define immutable identity fields versus mutable guidance bindings.
- [ ] Define runtime event types for plan attach/detach, route attach/detach, GPS collection/availability changes, and trainer authority changes.
- [ ] Decide artifact/finalization semantics for locked identity versus mutable runtime bindings.
- [ ] Define shared estimation ownership for plan-only, route-only, and plan+route demand.
- [ ] Decide whether non-GPS-started sessions may later enable telemetry-only GPS collection.
- [ ] Decide whether indoor-bike route simulation is opt-in when plan control is attached.
- [ ] Decide whether treadmill split-axis control is in scope now or deferred.

### Phase 2 - Recorder Runtime Refactor

- [ ] Refactor recorder APIs so plan attachment/detachment is a runtime guidance action instead of an identity mutation.
- [ ] Refactor recorder APIs so route attachment/detachment is a runtime guidance action instead of an identity mutation.
- [ ] Keep activity category and session class locked after start.
- [ ] Split `gpsModeAtStart`, `gpsCollectionState`, and `gpsAvailability` in the session view.
- [ ] Update recorder finalization to rely on locked session identity rather than last mutable UI state.
- [ ] Update record setup/detail UI to stop assuming plan/route changes are pre-start only.

### Phase 3 - Route Runtime Modes

- [ ] Implement or complete GPS-session live route-following behavior.
- [ ] Implement canonical-distance-based indoor virtual-route progression.
- [ ] Design and implement an elevation-profile route surface with a live rider marker, comparable in usefulness to the activity-plan intervals chart.
- [ ] Make session route attachment override plan route attachment.
- [ ] Handle GPS degradation without reclassifying the workout.
- [ ] Clarify route UX copy so GPS sessions are navigational and non-GPS sessions are virtual-course based.

### Phase 4 - Trainer Authority And ERG

- [ ] Encode explicit automatic-authority selection in trainer control.
- [ ] Keep manual trainer mode as top precedence.
- [ ] Default indoor bike plan+route sessions to plan ERG authority unless the user explicitly selects route simulation.
- [ ] Implement reconnect recovery without overriding an active manual session.
- [ ] Either implement treadmill split-axis behavior safely or defer it explicitly.
- [ ] Keep route simulation informational-only for unsupported machine types.

### Phase 5 - Estimated Demand And UX

- [ ] Add shared route-only estimated demand/TSS modeling.
- [ ] Add shared plan+route merged estimated demand/TSS modeling.
- [ ] Expose current session class, active plan/route bindings, and active trainer authority in the recording UI.
- [ ] Add an in-session guidance surface for attach/detach/swap operations.

## Pending Validation

- [ ] Add shared contract tests for `sessionClass`, runtime bindings, and runtime event schemas.
- [ ] Add recorder tests for mid-session plan attach/detach and route attach/detach.
- [ ] Add recorder tests proving GPS-started sessions cannot reclassify into indoor/non-GPS sessions.
- [ ] Add recorder tests proving indoor virtual-route progress uses canonical distance instead of GPS-only callbacks.
- [ ] Add trainer-control tests for manual > reconnect recovery > plan > route precedence.
- [ ] Add trainer-control tests for indoor bike plan+route authority behavior.
- [ ] Add focused mobile UI tests for runtime guidance actions.
- [ ] Run the narrowest relevant typecheck/test commands before implementation handoff or commit.

## Completed Summary

- Captured the new recording-runtime-flexibility design direction: lock session class and activity identity at start, but allow dynamic route and plan guidance during the session.
- Locked the core product distinction between GPS-tracked route following and indoor virtual-route usage.
- Defined the first-pass trainer/ERG authority direction so route simulation does not silently fight plan ERG control.
