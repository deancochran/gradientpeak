import {
  activityPlanStructureSchema,
  type CompiledActivityPlanOccurrence,
  compileValidatedActivityPlan,
  createInitialRecordingReducerState,
  createUnavailableAthletePerformanceTargetFacts,
  decideRecordingCommand,
  orderActivityPlanTargetsForPresentation,
  PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
  type PortableTimerRecordingDraft,
  type PortableWebPlanExecutionState,
  portableTimerRecordingDraftSchema,
  type RecordingActivityCategory,
  type RecordingCommand,
  type RecordingPlanExecutionSnapshot,
  type RecordingPlannedSessionLaunch,
  type RecordingSessionReducerState,
  type RecordingSessionSnapshot,
  recordingPlannedSessionLaunchSchema,
  reduceRecordingEvents,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import { assertRealRecordingExecution } from "@repo/core/recording/execution-evidence";
import {
  currentRecordingGuidance,
  type RecordingGuidanceTimeline,
  recordingGuidanceTimelineSchema,
  validateRecordingIntensityScale,
} from "@repo/core/recording/guidance";

export type TimerOnlyRecordingPlanConfiguration = {
  activityPlanId: string;
  scheduledEventId: string | null;
  name: string;
  description: string | null;
  activityPlanRevision: number;
  structureHash: string;
  structure: unknown;
  /** Immutable planned-session provenance and prescription, when selected from the calendar. */
  plannedSession?: RecordingPlannedSessionLaunch;
};

export type TimerOnlyRecordingConfiguration = {
  intensityScale?: number;
  activity_category: RecordingActivityCategory;
  eventId?: string;
  activityPlanId?: string;
  /** Selected route retained as context for the saved activity. */
  routeId?: string;
  plan?: TimerOnlyRecordingPlanConfiguration;
};

type TimerState = {
  startedAtMs: number | null;
  activeStartedAtMs: number | null;
  accumulatedMovingMs: number;
  excludedElapsedMs: number;
  endedAtMs: number | null;
};

export type TimerOnlyRecordingState = {
  guidance?: RecordingGuidanceTimeline;
  configuration: TimerOnlyRecordingConfiguration | null;
  reducer: RecordingSessionReducerState;
  timer: TimerState;
  planExecution: PortableWebPlanExecutionState | null;
};

export type TimerOnlyRecordingTransition = {
  state: TimerOnlyRecordingState;
  rejectedReason: string | null;
};

export type TimerOnlyRecordingTimes = {
  elapsedSeconds: number;
  activeSeconds: number;
  /** Public artifact compatibility alias. Web UI calls this active time. */
  movingSeconds: number;
};

export type TimerOnlyPlanStatus = {
  intensityScale: number;
  targetLabels: string[];
  totalOccurrences: number;
  currentOccurrence: CompiledActivityPlanOccurrence | null;
  currentOccurrenceIndex: number | null;
  currentStepElapsedSeconds: number;
  currentStepRemainingSeconds: number | null;
  processedCount: number;
  completedCount: number;
  skippedCount: number;
  currentLapElapsedSeconds: number;
  laps: PortableWebPlanExecutionState["laps"];
  nextOccurrence: CompiledActivityPlanOccurrence | null;
};

const initialTimerState = (): TimerState => ({
  startedAtMs: null,
  activeStartedAtMs: null,
  accumulatedMovingMs: 0,
  excludedElapsedMs: 0,
  endedAtMs: null,
});

export function createInitialTimerOnlyRecordingState(): TimerOnlyRecordingState {
  return {
    configuration: null,
    reducer: createInitialRecordingReducerState(),
    timer: initialTimerState(),
    planExecution: null,
  };
}

export function configureTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  configuration: TimerOnlyRecordingConfiguration,
): TimerOnlyRecordingTransition {
  if (state.reducer.lifecycle === "recording" || state.reducer.lifecycle === "paused") {
    return { state, rejectedReason: "Cannot reconfigure an active recording." };
  }
  if (configuration.plan) {
    const parsed = activityPlanStructureSchema.safeParse(configuration.plan.structure);
    const plannedSession = configuration.plan.plannedSession
      ? recordingPlannedSessionLaunchSchema.safeParse(configuration.plan.plannedSession)
      : null;
    if (
      !parsed.success ||
      parsed.data.activity_category !== configuration.activity_category ||
      configuration.plan.activityPlanId !== configuration.activityPlanId ||
      configuration.plan.scheduledEventId !== (configuration.eventId ?? null) ||
      (plannedSession !== null &&
        (!plannedSession.success ||
          configuration.plan.activityPlanId !==
            plannedSession.data.prescription.resolutionManifest.activity_plan_id ||
          configuration.plan.activityPlanRevision !==
            plannedSession.data.prescription.resolutionManifest.activity_plan_revision ||
          configuration.plan.structureHash !==
            plannedSession.data.prescription.resolutionManifest.resolved_structure_hash ||
          JSON.stringify(parsed.data) !==
            JSON.stringify(plannedSession.data.prescription.resolutionManifest.resolved_structure)))
    ) {
      return { state, rejectedReason: "The selected activity plan is invalid or inconsistent." };
    }
  }

  return {
    state: {
      ...createInitialTimerOnlyRecordingState(),
      configuration: { ...configuration },
    },
    rejectedReason: null,
  };
}

export function startTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
  sessionId: string,
): TimerOnlyRecordingTransition {
  if (!state.configuration) {
    return { state, rejectedReason: "Configure a recording before starting." };
  }

  const created = applyCoreCommand(state, {
    type: "create_session",
    snapshot: createTimerOnlySnapshot(state.configuration, nowMs, sessionId),
  });
  if (created.rejectedReason) return created;

  const ready = applyCoreCommand(created.state, { type: "mark_ready" });
  if (ready.rejectedReason) return ready;

  const transition = applyCoreCommand(ready.state, { type: "start" });
  if (transition.rejectedReason) return transition;

  const started: TimerOnlyRecordingTransition = {
    ...transition,
    state: {
      ...transition.state,
      timer: {
        startedAtMs: nowMs,
        activeStartedAtMs: nowMs,
        accumulatedMovingMs: 0,
        excludedElapsedMs: 0,
        endedAtMs: null,
      },
      planExecution: createInitialPlanExecutionState(
        nowMs,
        Boolean(transition.state.reducer.snapshot?.planExecution),
      ),
    },
  };
  return state.configuration.intensityScale && state.configuration.intensityScale !== 1
    ? adjustTimerOnlyIntensity(started.state, nowMs, state.configuration.intensityScale)
    : started;
}

export function pauseTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const advanced = advanceTimerOnlyRecording(state, nowMs);
  const transition = applyCoreCommand(advanced.state, { type: "pause" });
  if (transition.rejectedReason) return transition;

  return {
    ...transition,
    state: {
      ...transition.state,
      timer: stopActiveTimer(transition.state.timer, nowMs),
    },
  };
}

export function resumeTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const transition = applyCoreCommand(state, { type: "resume" });
  if (transition.rejectedReason) return transition;

  return {
    ...transition,
    state: {
      ...transition.state,
      timer: {
        ...transition.state.timer,
        activeStartedAtMs: nowMs,
        excludedElapsedMs:
          transition.state.timer.excludedElapsedMs +
          (transition.state.timer.endedAtMs === null
            ? 0
            : Math.max(0, nowMs - transition.state.timer.endedAtMs)),
        endedAtMs: null,
      },
    },
  };
}

export function finishTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const advanced = advanceTimerOnlyRecording(state, nowMs);
  const finalizing = applyCoreCommand(advanced.state, { type: "begin_finalization" });
  if (finalizing.rejectedReason) return finalizing;
  if (getTimerOnlyRecordingTimesMs(advanced.state, nowMs).elapsedMs <= 0) {
    return { state, rejectedReason: "Record some time before finishing this activity." };
  }

  const frozenAtMs = finalizing.state.timer.endedAtMs;
  const stoppedState = {
    ...finalizing.state,
    timer: {
      ...stopActiveTimer(finalizing.state.timer, nowMs),
      excludedElapsedMs:
        finalizing.state.timer.excludedElapsedMs +
        (frozenAtMs === null ? 0 : Math.max(0, nowMs - frozenAtMs)),
      endedAtMs: nowMs,
    },
  };
  return applyCoreCommand(stoppedState, { type: "finish" });
}

export function resetTimerOnlyRecording(): TimerOnlyRecordingTransition {
  return { state: createInitialTimerOnlyRecordingState(), rejectedReason: null };
}

export function getTimerOnlyRecordingTimes(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTimes {
  const { activeStartedAtMs, accumulatedMovingMs, endedAtMs, startedAtMs } = state.timer;
  if (startedAtMs === null) {
    return { elapsedSeconds: 0, activeSeconds: 0, movingSeconds: 0 };
  }

  const effectiveNow = endedAtMs ?? nowMs;
  const activeMs = activeStartedAtMs === null ? 0 : Math.max(0, effectiveNow - activeStartedAtMs);
  const elapsedMs = Math.max(0, effectiveNow - startedAtMs - state.timer.excludedElapsedMs);
  const activeSeconds = Math.floor(Math.min(elapsedMs, accumulatedMovingMs + activeMs) / 1_000);
  return {
    elapsedSeconds: Math.floor(elapsedMs / 1_000),
    activeSeconds,
    movingSeconds: activeSeconds,
  };
}

export function createTimerOnlyRecordingDraft(
  state: TimerOnlyRecordingState,
  nowMs: number,
  ownerId: string,
): PortableTimerRecordingDraft | null {
  assertRealRecordingExecution(state);
  const effectiveState = advanceTimerOnlyRecording(state, nowMs).state;
  const { lifecycle, snapshot } = effectiveState.reducer;
  if ((lifecycle !== "recording" && lifecycle !== "paused") || !snapshot) return null;

  const startedAtMs = effectiveState.timer.startedAtMs;
  if (startedAtMs === null) return null;

  const updatedAtMs = Math.max(startedAtMs, effectiveState.timer.endedAtMs ?? nowMs);
  const activeMs =
    effectiveState.timer.activeStartedAtMs === null
      ? 0
      : Math.max(0, updatedAtMs - effectiveState.timer.activeStartedAtMs);
  const elapsedMs = Math.max(0, updatedAtMs - startedAtMs - effectiveState.timer.excludedElapsedMs);

  return portableTimerRecordingDraftSchema.parse({
    schemaVersion: PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
    ownerId,
    sessionSnapshot: snapshot,
    lifecycle,
    timing: {
      startedAt: new Date(startedAtMs).toISOString(),
      updatedAt: new Date(updatedAtMs).toISOString(),
      elapsedMs,
      movingMs: Math.min(elapsedMs, effectiveState.timer.accumulatedMovingMs + activeMs),
      excludedElapsedMs: effectiveState.timer.excludedElapsedMs,
    },
    ...(effectiveState.planExecution ? { planExecution: effectiveState.planExecution } : {}),
    ...(effectiveState.guidance ? { guidance: effectiveState.guidance } : {}),
    revision: snapshot.identity.revision,
  });
}

export function recoverTimerOnlyRecording(untrustedDraft: unknown): TimerOnlyRecordingTransition {
  const parsedDraft = portableTimerRecordingDraftSchema.safeParse(untrustedDraft);
  if (!parsedDraft.success) {
    return {
      state: createInitialTimerOnlyRecordingState(),
      rejectedReason: "Cannot recover an invalid recording.",
    };
  }

  const draft = sanitizeTimerOnlyDraft(parsedDraft.data);
  const recovered = applyCoreCommand(createInitialTimerOnlyRecordingState(), {
    type: "recover_session",
    draft,
  });
  if (recovered.rejectedReason) return recovered;

  const activity = draft.sessionSnapshot.activity;
  return {
    rejectedReason: null,
    state: {
      ...recovered.state,
      ...(draft.guidance ? { guidance: draft.guidance } : {}),
      configuration: {
        activity_category: activity.activity_category,
        ...(activity.eventId ? { eventId: activity.eventId } : {}),
        ...(activity.activityPlanId ? { activityPlanId: activity.activityPlanId } : {}),
        ...(activity.routeId ? { routeId: activity.routeId } : {}),
      },
      timer: {
        startedAtMs: Date.parse(draft.timing.startedAt),
        activeStartedAtMs: null,
        accumulatedMovingMs: draft.timing.movingMs,
        excludedElapsedMs: draft.timing.excludedElapsedMs ?? 0,
        endedAtMs: Date.parse(draft.timing.updatedAt),
      },
      planExecution: draft.planExecution ?? {
        currentOccurrenceIndex: null,
        occurrenceStartedMovingMs: draft.timing.movingMs,
        completedOccurrenceIds: [],
        skippedOccurrenceIds: [],
        transitions: [],
        laps: [],
        checkpoints: [
          {
            timestamp: draft.timing.updatedAt,
            currentOccurrenceIndex: null,
            elapsedMs: draft.timing.elapsedMs,
            movingMs: draft.timing.movingMs,
          },
        ],
      },
    },
  };
}

function sanitizeTimerOnlyDraft(draft: PortableTimerRecordingDraft): PortableTimerRecordingDraft {
  return portableTimerRecordingDraftSchema.parse({
    ...draft,
    sessionSnapshot: {
      ...draft.sessionSnapshot,
      activity: {
        ...draft.sessionSnapshot.activity,
        gpsMode: "off",
      },
      devices: {
        ...draft.sessionSnapshot.devices,
        connected: [],
        controllableTrainer: null,
        selectedSources: [],
      },
      capabilities: {
        ...draft.sessionSnapshot.capabilities,
        canTrackLocation: false,
        shouldShowMap: false,
        shouldShowRouteOverlay: false,
        shouldShowTurnByTurn: false,
        shouldShowFollowAlong: false,
      },
    },
  });
}

export function restoreFinishedTimerOnlyRecording(artifact: {
  snapshot: RecordingSessionSnapshot;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  movingMs: number;
  planExecution?: PortableWebPlanExecutionState | undefined;
  guidance?: RecordingGuidanceTimeline;
}): TimerOnlyRecordingState {
  let state = createInitialTimerOnlyRecordingState();
  for (const command of [
    { type: "create_session", snapshot: artifact.snapshot },
    { type: "mark_ready" },
    { type: "start" },
    { type: "begin_finalization" },
    { type: "finish" },
  ] satisfies RecordingCommand[]) {
    const transition = applyCoreCommand(state, command);
    if (transition.rejectedReason) {
      throw new Error(`Cannot restore finalized recording: ${transition.rejectedReason}`);
    }
    state = transition.state;
  }

  const activity = artifact.snapshot.activity;
  return {
    ...state,
    ...(artifact.guidance ? { guidance: artifact.guidance } : {}),
    configuration: {
      activity_category: activity.activity_category,
      ...(activity.eventId ? { eventId: activity.eventId } : {}),
      ...(activity.activityPlanId ? { activityPlanId: activity.activityPlanId } : {}),
      ...(activity.routeId ? { routeId: activity.routeId } : {}),
    },
    timer: {
      startedAtMs: Date.parse(artifact.startedAt),
      activeStartedAtMs: null,
      accumulatedMovingMs: artifact.movingMs,
      excludedElapsedMs: Math.max(
        0,
        Date.parse(artifact.finishedAt) - Date.parse(artifact.startedAt) - artifact.elapsedMs,
      ),
      endedAtMs: Date.parse(artifact.finishedAt),
    },
    planExecution: artifact.planExecution ?? null,
  };
}

function applyCoreCommand(
  state: TimerOnlyRecordingState,
  command: RecordingCommand,
): TimerOnlyRecordingTransition {
  const decision = decideRecordingCommand(state.reducer, command);
  if (decision.rejected) {
    return { state, rejectedReason: decision.rejected.reason };
  }

  return {
    state: {
      ...state,
      reducer: reduceRecordingEvents(state.reducer, decision.events),
    },
    rejectedReason: null,
  };
}

function stopActiveTimer(timer: TimerState, nowMs: number): TimerState {
  const activeMs =
    timer.activeStartedAtMs === null ? 0 : Math.max(0, nowMs - timer.activeStartedAtMs);
  return {
    ...timer,
    accumulatedMovingMs: timer.accumulatedMovingMs + activeMs,
    activeStartedAtMs: null,
  };
}

function createTimerOnlySnapshot(
  configuration: TimerOnlyRecordingConfiguration,
  nowMs: number,
  sessionId: string,
): RecordingSessionSnapshot {
  const startedAt = new Date(nowMs).toISOString();
  const planExecution = configuration.plan
    ? lockPlanExecution(configuration.plan, configuration.activity_category, startedAt)
    : undefined;
  return {
    identity: {
      sessionId,
      revision: 0,
      startedAt,
    },
    activity: {
      activity_category: configuration.activity_category,
      mode: configuration.activityPlanId ? "planned" : "free",
      gpsMode: "off",
      eventId: configuration.eventId ?? null,
      activityPlanId: configuration.activityPlanId ?? null,
      routeId: configuration.routeId ?? null,
    },
    profileSnapshot: {},
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(startedAt),
    ...(planExecution ? { planExecution } : {}),
    devices: { connected: [], controllableTrainer: null, selectedSources: [] },
    capabilities: {
      canTrackLocation: false,
      canTrackPower: false,
      canTrackHeartRate: false,
      canTrackCadence: false,
      shouldShowMap: false,
      shouldShowSteps: Boolean(planExecution),
      shouldShowRouteOverlay: false,
      shouldShowTurnByTurn: false,
      shouldShowFollowAlong: false,
      shouldShowTrainerControl: false,
      canAutoAdvanceSteps: Boolean(planExecution),
      shouldAutoFollowTargets: false,
      autoFollowPriority: "none",
      autoFollowConflict: false,
      autoFollowConflictReason: null,
      primaryMetric: "time",
      isValid: true,
      errors: [],
      warnings: ["Foreground timer only; recovery is paused and hardware capture is unavailable."],
    },
    policies: {
      sourcePolicy: {
        preferUserSelection: true,
        allowDerivedSpeed: false,
        allowDerivedDistance: false,
      },
      controlPolicy: { trainerMode: "manual", autoAdvanceSteps: Boolean(planExecution) },
      degradedModePolicy: {
        allowWithoutGps: true,
        allowWithoutSensors: true,
        exposeSourceWarnings: true,
      },
    },
  };
}

function lockPlanExecution(
  plan: TimerOnlyRecordingPlanConfiguration,
  activityCategory: RecordingActivityCategory,
  startedAt: string,
): RecordingPlanExecutionSnapshot {
  const structure = activityPlanStructureSchema.parse(plan.structure);
  const compiled = compileValidatedActivityPlan(structure);
  return {
    manifestVersion: 2,
    compilerVersion: compiled.compilerVersion,
    activityPlanId: plan.activityPlanId,
    scheduledEventId: plan.scheduledEventId,
    name: plan.name,
    description: plan.description,
    activityPlanRevision: plan.activityPlanRevision,
    structureHash: plan.structureHash,
    structure,
    plannedSession: plan.plannedSession
      ? recordingPlannedSessionLaunchSchema.parse(plan.plannedSession)
      : null,
    personalizationEnabled: false,
    targetPresentations: compiled.occurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      labels: orderActivityPlanTargetsForPresentation(occurrence.targets).map(
        (target) =>
          resolveActivityPlanTargetPresentation({
            target,
            activityCategory,
            asOf: startedAt,
          }).label,
      ),
    })),
  };
}

function createInitialPlanExecutionState(
  nowMs: number,
  hasPlan: boolean,
): PortableWebPlanExecutionState {
  return {
    currentOccurrenceIndex: hasPlan ? 0 : null,
    occurrenceStartedMovingMs: 0,
    completedOccurrenceIds: [],
    skippedOccurrenceIds: [],
    transitions: [],
    laps: [],
    checkpoints: [
      {
        timestamp: new Date(nowMs).toISOString(),
        currentOccurrenceIndex: hasPlan ? 0 : null,
        elapsedMs: 0,
        movingMs: 0,
      },
    ],
  };
}

function planOccurrences(
  state: TimerOnlyRecordingState,
): readonly CompiledActivityPlanOccurrence[] {
  const plan = getCurrentTimerOnlyPlan(state);
  return plan ? compileValidatedActivityPlan(plan.structure).occurrences : [];
}

export function advanceTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  if (state.reducer.lifecycle !== "recording" || !state.planExecution) {
    return { state, rejectedReason: null };
  }
  let nextState = state;
  const occurrences = planOccurrences(state);
  while (true) {
    const execution = nextState.planExecution;
    if (!execution || execution.currentOccurrenceIndex === null) break;
    const index = execution.currentOccurrenceIndex;
    const occurrence = occurrences[index];
    if (!occurrence || occurrence.duration.type !== "time") break;
    const movingMs = getTimerOnlyRecordingTimesMs(nextState, nowMs).movingMs;
    if (movingMs - execution.occurrenceStartedMovingMs < occurrence.duration.seconds * 1_000) {
      break;
    }
    const transitioned = transitionPlanOccurrence(nextState, nowMs, "auto", false);
    if (transitioned.rejectedReason) {
      return transitioned;
    }
    nextState = transitioned.state;
  }
  return { state: nextState, rejectedReason: null };
}

export function completeCurrentPlanStep(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  return transitionPlanOccurrence(state, nowMs, "complete", false);
}

export function skipCurrentPlanStep(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  return transitionPlanOccurrence(state, nowMs, "skip", true);
}

export function previousPlanStep(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  if (state.reducer.lifecycle !== "recording" && state.reducer.lifecycle !== "paused") {
    return { state, rejectedReason: "Plan controls require an active recording." };
  }
  const execution = state.planExecution;
  const occurrences = planOccurrences(state);
  if (!execution || (execution.currentOccurrenceIndex ?? occurrences.length) <= 0) {
    return { state, rejectedReason: "There is no previous plan step." };
  }
  if (execution.transitions.length >= 5_000) {
    return { state, rejectedReason: "The recording has reached the durable transition limit." };
  }
  const times = getTimerOnlyRecordingTimesMs(state, nowMs);
  const currentIndex = execution.currentOccurrenceIndex ?? occurrences.length;
  const previousIndex = currentIndex - 1;
  const previous = occurrences[previousIndex];
  const current = occurrences[currentIndex] ?? null;
  if (!previous) return { state, rejectedReason: "The previous plan step is unavailable." };
  const nextExecution: PortableWebPlanExecutionState = {
    ...execution,
    currentOccurrenceIndex: previousIndex,
    occurrenceStartedMovingMs: times.movingMs,
    completedOccurrenceIds: execution.completedOccurrenceIds.filter(
      (id) => id !== previous.occurrenceId,
    ),
    skippedOccurrenceIds: execution.skippedOccurrenceIds.filter(
      (id) => id !== previous.occurrenceId,
    ),
    transitions: [
      ...execution.transitions,
      planTransition(
        "previous",
        nowMs,
        times,
        current?.occurrenceId ?? null,
        previous.occurrenceId,
      ),
    ],
  };
  return {
    state: withExecutionCheckpoint(state, nextExecution, nowMs, times),
    rejectedReason: null,
  };
}

export function captureTimerOnlyLap(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const execution = state.planExecution;
  if (
    !execution ||
    (state.reducer.lifecycle !== "recording" && state.reducer.lifecycle !== "paused")
  ) {
    return { state, rejectedReason: "Laps require an active planned recording." };
  }
  if (execution.laps.length >= 1_000) {
    return { state, rejectedReason: "The recording has reached the durable lap limit." };
  }
  const times = getTimerOnlyRecordingTimesMs(state, nowMs);
  const occurrences = planOccurrences(state);
  const index = execution.currentOccurrenceIndex;
  const occurrence = index === null ? null : (occurrences[index] ?? null);
  const nextExecution: PortableWebPlanExecutionState = {
    ...execution,
    laps: [
      ...execution.laps,
      {
        lapNumber: execution.laps.length + 1,
        timestamp: new Date(nowMs).toISOString(),
        elapsedMs: times.elapsedMs,
        movingMs: times.movingMs,
        occurrenceId: occurrence?.occurrenceId ?? null,
        occurrenceIndex: index,
      },
    ],
  };
  return {
    state: withExecutionCheckpoint(state, nextExecution, nowMs, times),
    rejectedReason: null,
  };
}

export function getTimerOnlyPlanStatus(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyPlanStatus | null {
  const effective = advanceTimerOnlyRecording(state, nowMs).state;
  const execution = effective.planExecution;
  if (!execution) return null;
  const occurrences = planOccurrences(effective);
  const index = execution.currentOccurrenceIndex;
  const current = index === null ? null : (occurrences[index] ?? null);
  const movingMs = getTimerOnlyRecordingTimesMs(effective, nowMs).movingMs;
  const stepMs = Math.max(0, movingMs - execution.occurrenceStartedMovingMs);
  const lastLapElapsedMs = execution.laps.at(-1)?.elapsedMs ?? 0;
  const elapsedMs = getTimerOnlyRecordingTimesMs(effective, nowMs).elapsedMs;
  return {
    intensityScale: effective.guidance
      ? currentRecordingGuidance(effective.guidance).intensityScale
      : 1,
    targetLabels:
      current?.role === "activity"
        ? current.targets.map(
            (target) =>
              resolveActivityPlanTargetPresentation({
                target:
                  target.type === "%FTP"
                    ? {
                        ...target,
                        intensity:
                          target.intensity *
                          (effective.guidance
                            ? currentRecordingGuidance(effective.guidance).intensityScale
                            : 1),
                      }
                    : target,
                activityCategory: effective.configuration?.activity_category ?? "bike",
                asOf:
                  effective.reducer.snapshot?.identity.startedAt ?? new Date(nowMs).toISOString(),
              }).label,
          )
        : [],
    totalOccurrences: occurrences.length,
    currentOccurrence: current,
    currentOccurrenceIndex: index,
    currentStepElapsedSeconds: Math.floor(stepMs / 1_000),
    currentStepRemainingSeconds:
      current?.duration.type === "time"
        ? Math.max(0, current.duration.seconds - Math.floor(stepMs / 1_000))
        : null,
    processedCount: execution.completedOccurrenceIds.length + execution.skippedOccurrenceIds.length,
    completedCount: execution.completedOccurrenceIds.length,
    skippedCount: execution.skippedOccurrenceIds.length,
    currentLapElapsedSeconds: Math.floor(Math.max(0, elapsedMs - lastLapElapsedMs) / 1_000),
    laps: execution.laps,
    nextOccurrence: index === null ? null : (occurrences[index + 1] ?? null),
  };
}

function transitionPlanOccurrence(
  state: TimerOnlyRecordingState,
  nowMs: number,
  type: "auto" | "complete" | "skip",
  skipped: boolean,
): TimerOnlyRecordingTransition {
  const execution = state.planExecution;
  if (
    !execution ||
    (state.reducer.lifecycle !== "recording" && state.reducer.lifecycle !== "paused")
  ) {
    return { state, rejectedReason: "Plan controls require an active planned recording." };
  }
  const occurrences = planOccurrences(state);
  const index = execution.currentOccurrenceIndex;
  if (index === null) return { state, rejectedReason: "All plan steps are already processed." };
  const current = index === null ? null : (occurrences[index] ?? null);
  if (!current) return { state, rejectedReason: "All plan steps are already processed." };
  if (execution.transitions.length >= 5_000) {
    return { state, rejectedReason: "The recording has reached the durable transition limit." };
  }
  if (type === "auto" && current.duration.type !== "time") {
    return { state, rejectedReason: "This step requires an explicit completion." };
  }
  const times = getTimerOnlyRecordingTimesMs(state, nowMs);
  const nextIndex = index + 1 < occurrences.length ? index + 1 : null;
  const next = nextIndex === null ? null : (occurrences[nextIndex] ?? null);
  const occurrenceStartedMovingMs =
    type === "auto" && current.duration.type === "time"
      ? execution.occurrenceStartedMovingMs + current.duration.seconds * 1_000
      : times.movingMs;
  // A late foreground tick may cross several timed boundaries. Journal the
  // actual boundary rather than attributing the next step's time to this one.
  const overshootMs = type === "auto" ? Math.max(0, times.movingMs - occurrenceStartedMovingMs) : 0;
  const nextExecution: PortableWebPlanExecutionState = {
    ...execution,
    currentOccurrenceIndex: nextIndex,
    occurrenceStartedMovingMs,
    completedOccurrenceIds: skipped
      ? execution.completedOccurrenceIds
      : [...execution.completedOccurrenceIds, current.occurrenceId],
    skippedOccurrenceIds: skipped
      ? [...execution.skippedOccurrenceIds, current.occurrenceId]
      : execution.skippedOccurrenceIds,
    transitions: [
      ...execution.transitions,
      planTransition(
        type,
        nowMs - overshootMs,
        {
          elapsedMs: times.elapsedMs - overshootMs,
          movingMs: times.movingMs - overshootMs,
        },
        current.occurrenceId,
        next?.occurrenceId ?? null,
      ),
    ],
  };
  return {
    state: withExecutionCheckpoint(state, nextExecution, nowMs, times),
    rejectedReason: null,
  };
}

function planTransition(
  type: "auto" | "complete" | "skip" | "previous",
  nowMs: number,
  times: { elapsedMs: number; movingMs: number },
  fromOccurrenceId: string | null,
  toOccurrenceId: string | null,
) {
  return {
    type,
    timestamp: new Date(nowMs).toISOString(),
    elapsedMs: times.elapsedMs,
    movingMs: times.movingMs,
    fromOccurrenceId,
    toOccurrenceId,
  };
}

function withExecutionCheckpoint(
  state: TimerOnlyRecordingState,
  execution: PortableWebPlanExecutionState,
  nowMs: number,
  times: { elapsedMs: number; movingMs: number },
): TimerOnlyRecordingState {
  return {
    ...state,
    planExecution: {
      ...execution,
      checkpoints: [
        ...execution.checkpoints,
        {
          timestamp: new Date(nowMs).toISOString(),
          currentOccurrenceIndex: execution.currentOccurrenceIndex,
          elapsedMs: times.elapsedMs,
          movingMs: times.movingMs,
        },
      ],
    },
  };
}

export function getCurrentTimerOnlyPlan(state: TimerOnlyRecordingState) {
  return state.guidance
    ? currentRecordingGuidance(state.guidance).plan
    : (state.reducer.snapshot?.planExecution ?? null);
}

export function getCurrentTimerOnlyRoute(state: TimerOnlyRecordingState) {
  return state.guidance
    ? currentRecordingGuidance(state.guidance).routeId
    : (state.reducer.snapshot?.activity.routeId ?? state.configuration?.routeId ?? null);
}

export function changeTimerOnlyPlan(
  state: TimerOnlyRecordingState,
  nowMs: number,
  plan: TimerOnlyRecordingPlanConfiguration | null,
): TimerOnlyRecordingTransition {
  const configuration = state.configuration;
  if (!configuration) return { state, rejectedReason: "Choose the recording category first." };
  if (plan?.plannedSession)
    return {
      state,
      rejectedReason: "A scheduled prescription can only be selected before starting.",
    };
  const beforeStart = !state.reducer.snapshot && state.reducer.lifecycle === "pending";
  const parsedPlan = plan ? activityPlanStructureSchema.safeParse(plan.structure) : null;
  if (parsedPlan && !parsedPlan.success)
    return { state, rejectedReason: "The selected plan is invalid." };
  const activityCategory =
    beforeStart && parsedPlan?.success
      ? parsedPlan.data.activity_category
      : configuration.activity_category;
  const candidate = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: activityCategory,
    ...(plan
      ? { activityPlanId: plan.activityPlanId, plan: { ...plan, scheduledEventId: null } }
      : {}),
  });
  if (candidate.rejectedReason)
    return {
      state,
      rejectedReason: "Choose a valid plan matching this recording's fixed activity category.",
    };
  if (beforeStart && candidate.state.configuration) {
    return {
      state: {
        ...state,
        configuration: {
          ...candidate.state.configuration,
          ...(configuration.routeId ? { routeId: configuration.routeId } : {}),
        },
      },
      rejectedReason: null,
    };
  }
  return reviseTimerGuidance(state, nowMs, "plan", {
    plan: plan
      ? lockPlanExecution(
          { ...plan, scheduledEventId: null },
          configuration.activity_category,
          new Date(nowMs).toISOString(),
        )
      : null,
    intensityScale: 1,
  });
}

export function changeTimerOnlyRoute(
  state: TimerOnlyRecordingState,
  nowMs: number,
  routeId: string | null,
): TimerOnlyRecordingTransition {
  if (!state.reducer.snapshot && state.reducer.lifecycle === "pending" && state.configuration) {
    if (routeId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(routeId))
      return { state, rejectedReason: "Invalid route identity." };
    const { routeId: _previous, ...configuration } = state.configuration;
    return {
      state: { ...state, configuration: { ...configuration, ...(routeId ? { routeId } : {}) } },
      rejectedReason: null,
    };
  }
  return reviseTimerGuidance(state, nowMs, "route", { routeId });
}

export function adjustTimerOnlyIntensity(
  state: TimerOnlyRecordingState,
  nowMs: number,
  scale: number,
): TimerOnlyRecordingTransition {
  try {
    validateRecordingIntensityScale(scale, new Date(nowMs).toISOString());
  } catch {
    return { state, rejectedReason: "Session intensity must be between 50% and 150%." };
  }
  const occurrences =
    !state.reducer.snapshot && state.configuration?.plan
      ? compileValidatedActivityPlan(
          activityPlanStructureSchema.parse(state.configuration.plan.structure),
        ).occurrences
      : planOccurrences(state);
  if (
    !occurrences.some(
      (occurrence) =>
        occurrence.role === "activity" &&
        occurrence.targets.some((target) => target.type === "%FTP"),
    )
  ) {
    return {
      state,
      rejectedReason: "Session intensity scaling requires relative cycling power targets.",
    };
  }
  if (!state.reducer.snapshot && state.reducer.lifecycle === "pending" && state.configuration) {
    return {
      state: { ...state, configuration: { ...state.configuration, intensityScale: scale } },
      rejectedReason: null,
    };
  }
  return reviseTimerGuidance(state, nowMs, "intensity", { intensityScale: scale });
}

function reviseTimerGuidance(
  state: TimerOnlyRecordingState,
  nowMs: number,
  kind: "plan" | "route" | "intensity",
  patch: Partial<
    Pick<RecordingGuidanceTimeline["revisions"][number], "plan" | "routeId" | "intensityScale">
  >,
): TimerOnlyRecordingTransition {
  const snapshot = state.reducer.snapshot;
  if (
    !snapshot ||
    (state.reducer.lifecycle !== "recording" && state.reducer.lifecycle !== "paused")
  ) {
    return { state, rejectedReason: "Live guidance requires a recording or paused session." };
  }
  const advanced = advanceTimerOnlyRecording(state, nowMs);
  if (advanced.rejectedReason) return { state, rejectedReason: advanced.rejectedReason };
  const previous = advanced.state;
  const timeline = previous.guidance ?? {
    version: 1 as const,
    revisions: [
      {
        revision: 0,
        kind: "initial" as const,
        timestamp: snapshot.identity.startedAt,
        elapsedMs: 0,
        activeMs: 0,
        plan: snapshot.planExecution ?? null,
        routeId: snapshot.activity.routeId,
        intensityScale: 1,
      },
    ],
  };
  const current = currentRecordingGuidance(timeline);
  if (
    (kind === "route" && patch.routeId === current.routeId) ||
    (kind === "intensity" && patch.intensityScale === current.intensityScale)
  )
    return { state, rejectedReason: null };
  const times = getTimerOnlyRecordingTimesMs(previous, nowMs);
  const parsed = recordingGuidanceTimelineSchema.safeParse({
    ...timeline,
    revisions: [
      ...timeline.revisions,
      {
        ...current,
        ...patch,
        revision: timeline.revisions.length,
        kind,
        timestamp: new Date(nowMs).toISOString(),
        elapsedMs: times.elapsedMs,
        activeMs: times.movingMs,
        closedExecution: kind === "plan" ? (previous.planExecution ?? undefined) : undefined,
      },
    ],
  });
  if (!parsed.success)
    return {
      state,
      rejectedReason: "Guidance is invalid or its durable history limit has been reached.",
    };
  const nextPlan = currentRecordingGuidance(parsed.data).plan;
  const planExecution =
    kind === "plan"
      ? {
          ...createInitialPlanExecutionState(nowMs, Boolean(nextPlan)),
          occurrenceStartedMovingMs: times.movingMs,
          laps: previous.planExecution?.laps ?? [],
          checkpoints: [
            {
              timestamp: new Date(nowMs).toISOString(),
              currentOccurrenceIndex: nextPlan ? 0 : null,
              elapsedMs: times.elapsedMs,
              movingMs: times.movingMs,
            },
          ],
        }
      : previous.planExecution;
  return { state: { ...previous, guidance: parsed.data, planExecution }, rejectedReason: null };
}

function getTimerOnlyRecordingTimesMs(state: TimerOnlyRecordingState, nowMs: number) {
  const { activeStartedAtMs, accumulatedMovingMs, endedAtMs, startedAtMs } = state.timer;
  if (startedAtMs === null) return { elapsedMs: 0, movingMs: 0 };
  const effectiveNow = endedAtMs ?? nowMs;
  const activeMs = activeStartedAtMs === null ? 0 : Math.max(0, effectiveNow - activeStartedAtMs);
  const elapsedMs = Math.max(0, effectiveNow - startedAtMs - state.timer.excludedElapsedMs);
  return {
    elapsedMs,
    movingMs: Math.min(elapsedMs, accumulatedMovingMs + activeMs),
  };
}
