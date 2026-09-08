import { expect, test } from "../fixtures";
import type { DomainFixtureBuilders } from "../support/domain";

async function withPublicShareFixture(
  fixtures: DomainFixtureBuilders,
  actorEmail: string,
  run: (fixture: {
    activityPlanId: string;
    trainingPlanId: string;
    trainingPlanName: string;
  }) => Promise<void>,
) {
  const activityPlan = await fixtures.activityPlans.create({
    actorEmail,
    label: "public-share-activity-plan",
    name: "Playwright Tempo Builder",
    visibility: "public",
  });
  const trainingPlan = await fixtures.trainingPlans.create({
    activityPlanId: activityPlan.id,
    actorEmail,
    label: "public-share-training-plan",
    visibility: "public",
  });
  await run({
    activityPlanId: activityPlan.id,
    trainingPlanId: trainingPlan.id,
    trainingPlanName: trainingPlan.name,
  });
}

test("public activity-plan and training-plan links render anonymous readers", async ({
  anonymousPage: page,
  athleteActor,
  e2eData,
}) => {
  const trainingPage = await page.context().newPage();
  try {
    await withPublicShareFixture(
      e2eData,
      athleteActor.email,
      async ({ activityPlanId, trainingPlanId, trainingPlanName }) => {
        await page.goto(`/share/activity-plans/${activityPlanId}`);
        await expect(page.getByRole("heading", { name: "Playwright Tempo Builder" })).toBeVisible();
        await expect(page.getByText("Activity plan overview")).toBeVisible();
        await expect(page.getByText("Activity structure")).toBeVisible();

        await trainingPage.goto(`/share/training-plans/${trainingPlanId}`);
        await expect(trainingPage.getByRole("heading", { name: trainingPlanName })).toBeVisible();
        await expect(trainingPage.getByText("Plan overview")).toBeVisible();
      },
    );
  } finally {
    await trainingPage.close();
  }
});

test("[variation:public-share:activity-plan-narrow] anonymous narrow reader scrolls through exact activity structure after reload", async ({
  anonymousPage: page,
  athleteActor,
  e2eData,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withPublicShareFixture(e2eData, athleteActor.email, async ({ activityPlanId }) => {
    await page.goto(`/share/activity-plans/${activityPlanId}`);
    const structure = page.getByText("Activity structure");
    await structure.scrollIntoViewIfNeeded();
    await expect(structure).toBeVisible();
    const sessionFlow = page.getByTestId("activity-plan-session-flow");
    await expect(
      sessionFlow.getByRole("heading", { name: "Tempo ride", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Playwright Tempo Builder" })).toBeVisible();
    await expect(sessionFlow.getByText(/^Main set ·/)).toBeVisible();
  });
});

test("[variation:public-share:training-plan-history] anonymous training-plan detail survives back-forward navigation without exposing owner controls", async ({
  anonymousPage: page,
  athleteActor,
  e2eData,
}) => {
  await withPublicShareFixture(
    e2eData,
    athleteActor.email,
    async ({ trainingPlanId, trainingPlanName }) => {
      await page.goto(`/share/training-plans/${trainingPlanId}`);
      await expect(page.getByRole("heading", { name: trainingPlanName })).toBeVisible();
      await expect(page.getByText("Structure", { exact: true })).toBeVisible();
      await expect(page.getByText("Sessions per week", { exact: true })).toBeVisible();
      await page.goto("/auth/login");
      await page.goBack();
      await expect(page.getByText("Plan overview")).toBeVisible();
      await expect(page.getByRole("button", { name: /edit|delete|schedule/i })).toHaveCount(0);
      await page.goForward();
      await expect(page.getByRole("heading", { name: "Login", exact: true })).toBeVisible();
    },
  );
});
