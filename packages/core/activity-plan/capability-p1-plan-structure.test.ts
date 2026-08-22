import { describe, expect, it } from "vitest";
import { compileActivityPlan } from "./compile";
import { activityPlanStructureSchema } from "./structure-schema";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

describe("activity-plan.edit-structured-steps", () => {
  it("accepts a corrected structured step and preserves its authored order", () => {
    const structure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        {
          id: uuid(1),
          role: "activity" as const,
          name: "Run",
          intervals: [
            {
              id: uuid(2),
              name: "Main set",
              repetitions: 1,
              steps: [
                {
                  id: uuid(3),
                  name: "Controlled threshold",
                  duration: { type: "time" as const, seconds: 900 },
                  targets: [{ type: "RPE" as const, intensity: 7 }],
                },
                {
                  id: uuid(4),
                  name: "Easy recovery",
                  duration: { type: "time" as const, seconds: 300 },
                  targets: [{ type: "RPE" as const, intensity: 3 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = activityPlanStructureSchema.parse(structure);
    const compiled = compileActivityPlan(parsed);

    expect(parsed.segments[0]?.intervals[0]?.steps.map((step) => step.name)).toEqual([
      "Controlled threshold",
      "Easy recovery",
    ]);
    expect(compiled.occurrences.map((occurrence) => occurrence.duration)).toEqual([
      { type: "time", seconds: 900 },
      { type: "time", seconds: 300 },
    ]);
  });
});
