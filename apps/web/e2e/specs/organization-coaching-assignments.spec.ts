import {
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});
test("owner assigns and ends direct coach responsibility without changing consent", async ({
  athletePage,
  athleteActor,
  coachActor,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Assignment management");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`assignment-management-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const membershipId = e2eIdentity.uuid("coach-membership"),
    engagementId = e2eIdentity.uuid("engagement");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      await transaction.insert(organizationMemberships).values({
        id: membershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membershipId,
        role_key: "coach",
      });
      await transaction.insert(coachingEngagements).values({
        id: engagementId,
        organization_id: organizationId,
        athlete_profile_id: athleteActor.profileId,
      });
    });
  });
  await athletePage.goto(`/organizations/${organizationId}/athletes`);
  await athletePage.getByRole("button", { name: "Manage coaches", exact: true }).click();
  await expect(athletePage.getByText(/separate from athlete consent/)).toBeVisible();
  await athletePage.getByRole("combobox", { name: "Eligible coach" }).click();
  await athletePage.getByRole("option", { name: /Organization coach|Coach/ }).click();
  await athletePage.getByRole("button", { name: "Assign coach" }).click();
  await athletePage.getByRole("button", { name: "Confirm responsibility change" }).click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: "Responsibility updated" }),
  ).toBeVisible();
  await athletePage.getByRole("button", { name: "End", exact: true }).click();
  await athletePage.getByRole("button", { name: "Confirm responsibility change" }).click();
  await expect(athletePage.getByRole("button", { name: "End", exact: true })).toHaveCount(0);
  await withLocalE2EDatabase(async (database) => {
    const rows = await database.db
      .select()
      .from(coachingAssignments)
      .where(eq(coachingAssignments.engagement_id, engagementId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ended_at).toBeInstanceOf(Date);
    const consents = await database.db
      .select({ id: athleteDataSharingConsents.id })
      .from(athleteDataSharingConsents)
      .where(eq(athleteDataSharingConsents.engagement_id, engagementId));
    expect(consents).toEqual([]);
  });
});
