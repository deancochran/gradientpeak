import { randomUUID } from "node:crypto";
import { db } from "@repo/db/client";
import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
  users,
} from "@repo/db/schema";
import { sql } from "drizzle-orm";
import { createApiContext } from "../../context";
import { appRouter } from "../../routers";

export async function person(label: string) {
  const id = randomUUID();
  const email = `${id}@delegated-calendar.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    is_public: false,
    onboarding_status: "completed",
    username: `calendar-${id.slice(0, 8)}`,
  });
  return id;
}

export async function caller(id: string) {
  return appRouter.createCaller(
    await createApiContext({
      db,
      headers: new Headers({ "x-api-source": "vitest-live" }),
      auth: {
        session: {
          sessionId: randomUUID(),
          transport: "cookie",
          user: { id, email: `${id}@delegated-calendar.test`, emailVerified: true },
        },
      },
    }),
  );
}

export async function activeCalendarRelationship(
  coachId: string,
  athleteId: string,
  options: {
    expiredConsent?: boolean;
    includeConsent?: boolean;
    scope?: "calendar" | "training";
  } = {},
) {
  const organizationId = randomUUID();
  const membershipId = randomUUID();
  const rootOwnerMembershipId = randomUUID();
  const engagementId = randomUUID();
  const policyVersionId = randomUUID();
  const ownerId = await person("Calendar root owner");
  await db.transaction(async (tx) => {
    await tx.execute("set constraints all deferred");
    await tx.insert(organizations).values({
      id: organizationId,
      created_by_profile_id: ownerId,
      root_owner_membership_id: rootOwnerMembershipId,
      name: "Calendar coaching",
      slug: `calendar-${organizationId}`,
      timezone: "UTC",
    });
    await tx.insert(organizationMemberships).values({
      id: rootOwnerMembershipId,
      organization_id: organizationId,
      profile_id: ownerId,
    });
    await tx.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: rootOwnerMembershipId,
      role_key: "admin",
    });
    await tx.insert(organizationMemberships).values({
      id: membershipId,
      organization_id: organizationId,
      profile_id: coachId,
    });
    await tx.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: membershipId,
      role_key: "coach",
    });
    await tx.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: athleteId,
    });
    await tx.insert(coachingAssignments).values({
      organization_id: organizationId,
      engagement_id: engagementId,
      coach_membership_id: membershipId,
      assignment_kind: "primary",
    });
    if (options.includeConsent !== false) {
      const scope = options.scope ?? "calendar";
      await tx.insert(athleteConsentPolicyVersions).values({
        id: policyVersionId,
        scope_key: scope,
        effective_from: sql`now() - interval '1 second'`,
        jurisdiction: "US",
        terms_text: "Calendar terms",
        content_digest: `sha256:${policyVersionId}`,
      });
      if (options.expiredConsent) {
        await tx.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: engagementId,
          athlete_profile_id: athleteId,
          scope_key: scope,
          policy_version_id: policyVersionId,
          granted_by_profile_id: athleteId,
          granted_at: sql`now() - interval '2 seconds'`,
          expires_at: sql`now() - interval '1 second'`,
        });
      } else {
        await tx.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: engagementId,
          athlete_profile_id: athleteId,
          scope_key: scope,
          policy_version_id: policyVersionId,
          granted_by_profile_id: athleteId,
        });
      }
    }
  });
  return { engagementId, membershipId, organizationId, policyVersionId };
}
