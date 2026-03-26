import { describe, expect, it } from "vitest";
import { buildCanonicalDailyLoads, buildWorkloadEnvelopes } from "../workload";

describe("workload utils", () => {
  it("prefers TRIMP over TSS when both are present", () => {
    const start = new Date("2026-02-01T00:00:00.000Z");
    const end = new Date("2026-02-01T00:00:00.000Z");

    const result = buildCanonicalDailyLoads(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          trimp: 100,
          tss: 50,
        },
      ],
      start,
      end,
    );

    expect(result.dailyLoads).toEqual([100]);
    expect(result.source).toBe("trimp");
  });

  it("fills rest days with zero and computes coverage from earliest activity", () => {
    const start = new Date("2026-02-01T00:00:00.000Z");
    const end = new Date("2026-02-05T00:00:00.000Z");

    const result = buildCanonicalDailyLoads(
      [
        {
          started_at: "2026-02-03T08:00:00.000Z",
          tss: 40,
        },
      ],
      start,
      end,
    );

    expect(result.dailyLoads).toEqual([0, 0, 40, 0, 0]);
    expect(result.coverageDays).toBe(2);
    expect(result.source).toBe("tss");
  });

  it("builds ACWR and Monotony envelopes with shared source", () => {
    const start = new Date("2026-02-01T00:00:00.000Z");
    const end = new Date("2026-02-28T00:00:00.000Z");

    const activities = Array.from({ length: 28 }, (_, i) => ({
      started_at: `2026-02-${String(i + 1).padStart(2, "0")}T06:00:00.000Z`,
      trimp: 50,
    }));

    const workload = buildWorkloadEnvelopes(activities, start, end);

    expect(workload.acwr.source).toBe("trimp");
    expect(workload.monotony.source).toBe("trimp");
    expect(workload.acwr.status).toBe("provisional");
    expect(workload.monotony.requiredDays).toBe(7);
  });
});
