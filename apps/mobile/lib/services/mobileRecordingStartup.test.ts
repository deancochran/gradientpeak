import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handoff: vi.fn(async () => undefined),
  inspect: vi.fn(async (): Promise<unknown> => ({ status: "none" })),
  loadJobs: vi.fn(async (): Promise<unknown[]> => []),
  loadDueJobs: vi.fn(async (): Promise<unknown[]> => []),
  clearCheckpoint: vi.fn(async () => undefined),
  hasQuarantine: vi.fn(async () => false),
  inspectFinalized: vi.fn(async (): Promise<unknown[]> => []),
  loadSqliteArtifacts: vi.fn(async (): Promise<unknown[]> => []),
  garbageCollect: vi.fn(async () => 0),
  garbageCollectAccepted: vi.fn(async () => 0),
  garbageCollectDiscarded: vi.fn(async () => 0),
}));

vi.mock("./ActivityRecorder/finalizedArtifactStorage", () => ({
  garbageCollectDueAcceptedQueueEvidence: mocks.garbageCollectAccepted,
  garbageCollectDueDiscardedRecordingEvidence: mocks.garbageCollectDiscarded,
}));
vi.mock("./activitySubmissionQueue", () => ({
  ensureFinalizedArtifactQueueHandoff: mocks.handoff,
  loadActivitySubmissionQueueJobs: mocks.loadJobs,
  loadDueActivitySubmissionQueueJobs: mocks.loadDueJobs,
}));
vi.mock("./ActivityRecorder/checkpointStorage", () => ({
  clearRecordingCheckpoint: mocks.clearCheckpoint,
  inspectRecordingCheckpoint: mocks.inspect,
}));
vi.mock("./ActivityRecorder/recordingEvidenceJournal", () => ({
  inspectFinalizedArtifactReferences: mocks.inspectFinalized,
  loadFinalizedArtifactHandoffs: mocks.loadSqliteArtifacts,
  inspectRecordingEvidenceSession: vi.fn(async () => ({ status: "none" })),
  garbageCollectExpiredRecordingEvidence: mocks.garbageCollect,
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
    mocks.loadSqliteArtifacts.mockResolvedValue([]);
    mocks.loadJobs.mockResolvedValue([]);
    mocks.loadDueJobs.mockResolvedValue([]);
    mocks.inspect.mockResolvedValue({ status: "none" });
    mocks.inspectFinalized.mockResolvedValue([]);
  });

  it("coalesces queue drain and recorder discovery behind one finalized handoff", async () => {
    const artifact = { sessionId: "session-1", profileId: "profile-1" };
    mocks.loadSqliteArtifacts.mockResolvedValue([artifact]);
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
    expect(mocks.loadJobs).toHaveBeenCalledTimes(1);
    expect(mocks.loadJobs).toHaveBeenCalledWith("profile-1");
  });

  it("does not hand off or return another profile's pending artifact after account switch", async () => {
    mocks.loadSqliteArtifacts.mockResolvedValue([
      { sessionId: "other-session", profileId: "profile-2" },
    ]);
    mocks.loadJobs.mockResolvedValue([]);

    const result = await prepareMobileRecordingStartup("profile-1");

    expect(mocks.handoff).not.toHaveBeenCalled();
    expect(mocks.loadJobs).toHaveBeenCalledWith("profile-1");
    expect(result.queueJobs).toEqual([]);
  });

  it("does not enqueue, upload, or recover a finalized artifact removed by the durable discard transition", async () => {
    // The journal excludes discarded sessions from loadFinalizedArtifactHandoffs;
    // this simulates the next process startup after that durable transition.
    mocks.loadSqliteArtifacts.mockResolvedValue([]);

    const result = await prepareMobileRecordingStartup("profile-1");

    expect(mocks.loadSqliteArtifacts).toHaveBeenCalledWith("profile-1");
    expect(mocks.handoff).not.toHaveBeenCalled();
    expect(result.queueJobs).toEqual([]);
    expect(mocks.garbageCollectDiscarded).toHaveBeenCalledTimes(1);
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

  it("does not replay a quarantined finalized row", async () => {
    mocks.inspectFinalized.mockResolvedValue([
      { status: "quarantined", sessionId: "session-1", reason: "finalized-current-fields-missing" },
    ]);

    await prepareMobileRecordingStartup("profile-1");

    expect(mocks.handoff).not.toHaveBeenCalled();
  });
});
