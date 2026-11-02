import { describe, expect, it } from "vitest";
import { compileRecordingPlan, createFreeRecordingExecutionPlan } from "./plan";
import { PlanExecution } from "./planExecution";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "repeat",
      id: id(1),
      count: 2,
      steps: [
        {
          type: "step",
          name: "Run repeats",
          id: id(3),
          duration: { type: "distance" as const, meters: 100 },
          targets: [{ type: "RPE" as const, intensity: 4 }],
        },
      ],
    },
    {
      type: "step",
      name: "Run steady",
      id: id(7),
      duration: { type: "untilFinished" as const },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    },
    {
      type: "step",
      id: id(11),
      name: "Finish",
      duration: { type: "time" as const, seconds: 20 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    },
  ],
};
describe("PlanExecution", () => {
  it("creates a stable, standalone execution structure for a free recording", () => {
    const freeRun = createFreeRecordingExecutionPlan("run");
    const freeRunAgain = createFreeRecordingExecutionPlan("run");
    const compiled = compileRecordingPlan(freeRun);
    expect(freeRun).toEqual(freeRunAgain);
    expect(freeRun.id).toBeUndefined();
    expect(freeRun.structure).toMatchObject({
      version: 5,
      activity_category: "run",
      items: [{ type: "step", id: id(3), duration: { type: "untilFinished" } }],
    });
    expect(compiled.occurrences).toHaveLength(1);
    expect(compiled.occurrences[0]).toMatchObject({
      globalOrdinal: 0,
      role: "activity",
      activity_category: "run",
    });
  });
  it("uses Core occurrence identity/global order for canonical blocks", () => {
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
      [3, "activity", "run"],
    ]);
    expect(execution.getAllSteps()[0]?.occurrenceId).toBe(
      `activity:repeat:${id(1)}:0:step:${id(3)}`,
    );
    expect(execution.getAllSteps()[1]?.occurrenceId).toBe(
      `activity:repeat:${id(1)}:1:step:${id(3)}`,
    );
  });
  it("does not guess distance progression from elapsed time", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    execution.resetForRecordingStart(0, 50);
    expect(execution.getStepProgress(60000, 50)?.progress).toBe(0);
    expect(execution.getStepProgress(60000, 150)?.canAutoAdvance).toBe(true);
  });
  it("restores exact mid-distance and mid-time occurrence counters after process death", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    const distanceOccurrence = execution.getAllSteps()[0];
    if (!distanceOccurrence) throw new Error("missing distance occurrence");
    execution.restoreOccurrence(distanceOccurrence.occurrenceId, 20000, 400);
    expect(execution.getStepProgress(35000, 445)?.progress).toBe(0.45);
    const timeOccurrence = execution.getAllSteps()[3];
    if (!timeOccurrence) throw new Error("missing time occurrence");
    execution.restoreOccurrence(timeOccurrence.occurrenceId, 80000, 900);
    expect(execution.getStepProgress(88000, 940)?.progress).toBe(0.4);
  });
  it("allows manual occurrences and the final occurrence through user advance only", () => {
    const execution = new PlanExecution();
    execution.loadPlan({ name: "Run plan", structure });
    const manualOccurrence = execution.getAllSteps()[2];
    const finalOccurrence = execution.getAllSteps()[3];
    if (!manualOccurrence || !finalOccurrence) throw new Error("missing occurrence fixture");
    execution.restoreOccurrence(manualOccurrence.occurrenceId, 0, 0);
    expect(execution.getStepProgress(1000, 0)).toMatchObject({
      requiresManualAdvance: true,
      canAutoAdvance: false,
      canManualAdvance: true,
    });
    expect(execution.advance(1000, 0, "automatic")).toBe(false);
    expect(execution.advance(1000, 0, "manual")).toBe(true);
    execution.restoreOccurrence(finalOccurrence.occurrenceId, 0, 0);
    expect(execution.advance(20000, 0, "automatic")).toBe(true);
    expect(execution.isFinished()).toBe(true);
  });
});
