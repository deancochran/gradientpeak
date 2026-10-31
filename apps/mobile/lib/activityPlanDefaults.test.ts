import { activityPlanStepSchema } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultActivityPlanStep,
  createIncompleteActivityPlanStep,
  DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS,
} from "./activityPlanDefaults";

const STEP_ID = "00000000-0000-4000-8000-000000000001";
vi.mock("expo-crypto", () => ({ randomUUID: () => STEP_ID }));
describe("createDefaultActivityPlanStep", () => {
  it("represents a new, unprescribed step without a fake duration", () => {
    expect(createIncompleteActivityPlanStep({ id: STEP_ID })).toEqual({
      type: "step",
      id: STEP_ID,
      duration: null,
      targets: [],
    });
  });
  it("creates a schema-valid five-minute step", () => {
    const step = createDefaultActivityPlanStep({ activityCategory: "other", id: STEP_ID });
    expect(activityPlanStepSchema.safeParse(step).success).toBe(true);
    expect(step.duration).toEqual({
      type: "time",
      seconds: DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS,
    });
  });
  it("keeps the V4 default untargeted for every category", () => {
    expect(
      createDefaultActivityPlanStep({ activityCategory: "bike", id: STEP_ID }).targets,
    ).toEqual([]);
    expect(createDefaultActivityPlanStep({ activityCategory: "run", id: STEP_ID }).targets).toEqual(
      [],
    );
  });
});
