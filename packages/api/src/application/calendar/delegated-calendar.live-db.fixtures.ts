import { randomUUID } from "node:crypto";
import { db } from "@repo/db/client";
import { profiles, users } from "@repo/db/schema";
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
    await tx.execute(sql`insert into organizations (id, created_by_profile_id, root_owner_membership_id, name, slug, timezone)
      values (${organizationId}::uuid, ${ownerId}::uuid, ${rootOwnerMembershipId}::uuid, 'Calendar coaching', ${`calendar-${organizationId}`}, 'UTC')`);
    await tx.execute(sql`insert into organization_memberships (id, organization_id, profile_id)
      values (${rootOwnerMembershipId}::uuid, ${organizationId}::uuid, ${ownerId}::uuid)`);
    await tx.execute(sql`insert into organization_membership_role_grants (organization_id, membership_id, role_key)
      values (${organizationId}::uuid, ${rootOwnerMembershipId}::uuid, 'admin')`);
    await tx.execute(sql`insert into organization_memberships (id, organization_id, profile_id)
      values (${membershipId}::uuid, ${organizationId}::uuid, ${coachId}::uuid)`);
    await tx.execute(sql`insert into organization_membership_role_grants (organization_id, membership_id, role_key)
      values (${organizationId}::uuid, ${membershipId}::uuid, 'coach')`);
    await tx.execute(sql`insert into coaching_engagements (id, organization_id, athlete_profile_id)
      values (${engagementId}::uuid, ${organizationId}::uuid, ${athleteId}::uuid)`);
    await tx.execute(sql`insert into coaching_assignments (organization_id, engagement_id, coach_membership_id, assignment_kind)
      values (${organizationId}::uuid, ${engagementId}::uuid, ${membershipId}::uuid, 'primary')`);
    if (options.includeConsent !== false) {
      const scope = options.scope ?? "calendar";
      await tx.execute(sql`insert into athlete_consent_policy_versions
        (id, scope_key, effective_from, jurisdiction, terms_text, content_digest)
        values (${policyVersionId}::uuid, ${scope}, now() - interval '1 second', 'US', 'Calendar terms', ${`sha256:${policyVersionId}`})`);
      if (options.expiredConsent) {
        await tx.execute(sql`insert into athlete_data_sharing_consents
          (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id, granted_at, expires_at)
          values (${organizationId}::uuid, ${engagementId}::uuid, ${athleteId}::uuid, ${scope}, ${policyVersionId}::uuid, ${athleteId}::uuid, now() - interval '2 seconds', now() - interval '1 second')`);
      } else {
        await tx.execute(sql`insert into athlete_data_sharing_consents
          (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id)
          values (${organizationId}::uuid, ${engagementId}::uuid, ${athleteId}::uuid, ${scope}, ${policyVersionId}::uuid, ${athleteId}::uuid)`);
      }
    }
  });
  return { engagementId, membershipId, organizationId, policyVersionId };
}
