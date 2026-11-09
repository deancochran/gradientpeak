import {
  organizationMembershipRoleGrants,
  organizationMemberships,
  profiles,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});

test("administrator reviews staff offboarding impact while owner identity remains protected", async ({
  athleteActor,
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
      await transaction
        .update(profiles)
        .set({ full_name: "Staff Workflow Owner" })
        .where(eq(profiles.id, athleteActor.profileId));
      await transaction
        .update(profiles)
        .set({ full_name: "Staff Workflow Coach" })
        .where(eq(profiles.id, coachActor.profileId));
    });
  });
  await athletePage
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Staff", exact: true })
    .click();
  await expect(
    athletePage.getByRole("heading", { name: "Staff roster", exact: true }),
  ).toBeVisible();
  const roster = athletePage.getByRole("list", { name: "Active staff roster", exact: true });
  const ownerRow = roster.getByRole("listitem").filter({ hasText: "Staff Workflow Owner" });
  const coachRow = roster.getByRole("listitem").filter({ hasText: "Staff Workflow Coach" });
  await expect(ownerRow).toHaveCount(1);
  await expect(coachRow).toHaveCount(1);
  await expect(ownerRow.getByRole("button", { name: /^End membership for/ })).toHaveCount(0);
  await expect(coachRow.getByRole("button", { name: /^End membership for/ })).toHaveCount(0);
  await ownerRow.getByRole("button", { name: "Review offboarding impact", exact: true }).click();
  await expect(athletePage.getByRole("alertdialog")).toContainText(
    "You cannot offboard your own membership.",
  );
  await expect(
    athletePage
      .getByRole("alertdialog")
      .getByRole("button", { name: /end membership|confirm offboarding/i }),
  ).toHaveCount(0);
  await athletePage.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    coachRow.getByRole("button", { name: "Review offboarding impact", exact: true }),
  ).toBeVisible();
  await coachRow.getByRole("button", { name: "Review offboarding impact", exact: true }).click();
  await expect(athletePage.getByRole("alertdialog")).toContainText(
    "Start a handover before any future offboarding workflow is completed.",
  );
  await expect(athletePage.getByRole("alertdialog")).toContainText(
    "resources are unavailable and have not been assessed",
  );
  await expect(
    athletePage
      .getByRole("alertdialog")
      .getByRole("button", { name: /end membership|confirm offboarding/i }),
  ).toHaveCount(0);
  await athletePage.getByRole("button", { name: "Close", exact: true }).click();
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, membershipId));
    expect(row?.ended_at).toBeNull();
    const grants = await database.db
      .select()
      .from(organizationMembershipRoleGrants)
      .where(eq(organizationMembershipRoleGrants.membership_id, membershipId));
    expect(grants).toHaveLength(1);
    expect(grants[0]?.revoked_at).toBeNull();
  });
  await athletePage.reload();
  await expect(ownerRow.getByRole("button", { name: /^End membership for/ })).toHaveCount(0);
  await expect(coachRow.getByRole("button", { name: /^End membership for/ })).toHaveCount(0);
  await expect(
    ownerRow.getByRole("button", { name: "Review offboarding impact", exact: true }),
  ).toHaveCount(1);
  await expect(
    coachRow.getByRole("button", { name: "Review offboarding impact", exact: true }),
  ).toHaveCount(1);
});
