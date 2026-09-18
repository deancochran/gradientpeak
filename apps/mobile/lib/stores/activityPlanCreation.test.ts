import type { ActivityPlanActivitySegment } from "@repo/core";
import { activityPlanAuthoringStructureSchema } from "@repo/core/activity-plan";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cryptoMock = vi.hoisted(() => ({ next: 100 }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++cryptoMock.next).padStart(12, "0")}`,
}));

import {
  createMinimalActivityPlanStructure,
  useActivityPlanCreationStore,
} from "./activityPlanCreation";

const activity = (id: string) => ({
  id,
  role: "activity" as const,
  name: id,
  intervals: [],
});
const rest = {
  id: "rest",
  role: "rest" as const,
  name: "Rest",
  duration: { type: "time" as const, seconds: 60 },
};

function firstActivitySegment() {
  const segment = useActivityPlanCreationStore
    .getState()
    .structure.segments.find(
      (item): item is ActivityPlanActivitySegment => item.role === "activity",
    );
  if (!segment) throw new Error("Expected an activity segment");
  return segment;
}

describe("activityPlanCreation segment boundary", () => {
  it("creates a usable activity plan step instead of an unexplained empty structure", () => {
    const structure = createMinimalActivityPlanStructure();

    expect(structure.segments[0]).toMatchObject({
      role: "activity",
      intervals: [
        { repetitions: 1, steps: [{ purpose: "work", duration: { type: "time", seconds: 300 } }] },
      ],
    });
    expect(activityPlanAuthoringStructureSchema.safeParse(structure).success).toBe(true);
  });

  beforeEach(() => {
    cryptoMock.next = 100;
    useActivityPlanCreationStore.setState({
      activityCategory: "run",
      structure: {
        version: 3,
        activity_category: "run",
        segments: [activity("run-1")],
      },
    });
  });

  it("changes the single root activity_category without rewriting segments", () => {
    const store = useActivityPlanCreationStore.getState();
    store.setActivityCategory("bike");
    expect(useActivityPlanCreationStore.getState().structure).toEqual({
      version: 3,
      activity_category: "bike",
      segments: [activity("run-1")],
    });
  });

  it("accepts same-activity_category activities and rest segments", () => {
    const store = useActivityPlanCreationStore.getState();
    store.addSegment(rest);
    store.addSegment(activity("run-2"));
    expect(
      useActivityPlanCreationStore.getState().structure.segments.map((segment) => segment.id),
    ).toEqual(["run-1", "rest", "run-2"]);
  });

  it("reorders segments without segment-level category checks", () => {
    const store = useActivityPlanCreationStore.getState();
    store.setSegments([activity("run-1"), rest]);
    store.reorderSegments([rest, activity("run-1")]);
    expect(
      useActivityPlanCreationStore.getState().structure.segments.map((segment) => segment.id),
    ).toEqual(["rest", "run-1"]);
    store.reorderSegments([activity("bike-1"), rest]);
    expect(
      useActivityPlanCreationStore.getState().structure.segments.map((segment) => segment.id),
    ).toEqual(["bike-1", "rest"]);
  });

  it("reorders an activity's interval references without modifying their contents", () => {
    const first = {
      id: "00000000-0000-4000-8000-000000000010",
      name: "First",
      repetitions: 1,
      steps: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          name: "First step",
          duration: { type: "time" as const, seconds: 60 },
          targets: [{ type: "RPE" as const, intensity: 4 }],
        },
      ],
    };
    const second = {
      id: "00000000-0000-4000-8000-000000000012",
      name: "Second",
      repetitions: 3,
      steps: [
        {
          id: "00000000-0000-4000-8000-000000000013",
          name: "Second step",
          duration: { type: "distance" as const, meters: 400 },
          targets: [{ type: "RPE" as const, intensity: 8 }],
        },
      ],
    };
    useActivityPlanCreationStore
      .getState()
      .setSegments([{ ...activity("run-1"), intervals: [first, second] }]);

    useActivityPlanCreationStore.getState().reorderIntervals([second, first], "run-1");

    expect(firstActivitySegment().intervals).toEqual([second, first]);
    expect(firstActivitySegment().intervals[0]).toBe(second);
    expect(firstActivitySegment().intervals[1]).toBe(first);
  });

  it("duplicates an interval beside its source with independent step targets", () => {
    const source = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Main",
      repetitions: 2,
      notes: "Keep form.",
      steps: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Steady",
          duration: { type: "time" as const, seconds: 300 },
          notes: "Smooth.",
          targets: [{ type: "RPE" as const, intensity: 5 }],
        },
      ],
    };
    useActivityPlanCreationStore
      .getState()
      .setSegments([{ ...activity("run-1"), intervals: [source] }]);

    expect(useActivityPlanCreationStore.getState().copyInterval(source.id)).toEqual({
      success: true,
    });

    const intervals = firstActivitySegment().intervals;
    expect(intervals).toHaveLength(2);
    const copied = intervals[1];
    const copiedStep = copied?.steps[0];
    const sourceStep = source.steps[0];
    if (!copied || !copiedStep || !sourceStep) throw new Error("Expected source and copied steps");
    expect(copied).toMatchObject({
      name: "Main (Copy)",
      notes: "Keep form.",
      repetitions: 2,
    });
    expect(copied.id).not.toBe(source.id);
    expect(copiedStep).toMatchObject({
      name: "Steady (Copy)",
      notes: "Smooth.",
      duration: sourceStep.duration,
    });
    expect(copiedStep.id).not.toBe(sourceStep.id);
    expect(copiedStep.targets).not.toBe(sourceStep.targets);
    expect(copiedStep.targets[0]).not.toBe(sourceStep.targets[0]);
  });

  it("duplicates a step beside its source and refuses the existing step limit", () => {
    const steps = Array.from({ length: 19 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Step ${index + 1}`,
      duration: { type: "time" as const, seconds: 60 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    }));
    const interval = {
      id: "00000000-0000-4000-8000-000000000050",
      name: "Main",
      repetitions: 1,
      steps,
    };
    useActivityPlanCreationStore
      .getState()
      .setSegments([{ ...activity("run-1"), intervals: [interval] }]);

    const firstStep = steps[0];
    if (!firstStep) throw new Error("Expected a source step");
    expect(
      useActivityPlanCreationStore.getState().copyStepInInterval(interval.id, firstStep.id),
    ).toEqual({ success: true });
    const copiedSteps = firstActivitySegment().intervals[0]?.steps;
    if (!copiedSteps) throw new Error("Expected copied interval steps");
    expect(copiedSteps).toHaveLength(20);
    const copiedStep = copiedSteps[1];
    if (!copiedStep) throw new Error("Expected a copied step");
    expect(copiedStep.id).not.toBe(firstStep.id);
    expect(copiedStep.targets).not.toBe(firstStep.targets);
    expect(
      useActivityPlanCreationStore.getState().copyStepInInterval(interval.id, firstStep.id),
    ).toEqual({
      success: false,
      error: "An interval can contain at most 20 steps.",
    });
  });

  it("refuses interval copies at the interval and expanded-occurrence limits", () => {
    const step = (id: number) => ({
      id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      name: "Step",
      duration: { type: "time" as const, seconds: 60 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    });
    const intervals = Array.from({ length: 50 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
      name: `Interval ${index + 1}`,
      repetitions: 1,
      steps: [step(index + 300)],
    }));
    useActivityPlanCreationStore.getState().setSegments([{ ...activity("run-1"), intervals }]);

    expect(useActivityPlanCreationStore.getState().copyInterval(intervals[0]!.id)).toEqual({
      success: false,
      error: "An activity can contain at most 50 intervals.",
    });

    const nearlyExpanded = {
      id: "00000000-0000-4000-8000-000000000500",
      name: "Nearly full",
      repetitions: 50,
      steps: Array.from({ length: 19 }, (_, index) => step(index + 600)),
    };
    const finalInterval = {
      id: "00000000-0000-4000-8000-000000000501",
      name: "Final",
      repetitions: 50,
      steps: [step(700)],
    };
    useActivityPlanCreationStore
      .getState()
      .setSegments([{ ...activity("run-1"), intervals: [nearlyExpanded, finalInterval] }]);

    expect(useActivityPlanCreationStore.getState().copyInterval(finalInterval.id)).toEqual({
      success: false,
      error: "A plan cannot exceed 1000 expanded step occurrences.",
    });
  });
});
