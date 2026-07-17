import { describe, expect, it } from "vitest";
import { PlanExecution } from "./planExecution";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 3 as const,
  segments: [
    {
      id: id(1),
      role: "activity" as const,
      name: "Run",
      category: "run" as const,
      intervals: [
        {
          id: id(2),
          name: "Run repeats",
          repetitions: 2,
          steps: [
            {
              id: id(3),
              name: "Run",
              duration: { type: "distance" as const, meters: 100 },
              targets: [{ type: "RPE" as const, intensity: 4 }],
            },
          ],
        },
      ],
    },
    {
      id: id(4),
      role: "transition" as const,
      name: "Change",
      duration: { type: "time" as const, seconds: 30 },
    },
    {
      id: id(5),
      role: "activity" as const,
      name: "Bike",
      category: "bike" as const,
      intervals: [
        {
          id: id(6),
          name: "Bike",
          repetitions: 1,
          steps: [
            {
              id: id(7),
              name: "Ride",
              duration: { type: "untilFinished" as const },
              targets: [{ type: "%FTP" as const, intensity: 70 }],
            },
          ],
        },
      ],
    },
    {
      id: id(8),
      role: "rest" as const,
      name: "Rest",
      duration: { type: "time" as const, seconds: 60 },
    },
    {
      id: id(9),
      role: "activity" as const,
      name: "Run again",
      category: "run" as const,
      intervals: [
        {
          id: id(10),
          name: "Finish",
          repetitions: 1,
          steps: [
            {
              id: id(11),
              name: "Run",
              duration: { type: "time" as const, seconds: 20 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("PlanExecution V3", () => {
  it("uses Core occurrence identity/global order and preserves repeated categories", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Brick", structure });
    expect(
      execution.getAllSteps().map((item) => [item.globalOrdinal, item.role, item.category]),
    ).toEqual([
      [0, "activity", "run"],
      [1, "activity", "run"],
      [2, "transition", null],
      [3, "activity", "bike"],
      [4, "rest", null],
      [5, "activity", "run"],
    ]);
    expect(execution.getAllSteps()[0]?.occurrenceId).toContain(`${id(1)}:${id(2)}:0:${id(3)}`);
    expect(execution.getAllSteps()[1]?.occurrenceId).toContain(`${id(1)}:${id(2)}:1:${id(3)}`);
  });

  it("does not guess distance progression from elapsed time", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Brick", structure });
    execution.resetForRecordingStart(0, 50);
    expect(execution.getStepProgress(60_000, 50)?.progress).toBe(0);
    expect(execution.getStepProgress(60_000, 150)?.canAutoAdvance).toBe(true);
  });

  it("restores exact mid-distance and mid-time occurrence counters after process death", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Brick", structure });
    const distanceOccurrence = execution.getAllSteps()[0];
    if (!distanceOccurrence) throw new Error("missing distance occurrence");
    execution.restoreOccurrence(distanceOccurrence.occurrenceId, 20_000, 400);
    expect(execution.getStepProgress(35_000, 445)?.progress).toBe(0.45);

    const timeOccurrence = execution.getAllSteps()[5];
    if (!timeOccurrence) throw new Error("missing time occurrence");
    execution.restoreOccurrence(timeOccurrence.occurrenceId, 80_000, 900);
    expect(execution.getStepProgress(88_000, 940)?.progress).toBe(0.4);
  });

  it("allows manual occurrences and the final occurrence through user advance only", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Brick", structure });
    const manualOccurrence = execution.getAllSteps()[3];
    const finalOccurrence = execution.getAllSteps()[5];
    if (!manualOccurrence || !finalOccurrence) throw new Error("missing occurrence fixture");

    execution.restoreOccurrence(manualOccurrence.occurrenceId, 0, 0);
    expect(execution.getStepProgress(1_000, 0)).toMatchObject({
      requiresManualAdvance: true,
      canAutoAdvance: false,
      canManualAdvance: true,
    });
    expect(execution.advance(1_000, 0, "automatic")).toBe(false);
    expect(execution.advance(1_000, 0, "manual")).toBe(true);

    execution.restoreOccurrence(finalOccurrence.occurrenceId, 0, 0);
    expect(execution.advance(20_000, 0, "automatic")).toBe(true);
    expect(execution.isFinished()).toBe(true);
  });
});
