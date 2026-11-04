import type {
  RecordingSessionOverride,
  RecordingSessionSnapshot,
} from "../schemas/recording-session";
import type { RecorderAdapterCapabilityContract } from "./adapter-capabilities";
import {
  type PortableTimerRecordingDraft,
  portableTimerRecordingDraftSchema,
} from "./portable-timer-draft";
import type { RecordingMetricSample } from "./samples";
import {
  createDefaultRecordingRuntimeSourceState,
  createDefaultRecordingSessionOverrideState,
  type RecordingRuntimeSourceState,
  type RecordingSessionLifecycleState,
  type RecordingSessionOverrideState,
} from "./session-state";

export interface RecordingSessionReducerState {
  lifecycle: RecordingSessionLifecycleState;
  snapshot: RecordingSessionSnapshot | null;
  overrides: RecordingSessionOverride[];
  overrideState: RecordingSessionOverrideState;
  runtimeSourceState: RecordingRuntimeSourceState;
  adapterCapabilities: RecorderAdapterCapabilityContract[];
  sampleCount: number;
  lastSampleAtMs: number | null;
  finalizationError: string | null;
}

export type RecordingCommand =
  | { type: "create_session"; snapshot: RecordingSessionSnapshot }
  | { type: "recover_session"; draft: PortableTimerRecordingDraft }
  | { type: "mark_ready" }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "begin_finalization" }
  | { type: "finish" }
  | { type: "fail_finalization"; message: string }
  | { type: "retry_finalization" }
  | { type: "apply_override"; override: RecordingSessionOverride }
  | { type: "set_runtime_sources"; state: RecordingRuntimeSourceState }
  | { type: "set_adapter_capabilities"; capabilities: RecorderAdapterCapabilityContract[] }
  | { type: "ingest_samples"; samples: RecordingMetricSample[] };

export type RecordingEvent =
  | { type: "session_created"; snapshot: RecordingSessionSnapshot }
  | { type: "session_recovered"; draft: PortableTimerRecordingDraft }
  | { type: "session_ready" }
  | { type: "recording_started" }
  | { type: "recording_paused" }
  | { type: "recording_resumed" }
  | { type: "finalization_started" }
  | { type: "session_finished" }
  | { type: "finalization_failed"; message: string }
  | { type: "override_applied"; override: RecordingSessionOverride }
  | { type: "runtime_sources_changed"; state: RecordingRuntimeSourceState }
  | { type: "adapter_capabilities_changed"; capabilities: RecorderAdapterCapabilityContract[] }
  | { type: "samples_ingested"; count: number; lastSampleAtMs: number | null };

export type RecordingReducerEffect =
  | "prepare_session"
  | "start_timer"
  | "stop_timer"
  | "pause_streams"
  | "resume_streams"
  | "finalize_artifacts";

export interface RecordingCommandDecision {
  events: RecordingEvent[];
  effects: RecordingReducerEffect[];
  rejected?: { reason: string };
}

export function createInitialRecordingReducerState(): RecordingSessionReducerState {
  return {
    lifecycle: "pending",
    snapshot: null,
    overrides: [],
    overrideState: createDefaultRecordingSessionOverrideState(),
    runtimeSourceState: createDefaultRecordingRuntimeSourceState(),
    adapterCapabilities: [],
    sampleCount: 0,
    lastSampleAtMs: null,
    finalizationError: null,
  };
}

export function decideRecordingCommand(
  state: RecordingSessionReducerState,
  command: RecordingCommand,
): RecordingCommandDecision {
  switch (command.type) {
    case "create_session":
      if (state.lifecycle !== "pending") {
        return reject(`Cannot create a session from ${state.lifecycle}.`);
      }
      return {
        events: [{ type: "session_created", snapshot: command.snapshot }],
        effects: ["prepare_session"],
      };
    case "recover_session": {
      if (state.lifecycle !== "pending") {
        return reject(`Cannot recover a session from ${state.lifecycle}.`);
      }
      const parsedDraft = portableTimerRecordingDraftSchema.safeParse(command.draft);
      if (!parsedDraft.success) return reject("Cannot recover an invalid recording draft.");
      return {
        events: [{ type: "session_recovered", draft: parsedDraft.data }],
        effects: [],
      };
    }
    case "mark_ready":
      if (state.lifecycle !== "pending")
        return reject(`Cannot mark ready from ${state.lifecycle}.`);
      if (!state.snapshot) return reject("Cannot mark ready without a session snapshot.");
      return { events: [{ type: "session_ready" }], effects: [] };
    case "start":
      if (state.lifecycle !== "ready")
        return reject(`Cannot start recording from ${state.lifecycle}.`);
      return { events: [{ type: "recording_started" }], effects: ["start_timer"] };
    case "pause":
      if (state.lifecycle !== "recording")
        return reject(`Cannot pause recording from ${state.lifecycle}.`);
      return { events: [{ type: "recording_paused" }], effects: ["stop_timer", "pause_streams"] };
    case "resume":
      if (state.lifecycle !== "paused")
        return reject(`Cannot resume recording from ${state.lifecycle}.`);
      return {
        events: [{ type: "recording_resumed" }],
        effects: ["start_timer", "resume_streams"],
      };
    case "begin_finalization":
      if (state.lifecycle !== "recording" && state.lifecycle !== "paused") {
        return reject(`Cannot finalize recording from ${state.lifecycle}.`);
      }
      return {
        events: [{ type: "finalization_started" }],
        effects: ["stop_timer", "finalize_artifacts"],
      };
    case "finish":
      if (state.lifecycle !== "finishing")
        return reject(`Cannot finish recording from ${state.lifecycle}.`);
      if (state.finalizationError) return reject("Cannot finish while finalization is failed.");
      return { events: [{ type: "session_finished" }], effects: [] };
    case "fail_finalization":
      if (state.lifecycle !== "finishing")
        return reject(`Cannot fail finalization from ${state.lifecycle}.`);
      return { events: [{ type: "finalization_failed", message: command.message }], effects: [] };
    case "retry_finalization":
      if (state.lifecycle !== "finishing" || !state.finalizationError) {
        return reject("Cannot retry finalization unless finalization is failed.");
      }
      return { events: [{ type: "finalization_started" }], effects: ["finalize_artifacts"] };
    case "apply_override":
      return { events: [{ type: "override_applied", override: command.override }], effects: [] };
    case "set_runtime_sources":
      return { events: [{ type: "runtime_sources_changed", state: command.state }], effects: [] };
    case "set_adapter_capabilities":
      return {
        events: [{ type: "adapter_capabilities_changed", capabilities: command.capabilities }],
        effects: [],
      };
    case "ingest_samples":
      return {
        events: [
          {
            type: "samples_ingested",
            count: command.samples.length,
            lastSampleAtMs: command.samples.at(-1)?.recordedAt
              ? Date.parse(command.samples.at(-1)?.recordedAt ?? "")
              : null,
          },
        ],
        effects: [],
      };
  }
}

export function reduceRecordingEvent(
  state: RecordingSessionReducerState,
  event: RecordingEvent,
): RecordingSessionReducerState {
  switch (event.type) {
    case "session_created":
      return {
        ...state,
        snapshot: event.snapshot,
        overrides: [],
        overrideState: createDefaultRecordingSessionOverrideState(),
        runtimeSourceState: createDefaultRecordingRuntimeSourceState(),
        sampleCount: 0,
        lastSampleAtMs: null,
        finalizationError: null,
      };
    case "session_recovered":
      return {
        ...state,
        lifecycle: "paused",
        snapshot: event.draft.sessionSnapshot,
        overrides: [],
        overrideState: createDefaultRecordingSessionOverrideState(),
        runtimeSourceState: createDefaultRecordingRuntimeSourceState(),
        adapterCapabilities: [],
        sampleCount: 0,
        lastSampleAtMs: null,
        finalizationError: null,
      };
    case "session_ready":
      return { ...state, lifecycle: "ready" };
    case "recording_started":
    case "recording_resumed":
      return { ...state, lifecycle: "recording", finalizationError: null };
    case "recording_paused":
      return { ...state, lifecycle: "paused" };
    case "finalization_started":
      return { ...state, lifecycle: "finishing", finalizationError: null };
    case "session_finished":
      return { ...state, lifecycle: "finished", finalizationError: null };
    case "finalization_failed":
      return { ...state, finalizationError: event.message };
    case "override_applied":
      return applyOverrideToState(state, event.override);
    case "runtime_sources_changed":
      return { ...state, runtimeSourceState: cloneRuntimeSourceState(event.state) };
    case "adapter_capabilities_changed":
      return { ...state, adapterCapabilities: event.capabilities.map(cloneAdapterCapability) };
    case "samples_ingested":
      return {
        ...state,
        sampleCount: state.sampleCount + event.count,
        lastSampleAtMs: event.lastSampleAtMs ?? state.lastSampleAtMs,
      };
  }
}

export function reduceRecordingEvents(
  state: RecordingSessionReducerState,
  events: RecordingEvent[],
): RecordingSessionReducerState {
  return events.reduce(reduceRecordingEvent, state);
}

function reject(reason: string): RecordingCommandDecision {
  return { events: [], effects: [], rejected: { reason } };
}

function applyOverrideToState(
  state: RecordingSessionReducerState,
  override: RecordingSessionOverride,
): RecordingSessionReducerState {
  const overrideState: RecordingSessionOverrideState = {
    trainerMode: state.overrideState.trainerMode,
    intensityScale: state.overrideState.intensityScale,
    preferredSources: { ...state.overrideState.preferredSources },
    disabledSources: { ...state.overrideState.disabledSources },
  };
  if (override.type === "trainer_mode") overrideState.trainerMode = override.value;
  else if (override.type === "intensity_scale") overrideState.intensityScale = override.value;
  else if (override.type === "preferred_source") {
    overrideState.preferredSources = {
      ...overrideState.preferredSources,
      [override.metricFamily]: override.sourceId,
    };
  }
  return { ...state, overrides: [...state.overrides, override], overrideState };
}

function cloneRuntimeSourceState(state: RecordingRuntimeSourceState): RecordingRuntimeSourceState {
  return {
    selectedSources: state.selectedSources.map((selection) => ({ ...selection })),
    currentMetrics: Object.fromEntries(
      Object.entries(state.currentMetrics).map(([metricFamily, value]) => [
        metricFamily,
        value ? { ...value } : value,
      ]),
    ),
    degradedState: {
      isDegraded: state.degradedState.isDegraded,
      metrics: [...state.degradedState.metrics],
    },
    sourceChanges: state.sourceChanges.map((change) => ({ ...change })),
  };
}

function cloneAdapterCapability(
  capability: RecorderAdapterCapabilityContract,
): RecorderAdapterCapabilityContract {
  return {
    ...capability,
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
    notes: [...capability.notes],
  };
}
