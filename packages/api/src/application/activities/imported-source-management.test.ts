import { describe, expect, it, vi } from "vitest";
import {
  ImportedSourceNotFoundError,
  resolveImportedSourceForProfile,
} from "./imported-source-management";

const profileId = "11111111-1111-4111-8111-111111111111";
const sourceReferenceId = "22222222-2222-4222-8222-222222222222";
const activityId = "33333333-3333-4333-8333-333333333333";

function createDb(input: {
  sourceActivityId: string | null;
  targetActivityId?: string;
  updated?: boolean;
}) {
  const selectRows = [
    [{ activityId: input.sourceActivityId }],
    input.targetActivityId ? [{ id: input.targetActivityId }] : [],
  ];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(selectRows.shift() ?? []) })),
    })),
  }));
  const set = vi.fn((values: unknown) => ({
    where: vi.fn(() => ({
      returning: vi
        .fn()
        .mockResolvedValue(input.updated === false ? [] : [{ id: sourceReferenceId }]),
    })),
    values,
  }));
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    select,
    update: vi.fn(() => ({ set })),
  };
  const db = {
    transaction: vi.fn((operation: (transaction: typeof tx) => unknown) => operation(tx)),
  };
  return { db, set };
}

describe("resolveImportedSourceForProfile", () => {
  it("confirms a reviewed source against its current owned activity", async () => {
    const { db, set } = createDb({
      sourceActivityId: activityId,
      targetActivityId: activityId,
    });

    await expect(
      resolveImportedSourceForProfile({
        action: "confirm_same",
        db: db as never,
        profileId,
        sourceReferenceId,
      }),
    ).resolves.toEqual({ activityId, resolutionStatus: "confirmed" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: activityId, resolution_status: "confirmed" }),
    );
  });

  it("ignores a reviewed source without creating another activity", async () => {
    const { db, set } = createDb({ sourceActivityId: activityId });

    await expect(
      resolveImportedSourceForProfile({
        action: "ignore",
        db: db as never,
        profileId,
        sourceReferenceId,
      }),
    ).resolves.toEqual({ activityId: null, resolutionStatus: "ignored" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: null, resolution_status: "ignored" }),
    );
  });

  it("does not report success when a reviewed source changed concurrently", async () => {
    const { db } = createDb({ sourceActivityId: activityId, updated: false });

    await expect(
      resolveImportedSourceForProfile({
        action: "ignore",
        db: db as never,
        profileId,
        sourceReferenceId,
      }),
    ).rejects.toBeInstanceOf(ImportedSourceNotFoundError);
  });
});
