import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { activityPlanCanonicalStructureHash, activityPlanStructureHash } from "./structure-hash";

const structure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "33333333-3333-4333-8333-333333333333",
      name: "Steady",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
  ],
};
describe("activity-plan structure hashing", () => {
  it("uses the strict canonical digest for a valid V5 structure", () => {
    expect(activityPlanCanonicalStructureHash(structure)).toBe(
      activityPlanStructureHash(structure),
    );
  });
  it("rejects non-V5 values at executable prescription boundaries", () => {
    expect(() => activityPlanCanonicalStructureHash({ version: 3 })).toThrow(
      "Only activity-plan structure version 5 is accepted",
    );
  });
  it("retains generic canonical hashing for non-activity persistence contracts", () => {
    expect(activityPlanStructureHash({ sessions: [], version: 1 })).toMatch(
      /^v1:sha256:[0-9a-f]{64}$/,
    );
  });
  it("invalidates semantic identity when execution-affecting aggregate content changes", () => {
    const baseline = {
      structure: activityPlanStructureSchema.parse(structure),
      trainingIntent: "aerobic_base",
    } satisfies Parameters<typeof activityPlanSemanticHash>[0];
    expect(activityPlanSemanticHash(baseline)).not.toBe(
      activityPlanSemanticHash({ ...baseline, trainingIntent: "threshold_development" }),
    );
  });
});
