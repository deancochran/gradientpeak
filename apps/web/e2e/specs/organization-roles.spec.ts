import type { Page, Route, TestInfo } from "@playwright/test";
import {
  organizationAuditEvents,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});

async function screenshotSettled(page: Page, testInfo: TestInfo, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.getAnimations().every((animation) => animation.playState !== "running"),
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath(name), scale: "css" });
}

test("[organization-roles] root owner previews, retries, and grants a fixed admin role through the role API", async ({
  athletePage,
  coachActor,
  e2eIdentity,
  profileActor,
}, testInfo) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Role preview workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`roles-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/.test(organizationId))
    throw new Error("Missing created organization UUID route identity");

  const membershipId = e2eIdentity.uuid("role-target-membership");
  const discoveryMembershipId = e2eIdentity.uuid("role-discovery-membership");
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      await transaction.insert(organizationMemberships).values([
        {
          id: membershipId,
          organization_id: organizationId,
          profile_id: coachActor.profileId,
        },
        {
          id: discoveryMembershipId,
          organization_id: organizationId,
          profile_id: profileActor.profileId,
        },
      ]);
      // lifecycle.staff.list intentionally inner-joins active role grants, so
      // a valid Coach grant is required for these selectable staff fixtures.
      await transaction.insert(organizationMembershipRoleGrants).values([
        { organization_id: organizationId, membership_id: membershipId, role_key: "coach" },
        {
          organization_id: organizationId,
          membership_id: discoveryMembershipId,
          role_key: "coach",
        },
      ]);
    });
  });

  await athletePage.goto(`/organizations/${organizationId}/roles`);
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await athletePage.setViewportSize(viewport);
    await expect(athletePage.getByLabel("Staff member", { exact: true })).toBeVisible();
    await screenshotSettled(athletePage, testInfo, `O04--ready--${name}.png`);
  }
  await athletePage.setViewportSize({ width: 1440, height: 1000 });
  await athletePage.getByLabel("Staff member", { exact: true }).selectOption(discoveryMembershipId);
  await athletePage.getByRole("button", { name: "Preview role change", exact: true }).click();
  const discoveryResponse = athletePage.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const body = await response.json().catch(() => null);
    return (
      JSON.stringify(body).includes(discoveryMembershipId) &&
      JSON.stringify(body).includes("granted")
    );
  });
  await athletePage.getByRole("button", { name: "Grant Coach role", exact: true }).click();
  const successfulGrantResponse = await discoveryResponse;
  const grantEndpoint = successfulGrantResponse.url();
  expect(successfulGrantResponse.request().method()).toBe("POST");
  const successfulReceipt = await successfulGrantResponse.json();
  expect(JSON.stringify(successfulReceipt)).toContain(discoveryMembershipId);
  expect(JSON.stringify(successfulReceipt)).toContain("granted");
  await expect(
    athletePage.getByRole("status").filter({ hasText: "Server receipt received" }),
  ).toBeVisible();
  await athletePage.getByLabel("Staff member", { exact: true }).selectOption(membershipId);
  await athletePage.getByRole("button", { name: "Admin", exact: true }).click();
  await athletePage.getByRole("button", { name: "Preview role change", exact: true }).click();
  await expect(athletePage.getByText("Confirm role change", { exact: true })).toBeVisible();
  await expect(athletePage.getByText("Proposed role", { exact: true })).toBeVisible();
  await expect(
    athletePage.getByText(/roles do not grant messaging, exports, billing, or plan-editing/i),
  ).toBeVisible();
  await expect(athletePage.getByText(/separate assignment and consent/i)).toBeVisible();
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await athletePage.setViewportSize(viewport);
    await screenshotSettled(athletePage, testInfo, `O04--preview--${name}.png`);
  }

  let interceptionCount = 0;
  const grantEndpointMatcher = (url: URL) => url.href === grantEndpoint;
  const dropTargetGrantResponse = async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST" || !(request.postData() ?? "").includes(membershipId)) {
      await route.continue();
      return;
    }
    interceptionCount += 1;
    await route.fetch();
    await route.abort("failed");
  };
  await athletePage.route(grantEndpointMatcher, dropTargetGrantResponse);
  try {
    await athletePage.getByRole("button", { name: "Grant Admin role", exact: true }).click();
    await expect(athletePage.getByRole("alert")).toContainText(
      "could not confirm whether this change completed",
    );
    expect(interceptionCount).toBe(1);
  } finally {
    await athletePage.unroute(grantEndpointMatcher, dropTargetGrantResponse);
  }
  const firstReceipt = await withLocalE2EDatabase(async (database) => {
    const events = await database.db
      .select({ correlationId: organizationAuditEvents.correlation_id })
      .from(organizationAuditEvents)
      .where(
        and(
          eq(organizationAuditEvents.organization_id, organizationId),
          eq(organizationAuditEvents.action, "organization.staff_role_granted"),
          eq(organizationAuditEvents.resource_id, membershipId),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]?.correlationId).not.toBeNull();
    return events[0]?.correlationId;
  });
  await athletePage
    .getByRole("button", { name: "Retry same Grant Admin role", exact: true })
    .click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: "Server receipt received" }),
  ).toBeVisible();
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await athletePage.setViewportSize(viewport);
    await screenshotSettled(athletePage, testInfo, `O04--changed--${name}.png`);
  }

  await withLocalE2EDatabase(async (database) => {
    const [grant] = await database.db
      .select()
      .from(organizationMembershipRoleGrants)
      .where(
        and(
          eq(organizationMembershipRoleGrants.organization_id, organizationId),
          eq(organizationMembershipRoleGrants.membership_id, membershipId),
          eq(organizationMembershipRoleGrants.role_key, "admin"),
          isNull(organizationMembershipRoleGrants.revoked_at),
        ),
      );
    expect(grant).toBeDefined();
    const events = await database.db
      .select({ correlationId: organizationAuditEvents.correlation_id })
      .from(organizationAuditEvents)
      .where(
        and(
          eq(organizationAuditEvents.organization_id, organizationId),
          eq(organizationAuditEvents.action, "organization.staff_role_granted"),
          eq(organizationAuditEvents.resource_id, membershipId),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]?.correlationId).toBe(firstReceipt);
  });
});

test("[organization-roles] an admin cannot grant admin or billing, and a coach cannot manage roles", async ({
  athletePage,
  coachActor,
  coachPage,
  e2eIdentity,
  profileActor,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Role boundary workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`role-boundaries-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId || !/^[0-9a-f-]{36}$/.test(organizationId))
    throw new Error("Missing created organization UUID route identity");

  const adminMembershipId = e2eIdentity.uuid("role-admin-membership");
  const targetMembershipId = e2eIdentity.uuid("role-target-membership");
  const rootMembershipId = await withLocalE2EDatabase(async (database) => {
    return database.typedTransaction(async (transaction) => {
      const [organization] = await transaction
        .select({ rootMembershipId: organizations.root_owner_membership_id })
        .from(organizations)
        .where(eq(organizations.id, organizationId));
      if (!organization?.rootMembershipId) throw new Error("Missing root membership");
      await transaction.insert(organizationMemberships).values([
        {
          id: adminMembershipId,
          organization_id: organizationId,
          profile_id: coachActor.profileId,
        },
        {
          id: targetMembershipId,
          organization_id: organizationId,
          profile_id: profileActor.profileId,
        },
      ]);
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: adminMembershipId,
        role_key: "admin",
      });
      // The roles page is a staff-list projection, not a raw-membership list.
      // Give the target an existing valid staff role so the fixture is visible.
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: targetMembershipId,
        role_key: "coach",
      });
      return organization.rootMembershipId;
    });
  });

  await coachPage.goto(`/organizations/${organizationId}/roles`);
  await coachPage.getByLabel("Staff member", { exact: true }).selectOption(targetMembershipId);
  await coachPage.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(coachPage.getByRole("button", { name: "Preview role change" })).toBeDisabled();
  await expect(coachPage.getByText(/unavailable for your current role/i)).toBeVisible();
  await expect(coachPage.getByRole("button", { name: /billing/i })).toHaveCount(0);

  await coachPage.getByLabel("Staff member", { exact: true }).selectOption(rootMembershipId);
  await coachPage.getByRole("button", { name: "Coach", exact: true }).click();
  await expect(coachPage.getByRole("button", { name: "Preview role change" })).toBeDisabled();

  await coachPage.goto(`/organizations/${organizationId}/roles`);
  await withLocalE2EDatabase(async (database) => {
    await database.db
      .update(organizationMembershipRoleGrants)
      .set({ revoked_at: new Date() })
      .where(eq(organizationMembershipRoleGrants.membership_id, adminMembershipId));
    await database.db.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: adminMembershipId,
      role_key: "coach",
    });
  });
  await coachPage.reload();
  await expect(coachPage.getByText("Coaching access required", { exact: true })).toBeVisible();
  await expect(coachPage.getByLabel("Staff member", { exact: true })).toHaveCount(0);
  await expect(coachPage.getByRole("button", { name: "Preview role change" })).toHaveCount(0);
});
