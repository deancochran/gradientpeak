import { activityRoutes } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
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
        await expect(page.getByTestId("activity-plan-session-flow")).toBeVisible();
        await expect(page.getByRole("button", { name: /edit|delete|schedule/i })).toHaveCount(0);

        await trainingPage.goto(`/share/training-plans/${trainingPlanId}`);
        await expect(trainingPage.getByRole("heading", { name: trainingPlanName })).toBeVisible();
        await expect(trainingPage.getByText("Plan overview")).toBeVisible();
        await expect(
          trainingPage.getByRole("button", { name: /edit|delete|schedule/i }),
        ).toHaveCount(0);
      },
    );
  } finally {
    await trainingPage.close();
  }
});

test("private activity-plan and training-plan links fail closed for anonymous readers", async ({
  anonymousPage: page,
  athleteActor,
  e2eData,
}) => {
  const activityPlan = await e2eData.activityPlans.create({
    actorEmail: athleteActor.email,
    label: "private-share-activity-plan",
    name: "Playwright Private Session",
    visibility: "private",
  });
  const trainingPlan = await e2eData.trainingPlans.create({
    activityPlanId: activityPlan.id,
    actorEmail: athleteActor.email,
    label: "private-share-training-plan",
    visibility: "private",
  });

  await page.goto(`/share/activity-plans/${activityPlan.id}`);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: activityPlan.name, exact: true })).toHaveCount(0);

  await page.goto(`/share/training-plans/${trainingPlan.id}`);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: trainingPlan.name, exact: true })).toHaveCount(0);
});

test("public route links render anonymous readers and private routes fail closed", async ({
  anonymousPage: page,
  athleteActor,
  e2eData,
}) => {
  const publicRoute = await e2eData.routes.create({
    actorEmail: athleteActor.email,
    isPublic: true,
    label: "public-share-route",
    name: "Playwright Public Ridge Loop",
  });
  const privateRoute = await e2eData.routes.create({
    actorEmail: athleteActor.email,
    label: "private-share-route",
    name: "Playwright Private Ridge Loop",
  });

  await page.goto(`/share/routes/${publicRoute.id}`);
  await expect(
    page.getByRole("heading", { name: "Playwright Public Ridge Loop", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Route summary" })).toBeVisible();
  await expect(page.getByText("10.0 km", { exact: true })).toBeVisible();

  await withLocalE2EDatabase((database) =>
    database.typedTransaction((transaction) =>
      transaction
        .update(activityRoutes)
        .set({ is_public: false })
        .where(eq(activityRoutes.id, publicRoute.id)),
    ),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();

  await page.goto(`/share/routes/${privateRoute.id}`);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Playwright Private Ridge Loop", exact: true }),
  ).toHaveCount(0);
});

test("[variation:public-share:activity-plan-narrow] anonymous narrow reader scrolls through exact activity structure after reload", async ({
  anonymousPage: page,
  athleteActor,
  e2eData,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withPublicShareFixture(e2eData, athleteActor.email, async ({ activityPlanId }) => {
    await page.goto(`/share/activity-plans/${activityPlanId}`);
    const sessionFlow = page.getByTestId("activity-plan-session-flow");
    await sessionFlow.scrollIntoViewIfNeeded();
    await expect(sessionFlow).toBeVisible();
    await expect(sessionFlow.getByText("Tempo", { exact: true })).toBeVisible();
    await expect(sessionFlow.getByText("1800 sec · 180 W", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Playwright Tempo Builder" })).toBeVisible();
    await expect(sessionFlow.getByText("Tempo", { exact: true })).toBeVisible();
    await expect(sessionFlow.getByText("1800 sec · 180 W", { exact: true })).toBeVisible();
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
