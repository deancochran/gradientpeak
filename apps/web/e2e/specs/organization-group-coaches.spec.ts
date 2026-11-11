import {
  organizationGroupCoachAssignments,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test("administrator removes a group coach assignment without ending staff membership", async ({
  athletePage,
  coachActor,
  e2eIdentity,
}) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Group coach workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`coaches-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const membershipId = e2eIdentity.uuid("membership");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (db) => {
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await db.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membershipId,
        role_key: "coach",
      });
    });
  });
  await athletePage.getByRole("link", { name: "Manage organization groups", exact: true }).click();
  await athletePage.getByLabel("Name", { exact: true }).fill("Coach links group");
  await athletePage.getByRole("button", { name: "Create group", exact: true }).click();
  await athletePage
    .getByRole("list", { name: "Organization groups" })
    .getByRole("link", { name: /Coach links group/ })
    .click();
  const groupId = new URL(athletePage.url()).pathname.split("/").at(-1);
  if (!groupId) throw new Error("Missing group identity");
  await athletePage.getByRole("link", { name: "Manage group coaches", exact: true }).click();
  await athletePage
    .getByRole("combobox", { name: "Coach", exact: true })
    .selectOption(membershipId);
  await athletePage.getByRole("button", { name: "Assign coach", exact: true }).click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: "Coach assigned." }),
  ).toBeVisible();
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  const assigned = athletePage.getByRole("list", { name: "Assigned coaches", exact: true });
  await expect(assigned.getByRole("listitem")).toHaveCount(1);
  await assigned.getByRole("button", { name: "Remove coach", exact: true }).click();
  await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
  await assigned.getByRole("button", { name: "Remove coach", exact: true }).click();
  await athletePage
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove coach", exact: true })
    .click();
  await expect(athletePage.getByRole("status").filter({ hasText: "Coach removed." })).toBeVisible();
  await withLocalE2EDatabase(async ({ db }) => {
    const links = await db
      .select()
      .from(organizationGroupCoachAssignments)
      .where(
        and(
          eq(organizationGroupCoachAssignments.group_id, groupId),
          eq(organizationGroupCoachAssignments.coach_membership_id, membershipId),
        ),
      );
    expect(links).toHaveLength(1);
    expect(links[0]?.ended_at).toBeInstanceOf(Date);
    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, membershipId));
    expect(membership?.ended_at).toBeNull();
    const [role] = await db
      .select()
      .from(organizationMembershipRoleGrants)
      .where(
        and(
          eq(organizationMembershipRoleGrants.membership_id, membershipId),
          eq(organizationMembershipRoleGrants.role_key, "coach"),
        ),
      );
    expect(role?.revoked_at).toBeNull();
  });
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText("No coaches assigned.", { exact: true })).toBeVisible();
});
