# Design: Mobile Recording Centralization and FTMS Control Simplification

## 1. Objective

Refactor the mobile recording stack so ownership is explicit by package and file, FTMS command flow has one authority, and the active workout UI becomes a thin consumer of canonical session state.

This spec turns the earlier recording simplification work into a concrete centralization map for implementation.

Primary outcomes:

- one central owner for session meaning,
- one central owner for plan execution,
- one central owner for trainer automation and FTMS command dispatch,
- a clear "centralize vs keep local" contract for every major recording concern,
- elimination of duplicated FTMS automation and avoidable race conditions.

## 2. Problem Statement

The current recording stack still spreads control across `@repo/core`, the mobile recorder service, hooks, the FTMS page, and machine-specific FTMS UIs.

The most important drift points are:

- `apps/mobile/lib/services/ActivityRecorder/index.ts` still acts as a god object and leaks subsystem escape hatches.
- `apps/mobile/components/recording/ftms/BikeControlUI.tsx`, `RowerControlUI.tsx`, `EllipticalControlUI.tsx`, and `TreadmillControlUI.tsx` each contain automation logic that overlaps with recorder-level auto control.
- `apps/mobile/app/(internal)/record/ftms.tsx` owns machine detection and a local auto/manual toggle even though trainer mode already exists in service override state.
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` blocks overlapping writes instead of serializing them, which causes dropped commands under bursty control flows.
- `apps/mobile/lib/hooks/useActivityRecorder.ts` still exposes multiple shapes that reconstruct overlapping session meaning.

The result is split authority, command conflicts, and hard-to-predict behavior during step changes, workout start, trainer reconnects, and manual/auto switching.

## 3. Current Repo Findings

### A. Main ownership hotspots

- `packages/core/schemas/recording-session.ts` already holds the canonical session contract foundation.
- `packages/core/utils/recording-config-resolver.ts` and `packages/core/utils/recording-source-resolver.ts` already hold some of the shared policy foundation.
- `apps/mobile/lib/services/ActivityRecorder/index.ts` currently mixes lifecycle, snapshot/override publication, plan execution, trainer auto control, device policy, and artifact coordination.
- `apps/mobile/lib/services/ActivityRecorder/sensors.ts` correctly owns BLE transport and FTMS device I/O, but its public surface is widely consumed.
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` owns low-level FTMS mode switches and write/response handling.
- `apps/mobile/lib/services/ActivityRecorder/plan.ts` owns step expansion and some progression state, but the service still duplicates progression behavior.
- `apps/mobile/app/(internal)/record/ftms.tsx` and `apps/mobile/components/recording/ftms/*.tsx` own machine rendering, but also duplicate trainer policy and auto-control decisions.

### B. Concrete FTMS conflict findings

- `apps/mobile/lib/services/ActivityRecorder/index.ts:2219` auto-applies plan targets on `stepChanged`, recording start, and trainer hot-plug.
- `apps/mobile/components/recording/ftms/BikeControlUI.tsx:184`, `apps/mobile/components/recording/ftms/RowerControlUI.tsx:160`, `apps/mobile/components/recording/ftms/EllipticalControlUI.tsx:165`, and `apps/mobile/components/recording/ftms/TreadmillControlUI.tsx:61` also auto-apply plan targets from UI.
- `apps/mobile/components/recording/ftms/BikeControlUI.tsx:222`, `apps/mobile/components/recording/ftms/RowerControlUI.tsx:194`, and `apps/mobile/components/recording/ftms/EllipticalControlUI.tsx:199` run recurring control loops that can overlap with recorder-level control.
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts:934` rejects writes while blocked instead of queuing them.
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts:468`, `:542`, `:610`, `:678`, `:748`, and `:883` reset and switch control modes per command family, so concurrent callers can thrash trainer mode.

## 4. Target Architecture

### A. One owner per major concern

#### 1. `@repo/core`

Core owns pure policy and contract logic only:

- recording session schemas,
- source arbitration rules,
- capability and readiness resolution,
- trainer auto-control eligibility,
- plan target resolution into canonical control intents,
- session invariant validation.

Core must not own BLE, GPS, storage, timers tied to React Native APIs, or direct FTMS commands.

#### 2. `apps/mobile/lib/services/ActivityRecorder/sessionController.ts`

New mobile session authority that owns:

- immutable session snapshot,
- mutable override state,
- published `RecordingSessionView`,
- lifecycle transitions,
- canonical selectors consumed by hooks and UI.

This controller becomes the only source of truth for active session meaning.

#### 3. `apps/mobile/lib/services/ActivityRecorder/planExecution.ts`

New mobile module that owns:

- step expansion consumption,
- step timers,
- step advance logic,
- pause/resume progression behavior,
- plan execution events exposed to the session controller.

`plan.ts` may remain as a step expansion helper or be absorbed, but step progression must stop being split across the service and UI.

#### 4. `apps/mobile/lib/services/ActivityRecorder/trainerControl.ts`

New mobile trainer control engine that owns:

- trainer mode state transitions,
- control intent resolution from plan/route/session state,
- auto/manual arbitration,
- reconnect recovery behavior,
- device adaptation handoff,
- transport queue delegation.

This engine is the only layer allowed to convert workout state into FTMS commands.

Trainer logic is split into three explicit layers:

- `control intent resolution` in `trainerControl.ts` converts session state, plan state, and manual user actions into canonical intents.
- `device adaptation` in mobile adapters translates canonical intents into machine-capability-aware FTMS commands.
- `transport queue` in `FTMSController.ts` serializes low-level FTMS writes and responses.

This prevents pure policy from depending on BLE device details while also preventing UI from becoming a policy owner.

#### 5. `apps/mobile/lib/services/ActivityRecorder/sensors.ts`

Keep as the BLE and FTMS transport adapter:

- scan/connect/disconnect,
- FTMS feature reads,
- FTMS command invocation,
- characteristic parsing,
- connection callbacks.

It must stop acting as shared app-wide control state.

#### 6. `apps/mobile/components/recording/ftms/*.tsx`

Machine UIs keep only:

- rendering,
- local draft inputs,
- safety prompts,
- explicit manual user intents.

They must not auto-apply plan targets, run recurring trainer-control loops, or infer the canonical trainer mode.

### B. New data flow

```text
@repo/core policy
  -> sessionController builds canonical view
  -> planExecution emits step/progression updates
  -> trainerControl consumes canonical session + plan state
  -> sensors adapter sends serialized FTMS commands
  -> FTMSController writes one command at a time
  -> UI reads selectors and dispatches manual intents only
```

### C. One trainer command pipeline

All FTMS commands must flow through one pipeline:

1. session or manual action creates a `TrainerControlIntent`,
2. trainer engine resolves it into one canonical command,
3. commands are serialized in a queue,
4. transport adapter sends command to FTMS,
5. session view records last applied target, mode, result, and recovery state.

No UI component may call `service.sensorsManager.setPowerTarget()` or sibling command methods directly once this cutover is complete.

## 5. Authority Map

This section names exact ownership so the refactor does not replace one god object with several overlapping modules.

### A. Event ownership

| Event | Owner | Notes |
| --- | --- | --- |
| `snapshotCreated` | `sessionController.ts` | emitted once when the immutable session snapshot is locked |
| `sessionUpdated` / published `RecordingSessionView` | `sessionController.ts` | canonical published session shape for hooks and UI |
| `overrideApplied` | `sessionController.ts` | includes trainer mode and other allowed runtime overrides |
| `stepChanged` | `planExecution.ts` | derived only from canonical plan progression |
| `planProgressChanged` | `planExecution.ts` | includes current step, elapsed step time, and paused progression state |
| `trainerIntentResolved` | `trainerControl.ts` | internal boundary before device adaptation and queueing |
| `trainerCommandQueued` | `FTMSController.ts` or a thin trainer transport wrapper | low-level command pipeline status |
| `trainerCommandResult` | `trainerControl.ts` | normalized command outcome republished into session state |
| `sourceChanged` | `sessionController.ts` with core resolver input | source selection is reflected in session state, not raw adapter events |
| `degradedStateChanged` | `sessionController.ts` | canonical degraded state published for UI |
| `artifactReady` | current finalization path, unchanged in this spec | submission cleanup is deferred unless architecture work is blocked |

### B. Transition ownership

| Transition | Owner |
| --- | --- |
| `idle -> preparing -> ready -> recording -> paused -> finishing -> finished` | `sessionController.ts` |
| plan start, step advance, skip, pause progression, resume progression | `planExecution.ts` |
| trainer `auto <-> manual` mode | `trainerControl.ts`, persisted via `sessionController.ts` override state |
| trainer reconnect recovery reapply | `trainerControl.ts` |
| FTMS low-level mode switch and command flush | `FTMSController.ts` transport queue |

### C. Published field ownership

| Field / view slice | Owner |
| --- | --- |
| immutable session snapshot | `sessionController.ts` |
| runtime overrides | `sessionController.ts` |
| lifecycle state | `sessionController.ts` |
| current step / step progress | `planExecution.ts`, published through `sessionController.ts` |
| trainer mode | `trainerControl.ts`, published through `sessionController.ts` |
| last trainer command status | `trainerControl.ts`, published through `sessionController.ts` |
| machine type | device adaptation layer, published through `sessionController.ts` |
| source selection and degraded state | core policy + `sessionController.ts` |
| raw BLE device details | `sensors.ts` only, not a primary UI contract |

## 6. Ownership Matrix

| Concern | Centralize In | Keep Local In |
| --- | --- | --- |
| Session snapshot meaning | `packages/core/schemas/recording-session.ts`, `sessionController.ts` | none |
| Runtime overrides | `sessionController.ts` | temporary control input state in components |
| Plan execution state | `planExecution.ts` | plan display formatting |
| Trainer auto/manual policy | `packages/core/utils/*`, `trainerControl.ts` | toggle button rendering |
| FTMS command dispatch | `trainerControl.ts`, `FTMSController.ts` queue | none |
| BLE transport and parsing | `sensors.ts`, `FTMSController.ts` | none |
| Machine-type classification | canonical session selector | page layout selection |
| Source arbitration and degradation | `@repo/core` policy + session controller | warning copy and badges |
| GPS and location transport | mobile location adapter | map presentation |
| Finalized recording artifact | current finalization path, follow-up spec target | submit progress UI |
| Upload/retry | current submission flow, follow-up spec target | retry buttons and messaging |
| React hooks | selectors over canonical session view | local memoized display helpers |

## 7. FTMS Race Conditions to Eliminate

### A. Duplicate auto-apply triggers

Current collision cases:

- service `stepChanged` auto apply and machine UI `useEffect` auto apply,
- service recording-start auto apply and machine UI recording-start auto apply,
- trainer reconnect auto apply and machine UI interval loop auto apply,
- `manual -> auto` switch in UI and recorder-level reapply on the same transition.

Target rule:

- only `trainerControl.ts` may emit auto-control commands.

### Command precedence

When competing trainer intents exist, precedence is explicit:

1. `manual`
2. `reconnect recovery`
3. `step change`
4. `periodic refinement`

Rules:

- a higher-precedence intent may replace or cancel any lower-precedence queued auto-control intent that has not executed yet,
- manual intents remain authoritative until manual mode is explicitly released,
- reconnect recovery may reapply the current intended trainer state but may not silently override an active manual session,
- periodic refinement is optional and must never fight step-change or manual intent.

### B. Mode thrash between command families

Current issue:

- power, resistance, simulation, speed, incline, and cadence methods each reset and switch modes in `FTMSController.ts`.
- when different callers issue commands close together, mode resets can invalidate the previous command sequence.

Target rule:

- `trainerControl.ts` owns current desired trainer mode and must coalesce commands before they reach `FTMSController.ts`.

### C. Dropped writes under blocked control point

Current issue:

- `FTMSController.ts` returns failure immediately when the control point is blocked.

Target rule:

- FTMS writes are queued and resolved in order with explicit cancellation/coalescing semantics for superseded auto intents.

### D. Stale predictive loops

Current issue:

- bike, rower, and elliptical UIs each keep timer-based control loops that may act on stale cadence or stale steps.

Target rule:

- predictive updates, if retained, live only in `trainerControl.ts` and are fed by canonical live readings and current plan state.

## 8. File-Level Refactor Map

### A. `packages/core/`

Add or expand:

- `packages/core/schemas/recording-session.ts`
- `packages/core/utils/recording-config-resolver.ts`
- `packages/core/utils/recording-source-resolver.ts`
- new `packages/core/utils/recording-trainer-policy.ts`
- new `packages/core/utils/recording-plan-target-resolver.ts`

### B. `apps/mobile/lib/services/ActivityRecorder/`

Refactor:

- `index.ts` -> coordinator only
- new `sessionController.ts`
- new `trainerControl.ts`
- new `planExecution.ts`
- `plan.ts` -> step expansion / compatibility layer only
- `sensors.ts` -> transport adapter only
- `FTMSController.ts` -> queued transport primitive

### C. `apps/mobile/lib/hooks/`

Refactor:

- `useActivityRecorder.ts` -> selectors over one canonical `RecordingSessionView`
- remove direct manager access patterns
- deprecate compatibility hooks that reconstruct separate truth sources

### D. `apps/mobile/app/(internal)/record/` and components

Refactor:

- `ftms.tsx` -> page composition only
- machine UIs -> manual intent views only
- footer and adjust surfaces -> read-only session-derived state + explicit actions only

## 9. Compatibility Plan for `useActivityRecorder.ts`

Before implementation starts, the hook migration path must be explicit.

Rules:

- `useSessionView()` becomes the primary selector source for all new UI work.
- existing hooks in `apps/mobile/lib/hooks/useActivityRecorder.ts` remain temporarily only if they derive directly from the canonical session view or controller actions.
- no compatibility hook may read directly from `service.sensorsManager`, `plan.ts`, or other subsystem escape hatches once equivalent data is available in the session view.
- each compatibility wrapper must be marked temporary and mapped to its canonical replacement in migration notes.
- removal order must be decided before implementation begins: keep only wrappers required to avoid broad UI breakage in the first cut.

Initial compatibility expectation:

- keep lightweight selector wrappers like `usePlan()` only if they become simple adapters over `useSessionView()`,
- deprecate any hook that reconstructs an alternate source of truth,
- block new feature work on old hook shapes.

## 10. Invariants

- one active session has one canonical session controller,
- one plan execution engine owns current step and progression,
- one trainer control engine owns all automatic FTMS commands,
- one serialized FTMS command queue feeds the trainer,
- UI cannot bypass the canonical control pipeline,
- manual mode wins until explicitly released,
- submission cleanup is deferred unless the ownership refactor reveals a blocking dependency.

## 11. Non-Goals

- no BLE library replacement,
- no UI redesign beyond ownership-driven simplification,
- no cloud-first recording behavior,
- no attempt to preserve direct `sensorsManager` access for convenience if it conflicts with the ownership model,
- no submission/finalization redesign in the first implementation wave unless session/trainer architecture cannot land safely without a minimal blocking change.

## 12. Success Criteria

- FTMS screens no longer contain autonomous plan-following logic.
- `ActivityRecorderService` no longer directly owns all progression and trainer policy.
- one package/file map defines where each recording concern lives.
- FTMS command conflicts are resolved through serialization and single ownership.
- UI and hooks consume one canonical session view instead of parallel state shapes.
