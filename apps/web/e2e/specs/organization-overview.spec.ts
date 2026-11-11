import type { Route } from "@playwright/test";
import {
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profiles,
  users,
} from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("overview keeps organization navigation through a disposable-browser read failure and retries", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name.includes("Mobile")
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  );
  await page.goto("/organizations/new");
  const initialOverviewResponse = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST") return false;
    try {
      return (await response.text()).includes("activeEngagementsWithoutPrimary");
    } catch {
      return false;
    }
  });
  await page.getByLabel("Organization name", { exact: true }).fill("Overview recovery");
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`overview-recovery-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const dashboard = page.url();
  const overviewEndpoint = (await initialOverviewResponse).url();
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/\/staff/);

  let releaseInitialRead: () => void = () => {};
  const initialReadHeld = new Promise<void>((resolve) => {
    releaseInitialRead = resolve;
  });
  let releaseRetryRead: () => void = () => {};
  const retryReadHeld = new Promise<void>((resolve) => {
    releaseRetryRead = resolve;
  });
  let overviewReadAttempts = 0;
  const overviewRequestEndpoints: string[] = [];
  const failOverviewRead = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    overviewRequestEndpoints.push(route.request().url());
    overviewReadAttempts += 1;
    if (overviewReadAttempts === 1) {
      await initialReadHeld;
    }
    if (overviewReadAttempts === 2) {
      await retryReadHeld;
    }
    return route.abort("failed");
  };
  const matchesOverviewEndpoint = (url: URL) => url.toString() === overviewEndpoint;
  await page.route(matchesOverviewEndpoint, failOverviewRead);
  try {
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("status", { name: "Loading organization overview" })).toContainText(
      "Loading organization overview",
    );
    await expect(
      page.getByRole("navigation", { name: "Organization administration" }),
    ).toBeVisible();
    await expect(page.getByTestId("organization-overview-metrics")).toHaveCount(0);
    await expect(page.getByText("No active athletes yet")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("overview-recovery-loading.png"),
      fullPage: true,
    });
    releaseInitialRead();
    await expect(page.getByRole("alert")).toContainText("could not load the organization overview");
    await expect(
      page.getByRole("navigation", { name: "Organization administration" }),
    ).toBeVisible();
    await expect(page.getByText("No active athletes yet")).toHaveCount(0);
    await expect(page.getByTestId("organization-overview-metrics")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("overview-recovery-error-initial.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Retry organization overview", exact: true }).click();
    await expect.poll(() => overviewReadAttempts).toBe(2);
    const retryingButton = page.getByRole("button", { name: "Retrying organization overview…" });
    if (await retryingButton.count()) {
      await expect(retryingButton).toBeDisabled();
    } else {
      await expect(
        page.getByRole("status", { name: "Loading organization overview" }),
      ).toContainText("Loading organization overview");
    }
    releaseRetryRead();
    await expect(
      page.getByRole("button", { name: "Retry organization overview", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText("could not load the organization overview");
    await expect(
      page.getByRole("navigation", { name: "Organization administration" }),
    ).toBeVisible();
    await expect(page.getByText("No active athletes yet")).toHaveCount(0);
    await expect(page.getByTestId("organization-overview-metrics")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("overview-recovery-error-retry.png"),
      fullPage: true,
    });
    expect(overviewReadAttempts).toBe(2);
    expect(overviewRequestEndpoints).toEqual([overviewEndpoint, overviewEndpoint]);
  } finally {
    releaseInitialRead();
    releaseRetryRead();
    await page.unroute(matchesOverviewEndpoint, failOverviewRead);
  }

  await page.getByRole("button", { name: "Retry organization overview", exact: true }).click();
  await expect(page).toHaveURL(dashboard);
  await expect(page.getByRole("heading", { name: "No active athletes yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Invite athlete", exact: true })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("overview-recovery-empty.png"),
    fullPage: true,
  });
});

test("organization totals drill into exact active, paused and primary-gap records", async ({
  athletePage: page,
  coachPage,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name.includes("Mobile")
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  );
  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill("Overview acceptance");
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`overview-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(page.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const dashboard = `/organizations/${organizationId}/dashboard`;
  const memberId = e2eIdentity.uuid("coach-member");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (tx) => {
      await tx.insert(organizationMemberships).values({
        id: memberId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await tx
        .insert(organizationMembershipRoleGrants)
        .values({ organization_id: organizationId, membership_id: memberId, role_key: "coach" });
      for (let i = 0; i < 24; i++) {
        const id = e2eIdentity.uuid(`athlete-${i}`);
        const email = `overview-${id}@example.test`;
        await tx
          .insert(users)
          .values({ id, name: `Overview athlete ${i}`, email, emailVerified: true });
        await tx.insert(profiles).values({
          id,
          email,
          full_name: `Overview athlete ${i}`,
          username: `overview-${id}`,
          onboarding_status: "completed",
          is_public: false,
        });
        await tx.insert(coachingEngagements).values({
          id: e2eIdentity.uuid(`engagement-${i}`),
          organization_id: organizationId,
          athlete_profile_id: id,
          paused_at: i === 22 ? new Date() : null,
          ended_at: i === 23 ? new Date() : null,
        });
      }
      await tx.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: e2eIdentity.uuid("engagement-0"),
          coach_membership_id: memberId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: e2eIdentity.uuid("engagement-1"),
          coach_membership_id: memberId,
          assignment_kind: "supporting",
        },
      ]);
    });
  });
  await page.reload();
  const metricCard = (label: string) =>
    page
      .getByTestId("organization-overview-metrics")
      .locator('[data-slot="card"]')
      .filter({ hasText: label });
  for (const [label, count] of [
    ["Active athletes", "22"],
    ["Active staff", "2"],
    ["Unassigned", "21"],
  ] as const) {
    await expect(metricCard(label).locator('[data-slot="card-title"]')).toHaveText(count);
  }
  await expect(metricCard("Coverage gaps").locator('[data-slot="card-title"]')).toHaveText(
    "Unavailable",
  );
  await expect(metricCard("Coverage gaps").getByRole("link")).toHaveCount(0);
  await expect(
    page.getByText(/Timed coverage and plan-horizon signals are not available/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs an owner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow-up priorities" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coverage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByText(/task assignments are not available/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopMetrics = await page
    .getByTestId("organization-overview-metrics")
    .locator('[data-slot="card"]')
    .evaluateAll((cards) =>
      cards.map((card) => {
        const { x, y } = card.getBoundingClientRect();
        return { x: Math.round(x), y: Math.round(y) };
      }),
    );
  expect(desktopMetrics).toHaveLength(4);
  expect(new Set(desktopMetrics.map((card) => card.y)).size).toBe(1);
  expect(desktopMetrics.map((card) => card.x)).toEqual(
    [...desktopMetrics.map((card) => card.x)].sort((a, b) => a - b),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("overview-counts.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMetrics = await page
    .getByTestId("organization-overview-metrics")
    .locator('[data-slot="card"]')
    .evaluateAll((cards) =>
      cards.map((card) => {
        const { x, y } = card.getBoundingClientRect();
        return { x: Math.round(x), y: Math.round(y) };
      }),
    );
  expect(mobileMetrics).toHaveLength(4);
  expect(mobileMetrics[0]?.y).toBe(mobileMetrics[1]?.y);
  expect(mobileMetrics[2]?.y).toBe(mobileMetrics[3]?.y);
  expect(mobileMetrics[0]?.y).toBeLessThan(mobileMetrics[2]?.y ?? 0);
  expect(mobileMetrics[0]?.x).toBeLessThan(mobileMetrics[1]?.x ?? 0);
  expect(mobileMetrics[2]?.x).toBeLessThan(mobileMetrics[3]?.x ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("overview-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Assign coach", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[^/]+\/assignments/);
  const assignmentSearch = new URL(page.url()).searchParams;
  expect(assignmentSearch.get("primary")).toBe("unassigned");
  expect(assignmentSearch.get("status")).toBe("active");
  await page.goto(dashboard);
  const rows = page.getByRole("list", { name: "Athlete coach assignments" }).getByRole("listitem");
  for (const [label, firstPage, secondPage] of [
    ["Active athletes", 20, 2],
    ["Unassigned", 20, 1],
  ] as const) {
    await metricCard(label)
      .getByRole("link", { name: `View matching records: ${label}` })
      .click();
    await expect(rows).toHaveCount(firstPage);
    await expect(page.getByText("Overview athlete 22", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Overview athlete 23", { exact: true })).toHaveCount(0);
    if (label === "Unassigned")
      await expect(page.getByText("Overview athlete 0", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Next page of athletes" }).click();
    await expect(rows).toHaveCount(secondPage);
    await expect(page.getByRole("link", { name: "Next page of athletes" })).toHaveCount(0);
    await page.goto(dashboard);
  }
  await page.getByRole("link", { name: "View paused athletes" }).click();
  await expect(page).toHaveURL(/\/assignments\?.*status=paused/);
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("Overview athlete 22", { exact: true })).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("overview-paused-drilldown.png"),
    fullPage: true,
  });
  await page.goto(dashboard);
  await metricCard("Active staff")
    .getByRole("link", { name: "View matching records: Active staff" })
    .click();
  await expect(
    page.getByRole("list", { name: "Active staff roster" }).getByRole("listitem"),
  ).toHaveCount(2);
  await coachPage.goto(dashboard);
  await expect(coachPage.getByRole("region", { name: "Organization operations" })).toHaveCount(0);
  await expect(coachPage.getByText(/access|permission/i).first()).toBeVisible();
});
