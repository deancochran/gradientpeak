import type { ActivityPlanActivitySegment } from "@repo/core";
import { describe, expect, it } from "vitest";
import { findActivitySegmentForInterval } from "./activityPlanSelection";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function segment(segmentId: string, intervalId: string): ActivityPlanActivitySegment {
  return {
    id: segmentId,
    role: "activity",
    name: segmentId,
    category: "run",
    intervals: [
      {
        id: intervalId,
        name: intervalId,
        repetitions: 1,
        steps: [
          {
            id: id(9),
            name: "Run",
            duration: { type: "time", seconds: 30 },
            targets: [{ type: "RPE", intensity: 4 }],
          },
        ],
      },
    ],
  };
}

describe("activity plan interval selection", () => {
  it("resolves an interval in a different authored activity segment", () => {
    const first = segment(id(1), id(2));
    const second = segment(id(3), id(4));

    expect(findActivitySegmentForInterval([first, second], id(4))?.id).toBe(id(3));
  });
});
