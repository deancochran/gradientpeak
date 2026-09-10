import { describe, expect, it } from "vitest";

import { compileActivityPlan } from "../compile";
import {
  type ActivityPlanActivitySegment,
  activityPlanStructureSchema,
  validateActivityPlanStructure,
} from "../structure-schema";
import {
  ACTIVITY_PLAN_LIMITS,
  isActivityPlanEncodedByteLengthWithinLimit,
} from "../structure-validation";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const activitySegment = (input: {
  id: number;
  activity_category: "run" | "bike" | "swim";
  intervalId: number;
  stepId: number;
  repetitions?: number;
  seconds?: number;
}): ActivityPlanActivitySegment => ({
  id: id(input.id),
  role: "activity" as const,
  name: input.activity_category,
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

describe("activity plan structure", () => {
  it("accepts repeated same-category activity segments and rests", () => {
    const structure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        {
          id: id(1),
          role: "rest" as const,
          name: "Prepare",
          duration: { type: "time" as const, seconds: 30 },
        },
        activitySegment({ id: 2, activity_category: "run", intervalId: 3, stepId: 4 }),
        activitySegment({ id: 6, activity_category: "run", intervalId: 7, stepId: 8 }),
        {
          id: id(9),
          role: "rest" as const,
          name: "Reset",
          duration: { type: "time" as const, seconds: 20 },
        },
        activitySegment({ id: 10, activity_category: "run", intervalId: 11, stepId: 12 }),
      ],
    };

    expect(activityPlanStructureSchema.parse(structure)).toEqual(structure);
  });

  it("requires persisted step names and interval repetitions during strict parsing and preflight", () => {
    const validStructure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        activitySegment({
          id: 1,
          activity_category: "run",
          intervalId: 2,
          stepId: 3,
          repetitions: 2,
        }),
        activitySegment({
          id: 4,
          activity_category: "run",
          intervalId: 5,
          stepId: 6,
          repetitions: 1,
        }),
      ],
    };
    expect(activityPlanStructureSchema.parse(validStructure)).toEqual(validStructure);
    expect(validateActivityPlanStructure(validStructure).success).toBe(true);

    const withoutStepName = structuredClone(validStructure);
    Reflect.deleteProperty(withoutStepName.segments[0]!.intervals[0]!.steps[0]!, "name");
    const withoutIntervalRepetitions = structuredClone(validStructure);
    Reflect.deleteProperty(withoutIntervalRepetitions.segments[0]!.intervals[0]!, "repetitions");

    for (const invalidStructure of [withoutStepName, withoutIntervalRepetitions]) {
      expect(activityPlanStructureSchema.safeParse(invalidStructure).success).toBe(false);
      expect(validateActivityPlanStructure(invalidStructure).success).toBe(false);
    }
  });

  it("permits one objective target with supporting targets, but rejects conflicting objectives and duplicates", () => {
    const validStructure = {
      version: 3 as const,
      activity_category: "bike" as const,
      segments: [activitySegment({ id: 1, activity_category: "bike", intervalId: 2, stepId: 3 })],
    };
    const step = validStructure.segments[0]?.intervals[0]?.steps[0];
    if (!step) throw new Error("Fixture requires a step.");

    step.targets = [
      { type: "%FTP", intensity: 80 },
      { type: "cadence", intensity: 90 },
      { type: "RPE", intensity: 6 },
    ];
    expect(activityPlanStructureSchema.safeParse(validStructure).success).toBe(true);

    const conflictingObjectives = structuredClone(validStructure);
    conflictingObjectives.segments[0]!.intervals[0]!.steps[0]!.targets = [
      { type: "%FTP", intensity: 80 },
      { type: "%ThresholdHR", intensity: 90 },
    ];
    const conflictingResult = activityPlanStructureSchema.safeParse(conflictingObjectives);
    expect(conflictingResult.success).toBe(false);
    if (!conflictingResult.success) {
      expect(conflictingResult.error.issues.map((issue) => issue.message).join(" ")).toContain(
        "ACTIVITY_PLAN_MULTIPLE_OBJECTIVE_TARGETS",
      );
    }

    const duplicateTarget = structuredClone(validStructure);
    duplicateTarget.segments[0]!.intervals[0]!.steps[0]!.targets = [
      { type: "%FTP", intensity: 80 },
      { type: "%FTP", intensity: 85 },
    ];
    const duplicateResult = activityPlanStructureSchema.safeParse(duplicateTarget);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(duplicateResult.error.issues.map((issue) => issue.message).join(" ")).toContain(
        "ACTIVITY_PLAN_DUPLICATE_TARGET",
      );
    }
  });

  it("rejects top-level transitions, segment categories, consecutive rests, and missing activity", () => {
    const result = activityPlanStructureSchema.safeParse({
      version: 3,
      activity_category: "run",
      segments: [
        { id: id(1), role: "rest", name: "Rest", duration: { type: "time", seconds: 1 } },
        { id: id(2), role: "rest", name: "Rest", duration: { type: "time", seconds: 1 } },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("ACTIVITY_PLAN_CONSECUTIVE_RESTS");
      expect(messages).toContain("ACTIVITY_PLAN_MISSING_ACTIVITY");
    }
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [
          {
            ...activitySegment({ id: 10, activity_category: "run", intervalId: 11, stepId: 12 }),
            activity_category: "run",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [
          activitySegment({ id: 20, activity_category: "run", intervalId: 21, stepId: 22 }),
          { id: id(23), role: "transition", name: "Bad", duration: { type: "time", seconds: 1 } },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields instead of stripping them", () => {
    const segment = activitySegment({ id: 1, activity_category: "run", intervalId: 2, stepId: 3 });
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [segment],
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [{ ...segment, unknown: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects non-current input with an explicit version issue", () => {
    const result = activityPlanStructureSchema.safeParse({ version: 2, segments: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("ACTIVITY_PLAN_UNSUPPORTED_VERSION");
    }
  });

  it("enforces global UUID identity and expanded occurrence bounds", () => {
    const segment = activitySegment({
      id: 1,
      activity_category: "run",
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

    const result = activityPlanStructureSchema.safeParse({
      version: 3,
      activity_category: "run",
      segments: [segment],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(" ");
      expect(messages).toContain("ACTIVITY_PLAN_DUPLICATE_ID");
      expect(messages).toContain("ACTIVITY_PLAN_EXPANDED_OCCURRENCES_EXCEEDED");
    }
  });

  it("rejects nil UUID identities at every authored level", () => {
    const segment = activitySegment({
      id: 1,
      activity_category: "run",
      intervalId: 2,
      stepId: 3,
    });
    const nilId = "00000000-0000-0000-0000-000000000000";
    const interval = segment.intervals[0];
    const step = interval?.steps[0];
    if (!interval || !step) throw new Error("Fixture requires an interval step.");
    const candidates = [
      { ...segment, id: nilId },
      { ...segment, intervals: [{ ...interval, id: nilId }] },
      {
        ...segment,
        intervals: [
          {
            ...interval,
            steps: [{ ...step, id: nilId }],
          },
        ],
      },
    ];

    for (const candidate of candidates) {
      expect(
        activityPlanStructureSchema.safeParse({
          version: 3,
          activity_category: "run",
          segments: [candidate],
        }).success,
      ).toBe(false);
    }
  });

  it("counts authored string bounds by Unicode code point", () => {
    const segment = activitySegment({
      id: 1,
      activity_category: "run",
      intervalId: 2,
      stepId: 3,
    });
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [{ ...segment, name: "😀".repeat(100) }],
      }).success,
    ).toBe(true);
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [{ ...segment, name: "😀".repeat(101) }],
      }).success,
    ).toBe(false);
  });

  it("enforces the seven-day explicit timed-duration budget", () => {
    const segment = activitySegment({
      id: 1,
      activity_category: "run",
      intervalId: 2,
      stepId: 3,
      repetitions: 8,
      seconds: 24 * 60 * 60,
    });
    const result = activityPlanStructureSchema.safeParse({
      version: 3,
      activity_category: "run",
      segments: [segment],
    });
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
        activity_category: "run",
        intervalId: nextId++,
        stepId: nextId++,
      }),
    );
    expect(
      activityPlanStructureSchema.safeParse({ version: 3, activity_category: "run", segments })
        .success,
    ).toBe(true);
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [
          ...segments,
          activitySegment({
            id: nextId++,
            activity_category: "run",
            intervalId: nextId++,
            stepId: nextId++,
          }),
        ],
      }).success,
    ).toBe(false);

    const occurrenceSegment = activitySegment({
      id: 500,
      activity_category: "run",
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
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [occurrenceSegment],
      }).success,
    ).toBe(true);

    const timed = activitySegment({
      id: 700,
      activity_category: "run",
      intervalId: 701,
      stepId: 702,
      repetitions: 7,
      seconds: 24 * 60 * 60,
    });
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [timed],
      }).success,
    ).toBe(true);
  });

  it("enforces the encoded persistence payload bound", () => {
    let nextId = 2;
    const segment = activitySegment({
      id: 1,
      activity_category: "run",
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

    const result = activityPlanStructureSchema.safeParse({
      version: 3,
      activity_category: "run",
      segments: [segment],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("PAYLOAD_TOO_LARGE"))).toBe(
        true,
      );
    }
  });

  it("accepts exactly 1 MiB encoded payload length and rejects one byte over", () => {
    expect(
      isActivityPlanEncodedByteLengthWithinLimit(ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes),
    ).toBe(true);
    expect(
      isActivityPlanEncodedByteLengthWithinLimit(ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes + 1),
    ).toBe(false);
  });

  it("compiles deterministic, stable occurrences for repeated single-activity-category segments", () => {
    const structure = {
      version: 3 as const,
      activity_category: "run" as const,
      segments: [
        activitySegment({
          id: 1,
          activity_category: "run",
          intervalId: 2,
          stepId: 3,
          repetitions: 2,
        }),
        activitySegment({ id: 5, activity_category: "run", intervalId: 6, stepId: 7 }),
        {
          id: id(8),
          role: "rest" as const,
          name: "Rest",
          duration: { type: "time" as const, seconds: 15 },
        },
        activitySegment({ id: 9, activity_category: "run", intervalId: 10, stepId: 11 }),
      ],
    };

    const first = compileActivityPlan(structure);
    const second = compileActivityPlan(structure);

    expect(first).toEqual(second);
    expect(first.activity_category).toBe("run");
    expect(first.occurrences.map((occurrence) => occurrence.globalOrdinal)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(first.occurrences[0]?.occurrenceId).toBe(`activity:${id(1)}:${id(2)}:0:${id(3)}`);
    expect(first.occurrences[1]?.occurrenceId).toBe(`activity:${id(1)}:${id(2)}:1:${id(3)}`);
    expect(first.explicitTimedDurationSeconds).toBe(60 * 2 + 60 + 15 + 60);
  });

  it("requires targets and preserves open/manual completion", () => {
    const segment = activitySegment({ id: 1, activity_category: "run", intervalId: 2, stepId: 3 });
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Fixture requires a step.");
    const withoutTargets = { ...step } as Record<string, unknown>;
    delete withoutTargets.targets;
    expect(
      activityPlanStructureSchema.safeParse({
        version: 3,
        activity_category: "run",
        segments: [
          { ...segment, intervals: [{ ...segment.intervals[0], steps: [withoutTargets] }] },
        ],
      }).success,
    ).toBe(false);
    const openPlan = activityPlanStructureSchema.parse({
      version: 3,
      activity_category: "run",
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
    const compiled = compileActivityPlan(openPlan);
    expect(compiled.occurrences[0]).toMatchObject({
      completionPolicy: "untilFinished",
      duration: { type: "untilFinished" },
    });
    expect(compiled.explicitTimedDurationSeconds).toBe(0);
  });

  it("uses the existing activity_category capability policy for targets", () => {
    const segment = activitySegment({ id: 1, activity_category: "run", intervalId: 2, stepId: 3 });
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Fixture requires a step.");
    const result = activityPlanStructureSchema.safeParse({
      version: 3,
      activity_category: "run",
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
