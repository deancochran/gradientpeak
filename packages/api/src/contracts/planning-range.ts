import { z } from "zod";

const dateSchema = z.iso.date();
const loadStatusSchema = z.enum(["complete", "partial", "known_zero", "unavailable"]);
export const planningRangeLoadSchema = z
  .object({ status: loadStatusSchema, value: z.number().finite().nonnegative().nullable() })
  .strict();

export const planningRangeRequestSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema })
  .strict()
  .superRefine((input, context) => {
    const start = Date.parse(`${input.startDate}T00:00:00.000Z`);
    const end = Date.parse(`${input.endDate}T00:00:00.000Z`);
    const days = (end - start) / 86_400_000 + 1;
    if (days <= 0 || days > 366) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Planning ranges must cover 1-366 inclusive days",
      });
    }
  });

const planningDaySchema = z
  .object({
    date: dateSchema,
    actual: planningRangeLoadSchema,
    committed: planningRangeLoadSchema,
    target: planningRangeLoadSchema,
    effective: planningRangeLoadSchema,
  })
  .strict();

const coverageRangeSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema, status: z.enum(["complete", "partial"]) })
  .strict()
  .nullable();

const trajectoryPointSchema = z
  .object({
    date: dateSchema,
    longTermLoad: z.number().finite(),
    recentLoad: z.number().finite(),
    loadBalance: z.number().finite(),
  })
  .strict();

export const planningRangeSchema = z
  .object({
    contractVersion: z.literal("planning-range-v1"),
    startDate: dateSchema,
    endDate: dateSchema,
    planningTimezone: z.string().min(1),
    asOf: z.string().datetime({ offset: true }),
    publishedRevision: z.number().int().nonnegative().nullable(),
    algorithmVersion: z.string().min(1).nullable(),
    days: z.array(planningDaySchema).max(366),
    weeks: z
      .array(
        z
          .object({
            weekStartDate: dateSchema,
            actual: planningRangeLoadSchema,
            committed: planningRangeLoadSchema,
            target: planningRangeLoadSchema,
            effective: planningRangeLoadSchema,
          })
          .strict(),
      )
      .max(54),
    trajectories: z
      .object({
        actual: z.array(trajectoryPointSchema),
        committed: z.array(trajectoryPointSchema),
        target: z.array(trajectoryPointSchema),
      })
      .strict(),
    goals: z.array(
      z
        .object({
          id: z.string().uuid(),
          label: z.string().min(1),
          targetDate: dateSchema,
          activityCategory: z.string().nullable(),
        })
        .strict(),
    ),
    calendarItems: z.array(
      z
        .object({
          id: z.string().min(1),
          date: dateSchema,
          startsAt: z.string().datetime({ offset: true }).nullable(),
          kind: z.enum(["completed", "planned", "event", "group_event", "goal"]),
          title: z.string().min(1),
          status: z.string().min(1),
          load: planningRangeLoadSchema,
          navigation: z
            .object({
              target: z.enum(["activity", "event", "group_event", "goal"]),
              id: z.string().min(1),
            })
            .strict(),
        })
        .strict(),
    ),
    coverage: z
      .object({
        state: z.enum(["available", "unavailable"]),
        activities: coverageRangeSchema,
        scheduledItems: coverageRangeSchema,
        calendarEvents: coverageRangeSchema,
        groupEvents: coverageRangeSchema,
        entriesTruncated: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type PlanningRange = z.infer<typeof planningRangeSchema>;
