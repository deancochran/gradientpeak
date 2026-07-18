const mockPermissionCheck = jest.fn(async (_gpsRecordingEnabled: boolean) => true);
const mockPersistArtifact = jest.fn(async (_artifact: unknown) => undefined);
const mockFitInstances: Array<Record<string, jest.Mock>> = [];
const mockNotificationInstances: Array<Record<string, jest.Mock>> = [];

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

jest.mock("./finalizedArtifactStorage", () => ({
  persistPendingFinalizedArtifact: (artifact: unknown) => mockPersistArtifact(artifact),
}));

jest.mock("./checkpointStorage", () => ({
  clearRecordingCheckpoint: jest.fn(async () => undefined),
  hashRecordingPlan: jest.fn(async () => "0".repeat(64)),
  persistRecordingCheckpoint: jest.fn(async () => undefined),
  releaseRecordingCheckpointClaim: jest.fn(),
}));

jest.mock("./StreamBuffer", () => {
  const replay = {
    sensorReadings: [{ metric: "distance", dataType: "float", value: 100, timestamp: 1 }],
    locations: [],
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
    },
  };
});

jest.mock("../fit/GarminFitEncoder", () => ({
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
jest.mock("./location", () => ({ LocationManager: jest.fn() }));
jest.mock("./sensors", () => ({ SensorsManager: jest.fn() }));
jest.mock("./trainerControl", () => ({
  TrainerControl: jest.fn(),
  inferTrainerMachineType: jest.fn(),
}));

import { rebaseRetainedFitRecordDistances } from "./fitRecordWriter";
import { ActivityRecorderService } from "./index";
import { PlanExecution } from "./planExecution";

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
  persistRecordingCheckpoint: jest.Mock;
};
const streamBufferMocks = jest.requireMock("./StreamBuffer") as {
  __replay: { sensorReadings: unknown[]; locations: unknown[]; fitRecords: unknown[] };
  StreamBuffer: { deleteDurableDirectories: jest.Mock };
};

function createService() {
  const service = Object.create(ActivityRecorderService.prototype) as ActivityRecorderService;
  // biome-ignore lint/suspicious/noExplicitAny: lifecycle tests need controlled access to private service state.
  const mutable = service as any;
  const snapshot = {
    identity: { sessionId: "session-1", startedAt: new Date(1_000).toISOString() },
    activity: { category: "run", gpsMode: "off", eventId: null },
  };

  Object.assign(mutable, {
    state: "pending",
    selectedActivityCategory: "run",
    _gpsRecordingEnabled: false,
    _gpsAvailable: false,
    hasConfiguredSetup: true,
    currentLaunchSource: "manual",
    profile: { id: "profile-1", displayName: "Recorder" },
    lifecycleTransition: Promise.resolve(),
    finalizedArtifact: null,
    liveMetricsFinalized: false,
    fitFinalized: false,
    finalizationFailed: false,
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
    },
    liveMetricsManager: {
      setGpsRecordingEnabled: jest.fn(),
      setActivityCategory: jest.fn(),
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

type DistancePlanMutableRecorder = {
  _plan: Parameters<PlanExecution["loadPlan"]>[0];
  planExecution: PlanExecution;
  state: string;
  startTime: number;
  occurrenceStartedAt: number;
  recordingMetadata: { startedAt: string; profileId: string };
};

function configureDistancePlan(mutable: DistancePlanMutableRecorder, includeRest = false) {
  const structure = {
    version: 3 as const,
    segments: [
      {
        id: navigationIds.segment,
        role: "activity" as const,
        name: "Run",
        category: "run" as const,
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
    mockFitFiles.clear();
    mockFitInstances.length = 0;
    mockNotificationInstances.length = 0;
    streamBufferMocks.__replay.sensorReadings.splice(0, Infinity, {
      metric: "distance",
      dataType: "float",
      value: 100,
      timestamp: 1,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("rolls back every acquired resource when required FIT setup fails", async () => {
    const { service, mutable } = createService();
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
  });

  it("accounts for the outstanding pause before entering finalization", async () => {
    const { service, mutable } = createService();
    await service.startRecording();
    mutable.state = "paused";
    mutable.startTime = 1_000;
    mutable.pausedTime = 500;
    mutable.lastPauseTime = 2_000;
    jest.spyOn(Date, "now").mockReturnValue(5_000);

    await service.finishRecording();

    expect(service.state).toBe("finished");
    expect(mutable.pausedTime).toBe(3_500);
    expect(mutable.lastPauseTime).toBeUndefined();
    expect(service.getMovingTime()).toBe(500);
    expect(mockFitInstances[0]?.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: 5_000, totalTime: 1_000 }),
    );
  });

  it("keeps a failed finalization non-active and retries completed stages safely", async () => {
    const { service, mutable } = createService();
    await service.startRecording();
    mockPersistArtifact.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(service.finishRecording()).rejects.toThrow("storage unavailable");
    expect(service.state).toBe("finishing");
    expect(mutable.sensorsManager.setAutoReconnectEnabled).toHaveBeenLastCalledWith(false);

    await service.finishRecording();
    expect(service.state).toBe("finished");
    expect(mutable.liveMetricsManager.finishRecording).toHaveBeenCalledTimes(1);
    expect(mockFitInstances[0]?.finalize).toHaveBeenCalledTimes(1);
    expect(mockPersistArtifact).toHaveBeenCalledTimes(2);
  });

  it("refuses cleanup while failed finalization remains retryable", async () => {
    const { service } = createService();
    await service.startRecording();
    mockPersistArtifact.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(service.finishRecording()).rejects.toThrow("storage unavailable");

    await expect(service.cleanup()).rejects.toThrow(
      "Recording finalization must be retried before cleanup",
    );
    expect(service.state).toBe("finishing");
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

  it("neutralizes trainer load and stops every GPS layer in order before entering rest", async () => {
    const { service, mutable } = createService();
    configureDistancePlan(mutable, true);
    mutable._gpsRecordingEnabled = true;
    mutable._gpsAvailable = true;
    mutable.getMovingTime = jest.fn(() => 5_000);
    mutable.getSessionStats = jest.fn(() => ({ movingTime: 5, distance: 50 }));
    mutable.persistCurrentCheckpoint = jest.fn(async () => undefined);

    service.skipStep();
    await mutable.planBoundaryTransition;

    expect(mutable.trainerControl.neutralizeForBoundary).toHaveBeenCalledTimes(1);
    expect(mutable.locationManager.stopHeadingTracking).toHaveBeenCalledTimes(1);
    expect(mutable.locationManager.stopBackgroundTracking).toHaveBeenCalledTimes(1);
    expect(mutable.locationManager.stopForegroundTracking).toHaveBeenCalledTimes(1);
    expect(mutable.locationManager.stopHeadingTracking.mock.invocationCallOrder[0]).toBeLessThan(
      mutable.locationManager.stopBackgroundTracking.mock.invocationCallOrder[0],
    );
    expect(mutable.locationManager.stopBackgroundTracking.mock.invocationCallOrder[0]).toBeLessThan(
      mutable.locationManager.stopForegroundTracking.mock.invocationCallOrder[0],
    );
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
      currentOccurrenceId: service.currentStep?.occurrenceId,
      completedOccurrences: [],
    });

    const recovered = createService();
    recovered.mutable.planExecution = new PlanExecution();
    await recovered.service.stageRecoveredCheckpoint(persisted);
    expect(recovered.service.stepIndex).toBe(0);
    expect(recovered.service.currentStep?.occurrenceId).toBe(persisted.currentOccurrenceId);
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
      category: "run" as const,
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
      segments: [
        {
          id: navigationIds.segment,
          role: "activity" as const,
          name: "Strength",
          category: "strength" as const,
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
      category: "run" | "bike" | null,
    ) => ({
      occurrenceId,
      globalOrdinal,
      segmentId,
      role,
      category,
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

  it("finalizes a valid V3 activity-to-rest plan without emitting a rest FIT sport session", async () => {
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
    const persistedArtifact = mockPersistArtifact.mock.calls.at(-1)?.[0] as {
      executionManifest: { occurrences: Array<{ role: string }> };
    };
    expect(persistedArtifact.executionManifest.occurrences.map((item) => item.role)).toEqual([
      "activity",
      "rest",
    ]);
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
      category: "run" as const,
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
    const artifact = mockPersistArtifact.mock.calls.at(-1)?.[0] as {
      executionManifest: { occurrences: Array<{ role: string }> };
    };
    expect(artifact.executionManifest.occurrences.map((item) => item.role)).toEqual([
      "activity",
      "rest",
      "activity",
      "rest",
    ]);
  });

  it.each([
    ["time", { type: "time", seconds: 30 }, 15, 0],
    ["distance", { type: "distance", meters: 100 }, 5, 50],
  ] as const)("restores exact mid-%s progress from checkpoint counters and durable replay", async (_kind, duration, movingSeconds, distanceMeters) => {
    const { service, mutable } = createService();
    const segmentId = "20000000-0000-4000-8000-000000000001";
    const intervalId = "20000000-0000-4000-8000-000000000002";
    const stepId = "20000000-0000-4000-8000-000000000003";
    const occurrenceId = `activity:${segmentId}:${intervalId}:0:${stepId}`;
    const planSnapshot = {
      version: 3,
      segments: [
        {
          id: segmentId,
          role: "activity",
          name: "Run",
          category: "run",
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
      schemaVersion: 2,
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
      timing: {
        startedAt: "2026-01-01T10:00:00.000Z",
        updatedAt: "2026-01-01T10:00:15.000Z",
        elapsedSeconds: 15,
        movingSeconds,
        pausedAt: null,
        accumulatedPauseSeconds: 0,
      },
      policy: {
        category: "run",
        gpsMode: "off",
        activityGpsMode: "off",
        selectedSources: [],
        trainerMode: "auto",
      },
      streamArtifactPaths: ["/streams"],
      revision: 1,
    } as never);

    expect(service.stepProgress.progress).toBe(0.5);
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
      category: "run",
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
      schemaVersion: 2,
      compilerVersion: 1,
      sessionId: "profile-1:session-1",
      profileId: "profile-1",
      lifecycle: "recording",
      planSnapshot: {
        version: 3,
        segments: [
          {
            id: segmentId,
            role: "activity",
            name: "Run",
            category: "run",
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
          category: "run",
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
        category: "run",
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
      expect.objectContaining({ replay: streamBufferMocks.__replay }),
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
    expect(streamBufferMocks.StreamBuffer.deleteDurableDirectories).toHaveBeenCalledWith([
      "/streams",
    ]);
    expect(checkpointStorageMocks.clearRecordingCheckpoint).toHaveBeenCalledWith(
      checkpoint.sessionId,
    );
    expect(service.state).toBe("pending");
  });
});
