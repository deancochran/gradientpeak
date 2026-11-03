import { z } from "zod";
import { ianaTimezoneSchema } from "../athlete-intelligence/planning-context";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";

const finiteNonnegativeNumber = z.number().finite().nonnegative();

/** Observations supplied by an athlete rather than a recording or import. */
export const manualTrainingDiaryObservationSchema = z
  .object({
    operationId: z.string().uuid(),
    diaryDate: z.iso.date(),
    diaryTimezone: ianaTimezoneSchema,
    name: z.string().trim().min(1).max(200),
    activityCategory: canonicalActivityCategorySchema,
    notes: z.string().max(10_000).nullable().optional(),
    startedAt: z.string().datetime({ offset: true }).nullable().optional(),
    finishedAt: z.string().datetime({ offset: true }).nullable().optional(),
    elapsedMs: finiteNonnegativeNumber.nullable().optional(),
    distanceMeters: finiteNonnegativeNumber.nullable().optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    rpeOperationId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.startedAt == null) !== (value.finishedAt == null)) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "Exact start and finish timestamps must be reported together",
      });
    }
    if (value.rpe !== undefined && value.rpeOperationId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["rpeOperationId"],
        message: "Session-RPE requires its own idempotency operation ID",
      });
    }
    if (value.rpe === undefined && value.rpeOperationId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["rpe"],
        message: "Session-RPE operation ID requires a reported RPE",
      });
    }
  });

export type ManualTrainingDiaryObservation = z.infer<typeof manualTrainingDiaryObservationSchema>;
