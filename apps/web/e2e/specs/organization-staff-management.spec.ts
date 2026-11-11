import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});

test("owner manages roles and suspension without restoring assignments or changing consent", async ({
  athletePage,
  athleteActor,
  coachActor,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Staff management");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`staff-management-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/.test(organizationId)) {
    throw new Error("Missing created organization UUID route identity");
  }
  const ids = {
    membership: e2eIdentity.uuid("staff-membership"),
    engagement: e2eIdentity.uuid("staff-engagement"),
    group: e2eIdentity.uuid("staff-group"),
    policy: e2eIdentity.uuid("staff-consent-policy"),
    consent: e2eIdentity.uuid("staff-consent"),
  };
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      const [organization] = await transaction
        .select({ rootMembershipId: organizations.root_owner_membership_id })
        .from(organizations)
        .where(eq(organizations.id, organizationId));
      if (!organization?.rootMembershipId) throw new Error("Missing root membership");
      await transaction.insert(organizationMemberships).values({
        id: ids.membership,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: ids.membership,
        role_key: "coach",
      });
      await transaction.insert(coachingEngagements).values({
        id: ids.engagement,
        organization_id: organizationId,
        athlete_profile_id: athleteActor.profileId,
      });
      await transaction.insert(coachingAssignments).values({
        organization_id: organizationId,
        engagement_id: ids.engagement,
        coach_membership_id: ids.membership,
        assignment_kind: "primary",
      });
      await transaction.insert(organizationGroups).values({
        id: ids.group,
        organization_id: organizationId,
        name: "Suspension coverage group",
        created_by_membership_id: organization.rootMembershipId,
      });
      await transaction.insert(organizationGroupCoachAssignments).values({
        organization_id: organizationId,
        group_id: ids.group,
        coach_membership_id: ids.membership,
        assigned_by_membership_id: organization.rootMembershipId,
      });
      await transaction.insert(athleteConsentPolicyVersions).values({
        id: ids.policy,
        scope_key: "training",
        effective_from: new Date(Date.now() - 1_000),
        jurisdiction: "e2e",
        terms_text: "Disposable staff-management consent",
        content_digest: e2eIdentity.uuid("staff-consent-digest"),
      });
      await transaction.insert(athleteDataSharingConsents).values({
        id: ids.consent,
        organization_id: organizationId,
        engagement_id: ids.engagement,
        athlete_profile_id: athleteActor.profileId,
        scope_key: "training",
        policy_version_id: ids.policy,
        granted_by_profile_id: athleteActor.profileId,
      });
    });
  });
  await athletePage.getByRole("link", { name: "Manage staff", exact: true }).click();
  const staffRow = athletePage
    .getByRole("list", { name: "Active staff roster", exact: true })
    .getByRole("listitem")
    .filter({ has: athletePage.getByRole("button", { name: /^Suspend / }) });
  await expect(staffRow).toHaveCount(1);
  await staffRow.getByRole("button", { name: "Grant admin", exact: true }).click();
  await athletePage
    .getByRole("alertdialog")
    .getByRole("button", { name: "Grant admin", exact: true })
    .click();
  await expect(staffRow.getByRole("button", { name: "Revoke admin", exact: true })).toBeVisible();
  await staffRow.getByRole("button", { name: "Revoke coach", exact: true }).click();
  await athletePage
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revoke coach", exact: true })
    .click();
  await expect(staffRow.getByRole("button", { name: "Grant coach", exact: true })).toBeVisible();
  await staffRow.getByRole("button", { name: /^Suspend / }).click();
  await athletePage.getByRole("button", { name: "Suspend membership", exact: true }).click();
  await expect(athletePage.getByRole("status").filter({ hasText: "was suspended" })).toBeVisible();
  await athletePage.getByRole("link", { name: "Suspended", exact: true }).click();
  await athletePage.getByRole("button", { name: /^Resume / }).click();
  await athletePage.getByRole("button", { name: "Resume membership", exact: true }).click();
  await expect(athletePage.getByRole("status").filter({ hasText: "was resumed" })).toBeVisible();
  await withLocalE2EDatabase(async (database) => {
    const [membership] = await database.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, ids.membership));
    expect(membership?.suspended_at).toBeNull();
    const activeRoles = await database.db
      .select()
      .from(organizationMembershipRoleGrants)
      .where(
        and(
          eq(organizationMembershipRoleGrants.membership_id, ids.membership),
          isNull(organizationMembershipRoleGrants.revoked_at),
        ),
      );
    expect(activeRoles.map((role) => role.role_key)).toEqual(["admin"]);
    const [direct] = await database.db
      .select({ endedAt: coachingAssignments.ended_at })
      .from(coachingAssignments)
      .where(eq(coachingAssignments.engagement_id, ids.engagement));
    const [group] = await database.db
      .select({ endedAt: organizationGroupCoachAssignments.ended_at })
      .from(organizationGroupCoachAssignments)
      .where(eq(organizationGroupCoachAssignments.group_id, ids.group));
    expect(direct?.endedAt).toBeInstanceOf(Date);
    expect(group?.endedAt).toBeInstanceOf(Date);
    const [consent] = await database.db
      .select({
        id: athleteDataSharingConsents.id,
        endedAt: athleteDataSharingConsents.ended_at,
        policyId: athleteDataSharingConsents.policy_version_id,
      })
      .from(athleteDataSharingConsents)
      .where(eq(athleteDataSharingConsents.id, ids.consent));
    expect(consent).toMatchObject({ id: ids.consent, endedAt: null, policyId: ids.policy });
    const [engagement] = await database.db
      .select({ endedAt: coachingEngagements.ended_at, pausedAt: coachingEngagements.paused_at })
      .from(coachingEngagements)
      .where(eq(coachingEngagements.id, ids.engagement));
    expect(engagement).toEqual({ endedAt: null, pausedAt: null });
  });
});
