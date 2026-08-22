import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {};
const processActivityFile = vi.hoisted(() => vi.fn());
const recordSessionRpe = vi.hoisted(() => vi.fn());
const toggleContentLike = vi.hoisted(() => vi.fn());
const addContentComment = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({ getRequiredDb: () => db }));
vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({ storage: { createBucket: vi.fn(), from: vi.fn() } }),
  getActivityArtifactStorageService: () => ({ storage: { from: vi.fn() } }),
}));
vi.mock("../../application/activity-file-ingestion/process-manual-activity-file", () => ({
  processManualActivityFile: processActivityFile,
}));
vi.mock("../../application/activities/record-session-rpe", () => ({
  recordSessionRpe,
  SessionRpeEvidenceConflictError: class extends Error {},
  SessionRpeEvidenceNotFoundError: class extends Error {},
}));
vi.mock("../../application/social/contentEngagement", () => ({
  toggleContentLike,
  addContentComment,
  readContentComments: vi.fn(),
}));

import { activitiesRouter } from "../activities";
import { activityFilesRouter } from "../activity-files";
import { socialRouter } from "../social";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "22222222-2222-4222-8222-222222222222";

function caller(router: { createCaller: (ctx: unknown) => unknown }) {
  return router.createCaller({
    db,
    session: { user: { id: USER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never) as unknown as Record<string, (input: unknown) => Promise<unknown>>;
}

describe("P1 activity capability API boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processActivityFile.mockResolvedValue({
      activity: { id: ACTIVITY_ID, started_at: new Date("2026-01-01T10:00:00.000Z") },
    });
    recordSessionRpe.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      activityId: ACTIVITY_ID,
      recordedAt: new Date("2026-01-01T10:00:00.000Z"),
      correctedAt: null,
      rpe: 7,
      scale: "borg_cr10",
      scaleVersion: "1",
      source: "user",
      operationId: "55555555-5555-4555-8555-555555555555",
      correctionOfId: null,
      provenance: {},
    });
    toggleContentLike.mockResolvedValue({ liked: true });
    addContentComment.mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444" });
  });

  it("passes an owned historical import through the transport boundary", async () => {
    await expect(
      caller(activityFilesRouter).processActivityFile({
        activityFilePath: `${USER_ID}/history.fit`,
        name: "History",
      }),
    ).resolves.toMatchObject({ success: true, activity: { id: ACTIVITY_ID } });
    expect(processActivityFile).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ profileId: USER_ID, activityFilePath: `${USER_ID}/history.fit` }),
      expect.anything(),
    );
  });

  it("forwards the actor and idempotency fields when recording session effort", async () => {
    await caller(activitiesRouter).recordSessionRpe({
      activity_id: ACTIVITY_ID,
      operation_id: "55555555-5555-4555-8555-555555555555",
      rpe: 7,
      source: "user",
    });
    expect(recordSessionRpe).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        activityId: ACTIVITY_ID,
        profileId: USER_ID,
        operationId: "55555555-5555-4555-8555-555555555555",
        rpe: 7,
      }),
    );
  });

  it("exposes activity likes and comments through the shared social boundary", async () => {
    await expect(
      caller(socialRouter).toggleLike({ entity_id: ACTIVITY_ID, entity_type: "activity" }),
    ).resolves.toEqual({ liked: true });
    await caller(socialRouter).addComment({
      entity_id: ACTIVITY_ID,
      entity_type: "activity",
      content: "  Strong finish  ",
    });
    expect(toggleContentLike).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: USER_ID,
        entityId: ACTIVITY_ID,
        entityType: "activity",
      }),
    );
    expect(addContentComment).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: USER_ID,
        input: expect.objectContaining({ entity_id: ACTIVITY_ID, content: "  Strong finish  " }),
      }),
    );
  });
});
