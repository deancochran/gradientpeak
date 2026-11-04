import { organizationInvitations } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test("administrator creates and revokes an invitation without implying email delivery", async ({
  athletePage,
  coachActor,
  e2eIdentity,
}) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Invitation workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`invite-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  await athletePage.getByRole("link", { name: "Manage invitations", exact: true }).click();
  await expect(
    athletePage.getByRole("heading", { name: "Organization invitations", exact: true }),
  ).toBeVisible();
  await expect(athletePage.getByText(/No email is sent/)).toBeVisible();
  await athletePage.getByLabel("Recipient email", { exact: true }).fill(coachActor.email);
  await athletePage.getByLabel("Expires at", { exact: true }).fill("2030-01-01T12:00");
  await athletePage.getByRole("button", { name: "Create invitation", exact: true }).click();
  await expect(
    athletePage.getByRole("button", { name: "Dismiss token", exact: true }),
  ).toBeVisible();
  await athletePage.getByRole("button", { name: "Dismiss token", exact: true }).click();
  await withLocalE2EDatabase(async ({ db }) => {
    const rows = await db
      .select({
        status: organizationInvitations.status,
        kind: organizationInvitations.invitation_kind,
        role: organizationInvitations.requested_role_key,
      })
      .from(organizationInvitations)
      .where(eq(organizationInvitations.organization_id, organizationId));
    expect(rows).toEqual([{ status: "pending", kind: "staff", role: "coach" }]);
  });
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByRole("button", { name: "Dismiss token", exact: true })).toHaveCount(
    0,
  );
  await athletePage.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
  await athletePage.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await athletePage
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: "Invitation revoked." }),
  ).toBeVisible();
  await withLocalE2EDatabase(async ({ db }) => {
    const rows = await db
      .select({ status: organizationInvitations.status })
      .from(organizationInvitations)
      .where(eq(organizationInvitations.organization_id, organizationId));
    expect(rows).toEqual([{ status: "revoked" }]);
  });
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText("revoked", { exact: true })).toBeVisible();
  await expect(
    athletePage.getByRole("button", { name: "Revoke invitation", exact: true }),
  ).toHaveCount(0);
});
