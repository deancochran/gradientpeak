import { activityPlanIntervalStepSchema } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultActivityPlanStep,
  DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS,
} from "./activityPlanDefaults";

const STEP_ID = "00000000-0000-4000-8000-000000000001";

vi.mock("expo-crypto", () => ({ randomUUID: () => STEP_ID }));

describe("createDefaultActivityPlanStep", () => {
  it("creates a schema-valid five-minute step", () => {
    const step = createDefaultActivityPlanStep({ activityCategory: "other", id: STEP_ID });

    expect(activityPlanIntervalStepSchema.safeParse(step).success).toBe(true);
    expect(step.duration).toEqual({
      type: "time",
      seconds: DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS,
    });
  });

  it("selects its target from the supplied activity category and anchors", () => {
    expect(
      createDefaultActivityPlanStep({
        activityCategory: "bike",
        anchors: { ftpWatts: 250 },
        id: STEP_ID,
      }).targets,
    ).toEqual([{ type: "%FTP", intensity: 75 }]);
    expect(
      createDefaultActivityPlanStep({
        activityCategory: "run",
        anchors: { thresholdHeartRateBpm: 165 },
        id: STEP_ID,
      }).targets,
    ).toEqual([{ type: "%ThresholdHR", intensity: 75 }]);
  });
});
