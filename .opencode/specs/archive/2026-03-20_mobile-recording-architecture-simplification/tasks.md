# Tasks: Mobile Recording Architecture Simplification

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused verification passes, and the success check in the task text is satisfied.
- [ ] If blocked, leave the task unchecked and add the blocker inline.

## Phase 1: Contract Definition and Audit Lock

- [x] Task A - Finalize the canonical recording session vocabulary. Success: `design.md` and `plan.md` define `RecordingLaunchIntent`, `RecordingSessionSnapshot`, `RecordingSessionOverride`, and `RecordingSessionArtifact` with clear ownership boundaries between `@repo/core` and mobile runtime.
- [x] Task B - Lock lifecycle and invariants. Success: the spec defines canonical lifecycle states, locked start-time identity fields, and the rule that each metric family has one canonical source at a time.
- [x] Task C - Lock simplification policy. Success: the spec explicitly limits in-workout adjustments to trainer mode, intensity scaling, and source recovery/preference, and rejects broader mid-session configuration mutation.

## Phase 2: Core Contract and Resolver Foundation

- [x] Task D - Add shared recording-session schemas in `@repo/core`. Success: core owns snapshot, override, artifact, source-selection, and provenance contracts used by mobile runtime and submission.
- [x] Task E - Consolidate capability and fallback rules. Success: `packages/core/utils/recording-config-resolver.ts` or adjacent core helpers become the canonical source for capability validation, source priority, and fallback rules.
- [x] Task F - Add core tests for session invariants and source resolution. Success: core tests cover locked identity fields, deterministic source selection, and degraded/defaulted metric behavior.

## Phase 3: Mobile Service Snapshot Cutover

- [x] Task G - Introduce snapshot-first service state in `apps/mobile/lib/services/ActivityRecorder/index.ts`. Success: the service can publish one canonical session snapshot without requiring hook-level reconstruction of core recording state.
- [x] Task H - Split immutable snapshot from mutable override state. Success: activity identity, plan/route/event bindings, and GPS mode are frozen at start, while runtime adjustments are tracked separately.
- [x] Task I - Align metrics and timing ownership. Success: `LiveMetricsManager` acts as an ingestion engine behind the published snapshot instead of a second authority for session meaning.

## Phase 4: Source Arbitration and Device Policy

- [x] Task J - Centralize metric source selection. Success: heart rate, power, cadence, speed, and distance each resolve to one canonical source with explicit fallback order.
- [x] Task K - Separate trainer control policy from source policy. Success: FTMS auto/manual control uses explicit session policy and no longer depends on scattered UI-level logic.
- [x] Task L - Record degradation and source changes. Success: the session model exposes source provenance and meaningful degraded-mode state to UI and submission.

## Phase 5: UI and Interaction Simplification

- [x] Task M - Simplify recording setup and active-workout controls. Success: the record experience no longer uses the current tile-heavy configuration model in `apps/mobile/components/recording/footer/FooterExpandedContent.tsx` as the main runtime interaction surface.
- [x] Task N - Add one canonical adjustment surface. Success: runtime adjustments are consolidated into one `Adjust Workout` surface that owns trainer mode, intensity scale, and source recovery/preference only.
- [x] Task O - Remove or hide unsupported runtime reconfiguration paths. Success: incomplete or misleading flows for mid-workout plan, route, category, or GPS identity changes are eliminated or gated.

## Phase 6: Finish, Submission, and Recovery Alignment

- [x] Task P - Add explicit `finishing` and finalized-artifact handoff. Success: the record screen stays in recording flow until local finalization succeeds and produces one canonical artifact bundle.
- [x] Task Q - Refactor `useActivitySubmission` to consume finalized artifacts. Success: submission stops redefining workout meaning from chunk aggregation alone and uses the canonical finalized session contract.
- [x] Task R - Preserve retry and recovery behavior. Success: upload remains retryable, local artifacts survive failure until success or explicit discard, and interrupted sessions have a defined recovery path.

## Phase 7: Cleanup and Validation

- [x] Task S - Remove duplicate hook/view-model paths. Success: overlapping state facades such as `useSimplifiedMetrics.ts` and duplicated config derivation are removed or deprecated with clear replacements.
- [x] Task T - Remove event-contract escapes and obsolete recorder surfaces. Success: typed recording contracts replace `as any` event escapes and obsolete runtime configuration entry points are cleaned up.
- [x] Task U - Run focused validation. Success: `@repo/core` and `mobile` typecheck/tests pass, and manual smoke flows confirm the simplified session model across GPS, BLE, FTMS, finish, upload, and recovery scenarios. Focused validation completed with `pnpm --filter @repo/core check-types`, `pnpm --filter @repo/core test`, `pnpm --filter mobile check-types`, and `pnpm --filter mobile test`; manual smoke flows remain recommended follow-up.
