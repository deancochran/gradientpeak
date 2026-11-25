import { describe, expect, it } from "vitest";
import {
  createActivityPlanStepDuration,
  getActivityPlanStepDurationAmount,
  getActivityPlanStepTargetEditorPolicy,
  getActivityPlanStepTargetInputPolicy,
} from "./step-editor-policy";

describe("activity-plan step editor policy", () => {
  it("keeps duration projection canonical and explicit", () => {
    expect(getActivityPlanStepDurationAmount({ type: "distance", meters: 1500 })).toBe(1500);
    expect(createActivityPlanStepDuration("repetitions", 0)).toEqual({
      type: "repetitions",
      count: 0,
    });
    expect(createActivityPlanStepDuration("untilFinished", 0)).toEqual({ type: "untilFinished" });
  });

  it("exposes target bounds and precision without erasing a valid zero", () => {
    expect(getActivityPlanStepTargetInputPolicy("watts")).toEqual({
      commitMinimum: 0,
      minimum: 0,
      pickerMinimum: 0,
      maximum: 3000,
      precision: "integer",
    });
    expect(getActivityPlanStepTargetInputPolicy("%FTP")).toMatchObject({
      commitMinimum: 0,
      minimum: Number.EPSILON,
      pickerMinimum: 1,
    });
    expect(getActivityPlanStepTargetInputPolicy("speed").precision).toEqual({
      maxDecimalPlaces: 2,
    });
    expect(getActivityPlanStepTargetInputPolicy("RPE").precision).toEqual({
      maxDecimalPlaces: 1,
    });
  });

  it("offers rest only for timed steps and RPE only for repetitions", () => {
    const timedBike = getActivityPlanStepTargetEditorPolicy({
      activityCategory: "bike",
      durationType: "time",
    });
    expect(timedBike).toMatchObject({ restAllowed: true, maximumTargets: 3 });
    expect(timedBike.selectableTargetTypes).toContain("cadence");
    expect(
      getActivityPlanStepTargetEditorPolicy({
        activityCategory: "strength",
        durationType: "repetitions",
      }),
    ).toEqual({ restAllowed: false, maximumTargets: 1, selectableTargetTypes: ["RPE"] });
  });
});
