import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  rebuild: vi.fn(),
}));
const markAthleteStateDirty = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/threshold-repository", () => ({
  rebuildThresholdChainWithProfileLockHeld: repository.rebuild,
  insertThresholdEvaluation: vi.fn(),
  readQualifiedThresholdEvidence: vi.fn(),
  readThresholdEvidenceSources: vi.fn(),
  thresholdEvaluationId: vi.fn(),
}));
vi.mock("../../repositories/athlete-state-repository", () => ({ markAthleteStateDirty }));

import { finalizeThresholdsAfterHistoryImport } from "./reconcile-thresholds";

beforeEach(() => {
  repository.rebuild.mockReset().mockResolvedValue({ changed: false, count: 0 });
  markAthleteStateDirty.mockReset().mockResolvedValue(undefined);
});

describe("final threshold history reconciliation", () => {
  it("rebuilds each hard-cut identity at one completed import horizon", async () => {
    repository.rebuild.mockResolvedValueOnce({ changed: true, count: 2 });
    const emptyHistoryRead = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn().mockResolvedValue([]),
    };
    emptyHistoryRead.from.mockReturnValue(emptyHistoryRead);
    emptyHistoryRead.where.mockReturnValue(emptyHistoryRead);
    emptyHistoryRead.orderBy.mockReturnValue(emptyHistoryRead);
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue(emptyHistoryRead),
    } as never;
    const input = {
      profileId: "11111111-1111-4111-8111-111111111111",
      asOf: new Date("2026-08-10T12:00:00.000Z"),
      now: new Date("2026-08-10T13:00:00.000Z"),
    };
    await expect(finalizeThresholdsAfterHistoryImport(tx, input)).resolves.toEqual({
      changed: true,
      identities: [
        { activityCategory: "bike", metric: "power" },
        { activityCategory: "run", metric: "speed" },
        { activityCategory: "swim", metric: "speed" },
      ],
    });
    expect(repository.rebuild).toHaveBeenCalledTimes(3);
    expect(repository.rebuild).toHaveBeenNthCalledWith(1, tx, {
      ...input,
      identity: { activityCategory: "bike", metric: "power" },
    });
    expect(markAthleteStateDirty).toHaveBeenCalledOnce();
  });
});
