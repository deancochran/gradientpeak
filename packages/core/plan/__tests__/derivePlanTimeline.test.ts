import { describe, expect, it } from "vitest";
import { derivePlanTimeline } from "../derivePlanTimeline";

describe("derivePlanTimeline", () => {
  it("honors explicit plan_start_date", () => {
    const timeline = derivePlanTimeline({
      plan_start_date: "2026-02-01",
      today_date: "2026-01-01",
      goals: [{ target_date: "2026-05-01" }, { target_date: "2026-04-01" }],
    });

    expect(timeline.start_date).toBe("2026-02-01");
    expect(timeline.end_date).toBe("2026-05-01");
  });

  it("falls back to today_date when explicit plan_start_date is missing", () => {
    const timeline = derivePlanTimeline({
      today_date: "2026-01-15",
      goals: [{ target_date: "2026-05-01" }],
    });

    expect(timeline.start_date).toBe("2026-01-15");
    expect(timeline.end_date).toBe("2026-05-01");
  });

  it("rejects plan_start_date after latest goal date", () => {
    expect(() =>
      derivePlanTimeline({
        plan_start_date: "2026-06-01",
        today_date: "2026-01-15",
        goals: [{ target_date: "2026-05-01" }, { target_date: "2026-04-01" }],
      }),
    ).toThrow(
      "plan_start_date must be on or before the latest goal target_date",
    );
  });
});
