import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  migrate: vi.fn(async () => undefined),
  loadArtifact: vi.fn(async (): Promise<unknown> => null),
  handoff: vi.fn(async () => undefined),
  inspect: vi.fn(async (): Promise<unknown> => ({ status: "none" })),
  loadJobs: vi.fn(async (): Promise<unknown[]> => []),
  loadDueJobs: vi.fn(async (): Promise<unknown[]> => []),
  clearCheckpoint: vi.fn(async () => undefined),
  hasQuarantine: vi.fn(async () => false),
  inspectFinalized: vi.fn(async (): Promise<unknown[]> => []),
  blockRebuild: vi.fn(async () => undefined),
  loadSqliteArtifacts: vi.fn(async (): Promise<unknown[]> => []),
  garbageCollect: vi.fn(async () => 0),
  garbageCollectAccepted: vi.fn(async () => 0),
}));

vi.mock("./activitySubmissionQueue/migration-only-v3", () => ({
  migrateSingleSportLocalStateToV3Once: mocks.migrate,
}));
vi.mock("./ActivityRecorder/finalizedArtifactStorage", () => ({
  loadPendingFinalizedArtifact: mocks.loadArtifact,
  garbageCollectDueAcceptedQueueEvidence: mocks.garbageCollectAccepted,
}));
vi.mock("./activitySubmissionQueue", () => ({
  ensureFinalizedArtifactQueueHandoff: mocks.handoff,
  loadActivitySubmissionQueueJobs: mocks.loadJobs,
  loadDueActivitySubmissionQueueJobs: mocks.loadDueJobs,
}));
vi.mock("./ActivityRecorder/checkpointStorage", () => ({
  clearRecordingCheckpoint: mocks.clearCheckpoint,
  inspectRecordingCheckpoint: mocks.inspect,
  hasQuarantinedRecordingEvidence: mocks.hasQuarantine,
}));
vi.mock("./ActivityRecorder/recordingEvidenceJournal", () => ({
  inspectFinalizedArtifactReferences: mocks.inspectFinalized,
  blockFinalizedArtifactRebuild: mocks.blockRebuild,
  loadFinalizedArtifactHandoffs: mocks.loadSqliteArtifacts,
  inspectRecordingEvidenceSession: vi.fn(async () => ({ status: "none" })),
  garbageCollectExpiredRecordingEvidence: mocks.garbageCollect,
}));

import {
  prepareMobileRecordingStartup,
  registerFinalizationRecoveryOwner,
  resetMobileRecordingStartupForTests,
} from "./mobileRecordingStartup";

describe("mobile recording startup fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMobileRecordingStartupForTests();
    mocks.loadArtifact.mockResolvedValue(null);
    mocks.loadJobs.mockResolvedValue([]);
    mocks.loadDueJobs.mockResolvedValue([]);
    mocks.inspect.mockResolvedValue({ status: "none" });
    mocks.inspectFinalized.mockResolvedValue([]);
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

  it("rebuilds a corrupt finalized reference once through the registered recorder owner", async () => {
    const checkpoint = { sessionId: "session-1", streamArtifactPaths: ["streams"] };
    mocks.inspect.mockResolvedValue({ status: "recovered", checkpoint });
    mocks.inspectFinalized.mockResolvedValue([
      { status: "rebuild-pending", sessionId: "session-1", reason: "finalized-artifact-mismatch" },
    ]);
    const rebuild = vi.fn(async () => undefined);
    registerFinalizationRecoveryOwner("profile-1", rebuild);

    await prepareMobileRecordingStartup("profile-1");
    await prepareMobileRecordingStartup("profile-1");

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledWith(checkpoint);
    expect(mocks.handoff).not.toHaveBeenCalled();
  });

  it("leaves a durable blocked state when the required checkpoint is unavailable", async () => {
    mocks.inspectFinalized.mockResolvedValue([
      { status: "rebuild-pending", sessionId: "session-1", reason: "finalized-artifact-mismatch" },
    ]);

    await prepareMobileRecordingStartup("profile-1");

    expect(mocks.blockRebuild).toHaveBeenCalledWith("session-1", "required-checkpoint-unavailable");
  });

  it("resumes a pending rebuild after process death before an owner ran", async () => {
    const checkpoint = { sessionId: "session-1", streamArtifactPaths: ["streams"] };
    mocks.inspect.mockResolvedValue({ status: "recovered", checkpoint });
    mocks.inspectFinalized.mockResolvedValue([
      { status: "rebuild-pending", sessionId: "session-1", reason: "finalized-artifact-mismatch" },
    ]);
    const firstOwner = vi.fn(async () => undefined);
    registerFinalizationRecoveryOwner("profile-1", firstOwner);
    // The durable journal has already recorded pending before this new process starts.
    resetMobileRecordingStartupForTests();
    const resumedOwner = vi.fn(async () => undefined);
    registerFinalizationRecoveryOwner("profile-1", resumedOwner);

    await prepareMobileRecordingStartup("profile-1");

    expect(firstOwner).not.toHaveBeenCalled();
    expect(resumedOwner).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild a healthy finalized reference", async () => {
    mocks.inspectFinalized.mockResolvedValue([{ status: "healthy", sessionId: "session-1" }]);
    const rebuild = vi.fn(async () => undefined);
    registerFinalizationRecoveryOwner("profile-1", rebuild);

    await prepareMobileRecordingStartup("profile-1");

    expect(rebuild).not.toHaveBeenCalled();
    expect(mocks.blockRebuild).not.toHaveBeenCalled();
  });
});
