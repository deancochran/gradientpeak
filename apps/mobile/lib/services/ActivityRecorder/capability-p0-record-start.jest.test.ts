import { ActivityPayloadSchema } from "@repo/core";

const mockCheckpoint = jest.fn(async () => undefined);

jest.mock("expo", () => ({
  EventEmitter: class MockEventEmitter {
    emit = jest.fn();
  },
}));

jest.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock("./recordingEvidenceJournal", () => ({
  allocateRecordingEvidenceSession: jest.fn(async () => undefined),
  rollbackRecordingEvidenceSession: jest.fn(async () => undefined),
  createRecordingStreamJournalAdapter: jest.fn(() => ({})),
  fenceRecordingEvidenceSession: jest.fn(async () => undefined),
  commitFinalizedArtifactAndHandoff: jest.fn(async () => undefined),
  discardFinalizedRecordingEvidence: jest.fn(async () => undefined),
  quarantineRecordingEvidenceSession: jest.fn(async () => true),
}));
jest.mock("./checkpointStorage", () => ({
  MOBILE_RECORDING_CHECKPOINT_SCHEMA_VERSION: 5,
  hashRecordingPlan: jest.fn(async () => "0".repeat(64)),
  persistRecordingCheckpoint: jest.fn(async () => undefined),
  clearRecordingCheckpoint: jest.fn(async () => undefined),
  releaseRecordingCheckpointClaim: jest.fn(),
}));
jest.mock("./finalizedArtifactStorage", () => ({ deleteFinalizedArtifactFiles: jest.fn() }));
jest.mock("../activitySubmissionQueue/localArtifact", () => ({
  getLocalActivityArtifactMetadata: jest.fn(async () => ({ byteSize: 1, sha256: "0".repeat(64) })),
}));
jest.mock("../fit/GarminFitEncoder", () => ({
  validateFinalizedFitFile: jest.fn(async () => ({ byteSize: 1 })),
  GarminFitEncoder: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(async () => undefined),
    cleanup: jest.fn(async () => undefined),
    getFilePath: jest.fn(() => "/recording.fit"),
    getStatus: jest.fn(() => ({ isInitialized: true, isFinalized: false, recordCount: 1 })),
    addRecord: jest.fn(async () => undefined),
    finalize: jest.fn(async () => undefined),
  })),
}));
jest.mock("./notification", () => ({
  NotificationsManager: jest.fn().mockImplementation(() => ({
    startForegroundService: jest.fn(async () => undefined),
    stopForegroundService: jest.fn(async () => undefined),
  })),
}));
jest.mock("./LiveMetricsManager", () => ({ LiveMetricsManager: jest.fn() }));
jest.mock("./sensors", () => ({ SensorsManager: jest.fn() }));
jest.mock("./trainerControl", () => ({
  TrainerControl: jest.fn(),
  inferTrainerMachineType: jest.fn(),
}));

import { ActivityRecorderService } from "./index";

function createService() {
  const service = Object.create(ActivityRecorderService.prototype) as ActivityRecorderService;
  // biome-ignore lint/suspicious/noExplicitAny: this fixture intentionally supplies only the public-boundary collaborators under test.
  const mutable = service as any;
  const snapshot = {
    identity: { sessionId: "record-start-session", startedAt: new Date(1_000).toISOString() },
    activity: { activity_category: "bike", gpsMode: "off", eventId: null },
    performanceTargets: undefined,
  };
  Object.assign(mutable, {
    state: "pending",
    selectedActivityCategory: "bike",
    hasConfiguredSetup: false,
    currentLaunchSource: "manual",
    _plan: undefined,
    _eventId: undefined,
    recoveredCheckpoint: null,
    recoveredReplay: null,
    finalizedArtifact: null,
    profile: { id: "profile-1", displayName: "Test athlete" },
    lifecycleTransition: Promise.resolve(),
    pausedTime: 0,
    laps: [],
    lastLapTime: 0,
    completedOccurrences: [],
    boundaryJournal: [],
    rewindJournal: [],
    timerEvents: [],
    planExecution: {
      loadPlan: jest.fn(),
      clear: jest.fn(),
      resetForRecordingStart: jest.fn(),
      getStepCount: jest.fn(() => 1),
      getCurrentStep: jest.fn(() => undefined),
      getStepInfo: jest.fn(() => ({
        index: 0,
        total: 1,
        current: undefined,
        next: undefined,
        progress: null,
        isLast: true,
        isFinished: false,
      })),
    },
    sessionController: {
      hasLockedSnapshot: jest.fn(() => false),
      resetForNewSession: jest.fn(),
      resetAll: jest.fn(),
      setLifecycle: jest.fn(),
      updateOverrideState: jest.fn(),
      getOverrideState: jest.fn(() => ({
        trainerMode: "auto",
        preferredSources: {},
        disabledSources: {},
      })),
    },
    liveMetricsManager: {
      setActivityCategory: jest.fn(),
      updatePerformanceTargets: jest.fn(),
      bindEvidenceSession: jest.fn(),
      startRecording: jest.fn(async () => undefined),
      finishRecording: jest.fn(async () => undefined),
      getCurrentReadings: jest.fn(() => ({})),
      getSessionStats: jest.fn(() => ({ distance: 0, movingTime: 0 })),
      getProvisionalMetricsSnapshot: jest.fn(() => ({})),
      streamBuffer: { getBufferStatus: jest.fn(() => ({ storageDir: "/streams" })) },
    },
    sensorsManager: {
      setAutoReconnectEnabled: jest.fn(),
      reconnectAll: jest.fn(async () => undefined),
      disconnectAll: jest.fn(async () => undefined),
      getConnectedSensors: jest.fn(() => []),
    },
    buildSessionSnapshot: jest.fn(() => snapshot),
    getSessionSnapshot: jest.fn(() => snapshot),
    getSessionOverrides: jest.fn(() => []),
    getRuntimeSourceState: jest.fn(() => ({ selectedSources: [] })),
    persistCurrentCheckpoint: mockCheckpoint,
    forceRecoveryCheckpoint: mockCheckpoint,
    publishSnapshotUpdate: jest.fn(),
    publishSessionUpdate: jest.fn(),
    startElapsedTimeUpdates: jest.fn(),
    stopElapsedTimeUpdates: jest.fn(),
    syncAutomaticTrainerControl: jest.fn(async () => undefined),
    updateFitRecording: jest.fn(async () => undefined),
    emit: jest.fn(),
  });
  return { service, mutable };
}

describe("record start capability", () => {
  beforeEach(() => jest.clearAllMocks());

  it("starts a manual activity through the public service boundary", async () => {
    const { service, mutable } = createService();

    service.selectActivityFromPayload({ activity_category: "bike", gpsRecordingEnabled: false });
    await service.startRecording();

    expect(mutable.liveMetricsManager.startRecording).toHaveBeenCalledTimes(1);
    expect(service.state).toBe("recording");
    expect(mutable.recordingMetadata).toMatchObject({
      activityCategory: "bike",
      gpsRecordingEnabled: false,
      profileId: "profile-1",
    });
  });

  it("loads an activity plan through the payload boundary before starting", async () => {
    const { service, mutable } = createService();
    const plan = ActivityPayloadSchema.parse({
      activity_category: "run",
      gpsRecordingEnabled: false,
      plan: {
        name: "Intervals",
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Run",
              intervals: [
                {
                  id: "10000000-0000-4000-8000-000000000002",
                  name: "Main",
                  repetitions: 1,
                  steps: [
                    {
                      id: "10000000-0000-4000-8000-000000000003",
                      name: "Steady",
                      duration: { type: "time", seconds: 60 },
                      targets: [{ type: "RPE", intensity: 4 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }).plan;

    service.selectActivityFromPayload({
      activity_category: "run",
      gpsRecordingEnabled: false,
      plan,
    });

    expect(mutable.planExecution.loadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Intervals" }),
    );
    expect(mutable._plan).toMatchObject({ name: "Intervals" });
    expect(mutable.emit).toHaveBeenCalledWith(
      "payloadProcessed",
      expect.objectContaining({ plan }),
    );
  });

  it("records a manual lap only while recording and persists its moving-time value", () => {
    const { service, mutable } = createService();
    mutable.state = "recording";
    mutable.startTime = 1_000;
    mutable.getMovingTime = jest.fn().mockReturnValueOnce(12_000).mockReturnValueOnce(20_000);

    service.recordLap();
    service.recordLap();

    expect(service.getLaps()).toEqual([12_000, 8_000]);
    expect(mutable.emit).toHaveBeenCalledWith("lapRecorded");
    expect(mockCheckpoint).toHaveBeenCalledTimes(2);
  });
});
