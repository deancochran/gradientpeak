import type { Route } from "@playwright/test";
import {
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profiles,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("owner previews staff offboarding impact without a terminal action", async ({
  athleteActor,
  athletePage,
  coachActor,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Impact preview");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`impact-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const membershipId = e2eIdentity.uuid("impact-coach-membership");
  const engagementId = e2eIdentity.uuid("impact-engagement");
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
        .set({ full_name: "Impact Preview Coach" })
        .where(eq(profiles.id, coachActor.profileId));
      await transaction.insert(coachingEngagements).values({
        id: engagementId,
        organization_id: organizationId,
        athlete_profile_id: athleteActor.profileId,
      });
      await transaction.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: engagementId,
          coach_membership_id: membershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: engagementId,
          coach_membership_id: membershipId,
          assignment_kind: "supporting",
        },
      ]);
    });
  });
  await athletePage
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Staff", exact: true })
    .click();
  const coachRow = athletePage
    .getByRole("list", { name: "Active staff roster", exact: true })
    .getByRole("listitem")
    .filter({ hasText: "Impact Preview Coach" });
  await expect(coachRow).toHaveCount(1);
  const review = coachRow.getByRole("button", {
    name: "Review offboarding impact",
    exact: true,
  });
  const successfulPreview = athletePage.waitForResponse(async (response) => {
    if (!response.ok() || response.request().method() !== "POST") return false;
    try {
      const body = await response.text();
      return body.includes("assignedAthleteCount") && body.includes("resourceInventory");
    } catch {
      return false;
    }
  });
  await review.click();
  const response = await successfulPreview;
  const endpoint = response.url();
  const impactDialog = athletePage.getByRole("alertdialog");
  await expect(impactDialog).toHaveAttribute("data-state", "open");
  await expect(impactDialog).toContainText("has 1 assigned athlete");
  await expect(impactDialog).toContainText("primary, supporting");
  await expect(impactDialog).toContainText("resources are unavailable and have not been assessed");
  await expect(
    athletePage
      .getByRole("alertdialog")
      .getByRole("button", { name: /end membership|confirm offboarding/i }),
  ).toHaveCount(0);
  await athletePage.setViewportSize({ width: 1440, height: 1000 });
  await athletePage.screenshot({
    animations: "disabled",
    path: test.info().outputPath("staff-impact-desktop.png"),
  });
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await athletePage.screenshot({
    animations: "disabled",
    path: test.info().outputPath("staff-impact-mobile.png"),
  });
  await athletePage.getByRole("button", { name: "Close", exact: true }).click();
  const matches = (url: URL) => url.href === endpoint;
  const handler = (route: Route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue();
  await athletePage.route(matches, handler);
  try {
    await review.click();
    await expect(athletePage.getByRole("alertdialog")).toContainText(
      "could not load the offboarding impact",
    );
    await athletePage.unroute(matches, handler);
    await athletePage.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(athletePage.getByRole("alertdialog")).toContainText("has 1 assigned athlete");
  } finally {
    await athletePage.unroute(matches, handler);
  }
});
