import { describe, expect, it } from "vitest";
import { getPlanningDateForClock } from "../training-plan/appliedScheduleUseCases";
import { PlannedSessionFutureDateError } from "./planned-session-errors";
import { assertPlannedSessionDateCanBeSkipped } from "./skip-planned-session";

describe("planned-session skip date guard", () => {
  it("accepts past and current planning dates", () => {
    expect(() =>
      assertPlannedSessionDateCanBeSkipped({
        planningDate: "2026-08-19",
        currentPlanningDate: "2026-08-20",
      }),
    ).not.toThrow();
    expect(() =>
      assertPlannedSessionDateCanBeSkipped({
        planningDate: "2026-08-20",
        currentPlanningDate: "2026-08-20",
      }),
    ).not.toThrow();
  });

  it("rejects a future session using the actor planning timezone", () => {
    const currentPlanningDate = getPlanningDateForClock({
      now: new Date("2026-08-21T00:30:00.000Z"),
      planningTimezone: "America/Los_Angeles",
    });
    expect(currentPlanningDate).toBe("2026-08-20");
    expect(() =>
      assertPlannedSessionDateCanBeSkipped({
        planningDate: "2026-08-21",
        currentPlanningDate,
      }),
    ).toThrow(PlannedSessionFutureDateError);
  });
});
