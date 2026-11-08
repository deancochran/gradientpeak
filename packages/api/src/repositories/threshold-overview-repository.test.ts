import { describe, expect, it, vi } from "vitest";
import type { DrizzleQueryExecutor } from "../db";
import { readPublishedThresholdHistory } from "./threshold-overview-repository";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const THRESHOLD_ID = "22222222-2222-4222-8222-222222222222";
const EVALUATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID = "44444444-4444-4444-8444-444444444444";

function historyDb() {
  const effectiveAt = new Date("2026-08-20T12:00:00.000Z");
  const createdAt = new Date("2026-08-20T12:01:00.000Z");
  const finishedAt = new Date("2026-08-20T12:00:00.000Z");
  const historyRows = [
    {
      thresholdId: THRESHOLD_ID,
      activityCategory: "run",
      metric: "lthr",
      unit: "bpm",
      method: "lthr_30m_final_20m",
      value: 174,
      confidence: 0.9,
      effectiveAt,
      createdAt,
      policyVersion: "threshold-policy-v1",
      evaluationId: EVALUATION_ID,
    },
  ];
  const provenanceRows = [
    {
      evaluationId: EVALUATION_ID,
      activityId: ACTIVITY_ID,
      activityName: "Run LTHR field test",
      finishedAt,
    },
  ];
  const firstQuery = {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(historyRows) })),
      })),
    })),
  };
  const secondQuery = {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue(provenanceRows) })),
      })),
    })),
  };
  const select = vi.fn().mockReturnValueOnce(firstQuery).mockReturnValueOnce(secondQuery);
  return { db: { select } as unknown as DrizzleQueryExecutor, select };
}

describe("readPublishedThresholdHistory", () => {
  it("maps category-scoped LTHR through the public history contract", async () => {
    const { db, select } = historyDb();

    await expect(
      readPublishedThresholdHistory(db, { profileId: PROFILE_ID, limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          thresholdId: THRESHOLD_ID,
          activityCategory: "run",
          metric: "lthr",
          unit: "bpm",
          method: "lthr_30m_final_20m",
          value: 174,
          confidence: 0.9,
          effectiveAt: new Date("2026-08-20T12:00:00.000Z"),
          createdAt: new Date("2026-08-20T12:01:00.000Z"),
          policyVersion: "threshold-policy-v1",
          sourceActivities: [
            {
              id: ACTIVITY_ID,
              name: "Run LTHR field test",
              finishedAt: new Date("2026-08-20T12:00:00.000Z"),
            },
          ],
        },
      ],
      nextCursor: null,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });
});
