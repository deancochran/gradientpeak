import { createHash, randomBytes } from "node:crypto";
import { organizationInvitations, organizationMemberships } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
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
