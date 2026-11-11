import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileGoals,
  profiles,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("assigned coach reads paged goals independently of metrics and loses them after supported revocation", async ({
  athleteActor,
  athletePage,
  actorFactory,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120000);
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Goals acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`goals-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.match(
    /\/organizations\/([0-9a-f-]{36})\/dashboard$/i,
  )?.[1];
  if (!organizationId) throw new Error("Organization creation did not yield a UUID.");

  const noGoalsAthlete = await actorFactory.create("athlete", {
    label: "metrics-only goals athlete",
  });
  const coachMembershipId = e2eIdentity.uuid("goals-coach-membership");
  const goalsEngagementId = e2eIdentity.uuid("goals-engagement");
  const metricsOnlyEngagementId = e2eIdentity.uuid("goals-metrics-only-engagement");
  const goalsConsentId = e2eIdentity.uuid("goals-consent");
  const targetDate = "2026-12-31";
  const firstGoalName = `Goal 00 ${e2eIdentity.uuid("goal-name")}`;
  const afterPageGoalName = `Goal 20 ${e2eIdentity.uuid("goal-name")}`;

  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      await transaction
        .update(profiles)
        .set({ planning_timezone: "America/Los_Angeles" })
        .where(eq(profiles.id, athleteActor.profileId));
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
      await transaction.insert(coachingEngagements).values([
        {
          id: goalsEngagementId,
          organization_id: organizationId,
          athlete_profile_id: athleteActor.profileId,
        },
        {
          id: metricsOnlyEngagementId,
          organization_id: organizationId,
          athlete_profile_id: noGoalsAthlete.profileId,
        },
      ]);
      await transaction.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: goalsEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: metricsOnlyEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
      ]);
      const goalsPolicyId = e2eIdentity.uuid("goals-policy");
      const metricsPolicyId = e2eIdentity.uuid("goals-metrics-policy");
      await transaction.insert(athleteConsentPolicyVersions).values([
        {
          id: goalsPolicyId,
          scope_key: "goals",
          effective_from: new Date(Date.now() - 1000),
          jurisdiction: "e2e",
          terms_text: "Disposable goals consent",
          content_digest: `sha256:${goalsPolicyId}`,
        },
        {
          id: metricsPolicyId,
          scope_key: "metrics",
          effective_from: new Date(Date.now() - 1000),
          jurisdiction: "e2e",
          terms_text: "Disposable metrics consent",
          content_digest: `sha256:${metricsPolicyId}`,
        },
      ]);
      await transaction.insert(athleteDataSharingConsents).values([
        {
          id: goalsConsentId,
          organization_id: organizationId,
          engagement_id: goalsEngagementId,
          athlete_profile_id: athleteActor.profileId,
          scope_key: "goals",
          policy_version_id: goalsPolicyId,
          granted_by_profile_id: athleteActor.profileId,
        },
        {
          organization_id: organizationId,
          engagement_id: goalsEngagementId,
          athlete_profile_id: athleteActor.profileId,
          scope_key: "metrics",
          policy_version_id: metricsPolicyId,
          granted_by_profile_id: athleteActor.profileId,
        },
        {
          organization_id: organizationId,
          engagement_id: metricsOnlyEngagementId,
          athlete_profile_id: noGoalsAthlete.profileId,
          scope_key: "metrics",
          policy_version_id: metricsPolicyId,
          granted_by_profile_id: noGoalsAthlete.profileId,
        },
      ]);
      const createdAt = new Date("2026-01-01T00:00:00.000Z");
      await transaction.insert(profileGoals).values(
        Array.from({ length: 21 }, (_, index) => ({
          id: e2eIdentity.uuid(`goal-${index}`),
          profile_id: athleteActor.profileId,
          title:
            index === 0
              ? firstGoalName
              : index === 20
                ? afterPageGoalName
                : `Goal ${String(index).padStart(2, "0")}`,
          priority: index % 11,
          activity_category: "run" as const,
          target_date: targetDate,
          target_payload: {
            type: "event_performance",
            activity_category: "run",
            distance_m: 5000,
            target_time_s: 1500,
          },
          created_at: new Date(createdAt.getTime() + index),
          updated_at: new Date(createdAt.getTime() + index),
        })),
      );
    });
  });

  const page = await coachActor.createPage(
    `/organizations/${organizationId}/athletes/${athleteActor.profileId}`,
  );
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await expect(page.getByText(afterPageGoalName, { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: afterPageGoalName })
      .getByText(`Target date: ${targetDate} · run · Priority 9`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Lifecycle: in progress", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more goals" })).toBeVisible();
  await page.getByRole("button", { name: "Load more goals" }).click();
  await expect(page.getByText(firstGoalName, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more goals" })).toHaveCount(0);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByRole("list", { name: "Goals" }).getByRole("listitem").first(),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`coach-athlete-goals-ready-${viewport.width}.png`),
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: "Switch athlete" }).click();
  await page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${noGoalsAthlete.profileId}"]`)
    .click();
  await expect(page.getByRole("heading", { name: "Goals unavailable" })).toBeVisible();
  await expect(page.getByText(firstGoalName, { exact: true })).toHaveCount(0);

  await withLocalE2EDatabase(async (database) =>
    database.db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.id, goalsConsentId)),
  );
  await page.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "Current training state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Goals unavailable" })).toBeVisible();
  await expect(page.getByText(firstGoalName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(targetDate, { exact: false })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("coach-athlete-goals-denied-mobile.png"),
    fullPage: true,
  });
  await page.close();
});
