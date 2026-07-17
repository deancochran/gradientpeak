import { describe, expect, it } from "vitest";

import { compileActivityPlanV3 } from "../compile";
import { type ActivityPlanActivitySegment, activityPlanStructureSchemaV3 } from "../v3-schema";
import {
  ACTIVITY_PLAN_V3_LIMITS,
  isActivityPlanEncodedByteLengthWithinLimit,
} from "../v3-validation";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const activitySegment = (input: {
  id: number;
  category: "run" | "bike" | "swim";
  intervalId: number;
  stepId: number;
  repetitions?: number;
  seconds?: number;
}): ActivityPlanActivitySegment => ({
  id: id(input.id),
  role: "activity" as const,
  category: input.category,
  name: input.category,
  intervals: [
    {
      id: id(input.intervalId),
      name: "Work",
      repetitions: input.repetitions ?? 1,
      steps: [
        {
          id: id(input.stepId),
          name: "Step",
          duration: { type: "time" as const, seconds: input.seconds ?? 60 },
          targets: [{ type: "RPE" as const, intensity: 5 }],
        },
      ],
    },
  ],
});

describe("activity plan V3", () => {
  it("accepts arbitrary order and repeated categories with valid transitions and rests", () => {
    const structure = {
      version: 3 as const,
      segments: [
        {
          id: id(1),
          role: "rest" as const,
          name: "Prepare",
          duration: { type: "time" as const, seconds: 30 },
        },
        activitySegment({ id: 2, category: "run", intervalId: 3, stepId: 4 }),
        {
          id: id(5),
          role: "transition" as const,
          name: "T1",
          duration: { type: "time" as const, seconds: 90 },
        },
        activitySegment({ id: 6, category: "bike", intervalId: 7, stepId: 8 }),
        {
          id: id(9),
          role: "rest" as const,
          name: "Reset",
          duration: { type: "time" as const, seconds: 20 },
        },
        activitySegment({ id: 10, category: "run", intervalId: 11, stepId: 12 }),
      ],
    };

    expect(activityPlanStructureSchemaV3.parse(structure)).toEqual(structure);
  });

  it("rejects transition grammar, consecutive rests, and missing activity", () => {
    const result = activityPlanStructureSchemaV3.safeParse({
      version: 3,
      segments: [
        { id: id(1), role: "transition", name: "Bad", duration: { type: "time", seconds: 1 } },
        { id: id(2), role: "rest", name: "Rest", duration: { type: "time", seconds: 1 } },
        { id: id(3), role: "rest", name: "Rest", duration: { type: "time", seconds: 1 } },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("ACTIVITY_PLAN_TRANSITION_GRAMMAR");
      expect(messages).toContain("ACTIVITY_PLAN_CONSECUTIVE_RESTS");
      expect(messages).toContain("ACTIVITY_PLAN_MISSING_ACTIVITY");
    }
  });

  it("rejects unknown fields instead of stripping them", () => {
    const segment = activitySegment({ id: 1, category: "run", intervalId: 2, stepId: 3 });
    expect(
      activityPlanStructureSchemaV3.safeParse({ version: 3, segments: [segment], unknown: true })
        .success,
    ).toBe(false);
    expect(
      activityPlanStructureSchemaV3.safeParse({
        version: 3,
        segments: [{ ...segment, unknown: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects non-V3 input with an explicit version issue", () => {
    const result = activityPlanStructureSchemaV3.safeParse({ version: 2, segments: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("ACTIVITY_PLAN_UNSUPPORTED_VERSION");
    }
  });

  it("enforces global UUID identity and expanded occurrence bounds", () => {
    const segment = activitySegment({
      id: 1,
      category: "run",
      intervalId: 2,
      stepId: 1,
      repetitions: 50,
    });
    const interval = segment.intervals[0];
    if (!interval) throw new Error("Fixture requires an interval.");
    interval.steps = Array.from({ length: 20 }, (_, index) => ({
      id: id(index === 0 ? 1 : index + 10),
      name: "Step",
      duration: { type: "time" as const, seconds: 1 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    }));
    segment.intervals.push({ ...interval, id: id(100) });

    const result = activityPlanStructureSchemaV3.safeParse({ version: 3, segments: [segment] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("ACTIVITY_PLAN_DUPLICATE_ID");
      expect(messages).toContain("ACTIVITY_PLAN_EXPANDED_OCCURRENCES_EXCEEDED");
    }
  });

  it("enforces the seven-day explicit timed-duration budget", () => {
    const segment = activitySegment({
      id: 1,
      category: "run",
      intervalId: 2,
      stepId: 3,
      repetitions: 8,
      seconds: 24 * 60 * 60,
    });
    const result = activityPlanStructureSchemaV3.safeParse({ version: 3, segments: [segment] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("TIMED_BUDGET"))).toBe(
        true,
      );
    }
  });

  it("accepts exact segment, occurrence, and timed-budget boundaries", () => {
    let nextId = 1;
    const segments = Array.from({ length: 64 }, () =>
      activitySegment({
        id: nextId++,
        category: "run",
        intervalId: nextId++,
        stepId: nextId++,
      }),
    );
    expect(activityPlanStructureSchemaV3.safeParse({ version: 3, segments }).success).toBe(true);
    expect(
      activityPlanStructureSchemaV3.safeParse({
        version: 3,
        segments: [
          ...segments,
          activitySegment({
            id: nextId++,
            category: "run",
            intervalId: nextId++,
            stepId: nextId++,
          }),
        ],
      }).success,
    ).toBe(false);

    const occurrenceSegment = activitySegment({
      id: 500,
      category: "run",
      intervalId: 501,
      stepId: 502,
    });
    const interval = occurrenceSegment.intervals[0];
    if (!interval) throw new Error("Fixture requires an interval.");
    interval.repetitions = 50;
    interval.steps = Array.from({ length: 20 }, (_, index) => ({
      id: id(600 + index),
      name: "Step",
      duration: { type: "distance" as const, meters: 1 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    }));
    expect(
      activityPlanStructureSchemaV3.safeParse({ version: 3, segments: [occurrenceSegment] })
        .success,
    ).toBe(true);

    const timed = activitySegment({
      id: 700,
      category: "run",
      intervalId: 701,
      stepId: 702,
      repetitions: 7,
      seconds: 24 * 60 * 60,
    });
    expect(activityPlanStructureSchemaV3.safeParse({ version: 3, segments: [timed] }).success).toBe(
      true,
    );
  });

  it("enforces the encoded persistence payload bound", () => {
    let nextId = 2;
    const segment = activitySegment({
      id: 1,
      category: "run",
      intervalId: nextId++,
      stepId: nextId++,
    });
    segment.intervals = Array.from({ length: 50 }, () => ({
      id: id(nextId++),
      name: "I".repeat(100),
      repetitions: 1,
      notes: "n".repeat(1_000),
      steps: Array.from({ length: 20 }, () => ({
        id: id(nextId++),
        name: "S".repeat(100),
        description: "d".repeat(500),
        notes: "n".repeat(1_000),
        duration: { type: "distance" as const, meters: 1 },
        targets: [{ type: "RPE" as const, intensity: 5 }],
      })),
    }));

    const result = activityPlanStructureSchemaV3.safeParse({ version: 3, segments: [segment] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("PAYLOAD_TOO_LARGE"))).toBe(
        true,
      );
    }
  });

  it("accepts exactly 1 MiB encoded payload length and rejects one byte over", () => {
    expect(
      isActivityPlanEncodedByteLengthWithinLimit(ACTIVITY_PLAN_V3_LIMITS.maxEncodedJsonBytes),
    ).toBe(true);
    expect(
      isActivityPlanEncodedByteLengthWithinLimit(ACTIVITY_PLAN_V3_LIMITS.maxEncodedJsonBytes + 1),
    ).toBe(false);
  });

  it("compiles deterministic, stable occurrences and derived category summaries", () => {
    const structure = {
      version: 3 as const,
      segments: [
        activitySegment({ id: 1, category: "run", intervalId: 2, stepId: 3, repetitions: 2 }),
        {
          id: id(4),
          role: "transition" as const,
          name: "T1",
          duration: { type: "time" as const, seconds: 30 },
        },
        activitySegment({ id: 5, category: "bike", intervalId: 6, stepId: 7 }),
        {
          id: id(8),
          role: "rest" as const,
          name: "Rest",
          duration: { type: "time" as const, seconds: 15 },
        },
        activitySegment({ id: 9, category: "run", intervalId: 10, stepId: 11 }),
      ],
    };

    const first = compileActivityPlanV3(structure);
    const second = compileActivityPlanV3(structure);

    expect(first).toEqual(second);
    expect(first.primaryCategory).toBe("run");
    expect(first.categories).toEqual(["run", "bike"]);
    expect(first.occurrences.map((occurrence) => occurrence.globalOrdinal)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(first.occurrences[0]?.occurrenceId).toBe(`activity:${id(1)}:${id(2)}:0:${id(3)}`);
    expect(first.occurrences[1]?.occurrenceId).toBe(`activity:${id(1)}:${id(2)}:1:${id(3)}`);
    expect(first.occurrences[2]?.occurrenceId).toBe(`boundary:${id(4)}`);
    expect(first.explicitTimedDurationSeconds).toBe(60 * 2 + 30 + 60 + 15 + 60);
  });

  it("requires targets and preserves open/manual completion", () => {
    const segment = activitySegment({ id: 1, category: "run", intervalId: 2, stepId: 3 });
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Fixture requires a step.");
    const withoutTargets = { ...step } as Record<string, unknown>;
    delete withoutTargets.targets;
    expect(
      activityPlanStructureSchemaV3.safeParse({
        version: 3,
        segments: [
          { ...segment, intervals: [{ ...segment.intervals[0], steps: [withoutTargets] }] },
        ],
      }).success,
    ).toBe(false);
    const openPlan = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        {
          ...segment,
          intervals: [
            {
              ...segment.intervals[0],
              steps: [{ ...step, duration: { type: "untilFinished" } }],
            },
          ],
        },
      ],
    });
    const compiled = compileActivityPlanV3(openPlan);
    expect(compiled.occurrences[0]).toMatchObject({
      completionPolicy: "untilFinished",
      duration: { type: "untilFinished" },
    });
    expect(compiled.explicitTimedDurationSeconds).toBe(0);
  });

  it("uses the existing category capability policy for targets", () => {
    const segment = activitySegment({ id: 1, category: "run", intervalId: 2, stepId: 3 });
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Fixture requires a step.");
    const result = activityPlanStructureSchemaV3.safeParse({
      version: 3,
      segments: [
        {
          ...segment,
          intervals: [
            {
              ...segment.intervals[0],
              steps: [{ ...step, targets: [{ type: "watts", intensity: 200 }] }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes("INCOMPATIBLE_TARGET")),
      ).toBe(true);
    }
  });
});
