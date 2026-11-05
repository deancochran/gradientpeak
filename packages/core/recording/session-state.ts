import type {
  CurrentMetricValue,
  MetricFamily,
  MetricProvenance,
  MetricSourceSelection,
  RecordingSessionOverride,
  RecordingSessionSnapshot,
} from "../schemas/recording-session";

export type RecordingSessionLifecycleState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "finishing"
  | "finished";

export interface RecordingSourceChangeEvent {
  metricFamily: MetricFamily;
  previousSourceId: string | null;
  nextSourceId: string | null;
  previousProvenance: MetricProvenance;
  nextProvenance: MetricProvenance;
  recordedAt: string;
}

export interface RecordingDegradedState {
  isDegraded: boolean;
  metrics: MetricFamily[];
}

export interface RecordingRuntimeSourceState {
  selectedSources: MetricSourceSelection[];
  currentMetrics: Partial<Record<MetricFamily, CurrentMetricValue>>;
  degradedState: RecordingDegradedState;
  sourceChanges: RecordingSourceChangeEvent[];
}

export interface RecordingSessionOverrideState {
  trainerMode: "auto" | "manual";
  intensityScale: number;
  preferredSources: Partial<Record<MetricFamily, string>>;
  disabledSources: Partial<Record<MetricFamily, string[]>>;
}

export type RecordingSessionCoreView = {
  lifecycle: RecordingSessionLifecycleState;
  snapshot: RecordingSessionSnapshot | null;
  overrides: RecordingSessionOverride[];
  overrideState: RecordingSessionOverrideState;
  runtimeSourceState: RecordingRuntimeSourceState;
};

export type RecordingSessionStateView<TViewInputs extends object> = RecordingSessionCoreView &
  TViewInputs;

export function createDefaultRecordingSessionOverrideState(): RecordingSessionOverrideState {
  return {
    trainerMode: "auto",
    intensityScale: 1,
    preferredSources: {},
    disabledSources: {},
  };
}

export function createDefaultRecordingRuntimeSourceState(): RecordingRuntimeSourceState {
  return {
    selectedSources: [],
    currentMetrics: {},
    degradedState: {
      isDegraded: false,
      metrics: [],
    },
    sourceChanges: [],
  };
}

function cloneOverrideState(state: RecordingSessionOverrideState): RecordingSessionOverrideState {
  return {
    trainerMode: state.trainerMode,
    intensityScale: state.intensityScale,
    preferredSources: { ...state.preferredSources },
    disabledSources: Object.fromEntries(
      Object.entries(state.disabledSources).map(([metricFamily, sourceIds]) => [
        metricFamily,
        [...(sourceIds ?? [])],
      ]),
    ),
  };
}

function cloneRuntimeSourceState(state: RecordingRuntimeSourceState): RecordingRuntimeSourceState {
  return {
    selectedSources: [...state.selectedSources],
    currentMetrics: { ...state.currentMetrics },
    degradedState: {
      isDegraded: state.degradedState.isDegraded,
      metrics: [...state.degradedState.metrics],
    },
    sourceChanges: [...state.sourceChanges],
  };
}

export class RecordingSessionStateController<TViewInputs extends object = Record<string, never>> {
  private lifecycle: RecordingSessionLifecycleState = "pending";
  private snapshot: RecordingSessionSnapshot | null = null;
  private overrides: RecordingSessionOverride[] = [];
  private overrideState: RecordingSessionOverrideState =
    createDefaultRecordingSessionOverrideState();
  private runtimeSourceState: RecordingRuntimeSourceState =
    createDefaultRecordingRuntimeSourceState();

  public setLifecycle(lifecycle: RecordingSessionLifecycleState): void {
    this.lifecycle = lifecycle;
  }

  public getLifecycle(): RecordingSessionLifecycleState {
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
    this.runtimeSourceState = createDefaultRecordingRuntimeSourceState();
  }

  public resetAll(): void {
    this.lifecycle = "pending";
    this.snapshot = null;
    this.overrides = [];
    this.overrideState = createDefaultRecordingSessionOverrideState();
    this.runtimeSourceState = createDefaultRecordingRuntimeSourceState();
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
    return cloneOverrideState(this.overrideState);
  }

  public updateOverrideState(
    updater: (state: RecordingSessionOverrideState) => RecordingSessionOverrideState,
  ): void {
    this.overrideState = updater(this.getOverrideState());
  }

  public getRuntimeSourceState(): RecordingRuntimeSourceState {
    return cloneRuntimeSourceState(this.runtimeSourceState);
  }

  public setRuntimeSourceState(state: RecordingRuntimeSourceState): void {
    this.runtimeSourceState = cloneRuntimeSourceState(state);
  }

  public buildView(inputs: TViewInputs): RecordingSessionStateView<TViewInputs> {
    return {
      lifecycle: this.lifecycle,
      snapshot: this.snapshot,
      overrides: this.getOverrides(),
      overrideState: this.getOverrideState(),
      runtimeSourceState: this.getRuntimeSourceState(),
      ...inputs,
    };
  }
}
