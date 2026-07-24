import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  findOwnedCompletedActivity: vi.fn(),
  findOwnedEffectiveSessionRpeEvidence: vi.fn(),
  findOwnedSessionRpeEvidenceByOperation: vi.fn(),
  insertSessionRpeEvidence: vi.fn(),
  lockSessionRpeActivity: vi.fn(),
}));

vi.mock("../../repositories/activity-session-rpe-repository", () => repository);

import {
  recordSessionRpe,
  SessionRpeEvidenceConflictError,
  SessionRpeEvidenceNotFoundError,
} from "./record-session-rpe";

const input = {
  activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  profileId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  rpe: 7,
  scale: "borg_cr10" as const,
  scaleVersion: "1" as const,
  source: "user" as const,
};

function projection(overrides: Record<string, unknown> = {}) {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    profileId: input.profileId,
    activityId: input.activityId,
    recordedAt: new Date("2026-07-23T12:00:00.000Z"),
    correctedAt: null,
    rpe: input.rpe,
    scale: input.scale,
    scaleVersion: input.scaleVersion,
    source: input.source,
    operationId: input.operationId,
    correctionOfId: null,
    provenance: { observation_type: "completed_session_rpe" },
    createdAt: new Date("2026-07-23T12:01:00.000Z"),
    ...overrides,
  };
}

function database() {
  return {
    transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({}),
  };
}

describe("recordSessionRpe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("appends bounded completed-session evidence without touching existing source evidence", async () => {
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(undefined);
    repository.findOwnedCompletedActivity.mockResolvedValue({ id: input.activityId });
    repository.findOwnedEffectiveSessionRpeEvidence.mockResolvedValue(null);
    repository.insertSessionRpeEvidence.mockImplementation(async (_tx, values) =>
      projection(values),
    );

    await expect(recordSessionRpe(database() as never, input)).resolves.toMatchObject({
      activityId: input.activityId,
      rpe: 7,
      source: "user",
      correctionOfId: null,
    });

    expect(repository.lockSessionRpeActivity).toHaveBeenCalledWith({}, input);
    expect(repository.insertSessionRpeEvidence).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        activity_id: input.activityId,
        profile_id: input.profileId,
        operation_id: input.operationId,
        correction_of_id: null,
        corrected_at: null,
        recorded_at: expect.any(Date),
        provenance: expect.objectContaining({ operation_id: input.operationId }),
      }),
    );
  });

  it("returns the same evidence for an identical operation replay", async () => {
    const existing = projection();
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(existing);

    await expect(recordSessionRpe(database() as never, input)).resolves.toBe(existing);
    expect(repository.findOwnedCompletedActivity).not.toHaveBeenCalled();
    expect(repository.insertSessionRpeEvidence).not.toHaveBeenCalled();
  });

  it("rejects an operation ID reused with different evidence", async () => {
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(projection({ rpe: 6 }));

    await expect(recordSessionRpe(database() as never, input)).rejects.toBeInstanceOf(
      SessionRpeEvidenceConflictError,
    );
  });

  it("rejects activity IDs outside the authenticated profile ownership scope", async () => {
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(undefined);
    repository.findOwnedCompletedActivity.mockResolvedValue(undefined);
    repository.findOwnedEffectiveSessionRpeEvidence.mockResolvedValue(null);

    await expect(recordSessionRpe(database() as never, input)).rejects.toBeInstanceOf(
      SessionRpeEvidenceNotFoundError,
    );
    expect(repository.insertSessionRpeEvidence).not.toHaveBeenCalled();
  });

  it("records a correction as a new manual replacement", async () => {
    const correctionOfId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(undefined);
    repository.findOwnedCompletedActivity.mockResolvedValue({ id: input.activityId });
    repository.findOwnedEffectiveSessionRpeEvidence.mockResolvedValue(
      projection({ id: correctionOfId }),
    );
    repository.insertSessionRpeEvidence.mockImplementation(async (_tx, values) =>
      projection(values),
    );

    await recordSessionRpe(database() as never, {
      ...input,
      correctionOfId,
      operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      source: "manual",
    });

    expect(repository.insertSessionRpeEvidence).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ correction_of_id: correctionOfId, source: "manual" }),
    );
  });

  it("does not permit a correction to be recorded as user evidence", async () => {
    await expect(
      recordSessionRpe(database() as never, {
        ...input,
        correctionOfId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      }),
    ).rejects.toBeInstanceOf(SessionRpeEvidenceConflictError);
    expect(repository.lockSessionRpeActivity).not.toHaveBeenCalled();
  });

  it("requires a correction to replace the current effective observation", async () => {
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(undefined);
    repository.findOwnedCompletedActivity.mockResolvedValue({ id: input.activityId });
    repository.findOwnedEffectiveSessionRpeEvidence.mockResolvedValue(projection());

    await expect(
      recordSessionRpe(database() as never, {
        ...input,
        correctionOfId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        source: "manual",
      }),
    ).rejects.toBeInstanceOf(SessionRpeEvidenceConflictError);
  });

  it("does not allow a competing root observation", async () => {
    repository.findOwnedSessionRpeEvidenceByOperation.mockResolvedValue(undefined);
    repository.findOwnedCompletedActivity.mockResolvedValue({ id: input.activityId });
    repository.findOwnedEffectiveSessionRpeEvidence.mockResolvedValue(projection());

    await expect(recordSessionRpe(database() as never, input)).rejects.toBeInstanceOf(
      SessionRpeEvidenceConflictError,
    );
  });
});
