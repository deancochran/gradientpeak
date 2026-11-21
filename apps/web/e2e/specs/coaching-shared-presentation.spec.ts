import type { Page, TestInfo } from "@playwright/test";
import {
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

async function selectTheme(page: Page, theme: "light" | "dark") {
  await page.goto("/settings");
  const preference = page
    .getByRole("group", { name: "Theme preference" })
    .getByRole("button", { name: theme, exact: true });
  await preference.focus();
  await page.keyboard.press("Enter");
  await expect(preference).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await waitForAppHydration(page);
  await expect(preference).toHaveAttribute("aria-pressed", "true");
}

async function inspectSurface(page: Page, testInfo: TestInfo, name: string) {
  const shell = page.locator(".gp-protected-shell");
  await expect(shell).toBeVisible();
  await expect
    .poll(() =>
      shell.evaluate((element) => ({
        surface: getComputedStyle(element).backgroundColor,
        document: getComputedStyle(document.body).backgroundColor,
      })),
    )
    .toEqual(
      await page.evaluate(() => ({
        surface: getComputedStyle(document.body).backgroundColor,
        document: getComputedStyle(document.body).backgroundColor,
      })),
    );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `The ${name} page must fit its viewport; a table may scroll within its own container.`,
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
}

async function inspectCoachingNavigation(page: Page, href: string) {
  const trigger = page.getByRole("button", { name: "Open coaching navigation", exact: true });
  const compact = await trigger.isVisible();
  if (compact) {
    await trigger.focus();
    await page.keyboard.press("Enter");
  }
  const navigation = page.getByRole("navigation", {
    name: compact ? "Mobile coaching navigation" : "Coaching navigation",
    exact: true,
  });
  await expect(navigation).toBeVisible();
  await expect(navigation.locator(`a[href="${href}"]`)).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
  if (compact) {
    await page.keyboard.press("Escape");
    await expect(navigation).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
}

test("shared coaching presentation retains themes, search and navigation across role-scoped pages", async ({
  athleteActor,
  athletePage: ownerPage,
  coachActor,
  coachPage,
  e2eIdentity,
}, testInfo) => {
  // Two full theme/role walkthroughs, including preference reloads and screenshots.
  test.setTimeout(90_000);
  const compact = (ownerPage.viewportSize()?.width ?? 1440) < 600;
  const viewport = compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
  await ownerPage.setViewportSize(viewport);
  await coachPage.setViewportSize(viewport);
  const organizationName = "Shared presentation acceptance";
  await ownerPage.goto("/organizations/new");
  await ownerPage.getByLabel("Organization name", { exact: true }).fill(organizationName);
  await ownerPage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`shared-presentation-${e2eIdentity.uuid("organization")}`);
  await ownerPage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(ownerPage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(ownerPage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization created through the browser");

  const coachMembershipId = e2eIdentity.uuid("coach-membership");
  const engagementId = e2eIdentity.uuid("engagement");
  // Only the runner-designated disposable database receives fixture relationships.
  // No metrics consent is granted: the workspace must preserve its unavailable state.
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      await transaction.insert(organizationMemberships).values({
        id: coachMembershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: coachMembershipId,
        role_key: "coach",
      });
      await transaction.insert(coachingEngagements).values({
        id: engagementId,
        organization_id: organizationId,
        athlete_profile_id: athleteActor.profileId,
      });
      await transaction.insert(coachingAssignments).values({
        organization_id: organizationId,
        engagement_id: engagementId,
        coach_membership_id: coachMembershipId,
        assignment_kind: "primary",
      });
    });
  });

  for (const theme of ["light", "dark"] as const) {
    await selectTheme(ownerPage, theme);
    await ownerPage.goto("/organizations");
    const organizationLink = ownerPage.getByRole("link", {
      name: `Open ${organizationName} coaching dashboard`,
      exact: true,
    });
    await expect(organizationLink).toBeVisible();
    await inspectSurface(ownerPage, testInfo, `${theme}-organization-chooser`);
    await organizationLink.click();
    await expect(ownerPage).toHaveURL(`/organizations/${organizationId}/dashboard`);

    for (const [label, destination, readySelector] of [
      ["Staff", "staff", "#staff-roster-heading"],
      ["Assignments", "assignments", 'h1:has-text("Coach assignments")'],
      ["Invitations", "invitations", "#organization-invitations-heading"],
      ["Overview", "dashboard", '[data-testid="organization-overview-metrics"]'],
    ] as const) {
      const administration = ownerPage.getByRole("navigation", {
        name: "Organization administration",
        exact: true,
      });
      await expect(administration).toBeVisible();
      await administration.getByRole("link", { name: label, exact: true }).click();
      await expect(ownerPage).toHaveURL(
        new RegExp(`/organizations/${organizationId}/${destination}(?:\\?.*)?$`),
      );
      await expect(ownerPage.locator(readySelector)).toBeVisible();
      await expect(administration).toBeVisible();
      await expect(administration.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(administration.locator('a[aria-current="page"]')).toHaveCount(1);
      await inspectSurface(ownerPage, testInfo, `${theme}-administration-${destination}`);
    }

    await selectTheme(coachPage, theme);
    const directoryPath = `/organizations/${organizationId}/athletes`;
    await coachPage.goto(directoryPath);
    await expect(coachPage.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
    await inspectCoachingNavigation(coachPage, directoryPath);
    const search = coachPage.getByRole("searchbox", { name: "Search assigned athletes" });
    await search.fill("not-a-matching-athlete");
    await search.press("Enter");
    await expect(coachPage).toHaveURL(/q=not-a-matching-athlete/);
    await expect(coachPage.getByText("No assigned athletes match this search.")).toBeVisible();
    await inspectSurface(coachPage, testInfo, `${theme}-directory-empty-search`);
    await coachPage.getByRole("button", { name: "Clear Search assigned athletes" }).click();
    await search.press("Enter");
    await expect(coachPage).toHaveURL(new RegExp(`${directoryPath}/?$`));
    const athleteLink = coachPage.locator(`a[href="${directoryPath}/${athleteActor.profileId}"]`);
    await expect(athleteLink).toBeVisible();
    await inspectSurface(coachPage, testInfo, `${theme}-directory`);
    await athleteLink.click();
    await expect(coachPage.getByText("Athlete workspace unavailable")).toBeVisible();
    await expect(coachPage.getByText("Athlete workspace unavailable", { exact: true })).toHaveCSS(
      "color",
      await coachPage.evaluate(() => getComputedStyle(document.body).color),
    );
    await expect(
      coachPage.getByRole("heading", { name: "Historical modeled load state" }),
    ).toHaveCount(0);
    await inspectCoachingNavigation(coachPage, directoryPath);
    await inspectSurface(coachPage, testInfo, `${theme}-unshared-athlete-context`);
  }
});
