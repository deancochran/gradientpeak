import { act, renderHook, waitFor } from "@testing-library/react-native";

const upsertJobMock = jest.fn(async () => undefined);
const createFromRecordingSummaryMock = jest.fn(async () => ({
  id: "activity-1",
  ingestion: { id: "ingestion-1", status: "pending_upload", source: "mobile_recording" },
}));
const getSignedUploadUrlMock = jest.fn(async () => ({
  signedUrl: "https://storage.example/upload",
  filePath: "activities/profile-1/activity.fit",
}));
const markUploadedAndProcessMock = jest.fn(async () => ({ success: true }));
const uploadToSignedUrlMock = jest.fn(async () => ({ success: true, attempts: 1 }));
const clearPendingFinalizedArtifactMock = jest.fn(async () => undefined);
const deleteFinalizedArtifactFilesMock = jest.fn(async () => undefined);
const invalidatePostActivityIngestionQueriesMock = jest.fn(async () => undefined);
const setQueryDataMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({ setQueryData: setQueryDataMock }),
}));

jest.mock("@repo/api/client", () => ({
  __esModule: true,
  invalidatePostActivityIngestionQueries: (...args: unknown[]) =>
    (invalidatePostActivityIngestionQueriesMock as jest.Mock)(...args),
  queryKeys: { activities: { detail: (id: string) => ["activity", id] } },
}));

jest.mock("expo-file-system", () => ({
  __esModule: true,
  File: class MockFile {
    exists = true;
    size = 1234;
    constructor(_path: string) {}
  },
}));

jest.mock("@/lib/services/activitySubmissionQueue", () => {
  const actual = jest.requireActual("@/lib/services/activitySubmissionQueue");
  return {
    __esModule: true,
    ...actual,
    upsertActivitySubmissionQueueJob: (...args: unknown[]) => (upsertJobMock as jest.Mock)(...args),
  };
});

jest.mock("@/lib/services/ActivityRecorder/finalizedArtifactStorage", () => ({
  __esModule: true,
  clearPendingFinalizedArtifact: () => clearPendingFinalizedArtifactMock(),
  deleteFinalizedArtifactFiles: (...args: unknown[]) =>
    (deleteFinalizedArtifactFilesMock as jest.Mock)(...args),
  loadPendingFinalizedArtifact: jest.fn(async () => null),
}));

jest.mock("@/lib/services/fit/ActivityFileUploader", () => ({
  __esModule: true,
  ActivityFileUploader: class MockActivityFileUploader {
    uploadToSignedUrl(localPath: string, signedUrl: string) {
      return (uploadToSignedUrlMock as jest.Mock)(localPath, signedUrl);
    }
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ profile: { id: "profile-1" } }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activities: {
      createFromRecordingSummary: {
        useMutation: () => ({ mutateAsync: createFromRecordingSummaryMock }),
      },
    },
    activityFiles: {
      getSignedUploadUrl: {
        useMutation: () => ({ mutateAsync: getSignedUploadUrlMock }),
      },
      markUploadedAndProcess: {
        useMutation: () => ({ mutateAsync: markUploadedAndProcessMock }),
      },
    },
  },
}));

const artifact = {
  sessionId: "session-1",
  snapshot: {
    identity: { startedAt: "2026-01-01T10:00:00.000Z" },
    activity: { category: "bike", gpsMode: "off", activityPlanId: null },
  },
  overrides: [],
  finalStats: {
    durationSeconds: 3600,
    movingSeconds: 3500,
    distanceMeters: 25000,
    calories: 500,
  },
  activityFilePath: "file:///activity.fit",
  streamArtifactPaths: ["file:///streams.json"],
  completedAt: "2026-01-01T11:00:00.000Z",
  runtimeSourceState: {
    selectedSources: [],
    currentMetrics: {},
    degradedState: { isDegraded: false, metrics: [] },
    sourceChanges: [],
  },
};

const service = {
  state: "idle",
  recordingMetadata: { profileId: "profile-1" },
  getFinalizedArtifact: () => artifact,
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

const { useActivitySubmission } = require("../useActivitySubmission");

describe("useActivitySubmission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queues a finalized artifact, creates the backend activity, and continues upload processing", async () => {
    const { result } = renderHook(() => useActivitySubmission(service as any));

    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await expect(
        result.current.submit({ name: "Queued ride", notes: "felt good", is_private: false }),
      ).resolves.toBe(true);
    });

    expect(upsertJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        status: "queued",
        localActivityFilePath: "file:///activity.fit",
        draft: expect.objectContaining({
          name: "Queued ride",
          notes: "felt good",
          is_private: false,
        }),
      }),
    );
    expect(createFromRecordingSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Queued ride", source: "mobile_recording" }),
    );
    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(
      "file:///activity.fit",
      "https://storage.example/upload",
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(clearPendingFinalizedArtifactMock).toHaveBeenCalledTimes(1);
    expect(deleteFinalizedArtifactFilesMock).toHaveBeenCalledWith(artifact);
  });
});
