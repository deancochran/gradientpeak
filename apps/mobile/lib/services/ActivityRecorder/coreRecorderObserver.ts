import {
  createInitialRecordingReducerState,
  decideRecordingCommand,
  type RecordingCommand,
  type RecordingCommandDecision,
  type RecordingReducerEffect,
  type RecordingSessionLifecycleState,
  type RecordingSessionReducerState,
  type RecordingSessionSnapshot,
  reduceRecordingEvents,
} from "@repo/core";

export interface ObservedRecorderDecision {
  command: RecordingCommand;
  decision: RecordingCommandDecision;
}

export interface ObservedCoreRecorderLifecycleState {
  lifecycle: RecordingSessionLifecycleState;
  finalizationError: string | null;
}

/**
 * Observes mobile recorder lifecycle through the Core reducer without changing mobile side effects.
 *
 * The mobile recorder remains authoritative for native GPS, BLE/FTMS, FIT, checkpointing, and
 * recovery in this migration slice. This adapter mirrors lifecycle commands into Core so tests can
 * prove the shared reducer matches mobile behavior before it becomes the source of truth.
 */
export class CoreRecorderReducerObserver {
  private reducerState: RecordingSessionReducerState = createInitialRecordingReducerState();
  private decisions: ObservedRecorderDecision[] = [];

  public getState(): RecordingSessionReducerState {
    return cloneReducerState(this.reducerState);
  }

  public getLifecycleState(): ObservedCoreRecorderLifecycleState {
    return {
      lifecycle: this.reducerState.lifecycle,
      finalizationError: this.reducerState.finalizationError,
    };
  }

  public getDecisions(): ObservedRecorderDecision[] {
    return [...this.decisions];
  }

  public reset(): void {
    this.reducerState = createInitialRecordingReducerState();
    this.decisions = [];
  }

  public observeSessionReady(snapshot: RecordingSessionSnapshot): RecordingReducerEffect[] {
    this.reset();
    return [
      ...this.dispatch({ type: "create_session", snapshot }),
      ...this.dispatch({ type: "mark_ready" }),
    ];
  }

  public observeRecordingStarted(snapshot: RecordingSessionSnapshot): RecordingReducerEffect[] {
    return [...this.observeSessionReady(snapshot), ...this.dispatch({ type: "start" })];
  }

  public observeRecoveredPaused(snapshot: RecordingSessionSnapshot): RecordingReducerEffect[] {
    return [...this.observeRecordingStarted(snapshot), ...this.dispatch({ type: "pause" })];
  }

  public observePaused(): RecordingReducerEffect[] {
    return this.dispatch({ type: "pause" });
  }

  public observeResumed(): RecordingReducerEffect[] {
    return this.dispatch({ type: "resume" });
  }

  public observeFinalizationStarted({ retry }: { retry: boolean }): RecordingReducerEffect[] {
    return this.dispatch({ type: retry ? "retry_finalization" : "begin_finalization" });
  }

  public observeFinalizationFailed(message: string): RecordingReducerEffect[] {
    return this.dispatch({ type: "fail_finalization", message });
  }

  public observeFinished(): RecordingReducerEffect[] {
    return this.dispatch({ type: "finish" });
  }

  private dispatch(command: RecordingCommand): RecordingReducerEffect[] {
    const decision = decideRecordingCommand(this.reducerState, command);
    this.decisions = [...this.decisions, { command, decision }];

    if (!decision.rejected) {
      this.reducerState = reduceRecordingEvents(this.reducerState, decision.events);
    }

    return decision.effects;
  }
}

function cloneReducerState(state: RecordingSessionReducerState): RecordingSessionReducerState {
  return {
    ...state,
    snapshot: cloneSessionSnapshot(state.snapshot),
    overrides: state.overrides.map((override) => ({ ...override })),
    overrideState: {
      trainerMode: state.overrideState.trainerMode,
      intensityScale: state.overrideState.intensityScale,
      preferredSources: { ...state.overrideState.preferredSources },
      disabledSources: Object.fromEntries(
        Object.entries(state.overrideState.disabledSources).map(([metricFamily, sourceIds]) => [
          metricFamily,
          [...(sourceIds ?? [])],
        ]),
      ),
    },
    runtimeSourceState: {
      selectedSources: state.runtimeSourceState.selectedSources.map((selection) => ({
        ...selection,
      })),
      currentMetrics: Object.fromEntries(
        Object.entries(state.runtimeSourceState.currentMetrics).map(([metricFamily, value]) => [
          metricFamily,
          value ? { ...value } : value,
        ]),
      ),
      degradedState: {
        isDegraded: state.runtimeSourceState.degradedState.isDegraded,
        metrics: [...state.runtimeSourceState.degradedState.metrics],
      },
      sourceChanges: state.runtimeSourceState.sourceChanges.map((change) => ({ ...change })),
    },
    adapterCapabilities: state.adapterCapabilities.map((capability) => ({
      ...capability,
      notes: [...capability.notes],
      bleFtms: {
        bleScanning: capability.bleFtms.bleScanning,
        ftmsMeasurement: capability.bleFtms.ftmsMeasurement
          ? {
              machineType: capability.bleFtms.ftmsMeasurement.machineType,
              metrics: capability.bleFtms.ftmsMeasurement.metrics.map((metric) => ({
                metricFamily: metric.metricFamily,
                sourceTypes: [...metric.sourceTypes],
              })),
            }
          : null,
        ftmsControl: capability.bleFtms.ftmsControl
          ? {
              canRequestControl: capability.bleFtms.ftmsControl.canRequestControl,
              supportedModes: [...capability.bleFtms.ftmsControl.supportedModes],
            }
          : null,
      },
    })),
  };
}

function cloneSessionSnapshot(
  snapshot: RecordingSessionSnapshot | null,
): RecordingSessionSnapshot | null {
  if (!snapshot) return null;

  return {
    identity: { ...snapshot.identity },
    activity: { ...snapshot.activity },
    profileSnapshot: {
      ...snapshot.profileSnapshot,
      defaultsApplied: [...snapshot.profileSnapshot.defaultsApplied],
    },
    devices: {
      connected: snapshot.devices.connected.map((device) => ({
        ...device,
        sourceTypes: [...device.sourceTypes],
      })),
      controllableTrainer: snapshot.devices.controllableTrainer
        ? {
            ...snapshot.devices.controllableTrainer,
            sourceTypes: [...snapshot.devices.controllableTrainer.sourceTypes],
          }
        : null,
      selectedSources: snapshot.devices.selectedSources.map((selection) => ({ ...selection })),
    },
    capabilities: {
      ...snapshot.capabilities,
      errors: [...snapshot.capabilities.errors],
      warnings: [...snapshot.capabilities.warnings],
    },
    policies: {
      sourcePolicy: { ...snapshot.policies.sourcePolicy },
      controlPolicy: { ...snapshot.policies.controlPolicy },
      degradedModePolicy: { ...snapshot.policies.degradedModePolicy },
    },
  };
}
