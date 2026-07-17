import { describe, expect, it } from "vitest";

import { compileActivityPlanV3 } from "../compile";
import { convertV2FixtureToV3 } from "./migration-fixtures/v2-to-v3-fixture";

const segmentId = "00000000-0000-4000-8000-000000000001";
const intervalId = "00000000-0000-4000-8000-000000000002";
const stepId = "00000000-0000-4000-8000-000000000003";

describe("migration-only V2 fixture proof", () => {
  it("wraps one single-sport fixture without changing interval/step semantics", () => {
    const v2 = {
      version: 2,
      intervals: [
        {
          id: intervalId,
          name: "Tempo",
          repetitions: 2,
          steps: [
            {
              id: stepId,
              name: "Work",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "speed", intensity: 12 }],
            },
          ],
        },
      ],
    };

    const converted = convertV2FixtureToV3({ category: "run", segmentId, structure: v2 });
    expect(converted.segments[0]).toMatchObject({
      id: segmentId,
      role: "activity",
      category: "run",
      intervals: v2.intervals,
    });
    expect(compileActivityPlanV3(converted).occurrences).toHaveLength(2);
  });

  it("preserves an exact V2 open/manual completion duration", () => {
    const converted = convertV2FixtureToV3({
      category: "other",
      segmentId,
      structure: {
        version: 2,
        intervals: [
          {
            id: intervalId,
            name: "Open",
            repetitions: 1,
            steps: [
              {
                id: stepId,
                name: "Continue until done",
                duration: { type: "untilFinished" },
                targets: [{ type: "RPE", intensity: 4 }],
              },
            ],
          },
        ],
      },
    });

    const activity = converted.segments[0];
    expect(activity?.role).toBe("activity");
    if (activity?.role !== "activity") throw new Error("Fixture requires an activity segment.");
    expect(activity.intervals[0]?.steps[0]?.duration).toEqual({ type: "untilFinished" });
    expect(compileActivityPlanV3(converted).occurrences[0]).toMatchObject({
      completionPolicy: "untilFinished",
      duration: { type: "untilFinished" },
    });
  });
});
