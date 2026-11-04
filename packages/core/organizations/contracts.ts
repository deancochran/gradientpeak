import { z } from "zod";

import { athletePerformanceTargetFactsSchema } from "../performance-model";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { eventStatusSchema } from "../schemas/planned_activity";
import { preferredUnitSystemSchema } from "../units";
import {
  ATHLETE_READ_ACCESS_DENIAL_REASONS,
  ATHLETE_READ_SCOPES,
  ORGANIZATION_OPERATION_REQUIREMENTS,
  ORGANIZATION_OPERATIONS,
  ORGANIZATION_ROLE_KEYS,
} from "./constants";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

export const organizationRoleKeySchema = z.enum(ORGANIZATION_ROLE_KEYS);
export const organizationOperationSchema = z.enum(ORGANIZATION_OPERATIONS);
export const athleteReadScopeSchema = z.enum(ATHLETE_READ_SCOPES);

export const organizationContextSchema = z
  .object({
    organizationId: uuidSchema,
    rootOwnerMembershipId: uuidSchema,
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(100),
    suspendedAt: instantSchema.nullable(),
    closedAt: instantSchema.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .readonly();
export type OrganizationContext = z.infer<typeof organizationContextSchema>;

export const organizationStaffMembershipSummarySchema = z
  .object({
    membershipId: uuidSchema,
    profileId: uuidSchema,
    roles: z.array(organizationRoleKeySchema).readonly(),
    suspendedAt: instantSchema.nullable(),
    endedAt: instantSchema.nullable(),
  })
  .strict()
  .readonly();
export type OrganizationStaffMembershipSummary = z.infer<
  typeof organizationStaffMembershipSummarySchema
>;

export const administrativeCoachingRosterEntrySchema = z
  .object({
    engagementId: uuidSchema,
    athleteProfileId: uuidSchema,
    engagementPausedAt: instantSchema.nullable(),
    engagementEndedAt: instantSchema.nullable(),
    hasActiveAssignment: z.boolean(),
  })
  .strict()
  .readonly();
export type AdministrativeCoachingRosterEntry = z.infer<
  typeof administrativeCoachingRosterEntrySchema
>;

export const scopedConsentSummarySchema = z
  .object({
    scope: athleteReadScopeSchema,
    policyVersionId: uuidSchema,
    grantedAt: instantSchema,
    expiresAt: instantSchema.nullable(),
    endedAt: instantSchema.nullable(),
  })
  .strict()
  .readonly();
export type ScopedConsentSummary = z.infer<typeof scopedConsentSummarySchema>;

export const assignedAthleteSummarySchema = z
  .object({
    engagementId: uuidSchema,
    athleteProfileId: uuidSchema,
    assignmentId: uuidSchema,
    assignmentKind: z.enum(["primary", "supporting"]),
    assignedAt: instantSchema,
    engagementPausedAt: instantSchema.nullable(),
    engagementEndedAt: instantSchema.nullable(),
    consents: z.array(scopedConsentSummarySchema).readonly(),
  })
  .strict()
  .readonly();
export type AssignedAthleteSummary = z.infer<typeof assignedAthleteSummarySchema>;

export const organizationAccessDecisionSchema = z.discriminatedUnion("outcome", [
  z
    .object({ outcome: z.literal("allow") })
    .strict()
    .readonly(),
  z
    .object({
      outcome: z.literal("deny"),
      reason: z.enum(["not_root_owner", "missing_required_role", "not_a_member"]),
    })
    .strict()
    .readonly(),
]);
export type OrganizationAccessDecision = z.infer<typeof organizationAccessDecisionSchema>;

/** The completed, fail-closed decision shape once a caller has checked the full athlete-read chain. */
export const athleteReadAccessDecisionSchema = z.discriminatedUnion("outcome", [
  z
    .object({ outcome: z.literal("allow"), scope: athleteReadScopeSchema })
    .strict()
    .readonly(),
  z
    .object({
      outcome: z.literal("deny"),
      scope: athleteReadScopeSchema,
      reason: z.enum(ATHLETE_READ_ACCESS_DENIAL_REASONS),
    })
    .strict()
    .readonly(),
]);
export type AthleteReadAccessDecision = z.infer<typeof athleteReadAccessDecisionSchema>;

/**
 * A role-eligibility result for an athlete read is deliberately not full authorization.
 * Callers must additionally verify organization/membership/engagement/assignment/consent state.
 */
export const organizationOperationRoleEligibilityDecisionSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("eligible"),
      operation: organizationOperationSchema,
      requiresFullAthleteAuthorization: z.boolean(),
    })
    .strict()
    .readonly(),
  z
    .object({
      outcome: z.literal("ineligible"),
      operation: organizationOperationSchema,
      reason: z.enum(["not_root_owner", "missing_required_role", "not_a_member"]),
    })
    .strict()
    .readonly(),
]);
export type OrganizationOperationRoleEligibilityDecision = z.infer<
  typeof organizationOperationRoleEligibilityDecisionSchema
>;

const coachingCalendarEventStatusSchema = eventStatusSchema;

export const basicProfileScopeProjectionSchema = z
  .object({
    profileId: uuidSchema,
    displayName: z.string().trim().min(1).max(120),
    avatarReference: z.string().trim().min(1).max(500).nullable(),
    timezone: z.string().trim().min(1).max(100),
    preferredUnits: preferredUnitSystemSchema,
  })
  .strict()
  .readonly();

export const trainingScopeProjectionSchema = z
  .object({
    activePlan: z
      .object({ trainingPlanId: uuidSchema, name: z.string().trim().min(1).max(200) })
      .strict()
      .nullable(),
    plannedEvents: z
      .array(
        z
          .object({
            eventId: uuidSchema,
            startsAt: instantSchema,
            activityCategory: canonicalActivityCategorySchema,
            status: coachingCalendarEventStatusSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const activitiesScopeProjectionSchema = z
  .object({
    activities: z
      .array(
        z
          .object({
            activityId: uuidSchema,
            category: canonicalActivityCategorySchema,
            startedAt: instantSchema,
            finishedAt: instantSchema,
            durationSeconds: z.number().int().nonnegative(),
            distanceMeters: z.number().finite().nonnegative().nullable(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const metricsScopeProjectionSchema = z
  .object({
    performanceTargets: athletePerformanceTargetFactsSchema,
  })
  .strict()
  .readonly();

export const goalsScopeProjectionSchema = z
  .object({
    goals: z
      .array(
        z
          .object({
            goalId: uuidSchema,
            title: z.string().trim().min(1).max(100),
            priority: z.number().int().min(0).max(10),
            activityCategory: canonicalActivityCategorySchema,
            targetDate: z.string().date(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const calendarScopeProjectionSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            eventId: uuidSchema,
            startsAt: instantSchema,
            activityCategory: canonicalActivityCategorySchema,
            status: coachingCalendarEventStatusSchema,
            activityPlanId: uuidSchema.nullable(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const athleteReadScopeProjectionSchemas = {
  basic_profile: basicProfileScopeProjectionSchema,
  training: trainingScopeProjectionSchema,
  activities: activitiesScopeProjectionSchema,
  metrics: metricsScopeProjectionSchema,
  goals: goalsScopeProjectionSchema,
  calendar: calendarScopeProjectionSchema,
} as const;

export const athleteReadScopeProjectionFields = {
  basic_profile: ["profileId", "displayName", "avatarReference", "timezone", "preferredUnits"],
  training: ["activePlan", "plannedEvents"],
  activities: ["activities"],
  metrics: ["performanceTargets"],
  goals: ["goals"],
  calendar: ["events"],
} as const satisfies Record<(typeof ATHLETE_READ_SCOPES)[number], readonly string[]>;

export type AthleteReadScopeProjection = {
  [Scope in keyof typeof athleteReadScopeProjectionSchemas]: z.infer<
    (typeof athleteReadScopeProjectionSchemas)[Scope]
  >;
};

export function evaluateOrganizationOperationRoleEligibility(input: {
  readonly operation: z.infer<typeof organizationOperationSchema>;
  readonly isRootOwner: boolean;
  readonly isMember: boolean;
  readonly roles: readonly z.infer<typeof organizationRoleKeySchema>[];
}): OrganizationOperationRoleEligibilityDecision {
  if (!input.isMember) {
    return { outcome: "ineligible", operation: input.operation, reason: "not_a_member" };
  }

  const requirement = ORGANIZATION_OPERATION_REQUIREMENTS[input.operation];
  if (requirement === "root_owner") {
    return input.isRootOwner
      ? { outcome: "eligible", operation: input.operation, requiresFullAthleteAuthorization: false }
      : { outcome: "ineligible", operation: input.operation, reason: "not_root_owner" };
  }

  if (requirement === "member" || input.roles.includes(requirement)) {
    return {
      outcome: "eligible",
      operation: input.operation,
      requiresFullAthleteAuthorization: requirement === "coach",
    };
  }

  return { outcome: "ineligible", operation: input.operation, reason: "missing_required_role" };
}
