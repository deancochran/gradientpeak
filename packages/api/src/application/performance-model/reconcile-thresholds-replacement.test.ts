import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  rebuild: vi.fn(),
  coalesce: vi.fn(async ({ request }) => request),
  lockPublicationState: vi.fn(async ({ profileId }) => ({
    profileId,
    planningTimezone: "UTC",
    sourceRevision: 2,
    publishedRevision: 1,
  })),
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
vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleAthleteDerivedStateRepository: vi.fn(() => ({
    coalesceRecalculationRequest: repository.coalesce,
    lockPublicationState: repository.lockPublicationState,
  })),
}));

import { finalizeThresholdsAfterHistoryImport } from "./reconcile-thresholds";

beforeEach(() => {
  repository.rebuild.mockReset().mockResolvedValue({ changed: false, count: 0 });
  markAthleteStateDirty.mockReset().mockResolvedValue(2);
  repository.coalesce.mockClear();
  repository.lockPublicationState.mockClear();
});

describe("final threshold history reconciliation", () => {
  it("rebuilds each identity across full current history while scoping imported evidence", async () => {
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
    const oldEffectiveAt = new Date("2026-04-01T08:00:00.000Z");
    const replacementEffectiveAt = new Date("2026-05-01T08:00:00.000Z");
    const historyRows = [
      [
        {
          id: "old-threshold",
          evaluation_id: "old-evaluation",
          value: 250,
          confidence: 1,
          effective_at: oldEffectiveAt,
          supersedes_id: null,
        },
      ],
      [
        {
          id: "replacement-threshold",
          evaluation_id: "replacement-evaluation",
          value: 260,
          confidence: 1,
          effective_at: replacementEffectiveAt,
          supersedes_id: null,
        },
      ],
      [],
      [],
      [],
      [],
    ];
    let historyRead = 0;
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => {
        if (historyRead === 0) {
          historyRead += 1;
          return emptyHistoryRead;
        }
        const rows = historyRows[historyRead - 1] ?? [];
        historyRead += 1;
        const thresholdRead = {
          from: vi.fn(),
          where: vi.fn(),
          orderBy: vi.fn().mockResolvedValue(rows),
        };
        thresholdRead.from.mockReturnValue(thresholdRead);
        thresholdRead.where.mockReturnValue(thresholdRead);
        return thresholdRead;
      }),
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
      profileId: input.profileId,
      asOf: new Date("9999-12-31T23:59:59.999Z"),
      now: input.now,
      identity: { activityCategory: "bike", metric: "power" },
    });
    for (const [, rebuildInput] of repository.rebuild.mock.calls) {
      expect(rebuildInput.asOf).toEqual(new Date("9999-12-31T23:59:59.999Z"));
    }
    expect(markAthleteStateDirty).toHaveBeenCalledOnce();
    expect(markAthleteStateDirty).toHaveBeenCalledWith(tx, {
      profileId: input.profileId,
      effectiveAt: oldEffectiveAt,
      now: input.now,
    });
    expect(repository.coalesce).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: input.profileId,
        request: expect.objectContaining({
          earliestAffectedAt: oldEffectiveAt.toISOString(),
          reasons: ["threshold_changed"],
          sourceRevision: 2,
        }),
      }),
    );
  });
});
