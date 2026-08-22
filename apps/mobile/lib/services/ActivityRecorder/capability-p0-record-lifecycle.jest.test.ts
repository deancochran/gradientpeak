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
