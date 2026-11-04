import { createHash, randomBytes } from "node:crypto";
import { organizationInvitations, organizationMemberships } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { AuthPage } from "../pages/auth";
import { withLocalE2EDatabase } from "../support/database";

for (const [action, status, recipientColumn] of [
  ["Accept", "accepted", "accepted_by_profile_id"],
  ["Decline", "declined", "declined_by_profile_id"],
] as const) {
  test(`recipient link previews while pending then durably ${status}`, async ({
    athletePage,
    athleteActor,
    coachPage,
    coachActor,
    e2eIdentity,
  }) => {
    expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
    await athletePage.goto("/organizations/new");
    await athletePage
      .getByLabel("Organization name", { exact: true })
      .fill("Linked recipient workflow");
    await athletePage
      .getByLabel("Organization URL name", { exact: true })
      .fill(`linked-recipient-${e2eIdentity.uuid("org")}`);
    await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
    await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
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

    await coachPage.goto(`/organization-invitation#invitation=${token}`);
    await expect(coachPage).toHaveURL(/\/organization-invitations$/);
    await expect(coachPage.getByText(/Linked recipient workflow/)).toBeVisible();
    await expect(coachPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    await withLocalE2EDatabase(async ({ db }) => {
      const [invitation] = await db
        .select({ status: organizationInvitations.status })
        .from(organizationInvitations)
        .where(eq(organizationInvitations.id, invitationId));
      expect(invitation?.status).toBe("pending");
    });
    await coachPage.getByRole("button", { name: `${action} invitation`, exact: true }).click();
    await expect(
      coachPage.getByRole("status").filter({ hasText: `Invitation ${status}.` }),
    ).toBeVisible();
    await withLocalE2EDatabase(async ({ db }) => {
      const [invitation] = await db
        .select({
          acceptedBy: organizationInvitations.accepted_by_profile_id,
          declinedBy: organizationInvitations.declined_by_profile_id,
          status: organizationInvitations.status,
        })
        .from(organizationInvitations)
        .where(eq(organizationInvitations.id, invitationId));
      expect(invitation?.status).toBe(status);
      expect(
        recipientColumn === "accepted_by_profile_id"
          ? invitation?.acceptedBy
          : invitation?.declinedBy,
      ).toBe(coachActor.profileId);
    });
  });
}

test("anonymous athlete completes login and onboarding before explicitly accepting the link", async ({
  athleteActor,
  athletePage,
  onboardingActor,
  anonymousPage: page,
  e2eIdentity,
}) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Onboarding invitation");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`onboarding-invite-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const invitationId = e2eIdentity.uuid("onboarding-invitation");
  const token = randomBytes(32).toString("base64url");
  await withLocalE2EDatabase(async ({ db }) => {
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
      invitation_kind: "athlete",
      invited_profile_id: onboardingActor.profileId,
      token_digest: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 86_400_000),
    });
  });
  let secretInRequestUrl = false;
  page.on("request", (request) => {
    if (request.url().includes(token)) secretInRequestUrl = true;
  });
  await page.goto(`/organization-invitation#invitation=${token}`);
  await expect(page).toHaveURL(/\/auth\/login\?/);
  expect(new URL(page.url()).hash).toBe("");
  expect(page.url().includes(token)).toBe(false);
  const auth = new AuthPage(page);
  await auth.signIn({ email: onboardingActor.email, password: onboardingActor.password });
  await expect(page).toHaveURL(/\/onboarding\?/);
  expect(page.url().includes(token)).toBe(false);
  await auth.completeProfile({
    fullName: "Invited onboarding athlete",
    username: `invite_${e2eIdentity.suffix("recipient", 16)}`,
  });
  await expect(page).toHaveURL(/\/organization-invitations$/);
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toBeVisible();
  await withLocalE2EDatabase(async ({ db }) => {
    const [row] = await db
      .select({ status: organizationInvitations.status })
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, invitationId));
    expect(row?.status).toBe("pending");
  });
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation accepted." })).toBeVisible();
  await withLocalE2EDatabase(async ({ db }) => {
    const [row] = await db
      .select({
        status: organizationInvitations.status,
        acceptedBy: organizationInvitations.accepted_by_profile_id,
      })
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, invitationId));
    expect(row).toEqual({ status: "accepted", acceptedBy: onboardingActor.profileId });
  });
  expect(secretInRequestUrl).toBe(false);
});
