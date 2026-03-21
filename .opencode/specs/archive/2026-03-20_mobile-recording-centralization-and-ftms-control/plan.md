# Implementation Plan: Mobile Recording Centralization and FTMS Control Simplification

## 1. Strategy

Implement this refactor in seven phases that progressively remove split ownership while keeping the recorder working at each step.

Order of operations:

1. lock ownership contracts in `@repo/core`,
2. introduce a dedicated session controller,
3. centralize plan execution,
4. centralize trainer control,
5. serialize FTMS command dispatch,
6. cut UI and hooks over to selectors and intent dispatch,
7. clean up bypass paths and defer submission cleanup unless it blocks architecture.

## 2. Planned File Changes

### Core policy and contracts

- `packages/core/schemas/recording-session.ts`
- `packages/core/utils/recording-config-resolver.ts`
- `packages/core/utils/recording-source-resolver.ts`
- `packages/core/utils/recording-trainer-policy.ts` (new)
- `packages/core/utils/recording-plan-target-resolver.ts` (new)

### Mobile service decomposition

- `apps/mobile/lib/services/ActivityRecorder/index.ts`
- `apps/mobile/lib/services/ActivityRecorder/sessionController.ts` (new)
- `apps/mobile/lib/services/ActivityRecorder/planExecution.ts` (new)
- `apps/mobile/lib/services/ActivityRecorder/trainerControl.ts` (new)
- `apps/mobile/lib/services/ActivityRecorder/artifactFinalizer.ts` (new)
- `apps/mobile/lib/services/ActivityRecorder/plan.ts`
- `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts`

### Hooks and UI cutover

- `apps/mobile/lib/hooks/useActivityRecorder.ts`
- `apps/mobile/app/(internal)/record/ftms.tsx`
- `apps/mobile/components/recording/ftms/BikeControlUI.tsx`
- `apps/mobile/components/recording/ftms/RowerControlUI.tsx`
- `apps/mobile/components/recording/ftms/EllipticalControlUI.tsx`
- `apps/mobile/components/recording/ftms/TreadmillControlUI.tsx`
- `apps/mobile/components/recording/footer/FooterExpandedContent.tsx`

## 3. Phase Plan

### Phase 1: Lock central ownership contracts

Define the recording, session, and trainer ownership model in shared code.

Deliverables:

- shared trainer policy contract,
- shared plan-target resolution contract,
- explicit centralize-vs-local ownership rules encoded in type and helper boundaries,
- canonical session view fields needed by UI,
- explicit authority map for events, transitions, and published fields,
- a compatibility plan for `useActivityRecorder.ts` selectors before code migration begins.

Success condition:

- mobile can depend on `@repo/core` for capability, source, and trainer policy decisions without re-deriving them in UI.

### Phase 2: Add `sessionController.ts`

Create a dedicated mobile session authority and move canonical session publication out of the god object.

Responsibilities:

- hold immutable snapshot,
- hold override state,
- publish `RecordingSessionView`,
- own trainer mode and degraded-state publication,
- provide selectors/hooks one authoritative shape.

Guardrail:

- `sessionController.ts` publishes the canonical view but does not take ownership of plan progression logic or trainer command generation.

Success condition:

- hooks can answer current session meaning through one controller-owned shape.

### Phase 3: Add `planExecution.ts`

Move all step progression ownership into one module.

Responsibilities:

- current step,
- time in step,
- advance/skip/pause progression,
- event emission for progression changes.

Migration steps:

- extract overlapping progression behavior from `index.ts`,
- reduce `plan.ts` to step expansion and compatibility if needed,
- make UI read progression selectors only.

Success condition:

- there is exactly one owner for step progression.

Phase boundary:

- phases 1-3 are limited to recording/session/trainer ownership foundations and must not absorb submit/finalization cleanup unless a blocking dependency is discovered.

### Phase 4: Add `trainerControl.ts`

Move all workout-to-trainer translation into one engine.

Responsibilities:

- consume plan execution state and live readings,
- apply manual/auto arbitration,
- resolve trainer control intents,
- reapply on reconnect if allowed,
- expose trainer status to the session controller.

Required split inside trainer control:

- control intent resolution,
- device adaptation,
- transport queue delegation.

Critical rule:

- FTMS pages and machine UIs must stop applying plan targets themselves.

Success condition:

- only `trainerControl.ts` emits automatic trainer commands.

### Phase 5: Queue FTMS writes in `FTMSController.ts`

Replace "reject when blocked" behavior with serialized command handling.

Requirements:

- write queue with FIFO semantics,
- ability to coalesce superseded auto-control updates,
- explicit result reporting back to trainer control,
- no direct mode thrash from competing callers.

Command precedence must be enforced:

1. `manual`
2. `reconnect recovery`
3. `step change`
4. `periodic refinement`

Success condition:

- step changes, reconnects, and manual toggles no longer drop or interleave trainer commands unpredictably.

### Phase 6: UI and hooks cutover

Convert UI to session selectors and explicit intent dispatch.

FTMS page target shape:

- reads canonical machine type and trainer mode from session view,
- dispatches `setTrainerMode`, `setManualPower`, `setManualResistance`, `setManualSimulation`, `setManualSpeed`, `setManualIncline`, or similar high-level actions,
- contains no recurring trainer control loop.

Machine UI target shape:

- local draft state only,
- confirm/apply buttons dispatch high-level intents only,
- banners and disabled states derived from canonical trainer state.

Success condition:

- no component outside the trainer engine calls low-level FTMS commands directly.

### Phase 7: Cleanup and follow-up boundary

Complete the ownership shift by removing bypass paths.

Actions:

- delete direct `service.sensorsManager` consumption from UI,
- remove duplicated compatibility hooks that reconstruct separate truth sources,
- trim service surface area down to controller-level actions.

Follow-up scope, not first-wave scope:

- `apps/mobile/lib/hooks/useActivitySubmission.ts`
- `apps/mobile/lib/services/ActivityRecorder/finalizedArtifactStorage.ts`

These paths move into a later follow-up unless session/trainer architecture work reveals a blocking dependency.

Success condition:

- recording and FTMS control consume one coherent state model, and any submit cleanup is either unchanged and explicitly deferred or promoted into a separate follow-up task due to a documented blocker.

## 4. Validation Plan

### Focused checks

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter mobile check-types
pnpm --filter mobile test
```

### Required manual smoke flows

- planned bike workout in auto trainer mode,
- auto -> manual -> auto mode switching mid-step,
- trainer reconnect during planned workout,
- rower and elliptical predictive control behavior after cutover,
- treadmill step change with speed target,
- verify submission remains behaviorally unchanged unless a blocking dependency requires a minimal change.

### FTMS-specific verification

- verify only one command path issues plan-driven trainer commands,
- verify queued writes do not drop on rapid step changes,
- verify manual commands override pending auto intents correctly,
- verify UI disables and banners reflect canonical trainer mode rather than local page state.

## 5. Completion Definition

- `ActivityRecorderService` is no longer the de facto owner of every recording concern,
- FTMS screens are thin manual-control views,
- one serialized trainer command path exists,
- hooks consume one canonical session view,
- submission cleanup is either unchanged and explicitly deferred or extracted into a separate follow-up spec.
