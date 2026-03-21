import type { RecordingConfiguration, RecordingControlPolicy } from "@repo/core";
import type {
  CurrentReadings,
  RecorderLifecycleState,
  RecordingPlanView,
  RecordingRuntimeSourceState,
  RecordingSessionOverride,
  RecordingSessionOverrideState,
  RecordingSessionSnapshot,
  RecordingSessionView,
  RecordingTrainerView,
  SessionStats,
} from "./types";

const DEFAULT_OVERRIDE_STATE: RecordingSessionOverrideState = {
  trainerMode: "auto",
  intensityScale: 1,
  preferredSources: {},
};

const DEFAULT_RUNTIME_SOURCE_STATE: RecordingRuntimeSourceState = {
  selectedSources: [],
  currentMetrics: {},
  degradedState: {
    isDegraded: false,
    metrics: [],
  },
  sourceChanges: [],
};

export interface SessionViewInputs {
  trainer: RecordingTrainerView;
  currentReadings: CurrentReadings;
  sessionStats: SessionStats;
  recordingConfiguration: RecordingConfiguration;
  trainerControlPolicy: RecordingControlPolicy;
  plan: RecordingPlanView;
}

export class RecordingSessionController {
  private lifecycle: RecorderLifecycleState = "pending";
  private snapshot: RecordingSessionSnapshot | null = null;
  private overrides: RecordingSessionOverride[] = [];
  private overrideState: RecordingSessionOverrideState = DEFAULT_OVERRIDE_STATE;
  private runtimeSourceState: RecordingRuntimeSourceState = DEFAULT_RUNTIME_SOURCE_STATE;

  public setLifecycle(lifecycle: RecorderLifecycleState): void {
    this.lifecycle = lifecycle;
  }

  public getLifecycle(): RecorderLifecycleState {
    return this.lifecycle;
  }

  public setSnapshot(snapshot: RecordingSessionSnapshot | null): void {
    this.snapshot = snapshot;
  }

  public getSnapshot(): RecordingSessionSnapshot | null {
    return this.snapshot;
  }

  public hasLockedSnapshot(): boolean {
    return this.snapshot !== null;
  }

  public resetForNewSession(snapshot: RecordingSessionSnapshot): void {
    this.snapshot = snapshot;
    this.overrides = [];
    this.runtimeSourceState = {
      selectedSources: [],
      currentMetrics: {},
      degradedState: {
        isDegraded: false,
        metrics: [],
      },
      sourceChanges: [],
    };
  }

  public resetAll(): void {
    this.lifecycle = "pending";
    this.snapshot = null;
    this.overrides = [];
    this.overrideState = {
      trainerMode: "auto",
      intensityScale: 1,
      preferredSources: {},
    };
    this.runtimeSourceState = {
      selectedSources: [],
      currentMetrics: {},
      degradedState: {
        isDegraded: false,
        metrics: [],
      },
      sourceChanges: [],
    };
  }

  public getOverrides(): RecordingSessionOverride[] {
    return [...this.overrides];
  }

  public applyOverride(override: RecordingSessionOverride): void {
    if (override.type === "trainer_mode") {
      this.overrideState = {
        ...this.overrideState,
        trainerMode: override.value,
      };
    } else if (override.type === "intensity_scale") {
      this.overrideState = {
        ...this.overrideState,
        intensityScale: override.value,
      };
    } else if (override.type === "preferred_source") {
      this.overrideState = {
        ...this.overrideState,
        preferredSources: {
          ...this.overrideState.preferredSources,
          [override.metricFamily]: override.sourceId,
        },
      };
    }

    this.overrides = [...this.overrides, override];
  }

  public getOverrideState(): RecordingSessionOverrideState {
    return {
      trainerMode: this.overrideState.trainerMode,
      intensityScale: this.overrideState.intensityScale,
      preferredSources: { ...this.overrideState.preferredSources },
    };
  }

  public updateOverrideState(
    updater: (state: RecordingSessionOverrideState) => RecordingSessionOverrideState,
  ): void {
    this.overrideState = updater(this.getOverrideState());
  }

  public getRuntimeSourceState(): RecordingRuntimeSourceState {
    return {
      selectedSources: [...this.runtimeSourceState.selectedSources],
      currentMetrics: { ...this.runtimeSourceState.currentMetrics },
      degradedState: {
        isDegraded: this.runtimeSourceState.degradedState.isDegraded,
        metrics: [...this.runtimeSourceState.degradedState.metrics],
      },
      sourceChanges: [...this.runtimeSourceState.sourceChanges],
    };
  }

  public setRuntimeSourceState(state: RecordingRuntimeSourceState): void {
    this.runtimeSourceState = {
      selectedSources: [...state.selectedSources],
      currentMetrics: { ...state.currentMetrics },
      degradedState: {
        isDegraded: state.degradedState.isDegraded,
        metrics: [...state.degradedState.metrics],
      },
      sourceChanges: [...state.sourceChanges],
    };
  }

  public buildView(inputs: SessionViewInputs): RecordingSessionView {
    return {
      lifecycle: this.lifecycle,
      snapshot: this.snapshot,
      overrides: this.getOverrides(),
      overrideState: this.getOverrideState(),
      trainerControlPolicy: inputs.trainerControlPolicy,
      trainer: inputs.trainer,
      currentReadings: inputs.currentReadings,
      sessionStats: inputs.sessionStats,
      recordingConfiguration: inputs.recordingConfiguration,
      runtimeSourceState: this.getRuntimeSourceState(),
      plan: inputs.plan,
    };
  }
}
