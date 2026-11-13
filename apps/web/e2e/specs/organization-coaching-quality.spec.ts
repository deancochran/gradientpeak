import type { Page, Route } from "@playwright/test";
import {
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

async function openAssignmentFacts(page: Page) {
  const mobileToggle = page.getByRole("button", { name: "Open coaching navigation", exact: true });
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await page
      .getByRole("navigation", { name: "Mobile coaching navigation", exact: true })
      .getByRole("link", { name: "Assignment facts", exact: true })
      .click();
  } else {
    await page
      .getByRole("navigation", { name: "Coaching navigation", exact: true })
      .getByRole("link", { name: "Assignment facts", exact: true })
      .click();
  }
}

test("owner sees truthful coaching facts while a group coach sees only assigned scope", async ({
  actorFactory,
  athleteActor,
  athletePage: ownerPage,
  coachActor,
  coachPage,
  e2eIdentity,
}, testInfo) => {
  await ownerPage.goto("/organizations/new");
  await ownerPage.getByLabel("Organization name", { exact: true }).fill("Quality scope acceptance");
  await ownerPage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`quality-scope-${e2eIdentity.uuid("organization")}`);
  await ownerPage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(ownerPage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(ownerPage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/.test(organizationId)) {
    throw new Error("Missing created organization UUID route identity");
  }

  const coachMembershipId = e2eIdentity.uuid("quality-coach-membership");
  const engagementId = e2eIdentity.uuid("quality-engagement");
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
    });
  });

  // Create and link both sides through the current live group-management fixture flow.
  await ownerPage.getByRole("link", { name: "Groups", exact: true }).click();
  await ownerPage.getByLabel("Name", { exact: true }).fill("Quality scope group");
  await ownerPage.getByRole("button", { name: "Create group", exact: true }).click();
  await ownerPage
    .getByRole("list", { name: "Organization groups" })
    .getByRole("link", { name: "Quality scope group", exact: true })
    .click();
  await ownerPage.getByRole("link", { name: "Manage group athletes", exact: true }).click();
  await ownerPage.getByLabel("Eligible athlete", { exact: true }).selectOption(engagementId);
  await ownerPage.getByRole("button", { name: "Assign athlete", exact: true }).click();
  await expect(
    ownerPage.getByRole("list", { name: "Assigned athletes", exact: true }).getByRole("listitem"),
  ).toHaveCount(1);
  await ownerPage.getByRole("link", { name: "Manage group coaches", exact: true }).click();
  await ownerPage.getByRole("combobox", { name: /^Coach/ }).selectOption(coachMembershipId);
  await ownerPage.getByRole("button", { name: "Assign coach", exact: true }).click();
  await expect(ownerPage.getByRole("status").filter({ hasText: "Coach assigned." })).toBeVisible();
  await openAssignmentFacts(ownerPage);
  await expect(ownerPage).toHaveURL(`/organizations/${organizationId}/coaching`);
  await expect(ownerPage.getByTestId("coaching-assignment-facts")).toBeVisible();
  await expect(ownerPage.getByText("Scope", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText("Definitions", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText("Active engagements", { exact: true })).toBeVisible();
  await expect(
    ownerPage
      .getByText("Active engagements", { exact: true })
      .locator("..")
      .getByText("1", { exact: true }),
  ).toBeVisible();
  await expect(
    ownerPage.getByText("Organization-admin scope includes current organization engagements."),
  ).toBeVisible();
  await expect(ownerPage.getByText(/not a coaching-quality score/)).toBeVisible();

  for (const viewport of [
    { label: "desktop", width: 1440, height: 1000 },
    { label: "mobile", width: 390, height: 844 },
  ]) {
    await ownerPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(ownerPage.getByTestId("coaching-assignment-facts")).toBeVisible();
    await expect(ownerPage.getByText("Definitions", { exact: true })).toBeVisible();
    await ownerPage.screenshot({
      path: testInfo.outputPath(`coaching-quality-ready-${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBe(true);
  }

  await coachPage.goto(`/organizations/${organizationId}/dashboard`);
  await expect(coachPage.getByRole("heading", { name: "Coaching access required" })).toBeVisible();

  await coachPage.goto("/organizations");
  await coachPage
    .getByRole("link", { name: "Open Quality scope acceptance coaching workspace", exact: true })
    .click();
  await expect(coachPage).toHaveURL(`/organizations/${organizationId}/coaching`);
  await expect(coachPage.getByTestId("coaching-assignment-facts")).toBeVisible();
  await expect(
    coachPage.getByText("Assignment scope includes only current direct assignments"),
  ).toBeVisible();

  await coachPage.goto(`/organizations/${organizationId}`);
  await expect(coachPage).toHaveURL(`/organizations/${organizationId}/coaching`);
  await expect(coachPage.getByTestId("coaching-assignment-facts")).toBeVisible();
  await expect(
    coachPage
      .getByText("Active engagements", { exact: true })
      .locator("..")
      .getByText("1", { exact: true }),
  ).toBeVisible();

  const foreignActor = await actorFactory.create("coach", {
    label: "quality-foreign",
    primary: false,
  });
  const foreignPage = await foreignActor.createPage(`/organizations/${organizationId}/coaching`);
  await expect(foreignPage.getByTestId("coaching-assignment-facts")).toHaveCount(0);
  await expect(foreignPage.getByText(/access|permission/i).first()).toBeVisible();
  await foreignPage.close();
});

test("coaching read failure discovers and retries its generated server-function endpoint", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill("Quality read recovery");
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`quality-recovery-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);

  const firstRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST") return false;
    try {
      return (await response.text()).includes("coaching-quality-overview.v1");
    } catch {
      return false;
    }
  });
  const organizationNavigation = page.getByRole("navigation", {
    name: "Organization administration",
  });
  await organizationNavigation.getByRole("link", { name: "Coaching", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No coaching assignment facts in this scope" }),
  ).toBeVisible();
  const endpoint = (await firstRead).url();
  await organizationNavigation.getByRole("link", { name: "Overview", exact: true }).click();
  // Clear the previous route's successful loader cache before exercising a cold read.
  await page.reload();
  await waitForAppHydration(page);
  await expect(organizationNavigation).toBeVisible();

  let attempts = 0;
  let releaseFirstFailure = () => {};
  const firstFailureHeld = new Promise<void>((resolve) => (releaseFirstFailure = resolve));
  let releaseRetryFailure = () => {};
  const retryFailureHeld = new Promise<void>((resolve) => (releaseRetryFailure = resolve));
  const interceptedEndpoints: string[] = [];
  const matchesEndpoint = (url: URL) => url.toString() === endpoint;
  const failRead = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts += 1;
    interceptedEndpoints.push(route.request().url());
    if (attempts === 1) await firstFailureHeld;
    if (attempts === 2) await retryFailureHeld;
    await route.abort("failed");
  };
  await page.route(matchesEndpoint, failRead);
  try {
    await organizationNavigation.getByRole("link", { name: "Coaching", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Loading coaching assignment facts" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("coaching-quality-pending.png"),
      fullPage: true,
      animations: "disabled",
    });
    releaseFirstFailure();
    await expect(page.getByRole("alert")).toContainText("could not load coaching assignment facts");
    await page
      .getByRole("button", { name: "Retry coaching assignment facts", exact: true })
      .click();
    await expect.poll(() => attempts).toBe(2);
    await expect(
      page.getByRole("button", { name: "Retrying coaching assignment facts…" }),
    ).toBeDisabled();
    releaseRetryFailure();
    await expect(page.getByRole("alert")).toContainText("could not load coaching assignment facts");
    expect(interceptedEndpoints).toEqual([endpoint, endpoint]);
  } finally {
    releaseFirstFailure();
    releaseRetryFailure();
    await page.unroute(matchesEndpoint, failRead);
  }
});
