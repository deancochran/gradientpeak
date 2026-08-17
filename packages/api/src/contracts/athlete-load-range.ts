import { dailyTrainingLoadCoverageSchema } from "@repo/core/athlete-derived-state";
import {
  athleteStateBaselineSchema,
  planningDayIdentitySchema,
} from "@repo/core/athlete-intelligence";
import { z } from "zod";
import { athleteStateCacheTagsSchema } from "./cache-receipts";
import { planningRangeRequestSchema } from "./planning-range";

const uuidSchema = z.string().uuid();
const revisionSchema = z.number().int().nonnegative();
const instantSchema = z.string().datetime({ offset: true });

export const athleteLoadRangeRequestSchema = z
  .object({ profileId: uuidSchema, range: planningRangeRequestSchema })
  .strict();

export const athleteLoadDayDtoSchema = z
  .object({
    planningDate: planningDayIdentitySchema,
    commonLoad: z.number().finite().nonnegative(),
    fitness: z.number().finite().nonnegative(),
    fatigue: z.number().finite().nonnegative(),
    form: z.number().finite(),
    readiness: z.number().finite().min(0).max(100).nullable(),
    coverage: dailyTrainingLoadCoverageSchema,
    calculationVersion: z.string().trim().min(1).max(64),
  })
  .strict();

const athleteCoverageDtoSchema = z
  .object({
    startAt: instantSchema.nullable(),
    endAt: instantSchema.nullable(),
    lastActivityAt: instantSchema.nullable(),
  })
  .strict();

export const athleteLoadRangeDtoSchema = z
  .object({
    profileId: uuidSchema,
    range: planningRangeRequestSchema,
    publishedRevision: revisionSchema,
    freshness: z.enum(["fresh", "stale", "unavailable"]),
    coverage: athleteCoverageDtoSchema,
    days: z.array(athleteLoadDayDtoSchema).max(366),
  })
  .strict()
  .superRefine((result, context) => {
    for (const [index, day] of result.days.entries()) {
      const previous = result.days[index - 1];
      if (day.planningDate < result.range.startDate || day.planningDate > result.range.endDate) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "planningDate"],
          message: "Daily load must fall inside the requested range",
        });
      }
      if (previous && previous.planningDate >= day.planningDate) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "planningDate"],
          message: "Daily load must be strictly ordered by planning date",
        });
      }
    }
  });

export const athleteCurrentStateRequestSchema = z.object({ profileId: uuidSchema }).strict();

export const athleteCurrentStateDtoSchema = z
  .object({
    profileId: uuidSchema,
    planningTimezone: z.string().trim().min(1),
    currentPlanningDate: planningDayIdentitySchema,
    freshness: z.enum(["fresh", "stale", "unavailable"]),
    rebuildStatus: z.enum(["fresh", "pending", "rebuilding", "failed", "unavailable"]),
    importStatus: z.enum(["complete", "active", "failed"]),
    revisions: z
      .object({ source: revisionSchema.nullable(), published: revisionSchema.nullable() })
      .strict(),
    coverage: athleteCoverageDtoSchema,
    computedAt: instantSchema.nullable(),
    algorithmVersion: z.string().trim().min(1).nullable(),
    baseline: athleteStateBaselineSchema.nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    if (state.baseline && state.baseline.athleteId !== state.profileId) {
      context.addIssue({
        code: "custom",
        path: ["baseline", "athleteId"],
        message: "Published athlete state must belong to the requested profile",
      });
    }
    if (
      state.baseline &&
      state.revisions.published !== null &&
      state.baseline.stateRevision !== state.revisions.published
    ) {
      context.addIssue({
        code: "custom",
        path: ["baseline", "stateRevision"],
        message: "Published athlete state must match the published revision",
      });
    }
  });

export const athleteRecalculationRepairRequestSchema = z.object({ profileId: uuidSchema }).strict();

export const athleteRecalculationRepairReceiptSchema = z
  .object({
    status: z.literal("accepted"),
    profileId: uuidSchema,
    cache_tags: athleteStateCacheTagsSchema,
  })
  .strict();

export type AthleteLoadRangeDto = z.infer<typeof athleteLoadRangeDtoSchema>;
export type AthleteCurrentStateDto = z.infer<typeof athleteCurrentStateDtoSchema>;
