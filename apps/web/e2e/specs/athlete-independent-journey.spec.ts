import {
  markDisposableAthleteStateDirty,
  processAthleteStateJobs,
} from "@repo/api/test-support/activity-evidence-acceptance";
import { activityCategoryChoices } from "@repo/core";
import {
  coachingEngagements,
  plannedSessions,
  profileAthleteState,
  profileGoals,
  profiles,
  trainingPlanApplications,
  trainingPlans,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, GoalsPage, TrainingPlansPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { seedOwnedActivityPlan } from "../seeds/activity-plans";
import { registerTrainingPlanCleanup } from "../training-plans/cleanup";
import { currentContractEpochHeaders } from "../utils/contractEpoch";

function futureUtcDate(daysFromNow: number) {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  return date.toISOString().slice(0, 10);
}

test("an independent athlete creates a goal and plan, schedules it, and retains selected context through recovery", async ({
  actorFactory,
  e2eCleanup,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const athlete = await actorFactory.create("onboarding", {
    label: "independent-athlete",
    fullName: "Independent athlete",
    username: `independent_${e2eIdentity.suffix("independent-athlete")}`,
  });
  const targetDate = futureUtcDate(45);
  // Home's upcoming schedule is a seven-day exclusive window, so keep the
  // selected date inside it rather than placing the fixture on its boundary.
  const scheduleDate = futureUtcDate(6);
  const goalTitle = e2eIdentity.name("Independent goal");
  const trainingPlanName = e2eIdentity.name("Independent training plan");
  const viewport =
    testInfo.project.name === "Mobile Chrome 390x844"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 };

  await e2eDatabase.db
    .update(profiles)
    .set({
      full_name: "Independent athlete",
      onboarding_status: "completed",
      planning_timezone: "UTC",
      username: `independent_${e2eIdentity.suffix("independent-athlete")}`,
    })
    .where(eq(profiles.id, athlete.profileId));

  const [activeCoaching, initialGoals, initialTrainingPlans] = await Promise.all([
    e2eDatabase.db
      .select({ id: coachingEngagements.id })
      .from(coachingEngagements)
      .where(
        and(
          eq(coachingEngagements.athlete_profile_id, athlete.profileId),
          isNull(coachingEngagements.paused_at),
          isNull(coachingEngagements.ended_at),
        ),
      ),
    e2eDatabase.db
      .select({ id: profileGoals.id })
      .from(profileGoals)
      .where(eq(profileGoals.profile_id, athlete.profileId)),
    e2eDatabase.db
      .select({ id: trainingPlans.id })
      .from(trainingPlans)
      .where(eq(trainingPlans.profile_id, athlete.profileId)),
  ]);
  expect(activeCoaching).toEqual([]);
  expect(initialGoals).toEqual([]);
  expect(initialTrainingPlans).toEqual([]);

  // The activity plan is a deliberately visible library choice, not evidence of
  // an authored training plan. The athlete selects it in the real plan editor.
  const { activityPlanId } = await seedOwnedActivityPlan(
    e2eDatabase,
    athlete.profileId,
    e2eIdentity.suffix("independent-library-plan", 64),
  );
  const bootstrapNow = new Date();
  await markDisposableAthleteStateDirty({
    db: e2eDatabase.db,
    effectiveAt: bootstrapNow,
    now: bootstrapNow,
    profileId: athlete.profileId,
  });
  await processAthleteStateJobs({ db: e2eDatabase.db, limit: 1, now: bootstrapNow });
  const [publishedEmptyState] = await e2eDatabase.db
    .select({
      publishedRevision: profileAthleteState.published_revision,
      sourceRevision: profileAthleteState.source_revision,
    })
    .from(profileAthleteState)
    .where(eq(profileAthleteState.profile_id, athlete.profileId));
  expect(publishedEmptyState).toMatchObject({ publishedRevision: 1, sourceRevision: 1 });

  const athletePage = await athlete.createPage("/");
  await athletePage.setViewportSize(viewport);
  await withGoalFixture(
    async (goalsFixture) => {
      const goals = new GoalsPage(athletePage);
      await goals.startCreate(targetDate);
      const goalForm = athletePage.getByTestId("goal-form");
      await goalForm.getByLabel("Title", { exact: true }).fill(goalTitle);
      const activity = activityCategoryChoices.find((choice) => choice.value === "bike");
      if (!activity) throw new Error("The bike goal choice is absent.");
      await chooseAuthoringOption(athletePage, "Activity", activity.label);
      await chooseAuthoringOption(athletePage, "Priority", "8");
      await goalForm.getByLabel("Sessions / week", { exact: true }).fill("3");
      await goalForm.getByLabel("Weeks", { exact: true }).fill("10");
      goalsFixture.rememberGoalTitle(goalTitle);
      await goalForm.getByTestId("goal-submit").click();

      const goalCard = athletePage
        .locator('[data-testid^="goal-card-"]')
        .filter({ hasText: goalTitle });
      await expect(goalCard).toBeVisible();
      const goalId = (await goalCard.getAttribute("data-testid"))?.replace("goal-card-", "");
      if (!goalId) throw new Error("The created goal card did not expose its ID.");
      goalsFixture.rememberGoal(goalId);
      await expect
        .poll(() => goalsFixture.getGoal(goalId))
        .toMatchObject({
          title: goalTitle,
          targetDate,
        });
      const originalGoal = await goalsFixture.getGoal(goalId);
      if (!originalGoal)
        throw new Error("The created goal was not available for recovery comparison.");

      await athletePage.goto(`/goals/${goalId}`);
      await expect(
        athletePage.getByRole("heading", { name: goalTitle, exact: true }),
      ).toBeVisible();
      await athletePage.getByTestId(`goal-edit-${goalId}`).click();
      await chooseAuthoringOption(athletePage, "Goal type", "Completion");
      await athletePage.getByLabel("Duration", { exact: true }).fill("0:10:00");
      const optionalDistance = athletePage.getByLabel("Distance (km)", { exact: true });
      await optionalDistance.fill("10km");
      await athletePage.getByTestId("goal-submit").click();
      await expect(optionalDistance).toBeFocused();
      await expect(optionalDistance).toHaveAttribute("aria-invalid", "true");
      await expect(athletePage.getByRole("alert")).toContainText(/distance/i);
      await athletePage.screenshot({
        path: testInfo.outputPath(`independent-athlete-goal-invalid-${viewport.width}.png`),
        scale: "css",
      });
      await optionalDistance.fill("");
      await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(
        athletePage.getByRole("heading", { name: goalTitle, exact: true }),
      ).toBeVisible();
      await expect.poll(() => goalsFixture.getGoal(goalId)).toEqual(originalGoal);
      await athletePage.screenshot({
        path: testInfo.outputPath(`independent-athlete-goal-recovery-${viewport.width}.png`),
        scale: "css",
      });

      const plans = new TrainingPlansPage(athletePage);
      await plans.openLibrary();
      await plans.startCreate();
      await athletePage.getByLabel("Name", { exact: true }).fill(trainingPlanName);
      await athletePage.getByLabel("Description", { exact: true }).fill("Athlete-owned schedule.");
      await athletePage.getByRole("button", { name: "Add activity", exact: true }).click();
      await athletePage
        .getByRole("combobox", { name: "Activity plan", exact: true })
        .selectOption({ label: "Playwright Tempo Builder" });
      await athletePage.getByRole("button", { name: "Create plan", exact: true }).click();
      await expect(
        athletePage.getByRole("heading", { name: trainingPlanName, exact: true }),
      ).toBeVisible();

      const [createdPlan] = await e2eDatabase.db
        .select({ id: trainingPlans.id })
        .from(trainingPlans)
        .where(
          and(
            eq(trainingPlans.profile_id, athlete.profileId),
            eq(trainingPlans.name, trainingPlanName),
          ),
        );
      if (!createdPlan) throw new Error("The athlete-created training plan was not persisted.");
      registerTrainingPlanCleanup(e2eCleanup, {
        id: createdPlan.id,
        ownerProfileId: athlete.profileId,
        scheduledByProfileId: athlete.profileId,
        systemTemplate: false,
      });

      await plans.reviewSchedule(scheduleDate);
      const previewApplications = await e2eDatabase.db
        .select({ id: trainingPlanApplications.id })
        .from(trainingPlanApplications)
        .where(
          and(
            eq(trainingPlanApplications.training_plan_id, createdPlan.id),
            eq(trainingPlanApplications.profile_id, athlete.profileId),
          ),
        );
      expect(previewApplications).toEqual([]);
      await athletePage.screenshot({
        path: testInfo.outputPath(`independent-athlete-schedule-preview-${viewport.width}.png`),
        scale: "css",
      });
      await plans.confirmSchedule();
      await expect(athletePage.getByText("Plan scheduled.", { exact: true })).toBeVisible();

      const [scheduledSession] = await e2eDatabase.db
        .select({ id: plannedSessions.id, planningDate: plannedSessions.planning_date })
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.training_plan_id, createdPlan.id),
            eq(plannedSessions.profile_id, athlete.profileId),
            eq(plannedSessions.status, "scheduled"),
          ),
        );
      expect(scheduledSession).toMatchObject({ planningDate: scheduleDate });
      if (!scheduledSession)
        throw new Error("The confirmed schedule did not create a planned session.");

      const dashboardResponse = await athletePage.request.get(
        "/api/trpc/home.getDashboard?batch=1&input=%7B%7D",
        { headers: currentContractEpochHeaders },
      );
      const dashboardBody = await dashboardResponse.text();
      expect(
        dashboardResponse.ok(),
        `home.getDashboard returned ${dashboardResponse.status()}: ${dashboardBody}`,
      ).toBe(true);
      await athletePage.goto("/");
      const homeSession = athletePage
        .getByTestId("home-upcoming-schedule")
        .locator(`a[href="/plan?date=${scheduleDate}"]`);
      await expect(homeSession).toBeVisible();
      await homeSession.focus();
      await athletePage.keyboard.press("Enter");
      await expect(athletePage.locator("#plan-selected-date")).toHaveValue(scheduleDate);

      const selectedSession = athletePage.locator(
        `a[href="/calendar/events/${scheduledSession.id}?resourceType=planned_session"]`,
      );
      await expect(selectedSession).toBeVisible();
      await selectedSession.click();
      await expect(athletePage.getByText("Planning date", { exact: true })).toBeVisible();
      await expect(athletePage.getByText(scheduleDate, { exact: true })).toBeVisible();
      await athletePage.screenshot({
        path: testInfo.outputPath(`independent-athlete-session-detail-${viewport.width}.png`),
        scale: "css",
      });
      await athletePage.goBack();
      await expect(athletePage.locator("#plan-selected-date")).toHaveValue(scheduleDate);
      await expectNoHorizontalOverflow(athletePage);
      await athletePage.screenshot({
        path: testInfo.outputPath(`independent-athlete-selected-session-${viewport.width}.png`),
        scale: "css",
      });
    },
    { profileId: athlete.profileId },
  );

  // Keep this explicit reference close to the library choice: it prevents a
  // future fixture rewrite from turning the selected activity into a fake ID.
  expect(activityPlanId).toMatch(/^[0-9a-f-]{36}$/i);
});
