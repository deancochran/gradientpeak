import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, withTrpcFailure } from "../pages";
import { type GoalFixture, withGoalFixture } from "../planning/data";
import { createE2EExecutionIdentity } from "../support/identity";

function title(suffix: string) {
  return createE2EExecutionIdentity(test.info()).name(`Playwright goal ${suffix}`);
}

function goalCard(page: Page, id: string) {
  return page.getByTestId(`goal-card-${id}`);
}

async function createGoal(
  page: Page,
  fixture: GoalFixture,
  input: {
    title: string;
    date: string;
    category: string;
    priority: string;
    sessions: string;
    weeks: string;
  },
) {
  await page.goto(`/goals/new?date=${input.date}`);
  const goalForm = page.getByTestId("goal-form");
  await expect(goalForm.getByLabel("Target date")).toHaveValue(input.date);
  await expect(goalForm.getByLabel("Title")).toHaveAttribute("required", "");
  await goalForm.getByLabel("Title").fill(input.title);
  await goalForm.getByLabel("Activity", { exact: true }).selectOption(input.category);
  await goalForm.getByLabel("Priority").fill(input.priority);
  await goalForm.getByLabel("Sessions / week").fill(input.sessions);
  await goalForm.getByLabel("Weeks").fill(input.weeks);
  fixture.rememberGoalTitle(input.title);
  await page.getByTestId("goal-submit").click();
  await expect(page.getByText(input.title)).toBeVisible();
  const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: input.title });
  const testId = await card.getAttribute("data-testid");
  const id = testId?.replace("goal-card-", "");
  if (!id) throw new Error("Created goal card did not expose a goal ID.");
  fixture.rememberGoal(id);
  return id;
}

test("goals.lifecycle and goals.intelligence persist exact owned goals", async ({
  athletePage,
  coachActor,
}) => {
  test.setTimeout(120_000);
  await withGoalFixture(async (fixture) => {
    const firstTitle = title("run");
    const secondTitle = title("bike");
    const firstId = await createGoal(athletePage, fixture, {
      title: firstTitle,
      date: "2026-09-20",
      category: "run",
      priority: "9",
      sessions: "5",
      weeks: "12",
    });
    const secondId = await createGoal(athletePage, fixture, {
      title: secondTitle,
      date: "2026-10-20",
      category: "bike",
      priority: "3",
      sessions: "3",
      weeks: "8",
    });

    await expect
      .poll(() => fixture.getGoal(firstId))
      .toMatchObject({
        title: firstTitle,
        targetDate: "2026-09-20",
        activityCategory: "run",
        priority: 9,
        targetPayload: { type: "consistency", target_sessions_per_week: 5, target_weeks: 12 },
      });
    await athletePage.reload();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    await athletePage.getByLabel("Search goals").fill(firstTitle);
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(goalCard(athletePage, firstId)).toBeVisible();
    await expect(goalCard(athletePage, secondId)).toHaveCount(0);
    await athletePage.reload();
    await expect(goalCard(athletePage, firstId)).toBeVisible();
    await athletePage.goBack();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    await athletePage.getByLabel("Search goals").fill("");
    await athletePage.getByLabel("Activity category").selectOption("bike");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    await athletePage.goto("/goals");
    await athletePage.getByLabel("Sort goals").selectOption("priority");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(goalCard(athletePage, firstId)).toBeVisible();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    const orderedIds = await athletePage
      .locator('[data-testid^="goal-card-"]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")));
    expect(orderedIds.indexOf(`goal-card-${firstId}`)).toBeLessThan(
      orderedIds.indexOf(`goal-card-${secondId}`),
    );
    await athletePage.getByLabel("Search goals").fill("nothing matches this exact goal");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(athletePage.getByText(/no goals match these filters/i)).toBeVisible();

    const intelligenceResponse = athletePage.waitForResponse((response) =>
      response.url().includes("athleteIntelligence.getGoalAssessment"),
    );
    await athletePage.goto(`/goals/${firstId}`);
    const response = await intelligenceResponse;
    expect(
      response.ok(),
      `athleteIntelligence.getGoalAssessment failed with HTTP ${response.status()}`,
    ).toBe(true);
    await expect(athletePage.getByTestId("goal-intelligence")).toBeVisible();
    await expect(
      athletePage.getByText(/consistency target: 5 sessions per week for 12 weeks/i),
    ).toBeVisible();
    await expect(athletePage.getByText("Goal readiness", { exact: true })).toBeVisible();
    await expect(athletePage.getByText(/% confidence$/i)).toBeVisible({ timeout: 15_000 });
    await expect(athletePage.getByText(/^As of /i)).toBeVisible();

    await withTrpcFailure(athletePage, "athleteIntelligence.getGoalAssessment", async () => {
      await athletePage.reload();
      await expect(athletePage.getByRole("heading", { name: firstTitle })).toBeVisible();
      await expect(athletePage.getByTestId("goal-intelligence-retry")).toBeVisible({
        timeout: 15_000,
      });
    });
    const intelligenceRetry = athletePage.waitForResponse((retryResponse) =>
      retryResponse.url().includes("athleteIntelligence.getGoalAssessment"),
    );
    await athletePage.getByTestId("goal-intelligence-retry").click();
    expect((await intelligenceRetry).ok()).toBe(true);
    await expect(athletePage.getByTestId("goal-intelligence-retry")).toHaveCount(0);

    await athletePage.getByTestId(`goal-edit-${firstId}`).click();
    const editForm = athletePage.getByTestId("goal-form");
    await editForm.getByLabel("Title").fill(`${firstTitle} edited`);
    await editForm.getByLabel("Target date").fill("2026-09-21");
    await editForm.getByLabel("Activity", { exact: true }).selectOption("swim");
    await editForm.getByLabel("Priority").fill("7");
    await editForm.getByLabel("Sessions / week").fill("4");
    await editForm.getByLabel("Weeks").fill("10");
    await athletePage.getByTestId("goal-submit").click();
    await expect(athletePage.getByRole("heading", { name: `${firstTitle} edited` })).toBeVisible();
    await athletePage.reload();
    await expect
      .poll(() => fixture.getGoal(firstId))
      .toMatchObject({
        title: `${firstTitle} edited`,
        targetDate: "2026-09-21",
        activityCategory: "swim",
        priority: 7,
        targetPayload: { type: "consistency", target_sessions_per_week: 4, target_weeks: 10 },
      });

    await athletePage.getByTestId(`goal-delete-${firstId}`).click();
    await athletePage.getByTestId(`goal-delete-${firstId}-confirm`).click();
    await expect(athletePage).toHaveURL(/\/goals(?:\?|$)/);
    await expect.poll(() => fixture.getGoal(firstId)).toBeNull();
    await expectNoHorizontalOverflow(athletePage);

    const coachPage = await coachActor.createPage(`/goals/${secondId}`);
    try {
      await expect(coachPage.getByText(/goal could not be loaded/i)).toBeVisible();
      await expect(goalCard(coachPage, secondId)).toHaveCount(0);
      await expect(coachPage.getByTestId(`goal-edit-${secondId}`)).toHaveCount(0);
      await expect(coachPage.getByTestId(`goal-delete-${secondId}`)).toHaveCount(0);
      await expect(coachPage.getByText("Evidence & limits", { exact: true })).toHaveCount(0);
    } finally {
      await coachPage.close();
    }
  });
});

test("goal list transport failures remain distinct from an empty result and recover", async ({
  athletePage,
}) => {
  await withTrpcFailure(athletePage, "goals.list", async () => {
    await athletePage.goto("/goals?q=nothing+matches+this+exact+goal");
    await expect(athletePage.getByRole("alert")).toContainText("Goals could not be loaded", {
      timeout: 15_000,
    });
    await expect(athletePage.getByText(/no goals match these filters/i)).toHaveCount(0);
  });
  const retryResponse = athletePage.waitForResponse((response) =>
    response.url().includes("goals.list"),
  );
  await athletePage.getByTestId("goal-list-retry").click();
  expect((await retryResponse).ok()).toBe(true);
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await expect(athletePage.getByText(/no goals match these filters/i)).toBeVisible();

  const normalizedResponse = athletePage.waitForResponse((response) =>
    response.url().includes("goals.list"),
  );
  await athletePage.goto("/goals?category=invalid");
  expect((await normalizedResponse).ok()).toBe(true);
  await expect(athletePage.getByLabel("Activity category")).toHaveValue("");
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
});
