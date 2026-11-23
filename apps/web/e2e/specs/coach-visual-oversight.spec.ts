import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  dailyTrainingLoad,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileAthleteState,
  profileGoals,
  profiles,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("coach compares shared visual evidence and returns from a prefixed athlete message", async ({
  athleteActor,
  athletePage,
  actorFactory,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Visual oversight");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`visual-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization id");
  const second = await actorFactory.create("athlete", { label: "visual oversight second athlete" });
  const membershipId = e2eIdentity.uuid("coach-membership");
  const athletes = [athleteActor, second];
  const engagements = athletes.map((_, index) => e2eIdentity.uuid(`engagement-${index}`));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  await withLocalE2EDatabase(async (database) =>
    database.typedTransaction(async (tx) => {
      await tx
        .update(profiles)
        .set({ planning_timezone: "America/Los_Angeles" })
        .where(eq(profiles.id, athleteActor.profileId));
      await tx.insert(organizationMemberships).values({
        id: membershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await tx.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membershipId,
        role_key: "coach",
      });
      await tx.insert(coachingEngagements).values(
        athletes.map((athlete, index) => ({
          id: engagements[index] ?? "",
          organization_id: organizationId,
          athlete_profile_id: athlete.profileId,
        })),
      );
      await tx.insert(coachingAssignments).values(
        engagements.map((engagementId) => ({
          organization_id: organizationId,
          engagement_id: engagementId,
          coach_membership_id: membershipId,
          assignment_kind: "primary" as const,
        })),
      );
      for (const scope of ["metrics", "activities", "goals"] as const) {
        const policyId = e2eIdentity.uuid(`policy-${scope}`);
        await tx.insert(athleteConsentPolicyVersions).values({
          id: policyId,
          scope_key: scope,
          effective_from: new Date(Date.now() - 1000),
          jurisdiction: "e2e",
          terms_text: "Disposable visual oversight consent",
          content_digest: `sha256:${policyId}`,
        });
        await tx.insert(athleteDataSharingConsents).values(
          athletes.map((athlete, index) => ({
            organization_id: organizationId,
            engagement_id: engagements[index] ?? "",
            athlete_profile_id: athlete.profileId,
            scope_key: scope,
            policy_version_id: policyId,
            granted_by_profile_id: athlete.profileId,
          })),
        );
      }
      for (const [index, athlete] of athletes.entries()) {
        await tx.insert(profileAthleteState).values({
          profile_id: athlete.profileId,
          source_revision: 1,
          published_revision: 1,
          fitness: 30 + index,
          fatigue: 20 + index,
          evidence_confidence: 0.8,
          computed_at: new Date(),
        });
        await tx.insert(dailyTrainingLoad).values({
          profile_id: athlete.profileId,
          planning_date: today,
          common_load: 10 + index,
          fitness: 30 + index,
          fatigue: 20 + index,
          form: 10,
          coverage_status: "complete",
          contributing_activity_count: 1,
          omitted_activity_count: 0,
          source_revision: 1,
          calculation_version: "e2e-v1",
        });
      }
      await tx.insert(profileGoals).values({
        id: e2eIdentity.uuid("goal"),
        profile_id: athleteActor.profileId,
        title: "Target race",
        priority: 1,
        activity_category: "run",
        target_date: "2027-01-01",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1500,
        },
        created_at: new Date(),
        updated_at: new Date(),
      });
    }),
  );
  const page = await coachActor.createPage(`/organizations/${organizationId}/athletes`);
  await expect(page.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
  await expect(page.getByText("Recent training state").first()).toBeVisible();
  await expect(page.getByText("Target race · 2027-01-01")).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`coach-visual-roster-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("link", { name: athleteActor.username ?? "Assigned athlete" }).click();
  await waitForAppHydration(page);
  await expect(page.getByRole("link", { name: "Message athlete" })).toBeVisible();
  await page.getByRole("link", { name: "Message athlete" }).click();
  await expect(page.getByRole("heading", { name: "New message" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Remove @${athleteActor.username} from recipients` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Close" }).click();
  await expect(page.getByRole("link", { name: "Return to athlete workspace" })).toBeVisible();
  await page.getByRole("link", { name: "Return to athlete workspace" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/organizations/${organizationId}/athletes/${athleteActor.profileId}$`),
  );
});
