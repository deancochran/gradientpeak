import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ActivitySubmissionQueueJob } from "@/lib/services/activitySubmissionQueue";

const upsertJobMock = jest.fn(async () => undefined);
const loadJobMock = jest.fn(async (): Promise<ActivitySubmissionQueueJob | null> => null);
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
    loadActivitySubmissionQueueJobByArtifactId: (...args: unknown[]) =>
      (loadJobMock as jest.Mock)(...args),
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
    loadJobMock.mockResolvedValue(null);
  });

  it("queues a finalized artifact, creates the backend activity, and continues upload processing", async () => {
    const { result } = renderHook(() => useActivitySubmission(service as any));

    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await expect(
        result.current.submit({
          name: "Queued ride",
          notes: "felt good",
          content_visibility: "followers",
        }),
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
          content_visibility: "followers",
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

  it("continues a persisted failed job without rebuilding completed progress", async () => {
    loadJobMock.mockResolvedValue({
      id: "session-1",
      artifactId: "session-1",
      sessionId: "session-1",
      localActivityFilePath: "file:///activity.fit",
      localActivityFileSize: 1234,
      streamArtifactPaths: ["file:///streams.json"],
      draft: {
        profileId: "profile-1",
        startedAt: "2026-01-01T10:00:00.000Z",
        finishedAt: "2026-01-01T11:00:00.000Z",
        name: "Persisted ride",
        activityType: "bike",
        durationSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 25000,
      },
      activityId: "activity-existing",
      ingestionId: "ingestion-existing",
      remoteFilePath: "activities/profile-1/existing.fit",
      status: "failed",
      attempts: 3,
      lastError: "app restarted",
      createdAt: "2026-01-01T11:00:00.000Z",
      updatedAt: "2026-01-01T11:05:00.000Z",
    });

    const { result } = renderHook(() => useActivitySubmission(service as any));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await expect(result.current.submit()).resolves.toBe(true);
    });

    expect(loadJobMock).toHaveBeenCalledWith("session-1");
    expect(createFromRecordingSummaryMock).not.toHaveBeenCalled();
    expect(getSignedUploadUrlMock).not.toHaveBeenCalled();
    expect(uploadToSignedUrlMock).not.toHaveBeenCalled();
    expect(markUploadedAndProcessMock).toHaveBeenCalledWith({
      activityId: "activity-existing",
      ingestionId: "ingestion-existing",
      activityFilePath: "activities/profile-1/existing.fit",
      fileSize: 1234,
      fileType: "fit",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("keeps finalized artifact files when continuation fails", async () => {
    loadJobMock.mockResolvedValue({
      id: "session-1",
      artifactId: "session-1",
      sessionId: "session-1",
      localActivityFilePath: "file:///activity.fit",
      localActivityFileSize: 1234,
      streamArtifactPaths: ["file:///streams.json"],
      draft: {
        profileId: "profile-1",
        startedAt: "2026-01-01T10:00:00.000Z",
        finishedAt: "2026-01-01T11:00:00.000Z",
        name: "Persisted ride",
        activityType: "bike",
        durationSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 25000,
      },
      activityId: "activity-existing",
      ingestionId: "ingestion-existing",
      remoteFilePath: "activities/profile-1/existing.fit",
      status: "failed",
      attempts: 1,
      createdAt: "2026-01-01T11:00:00.000Z",
      updatedAt: "2026-01-01T11:05:00.000Z",
    });
    markUploadedAndProcessMock.mockResolvedValueOnce({ success: false });

    const { result } = renderHook(() => useActivitySubmission(service as any));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(deleteFinalizedArtifactFilesMock).not.toHaveBeenCalled();
    expect(clearPendingFinalizedArtifactMock).not.toHaveBeenCalled();
  });
});
