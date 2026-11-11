import { createHash, randomBytes } from "node:crypto";
import {
  coachingEngagements,
  organizationInvitations,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

for (const choice of ["accept", "decline"] as const) {
  test(`verified recipient can ${choice} a scoped invitation`, async ({
    athletePage,
    athleteActor,
    coachPage,
    coachActor,
    e2eIdentity,
  }) => {
    expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
    await athletePage.goto("/organizations/new");
    await athletePage.getByLabel("Organization name", { exact: true }).fill("Recipient workflow");
    await athletePage
      .getByLabel("Organization URL name", { exact: true })
      .fill(`recipient-${e2eIdentity.uuid("org")}`);
    await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
    await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
    const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
    if (!organizationId) throw new Error("Missing organization identity");
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
    await expect(coachPage).toHaveURL(/\/organization-invitations$/);
    await coachPage.getByLabel("Invitation token", { exact: true }).fill(token);
    await coachPage.getByRole("button", { name: "Preview invitation", exact: true }).click();
    await expect(coachPage.getByText(/Recipient workflow/)).toBeVisible();
    await coachPage
      .getByRole("button", {
        name: choice === "accept" ? "Accept invitation" : "Decline invitation",
        exact: true,
      })
      .click();
    const status = choice === "accept" ? "accepted" : "declined";
    await expect(
      coachPage.getByRole("status").filter({ hasText: `Invitation ${status}.` }),
    ).toBeVisible();
    await withLocalE2EDatabase(async ({ db }) => {
      const [invitation] = await db
        .select({
          status: organizationInvitations.status,
          acceptedBy: organizationInvitations.accepted_by_profile_id,
          declinedBy: organizationInvitations.declined_by_profile_id,
        })
        .from(organizationInvitations)
        .where(eq(organizationInvitations.id, invitationId));
      expect(invitation?.status).toBe(status);
      expect(choice === "accept" ? invitation?.acceptedBy : invitation?.declinedBy).toBe(
        coachActor.profileId,
      );
      const members = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            eq(organizationMemberships.profile_id, coachActor.profileId),
          ),
        );
      expect(members).toHaveLength(choice === "accept" ? 1 : 0);
    });
    await coachPage.reload();
    await waitForAppHydration(coachPage);
    await expect(coachPage.getByLabel("Invitation token", { exact: true })).toHaveValue("");
    await expect(
      coachPage.getByRole("button", { name: "Accept invitation", exact: true }),
    ).toHaveCount(0);
  });
}

test("staff acceptance receipt opens the accepted coach organization without athlete access", async ({
  actorFactory,
  athletePage,
  coachActor,
  coachPage,
  e2eIdentity,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  const unassignedAthlete = await actorFactory.create("athlete", { label: "unassigned athlete" });
  if (!unassignedAthlete.username) throw new Error("Missing disposable athlete username");

  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Staff receipt workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`staff-receipt-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing created organization identity");

  await withLocalE2EDatabase(async (database) => {
    await database.db.insert(coachingEngagements).values({
      id: e2eIdentity.uuid("unassigned-engagement"),
      organization_id: organizationId,
      athlete_profile_id: unassignedAthlete.profileId,
    });
  });

  await athletePage
    .getByRole("navigation", { name: "Organization administration" })
    .getByRole("link", { name: "Invitations", exact: true })
    .click();
  await expect(athletePage).toHaveURL(new RegExp(`/organizations/${organizationId}/invitations$`));
  await expect(
    athletePage.getByRole("heading", { name: "Organization invitations", exact: true }),
  ).toBeVisible();
  const invitationType = athletePage.locator('select[name="kind"]');
  const staffRole = athletePage.locator('select[name="requestedRole"]');
  await expect(invitationType).toHaveValue("staff");
  await invitationType.selectOption("staff");
  await expect(staffRole).toHaveValue("coach");
  await staffRole.selectOption("coach");
  await athletePage.getByLabel("Recipient email", { exact: true }).fill(coachActor.email);
  await athletePage.getByLabel("Expires at", { exact: true }).fill("2030-01-01T12:00");
  await athletePage.getByRole("button", { name: "Create invitation", exact: true }).click();
  const invitationLink = await athletePage
    .getByLabel("Invitation link", { exact: true })
    .inputValue();
  const invitationToken = new URL(invitationLink).hash.match(/(?:^#|&)invitation=([^&]+)/)?.[1];
  if (!invitationToken) throw new Error("Missing created invitation token");

  await coachPage.goto("/organization-invitations");
  await coachPage.getByLabel("Invitation token", { exact: true }).fill(invitationToken);
  await coachPage.getByRole("button", { name: "Preview invitation", exact: true }).click();
  await expect(
    coachPage.getByText("Staff receipt workflow · staff", { exact: true }),
  ).toBeVisible();
  await coachPage.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(
    coachPage.getByRole("status").filter({ hasText: "Invitation accepted." }),
  ).toBeVisible();
  await expect(
    coachPage.getByRole("button", { name: "Decline invitation", exact: true }),
  ).toHaveCount(0);

  await withLocalE2EDatabase(async ({ db }) => {
    const [membership] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organization_id, organizationId),
          eq(organizationMemberships.profile_id, coachActor.profileId),
          isNull(organizationMemberships.suspended_at),
        ),
      );
    expect(membership).toBeTruthy();
    const roles = membership
      ? await db
          .select({ role: organizationMembershipRoleGrants.role_key })
          .from(organizationMembershipRoleGrants)
          .where(
            and(
              eq(organizationMembershipRoleGrants.organization_id, organizationId),
              eq(organizationMembershipRoleGrants.membership_id, membership.id),
              isNull(organizationMembershipRoleGrants.revoked_at),
            ),
          )
      : [];
    expect(roles).toEqual([{ role: "coach" }]);
  });

  await coachPage.setViewportSize({ width: 1440, height: 1000 });
  await coachPage.screenshot({
    path: testInfo.outputPath("S06--staff-receipt--1440.png"),
    fullPage: true,
  });
  expect(
    await coachPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await coachPage.getByRole("link", { name: "Open organization", exact: true }).click();
  await expect(coachPage).toHaveURL(new RegExp(`/organizations/${organizationId}/coaching$`));
  await expect(coachPage).not.toHaveURL(/onboarding/);
  await waitForAppHydration(coachPage);

  await coachPage.setViewportSize({ width: 390, height: 844 });
  await coachPage.getByRole("button", { name: "Open coaching navigation" }).click();
  const mobileNavigation = coachPage.getByRole("navigation", {
    name: "Mobile coaching navigation",
  });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Athletes", exact: true }).click();
  await expect(coachPage).toHaveURL(new RegExp(`/organizations/${organizationId}/athletes$`));
  await expect(
    coachPage.getByText("No assigned athletes match this search.", { exact: true }),
  ).toBeVisible();
  await expect(coachPage.getByText(unassignedAthlete.username, { exact: false })).toHaveCount(0);
  await coachPage.screenshot({
    path: testInfo.outputPath("S06--empty-roster--390.png"),
    fullPage: true,
  });
  expect(
    await coachPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
});
