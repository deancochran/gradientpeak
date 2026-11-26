import type { Page, Route, TestInfo } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAppHydration } from "../support/hydration";

const viewports = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "mobile", width: 390, height: 844 },
] as const;

async function captureNoOverflow(page: Page, testInfo: TestInfo, state: string) {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`organization-invitations-${state}-${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
}

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("organization invitations keep the coaching shell through a delayed and failed read, then recover", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill("Invitation read recovery");
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`invitation-recovery-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(page.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new Error("Missing created organization UUID route identity");

  // Discover the generated server-function URL from an actual successful read.
  // This deliberately does not assume a transport path such as /api/trpc.
  const initialRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const body = await response.json().catch(() => null);
    const serialized = JSON.stringify(body);
    return (
      serialized.includes('"canInviteAdministrators"') &&
      serialized.includes('"items"') &&
      serialized.includes('"nextCursor"')
    );
  });
  const organizationNavigation = page.getByRole("navigation", {
    name: "Organization administration",
    exact: true,
  });
  await organizationNavigation.getByRole("link", { name: "Invitations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organization invitations", exact: true }),
  ).toBeVisible();
  const invitationsEndpoint = (await initialRead).url();

  await page.goto(`/organizations/${organizationId}/dashboard`);
  await waitForAppHydration(page);

  let releaseRead = () => {};
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let finishRead = () => {};
  const readFinished = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  let invitationReads = 0;
  const interceptedEndpoints: string[] = [];
  const matchesInvitationsEndpoint = (url: URL) => url.toString() === invitationsEndpoint;
  const failInvitationRead = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    invitationReads += 1;
    interceptedEndpoints.push(route.request().url());
    try {
      if (invitationReads === 1) await heldRead;
      await route.abort("failed");
    } finally {
      finishRead();
    }
  };

  await page.route(matchesInvitationsEndpoint, failInvitationRead);
  try {
    await organizationNavigation.getByRole("link", { name: "Invitations", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Loading organization invitations" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Invitation history", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Coaching navigation", exact: true }),
    ).toBeVisible();
    await captureNoOverflow(page, testInfo, "loading");

    releaseRead();
    await expect(page.getByRole("alert")).toContainText("could not load organization invitations");
    await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Invitation history", { exact: true })).toHaveCount(0);
    await captureNoOverflow(page, testInfo, "error");
    expect(invitationReads).toBe(1);
    expect(interceptedEndpoints).toEqual([invitationsEndpoint]);
  } finally {
    releaseRead();
    await readFinished;
    await page.unroute(matchesInvitationsEndpoint, failInvitationRead);
  }

  await page.getByRole("button", { name: "Retry organization invitations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organization invitations", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toBeVisible();
  await expect(page.getByText("No invitations on this page.", { exact: true })).toBeVisible();
  await captureNoOverflow(page, testInfo, "ready");
});

test("switching organizations never retains a prior invitation form or history during the next read", async ({
  athletePage: page,
  e2eIdentity,
}) => {
  const firstName = "First invitation transition";
  const secondName = "Second invitation transition";
  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(firstName);
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`first-invitation-transition-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const firstOrganizationId = new URL(page.url()).pathname.split("/")[2];
  if (!firstOrganizationId || !/^[0-9a-f-]{36}$/i.test(firstOrganizationId))
    throw new Error("Missing first organization UUID route identity");

  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(secondName);
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`second-invitation-transition-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const secondOrganizationId = new URL(page.url()).pathname.split("/")[2];
  if (!secondOrganizationId || !/^[0-9a-f-]{36}$/i.test(secondOrganizationId))
    throw new Error("Missing second organization UUID route identity");

  await page.goto(`/organizations/${firstOrganizationId}/dashboard`);
  await waitForAppHydration(page);
  const firstRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const body = await response.json().catch(() => null);
    const serialized = JSON.stringify(body);
    return (
      serialized.includes('"canInviteAdministrators"') &&
      serialized.includes('"items"') &&
      serialized.includes('"nextCursor"')
    );
  });
  await page
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Invitations", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toBeVisible();
  const invitationsEndpoint = (await firstRead).url();

  await page.goto("/organizations");
  await page
    .getByRole("link", { name: `Open ${secondName} coaching dashboard`, exact: true })
    .click();
  await expect(page).toHaveURL(`/organizations/${secondOrganizationId}/dashboard`);

  let releaseRead = () => {};
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let finishRead = () => {};
  const readFinished = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  const delaySecondOrganizationRead = async (route: Route) => {
    try {
      await heldRead;
      await route.abort("failed");
    } finally {
      finishRead();
    }
  };
  const matchesInvitationsEndpoint = (url: URL) => url.toString() === invitationsEndpoint;
  await page.route(matchesInvitationsEndpoint, delaySecondOrganizationRead);
  try {
    await page
      .getByRole("navigation", { name: "Organization administration", exact: true })
      .getByRole("link", { name: "Invitations", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Loading organization invitations", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Invitation history", { exact: true })).toHaveCount(0);
  } finally {
    releaseRead();
    await readFinished;
    await page.unroute(matchesInvitationsEndpoint, delaySecondOrganizationRead);
  }
});
