import { createHash } from "node:crypto";
import type { Page, Route, TestInfo } from "@playwright/test";
import {
  organizationInvitations,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

const viewports = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "mobile", width: 390, height: 844 },
] as const;

async function captureChooserState(page: Page, testInfo: TestInfo, state: string) {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`O13--chooser-${state}--${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
}

test("switches organization identity and safely handles a suspended organization membership", async ({
  athletePage: page,
  coachActor,
  coachPage,
  e2eIdentity,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  const createOrganization = async (name: string, slugPrefix: string) => {
    await page.goto("/organizations/new");
    await page.getByLabel("Organization name", { exact: true }).fill(name);
    await page
      .getByLabel("Organization URL name", { exact: true })
      .fill(`${slugPrefix}-${e2eIdentity.uuid("organization")}`);
    await page.getByRole("button", { name: "Create organization", exact: true }).click();
    await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
    return new URL(page.url()).pathname.split("/")[2] ?? "";
  };

  const summitId = await createOrganization("Summit switch recovery", "summit-switch");
  await createOrganization("Peak switch recovery", "peak-switch");
  const coachMembershipId = e2eIdentity.uuid("ended-coach-membership");
  await withLocalE2EDatabase((database) =>
    database.typedTransaction(async (transaction) => {
      await transaction.insert(organizationMemberships).values({
        id: coachMembershipId,
        organization_id: summitId,
        profile_id: coachActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: summitId,
        membership_id: coachMembershipId,
        role_key: "coach",
      });
    }),
  );

  await page.goto("/organizations");
  for (const viewport of [
    { label: "desktop", width: 1440, height: 1000 },
    { label: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: testInfo.outputPath(`O13--chooser--${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("link", { name: "Open Summit switch recovery coaching dashboard" }).click();
  await expect(page).toHaveURL(new RegExp(`/organizations/${summitId}/dashboard$`));
  await expect(page.getByText("Summit switch recovery", { exact: true })).toBeVisible();

  await page.goto("/organizations");
  await page.getByRole("link", { name: "Open Peak switch recovery coaching dashboard" }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  await expect(page.getByText("Peak switch recovery", { exact: true })).toBeVisible();
  await expect(page.getByText("Summit switch recovery", { exact: true })).toHaveCount(0);

  await page.goto(`/organizations/${summitId}/staff`);
  await page.getByRole("button", { name: /^Suspend / }).click();
  await page.getByRole("button", { name: "Suspend membership", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "suspended." })).toBeVisible();
  await coachPage.goto(`/organizations/${summitId}/coaching`);
  await expect(
    coachPage.getByRole("heading", { name: "Organization access unavailable" }),
  ).toBeVisible();
  await expect(coachPage.getByRole("link", { name: "Return to Personal workspace" })).toBeVisible();
  for (const viewport of [
    { label: "desktop", width: 1440, height: 1000 },
    { label: "mobile", width: 390, height: 844 },
  ]) {
    await coachPage.setViewportSize(viewport);
    await coachPage.screenshot({
      path: testInfo.outputPath(`O13--access-unavailable--${viewport.label}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("keeps pending invitations separate from accepted memberships and recovers their secondary read", async ({
  athleteActor,
  coachActor,
  coachPage: page,
  e2eIdentity,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");

  const acceptedOrganizations = Array.from({ length: 21 }, (_, index) => ({
    id: e2eIdentity.uuid(`accepted-organization-${index + 1}`),
    membershipId: e2eIdentity.uuid(`accepted-membership-${index + 1}`),
    name: `O13 accepted membership ${String(index + 1).padStart(2, "0")}`,
    slug: `o13-accepted-${String(index + 1).padStart(2, "0")}-${e2eIdentity.suffix("slug", 12)}`,
  }));
  const pendingOrganizationId = e2eIdentity.uuid("pending-invitation-organization");
  const pendingOwnerMembershipId = e2eIdentity.uuid("pending-invitation-owner-membership");
  const pendingInvitationId = e2eIdentity.uuid("pending-invitation");

  await withLocalE2EDatabase((database) =>
    database.typedTransaction(async (transaction) => {
      for (const organization of acceptedOrganizations) {
        await transaction.insert(organizations).values({
          id: organization.id,
          created_by_profile_id: coachActor.profileId,
          root_owner_membership_id: organization.membershipId,
          name: organization.name,
          slug: organization.slug,
          timezone: "UTC",
        });
        await transaction.insert(organizationMemberships).values({
          id: organization.membershipId,
          organization_id: organization.id,
          profile_id: coachActor.profileId,
        });
        await transaction.insert(organizationMembershipRoleGrants).values({
          organization_id: organization.id,
          membership_id: organization.membershipId,
          role_key: "admin",
        });
      }

      await transaction.insert(organizations).values({
        id: pendingOrganizationId,
        created_by_profile_id: athleteActor.profileId,
        root_owner_membership_id: pendingOwnerMembershipId,
        name: "O13 pending invitation only",
        slug: `o13-pending-${e2eIdentity.suffix("pending-slug", 16)}`,
        timezone: "UTC",
      });
      await transaction.insert(organizationMemberships).values({
        id: pendingOwnerMembershipId,
        organization_id: pendingOrganizationId,
        profile_id: athleteActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: pendingOrganizationId,
        membership_id: pendingOwnerMembershipId,
        role_key: "admin",
      });
      await transaction.insert(organizationInvitations).values({
        id: pendingInvitationId,
        organization_id: pendingOrganizationId,
        invited_by_membership_id: pendingOwnerMembershipId,
        invitation_kind: "staff",
        requested_role_key: "coach",
        invited_profile_id: coachActor.profileId,
        token_digest: createHash("sha256").update(pendingInvitationId).digest("hex"),
        expires_at: new Date(Date.now() + 86_400_000),
      });
    }),
  );

  const firstMembership = acceptedOrganizations[0];
  const finalMembership = acceptedOrganizations.at(-1);
  if (!firstMembership || !finalMembership)
    throw new Error("Missing O13 accepted membership fixture");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/organizations/${firstMembership.id}/coaching`);
  await waitForAppHydration(page);

  // Discover the generated server-function transport during hydrated navigation rather than
  // assuming a framework-specific URL. SSR navigation cannot exercise this interception.
  const initialInvitationRead = page.waitForResponse(async (response) => {
    if (response.request().method() !== "POST" || !response.ok()) return false;
    const body = await response.json().catch(() => null);
    const serialized = JSON.stringify(body);
    return serialized.includes('"invitations"') && serialized.includes(pendingInvitationId);
  });
  await page
    .getByRole("navigation", { name: "Coaching navigation", exact: true })
    .getByRole("link", { name: "Organizations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Coaching organizations", exact: true }),
  ).toBeVisible();
  const invitationsEndpoint = (await initialInvitationRead).url();

  await expect(
    page.getByRole("link", {
      name: `Open ${firstMembership.name} coaching dashboard`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `Open ${finalMembership.name} coaching dashboard`,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Next page", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Membership pending", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 pending organization invitation (1 staff)", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Open O13 pending invitation only coaching dashboard",
      exact: true,
    }),
  ).toHaveCount(0);
  await captureChooserState(page, testInfo, "pending-membership");

  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: `Open ${finalMembership.name} coaching dashboard`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "First page", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: `Open ${firstMembership.name} coaching dashboard`,
      exact: true,
    }),
  ).toBeVisible();

  const membershipLink = page.getByRole("link", {
    name: `Open ${firstMembership.name} coaching dashboard`,
    exact: true,
  });
  await membershipLink.focus();
  await expect(membershipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/organizations/${firstMembership.id}/dashboard`);
  await page.goto("/organizations");
  await expect(
    page.getByRole("heading", { name: "Membership pending", exact: true }),
  ).toBeVisible();

  const invitationLink = page.getByRole("link", {
    name: "Review pending invitations",
    exact: true,
  });
  await invitationLink.focus();
  await expect(invitationLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/organization-invitations");

  await page.goto(`/organizations/${firstMembership.id}/coaching`);
  await waitForAppHydration(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  let releaseInvitationRead = () => {};
  const heldInvitationRead = new Promise<void>((resolve) => {
    releaseInvitationRead = resolve;
  });
  let finishInvitationRead = () => {};
  const invitationReadFinished = new Promise<void>((resolve) => {
    finishInvitationRead = resolve;
  });
  let invitationReadStarted = false;
  const failInvitationRead = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    invitationReadStarted = true;
    try {
      await heldInvitationRead;
      await route.abort("failed");
    } finally {
      finishInvitationRead();
    }
  };
  const matchesInvitationEndpoint = (url: URL) => url.toString() === invitationsEndpoint;
  await page.route(matchesInvitationEndpoint, failInvitationRead);
  try {
    await page
      .getByRole("navigation", { name: "Coaching navigation", exact: true })
      .getByRole("link", { name: "Organizations", exact: true })
      .click();
    await expect.poll(() => invitationReadStarted).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Loading organizations", exact: true }),
    ).toBeVisible();
    await captureChooserState(page, testInfo, "secondary-invitation-loading");

    releaseInvitationRead();
    await expect(
      page.getByRole("heading", { name: "Invitation status unavailable", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `Open ${firstMembership.name} coaching dashboard`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Membership pending", exact: true }),
    ).toHaveCount(0);
    for (const control of [
      page.getByRole("button", { name: "Retry invitation status", exact: true }),
      page.getByRole("link", { name: "Review organization invitations", exact: true }),
    ]) {
      await expect(control).toBeVisible();
      const contrast = await control.evaluate((element) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas color conversion unavailable");
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const rgba = context.getImageData(0, 0, 1, 1).data;
          if (rgba[3] !== 255) throw new Error("Expected opaque recovery control colors");
          const channels = Array.from(rgba)
            .slice(0, 3)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
          const [red, green, blue] = channels;
          if (red === undefined || green === undefined || blue === undefined) {
            throw new Error("Missing converted RGB channels");
          }
          return red * 0.2126 + green * 0.7152 + blue * 0.0722;
        };
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    await captureChooserState(page, testInfo, "secondary-invitation-error");
  } finally {
    releaseInvitationRead();
    await page.unroute(matchesInvitationEndpoint, failInvitationRead);
    if (invitationReadStarted) await invitationReadFinished;
  }

  await page.getByRole("button", { name: "Retry invitation status", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Membership pending", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `Open ${firstMembership.name} coaching dashboard`,
      exact: true,
    }),
  ).toBeVisible();
});

test("shows an explicit empty chooser state when the profile has no memberships or invitations", async ({
  actorFactory,
}) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  const actor = await actorFactory.create("coach", { label: "o13-empty-chooser", primary: false });
  const page = await actor.createPage("/organizations");

  await expect(
    page.getByRole("heading", { name: "No coaching organizations", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("No coaching organizations", { exact: true })
      .getByRole("link", { name: "Create organization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Personal workspace", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membership pending", exact: true })).toHaveCount(
    0,
  );
});
