import {
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});
test("owner assigns and ends direct coach responsibility without changing consent", async ({
  athletePage,
  athleteActor,
  coachPage,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Assignment management");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`assignment-management-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const membershipId = e2eIdentity.uuid("coach-membership"),
    engagementId = e2eIdentity.uuid("engagement");
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
      await transaction.insert(coachingEngagements).values({
        id: engagementId,
        organization_id: organizationId,
        athlete_profile_id: athleteActor.profileId,
      });
    });
  });
  const organizationNavigation = athletePage.getByRole("navigation", {
    name: "Organization administration",
  });
  await organizationNavigation.getByRole("link", { name: "Assignments", exact: true }).click();
  const directory = athletePage.getByRole("list", { name: "Athlete coach assignments" });
  await expect(directory.getByText("Unassigned", { exact: true })).toBeVisible();
  await expect(
    organizationNavigation.getByRole("link", { name: "Assignments", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(athletePage.getByLabel("Primary coach filter")).toBeVisible();
  await expect(athletePage.getByText("Coverage unavailable", { exact: true })).toBeVisible();
  for (const width of [768, 1024, 1100]) {
    await athletePage.setViewportSize({ width, height: 1000 });
    await athletePage.getByRole("button", { name: "Open coaching navigation" }).click();
    const compactNavigation = athletePage.getByRole("navigation", {
      name: "Mobile coaching navigation",
    });
    await expect(
      compactNavigation.getByRole("link", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await compactNavigation.getByRole("link", { name: "Assignments", exact: true }).click();
    await expect(compactNavigation).toBeHidden();
    await expect(
      athletePage.getByRole("button", { name: "Manage coaches", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        athletePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      )
      .toBe(true);
    await athletePage.screenshot({
      path: testInfo.outputPath(`O05--ready--${width}.png`),
      fullPage: true,
    });
  }
  await athletePage.setViewportSize({ width: 1440, height: 1000 });
  await athletePage.screenshot({
    path: testInfo.outputPath("O05--ready--desktop.png"),
    fullPage: true,
  });
  expect(
    await athletePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await athletePage.screenshot({
    path: testInfo.outputPath("O05--ready--mobile.png"),
    fullPage: true,
  });
  expect(
    await athletePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await athletePage.getByRole("button", { name: "Manage coaches", exact: true }).click();
  await expect(athletePage.getByText(/separate from athlete consent/)).toBeVisible();
  await athletePage.getByRole("combobox", { name: "Eligible coach" }).click();
  await athletePage.getByRole("option", { name: /Organization coach|Coach/ }).click();
  await athletePage.getByRole("button", { name: "Assign coach" }).click();
  await athletePage.getByRole("button", { name: "Confirm responsibility change" }).click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: "Responsibility updated" }),
  ).toBeVisible();
  await athletePage
    .getByRole("button", { name: /Back to (athlete roster|assignment directory)/ })
    .click();
  const primaryColumn = directory.getByText("Primary coach", { exact: true }).locator("..");
  await expect(primaryColumn.locator("p").nth(1)).toHaveText(/\S/);
  await expect(directory.getByText("Unassigned", { exact: true })).toHaveCount(0);
  await athletePage.getByLabel("Primary coach filter").selectOption("unassigned");
  await athletePage.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(athletePage).toHaveURL(/primary=unassigned/);
  await expect(
    athletePage.getByRole("button", { name: "Manage coaches", exact: true }),
  ).toHaveCount(0);
  await athletePage.getByLabel("Primary coach filter").selectOption("all");
  await athletePage.getByLabel("Athlete status filter").selectOption("paused");
  await athletePage.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(athletePage).toHaveURL(/status=paused/);
  await expect(
    athletePage.getByRole("button", { name: "Manage coaches", exact: true }),
  ).toHaveCount(0);
  await athletePage.getByLabel("Athlete status filter").selectOption("active");
  await athletePage.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(athletePage).toHaveURL(/status=active/);
  await expect(primaryColumn.locator("p").nth(1)).toHaveText(/\S/);
  await athletePage.screenshot({
    path: testInfo.outputPath("directory-assigned.png"),
    fullPage: true,
  });
  expect(
    await athletePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await athletePage.getByRole("button", { name: "Manage coaches", exact: true }).click();
  await athletePage.getByRole("button", { name: "End", exact: true }).click();
  await athletePage.getByRole("button", { name: "Confirm responsibility change" }).click();
  await expect(athletePage.getByRole("button", { name: "End", exact: true })).toHaveCount(0);
  await athletePage
    .getByRole("button", { name: /Back to (athlete roster|assignment directory)/ })
    .click();
  await expect(directory.getByText("Unassigned", { exact: true })).toBeVisible();
  await athletePage
    .getByRole("textbox", { name: "Search athletes on this page" })
    .fill("no-matching-athlete");
  await athletePage.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(athletePage.getByText("No athletes on this page match this search.")).toBeVisible();
  await athletePage.getByRole("textbox", { name: "Search athletes on this page" }).fill("");
  await athletePage.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(directory.getByText("Unassigned", { exact: true })).toBeVisible();
  await withLocalE2EDatabase(async (database) => {
    const rows = await database.db
      .select()
      .from(coachingAssignments)
      .where(eq(coachingAssignments.engagement_id, engagementId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ended_at).toBeInstanceOf(Date);
    const consents = await database.db
      .select({ id: athleteDataSharingConsents.id })
      .from(athleteDataSharingConsents)
      .where(eq(athleteDataSharingConsents.engagement_id, engagementId));
    expect(consents).toEqual([]);
  });
  await coachPage.goto(`/organizations/${organizationId}/assignments`);
  await expect(coachPage.getByRole("list", { name: "Athlete coach assignments" })).toHaveCount(0);
  await expect(coachPage.getByText(/access|permission/i).first()).toBeVisible();
  await coachPage.screenshot({ path: testInfo.outputPath("directory-denied.png"), fullPage: true });
});
