import {
  activityPlans,
  athletePlanEditGrants,
  coachingAssignments,
  coachingEngagements,
  coachingWorkoutPublications,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
  profiles,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { seedOwnedActivityPlan } from "../seeds/activity-plans";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function captureSurface(input: {
  name: string;
  page: import("@playwright/test").Page;
  testInfo: import("@playwright/test").TestInfo;
}) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await input.page.setViewportSize(viewport);
    const path = input.testInfo.outputPath(`${input.name}-${viewport.width}.png`);
    await input.page.screenshot({ path, fullPage: true, scale: "css" });
    await input.testInfo.attach(`${input.name}-${viewport.width}`, {
      path,
      contentType: "image/png",
    });
  }
}

test("[coaching-publication] athlete grants, coach publishes an owned workout, and revocation denies a later publication", async ({
  athleteActor,
  athletePage,
  coachActor,
  coachPage,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const today = new Date().toISOString().slice(0, 10);
  const planningDate = addUtcDays(today, 7);
  const deniedDate = addUtcDays(today, 8);
  const workoutName = "Playwright Tempo Builder";
  const publishedWorkoutName = `${workoutName} (Copy)`;

  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Publication acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`publication-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.match(
    /\/organizations\/([0-9a-f-]{36})\/dashboard$/i,
  )?.[1];
  if (!organizationId) throw new Error("Organization creation did not provide a UUID.");

  const coachMembershipId = e2eIdentity.uuid("publication-coach-membership");
  const engagementId = e2eIdentity.uuid("publication-engagement");
  await e2eDatabase.typedTransaction(async (transaction) => {
    await transaction
      .update(profiles)
      .set({ planning_timezone: "UTC", updated_at: new Date() })
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
    await transaction.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: athleteActor.profileId,
    });
    await transaction.insert(coachingAssignments).values({
      organization_id: organizationId,
      engagement_id: engagementId,
      coach_membership_id: coachMembershipId,
      assignment_kind: "primary",
    });
  });
  const { activityPlanId } = await seedOwnedActivityPlan(
    e2eDatabase,
    coachActor.profileId,
    e2eIdentity.suffix("publication-coach-workout", 64),
  );

  await athletePage.goto("/settings#coaching");
  await waitForAppHydration(athletePage);
  const grant = athletePage.getByRole("switch", {
    name: /Allow .* to publish workouts/i,
  });
  await expect(grant).toBeVisible();
  await expect(grant).not.toBeChecked();
  await grant.click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: /can now publish workouts/i }),
  ).toBeVisible();
  await expect(grant).toBeChecked();
  await captureSurface({ name: "publication-athlete-grant", page: athletePage, testInfo });

  await coachPage.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(coachPage);
  await expect(coachPage.getByText("Publish a workout", { exact: true })).toBeVisible();
  const workout = coachPage.getByLabel("Your workout", { exact: true });
  await workout.selectOption(activityPlanId);
  await coachPage.getByLabel("Athlete planning date", { exact: true }).fill(planningDate);
  await coachPage.getByRole("button", { name: "Preview publication", exact: true }).click();
  await expect(
    coachPage.getByText(`Ready to publish: ${workoutName}`, { exact: true }),
  ).toBeVisible();
  await expect(
    coachPage.getByText(`${planningDate} in the athlete’s UTC planning time zone.`, {
      exact: true,
    }),
  ).toBeVisible();
  await captureSurface({ name: "publication-coach-preview", page: coachPage, testInfo });
  await coachPage.getByRole("button", { name: "Publish workout", exact: true }).click();
  await expect(
    coachPage
      .getByRole("status")
      .filter({ hasText: `Published ${workoutName} for ${planningDate}.` }),
  ).toBeVisible();

  const [publication] = await e2eDatabase.db
    .select({ copiedActivityPlanId: coachingWorkoutPublications.copied_activity_plan_id })
    .from(coachingWorkoutPublications)
    .where(
      and(
        eq(coachingWorkoutPublications.athlete_profile_id, athleteActor.profileId),
        eq(coachingWorkoutPublications.organization_id, organizationId),
        eq(coachingWorkoutPublications.source_activity_plan_id, activityPlanId),
        eq(coachingWorkoutPublications.planning_date, planningDate),
      ),
    );
  if (!publication) throw new Error("The published workout did not create a publication receipt.");
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ name: activityPlans.name, planningDate: plannedSessions.planning_date })
        .from(plannedSessions)
        .innerJoin(activityPlans, eq(activityPlans.id, plannedSessions.activity_plan_id))
        .where(
          and(
            eq(plannedSessions.profile_id, athleteActor.profileId),
            eq(plannedSessions.activity_plan_id, publication.copiedActivityPlanId),
          ),
        ),
    )
    .toEqual([{ name: publishedWorkoutName, planningDate }]);

  await athletePage.goto(
    `/calendar?month=${planningDate.slice(0, 7)}&date=${planningDate}&view=month`,
  );
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByText("Personal planned sessions", { exact: true })).toBeVisible();
  const publishedSession = athletePage
    .getByText(publishedWorkoutName, { exact: true })
    .locator("..");
  await expect(publishedSession).toBeVisible();
  await expect(publishedSession).toContainText(`${planningDate} · scheduled`);
  await captureSurface({ name: "publication-athlete-calendar", page: athletePage, testInfo });

  await athletePage.goto("/settings#coaching");
  await waitForAppHydration(athletePage);
  await expect(grant).toBeChecked();
  await grant.click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: /can no longer publish workouts/i }),
  ).toBeVisible();
  await expect(grant).not.toBeChecked();
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ id: athletePlanEditGrants.id })
        .from(athletePlanEditGrants)
        .where(
          and(
            eq(athletePlanEditGrants.engagement_id, engagementId),
            eq(athletePlanEditGrants.coach_membership_id, coachMembershipId),
            isNull(athletePlanEditGrants.revoked_at),
          ),
        ),
    )
    .toEqual([]);

  await coachPage.getByLabel("Athlete planning date", { exact: true }).fill(deniedDate);
  await coachPage.getByRole("button", { name: "Preview publication", exact: true }).click();
  await expect(coachPage.getByRole("alert")).toContainText(
    "Athlete plan-edit permission is unavailable",
  );
  await expect(
    coachPage.getByRole("button", { name: "Publish workout", exact: true }),
  ).toBeDisabled();
  await coachPage.close();
});
