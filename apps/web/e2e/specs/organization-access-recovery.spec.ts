import { organizationMembershipRoleGrants, organizationMemberships } from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

test("switches organization identity and safely recovers after organization access ends", async ({
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
