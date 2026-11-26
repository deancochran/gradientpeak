import { createHash, randomBytes } from "node:crypto";
import type { Page, TestInfo } from "@playwright/test";
import { organizationInvitations, organizationMemberships } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

const viewports = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "mobile", width: 390, height: 844 },
] as const;

async function captureAcceptedRelationship(page: Page, testInfo: TestInfo) {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByText(/Current relationship: staff active/i)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`O12--already--${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
}

test("administrator inspects an accepted staff invitation and navigates to staff management", async ({
  athleteActor,
  athletePage,
  coachActor,
  coachPage,
  e2eIdentity,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Accepted invitation");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`accepted-invite-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new Error("Missing created organization UUID route identity");

  const invitationId = e2eIdentity.uuid("invitation");
  const token = randomBytes(32).toString("base64url");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (db) => {
      const [owner] = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            eq(organizationMemberships.profile_id, athleteActor.profileId),
          ),
        );
      if (!owner) throw new Error("Missing owner membership");
      await db.insert(organizationInvitations).values({
        id: invitationId,
        organization_id: organizationId,
        invited_by_membership_id: owner.id,
        invitation_kind: "staff",
        requested_role_key: "coach",
        invited_profile_id: coachActor.profileId,
        token_digest: createHash("sha256").update(token).digest("hex"),
        expires_at: new Date(Date.now() + 86_400_000),
      });
    });
  });

  await coachPage.goto("/organizations");
  await coachPage.getByRole("link", { name: "My organization invitations", exact: true }).click();
  await coachPage.getByLabel("Invitation token", { exact: true }).fill(token);
  await coachPage.getByRole("button", { name: "Preview invitation", exact: true }).click();
  await coachPage.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(
    coachPage.getByRole("status").filter({ hasText: "Invitation accepted." }),
  ).toBeVisible();

  await athletePage.goto(`/organizations/${organizationId}/invitations`);
  await athletePage
    .getByRole("button", { name: "Inspect accepted relationship", exact: true })
    .click();
  await expect(athletePage.getByText(/Current relationship: staff active/i)).toBeVisible();
  await captureAcceptedRelationship(athletePage, testInfo);
  await athletePage.setViewportSize({ width: 1440, height: 1000 });
  await athletePage.getByRole("link", { name: "Manage staff memberships", exact: true }).click();
  await expect(athletePage).toHaveURL(
    (url) =>
      url.pathname === `/organizations/${organizationId}/staff` &&
      url.searchParams.get("status") === "active",
  );
  const staffDestination = new URL(athletePage.url());
  expect(staffDestination.pathname).toBe(`/organizations/${organizationId}/staff`);
  expect(staffDestination.searchParams.get("status")).toBe("active");
  await expect(
    athletePage.getByRole("heading", { name: "Staff roster", exact: true }),
  ).toBeVisible();

  await coachPage.goto(`/organizations/${organizationId}/invitations`);
  await expect(
    coachPage.getByRole("heading", { name: "Coaching access required", exact: true }),
  ).toBeVisible();
});
