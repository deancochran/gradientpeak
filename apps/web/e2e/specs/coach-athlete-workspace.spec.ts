import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileAthleteState,
  profilePerformanceEstimates,
} from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("non-admin coach switches assigned athletes without receiving unshared metrics", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Workspace acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`workspace-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const secondAthlete = await actorFactory.create("athlete", { label: "second athlete" });
  const coachMembershipId = e2eIdentity.uuid("coach-membership");
  const firstEngagementId = e2eIdentity.uuid("first-engagement");
  const secondEngagementId = e2eIdentity.uuid("second-engagement");
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
      await transaction.insert(coachingEngagements).values([
        {
          id: firstEngagementId,
          organization_id: organizationId,
          athlete_profile_id: athleteActor.profileId,
        },
        {
          id: secondEngagementId,
          organization_id: organizationId,
          athlete_profile_id: secondAthlete.profileId,
        },
      ]);
      await transaction.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: firstEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: secondEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
      ]);
    });
  });
  await athletePage.goto(`/organizations/${organizationId}/athletes`);
  await expect(athletePage.getByRole("button", { name: "Manage coaches" }).first()).toBeVisible();
  const page = await coachActor.createPage(`/organizations/${organizationId}/athletes`);
  await expect(page.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
  await page.getByRole("link", { name: athleteActor.username ?? "Assigned athlete" }).click();
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Switch athlete" }).click();
  const switcher = page.getByRole("list", { name: "Switch athlete" });
  await expect(switcher.getByRole("link")).toHaveCount(2);
  const priorUrl = page.url();
  await switcher
    .locator(`a[href="/organizations/${organizationId}/athletes/${secondAthlete.profileId}"]`)
    .click();
  await expect(page).not.toHaveURL(priorUrl);
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  // Published fixtures live only in this harness-created disposable database.
  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      const policy = e2eIdentity.uuid("metrics-policy");
      const now = new Date();
      await transaction.insert(athleteConsentPolicyVersions).values({
        id: policy,
        scope_key: "metrics",
        effective_from: new Date(now.getTime() - 1000),
        jurisdiction: "e2e",
        terms_text: "Disposable workspace metrics consent",
        content_digest: e2eIdentity.uuid("metrics-digest"),
      });
      for (const fixture of [
        {
          id: athleteActor.profileId,
          engagement: firstEngagementId,
          fitness: 41,
          fatigue: 35,
          watts: 211,
        },
        {
          id: secondAthlete.profileId,
          engagement: secondEngagementId,
          fitness: 72,
          fatigue: 80,
          watts: 322,
        },
      ]) {
        await transaction.insert(athleteDataSharingConsents).values({
          organization_id: organizationId,
          engagement_id: fixture.engagement,
          athlete_profile_id: fixture.id,
          scope_key: "metrics",
          policy_version_id: policy,
          granted_by_profile_id: fixture.id,
        });
        const state = {
          source_revision: 1,
          published_revision: 1,
          fitness: fixture.fitness,
          fatigue: fixture.fatigue,
          computed_at: now,
          coverage_end_at: now,
          evidence_confidence: 0.8,
        };
        await transaction
          .insert(profileAthleteState)
          .values({ profile_id: fixture.id, ...state })
          .onConflictDoUpdate({ target: profileAthleteState.profile_id, set: state });
        await transaction.insert(profilePerformanceEstimates).values({
          profile_id: fixture.id,
          capability_kind: "bike_ftp",
          activity_category: "bike",
          value: fixture.watts,
          unit: "watts",
          confidence: 0.8,
          effective_at: now,
          computed_at: now,
          algorithm_version: "workspace-fixture-v1",
          source_revision: 1,
        });
      }
    });
  });
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("322 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("211 watts", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`@${secondAthlete.username}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch athlete" }).click();
  await page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${athleteActor.profileId}"]`)
    .click();
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("322 watts", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`@${athleteActor.username}`, { exact: true })).toBeVisible();
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await page.close();
});
