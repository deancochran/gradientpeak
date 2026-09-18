const mockPermissionCheck = jest.fn(async (_gpsRecordingEnabled: boolean) => true);
const mockCommitFinalizedArtifactAndHandoff = jest.fn(async (_artifact: unknown) => undefined);
const mockDiscardFinalizedRecordingEvidence = jest.fn(async (_input: unknown) => undefined);
const mockDeleteFinalizedArtifactFiles = jest.fn(async (_artifact: unknown) => undefined);
const mockFitInstances: Array<Record<string, jest.Mock>> = [];
const mockNotificationInstances: Array<Record<string, jest.Mock>> = [];
const persistedCheckpoints = new Map<string, unknown>();

jest.mock("expo", () => ({
  EventEmitter: class MockEventEmitter {
    emit = jest.fn();
  },
}));

jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("../permissions-check", () => ({
  areAllPermissionsGranted: jest.fn(() => true),
  areRecordingPermissionsGranted: (gpsRecordingEnabled: boolean) =>
    mockPermissionCheck(gpsRecordingEnabled),
  checkAllPermissions: jest.fn(async () => ({
    bluetooth: "granted",
    location: "granted",
    locationBackground: "granted",
  })),
}));

jest.mock("./recordingEvidenceJournal", () => ({
  allocateRecordingEvidenceSession: jest.fn(async () => undefined),
  createRecordingStreamJournalAdapter: jest.fn(() => ({})),
  fenceRecordingEvidenceSession: jest.fn(async () => undefined),
  commitFinalizedArtifactAndHandoff: (artifact: unknown) =>
    mockCommitFinalizedArtifactAndHandoff(artifact),
  discardFinalizedRecordingEvidence: (input: unknown) =>
    mockDiscardFinalizedRecordingEvidence(input),
  rollbackRecordingEvidenceSession: jest.fn(async () => undefined),
  quarantineRecordingEvidenceSession: jest.fn(async () => true),
}));

jest.mock("./finalizedArtifactStorage", () => ({
  deleteFinalizedArtifactFiles: (artifact: unknown) => mockDeleteFinalizedArtifactFiles(artifact),
}));

jest.mock("../activitySubmissionQueue/localArtifact", () => ({
  getLocalActivityArtifactMetadata: jest.fn(async () => ({ byteSize: 1, sha256: "0".repeat(64) })),
}));

jest.mock("./checkpointStorage", () => ({
  MOBILE_RECORDING_CHECKPOINT_SCHEMA_VERSION: 5,
  assertRecordingPlanExecutionStructureHashes: jest.fn(async () => undefined),
  clearRecordingCheckpoint: jest.fn(async () => undefined),
  hashRecordingPlan: jest.fn(async () => "0".repeat(64)),
  persistRecordingCheckpoint: jest.fn(async (checkpoint: { sessionId: string }) => {
    persistedCheckpoints.set(checkpoint.sessionId, checkpoint);
  }),
  loadAndClaimRecordingCheckpoint: jest.fn(async (profileId: string) => {
    const checkpoint = [...persistedCheckpoints.values()].find(
      (value) => (value as { profileId: string }).profileId === profileId,
    );
    return checkpoint ? { status: "recovered", checkpoint } : { status: "none" };
  }),
  releaseRecordingCheckpointClaim: jest.fn(),
}));

jest.mock("./StreamBuffer", () => {
  const replay = {
    sensorReadings: [{ metric: "distance", dataType: "float", value: 100, timestamp: 1 }],
    fitRecords: [{ timestamp: 1, distance: 100 }],
  };
  return {
    __replay: replay,
    StreamBuffer: {
      reopenForRecovery: jest.fn(async () => ({
        streamBuffer: { getBufferStatus: () => ({ storageDir: "/streams" }) },
        replay,
      })),
      deleteDurableDirectories: jest.fn(),
      mergeRecoveredLocations: jest.fn((value) => value),
    },
  };
});

jest.mock("../fit/GarminFitEncoder", () => ({
  validateFinalizedFitFile: jest.fn(async () => ({ byteSize: 1 })),
  GarminFitEncoder: jest.fn().mockImplementation(() => {
    const encoder = {
      initialize: jest.fn(async () => undefined),
      cleanup: jest.fn(async () => undefined),
      pause: jest.fn(async () => undefined),
      resume: jest.fn(async () => undefined),
      finalize: jest.fn(async () => undefined),
      addRecord: jest.fn(async () => undefined),
      addRecords: jest.fn(async () => undefined),
      getFilePath: jest.fn(() => "/recording.fit"),
      getStatus: jest.fn(() => ({ isInitialized: true, isFinalized: false, recordCount: 1 })),
    };
    mockFitInstances.push(encoder);
    return encoder;
  }),
}));

jest.mock("./notification", () => ({
  NotificationsManager: jest.fn().mockImplementation(() => {
    const manager = {
      startForegroundService: jest.fn(async () => undefined),
      stopForegroundService: jest.fn(async () => undefined),
    };
    mockNotificationInstances.push(manager);
    return manager;
  }),
}));

jest.mock("./LiveMetricsManager", () => ({ LiveMetricsManager: jest.fn() }));
jest.mock("./sensors", () => ({ SensorsManager: jest.fn() }));
jest.mock("./trainerControl", () => ({
  TrainerControl: jest.fn(),
  inferTrainerMachineType: jest.fn(),
}));

import { createUnavailableAthletePerformanceTargetFacts } from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { secondsPerKilometerToMetersPerSecond } from "@repo/core/units";
import { rebaseRetainedFitRecordDistances } from "./fitRecordWriter";
import { ActivityRecorderService } from "./index";
import { compileRecordingPlan, createFreeRecordingExecutionPlan } from "./plan";
import { PlanExecution } from "./planExecution";
import type { RecordingSessionArtifact } from "./types";

const mockFitFiles = new Map<string, Uint8Array>();
jest.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache/" }, document: { uri: "file:///documents/" } },
  Directory: class MockDirectory {
    exists = false;
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    create() {
      this.exists = true;
    }
    delete() {
      this.exists = false;
    }
    list() {
      return [];
    }
  },
  File: class MockFile {
    uri: string;
    exists = false;
    size = 0;
    constructor(uri: string) {
      this.uri = uri;
      const bytes = mockFitFiles.get(uri);
      this.exists = bytes !== undefined;
      this.size = bytes?.length ?? 0;
    }
    create() {
      this.exists = true;
    }
    async write(bytes: Uint8Array | ArrayBuffer) {
      const value = bytes instanceof Uint8Array ? Uint8Array.from(bytes) : new Uint8Array(bytes);
      mockFitFiles.set(this.uri, value);
      this.exists = true;
      this.size = value.length;
    }
    async base64() {
      return Buffer.from(mockFitFiles.get(this.uri) ?? []).toString("base64");
    }
  },
}));

const checkpointStorageMocks = jest.requireMock("./checkpointStorage") as {
  clearRecordingCheckpoint: jest.Mock;
  loadAndClaimRecordingCheckpoint: jest.Mock;
  persistRecordingCheckpoint: jest.Mock;
};
const evidenceJournalMocks = jest.requireMock("./recordingEvidenceJournal") as {
  allocateRecordingEvidenceSession: jest.Mock;
  rollbackRecordingEvidenceSession: jest.Mock;
  quarantineRecordingEvidenceSession: jest.Mock;
};
const streamBufferMocks = jest.requireMock("./StreamBuffer") as {
  __replay: {
    sensorReadings: Array<{ metric: string; dataType: string; value: number; timestamp: number }>;
    locations: Array<{ timestamp: number }>;
    fitRecords: Array<{ timestamp: number; distance?: number; [key: string]: unknown }>;
  };
  StreamBuffer: { deleteDurableDirectories: jest.Mock };
};
const mockedEvidenceJournal = jest.requireMock("./recordingEvidenceJournal") as {
  fenceRecordingEvidenceSession: jest.Mock;
};

function createPerformanceTargets(
  values = { power: 250, bikeLthr: 160, runLthr: 170, runPace: 300 },
) {
  const asOf = "2026-07-31T00:00:00.000Z";
  return buildPerformanceTargetFactsFixture({
    asOf,
    bikeThresholdWatts: values.power,
    runThresholdMetersPerSecond: secondsPerKilometerToMetersPerSecond(values.runPace),
    lthrBpm: { bike: values.bikeLthr, run: values.runLthr },
  });
}

function createService() {
  const service = Object.create(ActivityRecorderService.prototype) as ActivityRecorderService;
  // biome-ignore lint/suspicious/noExplicitAny: lifecycle tests need controlled access to private service state.
  const mutable = service as any;
  const snapshot = {
    identity: { sessionId: "session-1", startedAt: new Date(1_000).toISOString() },
    activity: { activity_category: "run", gpsMode: "off", eventId: null },
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(
      new Date(1_000).toISOString(),
    ),
  };

  Object.assign(mutable, {
    state: "pending",
    selectedActivityCategory: "run",
    _gpsRecordingEnabled: false,
    _gpsAvailable: false,
    hasConfiguredSetup: true,
    currentLaunchSource: "manual",
    recoveredCheckpoint: null,
    recoveredReplay: null,
    profile: { id: "profile-1", displayName: "Recorder" },
    lifecycleTransition: Promise.resolve(),
    finalizedArtifact: null,
    liveMetricsFinalized: false,
    fitFinalized: false,
    finalizationFailed: false,
    producerFenceClosed: false,
    evidenceFenced: false,
    pausedTime: 0,
    laps: [],
    lastLapTime: 0,
    fitRecordingUpdateInFlight: false,
    fitRecordingUpdatePending: false,
    sessionController: {
      resetForNewSession: jest.fn(),
      resetAll: jest.fn(),
      setLifecycle: jest.fn(),
      updateOverrideState: jest.fn(),
      setRuntimeSourceState: jest.fn(),
      hasLockedSnapshot: jest.fn(() => false),
    },
    liveMetricsManager: {
      setGpsRecordingEnabled: jest.fn(),
      setActivityCategory: jest.fn(),
      updatePerformanceTargets: jest.fn(),
      bindEvidenceSession: jest.fn(),
      startRecording: jest.fn(async () => undefined),
      finishRecording: jest.fn(async () => undefined),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      cleanup: jest.fn(async () => undefined),
      stageRecoveredRecording: jest.fn(async () => undefined),
      streamBuffer: {
        getBufferStatus: jest.fn(() => ({ storageDir: "/streams" })),
        flushToFiles: jest.fn(async () => undefined),
      },
    },
    locationManager: {
      isTrackingForeground: jest.fn(() => false),
      isTrackingBackground: jest.fn(async () => false),
      startForegroundTracking: jest.fn(async () => undefined),
      startBackgroundTracking: jest.fn(async () => undefined),
      startHeadingTracking: jest.fn(async () => undefined),
      stopForegroundTracking: jest.fn(async () => undefined),
      stopBackgroundTracking: jest.fn(async () => undefined),
      stopHeadingTracking: jest.fn(async () => undefined),
      stopAllTracking: jest.fn(async () => undefined),
      cleanup: jest.fn(async () => undefined),
    },
    sensorsManager: {
      setAutoReconnectEnabled: jest.fn(),
      reconnectAll: jest.fn(async () => undefined),
      getConnectedSensors: jest.fn(() => []),
      disconnectAll: jest.fn(async () => undefined),
      cleanup: jest.fn(async () => undefined),
    },
    planExecution: {
      resetForRecordingStart: jest.fn(),
      clear: jest.fn(),
      getCurrentStep: jest.fn(() => undefined),
      completeForFinalization: jest.fn(),
    },
    planBoundaryTransition: Promise.resolve(),
    checkpointDirty: false,
    checkpointWriteInFlight: null,
    lastCheckpointWriteAt: 0,
    completedOccurrences: [],
    boundaryJournal: [],
    rewindJournal: [],
    timerEvents: [],
    checkpointRevision: 0,
    planHash: "0".repeat(64),
    occurrenceStartStats: { movingSeconds: 0, distanceMeters: 0 },
    occurrenceStartedAt: 1_000,
    trainerControl: {
      neutralizeForBoundary: jest.fn(async () => true),
      resetAdaptiveState: jest.fn(),
    },
    routeController: { clearCurrentRouteState: jest.fn() },
    emit: jest.fn(),
    buildSessionSnapshot: jest.fn(() => snapshot),
    publishSnapshotUpdate: jest.fn(),
    publishSessionUpdate: jest.fn(),
    scheduleSessionUpdate: jest.fn(),
    startElapsedTimeUpdates: jest.fn(),
    stopElapsedTimeUpdates: jest.fn(),
    syncAutomaticTrainerControl: jest.fn(async () => undefined),
    updateFitRecording: jest.fn(async () => undefined),
    waitForFitRecordingWritesToDrain: jest.fn(async () => undefined),
    getSessionSnapshot: jest.fn(() => snapshot),
    getSessionOverrides: jest.fn(() => []),
    getRuntimeSourceState: jest.fn(() => ({})),
    getSessionStats: jest.fn(() => ({
      duration: 4,
      movingTime: 1,
      distance: 10,
      avgSpeed: 2,
      maxSpeed: 3,
      avgPower: 100,
      maxPower: 150,
      avgHeartRate: 120,
      maxHeartRate: 140,
      avgCadence: 80,
      ascent: 1,
      descent: 1,
      calories: 5,
    })),
  });

  return { service, mutable };
}

const navigationIds = {
  segment: "10000000-0000-4000-8000-000000000001",
  interval: "10000000-0000-4000-8000-000000000002",
  first: "10000000-0000-4000-8000-000000000003",
  second: "10000000-0000-4000-8000-000000000004",
  rest: "10000000-0000-4000-8000-000000000005",
};

function createMixedCategoryPlanStructure() {
  const activity = (activity_category: "run" | "bike", prefix: string) => ({
    id: `${prefix}0000-0000-4000-8000-000000000001`,
    role: "activity" as const,
    name: activity_category,
    activity_category,
    intervals: [
      {
        id: `${prefix}0000-0000-4000-8000-000000000002`,
        name: activity_category,
        repetitions: 1,
        steps: [
          {
            id: `${prefix}0000-0000-4000-8000-000000000003`,
            name: activity_category,
            duration: { type: "time" as const, seconds: 60 },
            targets: [{ type: "RPE" as const, intensity: 4 }],
          },
        ],
      },
    ],
  });

  return {
    version: 3 as const,
    segments: [
      activity("run", "3000"),
      {
        id: "30000000-0000-4000-8000-000000000004",
        role: "transition" as const,
        name: "Transition",
        duration: { type: "time" as const, seconds: 60 },
      },
      activity("bike", "4000"),
    ],
  };
}

type DistancePlanMutableRecorder = {
  _plan: Parameters<PlanExecution["loadPlan"]>[0];
  planExecution: PlanExecution;
  state: string;
  startTime: number;
  occurrenceStartedAt: number;
  recordingMetadata: { startedAt: string; profileId: string };
};

type StartFailureMutableRecorder = {
  sensorsManager: { reconnectAll: jest.Mock };
  liveMetricsManager: { startRecording: jest.Mock };
};

function configureDistancePlan(mutable: DistancePlanMutableRecorder, includeRest = false) {
  const structure = {
    version: 3 as const,
    activity_category: "run" as const,
    segments: [
      {
        id: navigationIds.segment,
        role: "activity" as const,
        name: "Run",
        intervals: [
          {
            id: navigationIds.interval,
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: navigationIds.first,
                name: "First",
                duration: { type: "distance" as const, meters: 100 },
                targets: [{ type: "RPE" as const, intensity: 4 }],
              },
              ...(!includeRest
                ? [
                    {
                      id: navigationIds.second,
                      name: "Second",
                      duration: { type: "time" as const, seconds: 60 },
                      targets: [{ type: "RPE" as const, intensity: 5 }],
                    },
                  ]
                : []),
            ],
          },
        ],
      },
      ...(includeRest
        ? [
            {
              id: navigationIds.rest,
              role: "rest" as const,
              name: "Rest",
              duration: { type: "time" as const, seconds: 30 },
            },
          ]
        : []),
    ],
  };
  mutable._plan = { name: "Distance", gps_recording_enabled: includeRest, structure };
  mutable.planExecution = new PlanExecution();
  mutable.planExecution.loadPlan(mutable._plan);
  mutable.planExecution.resetForRecordingStart(0, 0);
  mutable.state = "recording";
  mutable.startTime = 1_000;
  mutable.occurrenceStartedAt = 1_000;
  mutable.recordingMetadata = { startedAt: new Date(1_000).toISOString(), profileId: "profile-1" };
}

describe("ActivityRecorderService lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistedCheckpoints.clear();
    mockFitFiles.clear();
    mockFitInstances.length = 0;
    mockNotificationInstances.length = 0;
    streamBufferMocks.__replay.sensorReadings.splice(0, Infinity, {
      metric: "distance",
      dataType: "float",
      value: 100,
      timestamp: 1,
    });
    streamBufferMocks.__replay.fitRecords.splice(0, Infinity, { timestamp: 1, distance: 100 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses matching canonical targets without mutating an active session snapshot", () => {
    const { service, mutable } = createService();
    const performanceTargets = createPerformanceTargets();
    mutable.getSessionSnapshot.mockReturnValue(null);

    mutable.selectedActivityCategory = "run";
    service.updatePerformanceTargets(performanceTargets);
    expect(mutable.liveMetricsManager.updatePerformanceTargets).toHaveBeenLastCalledWith(
      performanceTargets,
    );

    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);
    service.updateActivityConfiguration("bike", false);
    expect(mutable.liveMetricsManager.setActivityCategory).toHaveBeenLastCalledWith("bike");
    expect(mutable.liveMetricsManager.updatePerformanceTargets).toHaveBeenLastCalledWith(
      performanceTargets,
    );

    mutable.getSessionSnapshot.mockReturnValue({ performanceTargets });
    service.updatePerformanceTargets(
      createPerformanceTargets({ power: 300, bikeLthr: 180, runLthr: 190, runPace: 280 }),
    );
    expect(mutable.liveMetricsManager.updatePerformanceTargets).toHaveBeenLastCalledWith(
      performanceTargets,
    );
    expect(mutable.performanceTargets.thresholds.bike.value).toBe(300);
  });

  it("atomically captures start-supplied targets despite concurrent preview hydration", async () => {
    const { service, mutable } = createService();
    const startPerformanceTargets = createPerformanceTargets();
    const delayedPreview = createPerformanceTargets({
      power: 300,
      bikeLthr: 180,
      runLthr: 190,
      runPace: 280,
    });
    let releaseAllocation: (() => void) | undefined;
    evidenceJournalMocks.allocateRecordingEvidenceSession.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseAllocation = resolve;
        }),
    );
    mutable.getSessionSnapshot.mockReturnValue(null);
    mutable.buildSessionSnapshot = jest.fn((startedAt: string, performanceTargets: unknown) => ({
      identity: { sessionId: "atomic-session", startedAt },
      activity: { activity_category: "run", gpsMode: "off", eventId: null },
      performanceTargets,
    }));

    const startPromise = service.startRecording(startPerformanceTargets);
    await Promise.resolve();
    await Promise.resolve();
    service.updatePerformanceTargets(delayedPreview);
    if (!releaseAllocation) throw new Error("Recording evidence allocation did not start");
    releaseAllocation();
    await startPromise;

    expect(mutable.sessionController.resetForNewSession).toHaveBeenCalledWith(
      expect.objectContaining({ performanceTargets: startPerformanceTargets }),
    );
    expect(mutable.liveMetricsManager.updatePerformanceTargets).toHaveBeenLastCalledWith(
      startPerformanceTargets,
    );
  });

  it("rejects direct mixed-activity_category plan selection before mutating setup state", () => {
    const { service, mutable } = createService();
    mutable.hasConfiguredSetup = false;
    mutable._plan = undefined;
    mutable._eventId = undefined;

    expect(() =>
      service.selectPlan(
        { name: "Mixed plan", structure: createMixedCategoryPlanStructure() },
        "event-1",
      ),
    ).toThrow("This plan can't be recorded on mobile");
    expect(mutable.hasConfiguredSetup).toBe(false);
    expect(mutable._plan).toBeUndefined();
    expect(mutable._eventId).toBeUndefined();
    expect(mutable.planExecution.clear).not.toHaveBeenCalled();
  });

  it("does not replace the selected plan after the recording snapshot locks identity", () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    const originalPlan = mutable._plan;
    if (!originalPlan) throw new Error("Expected configured plan");
    mutable.sessionController.hasLockedSnapshot = jest.fn(() => true);
    mutable.emit.mockClear();
    mutable.planExecution.loadPlan = jest.fn();

    service.selectPlan({
      name: "Replacement run",
      structure: originalPlan.structure,
    });

    expect(mutable._plan).toBe(originalPlan);
    expect(mutable.planExecution.loadPlan).not.toHaveBeenCalled();
    expect(mutable.emit).toHaveBeenCalledWith(
      "error",
      "Plan selection is locked after recording starts for the active session.",
    );
  });

  it("rejects a mixed-plan checkpoint before opening recovery artifacts", async () => {
    const { service } = createService();

    await expect(
      service.stageRecoveredCheckpoint({
        compilerVersion: 1,
        planHash: "0".repeat(64),
        planSnapshot: createMixedCategoryPlanStructure(),
        profileId: "profile-1",
      } as never),
    ).rejects.toThrow("Checkpoint plan structure is invalid");
  });

  it("keeps a genuinely persisted recovery separate from a new valid plan until discard", async () => {
    const original = createService();
    configureDistancePlan(original.mutable);
    original.mutable.getMovingTime = jest.fn(() => 1_000);
    original.mutable.getSessionStats = jest.fn(() => ({ movingTime: 1, distance: 10 }));
    original.mutable.getRuntimeSourceState = jest.fn(() => ({ selectedSources: [] }));
    original.mutable.getSessionOverrideState = jest.fn(() => ({ trainerMode: "auto" }));
    original.mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    original.service.skipStep();
    await original.mutable.planBoundaryTransition;
    const loaded = await checkpointStorageMocks.loadAndClaimRecordingCheckpoint("profile-1");
    expect(loaded.status).toBe("recovered");
    if (loaded.status !== "recovered") throw new Error("expected persisted recovery");
    expect(loaded.checkpoint.performanceTargets).toMatchObject({
      asOf: new Date(1_000).toISOString(),
      thresholds: { bike: { status: "unavailable", value: null } },
    });

    const recovered = createService();
    recovered.mutable.planExecution = new PlanExecution();
    await recovered.service.stageRecoveredCheckpoint(loaded.checkpoint);
    expect(recovered.mutable.performanceTargets).toEqual(loaded.checkpoint.performanceTargets);
    const recoveredPlan = recovered.mutable._plan;
    const recoveredCategory = recovered.mutable.selectedActivityCategory;
    recovered.mutable.planExecution.loadPlan = jest.fn();
    recovered.mutable.persistCurrentCheckpoint = jest.fn();
    checkpointStorageMocks.persistRecordingCheckpoint.mockClear();
    recovered.mutable.emit.mockClear();

    const newPlan = {
      name: "New run",
      structure: {
        version: 3 as const,
        activity_category: "run" as const,
        segments: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            role: "activity" as const,
            name: "Run",
            intervals: [
              {
                id: "50000000-0000-4000-8000-000000000002",
                name: "Main",
                repetitions: 1,
                steps: [
                  {
                    id: "50000000-0000-4000-8000-000000000003",
                    name: "Steady",
                    duration: { type: "time" as const, seconds: 60 },
                    targets: [{ type: "RPE" as const, intensity: 4 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    expect(() => recovered.service.selectPlan(newPlan, "event-new")).toThrow(
      "Resume or discard the recovered recording",
    );
    expect(recovered.mutable._plan).toBe(recoveredPlan);
    expect(recovered.mutable.selectedActivityCategory).toBe(recoveredCategory);
    expect(recovered.mutable.planExecution.loadPlan).not.toHaveBeenCalled();
    expect(recovered.mutable.emit).not.toHaveBeenCalled();
    expect(recovered.mutable.persistCurrentCheckpoint).not.toHaveBeenCalled();
    expect(checkpointStorageMocks.persistRecordingCheckpoint).not.toHaveBeenCalled();

    await recovered.service.discardRecoveredRecording();
    recovered.service.selectPlan(newPlan, "event-new");
    expect(recovered.mutable._plan).toBe(newPlan);
    expect(recovered.mutable.selectedActivityCategory).toBe("run");
    expect(recovered.mutable.planExecution.loadPlan).toHaveBeenCalledWith(newPlan);
    expect(recovered.mutable.emit).toHaveBeenCalledWith("planSelected", {
      plan: newPlan,
      eventId: "event-new",
    });
  });

  it("rejects an invalid mixed-activity_category launch payload before runtime effects", () => {
    const { service, mutable } = createService();
    mutable.hasConfiguredSetup = false;
    mutable._plan = undefined;
    mutable._eventId = undefined;
    mutable.currentLaunchSource = "manual";
    mutable._gpsRecordingEnabled = false;
    mutable.syncGpsTrackingForCurrentState = jest.fn();
    mutable.disconnectTrainerSensors = jest.fn();

    expect(() =>
      service.selectActivityFromPayload({
        activity_category: "run",
        gpsRecordingEnabled: true,
        plan: { id: "plan-1", name: "Mixed plan", structure: createMixedCategoryPlanStructure() },
      } as never),
    ).toThrow("Failed to process activity payload");
    expect(mutable.currentLaunchSource).toBe("manual");
    expect(mutable._gpsRecordingEnabled).toBe(false);
    expect(mutable.hasConfiguredSetup).toBe(false);
    expect(mutable._plan).toBeUndefined();
    expect(mutable._eventId).toBeUndefined();
    expect(mutable.syncGpsTrackingForCurrentState).not.toHaveBeenCalled();
    expect(mutable.disconnectTrainerSensors).not.toHaveBeenCalled();
    expect(mutable.emit).not.toHaveBeenCalled();
  });

  it("serializes concurrent starts so only one recording can start", async () => {
    const { service, mutable } = createService();
    let releaseStart!: () => void;
    mutable.liveMetricsManager.startRecording.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseStart = resolve)),
    );

    const firstStart = service.startRecording();
    const secondStart = service.startRecording();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mutable.liveMetricsManager.startRecording).toHaveBeenCalledTimes(1);
    releaseStart();
    await firstStart;
    await expect(secondStart).rejects.toThrow("already in progress");
    expect(mutable.liveMetricsManager.startRecording).toHaveBeenCalledTimes(1);
  });

  it("starts GPS-free without consulting operating-system location permission", async () => {
    const { service, mutable } = createService();
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    service.selectActivityFromPayload({
      activity_category: "run",
      gpsRecordingEnabled: false,
    });
    await service.startRecording();

    expect(mutable._gpsRecordingEnabled).toBe(false);
    expect(mockPermissionCheck).not.toHaveBeenCalled();
  });

  it("rolls back every acquired resource when required FIT setup fails", async () => {
    const { service, mutable } = createService();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { GarminFitEncoder } = jest.requireMock("../fit/GarminFitEncoder") as {
      GarminFitEncoder: jest.Mock;
    };
    GarminFitEncoder.mockImplementationOnce(() => {
      const encoder = {
        initialize: jest.fn(async () => {
          throw new Error("FIT unavailable");
        }),
        cleanup: jest.fn(async () => undefined),
      };
      mockFitInstances.push(encoder);
      return encoder;
    });

    await expect(service.startRecording()).rejects.toThrow("FIT unavailable");

    expect(service.state).toBe("pending");
    expect(mutable.recordingMetadata).toBeUndefined();
    expect(mutable.liveMetricsManager.finishRecording).toHaveBeenCalledTimes(1);
    expect(mockNotificationInstances[0]?.stopForegroundService).toHaveBeenCalledTimes(1);
    expect(mockFitInstances[0]?.cleanup).toHaveBeenCalledTimes(1);
    expect(mutable.sensorsManager.setAutoReconnectEnabled).toHaveBeenLastCalledWith(false);
    expect(consoleError).toHaveBeenCalledWith("[Service] Recording start failed", {
      category: "Error",
    });
  });

  it.each([
    [
      "initial SQLite checkpoint",
      () => {
        checkpointStorageMocks.persistRecordingCheckpoint.mockRejectedValueOnce(
          new Error("checkpoint failed"),
        );
      },
    ],
    [
      "BLE reconnect",
      (mutable: StartFailureMutableRecorder) => {
        mutable.sensorsManager.reconnectAll.mockRejectedValueOnce(new Error("ble failed"));
      },
    ],
    [
      "producer start",
      (mutable: StartFailureMutableRecorder) => {
        mutable.liveMetricsManager.startRecording.mockRejectedValueOnce(
          new Error("producer failed"),
        );
      },
    ],
  ])("releases the active allocation and subscriptions when %s fails", async (_stage, configure) => {
    const { service, mutable } = createService();
    configure(mutable as StartFailureMutableRecorder);

    await expect(service.startRecording()).rejects.toThrow();

    expect(service.state).toBe("pending");
    expect(evidenceJournalMocks.rollbackRecordingEvidenceSession).toHaveBeenCalledWith(
      "session-1",
      expect.any(String),
    );
    expect(mutable.sensorsManager.disconnectAll).toHaveBeenCalledTimes(1);
    expect(mutable.sensorsManager.setAutoReconnectEnabled).toHaveBeenLastCalledWith(false);
    if (mutable.liveMetricsManager.startRecording.mock.calls.length > 0) {
      expect(mutable.liveMetricsManager.finishRecording).toHaveBeenCalledTimes(1);
    }

    mutable.hasConfiguredSetup = true;
    await expect(service.startRecording()).resolves.toBeUndefined();
    expect(service.state).toBe("recording");
  });

  it("accounts for the outstanding pause before entering finalization", async () => {
    const { service, mutable } = createService();
    await service.startRecording();
    mutable.state = "paused";
    mutable.startTime = 1_000;
    mutable.pausedTime = 500;
    mutable.lastPauseTime = 2_000;
    jest.spyOn(Date, "now").mockReturnValueOnce(5_000).mockReturnValue(9_000);

    await service.finishRecording();

    expect(service.state).toBe("finished");
    expect(mutable.pausedTime).toBe(3_500);
    expect(mutable.lastPauseTime).toBeUndefined();
    expect(service.getMovingTime()).toBe(500);
    expect(mockFitInstances[0]?.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: 5_000, totalTime: 1_000 }),
    );
    expect(checkpointStorageMocks.persistRecordingCheckpoint.mock.calls.at(-1)?.[0]).toMatchObject({
      lifecycle: "finishing",
      start: { updatedAt: new Date(5_000).toISOString() },
    });
  });

  it("reports a bounded error category when finalization fails", async () => {
    const { service } = createService();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockCommitFinalizedArtifactAndHandoff.mockRejectedValueOnce(new TypeError("storage failed"));
    await service.startRecording();

    await expect(service.finishRecording()).rejects.toThrow("storage failed");

    expect(consoleError).toHaveBeenCalledWith("[Service] Recording finalization failed", {
      category: "TypeError",
    });
  });

  it("can clean up and reuse the same provider-owned service", async () => {
    const { service, mutable } = createService();
    await service.startRecording();
    await service.cleanup();

    expect(service.state).toBe("pending");
    expect(mutable.locationManager.cleanup).not.toHaveBeenCalled();
    expect(mutable.liveMetricsManager.cleanup).not.toHaveBeenCalled();

    mutable.hasConfiguredSetup = true;
    await service.startRecording();
    expect(service.state).toBe("recording");
    expect(mutable.liveMetricsManager.startRecording).toHaveBeenCalledTimes(2);
  });

  it("commits finalized discard before deleting local artifacts", async () => {
    const { service, mutable } = createService();
    const artifact = {
      sessionId: "session-1",
      profileId: "profile-1",
      activityFilePath: "file:///recording.fit",
      streamArtifactPaths: ["file:///streams"],
    };
    mutable.finalizedArtifact = artifact;

    await service.discardFinalizedArtifact();

    expect(mockDiscardFinalizedRecordingEvidence).toHaveBeenCalledWith({
      sessionId: artifact.sessionId,
      profileId: artifact.profileId,
      activityFilePath: artifact.activityFilePath,
      streamArtifactPaths: artifact.streamArtifactPaths,
    });
    expect(mockDeleteFinalizedArtifactFiles).toHaveBeenCalledWith(artifact);
    expect(mockDiscardFinalizedRecordingEvidence.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteFinalizedArtifactFiles.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("auto-advances a distance occurrence from the recorder's current distance", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.getMovingTime = jest.fn(() => 5_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 5, distance: 100 }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    mutable.updateElapsedTime();
    await mutable.planBoundaryTransition;

    expect(service.stepIndex).toBe(1);
    expect(mutable.completedOccurrences).toHaveLength(1);
    expect(mutable.boundaryJournal).toHaveLength(1);
  });

  it("does not complete an ineligible occurrence and deduplicates concurrent timer/tap advances", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.getMovingTime = jest.fn(() => 5_000);
    let distance = 99;
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 5, distance }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    service.advanceStep();
    await mutable.planBoundaryTransition;
    expect(service.stepIndex).toBe(0);
    expect(mutable.completedOccurrences).toHaveLength(0);

    distance = 100;
    let releaseFlush!: () => void;
    mutable.liveMetricsManager.streamBuffer.flushToFiles.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFlush = resolve)),
    );
    mutable.updateElapsedTime();
    service.advanceStep();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mutable.completedOccurrences).toHaveLength(0);
    releaseFlush();
    await mutable.planBoundaryTransition;

    expect(service.stepIndex).toBe(1);
    expect(mutable.completedOccurrences).toHaveLength(1);
    expect(mutable.boundaryJournal).toHaveLength(1);
  });

  it("neutralizes trainer load before entering rest", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable, true);
    mutable.getMovingTime = jest.fn(() => 5_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 5, distance: 50 }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);

    service.skipStep();
    await mutable.planBoundaryTransition;

    expect(mutable.trainerControl.neutralizeForBoundary).toHaveBeenCalledTimes(1);
    expect(mutable._gpsRecordingEnabled).toBe(false);
    expect(service.currentStep?.role).toBe("rest");
  });

  it("deduplicates double-tap skip navigation against the captured occurrence identity", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.getMovingTime = jest.fn(() => 1_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 1, distance: 10 }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    service.skipStep();
    service.skipStep();
    await mutable.planBoundaryTransition;

    expect(service.stepIndex).toBe(1);
    expect(mutable.completedOccurrences).toHaveLength(1);
    expect(mutable.boundaryJournal).toHaveLength(1);
  });

  it.each([
    "previous",
    "go_to",
  ] as const)("rebuilds a recoverable completed prefix after %s navigation", async (navigation) => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.getMovingTime = jest.fn(() => 1_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 1, distance: 10 }));
    mutable.getRuntimeSourceState = jest.fn(() => ({ selectedSources: [] }));
    mutable.getSessionOverrideState = jest.fn(() => ({ trainerMode: "auto" }));
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    service.skipStep();
    await mutable.planBoundaryTransition;
    checkpointStorageMocks.persistRecordingCheckpoint.mockClear();

    if (navigation === "previous") service.previousStep();
    else service.goToStep(0);
    await mutable.planBoundaryTransition;

    expect(service.stepIndex).toBe(0);
    expect(mutable.completedOccurrences).toEqual([]);
    expect(mutable.boundaryJournal.at(-1)).toMatchObject({
      completedOccurrenceId: null,
      nextOccurrenceId: service.currentStep?.occurrenceId,
    });
    const persisted = checkpointStorageMocks.persistRecordingCheckpoint.mock.calls.at(-1)?.[0];
    expect(persisted).toMatchObject({
      schemaVersion: 5,
      variant: "planned",
      currentOccurrenceId: service.currentStep?.occurrenceId,
      completedOccurrences: [],
    });

    const recovered = createService();
    recovered.mutable.planExecution = new PlanExecution();
    await recovered.service.stageRecoveredCheckpoint(persisted);
    expect(recovered.service.stepIndex).toBe(0);
    expect(recovered.service.currentStep?.occurrenceId).toBe(persisted.currentOccurrenceId);
  });

  it("persists and restores immutable planned-session provenance across recovery", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    const activityPlanId = "50000000-0000-4000-8000-000000000001";
    const eventId = "50000000-0000-4000-8000-000000000002";
    const plannedSession = {
      id: "50000000-0000-4000-8000-000000000003",
      sessionRevision: 5,
      source: { kind: "direct" as const, operationId: "recorder-lifecycle-test-operation-01" },
      prescription: {
        activityPlanId,
        activityPlanRevision: 4,
        structure: mutable._plan.structure,
        structureHash: `v1:sha256:${"1".repeat(64)}`,
        resolution: {
          mode: "default" as const,
          trainingIntent: "general_maintenance" as const,
          parameterValues: {},
        },
        prescriptionQuantification: null,
        capturedAt: "2026-01-01T09:00:00.000Z",
      },
    };
    mutable._plan = {
      ...mutable._plan,
      id: activityPlanId,
      revision: 4,
      structure_hash: plannedSession.prescription.structureHash,
    };
    mutable._eventId = eventId;
    mutable._plannedSession = plannedSession;
    const planExecution = {
      manifestVersion: 1 as const,
      compilerVersion: 1 as const,
      activityPlanId,
      scheduledEventId: eventId,
      name: mutable._plan.name,
      description: null,
      activityPlanRevision: 4,
      structureHash: plannedSession.prescription.structureHash,
      structure: mutable._plan.structure,
      plannedSession,
      personalizationEnabled: false,
      targetPresentations: [],
    };
    mutable.getSessionSnapshot.mockReturnValue({
      identity: { sessionId: "session-1", startedAt: new Date(1_000).toISOString() },
      activity: {
        activity_category: "run",
        gpsMode: "off",
        eventId,
        activityPlanId,
      },
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        new Date(1_000).toISOString(),
      ),
      planExecution,
    });
    mutable.getMovingTime = jest.fn(() => 1_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 1, distance: 10 }));
    mutable.getRuntimeSourceState = jest.fn(() => ({ selectedSources: [] }));
    mutable.getSessionOverrideState = jest.fn(() => ({ trainerMode: "auto" }));
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    service.skipStep();
    await mutable.planBoundaryTransition;

    const checkpoint = checkpointStorageMocks.persistRecordingCheckpoint.mock.calls.at(-1)?.[0];
    expect(checkpoint.planExecution).toMatchObject({
      activityPlanId,
      scheduledEventId: eventId,
      activityPlanRevision: 4,
      plannedSession,
    });

    const recovered = createService();
    recovered.mutable.planExecution = new PlanExecution();
    await recovered.service.stageRecoveredCheckpoint(checkpoint);
    expect(recovered.mutable._plannedSession).toEqual(plannedSession);
    expect(recovered.mutable._plan).toMatchObject({
      id: activityPlanId,
      revision: 4,
      structure_hash: plannedSession.prescription.structureHash,
    });
  });

  it("records a rewind attempt across activity/rest and excludes superseded evidence after recovery", async () => {
    jest.useFakeTimers();
    const origin = Date.parse("2026-01-01T10:00:00.000Z");
    jest.setSystemTime(origin);
    const { service, mutable } = createService();
    const activity = (segmentId: string, intervalId: string, stepId: string, name: string) => ({
      id: segmentId,
      role: "activity" as const,
      name,
      intervals: [
        {
          id: intervalId,
          name,
          repetitions: 1,
          steps: [
            {
              id: stepId,
              name,
              duration: { type: "time" as const, seconds: 10 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    });
    const structure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        activity(navigationIds.segment, navigationIds.interval, navigationIds.first, "First"),
        {
          id: navigationIds.rest,
          role: "rest" as const,
          name: "Rest",
          duration: { type: "time" as const, seconds: 10 },
        },
        activity(
          "40000000-0000-4000-8000-000000000001",
          "40000000-0000-4000-8000-000000000002",
          navigationIds.second,
          "Second",
        ),
      ],
    };
    mutable._plan = { name: "Rewind", gps_recording_enabled: false, structure };
    mutable.planExecution = new PlanExecution();
    mutable.planExecution.loadPlan(mutable._plan);
    mutable.planExecution.resetForRecordingStart(0, 0);
    mutable.state = "recording";
    mutable.startTime = origin;
    mutable.occurrenceStartedAt = origin;
    let movingTime = 0;
    let distance = 0;
    mutable.getMovingTime = jest.fn(() => movingTime * 1_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime, distance }));
    mutable.getRuntimeSourceState = jest.fn(() => ({ selectedSources: [] }));
    mutable.getSessionOverrideState = jest.fn(() => ({ trainerMode: "auto" }));
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);
    mutable.fitEncoder = { cleanup: jest.fn(async () => undefined) };
    streamBufferMocks.__replay.fitRecords.splice(
      0,
      Infinity,
      { timestamp: origin + 1_000, heartRate: 140, distance: 5 },
      { timestamp: origin + 12_000, heartRate: 120, distance: 35 },
      { timestamp: origin + 21_000, heartRate: 145, distance: 45 },
    );

    movingTime = 10;
    distance = 30;
    jest.setSystemTime(origin + 10_000);
    service.skipStep();
    await mutable.planBoundaryTransition;
    jest.setSystemTime(origin + 20_000);
    service.skipStep();
    await mutable.planBoundaryTransition;
    movingTime = 20;
    distance = 60;
    checkpointStorageMocks.persistRecordingCheckpoint.mockClear();
    jest.setSystemTime(origin + 30_000);
    service.goToStep(0);
    await mutable.planBoundaryTransition;

    const checkpoint = checkpointStorageMocks.persistRecordingCheckpoint.mock.calls.at(-1)?.[0];
    expect(checkpoint.rewindJournal).toEqual([
      expect.objectContaining({
        attemptId: expect.stringContaining(":attempt:1"),
        destinationOccurrenceId: service.currentStep?.occurrenceId,
        sourceDistanceMeters: 60,
        destinationDistanceMeters: 0,
        supersededFrom: new Date(origin).toISOString(),
        rewoundAt: new Date(origin + 30_000).toISOString(),
      }),
    ]);
    expect(checkpoint.completedOccurrences).toEqual([]);
    const rewindEncoder = mockFitInstances.at(-1);
    expect(rewindEncoder?.addRecords).not.toHaveBeenCalled();
    mutable.liveMetricsManager.getSessionStats = jest.fn(() => ({ distance: 75 }));
    mutable.liveMetricsManager.getCurrentReadings = jest.fn(() => ({ heartRate: 150 }));
    jest.setSystemTime(origin + 35_000);
    await mutable.writeFitRecordingRecord();
    expect(rewindEncoder?.addRecord).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: origin + 35_000, distance: 15 }),
    );

    streamBufferMocks.__replay.fitRecords.push({
      timestamp: origin + 35_000,
      heartRate: 150,
      distance: 75,
    });
    const recovered = createService();
    recovered.mutable.planExecution = new PlanExecution();
    await recovered.service.stageRecoveredCheckpoint(checkpoint);
    expect(recovered.mutable.rewindJournal).toEqual(checkpoint.rewindJournal);
    expect(
      rebaseRetainedFitRecordDistances(
        streamBufferMocks.__replay.fitRecords as Array<{ timestamp: number; distance?: number }>,
        recovered.mutable.rewindJournal,
      ),
    ).toEqual([
      expect.objectContaining({ timestamp: origin + 35_000, heartRate: 150, distance: 15 }),
    ]);
    jest.useRealTimers();
  });

  it("rejects forward go_to rather than creating an implicit completion gap", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.getMovingTime = jest.fn(() => 1_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 1, distance: 10 }));

    service.goToStep(1);
    await mutable.planBoundaryTransition;

    expect(service.stepIndex).toBe(0);
    expect(mutable.completedOccurrences).toEqual([]);
    expect(mutable.boundaryJournal).toEqual([]);
  });

  it.each([
    { type: "untilFinished" as const },
    { type: "repetitions" as const, count: 12 },
  ])("completes a final $type occurrence through the normal manual advance action", async (duration) => {
    const { service, mutable } = createService();
    const structure = {
      version: 3 as const,
      activity_category: "strength" as const,
      segments: [
        {
          id: navigationIds.segment,
          role: "activity" as const,
          name: "Strength",
          intervals: [
            {
              id: navigationIds.interval,
              name: "Set",
              repetitions: 1,
              steps: [
                {
                  id: navigationIds.first,
                  name: "Complete set",
                  duration,
                  targets: [{ type: "RPE" as const, intensity: 7 }],
                },
              ],
            },
          ],
        },
      ],
    };
    mutable._plan = { name: "Manual", gps_recording_enabled: false, structure };
    mutable.planExecution = new PlanExecution();
    mutable.planExecution.loadPlan(mutable._plan);
    mutable.planExecution.resetForRecordingStart(0, 0);
    mutable.state = "recording";
    mutable.startTime = 1_000;
    mutable.getMovingTime = jest.fn(() => 2_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 2, distance: 0 }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);

    expect(service.stepProgress).toMatchObject({
      requiresManualAdvance: true,
      canAutoAdvance: false,
      canManualAdvance: true,
      canAdvance: true,
    });
    service.advanceStep();
    await mutable.planBoundaryTransition;

    expect(service.isFinished).toBe(true);
    expect(mutable.completedOccurrences).toHaveLength(1);
    expect(mutable.boundaryJournal.at(-1)?.nextOccurrenceId).toBeNull();
    expect(mutable.emit).toHaveBeenCalledWith("planCompleted");
  });

  it("coalesces periodic checkpoints to one bounded write per cadence window", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const { mutable } = createService();
    configureDistancePlan(mutable);
    mutable.lastCheckpointWriteAt = Date.now();
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);

    for (let index = 0; index < 100; index++) mutable.scheduleRecoveryCheckpoint();
    expect(mutable.liveMetricsManager.streamBuffer.flushToFiles).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(4_999);
    expect(mutable.liveMetricsManager.streamBuffer.flushToFiles).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await mutable.planBoundaryTransition;

    expect(mutable.liveMetricsManager.streamBuffer.flushToFiles).toHaveBeenCalledTimes(1);
    expect(mutable.persistCurrentCheckpoint).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("bounds checkpoint backpressure to one in-flight write and one dirty follow-up", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const { mutable } = createService();
    configureDistancePlan(mutable);
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    let releaseFlush!: () => void;
    mutable.liveMetricsManager.streamBuffer.flushToFiles.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFlush = resolve)),
    );

    mutable.scheduleRecoveryCheckpoint();
    await Promise.resolve();
    for (let index = 0; index < 100; index++) mutable.scheduleRecoveryCheckpoint();
    expect(mutable.liveMetricsManager.streamBuffer.flushToFiles).toHaveBeenCalledTimes(1);
    releaseFlush();
    await mutable.checkpointWriteInFlight;
    expect(mutable.liveMetricsManager.streamBuffer.flushToFiles).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5_000);
    await mutable.planBoundaryTransition;
    expect(mutable.liveMetricsManager.streamBuffer.flushToFiles).toHaveBeenCalledTimes(2);
    expect(mutable.persistCurrentCheckpoint).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("fences an in-flight recording checkpoint behind a paused CAS state", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.getRuntimeSourceState = jest.fn(() => ({ selectedSources: [] }));
    mutable.getSessionOverrideState = jest.fn(() => ({ trainerMode: "auto" }));
    checkpointStorageMocks.persistRecordingCheckpoint.mockClear();
    let releaseFlush!: () => void;
    mutable.liveMetricsManager.streamBuffer.flushToFiles.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFlush = resolve)),
    );

    mutable.scheduleRecoveryCheckpoint();
    await Promise.resolve();
    const pause = service.pauseRecording();
    await Promise.resolve();
    expect(service.state).toBe("paused");
    releaseFlush();
    await pause;

    const lifecycles = checkpointStorageMocks.persistRecordingCheckpoint.mock.calls.map(
      ([checkpoint]) => checkpoint.lifecycle,
    );
    expect(lifecycles.length).toBeGreaterThan(0);
    expect(lifecycles.every((lifecycle) => lifecycle === "paused")).toBe(true);
  });

  it("fences an in-flight paused checkpoint behind the resumed CAS state", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable);
    mutable.state = "paused";
    mutable.lastPauseTime = Date.now() - 1_000;
    mutable.getRuntimeSourceState = jest.fn(() => ({ selectedSources: [] }));
    mutable.getSessionOverrideState = jest.fn(() => ({ trainerMode: "auto" }));
    mutable.startElapsedTimeUpdates = jest.fn();
    checkpointStorageMocks.persistRecordingCheckpoint.mockClear();
    let releaseFlush!: () => void;
    mutable.liveMetricsManager.streamBuffer.flushToFiles.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFlush = resolve)),
    );

    const stalePausedWrite = mutable.forceRecoveryCheckpoint();
    await Promise.resolve();
    const resume = service.resumeRecording();
    await Promise.resolve();
    expect(service.state).toBe("recording");
    releaseFlush();
    await Promise.all([stalePausedWrite, resume]);

    const lifecycles = checkpointStorageMocks.persistRecordingCheckpoint.mock.calls.map(
      ([checkpoint]) => checkpoint.lifecycle,
    );
    expect(lifecycles.length).toBeGreaterThan(0);
    expect(lifecycles.every((lifecycle) => lifecycle === "recording")).toBe(true);
  });

  it("aggregates FIT sessions by authored activity segment and keeps rest as timer-gap evidence", () => {
    const { mutable } = createService();
    mutable._plan = { gps_recording_enabled: false };
    const occurrence = (
      occurrenceId: string,
      globalOrdinal: number,
      segmentId: string,
      role: "activity" | "transition" | "rest",
      startedAt: string,
      completedAt: string,
      activity_category: "run" | "bike" | null,
    ) => ({
      occurrenceId,
      globalOrdinal,
      segmentId,
      role,
      activity_category,
      startedAt,
      completedAt,
      activeSeconds: 10,
      movingSeconds: 10,
      distanceMeters: role === "activity" ? 100 : 0,
      timerEvents: [],
      laps: [
        {
          lapNumber: 1,
          startedAt,
          endedAt: completedAt,
          activeSeconds: 10,
          distanceMeters: role === "activity" ? 100 : 0,
        },
      ],
    });
    const manifest = {
      version: 1,
      compilerVersion: 1,
      planHash: "0".repeat(64),
      occurrences: [
        occurrence(
          "run-1",
          0,
          navigationIds.segment,
          "activity",
          "2026-01-01T10:00:00.000Z",
          "2026-01-01T10:00:10.000Z",
          "run",
        ),
        occurrence(
          "run-2",
          1,
          navigationIds.segment,
          "activity",
          "2026-01-01T10:00:10.000Z",
          "2026-01-01T10:00:20.000Z",
          "run",
        ),
        occurrence(
          "rest",
          2,
          navigationIds.rest,
          "rest",
          "2026-01-01T10:00:20.000Z",
          "2026-01-01T10:00:30.000Z",
          null,
        ),
        occurrence(
          "bike",
          3,
          navigationIds.second,
          "activity",
          "2026-01-01T10:00:30.000Z",
          "2026-01-01T10:00:40.000Z",
          "bike",
        ),
      ],
    };

    const sessions = mutable.buildFitSessions(manifest);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ sport: "running", totalTime: 20_000, distance: 200 });
    expect(sessions[0].laps).toHaveLength(2);
    expect(sessions[0].endedAt).toBe(Date.parse("2026-01-01T10:00:20.000Z"));
    expect(sessions[1].startTime).toBe(Date.parse("2026-01-01T10:00:30.000Z"));
    expect(sessions.some((session: { role: string }) => session.role === "rest")).toBe(false);
  });

  it("finalizes a valid activity-to-rest plan without emitting a rest FIT activity_category session", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable, true);
    mutable.getMovingTime = jest.fn(() => 10_000);
    mutable.getSessionStats = jest.fn(() => ({
      duration: 20,
      movingTime: 10,
      distance: 100,
      avgSpeed: 10,
      maxSpeed: 10,
      calories: 1,
    }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);
    mutable.fitEncoder = {
      getStatus: jest.fn(() => ({ recordCount: 1 })),
      finalize: jest.fn(async () => undefined),
      getFilePath: jest.fn(() => "/recording.fit"),
    };

    service.skipStep();
    await mutable.planBoundaryTransition;
    await service.finishRecording();

    const sessions = mutable.fitEncoder.finalize.mock.calls[0]?.[0];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ role: "activity", sport: "running" });
    const committedArtifact = mockCommitFinalizedArtifactAndHandoff.mock.calls.at(-1)?.[0] as {
      artifact: { executionManifest: { occurrences: Array<{ role: string }> } };
    };
    expect(
      committedArtifact.artifact.executionManifest.occurrences.map((item) => item.role),
    ).toEqual(["activity", "rest"]);
  });

  it("finalizes a free recording with its canonical single activity occurrence", async () => {
    const { service, mutable } = createService();
    const freeExecutionPlan = createFreeRecordingExecutionPlan("run");
    const compiled = compileRecordingPlan(freeExecutionPlan);
    const startedAt = Date.parse("2026-01-01T10:00:00.000Z");
    const endedAt = Date.parse("2026-01-01T10:03:00.000Z");
    mutable.state = "recording";
    mutable.startTime = startedAt;
    mutable.recordingMetadata = {
      startedAt: new Date(startedAt).toISOString(),
      profileId: "profile-1",
    };
    mutable.freeRecordingExecutionPlan = freeExecutionPlan;
    mutable.freeRecordingCompiledPlan = compiled;
    mutable.planHash = "f".repeat(64);
    mutable.laps = [60_000, 90_000];
    mutable.getSessionStats = jest.fn(() => ({
      duration: 180,
      movingTime: 150,
      distance: 725.5,
      avgSpeed: 4.8,
      maxSpeed: 5.2,
      avgPower: 0,
      maxPower: 0,
      avgHeartRate: 120,
      maxHeartRate: 140,
      avgCadence: 80,
      ascent: 1,
      descent: 1,
      calories: 5,
    }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.fitEncoder = {
      getStatus: jest.fn(() => ({ recordCount: 1 })),
      finalize: jest.fn(async () => undefined),
      getFilePath: jest.fn(() => "/recording.fit"),
    };

    jest.useFakeTimers();
    jest.setSystemTime(endedAt);
    await service.finishRecording();
    jest.useRealTimers();

    const artifact = (
      mockCommitFinalizedArtifactAndHandoff.mock.calls.at(-1)?.[0] as {
        artifact: RecordingSessionArtifact;
      }
    ).artifact;
    expect(artifact.executionManifest).toMatchObject({
      compilerVersion: compiled.compilerVersion,
      planHash: "f".repeat(64),
      occurrences: [
        {
          occurrenceId: compiled.occurrences[0]?.occurrenceId,
          segmentId: compiled.occurrences[0]?.segmentId,
          globalOrdinal: 0,
          activity_category: "run",
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date(endedAt).toISOString(),
          activeSeconds: 150,
          movingSeconds: 150,
          distanceMeters: 725.5,
          timerEvents: [],
          laps: [
            {
              lapNumber: 1,
              startedAt: new Date(startedAt).toISOString(),
              endedAt: new Date(endedAt).toISOString(),
              activeSeconds: 150,
              distanceMeters: 725.5,
            },
          ],
        },
      ],
    });
    expect(mutable._plan).toBeUndefined();
    expect(artifact.snapshot.activity.activityPlanId).toBeUndefined();
    expect(artifact.snapshot.performanceTargets).toEqual(
      mutable.getSessionSnapshot().performanceTargets,
    );
    expect(artifact.finalStats).toEqual({
      durationSeconds: 180,
      movingSeconds: 150,
      distanceMeters: 725.5,
      calories: 5,
      manualLapsMs: [60_000, 90_000],
    });
    expect(artifact).not.toHaveProperty("provisionalMetrics");
  });

  it("routes only activity occurrence records to the encoder around internal and trailing rest", async () => {
    const { GarminFitEncoder: ActualGarminFitEncoder } = jest.requireActual(
      "../fit/GarminFitEncoder",
    ) as typeof import("../fit/GarminFitEncoder");
    const { service, mutable } = createService();
    const segment = (suffix: string) => `30000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
    const activitySegment = (
      segmentId: string,
      intervalId: string,
      stepId: string,
      name: string,
    ) => ({
      id: segmentId,
      role: "activity" as const,
      name,
      intervals: [
        {
          id: intervalId,
          name,
          repetitions: 1,
          steps: [
            {
              id: stepId,
              name,
              duration: { type: "time" as const, seconds: 10 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    });
    const structure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        activitySegment(segment("1"), segment("2"), segment("3"), "Run one"),
        {
          id: segment("4"),
          role: "rest" as const,
          name: "Internal rest",
          duration: { type: "time" as const, seconds: 10 },
        },
        activitySegment(segment("5"), segment("6"), segment("7"), "Run two"),
        {
          id: segment("8"),
          role: "rest" as const,
          name: "Trailing rest",
          duration: { type: "time" as const, seconds: 10 },
        },
      ],
    };
    const origin = Date.parse("2026-01-01T10:00:00.000Z");
    mutable._plan = { name: "Rest round trip", gps_recording_enabled: false, structure };
    mutable.planExecution = new PlanExecution();
    mutable.planExecution.loadPlan(mutable._plan);
    mutable.planExecution.resetForRecordingStart(0, 0);
    mutable.state = "recording";
    mutable.startTime = origin;
    mutable.occurrenceStartedAt = origin;
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.syncGpsTrackingForCurrentState = jest.fn(async () => undefined);
    let movingTime = 0;
    let distance = 0;
    mutable.getMovingTime = jest.fn(() => movingTime * 1_000);
    mutable.getSessionStats = jest.fn(() => ({
      duration: 40,
      movingTime,
      distance,
      avgSpeed: movingTime > 0 ? distance / movingTime : 0,
      maxSpeed: 4,
      calories: 10,
    }));
    mutable.liveMetricsManager.getSessionStats = mutable.getSessionStats;
    mutable.liveMetricsManager.getCurrentReadings = jest.fn(() => ({
      heartRate: 140,
      speed: 3,
    }));
    const encoder = new ActualGarminFitEncoder("rest-round-trip", "profile-1");
    await encoder.initialize([], new Date(origin));
    mutable.fitEncoder = encoder;
    mutable.recordingMetadata = {
      startedAt: new Date(origin).toISOString(),
      profileId: "profile-1",
    };
    jest.useFakeTimers();

    const writeAt = async (offset: number, nextMoving: number, nextDistance: number) => {
      jest.setSystemTime(origin + offset);
      movingTime = nextMoving;
      distance = nextDistance;
      await mutable.writeFitRecordingRecord();
    };
    await writeAt(0, 0, 0);
    await writeAt(5_000, 5, 15);
    jest.setSystemTime(origin + 10_000);
    movingTime = 10;
    distance = 30;
    service.skipStep();
    await mutable.planBoundaryTransition;
    await writeAt(15_000, 10, 30);
    jest.setSystemTime(origin + 20_000);
    service.skipStep();
    await mutable.planBoundaryTransition;
    await writeAt(20_000, 10, 30);
    await writeAt(25_000, 15, 45);
    jest.setSystemTime(origin + 30_000);
    movingTime = 20;
    distance = 60;
    service.skipStep();
    await mutable.planBoundaryTransition;
    await writeAt(35_000, 20, 60);
    jest.setSystemTime(origin + 40_000);
    const finish = service.finishRecording();
    await jest.runAllTimersAsync();
    await finish;
    jest.useRealTimers();

    expect(encoder.getStatus().recordCount).toBe(4);
    const committedArtifact = mockCommitFinalizedArtifactAndHandoff.mock.calls.at(-1)?.[0] as {
      artifact: { executionManifest: { occurrences: Array<{ role: string }> } };
    };
    expect(
      committedArtifact.artifact.executionManifest.occurrences.map((item) => item.role),
    ).toEqual(["activity", "rest", "activity", "rest"]);
  });

  it.each([
    ["time", { type: "time", seconds: 30 }, 15, 0],
    ["distance", { type: "distance", meters: 100 }, 5, 50],
  ] as const)("restores exact mid-%s progress from a canonical checkpoint and durable replay", async (_kind, duration, movingSeconds, distanceMeters) => {
    const { service, mutable } = createService();
    const segmentId = "20000000-0000-4000-8000-000000000001";
    const intervalId = "20000000-0000-4000-8000-000000000002";
    const stepId = "20000000-0000-4000-8000-000000000003";
    const occurrenceId = `activity:${segmentId}:${intervalId}:0:${stepId}`;
    const followupSegments = [
      {
        id: "20000000-0000-4000-8000-000000000004",
        role: "rest" as const,
        name: "Rest",
        duration: { type: "time" as const, seconds: 30 },
      },
    ];
    const planSnapshot = {
      version: 3,
      activity_category: "run",
      segments: [
        {
          id: segmentId,
          role: "activity",
          name: "Run",
          intervals: [
            {
              id: intervalId,
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: stepId,
                  name: "Current",
                  duration,
                  targets: [{ type: "RPE", intensity: 4 }],
                },
              ],
            },
          ],
        },
        ...followupSegments,
      ],
    } as const;
    mutable.planExecution = new PlanExecution();
    mutable.getMovingTime = jest.fn(() => movingSeconds * 1_000);
    mutable.getSessionStats = jest.fn(() => ({
      movingTime: movingSeconds,
      distance: distanceMeters,
    }));
    streamBufferMocks.__replay.sensorReadings.splice(0, Infinity, {
      metric: "distance",
      dataType: "float",
      value: distanceMeters,
      timestamp: Date.parse("2026-01-01T10:00:15.000Z"),
    });

    await service.stageRecoveredCheckpoint({
      schemaVersion: 5,
      compilerVersion: 1,
      sessionId: "profile-1:recovery",
      profileId: "profile-1",
      lifecycle: "recording",
      planSnapshot,
      planHash: "0".repeat(64),
      currentOccurrenceId: occurrenceId,
      occurrenceProgress: {
        startedAt: "2026-01-01T10:00:00.000Z",
        startMovingSeconds: 0,
        startDistanceMeters: 0,
      },
      completedOccurrences: [],
      boundaryJournal: [],
      eventJournal: [],
      manualLapsMs: [5_000],
      timing: {
        startedAt: "2026-01-01T10:00:00.000Z",
        updatedAt: "2026-01-01T10:00:15.000Z",
        elapsedSeconds: 15,
        movingSeconds,
        pausedAt: null,
        accumulatedPauseSeconds: 0,
      },
      policy: {
        activity_category: "run",
        gpsMode: "off",
        activityGpsMode: "off",
        selectedSources: [],
        trainerMode: "auto",
      },
      streamArtifactPaths: ["/streams"],
      revision: 1,
    } as never);

    expect(service.getLaps()).toEqual([5_000]);

    expect(service.stepProgress.progress).toBe(0.5);
  });

  it("rejects coordinate-bearing recorder recovery before staging runtime state", async () => {
    const { service, mutable } = createService();
    const startedAt = "2026-01-01T10:00:00.000Z";
    streamBufferMocks.__replay.fitRecords.splice(0, Infinity, {
      timestamp: Date.parse(startedAt),
      latitude: 40,
      longitude: -75,
    });

    await expect(
      service.stageRecoveredCheckpoint({
        schemaVersion: 5,
        variant: "unplanned",
        sessionId: "profile-1:coordinate-recovery",
        profileId: "profile-1",
        lifecycle: "recording",
        revision: 1,
        start: { startedAt, updatedAt: startedAt },
        draft: { activity_category: "run", gpsMode: "off" },
        summary: { elapsedSeconds: 0, movingSeconds: 0, distanceMeters: 0 },
        executionState: { timerEvents: [], manualLapsMs: [] },
        performanceTargets: createUnavailableAthletePerformanceTargetFacts(startedAt, "profile-1"),
        streamArtifactPaths: ["/streams"],
      } as never),
    ).rejects.toThrow("Coordinate-bearing in-app recording recovery is not supported");

    expect(mutable.liveMetricsManager.stageRecoveredRecording).not.toHaveBeenCalled();
  });

  it("recovers an interrupted finish without resuming and excludes all post-finish evidence", async () => {
    const { service, mutable } = createService();
    const startedAt = Date.parse("2026-01-01T10:00:00.000Z");
    const finishedAt = Date.parse("2026-01-01T10:00:10.000Z");
    const performanceTargets = createUnavailableAthletePerformanceTargetFacts(
      new Date(startedAt).toISOString(),
      "profile-1",
    );
    const checkpoint = {
      schemaVersion: 5 as const,
      variant: "unplanned" as const,
      sessionId: "profile-1:finish-recovery",
      profileId: "profile-1",
      lifecycle: "finishing" as const,
      revision: 2,
      start: {
        startedAt: new Date(startedAt).toISOString(),
        updatedAt: new Date(finishedAt).toISOString(),
      },
      draft: { activity_category: "run" as const, gpsMode: "off" as const },
      summary: { elapsedSeconds: 10, movingSeconds: 10, distanceMeters: 100 },
      executionState: { timerEvents: [], manualLapsMs: [5_000] },
      performanceTargets,
      streamArtifactPaths: ["/streams"],
    };
    streamBufferMocks.__replay.sensorReadings.splice(
      0,
      Infinity,
      { metric: "distance", dataType: "float", value: 100, timestamp: finishedAt },
      { metric: "distance", dataType: "float", value: 999, timestamp: finishedAt + 1 },
    );
    streamBufferMocks.__replay.fitRecords.splice(
      0,
      Infinity,
      { timestamp: finishedAt, distance: 100 },
      { timestamp: finishedAt + 1, distance: 999 },
    );
    mutable.getSessionSnapshot.mockReturnValue({
      identity: { sessionId: checkpoint.sessionId, startedAt: checkpoint.start.startedAt },
      activity: { activity_category: "run", gpsMode: "off", eventId: null },
      performanceTargets,
    });

    await service.stageRecoveredCheckpoint(checkpoint);

    expect(mockedEvidenceJournal.fenceRecordingEvidenceSession).toHaveBeenCalledWith(
      checkpoint.sessionId,
    );
    expect(mutable.liveMetricsManager.stageRecoveredRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        replay: {
          sensorReadings: [expect.objectContaining({ value: 100, timestamp: finishedAt })],
          fitRecords: [{ timestamp: finishedAt, distance: 100 }],
        },
        recoveryPausedAt: finishedAt,
      }),
    );
    expect(service.state).toBe("finishing");
    expect(service.getLaps()).toEqual([5_000]);
    await expect(service.resumeRecoveredRecording()).rejects.toThrow(
      "No recovered recording is ready to resume",
    );
    expect(mockPermissionCheck).not.toHaveBeenCalled();

    await service.retryRecoveredFinalization();

    expect(mockFitInstances.at(-1)?.addRecords).toHaveBeenCalledWith([
      { timestamp: finishedAt, distance: 100 },
    ]);
    expect(mockCommitFinalizedArtifactAndHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: checkpoint.sessionId,
        artifact: expect.objectContaining({
          completedAt: checkpoint.start.updatedAt,
          finalStats: expect.objectContaining({ manualLapsMs: [5_000] }),
        }),
      }),
    );
    expect(checkpointStorageMocks.clearRecordingCheckpoint).toHaveBeenCalledWith(
      checkpoint.sessionId,
    );
    expect(service.state).toBe("finished");
  });

  it("stages exact checkpoint state, replays FIT records on resume, and explicitly cleans streams on discard", async () => {
    const { service, mutable } = createService();
    const segmentId = "00000000-0000-4000-8000-000000000001";
    const intervalId = "00000000-0000-4000-8000-000000000002";
    const firstStepId = "00000000-0000-4000-8000-000000000003";
    const secondStepId = "00000000-0000-4000-8000-000000000004";
    const firstOccurrenceId = `activity:${segmentId}:${intervalId}:0:${firstStepId}`;
    const secondOccurrenceId = `activity:${segmentId}:${intervalId}:0:${secondStepId}`;
    const currentOccurrence = {
      occurrenceId: secondOccurrenceId,
      globalOrdinal: 1,
      segmentId,
      segmentIndex: 0,
      role: "activity",
      activity_category: "run",
      intervalId,
      intervalIndex: 0,
      stepId: secondStepId,
      stepIndex: 1,
      repeatIteration: 0,
      completionPolicy: "time",
      duration: { type: "time", seconds: 30 },
      targets: [{ type: "RPE", intensity: 5 }],
      id: secondOccurrenceId,
      name: "Second",
    };
    mutable.planExecution = {
      loadPlan: jest.fn(),
      restoreOccurrence: jest.fn(),
      getCurrentStep: jest.fn(() => currentOccurrence),
      getNextStep: jest.fn(() => undefined),
      getStepInfo: jest.fn(() => ({
        index: 1,
        total: 2,
        current: currentOccurrence,
        next: undefined,
        progress: null,
        isLast: true,
        isFinished: false,
      })),
      clear: jest.fn(),
    };
    mutable.sessionController.updateOverrideState = jest.fn();
    mutable.sessionController.setRuntimeSourceState = jest.fn();
    mutable.liveMetricsManager.stageRecoveredRecording = jest.fn(async () => undefined);
    mutable.liveMetricsManager.resumeRecording = jest.fn();
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);
    mutable.startElapsedTimeUpdates = jest.fn();
    mutable.syncAutomaticTrainerControl = jest.fn(async () => undefined);
    mutable.sensorsManager.reconnectAll = jest.fn(async () => undefined);
    mutable.sensorsManager.getConnectedSensors = jest.fn(() => []);
    const checkpoint = {
      schemaVersion: 5,
      compilerVersion: 1,
      sessionId: "profile-1:session-1",
      profileId: "profile-1",
      lifecycle: "recording",
      planSnapshot: {
        version: 3,
        activity_category: "run",
        segments: [
          {
            id: segmentId,
            role: "activity",
            name: "Run",
            intervals: [
              {
                id: intervalId,
                name: "Main",
                repetitions: 1,
                steps: [
                  {
                    id: firstStepId,
                    name: "First",
                    duration: { type: "time", seconds: 30 },
                    targets: [{ type: "RPE", intensity: 4 }],
                  },
                  {
                    id: secondStepId,
                    name: "Second",
                    duration: { type: "time", seconds: 30 },
                    targets: [{ type: "RPE", intensity: 5 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      planHash: "0".repeat(64),
      currentOccurrenceId: secondOccurrenceId,
      occurrenceProgress: {
        startedAt: "2026-01-01T10:00:30.000Z",
        startMovingSeconds: 30,
        startDistanceMeters: 100,
      },
      completedOccurrences: [
        {
          occurrenceId: firstOccurrenceId,
          globalOrdinal: 0,
          segmentId,
          role: "activity",
          activity_category: "run",
          startedAt: "2026-01-01T10:00:00.000Z",
          completedAt: "2026-01-01T10:00:30.000Z",
          activeSeconds: 30,
          movingSeconds: 30,
          distanceMeters: 100,
        },
      ],
      boundaryJournal: [
        {
          revision: 2,
          completedOccurrenceId: firstOccurrenceId,
          nextOccurrenceId: secondOccurrenceId,
          committedAt: "2026-01-01T10:00:30.000Z",
        },
      ],
      eventJournal: [],
      timing: {
        startedAt: "2026-01-01T10:00:00.000Z",
        updatedAt: "2026-01-01T10:00:30.000Z",
        elapsedSeconds: 30,
        movingSeconds: 30,
        pausedAt: null,
        accumulatedPauseSeconds: 0,
      },
      policy: {
        activity_category: "run",
        gpsMode: "off",
        activityGpsMode: "off",
        selectedSources: [],
        trainerMode: "auto",
      },
      streamArtifactPaths: ["/streams"],
      revision: 2,
    } as const;

    await service.stageRecoveredCheckpoint(checkpoint as never);
    expect(service.state).toBe("paused");
    expect(mutable.planExecution.restoreOccurrence).toHaveBeenCalledWith(
      secondOccurrenceId,
      30_000,
      100,
    );
    expect(mutable.liveMetricsManager.stageRecoveredRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: checkpoint.sessionId,
        replay: streamBufferMocks.__replay,
      }),
    );

    await service.resumeRecoveredRecording();
    expect(mockFitInstances.at(-1)?.addRecords).toHaveBeenCalledWith(
      streamBufferMocks.__replay.fitRecords,
    );
    expect(mutable.liveMetricsManager.resumeRecording).toHaveBeenCalledWith({
      preserveHistory: true,
    });
    expect(service.state).toBe("recording");

    mutable.recoveredCheckpoint = checkpoint;
    mutable.recoveredReplay = streamBufferMocks.__replay;
    await service.discardRecoveredRecording();
    expect(streamBufferMocks.StreamBuffer.deleteDurableDirectories).toHaveBeenCalledWith(
      ["/streams"],
      "profile-1:session-1",
    );
    expect(checkpointStorageMocks.clearRecordingCheckpoint).toHaveBeenCalledWith(
      checkpoint.sessionId,
    );
    expect(evidenceJournalMocks.quarantineRecordingEvidenceSession).toHaveBeenCalledWith({
      sessionId: checkpoint.sessionId,
      profileId: "profile-1",
      reason: "recovered-recording-discarded",
    });
    expect(service.state).toBe("pending");
  });

  it("rebuilds an unplanned execution manifest and preserves its operation identity", async () => {
    const { service, mutable } = createService();
    const checkpoint = {
      schemaVersion: 5 as const,
      variant: "unplanned" as const,
      sessionId: "profile-1:unplanned-operation",
      profileId: "profile-1",
      lifecycle: "recording" as const,
      revision: 1,
      start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
      draft: { activity_category: "run" as const, gpsMode: "off" as const },
      summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
      executionState: { timerEvents: [], manualLapsMs: [] },
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        "2026-01-01T10:00:00.000Z",
      ),
      streamArtifactPaths: ["/streams"],
    };

    await service.stageRecoveredCheckpoint(checkpoint);

    const freeExecutionPlan = createFreeRecordingExecutionPlan("run");
    expect(mutable.planExecution.clear).toHaveBeenCalled();
    expect(mutable._plan).toBeUndefined();
    expect(mutable.freeRecordingExecutionPlan).toEqual(freeExecutionPlan);
    expect(mutable.freeRecordingCompiledPlan).toEqual(compileRecordingPlan(freeExecutionPlan));
    expect(mutable.planHash).toBe("0".repeat(64));
    expect(mutable.buildExecutionManifest()).toMatchObject({
      compilerVersion: expect.any(Number),
      planHash: "0".repeat(64),
      occurrences: [expect.objectContaining({ activity_category: "run", role: "activity" })],
    });
    expect(mutable.sessionController.resetForNewSession).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ sessionId: checkpoint.sessionId }),
      }),
    );
    expect(mutable.recoveredCheckpoint).toEqual(checkpoint);
    expect(service.state).toBe("paused");
  });
});
