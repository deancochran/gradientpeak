import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

const createFromRecordingSummaryMock = jest.fn(async () => ({
  id: "activity-1",
  ingestion: { id: "ingestion-1", status: "pending_upload", source: "mobile_recording" },
}));
const beginMobileRecordingUploadMock = jest.fn(async () => ({
  status: "upload" as const,
  ingestionId: "ingestion-1",
  activityId: "activity-1",
  byteSize: 1234,
  sha256: "a".repeat(64),
  format: "fit" as const,
  mediaType: "application/vnd.ant.fit",
  signedUrl: "https://storage.example/upload",
  token: "upload-token",
}));
const claimLegacyMobileRecordingUploadMock = jest.fn(async () => ({
  status: "claimed" as const,
  ingestionId: "ingestion-1",
  activityId: "activity-1",
  byteSize: 1234,
  sha256: "a".repeat(64),
  format: "fit" as const,
  mediaType: "application/vnd.ant.fit",
}));
const markUploadedAndProcessMock = jest.fn(async () => ({ success: true }));
const uploadToSignedUrlMock = jest.fn(async () => ({ success: true, attempts: 1 }));
const clearPendingFinalizedArtifactMock = jest.fn(async () => undefined);
const deleteFinalizedArtifactFilesMock = jest.fn(async () => undefined);
const invalidatePostActivityIngestionQueriesMock = jest.fn(async () => undefined);
const setQueryDataMock = jest.fn();
const localArtifactMetadataMock = jest.fn(async (_filePath: string) => ({
  sha256: "a".repeat(64),
  byteSize: 1234,
}));

jest.mock("@/lib/services/activitySubmissionQueue/localArtifact", () => ({
  getLocalActivityArtifactMetadata: (...args: unknown[]) =>
    localArtifactMetadataMock(...(args as [string])),
}));

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
  },
}));

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
      beginMobileRecordingUpload: {
        useMutation: () => ({ mutateAsync: beginMobileRecordingUploadMock }),
      },
      claimLegacyMobileRecordingUpload: {
        useMutation: () => ({ mutateAsync: claimLegacyMobileRecordingUploadMock }),
      },
      markUploadedAndProcess: {
        useMutation: () => ({ mutateAsync: markUploadedAndProcessMock }),
      },
    },
  },
}));

const executionManifest = {
  version: 1 as const,
  compilerVersion: 1,
  planHash: "0".repeat(64),
  occurrences: [],
};

const artifact = {
  schemaVersion: 2 as const,
  sessionId: "session-1",
  profileId: "profile-1",
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
  executionManifest,
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
const queueStorage = jest.requireActual(
  "@/lib/services/activitySubmissionQueue/storage",
) as typeof import("@/lib/services/activitySubmissionQueue/storage");

describe("useActivitySubmission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queueStorage.setActivitySubmissionQueueJobsForTests(new Map());
  });

  afterEach(() => queueStorage.setActivitySubmissionQueueJobsForTests());

  it("queues a finalized artifact, creates the backend activity, and continues upload processing", async () => {
    const { result } = renderHook(() =>
      useActivitySubmission(service as unknown as ActivityRecorderService),
    );

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

    await expect(
      queueStorage.loadActivitySubmissionQueueJobByArtifactId("session-1", "profile-1"),
    ).resolves.toMatchObject(
      expect.objectContaining({
        id: "session-1",
        status: "complete",
        localActivityFilePath: "file:///activity.fit",
        draft: expect.objectContaining({
          name: "Queued ride",
          notes: "felt good",
          content_visibility: "followers",
        }),
      }),
    );
    expect(createFromRecordingSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Queued ride",
        executionManifest,
        artifactSource: "uploadedArtifact",
        uploadedArtifact: { ingestionId: "ingestion-1" },
        source: "mobile_recording",
      }),
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
    await queueStorage.upsertActivitySubmissionQueueJob({
      schemaVersion: 2,
      id: "session-1",
      artifactId: "session-1",
      sessionId: "session-1",
      localActivityFilePath: "file:///activity.fit",
      localActivityFileSize: 1234,
      streamArtifactPaths: ["file:///streams.json"],
      executionManifest,
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
      artifactSha256: "a".repeat(64),
      status: "failed",
      attempts: 3,
      lastError: "app restarted",
      retryClass: "transient",
      nextAttemptAt: "2026-01-01T11:05:00.000Z",
      createdAt: "2026-01-01T11:00:00.000Z",
      updatedAt: "2026-01-01T11:05:00.000Z",
    });

    const { result } = renderHook(() =>
      useActivitySubmission(service as unknown as ActivityRecorderService),
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await expect(result.current.submit()).resolves.toBe(true);
    });

    expect(createFromRecordingSummaryMock).not.toHaveBeenCalled();
    expect(beginMobileRecordingUploadMock).not.toHaveBeenCalled();
    expect(uploadToSignedUrlMock).not.toHaveBeenCalled();
    expect(markUploadedAndProcessMock).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("keeps finalized artifact files when continuation fails", async () => {
    await queueStorage.upsertActivitySubmissionQueueJob({
      schemaVersion: 2,
      id: "session-1",
      artifactId: "session-1",
      sessionId: "session-1",
      localActivityFilePath: "file:///activity.fit",
      localActivityFileSize: 1234,
      streamArtifactPaths: ["file:///streams.json"],
      executionManifest,
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
      remoteFilePath: "activities/profile-1/existing.fit",
      artifactSha256: "a".repeat(64),
      status: "failed",
      attempts: 1,
      retryClass: "transient",
      nextAttemptAt: "2026-01-01T11:05:00.000Z",
      createdAt: "2026-01-01T11:00:00.000Z",
      updatedAt: "2026-01-01T11:05:00.000Z",
    });
    createFromRecordingSummaryMock.mockRejectedValueOnce(new Error("server unavailable"));

    const { result } = renderHook(() =>
      useActivitySubmission(service as unknown as ActivityRecorderService),
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(deleteFinalizedArtifactFilesMock).not.toHaveBeenCalled();
    expect(clearPendingFinalizedArtifactMock).not.toHaveBeenCalled();
  });

  it("refuses another profile's finalized artifact after an account switch", async () => {
    const otherProfileService = {
      ...service,
      recordingMetadata: { profileId: "profile-2" },
      getFinalizedArtifact: () => ({ ...artifact, profileId: "profile-2" }),
    };

    const { result } = renderHook(() =>
      useActivitySubmission(otherProfileService as unknown as ActivityRecorderService),
    );
    await waitFor(() => expect(result.current.error).toContain("different profile"));

    await expect(queueStorage.loadActivitySubmissionQueueJobs()).resolves.toEqual([]);
    expect(createFromRecordingSummaryMock).not.toHaveBeenCalled();
  });
});
