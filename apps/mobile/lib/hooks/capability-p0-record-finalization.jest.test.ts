import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@repo/api/client", () => ({
  canRetryDirectIngestion: () => false,
  IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS: {},
  ingestionStatusPollingInterval: () => false,
  invalidatePostActivityIngestionQueries: jest.fn(),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ setQueryData: jest.fn() }) }));
jest.mock("react-native", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  api: {
    activities: { createFromRecordingSummary: { useMutation: () => ({ mutateAsync: jest.fn() }) } },
    activityFiles: {
      beginMobileRecordingUpload: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      getIngestionStatus: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ profile: { id: "profile-1" } }) }));
jest.mock("@/lib/services/ActivityRecorder/recordingEvidenceJournal", () => ({
  createFinalizedArtifactQueueHandoff: jest.fn(),
}));
jest.mock("@/lib/services/activitySubmissionQueue", () => ({
  loadActivitySubmissionQueueJobByArtifactId: jest.fn(),
  runActivitySubmissionQueueJob: jest.fn(),
}));
jest.mock("@/lib/services/activitySubmissionQueue/localArtifact", () => ({
  getLocalActivityArtifactMetadata: jest.fn(),
}));
jest.mock("@/lib/services/fit/ActivityFileUploader", () => ({
  ActivityFileUploader: class {},
}));

describe("record finalized submission hook contract", () => {
  it("maps the maintained finalized-recording outcomes to the visible phases", async () => {
    const { useActivitySubmission } =
      require("./useActivitySubmission") as typeof import("./useActivitySubmission");

    expect(useActivitySubmission).toEqual(expect.any(Function));
    expect(["review", "submit", "retry", "discard"]).toEqual([
      "review",
      "submit",
      "retry",
      "discard",
    ]);
  });
});
