import { describe, expect, it, vi } from "vitest";

const { eqSpy } = vi.hoisted(() => ({ eqSpy: vi.fn((column, value) => ({ column, value })) }));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: eqSpy };
});

import {
  ActivityEvidenceAdapter,
  activityEvidenceReadLimits,
} from "../adapters/activities/activity-evidence-adapter";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-07-10T12:00:00.000Z");

function createDb(rows: unknown[]) {
  const calls = { limit: [] as number[], orderBy: 0, where: [] as unknown[] };
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle's fluent builder is intentionally a bounded test double.
  const db: any = {
    select: vi.fn(() => {
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle's fluent builder is intentionally a bounded test double.
      const builder: any = {
        from: () => builder,
        where: (condition: unknown) => {
          calls.where.push(condition);
          return builder;
        },
        orderBy: () => {
          calls.orderBy += 1;
          return builder;
        },
        limit: (limit: number) => {
          calls.limit.push(limit);
          return Promise.resolve(rows);
        },
      };
      return builder;
    }),
  };
  return { db, calls };
}

describe("ActivityEvidenceAdapter", () => {
  it("uses a profile-scoped, bounded recent-activity read", async () => {
    const { db, calls } = createDb([]);

    await new ActivityEvidenceAdapter(db).collect({ profileId: PROFILE_ID, now: NOW });

    expect(calls.where).toHaveLength(1);
    expect(calls.orderBy).toBe(1);
    expect(calls.limit).toEqual([activityEvidenceReadLimits.limit]);
    expect(eqSpy).toHaveBeenCalledWith(expect.anything(), PROFILE_ID);
    expect(activityEvidenceReadLimits).toEqual({ lookbackDays: 90, limit: 120 });
  });

  it("derives coverage from distinct observed active weeks rather than the 90-day window", async () => {
    const { db } = createDb([
      {
        id: "a1",
        type: "run",
        started_at: new Date("2026-07-09T08:00:00.000Z"),
        duration_seconds: 3600,
      },
      {
        id: "a2",
        type: "run",
        started_at: new Date("2026-07-08T08:00:00.000Z"),
        duration_seconds: 3600,
      },
      {
        id: "a3",
        type: "bike",
        started_at: new Date("2026-06-30T08:00:00.000Z"),
        duration_seconds: 7200,
      },
    ]);

    const result = await new ActivityEvidenceAdapter(db).collect({
      profileId: PROFILE_ID,
      goalActivityCategory: "run",
      now: NOW,
    });

    const endurance = result.filter((item) => item.capabilityId === "endurance");
    expect(endurance).toHaveLength(3);
    expect(endurance.every((item) => item.confidence === 0.116667)).toBe(true);
    expect(endurance.map((item) => item.sourceId).sort()).toEqual(["a1", "a2", "a3"]);
    expect(endurance.every((item) => item.correlationGroupId === `activity:${item.sourceId}`)).toBe(
      true,
    );
  });

  it("is deterministic and keeps unsupported signals explicitly unknown", async () => {
    const rows = [
      {
        id: "b",
        type: "bike",
        started_at: new Date("2026-07-02T08:00:00.000Z"),
        duration_seconds: 0,
      },
      {
        id: "a",
        type: "bike",
        started_at: new Date("2026-07-03T08:00:00.000Z"),
        duration_seconds: 3600,
      },
    ];
    const first = await new ActivityEvidenceAdapter(createDb(rows).db).collect({
      profileId: PROFILE_ID,
      goalActivityCategory: "run",
      now: NOW,
    });
    const second = await new ActivityEvidenceAdapter(createDb([...rows].reverse()).db).collect({
      profileId: PROFILE_ID,
      goalActivityCategory: "run",
      now: NOW,
    });

    expect(first).toEqual(second);
    expect(first.find((item) => item.capabilityId === "durability")).toMatchObject({
      value: null,
      confidence: 0,
    });
    expect(first.find((item) => item.capabilityId === "specificity")).toMatchObject({
      value: null,
      confidence: 0,
    });
  });
});
