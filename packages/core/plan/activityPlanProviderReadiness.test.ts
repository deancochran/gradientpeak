import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema, activityPlanTargetSchema } from "../activity-plan";
import {
  getActivityPlanProviderProjection,
  getActivityPlanTargetTypeDefault,
} from "./activityPlanProviderReadiness";

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000004",
      name: "Easy",
      duration: { type: "time", seconds: 300 },
      targets: [{ type: "RPE", intensity: 3 }],
    },
  ],
});
describe("activity plan provider readiness labels", () => {
  it.each([
    ["RPE", 5],
    ["bpm", 120],
    ["%FTP", 75],
    ["%MaxHR", 75],
    ["%ThresholdHR", 75],
    ["watts", 150],
    ["speed", 10],
    ["cadence", 80],
  ] as const)("provides a valid, fresh starting value for %s", (type, intensity) => {
    const target = getActivityPlanTargetTypeDefault(type);
    expect(target).toEqual({ type, intensity });
    expect(activityPlanTargetSchema.safeParse(target).success).toBe(true);
    expect(Number.isInteger(target.intensity)).toBe(true);
    target.intensity = -1;
    expect(getActivityPlanTargetTypeDefault(type)).toEqual({ type, intensity });
  });
  it("uses V5 item paths and does not invent retired boundary findings", () => {
    const projection = getActivityPlanProviderProjection({ provider: "strava", structure });
    expect(
      projection.findings.some((finding) => finding.reasonCode === "unsupported_boundary"),
    ).toBe(false);
    expect(
      projection.findings.some((finding) => finding.path.join(".").startsWith("structure.items.0")),
    ).toBe(true);
  });
  it("describes Garmin's narrow supported subset instead of treating all plans as deliverable", () => {
    expect(getActivityPlanProviderProjection({ provider: "garmin", structure }).disposition).toBe(
      "unsupported",
    );
    const compatible = activityPlanStructureSchema.parse({
      ...structure,
      items: [
        {
          ...structure.items[0],
          targets: [{ type: "speed", intensity: 10 }],
        },
      ],
    });
    expect(
      getActivityPlanProviderProjection({ provider: "garmin", structure: compatible }).disposition,
    ).toBe("compatible");
  });
});
