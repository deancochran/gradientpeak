import { randomUUID } from "node:crypto";
import {
  getCalendarDateInIanaZone,
  isValidDateOnlyUtc,
  isValidIanaTimeZone,
} from "@repo/core/calendar";
import {
  activityPlans,
  athletePlanEditGrants,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { listAthletePublicationPermissionOptions } from "../application/coaching/list-athlete-publication-permission-options";
import {
  CoachingPublicationConflictError,
  CoachingPublicationDeniedError,
  publishCoachWorkout,
} from "../application/coaching/publish-workout";
import { getRequiredDb, withProfileFencedRepeatableReadSnapshot } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const id = z.string().uuid();
const dateOnly = z.string().refine(isValidDateOnlyUtc, "Expected a real YYYY-MM-DD date");
const grantInput = z.object({ organizationId: id, coachMembershipId: id }).strict();
const revokeInput = z.object({ grantId: id }).strict();
const statusInput = z.object({ organizationId: id }).strict();
const permissionOptionOutput = z.object({
  options: z.array(
    z.object({
      organization: z.object({ id, name: z.string() }).strict(),
      coach: z.object({ membershipId: id, name: z.string() }).strict(),
      currentGrant: z.object({ id }).strict().nullable(),
    }),
  ),
});
const publishInput = z
  .object({
    organizationId: id,
    athleteProfileId: id,
    coachMembershipId: id,
    activityPlanId: id,
    activityPlanRevision: z.number().int().positive(),
    planningDate: dateOnly,
    operationId: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  })
  .strict();

function map(error: unknown): never {
  if (error instanceof CoachingPublicationDeniedError)
    throw new TRPCError({ code: "FORBIDDEN", message: error.message, cause: error });
  if (error instanceof CoachingPublicationConflictError)
    throw new TRPCError({ code: "CONFLICT", message: error.message, cause: error });
  throw error;
}

export const coachingPublicationRouter = createTRPCRouter({
  permissionOptions: protectedProcedure.output(permissionOptionOutput).query(({ ctx }) =>
    listAthletePublicationPermissionOptions({
      athleteProfileId: ctx.session.user.id,
      db: getRequiredDb(ctx),
      now: new Date(),
    }),
  ),
  status: protectedProcedure.input(statusInput).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const rows = await db
      .select({
        id: athletePlanEditGrants.id,
        coachMembershipId: athletePlanEditGrants.coach_membership_id,
        expiresAt: athletePlanEditGrants.expires_at,
        revokedAt: athletePlanEditGrants.revoked_at,
      })
      .from(athletePlanEditGrants)
      .where(
        and(
          eq(athletePlanEditGrants.organization_id, input.organizationId),
          eq(athletePlanEditGrants.athlete_profile_id, ctx.session.user.id),
        ),
      );
    return {
      grants: rows.map((row) => ({
        ...row,
        active: row.revokedAt === null && (row.expiresAt === null || row.expiresAt > new Date()),
      })),
    };
  }),
  grant: protectedProcedure.input(grantInput).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    return withProfileFencedRepeatableReadSnapshot(db, ctx.session.user.id, async (tx) => {
      const [relationship] = await tx
        .select({ engagementId: coachingEngagements.id })
        .from(coachingEngagements)
        .innerJoin(
          coachingAssignments,
          eq(coachingAssignments.engagement_id, coachingEngagements.id),
        )
        .innerJoin(
          organizationMemberships,
          eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
        )
        .innerJoin(
          organizationMembershipRoleGrants,
          eq(
            organizationMembershipRoleGrants.membership_id,
            coachingAssignments.coach_membership_id,
          ),
        )
        .where(
          and(
            eq(coachingEngagements.organization_id, input.organizationId),
            eq(coachingEngagements.athlete_profile_id, ctx.session.user.id),
            isNull(coachingEngagements.ended_at),
            isNull(coachingEngagements.paused_at),
            eq(coachingAssignments.coach_membership_id, input.coachMembershipId),
            isNull(coachingAssignments.ended_at),
            isNull(organizationMemberships.ended_at),
            isNull(organizationMemberships.suspended_at),
            eq(organizationMembershipRoleGrants.role_key, "coach"),
            isNull(organizationMembershipRoleGrants.revoked_at),
          ),
        )
        .for("update")
        .limit(1);
      if (!relationship)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That coach is not currently assigned to you",
        });
      const [current] = await tx
        .select({
          id: athletePlanEditGrants.id,
          expiresAt: athletePlanEditGrants.expires_at,
        })
        .from(athletePlanEditGrants)
        .where(
          and(
            eq(athletePlanEditGrants.engagement_id, relationship.engagementId),
            eq(athletePlanEditGrants.coach_membership_id, input.coachMembershipId),
            isNull(athletePlanEditGrants.revoked_at),
          ),
        )
        .for("update")
        .limit(1);
      const now = new Date();
      if (current && (current.expiresAt === null || current.expiresAt > now)) {
        return { grant: { id: current.id, coachMembershipId: input.coachMembershipId } };
      }
      if (current)
        await tx
          .update(athletePlanEditGrants)
          .set({ revoked_at: now })
          .where(
            and(
              eq(athletePlanEditGrants.engagement_id, relationship.engagementId),
              eq(athletePlanEditGrants.coach_membership_id, input.coachMembershipId),
              isNull(athletePlanEditGrants.revoked_at),
              sql`${athletePlanEditGrants.expires_at} is not null and ${athletePlanEditGrants.expires_at} <= ${now}`,
            ),
          );
      const [grant] = await tx
        .insert(athletePlanEditGrants)
        .values({
          id: randomUUID(),
          organization_id: input.organizationId,
          engagement_id: relationship.engagementId,
          athlete_profile_id: ctx.session.user.id,
          coach_membership_id: input.coachMembershipId,
          granted_by_profile_id: ctx.session.user.id,
        })
        .returning({
          id: athletePlanEditGrants.id,
          coachMembershipId: athletePlanEditGrants.coach_membership_id,
        });
      return { grant };
    });
  }),
  revoke: protectedProcedure.input(revokeInput).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const [grant] = await withProfileFencedRepeatableReadSnapshot(db, ctx.session.user.id, (tx) =>
      tx
        .update(athletePlanEditGrants)
        .set({ revoked_at: new Date() })
        .where(
          and(
            eq(athletePlanEditGrants.id, input.grantId),
            eq(athletePlanEditGrants.athlete_profile_id, ctx.session.user.id),
            isNull(athletePlanEditGrants.revoked_at),
          ),
        )
        .returning({ id: athletePlanEditGrants.id }),
    );
    if (!grant) throw new TRPCError({ code: "NOT_FOUND", message: "Plan-edit grant not found" });
    return { revoked: true as const, grantId: grant.id };
  }),
  preview: protectedProcedure
    .input(publishInput.omit({ operationId: true }))
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const [workout] = await db
        .select({
          id: activityPlans.id,
          name: activityPlans.name,
          revision: activityPlans.revision,
        })
        .from(activityPlans)
        .where(
          and(
            eq(activityPlans.id, input.activityPlanId),
            eq(activityPlans.profile_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!workout)
        throw new TRPCError({ code: "FORBIDDEN", message: "Workout is not owned by this coach" });
      const [athlete] = await db
        .select({ planningTimezone: profiles.planning_timezone })
        .from(profiles)
        .where(eq(profiles.id, input.athleteProfileId))
        .limit(1);
      if (!athlete?.planningTimezone)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Athlete planning time zone is unavailable",
        });
      if (!isValidIanaTimeZone(athlete.planningTimezone))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Athlete planning time zone is invalid",
        });
      if (
        input.planningDate <
        getCalendarDateInIanaZone(new Date().toISOString(), athlete.planningTimezone)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Planning date must be today or later for the athlete",
        });
      const now = new Date();
      const [authority] = await db
        .select({ id: athletePlanEditGrants.id })
        .from(athletePlanEditGrants)
        .innerJoin(
          coachingAssignments,
          and(
            eq(coachingAssignments.engagement_id, athletePlanEditGrants.engagement_id),
            eq(coachingAssignments.coach_membership_id, athletePlanEditGrants.coach_membership_id),
          ),
        )
        .innerJoin(
          coachingEngagements,
          eq(coachingEngagements.id, coachingAssignments.engagement_id),
        )
        .innerJoin(
          organizationMemberships,
          eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
        )
        .innerJoin(
          organizationMembershipRoleGrants,
          eq(
            organizationMembershipRoleGrants.membership_id,
            coachingAssignments.coach_membership_id,
          ),
        )
        .innerJoin(organizations, eq(organizations.id, athletePlanEditGrants.organization_id))
        .where(
          and(
            eq(athletePlanEditGrants.organization_id, input.organizationId),
            eq(athletePlanEditGrants.athlete_profile_id, input.athleteProfileId),
            eq(athletePlanEditGrants.coach_membership_id, input.coachMembershipId),
            isNull(athletePlanEditGrants.revoked_at),
            sql`(${athletePlanEditGrants.expires_at} is null or ${athletePlanEditGrants.expires_at} > ${now})`,
            isNull(coachingAssignments.ended_at),
            sql`${coachingAssignments.assigned_at} <= ${now}`,
            isNull(coachingEngagements.ended_at),
            isNull(coachingEngagements.paused_at),
            eq(organizationMemberships.profile_id, ctx.session.user.id),
            isNull(organizationMemberships.ended_at),
            isNull(organizationMemberships.suspended_at),
            eq(organizationMembershipRoleGrants.role_key, "coach"),
            isNull(organizationMembershipRoleGrants.revoked_at),
            sql`${organizationMembershipRoleGrants.granted_at} <= ${now}`,
            isNull(organizations.closed_at),
            isNull(organizations.suspended_at),
          ),
        )
        .limit(1);
      if (!authority)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Athlete plan-edit permission is unavailable",
        });
      return {
        athleteProfileId: input.athleteProfileId,
        athleteTimezone: athlete.planningTimezone,
        planningDate: input.planningDate,
        workout,
        versionMatches: workout.revision === input.activityPlanRevision,
      };
    }),
  publish: protectedProcedure.input(publishInput).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    try {
      return await withProfileFencedRepeatableReadSnapshot(db, input.athleteProfileId, (tx) =>
        publishCoachWorkout({ tx, actorProfileId: ctx.session.user.id, ...input, now: new Date() }),
      );
    } catch (error) {
      return map(error);
    }
  }),
});
