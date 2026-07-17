import { z } from "zod";

import { canonicalSportSchema } from "../schemas/sport";

const rawSourceValueSchema = z.union([z.string().min(1).max(128), z.number().int()]);
const pauseRangeSchema = z
  .object({
    startOffsetMs: z.number().int().nonnegative(),
    endOffsetMs: z.number().int().positive(),
  })
  .strict()
  .refine((range) => range.startOffsetMs < range.endOffsetMs, {
    message: "A pause range must be non-empty.",
    path: ["endOffsetMs"],
  });
const timerEventSchema = z
  .object({
    type: z.enum(["start", "stop", "pause", "resume"]),
    offsetMs: z.number().int().nonnegative(),
  })
  .strict();

const semanticSegmentFields = {
  rawType: rawSourceValueSchema.optional(),
  rawSport: rawSourceValueSchema.optional(),
  rawSubSport: rawSourceValueSchema.optional(),
  startOffsetMs: z.number().int().nonnegative(),
  endOffsetMs: z.number().int().positive(),
  activeMs: z.number().int().nonnegative().optional(),
  movingMs: z.number().int().nonnegative().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  pauseRanges: z.array(pauseRangeSchema).max(10_000).optional(),
  timerEvents: z.array(timerEventSchema).max(10_000).optional(),
};

const semanticSegmentSchema = z
  .discriminatedUnion("role", [
    z
      .object({
        ...semanticSegmentFields,
        role: z.literal("activity"),
        category: canonicalSportSchema,
      })
      .strict(),
    z.object({ ...semanticSegmentFields, role: z.literal("transition") }).strict(),
    z.object({ ...semanticSegmentFields, role: z.literal("rest") }).strict(),
    z
      .object({
        ...semanticSegmentFields,
        role: z.literal("unknown"),
      })
      .strict(),
  ])
  .superRefine((segment, ctx) => {
    const durationMs = segment.endOffsetMs - segment.startOffsetMs;
    if (durationMs <= 0) {
      ctx.addIssue({ code: "custom", path: ["endOffsetMs"], message: "Segment range is invalid." });
    }
    if (segment.activeMs !== undefined && segment.activeMs > durationMs) {
      ctx.addIssue({
        code: "custom",
        path: ["activeMs"],
        message: "Active time exceeds duration.",
      });
    }
    if (
      segment.activeMs !== undefined &&
      segment.movingMs !== undefined &&
      segment.movingMs > segment.activeMs
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["movingMs"],
        message: "Moving time exceeds active time.",
      });
    }
    if (
      segment.role === "unknown" &&
      segment.rawType === undefined &&
      segment.rawSport === undefined &&
      segment.rawSubSport === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["rawType"],
        message: "Unknown segments require a raw type, sport, or sub-sport value.",
      });
    }
    let previousPauseEnd = -1;
    segment.pauseRanges?.forEach((pause, index) => {
      if (pause.startOffsetMs < segment.startOffsetMs || pause.endOffsetMs > segment.endOffsetMs) {
        ctx.addIssue({
          code: "custom",
          path: ["pauseRanges", index],
          message: "Pause ranges must be within the segment range.",
        });
      }
      if (pause.startOffsetMs < previousPauseEnd) {
        ctx.addIssue({
          code: "custom",
          path: ["pauseRanges", index, "startOffsetMs"],
          message: "Pause ranges must be ordered and non-overlapping.",
        });
      }
      previousPauseEnd = pause.endOffsetMs;
    });

    let timerState: "paused" | "running" | "stopped" = "stopped";
    let previousTimerOffset = -1;
    segment.timerEvents?.forEach((event, index) => {
      if (event.offsetMs < segment.startOffsetMs || event.offsetMs > segment.endOffsetMs) {
        ctx.addIssue({
          code: "custom",
          path: ["timerEvents", index, "offsetMs"],
          message: "Timer events must be within the segment range.",
        });
      }
      if (event.offsetMs < previousTimerOffset) {
        ctx.addIssue({
          code: "custom",
          path: ["timerEvents", index, "offsetMs"],
          message: "Timer events must be ordered by offset.",
        });
      }
      const valid =
        (event.type === "start" && timerState === "stopped") ||
        (event.type === "pause" && timerState === "running") ||
        (event.type === "resume" && timerState === "paused") ||
        (event.type === "stop" && timerState !== "stopped");
      if (!valid) {
        ctx.addIssue({
          code: "custom",
          path: ["timerEvents", index, "type"],
          message: "Timer event order is invalid.",
        });
      }
      if (valid) {
        timerState =
          event.type === "pause" ? "paused" : event.type === "stop" ? "stopped" : "running";
      }
      previousTimerOffset = event.offsetMs;
    });
  });

export const activityArtifactSemanticsSchema = z
  .object({
    segments: z.array(semanticSegmentSchema).min(1).max(256),
    totals: z
      .object({
        elapsedMs: z.number().int().nonnegative(),
        activeMs: z.number().int().nonnegative().optional(),
        movingMs: z.number().int().nonnegative().optional(),
        distanceMeters: z.number().nonnegative().optional(),
      })
      .strict()
      .refine(
        (totals) =>
          totals.activeMs === undefined ||
          totals.movingMs === undefined ||
          totals.movingMs <= totals.activeMs,
        { message: "Parent moving time exceeds active time.", path: ["movingMs"] },
      ),
  })
  .strict()
  .superRefine((document, ctx) => {
    document.segments.forEach((segment, index) => {
      const previous = document.segments[index - 1];
      const next = document.segments[index + 1];
      if (segment.endOffsetMs > document.totals.elapsedMs) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "endOffsetMs"],
          message: "Segment ranges must be within parent elapsed time.",
        });
      }
      if (previous && segment.startOffsetMs < previous.startOffsetMs) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "startOffsetMs"],
          message: "Segment array order must follow ascending ranges.",
        });
      }
      if (previous && segment.startOffsetMs < previous.endOffsetMs) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "startOffsetMs"],
          message: "Semantic segment ranges cannot overlap.",
        });
      }
      if (
        segment.role === "transition" &&
        (previous?.role !== "activity" || next?.role !== "activity")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "role"],
          message: "A transition must be immediately between two activity segments.",
        });
      }
      if (segment.role === "rest" && previous?.role === "rest") {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "role"],
          message: "Rest segments cannot be consecutive.",
        });
      }
    });
  })
  .brand<"ActivityArtifactSemantics">();

export type ActivityArtifactSemantics = z.infer<typeof activityArtifactSemanticsSchema>;

export const activityArtifactSemanticTolerancesSchema = z
  .object({
    timestampMs: z.number().finite().nonnegative(),
    durationMs: z.number().finite().nonnegative(),
    distanceMeters: z.number().finite().nonnegative(),
  })
  .strict();
export type ActivityArtifactSemanticTolerances = z.infer<
  typeof activityArtifactSemanticTolerancesSchema
>;

export const FIT_ROUND_TRIP_TOLERANCES: ActivityArtifactSemanticTolerances = {
  timestampMs: 1_000,
  durationMs: 1_000,
  distanceMeters: 1,
};

export type ActivityArtifactSemanticDifference = {
  path: readonly (string | number)[];
  expected: unknown;
  actual: unknown;
  tolerance?: number;
};

export type ActivityArtifactSemanticComparison = {
  equivalent: boolean;
  differences: readonly ActivityArtifactSemanticDifference[];
};

function assertAggregateTimingConsistency(
  document: ActivityArtifactSemantics,
  durationToleranceMs: number,
): void {
  const assertMetric = (metric: "activeMs" | "movingMs") => {
    const values = document.segments.map((segment) => segment[metric]);
    const allKnown = values.every((value) => value !== undefined);
    const parentValue = document.totals[metric];
    if (!allKnown) {
      if (parentValue !== undefined) {
        throw new Error(`Parent ${metric} requires complete segment timing coverage.`);
      }
      return;
    }
    if (parentValue === undefined) {
      throw new Error(`Parent ${metric} is required when segment timing coverage is complete.`);
    }
    const segmentTotal = values.reduce((total, value) => total + (value ?? 0), 0);
    if (Math.abs(segmentTotal - parentValue) > durationToleranceMs) {
      throw new Error(`Parent ${metric} does not reconcile with segment timing.`);
    }
  };

  assertMetric("activeMs");
  assertMetric("movingMs");
}

/** Compares canonical projections; vendor decoding remains outside this scaffold. */
export function compareActivityArtifactSemantics(input: {
  expected: unknown;
  actual: unknown;
  tolerances?: ActivityArtifactSemanticTolerances;
}): ActivityArtifactSemanticComparison {
  const tolerances = activityArtifactSemanticTolerancesSchema.parse(
    input.tolerances ?? FIT_ROUND_TRIP_TOLERANCES,
  );
  const expectedSemantics = activityArtifactSemanticsSchema.parse(input.expected);
  const actualSemantics = activityArtifactSemanticsSchema.parse(input.actual);
  assertAggregateTimingConsistency(expectedSemantics, tolerances.durationMs);
  assertAggregateTimingConsistency(actualSemantics, tolerances.durationMs);
  const differences: ActivityArtifactSemanticDifference[] = [];
  const exact = (path: readonly (string | number)[], expected: unknown, actual: unknown) => {
    if (expected !== actual) differences.push({ path, expected, actual });
  };
  const approximate = (
    path: readonly (string | number)[],
    expected: number | undefined,
    actual: number | undefined,
    tolerance: number,
  ) => {
    if (expected === undefined || actual === undefined) {
      exact(path, expected, actual);
    } else if (Math.abs(expected - actual) > tolerance) {
      differences.push({ path, expected, actual, tolerance });
    }
  };
  const compareRanges = (
    path: readonly (string | number)[],
    expected: readonly { startOffsetMs: number; endOffsetMs: number }[] | undefined,
    actual: readonly { startOffsetMs: number; endOffsetMs: number }[] | undefined,
  ) => {
    exact([...path, "length"], expected?.length, actual?.length);
    expected?.forEach((expectedRange, index) => {
      const actualRange = actual?.[index];
      if (!actualRange) return;
      approximate(
        [...path, index, "startOffsetMs"],
        expectedRange.startOffsetMs,
        actualRange.startOffsetMs,
        tolerances.timestampMs,
      );
      approximate(
        [...path, index, "endOffsetMs"],
        expectedRange.endOffsetMs,
        actualRange.endOffsetMs,
        tolerances.timestampMs,
      );
      approximate(
        [...path, index, "durationMs"],
        expectedRange.endOffsetMs - expectedRange.startOffsetMs,
        actualRange.endOffsetMs - actualRange.startOffsetMs,
        tolerances.durationMs,
      );
    });
  };

  exact(["segments", "length"], expectedSemantics.segments.length, actualSemantics.segments.length);
  expectedSemantics.segments.forEach((expected, index) => {
    const actual = actualSemantics.segments[index];
    if (!actual) return;
    exact(["segments", index, "role"], expected.role, actual.role);
    exact(
      ["segments", index, "category"],
      expected.role === "activity" ? expected.category : undefined,
      actual.role === "activity" ? actual.category : undefined,
    );
    exact(["segments", index, "rawType"], expected.rawType, actual.rawType);
    exact(["segments", index, "rawSport"], expected.rawSport, actual.rawSport);
    exact(["segments", index, "rawSubSport"], expected.rawSubSport, actual.rawSubSport);
    approximate(
      ["segments", index, "startOffsetMs"],
      expected.startOffsetMs,
      actual.startOffsetMs,
      tolerances.timestampMs,
    );
    approximate(
      ["segments", index, "endOffsetMs"],
      expected.endOffsetMs,
      actual.endOffsetMs,
      tolerances.timestampMs,
    );
    approximate(
      ["segments", index, "durationMs"],
      expected.endOffsetMs - expected.startOffsetMs,
      actual.endOffsetMs - actual.startOffsetMs,
      tolerances.durationMs,
    );
    approximate(
      ["segments", index, "activeMs"],
      expected.activeMs,
      actual.activeMs,
      tolerances.durationMs,
    );
    approximate(
      ["segments", index, "movingMs"],
      expected.movingMs,
      actual.movingMs,
      tolerances.durationMs,
    );
    approximate(
      ["segments", index, "distanceMeters"],
      expected.distanceMeters,
      actual.distanceMeters,
      tolerances.distanceMeters,
    );
    compareRanges(["segments", index, "pauseRanges"], expected.pauseRanges, actual.pauseRanges);
    exact(
      ["segments", index, "timerEvents", "length"],
      expected.timerEvents?.length,
      actual.timerEvents?.length,
    );
    expected.timerEvents?.forEach((expectedEvent, eventIndex) => {
      const actualEvent = actual.timerEvents?.[eventIndex];
      if (!actualEvent) return;
      exact(
        ["segments", index, "timerEvents", eventIndex, "type"],
        expectedEvent.type,
        actualEvent.type,
      );
      approximate(
        ["segments", index, "timerEvents", eventIndex, "offsetMs"],
        expectedEvent.offsetMs,
        actualEvent.offsetMs,
        tolerances.timestampMs,
      );
    });
  });
  approximate(
    ["totals", "elapsedMs"],
    expectedSemantics.totals.elapsedMs,
    actualSemantics.totals.elapsedMs,
    tolerances.durationMs,
  );
  approximate(
    ["totals", "activeMs"],
    expectedSemantics.totals.activeMs,
    actualSemantics.totals.activeMs,
    tolerances.durationMs,
  );
  approximate(
    ["totals", "movingMs"],
    expectedSemantics.totals.movingMs,
    actualSemantics.totals.movingMs,
    tolerances.durationMs,
  );
  approximate(
    ["totals", "distanceMeters"],
    expectedSemantics.totals.distanceMeters,
    actualSemantics.totals.distanceMeters,
    tolerances.distanceMeters,
  );

  return { equivalent: differences.length === 0, differences };
}
