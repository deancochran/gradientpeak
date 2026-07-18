import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  migrate: vi.fn(async () => undefined),
  loadArtifact: vi.fn(async (): Promise<unknown> => null),
  handoff: vi.fn(async () => undefined),
  inspect: vi.fn(async (): Promise<unknown> => ({ status: "none" })),
  loadJobs: vi.fn(async (): Promise<unknown[]> => []),
  clearCheckpoint: vi.fn(async () => undefined),
  hasQuarantine: vi.fn(async () => false),
}));

vi.mock("./activitySubmissionQueue/migration-only-v3", () => ({
  migrateSingleSportLocalStateToV3Once: mocks.migrate,
}));
vi.mock("./ActivityRecorder/finalizedArtifactStorage", () => ({
  loadPendingFinalizedArtifact: mocks.loadArtifact,
}));
vi.mock("./activitySubmissionQueue", () => ({
  ensureFinalizedArtifactQueueHandoff: mocks.handoff,
  loadActivitySubmissionQueueJobs: mocks.loadJobs,
}));
vi.mock("./ActivityRecorder/checkpointStorage", () => ({
  clearRecordingCheckpoint: mocks.clearCheckpoint,
  inspectRecordingCheckpoint: mocks.inspect,
  hasQuarantinedRecordingEvidence: mocks.hasQuarantine,
}));

import {
  prepareMobileRecordingStartup,
  resetMobileRecordingStartupForTests,
} from "./mobileRecordingStartup";

describe("mobile recording startup fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMobileRecordingStartupForTests();
    mocks.loadArtifact.mockResolvedValue(null);
    mocks.loadJobs.mockResolvedValue([]);
    mocks.inspect.mockResolvedValue({ status: "none" });
  });

  it("coalesces queue drain and recorder discovery behind one finalized handoff", async () => {
    const artifact = { sessionId: "session-1", profileId: "profile-1" };
    mocks.loadArtifact.mockResolvedValue(artifact);
    let release!: () => void;
    mocks.handoff.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        }),
    );
    const first = prepareMobileRecordingStartup("profile-1");
    const second = prepareMobileRecordingStartup("profile-1");
    await vi.waitFor(() => expect(mocks.handoff).toHaveBeenCalledWith(artifact, "profile-1"));
    expect(mocks.loadJobs).not.toHaveBeenCalled();
    release();
    expect(await first).toEqual(await second);
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
    expect(mocks.loadJobs).toHaveBeenCalledTimes(1);
    expect(mocks.loadJobs).toHaveBeenCalledWith("profile-1");
  });

  it("does not hand off or return another profile's pending artifact after account switch", async () => {
    mocks.loadArtifact.mockResolvedValue({ sessionId: "other-session", profileId: "profile-2" });
    mocks.loadJobs.mockResolvedValue([]);

    const result = await prepareMobileRecordingStartup("profile-1");

    expect(mocks.handoff).not.toHaveBeenCalled();
    expect(mocks.loadJobs).toHaveBeenCalledWith("profile-1");
    expect(result.queueJobs).toEqual([]);
  });

  it("suppresses resume when a queue handoff for the same session already committed", async () => {
    mocks.inspect.mockResolvedValue({
      status: "recovered",
      checkpoint: { sessionId: "session-1" },
    });
    mocks.loadJobs.mockResolvedValue([{ sessionId: "session-1" }]);
    const result = await prepareMobileRecordingStartup("profile-1");
    expect(result.checkpoint).toEqual({ status: "none" });
    expect(mocks.clearCheckpoint).toHaveBeenCalledWith("session-1");
  });
});
