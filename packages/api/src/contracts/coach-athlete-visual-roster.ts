import { dateOnlySchema } from "@repo/core";
import { z } from "zod";

const rosterCursorSchema = z.string().uuid();
const scopeStateSchema = z.enum(["available", "unshared", "unavailable"]);

export const coachAthleteVisualRosterRequestSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: rosterCursorSchema.nullable().default(null),
    search: z.string().trim().min(1).max(120).nullable().default(null),
  })
  .strict();

const loadPointSchema = z
  .object({ date: dateOnlySchema, dailyLoad: z.number().nonnegative() })
  .strict();

export const coachAthleteVisualRosterResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          profileId: z.string().uuid(),
          displayName: z.string().nullable(),
          username: z.string().nullable(),
          metrics: z
            .object({
              status: scopeStateSchema,
              freshness: z.enum(["fresh", "stale", "unavailable"]).optional(),
              publishedAt: z.string().datetime({ offset: true }).optional(),
            })
            .strict(),
          activities: z
            .object({ status: scopeStateSchema, points: z.array(loadPointSchema).max(28) })
            .strict(),
          goals: z
            .object({
              status: scopeStateSchema,
              items: z
                .array(
                  z
                    .object({
                      id: z.string().uuid(),
                      name: z.string().min(1).max(100),
                      targetDate: dateOnlySchema,
                      category: z.string().min(1),
                      priority: z.number().int().min(0).max(10),
                    })
                    .strict(),
                )
                .max(3),
            })
            .strict(),
        })
        .strict(),
    ),
    nextCursor: rosterCursorSchema.nullable(),
    hasMore: z.boolean(),
    queryCount: z.literal(3),
  })
  .strict();

export type CoachAthleteVisualRosterResponse = z.output<
  typeof coachAthleteVisualRosterResponseSchema
>;
