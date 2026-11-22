import type { Page, Route, TestInfo } from "@playwright/test";
import { organizationMembershipRoleGrants, organizationMemberships } from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
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
      path: testInfo.outputPath(`organization-groups-${state}-${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
}

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("organization groups hide controls during a delayed failed read and recover by retrying", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill("Group read recovery");
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`group-recovery-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(page.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new Error("Missing created organization UUID route identity");

  // Learn the generated function endpoint from its real successful response rather than guessing it.
  const successfulRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const serialized = JSON.stringify(await response.json().catch(() => null));
    return (
      serialized.includes('"items"') &&
      serialized.includes('"nextCursor"') &&
      serialized.includes('"hasMore"')
    );
  });
  await page
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Groups", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Organization groups", exact: true }),
  ).toBeVisible();
  const groupsEndpoint = (await successfulRead).url();

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
  const matchesGroupsEndpoint = (url: URL) => url.toString() === groupsEndpoint;
  const failRead = async (route: Route) => {
    try {
      await heldRead;
      await route.abort("failed");
    } finally {
      finishRead();
    }
  };
  await page.route(matchesGroupsEndpoint, failRead);
  try {
    await page
      .getByRole("navigation", { name: "Organization administration", exact: true })
      .getByRole("link", { name: "Groups", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Loading organization groups", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create group", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Coaching navigation", exact: true }),
    ).toBeVisible();
    await captureNoOverflow(page, testInfo, "loading");
    releaseRead();
    await expect(page.getByRole("alert")).toContainText("could not be loaded");
    await expect(page.getByRole("button", { name: "Create group", exact: true })).toHaveCount(0);
    await captureNoOverflow(page, testInfo, "error");
  } finally {
    releaseRead();
    await readFinished;
    await page.unroute(matchesGroupsEndpoint, failRead);
  }
  await page.getByRole("button", { name: "Retry organization groups", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organization groups", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create group", exact: true })).toBeVisible();
  await captureNoOverflow(page, testInfo, "ready");
});

test("a destination organization never retains the prior organization's group list during its read", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  const createOrganization = async (name: string, identity: string) => {
    await page.goto("/organizations/new");
    await page.getByLabel("Organization name", { exact: true }).fill(name);
    await page
      .getByLabel("Organization URL name", { exact: true })
      .fill(`group-switch-${e2eIdentity.uuid(identity)}`);
    await page.getByRole("button", { name: "Create organization", exact: true }).click();
    await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
      throw new Error("Missing created organization UUID route identity");
    return id;
  };
  const firstOrganizationId = await createOrganization(
    "First group transition",
    "organization-first",
  );
  const secondOrganizationId = await createOrganization(
    "Second group transition",
    "organization-second",
  );
  await page.goto(`/organizations/${firstOrganizationId}/dashboard`);
  await waitForAppHydration(page);

  const firstRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const serialized = JSON.stringify(await response.json().catch(() => null));
    return (
      serialized.includes('"items"') &&
      serialized.includes('"nextCursor"') &&
      serialized.includes('"hasMore"')
    );
  });
  await page
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Groups", exact: true })
    .click();
  const firstGroupName = `Old organization group ${e2eIdentity.uuid("group")}`;
  await page.getByLabel("Name", { exact: true }).fill(firstGroupName);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(firstGroupName) })).toBeVisible();
  const groupsEndpoint = (await firstRead).url();

  await page.goto(`/organizations/${secondOrganizationId}/dashboard`);
  await waitForAppHydration(page);
  let releaseRead = () => {};
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let finishRead = () => {};
  const readFinished = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  const matchesGroupsEndpoint = (url: URL) => url.toString() === groupsEndpoint;
  const failSecondOrganizationRead = async (route: Route) => {
    if (!route.request().postData()?.includes(secondOrganizationId)) return route.continue();
    try {
      await heldRead;
      await route.abort("failed");
    } finally {
      finishRead();
    }
  };
  await page.route(matchesGroupsEndpoint, failSecondOrganizationRead);
  try {
    await page
      .getByRole("navigation", { name: "Organization administration", exact: true })
      .getByRole("link", { name: "Groups", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Loading organization groups", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(firstGroupName, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create group", exact: true })).toHaveCount(0);
    await captureNoOverflow(page, testInfo, "organization-switch-loading");
    releaseRead();
    await expect(page.getByRole("alert")).toContainText("could not be loaded");
    await expect(page.getByText(firstGroupName, { exact: true })).toHaveCount(0);
    await captureNoOverflow(page, testInfo, "organization-switch-error");
  } finally {
    releaseRead();
    await readFinished;
    await page.unroute(matchesGroupsEndpoint, failSecondOrganizationRead);
  }
  await page.getByRole("button", { name: "Retry organization groups", exact: true }).click();
  await expect(page.getByText("No active organization groups yet.", { exact: true })).toBeVisible();
});

test("a destination group detail never retains an earlier group's archive or roster controls", async ({
  athletePage: page,
  e2eIdentity,
}, testInfo) => {
  await page.goto("/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill("Group detail recovery");
  await page
    .getByLabel("Organization URL name", { exact: true })
    .fill(`group-detail-recovery-${e2eIdentity.uuid("organization")}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(page.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new Error("Missing created organization UUID route identity");
  await page
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Groups", exact: true })
    .click();

  const firstName = `First recovery group ${e2eIdentity.uuid("group")}`;
  const secondName = `Second recovery group ${e2eIdentity.uuid("group")}`;
  for (const name of [firstName, secondName]) {
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create group", exact: true }).click();
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }

  await page.getByRole("link", { name: new RegExp(firstName) }).click();
  await expect(page.getByRole("heading", { name: firstName, exact: true })).toBeVisible();
  const firstGroupId = new URL(page.url()).pathname.split("/").at(-1);
  if (!firstGroupId || !/^[0-9a-f-]{36}$/i.test(firstGroupId))
    throw new Error("Missing first group UUID route identity");
  await page.goto(`/organizations/${organizationId}/groups/${firstGroupId}/coaches/`);
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: firstName, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coaches", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /All organization groups/ }).click();
  const secondLink = page.getByRole("link", { name: new RegExp(secondName) });
  const secondGroupId = (await secondLink.getAttribute("href"))?.split("/").at(-1);
  if (!secondGroupId || !/^[0-9a-f-]{36}$/i.test(secondGroupId))
    throw new Error("Missing second group UUID route identity");

  // A successful detail read identifies the real generated endpoint and response shape.
  const detailRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const serialized = JSON.stringify(await response.json().catch(() => null));
    return serialized.includes('"group"') && serialized.includes(firstGroupId);
  });
  await page.getByRole("link", { name: new RegExp(firstName) }).click();
  await expect(page.getByRole("heading", { name: firstName, exact: true })).toBeVisible();
  const detailEndpoint = (await detailRead).url();
  await page.getByRole("link", { name: /All organization groups/ }).click();
  await waitForAppHydration(page);

  let releaseRead = () => {};
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let finishRead = () => {};
  const readFinished = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  const matchesSecondDetail = (url: URL) => url.toString() === detailEndpoint;
  const failSecondDetail = async (route: Route) => {
    if (!route.request().postData()?.includes(secondGroupId)) return route.continue();
    try {
      await heldRead;
      await route.abort("failed");
    } finally {
      finishRead();
    }
  };
  await page.route(matchesSecondDetail, failSecondDetail);
  try {
    await secondLink.click();
    await expect(
      page.getByRole("status", { name: "Loading organization group", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: firstName, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archive group", exact: true })).toHaveCount(0);
    await expect(page.getByText("Manage group coaches", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Manage group athletes", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Coaching navigation", exact: true }),
    ).toBeVisible();
    await captureNoOverflow(page, testInfo, "detail-loading");
    releaseRead();
    await expect(page.getByRole("alert")).toContainText("could not be loaded");
    await expect(page.getByRole("button", { name: "Archive group", exact: true })).toHaveCount(0);
    await expect(page.getByText("Manage group coaches", { exact: true })).toHaveCount(0);
    await captureNoOverflow(page, testInfo, "detail-error");
  } finally {
    releaseRead();
    await readFinished;
    await page.unroute(matchesSecondDetail, failSecondDetail);
  }
  await page.getByRole("button", { name: "Retry organization group", exact: true }).click();
  await expect(page.getByRole("heading", { name: secondName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive group", exact: true })).toBeVisible();
  await expect(page.getByText("Manage group coaches", { exact: true })).toBeVisible();
  await captureNoOverflow(page, testInfo, "detail-ready");
});

test("revoked disposable admin access redacts a loaded group after its real archive command", async ({
  athletePage,
  coachActor,
  coachPage,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage
    .getByLabel("Organization name", { exact: true })
    .fill("Archive access recovery");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`archive-access-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new Error("Missing created organization UUID route identity");
  const membershipId = e2eIdentity.uuid("revoked-admin-membership");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (db) => {
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await db.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membershipId,
        role_key: "admin",
      });
    });
  });
  await athletePage
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Groups", exact: true })
    .click();
  const groupName = `Revoked archive group ${e2eIdentity.uuid("group")}`;
  await athletePage.getByLabel("Name", { exact: true }).fill(groupName);
  await athletePage.getByLabel("Description", { exact: false }).fill("Visible before access loss");
  await athletePage.getByRole("button", { name: "Create group", exact: true }).click();
  const groupLink = athletePage.getByRole("link", { name: new RegExp(groupName) });
  await expect(groupLink).toBeVisible();
  const groupId = (await groupLink.getAttribute("href"))?.split("/").at(-1);
  if (!groupId || !/^[0-9a-f-]{36}$/i.test(groupId))
    throw new Error("Missing group UUID route identity");

  await coachPage.goto(`/organizations/${organizationId}/groups/${groupId}`);
  await waitForAppHydration(coachPage);
  await expect(coachPage.getByRole("heading", { name: groupName, exact: true })).toBeVisible();
  await expect(coachPage.getByText("Visible before access loss", { exact: true })).toBeVisible();
  await expect(coachPage.getByRole("button", { name: "Archive group", exact: true })).toBeVisible();
  const revoked = await withLocalE2EDatabase(async (database) =>
    database.db
      .update(organizationMembershipRoleGrants)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(organizationMembershipRoleGrants.organization_id, organizationId),
          eq(organizationMembershipRoleGrants.membership_id, membershipId),
          eq(organizationMembershipRoleGrants.role_key, "admin"),
          isNull(organizationMembershipRoleGrants.revoked_at),
        ),
      )
      .returning({ membershipId: organizationMembershipRoleGrants.membership_id }),
  );
  expect(revoked).toEqual([{ membershipId }]);
  await coachPage.getByRole("button", { name: "Archive group", exact: true }).click();
  await coachPage.getByRole("button", { name: "Confirm archive", exact: true }).click();
  await expect(coachPage.getByRole("heading", { name: "Group access required" })).toBeVisible();
  await expect(coachPage.getByRole("heading", { name: groupName, exact: true })).toHaveCount(0);
  await expect(coachPage.getByText("Visible before access loss", { exact: true })).toHaveCount(0);
  await expect(coachPage.getByRole("button", { name: "Archive group", exact: true })).toHaveCount(
    0,
  );
  await expect(coachPage.getByText("Manage group coaches", { exact: true })).toHaveCount(0);
  await expect(
    coachPage.getByRole("navigation", { name: "Coaching navigation", exact: true }),
  ).toBeVisible();
});

test("revoked disposable admin access redacts a loaded coach roster after its real remove command", async ({
  actorFactory,
  athletePage,
  coachActor,
  coachPage,
  e2eIdentity,
}, testInfo) => {
  const candidateActor = await actorFactory.create("coach", { label: "group-removal-candidate" });
  await athletePage.goto("/organizations/new");
  await athletePage
    .getByLabel("Organization name", { exact: true })
    .fill("Coach removal access recovery");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`coach-removal-access-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new Error("Missing created organization UUID route identity");
  const adminMembershipId = e2eIdentity.uuid("removal-admin-membership");
  const candidateMembershipId = e2eIdentity.uuid("removal-candidate-membership");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (db) => {
      await db.insert(organizationMemberships).values([
        {
          id: adminMembershipId,
          organization_id: organizationId,
          profile_id: coachActor.profileId,
        },
        {
          id: candidateMembershipId,
          organization_id: organizationId,
          profile_id: candidateActor.profileId,
        },
      ]);
      await db.insert(organizationMembershipRoleGrants).values([
        { organization_id: organizationId, membership_id: adminMembershipId, role_key: "admin" },
        {
          organization_id: organizationId,
          membership_id: candidateMembershipId,
          role_key: "coach",
        },
      ]);
    });
  });
  await athletePage
    .getByRole("navigation", { name: "Organization administration", exact: true })
    .getByRole("link", { name: "Groups", exact: true })
    .click();
  const groupName = `Revoked removal group ${e2eIdentity.uuid("group")}`;
  await athletePage.getByLabel("Name", { exact: true }).fill(groupName);
  await athletePage
    .getByLabel("Description", { exact: false })
    .fill("Coach roster access description");
  await athletePage.getByRole("button", { name: "Create group", exact: true }).click();
  const groupLink = athletePage.getByRole("link", { name: new RegExp(groupName) });
  await expect(groupLink).toBeVisible();
  const groupId = (await groupLink.getAttribute("href"))?.split("/").at(-1);
  if (!groupId || !/^[0-9a-f-]{36}$/i.test(groupId))
    throw new Error("Missing group UUID route identity");

  await coachPage.goto(`/organizations/${organizationId}/groups/${groupId}/coaches`);
  await waitForAppHydration(coachPage);
  await coachPage
    .getByRole("combobox", { name: "Coach", exact: true })
    .selectOption(candidateMembershipId);
  await coachPage.getByRole("button", { name: "Assign coach", exact: true }).click();
  await expect(coachPage.getByRole("status").filter({ hasText: "Coach assigned." })).toBeVisible();
  await coachPage.reload();
  await waitForAppHydration(coachPage);
  const assigned = coachPage.getByRole("list", { name: "Assigned coaches", exact: true });
  await expect(assigned.getByRole("listitem")).toHaveCount(1);
  await expect(coachPage.getByRole("heading", { name: groupName, exact: true })).toBeVisible();
  await expect(
    coachPage.getByText("Coach roster access description", { exact: true }),
  ).toBeVisible();
  await expect(coachPage.getByRole("button", { name: "Archive group", exact: true })).toBeVisible();
  const assignedLabel = (await assigned.getByRole("listitem").locator("span").textContent()) ?? "";
  if (!assignedLabel) throw new Error("Missing loaded coach roster label");

  const revokedAdmin = await withLocalE2EDatabase(async (database) =>
    database.db
      .update(organizationMembershipRoleGrants)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(organizationMembershipRoleGrants.organization_id, organizationId),
          eq(organizationMembershipRoleGrants.membership_id, adminMembershipId),
          eq(organizationMembershipRoleGrants.role_key, "admin"),
          isNull(organizationMembershipRoleGrants.revoked_at),
        ),
      )
      .returning({ membershipId: organizationMembershipRoleGrants.membership_id }),
  );
  expect(revokedAdmin).toEqual([{ membershipId: adminMembershipId }]);
  await assigned.getByRole("button", { name: "Remove coach", exact: true }).click();
  await coachPage
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove coach", exact: true })
    .click();
  await expect(coachPage.getByRole("heading", { name: "Group access required" })).toBeVisible();
  await expect(coachPage.getByText(assignedLabel, { exact: true })).toHaveCount(0);
  await expect(coachPage.getByRole("list", { name: "Assigned coaches", exact: true })).toHaveCount(
    0,
  );
  await expect(coachPage.getByRole("button", { name: "Remove coach", exact: true })).toHaveCount(0);
  await expect(coachPage.getByRole("button", { name: "Assign coach", exact: true })).toHaveCount(0);
  await expect(coachPage.getByRole("combobox", { name: "Coach", exact: true })).toHaveCount(0);
  await expect(coachPage.getByRole("heading", { name: groupName, exact: true })).toHaveCount(0);
  await expect(coachPage.getByText("Coach roster access description", { exact: true })).toHaveCount(
    0,
  );
  await expect(coachPage.getByRole("button", { name: "Archive group", exact: true })).toHaveCount(
    0,
  );
  await expect(coachPage.getByText("Manage group coaches", { exact: true })).toHaveCount(0);
  await expect(coachPage.getByText("Manage group athletes", { exact: true })).toHaveCount(0);
  await expect(
    coachPage.getByRole("navigation", { name: "Coaching navigation", exact: true }),
  ).toBeVisible();
  await captureNoOverflow(coachPage, testInfo, "coach-removal-access-lost");
});
