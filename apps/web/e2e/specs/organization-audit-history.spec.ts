import {
  organizationAuditEvents,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.use({ timezoneId: "America/New_York" });
test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("admin reads redacted UTC audit history and filters resources while coach is denied", async ({
  athletePage,
  athleteActor,
  coachPage,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Audit acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`audit-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const membershipId = e2eIdentity.uuid("coach-member");
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
      await transaction.insert(organizationAuditEvents).values(
        Array.from({ length: 21 }, (_, i) => ({
          id: e2eIdentity.uuid(`audit-${i}`),
          organization_id: organizationId,
          actor_profile_id: athleteActor.profileId,
          action: "organization.membership_ended",
          resource_type: "organization_membership",
          resource_id: membershipId,
          occurred_at: new Date(Date.UTC(2026, 10, 8, 0, 30, i)),
          details: { private_message: "synthetic-private-audit-marker" },
        })),
      );
    });
  });
  await athletePage.goto(`/organizations/${organizationId}/audit`);
  await expect(
    athletePage.getByRole("heading", { name: "Audit history", exact: true }),
  ).toBeVisible();
  await athletePage.getByLabel("Action", { exact: true }).fill("organization.membership_ended");
  await athletePage.getByLabel("Resource ID", { exact: true }).fill(membershipId);
  await athletePage.getByLabel("From (UTC)", { exact: true }).fill("2026-11-08");
  await athletePage.getByLabel("Through day (UTC)", { exact: true }).fill("2026-11-08");
  await athletePage.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(athletePage.getByRole("cell", { name: /Nov 8, 2026.*UTC/ }).first()).toBeVisible();
  await expect(athletePage.getByText("synthetic-private-audit-marker")).toHaveCount(0);
  await athletePage.screenshot({ path: testInfo.outputPath("audit-filtered.png"), fullPage: true });
  expect(
    await athletePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await athletePage.getByRole("button", { name: "View event", exact: true }).first().click();
  await expect(athletePage.getByText(/Sensitive event details are restricted/)).toBeVisible();
  await expect(athletePage.getByText("synthetic-private-audit-marker")).toHaveCount(0);
  await athletePage.screenshot({ path: testInfo.outputPath("audit-redacted.png"), fullPage: true });
  await athletePage.getByRole("button", { name: "Back to audit history" }).click();
  await athletePage.getByRole("link", { name: "Next page of audit events" }).click();
  await expect(athletePage.getByRole("button", { name: "View event", exact: true })).toHaveCount(1);
  await athletePage.getByLabel("Resource type", { exact: true }).fill("no-match");
  await athletePage.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(athletePage.getByText("No audit events match the current scope.")).toBeVisible();
  await athletePage.getByLabel("Resource type", { exact: true }).fill("");
  await athletePage.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "View event", exact: true })).toHaveCount(
    20,
  );
  await expect(athletePage.getByText(/Export is unavailable/)).toBeVisible();
  await coachPage.goto(`/organizations/${organizationId}/audit`);
  await expect(coachPage.getByRole("button", { name: "View event", exact: true })).toHaveCount(0);
  await expect(coachPage.getByText(/access|permission/i).first()).toBeVisible();
  await coachPage.screenshot({ path: testInfo.outputPath("audit-denied.png"), fullPage: true });
});
