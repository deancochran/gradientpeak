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

test("organization totals drill into exact active, paused and primary-gap records", async ({
  athletePage: page,
  coachPage,
  coachActor,
  e2eIdentity,
}, testInfo) => {
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
  const card = (label: string) => page.locator('[data-slot="card"]').filter({ hasText: label });
  for (const [label, count] of [
    ["Active staff", "2"],
    ["Active athlete engagements", "22"],
    ["Paused athlete engagements", "1"],
    ["Need a primary coach", "21"],
  ] as const) {
    await expect(card(label).locator('[data-slot="card-title"]')).toHaveText(count);
  }
  await expect(
    page.getByText(/Timed coverage and plan-horizon signals are not available/),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("overview-counts.png"), fullPage: true });
  const rows = page.getByRole("list", { name: "Athlete coach assignments" }).getByRole("listitem");
  for (const [label, firstPage, secondPage] of [
    ["Active athlete engagements", 20, 2],
    ["Need a primary coach", 20, 1],
  ] as const) {
    await card(label).getByRole("link", { name: "View matching records" }).click();
    await expect(rows).toHaveCount(firstPage);
    await expect(page.getByText("Overview athlete 22", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Overview athlete 23", { exact: true })).toHaveCount(0);
    if (label === "Need a primary coach")
      await expect(page.getByText("Overview athlete 0", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Next page of athletes" }).click();
    await expect(rows).toHaveCount(secondPage);
    await expect(page.getByRole("link", { name: "Next page of athletes" })).toHaveCount(0);
    await page.goto(dashboard);
  }
  await card("Paused athlete engagements")
    .getByRole("link", { name: "View matching records" })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("Overview athlete 22", { exact: true })).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("overview-paused-drilldown.png"),
    fullPage: true,
  });
  await page.goto(dashboard);
  await card("Active staff").getByRole("link", { name: "View matching records" }).click();
  await expect(
    page.getByRole("list", { name: "Active staff roster" }).getByRole("listitem"),
  ).toHaveCount(2);
  await coachPage.goto(dashboard);
  await expect(coachPage.getByRole("region", { name: "Organization operations" })).toHaveCount(0);
  await expect(coachPage.getByText(/access|permission/i).first()).toBeVisible();
});
