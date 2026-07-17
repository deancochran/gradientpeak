import { describe, expect, it } from "vitest";

import {
  describeActivityPlanSegments,
  describeTrainingPlanSessions,
  summarizeActivityPlanSegments,
} from "./activity-plan-presentation";

describe("activity plan presentation", () => {
  const structure = {
    version: 3,
    segments: [
      { id: "s1", role: "activity", category: "run" },
      { id: "t1", role: "transition", duration: { type: "time", seconds: 300 } },
      { id: "s2", role: "activity", category: "bike" },
      { id: "r1", role: "rest", duration: { type: "time", seconds: 120 } },
      { id: "s3", role: "activity", category: "run" },
    ],
  };

  it("renders ordered V3 segments with repeated categories and boundaries", () => {
    expect(summarizeActivityPlanSegments(structure).map((segment) => segment.label)).toEqual([
      "Run",
      "Transition · 5 min",
      "Bike",
      "Rest · 2 min",
      "Run",
    ]);
    expect(describeActivityPlanSegments(structure)).toBe(
      "Run → Transition · 5 min → Bike → Rest · 2 min → Run",
    );
  });

  it("summarizes canonical training plan sessions", () => {
    expect(describeTrainingPlanSessions({ sessions: [{}, {}] })).toBe("2 sessions");
    expect(describeTrainingPlanSessions({ phases: [] })).toBe("No sessions specified");
  });
});
