import { organizationMembershipRoleGrants, organizationMemberships } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});

test("administrator confirms staff termination while owner identity remains protected", async ({
  athletePage,
  coachActor,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Staff workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`staff-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization route identity");
  const membershipId = e2eIdentity.uuid("staff-membership");
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
    });
  });
  await athletePage.getByRole("link", { name: "Manage staff", exact: true }).click();
  await expect(
    athletePage.getByRole("heading", { name: "Staff roster", exact: true }),
  ).toBeVisible();
  await expect(
    athletePage.getByText("You cannot end your own membership.", { exact: true }),
  ).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /^End membership for/ })).toHaveCount(1);
  await athletePage.getByRole("button", { name: /^End membership for/ }).click();
  await expect(athletePage.getByRole("alertdialog")).toBeVisible();
  await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, membershipId));
    expect(row?.ended_at).toBeNull();
  });
  await athletePage.getByRole("button", { name: /^End membership for/ }).click();
  await athletePage.getByRole("button", { name: "End membership", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: /^End membership for/ })).toHaveCount(0);
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, membershipId));
    expect(row?.ended_at).toBeInstanceOf(Date);
    const grants = await database.db
      .select()
      .from(organizationMembershipRoleGrants)
      .where(eq(organizationMembershipRoleGrants.membership_id, membershipId));
    expect(grants).toHaveLength(1);
    expect(grants[0]?.revoked_at).toBeInstanceOf(Date);
  });
  await athletePage.reload();
  await expect(athletePage.getByRole("button", { name: /^End membership for/ })).toHaveCount(0);
  await expect(
    athletePage.getByText("You cannot end your own membership.", { exact: true }),
  ).toBeVisible();
});
