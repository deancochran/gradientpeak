import { z } from "zod";

import { activityArtifactSourceFormatSchema } from "../activity-artifacts/source-format";
import { canonicalSportSchema } from "../schemas/sport";

const rawSourceValueSchema = z.union([z.string().min(1).max(128), z.number().int()]);
const rawSourceFields = {
  rawType: rawSourceValueSchema.optional(),
  rawSport: rawSourceValueSchema.optional(),
  rawSubSport: rawSourceValueSchema.optional(),
};

function hasRawSourceIdentity(value: {
  rawType?: string | number;
  rawSport?: string | number;
  rawSubSport?: string | number;
}): boolean {
  return (
    value.rawType !== undefined || value.rawSport !== undefined || value.rawSubSport !== undefined
  );
}

export const artifactSegmentSourceReferenceSchema = z
  .object({
    kind: z.literal("artifact"),
    artifactId: z.string().uuid(),
    source: activityArtifactSourceFormatSchema,
    sessionMessageIndex: z.number().int().nonnegative().optional(),
    messageIndex: z.number().int().nonnegative().optional(),
    ...rawSourceFields,
  })
  .strict();

export const rawOnlySegmentSourceReferenceSchema = z
  .object({
    kind: z.literal("raw"),
    ...rawSourceFields,
  })
  .strict()
  .refine(hasRawSourceIdentity, {
    message: "A raw-only source requires a raw type, sport, or sub-sport value.",
  });

export const segmentSourceReferenceSchema = z.union([
  artifactSegmentSourceReferenceSchema,
  rawOnlySegmentSourceReferenceSchema,
]);

export const segmentUnknownSourceReferenceSchema = z.union([
  rawOnlySegmentSourceReferenceSchema,
  artifactSegmentSourceReferenceSchema.refine(hasRawSourceIdentity, {
    message: "An unknown segment requires a raw type, sport, or sub-sport value.",
  }),
]);

export type SegmentSourceReference = z.infer<typeof segmentSourceReferenceSchema>;
export type SegmentUnknownSourceReference = z.infer<typeof segmentUnknownSourceReferenceSchema>;

const completeTimingSchema = z
  .object({
    timingCoverage: z.literal("complete"),
    activeMs: z.number().int().nonnegative(),
    movingMs: z.number().int().nonnegative(),
  })
  .strict();

const partialTimingSchema = z
  .object({
    timingCoverage: z.literal("partial"),
    activeMs: z.number().int().nonnegative().optional(),
    movingMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((timing) => timing.activeMs !== undefined || timing.movingMs !== undefined, {
    message: "Partial timing requires active or moving time evidence.",
  });

const unavailableTimingSchema = z
  .object({
    timingCoverage: z.literal("unavailable"),
  })
  .strict();

const segmentTimingSchema = z.union([
  completeTimingSchema,
  partialTimingSchema,
  unavailableTimingSchema,
]);

export const SEGMENT_SUMMARY_V1_LIMITS = {
  maxCadenceRpm: 500,
  maxSpeedMetersPerSecond: 100,
  maxPoolLengthMeters: 200,
  maxSwimCount: 1_000_000,
  maxStrokeRatePerMinute: 300,
  maxSwolf: 1_000,
} as const;

const swimSegmentSummarySchema = z
  .object({
    poolLengthMeters: z
      .number()
      .positive()
      .max(SEGMENT_SUMMARY_V1_LIMITS.maxPoolLengthMeters)
      .optional(),
    lengthCount: z
      .number()
      .int()
      .nonnegative()
      .max(SEGMENT_SUMMARY_V1_LIMITS.maxSwimCount)
      .optional(),
    strokeCount: z
      .number()
      .int()
      .nonnegative()
      .max(SEGMENT_SUMMARY_V1_LIMITS.maxSwimCount)
      .optional(),
    averageStrokeRatePerMinute: z
      .number()
      .nonnegative()
      .max(SEGMENT_SUMMARY_V1_LIMITS.maxStrokeRatePerMinute)
      .optional(),
    averageSwolf: z.number().nonnegative().max(SEGMENT_SUMMARY_V1_LIMITS.maxSwolf).optional(),
  })
  .strict()
  .refine((swim) => Object.values(swim).some((value) => value !== undefined), {
    message: "A swim summary must contain at least one supported metric.",
  });

export const segmentSummarySchemaV1 = z
  .object({
    version: z.literal(1),
    timing: segmentTimingSchema,
    distanceMeters: z.number().nonnegative().optional(),
    ascentMeters: z.number().nonnegative().optional(),
    descentMeters: z.number().nonnegative().optional(),
    caloriesKcal: z.number().nonnegative().optional(),
    averageHeartRateBpm: z.number().nonnegative().optional(),
    averagePowerWatts: z.number().nonnegative().optional(),
    averageCadenceRpm: z
      .number()
      .nonnegative()
      .max(SEGMENT_SUMMARY_V1_LIMITS.maxCadenceRpm)
      .optional(),
    averageSpeedMetersPerSecond: z
      .number()
      .nonnegative()
      .max(SEGMENT_SUMMARY_V1_LIMITS.maxSpeedMetersPerSecond)
      .optional(),
    swim: swimSegmentSummarySchema.optional(),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const { timing } = summary;
    if (
      "movingMs" in timing &&
      timing.movingMs !== undefined &&
      "activeMs" in timing &&
      timing.activeMs !== undefined &&
      timing.movingMs > timing.activeMs
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["timing", "movingMs"],
        message: "Moving time cannot exceed active time.",
      });
    }
  });

export type SegmentSummaryV1 = z.infer<typeof segmentSummarySchemaV1>;

const completedSegmentBase = {
  id: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  startOffsetMs: z.number().int().nonnegative(),
  endOffsetMs: z.number().int().positive(),
  summary: segmentSummarySchemaV1,
};

const completedActivitySegmentSchema = z
  .object({
    ...completedSegmentBase,
    role: z.literal("activity"),
    category: canonicalSportSchema,
    source: segmentSourceReferenceSchema.optional(),
  })
  .strict();

const completedBoundarySegmentSchema = (role: "transition" | "rest") =>
  z
    .object({
      ...completedSegmentBase,
      role: z.literal(role),
      source: segmentSourceReferenceSchema.optional(),
    })
    .strict();

const completedUnknownSegmentSchema = z
  .object({
    ...completedSegmentBase,
    role: z.literal("unknown"),
    source: segmentUnknownSourceReferenceSchema,
  })
  .strict();

export const completedActivitySegmentSchemaV1 = z.discriminatedUnion("role", [
  completedActivitySegmentSchema,
  completedBoundarySegmentSchema("transition"),
  completedBoundarySegmentSchema("rest"),
  completedUnknownSegmentSchema,
]);

export type CompletedActivitySegmentV1 = z.infer<typeof completedActivitySegmentSchemaV1>;

/** Parent-relative segment set; elapsed gaps intentionally represent pauses/unclassified time. */
export const completedActivitySegmentSetSchemaV1 = z
  .object({
    version: z.literal(1),
    elapsedMs: z.number().int().positive(),
    segments: z.array(completedActivitySegmentSchemaV1).min(1).max(256),
  })
  .strict()
  .superRefine((set, ctx) => {
    const ids = new Set<string>();
    for (const [index, segment] of set.segments.entries()) {
      const rangeMs = segment.endOffsetMs - segment.startOffsetMs;
      if (ids.has(segment.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "id"],
          message: "Completed segment IDs must be unique.",
        });
      }
      ids.add(segment.id);
      if (segment.ordinal !== index) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "ordinal"],
          message: "Completed segment ordinals must be contiguous and match array order.",
        });
      }
      if (segment.startOffsetMs >= segment.endOffsetMs || segment.endOffsetMs > set.elapsedMs) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "endOffsetMs"],
          message:
            "Segment offsets must form a non-empty half-open range within parent elapsed time.",
        });
      }
      const previous = set.segments[index - 1];
      if (previous && previous.endOffsetMs > segment.startOffsetMs) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "startOffsetMs"],
          message: "Completed segment ranges cannot overlap.",
        });
      }
      if (segment.role === "transition") {
        const next = set.segments[index + 1];
        if (previous?.role !== "activity" || next?.role !== "activity") {
          ctx.addIssue({
            code: "custom",
            path: ["segments", index, "role"],
            message: "A transition must be immediately between two activity segments.",
          });
        }
      }
      if (segment.role === "rest" && previous?.role === "rest") {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "role"],
          message: "Rest segments cannot be consecutive.",
        });
      }
      const timing = segment.summary.timing;
      if ("activeMs" in timing && timing.activeMs !== undefined && timing.activeMs > rangeMs) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "summary", "timing", "activeMs"],
          message: "Active time cannot exceed the segment elapsed range.",
        });
      }
    }
  });

export type CompletedActivitySegmentSetV1 = z.infer<typeof completedActivitySegmentSetSchemaV1>;
