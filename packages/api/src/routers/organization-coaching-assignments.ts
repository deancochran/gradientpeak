import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CoachingAssignmentError,
  coachingAssignmentStateDigest,
  listCoachingAssignments,
  manageCoachingAssignment,
} from "../application/organizations/manage-coaching-assignments";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const base = z
  .object({ organizationId: z.string().uuid(), engagementId: z.string().uuid() })
  .strict();
const command = base.extend({
  operationId: z.string().uuid(),
  /** SHA-256 of sorted active assignment IDs returned by list. */
  expectedStateDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
const assignment = z
  .object({
    assignmentId: z.string().uuid(),
    coachMembershipId: z.string().uuid(),
    assignmentKind: z.enum(["primary", "supporting"]),
    assignedAt: z.date(),
    coachIdentity: z
      .object({
        displayName: z.string().nullable(),
        username: z.string().nullable(),
        membershipStatus: z.enum(["active", "suspended", "ended"]),
      })
      .strict(),
  })
  .strict();
const receipt = z
  .object({
    engagementId: z.string().uuid(),
    operationId: z.string().uuid(),
    status: z.enum(["assigned", "ended"]),
  })
  .strict();
function fail(error: unknown): never {
  if (error instanceof CoachingAssignmentError)
    throw new TRPCError({
      code:
        error.reason === "not_found"
          ? "NOT_FOUND"
          : error.reason === "conflict"
            ? "CONFLICT"
            : "FORBIDDEN",
      message: "Coaching assignment request could not be completed",
      cause: error,
    });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Coaching assignment request failed",
    cause: error,
  });
}
const run = <T>(value: Promise<T>) => value.catch(fail);

/** Direct assignment authority only; it never evaluates or manufactures athlete consent. */
export const organizationCoachingAssignmentsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(base)
    .output(
      z
        .object({ items: z.array(assignment), stateDigest: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await run(
        listCoachingAssignments({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      );
      return {
        stateDigest: coachingAssignmentStateDigest(rows),
        items: rows.map((row) => ({
          assignmentId: row.id,
          coachMembershipId: row.coachMembershipId,
          assignmentKind: row.assignmentKind,
          assignedAt: row.assignedAt,
          coachIdentity: row.coachIdentity,
        })),
      };
    }),
  assign: protectedProcedure
    .input(
      command
        .extend({
          coachMembershipId: z.string().uuid(),
          assignmentKind: z.enum(["primary", "supporting"]),
        })
        .strict(),
    )
    .output(receipt)
    .mutation(({ ctx, input }) =>
      run(
        manageCoachingAssignment({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
          action: "assign",
        }),
      ),
    ),
  change: protectedProcedure
    .input(
      command
        .extend({
          assignmentId: z.string().uuid(),
          coachMembershipId: z.string().uuid(),
          assignmentKind: z.enum(["primary", "supporting"]),
        })
        .strict(),
    )
    .output(receipt)
    .mutation(({ ctx, input }) =>
      run(
        manageCoachingAssignment({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
          action: "change",
        }),
      ),
    ),
  end: protectedProcedure
    .input(command.extend({ assignmentId: z.string().uuid() }).strict())
    .output(receipt)
    .mutation(({ ctx, input }) =>
      run(
        manageCoachingAssignment({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
          action: "end",
        }),
      ),
    ),
});
