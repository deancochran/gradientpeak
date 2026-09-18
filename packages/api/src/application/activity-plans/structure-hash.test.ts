import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { activityPlanStructureHash, activityPlanV3StructureHash } from "./structure-hash";

const structure = {
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Run",
      role: "activity",
      intervals: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "Steady",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("activity-plan structure hashing", () => {
  it("uses the same canonical digest for a valid V3 structure", () => {
    expect(activityPlanV3StructureHash(structure)).toBe(activityPlanStructureHash(structure));
  });

  it("rejects non-V3 values at executable prescription boundaries", () => {
    expect(() => activityPlanV3StructureHash({ version: 2 })).toThrow(
      "Only activity-plan structure version 3 is accepted",
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
      adaptation: null,
      trainingIntent: "aerobic_base",
    } satisfies Parameters<typeof activityPlanSemanticHash>[0];
    expect(activityPlanSemanticHash(baseline)).not.toBe(
      activityPlanSemanticHash({ ...baseline, trainingIntent: "threshold_development" }),
    );
  });
});
