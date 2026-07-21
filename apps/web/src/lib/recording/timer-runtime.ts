import {
  createInitialRecordingReducerState,
  decideRecordingCommand,
  PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
  type PortableTimerRecordingDraft,
  portableTimerRecordingDraftSchema,
  type RecordingActivityCategory,
  type RecordingCommand,
  type RecordingSessionReducerState,
  type RecordingSessionSnapshot,
  reduceRecordingEvents,
} from "@repo/core";

export type TimerOnlyRecordingConfiguration = {
  category: RecordingActivityCategory;
  eventId?: string;
  activityPlanId?: string;
  routeId?: string;
};

type TimerState = {
  startedAtMs: number | null;
  activeStartedAtMs: number | null;
  accumulatedMovingMs: number;
  endedAtMs: number | null;
};

export type TimerOnlyRecordingState = {
  configuration: TimerOnlyRecordingConfiguration | null;
  reducer: RecordingSessionReducerState;
  timer: TimerState;
};

export type TimerOnlyRecordingTransition = {
  state: TimerOnlyRecordingState;
  rejectedReason: string | null;
};

export type TimerOnlyRecordingTimes = {
  elapsedSeconds: number;
  movingSeconds: number;
};

const initialTimerState = (): TimerState => ({
  startedAtMs: null,
  activeStartedAtMs: null,
  accumulatedMovingMs: 0,
  endedAtMs: null,
});

export function createInitialTimerOnlyRecordingState(): TimerOnlyRecordingState {
  return {
    configuration: null,
    reducer: createInitialRecordingReducerState(),
    timer: initialTimerState(),
  };
}

export function configureTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  configuration: TimerOnlyRecordingConfiguration,
): TimerOnlyRecordingTransition {
  if (state.reducer.lifecycle === "recording" || state.reducer.lifecycle === "paused") {
    return { state, rejectedReason: "Cannot reconfigure an active recording." };
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

  return {
    ...transition,
    state: {
      ...transition.state,
      timer: {
        startedAtMs: nowMs,
        activeStartedAtMs: nowMs,
        accumulatedMovingMs: 0,
        endedAtMs: null,
      },
    },
  };
}

export function pauseTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const transition = applyCoreCommand(state, { type: "pause" });
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
      timer: { ...transition.state.timer, activeStartedAtMs: nowMs },
    },
  };
}

export function finishTimerOnlyRecording(
  state: TimerOnlyRecordingState,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const finalizing = applyCoreCommand(state, { type: "begin_finalization" });
  if (finalizing.rejectedReason) return finalizing;

  const stoppedState = {
    ...finalizing.state,
    timer: {
      ...stopActiveTimer(finalizing.state.timer, nowMs),
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
  if (startedAtMs === null) return { elapsedSeconds: 0, movingSeconds: 0 };

  const effectiveNow = endedAtMs ?? nowMs;
  const activeMs = activeStartedAtMs === null ? 0 : Math.max(0, effectiveNow - activeStartedAtMs);

  return {
    elapsedSeconds: Math.floor(Math.max(0, effectiveNow - startedAtMs) / 1_000),
    movingSeconds: Math.floor((accumulatedMovingMs + activeMs) / 1_000),
  };
}

export function createTimerOnlyRecordingDraft(
  state: TimerOnlyRecordingState,
  nowMs: number,
  ownerId: string,
): PortableTimerRecordingDraft | null {
  const { lifecycle, snapshot } = state.reducer;
  if ((lifecycle !== "recording" && lifecycle !== "paused") || !snapshot) return null;

  const startedAtMs = state.timer.startedAtMs;
  if (startedAtMs === null) return null;

  const updatedAtMs = Math.max(startedAtMs, nowMs);
  const activeMs =
    state.timer.activeStartedAtMs === null
      ? 0
      : Math.max(0, updatedAtMs - state.timer.activeStartedAtMs);
  const elapsedMs = Math.max(0, updatedAtMs - startedAtMs);

  return portableTimerRecordingDraftSchema.parse({
    schemaVersion: PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
    ownerId,
    sessionSnapshot: snapshot,
    lifecycle,
    timing: {
      startedAt: new Date(startedAtMs).toISOString(),
      updatedAt: new Date(updatedAtMs).toISOString(),
      elapsedMs,
      movingMs: Math.min(elapsedMs, state.timer.accumulatedMovingMs + activeMs),
    },
    revision: snapshot.identity.revision,
  });
}

export function recoverTimerOnlyRecording(
  untrustedDraft: unknown,
  nowMs: number,
): TimerOnlyRecordingTransition {
  const parsedDraft = portableTimerRecordingDraftSchema.safeParse(untrustedDraft);
  if (!parsedDraft.success) {
    return {
      state: createInitialTimerOnlyRecordingState(),
      rejectedReason: "Cannot recover an invalid recording draft.",
    };
  }

  const draft = parsedDraft.data;
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
      configuration: {
        category: activity.category,
        ...(activity.eventId ? { eventId: activity.eventId } : {}),
        ...(activity.activityPlanId ? { activityPlanId: activity.activityPlanId } : {}),
        ...(activity.routeId ? { routeId: activity.routeId } : {}),
      },
      timer: {
        startedAtMs: nowMs - draft.timing.elapsedMs,
        activeStartedAtMs: null,
        accumulatedMovingMs: draft.timing.movingMs,
        endedAtMs: null,
      },
    },
  };
}

export function restoreFinishedTimerOnlyRecording(artifact: {
  snapshot: RecordingSessionSnapshot;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  movingMs: number;
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
    configuration: {
      category: activity.category,
      ...(activity.eventId ? { eventId: activity.eventId } : {}),
      ...(activity.activityPlanId ? { activityPlanId: activity.activityPlanId } : {}),
      ...(activity.routeId ? { routeId: activity.routeId } : {}),
    },
    timer: {
      startedAtMs: Date.parse(artifact.startedAt),
      activeStartedAtMs: null,
      accumulatedMovingMs: artifact.movingMs,
      endedAtMs: Date.parse(artifact.finishedAt),
    },
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
  return {
    identity: {
      sessionId,
      revision: 0,
      startedAt: new Date(nowMs).toISOString(),
    },
    activity: {
      category: configuration.category,
      mode: configuration.eventId ? "planned" : "free",
      gpsMode: "off",
      eventId: configuration.eventId ?? null,
      activityPlanId: configuration.activityPlanId ?? null,
      routeId: configuration.routeId ?? null,
    },
    profileSnapshot: { defaultsApplied: [] },
    devices: { connected: [], controllableTrainer: null, selectedSources: [] },
    capabilities: {
      canTrackLocation: false,
      canTrackPower: false,
      canTrackHeartRate: false,
      canTrackCadence: false,
      shouldShowMap: false,
      shouldShowSteps: false,
      shouldShowRouteOverlay: false,
      shouldShowTurnByTurn: false,
      shouldShowFollowAlong: false,
      shouldShowTrainerControl: false,
      canAutoAdvanceSteps: false,
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
      controlPolicy: { trainerMode: "manual", autoAdvanceSteps: false },
      degradedModePolicy: {
        allowWithoutGps: true,
        allowWithoutSensors: true,
        exposeSourceWarnings: true,
      },
    },
  };
}
