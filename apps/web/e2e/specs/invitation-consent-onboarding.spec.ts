import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  athleteDataSharingConsents,
  coachingEngagements,
  organizationInvitations,
  organizationMemberships,
  users,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { AuthPage } from "../pages/auth";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test("new invited email verifies in a separate tab and explicitly accepts six-scope sharing", async ({
  athletePage,
  athleteActor,
  anonymousPage,
  e2eIdentity,
}) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  const email = `new-invited-${e2eIdentity.uuid("recipient")}@example.test`;
  const password = "InvitationTest123!";
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Invitation acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`invite-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization");
  const invitationId = e2eIdentity.uuid("invitation");
  const token = randomBytes(32).toString("base64url");
  await withLocalE2EDatabase(async ({ db }) => {
    expect(
      await db.select({ id: users.id }).from(users).where(eq(users.email, email)),
    ).toHaveLength(0);
    const [owner] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organization_id, organizationId),
          eq(organizationMemberships.profile_id, athleteActor.profileId),
        ),
      );
    if (!owner) throw new Error("Missing organization owner");
    await db.insert(organizationInvitations).values({
      id: invitationId,
      organization_id: organizationId,
      invited_by_membership_id: owner.id,
      invitation_kind: "athlete",
      invited_email: email,
      token_digest: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 86400000),
    });
  });
  const assertNotAccepted = async () => {
    await withLocalE2EDatabase(async ({ db }) => {
      expect(
        (
          await db
            .select({ status: organizationInvitations.status })
            .from(organizationInvitations)
            .where(eq(organizationInvitations.id, invitationId))
        )[0]?.status,
      ).toBe("pending");
      expect(
        await db
          .select({ id: coachingEngagements.id })
          .from(coachingEngagements)
          .where(eq(coachingEngagements.organization_id, organizationId)),
      ).toHaveLength(0);
      expect(
        await db
          .select({ id: athleteDataSharingConsents.id })
          .from(athleteDataSharingConsents)
          .where(eq(athleteDataSharingConsents.organization_id, organizationId)),
      ).toHaveLength(0);
    });
  };
  await anonymousPage.goto(`/organization-invitation#invitation=${token}`);
  await expect(anonymousPage).toHaveURL(/\/auth\/login/);
  expect(anonymousPage.url()).not.toContain(token);
  await anonymousPage.getByRole("link", { name: /sign up/i }).click();
  await expect(anonymousPage).toHaveURL(/\/auth\/sign-up\?/);
  await expect(anonymousPage.getByRole("heading", { name: "Sign up", exact: true })).toBeVisible();
  await waitForAppHydration(anonymousPage);
  await anonymousPage.getByLabel(/^email/i).fill(email);
  await anonymousPage.getByLabel(/^password/i).fill(password);
  await anonymousPage.getByLabel(/repeat password/i).fill(password);
  await anonymousPage.getByRole("button", { name: /^sign up$/i }).click();
  await expect(anonymousPage).toHaveURL(/\/auth\/sign-up-success/);
  await assertNotAccepted();
  const capturePath = process.env.AUTH_EMAIL_CAPTURE_PATH;
  if (!capturePath) throw new Error("Missing private disposable mail capture");
  let actionUrl = "";
  await expect
    .poll(async () => {
      const lines = (await readFile(capturePath, "utf8").catch(() => ""))
        .split("\n")
        .filter(Boolean);
      const mail = lines
        .map((line) => JSON.parse(line) as { to: string; kind: string; actionUrl: string })
        .find((item) => item.to === email && item.kind === "verification");
      actionUrl = mail?.actionUrl ?? "";
      return Boolean(actionUrl);
    })
    .toBe(true);
  // A new tab has no original token handoff: discovery must use verified identity.
  const verifiedPage = await anonymousPage.context().newPage();
  try {
    await verifiedPage.goto(actionUrl);
    await expect(verifiedPage).toHaveURL(/\/auth\/login/);
    await new AuthPage(verifiedPage).signIn({ email, password });
    await expect(verifiedPage).toHaveURL(/\/onboarding/);
    await new AuthPage(verifiedPage).completeProfile({
      fullName: "Invited Athlete",
      username: `invited_${e2eIdentity.suffix("username", 12)}`,
    });
    await expect(verifiedPage).toHaveURL(/\/organization-invitations$/);
    await assertNotAccepted();
    await verifiedPage.getByRole("button", { name: "Review invitation", exact: true }).click();
    await expect(
      verifiedPage.getByRole("heading", { name: "Coaching data-sharing agreement" }),
    ).toBeVisible();
    await assertNotAccepted();
    await verifiedPage
      .getByRole("button", { name: "Accept invitation & share training data", exact: true })
      .click();
    await expect(
      verifiedPage.getByRole("status").filter({ hasText: "Invitation accepted." }),
    ).toBeVisible();
    await withLocalE2EDatabase(async ({ db }) => {
      expect(
        (
          await db
            .select({ status: organizationInvitations.status })
            .from(organizationInvitations)
            .where(eq(organizationInvitations.id, invitationId))
        )[0]?.status,
      ).toBe("accepted");
      const consents = await db
        .select({ scope: athleteDataSharingConsents.scope_key })
        .from(athleteDataSharingConsents)
        .where(eq(athleteDataSharingConsents.organization_id, organizationId));
      expect(consents.map((item) => item.scope).sort()).toEqual([
        "activities",
        "basic_profile",
        "calendar",
        "goals",
        "metrics",
        "training",
      ]);
    });
  } finally {
    await verifiedPage.close();
  }
});
