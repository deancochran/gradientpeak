const mock = {
  liveMetrics: { pauseRecording: jest.fn(), resumeRecording: jest.fn() },
  fit: { pause: jest.fn(async () => undefined), resume: jest.fn(async () => undefined) },
  sensors: { setAutoReconnectEnabled: jest.fn() },
  session: { setLifecycle: jest.fn() },
  forceCheckpoint: jest.fn(async () => undefined),
  emit: jest.fn(),
  publish: jest.fn(),
  stopElapsed: jest.fn(),
  startElapsed: jest.fn(),
};

jest.mock("expo", () => ({
  EventEmitter: class {
    emit = jest.fn();
  },
}));
jest.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock("../permissions-check", () => ({
  areAllPermissionsGranted: jest.fn(() => true),
  areRecordingPermissionsGranted: jest.fn(async () => true),
  checkAllPermissions: jest.fn(async () => ({})),
}));
jest.mock("../fit/GarminFitEncoder", () => ({
  GarminFitEncoder: jest.fn(),
  validateFinalizedFitFile: jest.fn(),
}));
jest.mock("./LiveMetricsManager", () => ({ LiveMetricsManager: jest.fn() }));
jest.mock("./notification", () => ({ NotificationsManager: jest.fn() }));
jest.mock("./sensors", () => ({ SensorsManager: jest.fn() }));
jest.mock("./checkpointStorage", () => ({
  MOBILE_RECORDING_CHECKPOINT_SCHEMA_VERSION: 5,
  clearRecordingCheckpoint: jest.fn(),
  hashRecordingPlan: jest.fn(),
  persistRecordingCheckpoint: jest.fn(),
  loadAndClaimRecordingCheckpoint: jest.fn(),
  releaseRecordingCheckpointClaim: jest.fn(),
}));
jest.mock("./recordingEvidenceJournal", () => ({
  allocateRecordingEvidenceSession: jest.fn(),
  createRecordingStreamJournalAdapter: jest.fn(),
  fenceRecordingEvidenceSession: jest.fn(),
  commitFinalizedArtifactAndHandoff: jest.fn(),
  discardFinalizedRecordingEvidence: jest.fn(),
  quarantineRecordingEvidenceSession: jest.fn(),
  rollbackRecordingEvidenceSession: jest.fn(),
}));
jest.mock("./finalizedArtifactStorage", () => ({ deleteFinalizedArtifactFiles: jest.fn() }));
jest.mock("../activitySubmissionQueue/localArtifact", () => ({
  getLocalActivityArtifactMetadata: jest.fn(),
}));

import { ActivityRecorderService } from "./index";
import { PlanExecution } from "./planExecution";

function createRecorder() {
  const recorder = Object.create(ActivityRecorderService.prototype) as ActivityRecorderService;
  Object.assign(recorder as unknown as Record<string, unknown>, {
    state: "recording",
    timerEvents: [],
    pausedTime: 0,
    lastPauseTime: undefined,
    fitEncoder: mock.fit,
    liveMetricsManager: mock.liveMetrics,
    sensorsManager: mock.sensors,
    sessionController: mock.session,
    lifecycleTransition: Promise.resolve(),
    forceRecoveryCheckpoint: mock.forceCheckpoint,
    emit: mock.emit,
    publishSessionUpdate: mock.publish,
    stopElapsedTimeUpdates: mock.stopElapsed,
    startElapsedTimeUpdates: mock.startElapsed,
    recordingMetadata: undefined,
  });
  return recorder;
}

describe("record lifecycle capability boundary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("advances stationary rest using the session clock, excluding an explicit pause", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1000);
      const recorder = createRecorder();
      Object.assign(recorder, { startTime: 1000 });
      const execution = new PlanExecution();
      execution.loadPlan({
        name: "Stationary rest",
        structure: {
          version: 5,
          activity_category: "run",
          items: [
            {
              type: "step",
              id: "00000000-0000-4000-8000-000000000001",
              name: "Rest",
              duration: { type: "time", seconds: 10 },
              targets: [{ type: "rest" }],
            },
          ],
        },
      });
      // Neither distance nor sensor data changes during this entire interval.
      jest.setSystemTime(5000);
      await recorder.pauseRecording();
      jest.setSystemTime(31000);
      expect(execution.getStepProgress(recorder.getMovingTime(), 0)?.progress).toBe(0.4);
      expect(execution.advance(recorder.getMovingTime(), 0)).toBe(false);
      await recorder.resumeRecording();
      jest.setSystemTime(36999);
      expect(execution.advance(recorder.getMovingTime(), 0)).toBe(false);
      jest.setSystemTime(37000);
      expect(execution.advance(recorder.getMovingTime(), 0)).toBe(true);
      expect(execution.isFinished()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("pauses and resumes the current recorder through its public commands", async () => {
    const recorder = createRecorder();

    await recorder.pauseRecording();
    expect(recorder.state).toBe("paused");
    expect(mock.liveMetrics.pauseRecording).toHaveBeenCalledTimes(1);
    expect(mock.fit.pause).toHaveBeenCalledTimes(1);

    await recorder.resumeRecording();
    expect(recorder.state).toBe("recording");
    expect(mock.liveMetrics.resumeRecording).toHaveBeenCalledTimes(1);
    expect(mock.fit.resume).toHaveBeenCalledTimes(1);
  });

  it("rejects finish when there is no current recording", async () => {
    const recorder = createRecorder();
    await expect(recorder.finishRecording()).rejects.toThrow("No active recording to finish");
  });
});
