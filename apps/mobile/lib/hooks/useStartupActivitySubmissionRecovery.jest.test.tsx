import { renderHook, waitFor } from "@testing-library/react-native";

import { useStartupActivitySubmissionRecovery } from "./useStartupActivitySubmissionRecovery";

const invalidatePostActivityIngestionQueries = jest.fn(async (_client?: unknown) => undefined);
const prepareMobileRecordingStartup = jest.fn();
const runActivitySubmissionQueueJob = jest.fn();
const queryClient = { invalidateQueries: jest.fn() };
const mutateAsync = jest.fn(async () => undefined);

jest.mock("@repo/api/client", () => ({
  invalidatePostActivityIngestionQueries: (client: unknown) =>
    invalidatePostActivityIngestionQueries(client),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => queryClient }));
jest.mock("@/lib/api", () => ({
  api: {
    activities: { createFromRecordingSummary: { useMutation: () => ({ mutateAsync }) } },
    activityFiles: {
      beginMobileRecordingUpload: { useMutation: () => ({ mutateAsync }) },
      retryPendingMobileRecordingCleanup: { useMutation: () => ({ mutateAsync }) },
    },
  },
}));
jest.mock("@/lib/services/activitySubmissionQueue", () => ({
  runActivitySubmissionQueueJob: (...args: unknown[]) => runActivitySubmissionQueueJob(...args),
}));
jest.mock("@/lib/services/activitySubmissionQueue/localArtifact", () => ({
  getLocalActivityArtifactMetadata: jest.fn(),
}));
jest.mock("@/lib/services/fit/ActivityFileUploader", () => ({
  ActivityFileUploader: class {
    uploadToSignedUrl = jest.fn();
  },
}));
jest.mock("@/lib/services/mobileRecordingStartup", () => ({
  prepareMobileRecordingStartup: (...args: unknown[]) => prepareMobileRecordingStartup(...args),
}));

const job = {
  id: "job-1",
  status: "pending",
  draft: { profileId: "profile-1" },
};

describe("startup activity submission recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prepareMobileRecordingStartup.mockResolvedValue({ queueJobs: [] });
    runActivitySubmissionQueueJob.mockResolvedValue({ ...job, status: "complete" });
  });

  it("invalidates post-ingestion reads after a recovered submission completes", async () => {
    prepareMobileRecordingStartup.mockResolvedValue({ queueJobs: [job] });

    await renderHook(() => useStartupActivitySubmissionRecovery("profile-1"));

    await waitFor(() =>
      expect(invalidatePostActivityIngestionQueries).toHaveBeenCalledWith(queryClient),
    );
  });

  it("does not over-invalidate for an empty queue", async () => {
    const empty = await renderHook(() => useStartupActivitySubmissionRecovery("profile-1"));
    await waitFor(() => expect(prepareMobileRecordingStartup).toHaveBeenCalled());
    expect(invalidatePostActivityIngestionQueries).not.toHaveBeenCalled();
    await empty.unmount();
  });

  it("does not over-invalidate when recovery remains failed", async () => {
    prepareMobileRecordingStartup.mockResolvedValue({ queueJobs: [job] });
    runActivitySubmissionQueueJob.mockResolvedValue({ ...job, status: "failed" });
    const failed = await renderHook(() => useStartupActivitySubmissionRecovery("profile-1"));
    await waitFor(() => expect(runActivitySubmissionQueueJob).toHaveBeenCalled());
    expect(invalidatePostActivityIngestionQueries).not.toHaveBeenCalled();
    await failed.unmount();
  });
});
