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

jest.mock("../fit/GarminFitEncoder", () => ({
  GarminFitEncoder: jest.fn().mockImplementation(() => {
    const encoder = {
      initialize: jest.fn(async () => undefined),
      cleanup: jest.fn(async () => undefined),
      pause: jest.fn(async () => undefined),
      resume: jest.fn(async () => undefined),
      finalize: jest.fn(async () => undefined),
      getFilePath: jest.fn(() => "/recording.fit"),
      getStatus: jest.fn(() => ({ recordCount: 1 })),
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

import { ActivityRecorderService } from "./index";

function createService() {
  const service = Object.create(ActivityRecorderService.prototype) as ActivityRecorderService;
  // biome-ignore lint/suspicious/noExplicitAny: lifecycle tests need controlled access to private service state.
  const mutable = service as any;
  const snapshot = {
    identity: { sessionId: "session-1" },
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
    },
    liveMetricsManager: {
      setGpsRecordingEnabled: jest.fn(),
      setActivityCategory: jest.fn(),
      startRecording: jest.fn(async () => undefined),
      finishRecording: jest.fn(async () => undefined),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      cleanup: jest.fn(async () => undefined),
      streamBuffer: {
        getBufferStatus: jest.fn(() => ({ storageDir: "/streams" })),
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
    },
    routeController: { clearCurrentRouteState: jest.fn() },
    emit: jest.fn(),
    buildSessionSnapshot: jest.fn(() => snapshot),
    publishSnapshotUpdate: jest.fn(),
    publishSessionUpdate: jest.fn(),
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

describe("ActivityRecorderService lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFitInstances.length = 0;
    mockNotificationInstances.length = 0;
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
});
