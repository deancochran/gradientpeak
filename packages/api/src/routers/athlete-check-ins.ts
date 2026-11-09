import { checkInAnswerSchema, checkInQuestionSchema } from "@repo/core/coaching/check-ins";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AthleteCheckInError,
  listAthleteCheckIns,
  readAthleteCheckIn,
  submitAthleteCheckIn,
} from "../application/athlete-check-ins";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const cursor = z.object({ periodStartDate: z.string().date(), id: z.string().uuid() }).strict();
const occurrenceCommon = z
  .object({
    occurrenceId: z.string().uuid(),
    scheduleId: z.string().uuid(),
    templateVersionId: z.string().uuid(),
    periodStartDate: z.string().date(),
    scheduledLocalTime: z.string(),
    timeZone: z.string(),
    templateVersion: z
      .object({
        templateId: z.string().uuid(),
        versionId: z.string().uuid(),
        versionNumber: z.number().int().positive(),
        name: z.string(),
        questions: z.array(checkInQuestionSchema).readonly(),
      })
      .strict(),
  })
  .strict();
const submission = z
  .object({
    submissionId: z.string().uuid(),
    revision: z.number().int().positive(),
    answers: z.array(checkInAnswerSchema).optional(),
    submittedAt: z.date(),
  })
  .strict();
const occurrence = z.discriminatedUnion("state", [
  occurrenceCommon.extend({ state: z.literal("pending"), submission: z.null() }).strict(),
  occurrenceCommon.extend({ state: z.literal("submitted"), submission }).strict(),
  occurrenceCommon
    .extend({
      state: z.literal("reviewed"),
      submission,
      reviewedAt: z.date(),
      reviewedByProfileId: z.string().uuid(),
    })
    .strict(),
]);
const error = (cause: unknown): never => {
  if (cause instanceof AthleteCheckInError) {
    const code =
      cause.reason === "not_found"
        ? "NOT_FOUND"
        : cause.reason === "forbidden"
          ? "FORBIDDEN"
          : cause.reason === "conflict"
            ? "CONFLICT"
            : "BAD_REQUEST";
    throw new TRPCError({ code, message: "Check-in request could not be completed", cause });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Check-in request failed", cause });
};
const run = <T>(promise: Promise<T>) => promise.catch(error);

/** Athlete-self service only: coach, admin, consent, audience, review and follow-up access are excluded. */
export const athleteCheckInsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(20),
          cursor: cursor.nullable().default(null),
        })
        .strict(),
    )
    .output(z.object({ items: z.array(occurrence), nextCursor: cursor.nullable() }).strict())
    .query(({ ctx, input }) =>
      run(
        listAthleteCheckIns({
          db: getRequiredDb(ctx),
          athleteProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  get: protectedProcedure
    .input(z.object({ occurrenceId: z.string().uuid() }).strict())
    .output(
      occurrence.and(
        z
          .object({
            canSubmit: z.boolean(),
            unavailableReason: z
              .enum(["organization_inactive", "engagement_paused", "engagement_ended"])
              .nullable(),
          })
          .strict(),
      ),
    )
    .query(({ ctx, input }) =>
      run(
        readAthleteCheckIn({
          db: getRequiredDb(ctx),
          athleteProfileId: ctx.session.user.id,
          occurrenceId: input.occurrenceId,
        }),
      ),
    ),
  submit: protectedProcedure
    .input(
      z
        .object({
          occurrenceId: z.string().uuid(),
          templateVersionId: z.string().uuid(),
          expectedRevision: z.number().int().min(0),
          idempotencyKey: z.string().uuid(),
          answers: z.array(checkInAnswerSchema).max(20),
        })
        .strict(),
    )
    .output(
      z
        .object({
          submissionId: z.string().uuid(),
          revision: z.number().int().positive(),
          replayed: z.boolean(),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      run(
        submitAthleteCheckIn({
          db: getRequiredDb(ctx),
          athleteProfileId: ctx.session.user.id,
          occurrenceId: input.occurrenceId,
          templateVersionId: input.templateVersionId,
          expectedRevision: input.expectedRevision,
          idempotencyKey: input.idempotencyKey,
          draft: input.answers,
        }),
      ),
    ),
});
