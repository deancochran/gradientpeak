import { describe, expect, it } from "vitest";

import {
  ATHLETE_READ_ACCESS_DENIAL_REASONS,
  ATHLETE_READ_SCOPE_OPERATIONS,
  ATHLETE_READ_SCOPES,
  activitiesScopeProjectionSchema,
  administrativeCoachingRosterEntrySchema,
  assignedAthleteSummarySchema,
  athleteReadAccessDecisionSchema,
  athleteReadScopeProjectionFields,
  athleteReadScopeProjectionSchemas,
  basicProfileScopeProjectionSchema,
  calendarScopeProjectionSchema,
  evaluateOrganizationOperationRoleEligibility,
  goalsScopeProjectionSchema,
  metricsScopeProjectionSchema,
  ORGANIZATION_OPERATION_REQUIREMENTS,
  ORGANIZATION_OPERATIONS,
  organizationAccessDecisionSchema,
  organizationContextSchema,
  organizationOperationRoleEligibilityDecisionSchema,
  organizationStaffMembershipSummarySchema,
  scopedConsentSummarySchema,
  trainingScopeProjectionSchema,
} from "../index";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const instant = "2026-07-29T12:00:00.000Z";

describe("fixed organization authority", () => {
  it("has a closed role and operation matrix", () => {
    expect(ORGANIZATION_OPERATIONS).toHaveLength(16);
    expect(ORGANIZATION_OPERATION_REQUIREMENTS.transfer_root_ownership).toBe("root_owner");
    expect(ORGANIZATION_OPERATION_REQUIREMENTS.manage_administrators).toBe("root_owner");
    expect(ORGANIZATION_OPERATION_REQUIREMENTS.manage_coaches).toBe("admin");
    expect(ORGANIZATION_OPERATION_REQUIREMENTS.read_assigned_roster).toBe("coach");
    expect(ATHLETE_READ_SCOPES).toHaveLength(6);
    expect(ATHLETE_READ_SCOPE_OPERATIONS.metrics).toBe("read_athlete_metrics");
  });

  it("evaluates root, admin, and coach role eligibility without claiming athlete authorization", () => {
    for (const operation of ORGANIZATION_OPERATIONS) {
      const requirement = ORGANIZATION_OPERATION_REQUIREMENTS[operation];
      const root = evaluateOrganizationOperationRoleEligibility({
        operation,
        isRootOwner: true,
        isMember: true,
        roles: ["admin", "coach"],
      });
      expect(root.outcome).toBe("eligible");

      const admin = evaluateOrganizationOperationRoleEligibility({
        operation,
        isRootOwner: false,
        isMember: true,
        roles: ["admin"],
      });
      expect(admin.outcome).toBe(
        requirement === "root_owner" || requirement === "coach" ? "ineligible" : "eligible",
      );

      const coach = evaluateOrganizationOperationRoleEligibility({
        operation,
        isRootOwner: false,
        isMember: true,
        roles: ["coach"],
      });
      expect(coach.outcome).toBe(
        requirement === "member" || requirement === "coach" ? "eligible" : "ineligible",
      );
    }

    expect(
      evaluateOrganizationOperationRoleEligibility({
        operation: "read_athlete_activities",
        isRootOwner: false,
        isMember: true,
        roles: ["coach"],
      }),
    ).toEqual({
      outcome: "eligible",
      operation: "read_athlete_activities",
      requiresFullAthleteAuthorization: true,
    });
    expect(
      evaluateOrganizationOperationRoleEligibility({
        operation: "close_organization",
        isRootOwner: false,
        isMember: true,
        roles: ["admin"],
      }),
    ).toEqual({ outcome: "ineligible", operation: "close_organization", reason: "not_root_owner" });
    expect(
      evaluateOrganizationOperationRoleEligibility({
        operation: "read_organization_context",
        isRootOwner: false,
        isMember: false,
        roles: ["admin"],
      }),
    ).toEqual({
      outcome: "ineligible",
      operation: "read_organization_context",
      reason: "not_a_member",
    });
  });

  it("strictly parses organization and roster contracts", () => {
    const context = {
      organizationId: id,
      rootOwnerMembershipId: otherId,
      name: "Peak Coaching",
      slug: "peak-coaching",
      timezone: "America/Denver",
      suspendedAt: null,
      closedAt: null,
      createdAt: instant,
      updatedAt: instant,
    };
    expect(organizationContextSchema.parse(context)).toEqual(context);
    expect(
      organizationContextSchema.safeParse({ ...context, email: "nope@example.com" }).success,
    ).toBe(false);
    expect(
      organizationContextSchema.safeParse({ ...context, createdAt: "2026-07-29" }).success,
    ).toBe(false);

    expect(
      organizationStaffMembershipSummarySchema.safeParse({
        membershipId: id,
        profileId: otherId,
        roles: ["coach"],
        suspendedAt: null,
        endedAt: null,
        email: "nope@example.com",
      }).success,
    ).toBe(false);
    expect(
      organizationStaffMembershipSummarySchema.safeParse({
        membershipId: id,
        profileId: otherId,
        roles: ["coach"],
        suspendedAt: null,
        endedAt: null,
        displayName: "Coach",
      }).success,
    ).toBe(false);
    expect(
      administrativeCoachingRosterEntrySchema.safeParse({
        engagementId: id,
        athleteProfileId: otherId,
        engagementPausedAt: null,
        engagementEndedAt: null,
        hasActiveAssignment: true,
        displayName: "Athlete",
      }).success,
    ).toBe(false);
    expect(
      administrativeCoachingRosterEntrySchema.safeParse({
        engagementId: id,
        athleteProfileId: otherId,
        engagementPausedAt: null,
        engagementEndedAt: null,
        hasActiveAssignment: true,
        email: "forbidden@example.com",
      }).success,
    ).toBe(false);
    expect(
      assignedAthleteSummarySchema.safeParse({
        engagementId: id,
        athleteProfileId: otherId,
        assignmentId: "33333333-3333-4333-8333-333333333333",
        assignmentKind: "primary",
        assignedAt: instant,
        engagementPausedAt: null,
        engagementEndedAt: null,
        consents: [],
      }).success,
    ).toBe(true);
    expect(
      assignedAthleteSummarySchema.safeParse({
        engagementId: id,
        athleteProfileId: otherId,
        assignmentId: "33333333-3333-4333-8333-333333333333",
        assignmentKind: "primary",
        assignedAt: instant,
        engagementPausedAt: null,
        engagementEndedAt: null,
        consents: [],
        displayName: "Athlete",
      }).success,
    ).toBe(false);
    expect(
      scopedConsentSummarySchema.safeParse({
        scope: "activities",
        policyVersionId: id,
        grantedAt: instant,
        expiresAt: null,
        endedAt: null,
        route: "forbidden",
      }).success,
    ).toBe(false);
  });

  it("keeps every scope projection allowlisted and rejects prohibited fields", () => {
    expect(Object.keys(athleteReadScopeProjectionSchemas).sort()).toEqual(
      [...ATHLETE_READ_SCOPES].sort(),
    );
    expect(athleteReadScopeProjectionFields.basic_profile).not.toContain("email");
    expect(athleteReadScopeProjectionFields.activities).not.toContain("route");

    expect(
      basicProfileScopeProjectionSchema.safeParse({
        profileId: id,
        displayName: "Athlete",
        avatarReference: null,
        timezone: "America/Denver",
        preferredUnits: "metric",
        email: "forbidden@example.com",
      }).success,
    ).toBe(false);
    expect(
      basicProfileScopeProjectionSchema.safeParse({
        profileId: id,
        displayName: "Athlete",
        avatarReference: null,
        timezone: "America/Denver",
        preferredUnits: "metric",
      }).success,
    ).toBe(true);
    expect(
      trainingScopeProjectionSchema.safeParse({
        activePlan: null,
        plannedEvents: [],
        trainingSettings: { providerCredential: "forbidden" },
      }).success,
    ).toBe(false);
    expect(
      activitiesScopeProjectionSchema.safeParse({
        activities: [
          {
            activityId: id,
            category: "bike",
            startedAt: instant,
            finishedAt: instant,
            durationSeconds: 3600,
            distanceMeters: 20000,
            routeGeometry: "forbidden",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      activitiesScopeProjectionSchema.safeParse({
        activities: [
          {
            activityId: id,
            category: "bike",
            startedAt: instant,
            finishedAt: instant,
            durationSeconds: 3600,
            distanceMeters: 20000,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      activitiesScopeProjectionSchema.safeParse({
        activities: [
          {
            activityId: id,
            category: "ride",
            startedAt: instant,
            finishedAt: instant,
            durationSeconds: 3600,
            distanceMeters: 20000,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      metricsScopeProjectionSchema.safeParse({
        metrics: [
          {
            metricId: id,
            metricKey: "ftp",
            value: 250,
            unit: "watts",
            measuredAt: instant,
            provenance: "derived",
            bodyWeightKg: 70,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      goalsScopeProjectionSchema.safeParse({
        goals: [
          {
            goalId: id,
            title: "Bike threshold",
            priority: 5,
            activityCategory: "bike",
            targetDate: "2026-08-01",
            privateNotes: "forbidden",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      calendarScopeProjectionSchema.safeParse({
        events: [
          {
            eventId: id,
            startsAt: instant,
            activityCategory: "run",
            status: "scheduled",
            activityPlanId: null,
            location: "forbidden",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("has closed role-eligibility and final access decision outputs", () => {
    expect(
      organizationOperationRoleEligibilityDecisionSchema.safeParse({
        outcome: "eligible",
        operation: "read_athlete_goals",
        requiresFullAthleteAuthorization: true,
        assignmentComplete: true,
      }).success,
    ).toBe(false);
    expect(organizationAccessDecisionSchema.parse({ outcome: "allow" })).toEqual({
      outcome: "allow",
    });
    expect(
      organizationAccessDecisionSchema.parse({ outcome: "deny", reason: "missing_required_role" }),
    ).toEqual({ outcome: "deny", reason: "missing_required_role" });
    expect(
      organizationAccessDecisionSchema.safeParse({ outcome: "deny", reason: "consent_missing" })
        .success,
    ).toBe(false);
    expect(
      athleteReadAccessDecisionSchema.parse({
        outcome: "deny",
        scope: "activities",
        reason: "assignment_missing",
      }),
    ).toEqual({ outcome: "deny", scope: "activities", reason: "assignment_missing" });
    expect(
      athleteReadAccessDecisionSchema.safeParse({
        outcome: "allow",
        scope: "activities",
        consentVerified: true,
      }).success,
    ).toBe(false);
    expect(ATHLETE_READ_ACCESS_DENIAL_REASONS).toContain("consent_policy_not_effective");
    expect(
      athleteReadAccessDecisionSchema.parse({
        outcome: "deny",
        scope: "activities",
        reason: "consent_policy_not_effective",
      }),
    ).toEqual({
      outcome: "deny",
      scope: "activities",
      reason: "consent_policy_not_effective",
    });
  });
});
