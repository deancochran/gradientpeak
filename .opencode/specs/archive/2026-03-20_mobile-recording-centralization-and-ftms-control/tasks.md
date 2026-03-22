# Tasks: Mobile Recording Centralization and FTMS Control Simplification

## Coordination Rules

- [ ] Every implementation task names its owning file/package boundary before code changes start.
- [ ] A task is only complete when code lands, focused verification passes, and the success condition in the task text is satisfied.
- [ ] Any newly discovered bypass path or race condition is added inline to this file before or with the code that fixes it.

## Phase 1: Ownership Contract Lock

- [x] Task A - Lock the centralize-vs-local ownership matrix in shared contracts. Success: `design.md` and `plan.md` clearly define which concerns belong to `@repo/core`, mobile controllers, transport adapters, hooks, and UI surfaces.
- [x] Task B - Add an authority map to the spec and implementation notes. Success: events, lifecycle transitions, and published session fields each have one named owner before code extraction begins.
- [x] Task C - Add shared trainer policy helpers in `@repo/core`. Success: trainer auto-control eligibility, manual override precedence, and control-intent resolution rules no longer live only in mobile UI/service code.
- [x] Task D - Add shared plan-target resolution helpers in `@repo/core`. Success: plan targets resolve into canonical trainer intents without machine-specific UI duplication.
- [x] Task E - Define the compatibility plan for `apps/mobile/lib/hooks/useActivityRecorder.ts`. Success: kept wrappers, deprecated hooks, and canonical selector replacements are decided before implementation starts. Completed via `RECORDER_HOOK_COMPATIBILITY_PLAN` in `apps/mobile/lib/hooks/useActivityRecorder.ts` plus focused validation with `pnpm --filter @repo/core check-types`, `pnpm --filter @repo/core test -- recording-trainer-policy recording-plan-target-resolver recording-session recording-config-resolver recording-source-resolver`, and `pnpm --filter mobile check-types`.

## Phase 2: Session Controller Extraction

- [x] Task F - Introduce `apps/mobile/lib/services/ActivityRecorder/sessionController.ts`. Success: canonical session snapshot, overrides, lifecycle, trainer mode, and degraded-state publication are owned outside the god object. Added `sessionController.ts` and delegated snapshot, override, lifecycle, runtime-source, and session-view publication through it from `index.ts`.
- [x] Task G - Refactor `apps/mobile/lib/hooks/useActivityRecorder.ts` toward selector-first APIs. Success: hooks consume one canonical session view instead of reconstructing parallel state shapes. Added `useSessionSelector()`, moved `usePlan`, `useCurrentReadings`, and `useSessionStats` onto `RecordingSessionView`, and aligned activity status to snapshot/session selectors. Focused validation: `pnpm --filter mobile check-types`.

## Phase 3: Plan Execution Centralization

- [x] Task H - Introduce `apps/mobile/lib/services/ActivityRecorder/planExecution.ts`. Success: one module owns current step, time-in-step, step advancement, and progression pause/resume behavior. Added `planExecution.ts` and moved step indexing, step timing, plan time remaining, and advancement rules out of `index.ts`.
- [x] Task I - Reduce `apps/mobile/lib/services/ActivityRecorder/plan.ts` to step expansion and compatibility only. Success: plan progression logic is no longer split between `plan.ts`, `index.ts`, and UI effects. Simplified `plan.ts` to step expansion and compatibility shims while `planExecution.ts` now owns progression behavior. Focused validation: `pnpm --filter mobile check-types`.

## Phase 4: Trainer Control Centralization

- [x] Task J - Introduce `apps/mobile/lib/services/ActivityRecorder/trainerControl.ts`. Success: one engine owns all automatic FTMS command generation from plan, route, reconnect, and trainer-mode state. Added `trainerControl.ts` and moved automatic plan-step, route-grade, reconnect, and auto-mode reapply behavior out of `index.ts`.
- [x] Task K - Split trainer control into intent resolution, device adaptation, and transport queue delegation. Success: policy, hardware adaptation, and low-level FTMS writes no longer overlap in one layer. `trainerControl.ts` now resolves canonical intents via `@repo/core`, adapts them to machine capabilities including predictive resistance fallback, and delegates transport writes through `SensorsManager`/FTMS controllers.
- [x] Task L - Move manual/auto mode authority out of `apps/mobile/app/(internal)/record/ftms.tsx` local state. Success: canonical trainer mode is session-derived and UI only dispatches mode-change intents. `ftms.tsx` now derives mode from `useSessionView()` and only calls `setManualControlMode()`.
- [x] Task M - Remove UI-level autonomous plan-following logic from FTMS machine screens. Success: `BikeControlUI.tsx`, `RowerControlUI.tsx`, `EllipticalControlUI.tsx`, and `TreadmillControlUI.tsx` no longer auto-apply plan targets or run trainer-control timers. Focused validation: `pnpm --filter mobile check-types`.

## Phase 5: FTMS Command Serialization

- [x] Task N - Refactor `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` to serialize writes. Success: blocked writes are queued or coalesced instead of being dropped immediately. Implemented an internal FTMS command queue with pending-command coalescing in `FTMSController.ts` and threaded queue-aware command context through `sensors.ts`.
- [x] Task O - Enforce explicit command-precedence rules. Success: `manual > reconnect recovery > step change > periodic refinement` is encoded and verified in trainer command handling. FTMS queue insertion now uses source-aware preemption/coalescing, with manual/default UI commands outranking reconnect recovery, step change, and periodic refinement commands.
- [x] Task P - Ensure control-mode transitions are centralized and stable. Success: mode resets and command-family switching no longer thrash trainer state under concurrent intent sources. Control-mode switching now happens inside the queued FTMS pipeline so mode resets are serialized with the command they protect.
- [x] Task Q - Surface trainer command outcomes back to canonical session state. Success: session view exposes last command status, recovery state, and actionable errors. Added `trainer` state to `RecordingSessionView`, including `currentControlMode`, `recoveryState`, and `lastCommandStatus`, with updates published from `TrainerControl` and FTMS controller status getters. Focused validation: `pnpm --filter mobile check-types` and `pnpm --filter mobile test -- FTMSController`.

## Phase 6: UI and Bypass Path Cleanup

- [x] Task R - Remove direct `service.sensorsManager` FTMS command access from FTMS pages/components. Success: UI issues only high-level trainer intents through recorder/controller APIs. FTMS machine UIs now use `ActivityRecorderService` high-level manual trainer intent methods instead of calling `service.sensorsManager` FTMS commands directly.
- [x] Task S - Replace page-local machine detection with canonical session selectors. Success: `apps/mobile/app/(internal)/record/ftms.tsx` renders from session-derived trainer/machine state. The FTMS page now derives machine type from `useSessionView().trainer.machineType` instead of page-local detection state/effects.
- [x] Task T - Simplify record-screen adjustment surfaces around canonical trainer/session selectors. Success: footer and adjust surfaces read centralized session data and stop inferring device/trainer policy themselves. `FooterExpandedContent.tsx` now derives trainer availability/status from `useSessionView()` trainer state instead of `service.sensorsManager`, routes preferred-source actions through explicit handlers, and `app/(internal)/record/index.tsx` uses `useSensors()` instead of reading disconnected sensors directly from `service.sensorsManager`.

## Phase 7: Validation and Follow-up Boundary

- [x] Task U - Document submission/finalization as deferred follow-up unless blocked. Success: the first implementation wave does not absorb submit cleanup work without an explicit blocker note. No blocking dependency was discovered during Phases 1-6, so submission/finalization cleanup remains explicitly deferred to a follow-up spec per `plan.md`.
- [x] Task V - Add focused tests for FTMS conflict and queue behavior. Success: automated coverage exists for duplicate trigger suppression, manual override precedence, reconnect reapply behavior, and queued FTMS writes. Added `apps/mobile/lib/services/ActivityRecorder/FTMSController.test.ts` for queue coalescing, precedence, and status publication; the automated queue validation continues to pass during Phase 7 checks.
- [ ] Task W - Run focused validation and smoke flows. Success: `@repo/core` and `mobile` checks/tests pass and manual planned-workout FTMS smoke flows confirm stable auto/manual behavior. Automated validation passed with `pnpm --filter @repo/core check-types`, `pnpm --filter mobile check-types`, and `pnpm --filter mobile test -- FTMSController`; manual planned-workout smoke flows are still pending.
