import { describe, expect, it } from "vitest";
import { compileRecordingPlan, createFreeRecordingExecutionPlan } from "./plan";
import { PlanExecution } from "./planExecution";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 3 as const,
  segments: [
    {
      id: id(1),
      role: "activity" as const,
      name: "Run",
      activity_category: "run" as const,
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
      id: id(5),
      role: "activity" as const,
      name: "Run steady",
      activity_category: "run" as const,
      intervals: [
        {
          id: id(6),
          name: "Run steady",
          repetitions: 1,
          steps: [
            {
              id: id(7),
              name: "Run steady",
              duration: { type: "untilFinished" as const },
              targets: [{ type: "RPE" as const, intensity: 5 }],
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
      activity_category: "run" as const,
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
  it("creates a stable, single-segment execution structure for a free recording", () => {
    const freeRun = createFreeRecordingExecutionPlan("run");
    const freeRunAgain = createFreeRecordingExecutionPlan("run");
    const compiled = compileRecordingPlan(freeRun);

    expect(freeRun).toEqual(freeRunAgain);
    expect(freeRun.id).toBeUndefined();
    expect(freeRun.structure).toMatchObject({
      version: 3,
      segments: [
        {
          role: "activity",
          activity_category: "run",
          intervals: [{ repetitions: 1, steps: [{ duration: { type: "untilFinished" } }] }],
        },
      ],
    });
    expect(compiled.occurrences).toHaveLength(1);
    expect(compiled.occurrences[0]).toMatchObject({
      globalOrdinal: 0,
      role: "activity",
      activity_category: "run",
    });
  });

  it("uses Core occurrence identity/global order for canonical same-activity_category segments", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    expect(
      execution
        .getAllSteps()
        .map((item) => [item.globalOrdinal, item.role, item.activity_category]),
    ).toEqual([
      [0, "activity", "run"],
      [1, "activity", "run"],
      [2, "activity", "run"],
      [3, "rest", null],
      [4, "activity", "run"],
    ]);
    expect(execution.getAllSteps()[0]?.occurrenceId).toContain(`${id(1)}:${id(2)}:0:${id(3)}`);
    expect(execution.getAllSteps()[1]?.occurrenceId).toContain(`${id(1)}:${id(2)}:1:${id(3)}`);
  });

  it("does not guess distance progression from elapsed time", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    execution.resetForRecordingStart(0, 50);
    expect(execution.getStepProgress(60_000, 50)?.progress).toBe(0);
    expect(execution.getStepProgress(60_000, 150)?.canAutoAdvance).toBe(true);
  });

  it("restores exact mid-distance and mid-time occurrence counters after process death", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    const distanceOccurrence = execution.getAllSteps()[0];
    if (!distanceOccurrence) throw new Error("missing distance occurrence");
    execution.restoreOccurrence(distanceOccurrence.occurrenceId, 20_000, 400);
    expect(execution.getStepProgress(35_000, 445)?.progress).toBe(0.45);

    const timeOccurrence = execution.getAllSteps()[4];
    if (!timeOccurrence) throw new Error("missing time occurrence");
    execution.restoreOccurrence(timeOccurrence.occurrenceId, 80_000, 900);
    expect(execution.getStepProgress(88_000, 940)?.progress).toBe(0.4);
  });

  it("allows manual occurrences and the final occurrence through user advance only", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    const manualOccurrence = execution.getAllSteps()[2];
    const finalOccurrence = execution.getAllSteps()[4];
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
