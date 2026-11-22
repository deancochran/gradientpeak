import type { Page } from "@playwright/test";
import { activityCategoryChoices } from "@repo/core";
import { profileGoals } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, GoalsPage, withTrpcFailure } from "../pages";
import {
  captureAuthoring,
  chooseAuthoringOption,
  createLocalAuthoringPage,
} from "../pages/authoring";
import { type GoalFixture, withGoalFixture } from "../planning/data";
import { createE2EExecutionIdentity } from "../support/identity";

test("[authoring-final] goal creation discards Cancel and Back, focuses malformed optional values, and persists", async ({
  athleteActor,
  e2eDatabase,
}, testInfo) => {
  test.setTimeout(120_000);
  const athletePage = await createLocalAuthoringPage(athleteActor);
  const goals = new GoalsPage(athletePage);
  await withGoalFixture(async (fixture) => {
    await goals.startCreate("2026-12-01");
    await athletePage.getByLabel("Title", { exact: true }).fill("Discard on Cancel");
    await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(athletePage.getByTestId("goal-form")).toHaveCount(0);
    await goals.startCreate("2026-12-01");
    await expect(athletePage.getByLabel("Title", { exact: true })).toHaveValue("");
    await athletePage.getByLabel("Title", { exact: true }).fill("Discard on Back");
    await athletePage.goBack();
    await expect(athletePage).toHaveURL((url) => url.pathname === "/goals");
    await goals.startCreate("2026-12-01");
    await expect(athletePage.getByLabel("Title", { exact: true })).toHaveValue("");
    await expect(athletePage.getByText(/resume draft|restore draft/i)).toHaveCount(0);
    const name = createE2EExecutionIdentity(testInfo).name("Final goal creation");
    fixture.rememberGoalTitle(name);
    const matching = () =>
      e2eDatabase.db
        .select({ id: profileGoals.id })
        .from(profileGoals)
        .where(
          and(eq(profileGoals.profile_id, athleteActor.profileId), eq(profileGoals.title, name)),
        );
    await athletePage.getByLabel("Title", { exact: true }).fill(name);
    await athletePage.getByLabel("Sessions / week").fill("3");
    const weeks = athletePage.getByLabel("Weeks", { exact: true });
    await weeks.fill("oops");
    await athletePage.getByTestId("goal-submit").click();
    await expect(weeks).toBeFocused();
    await expect(weeks).toHaveAttribute("aria-invalid", "true");
    await expect(athletePage.getByRole("alert")).toContainText(/weeks/i);
    await expect.poll(matching).toEqual([]);
    await captureAuthoring(athletePage, testInfo, "goal-invalid-weeks", [weeks]);
    for (const example of [
      { type: "Power threshold", field: "Watts", invalid: "250w" },
      { type: "Power threshold", field: "Test duration", invalid: "bad" },
      { type: "Pace threshold", field: "Target pace", invalid: "4:3" },
    ]) {
      await chooseAuthoringOption(athletePage, "Goal type", example.type);
      if (example.field === "Test duration")
        await athletePage.getByLabel("Watts", { exact: true }).fill("250");
      const field = athletePage.getByLabel(example.field, { exact: true });
      await field.fill(example.invalid);
      await athletePage.getByTestId("goal-submit").click();
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(athletePage.getByRole("alert")).toContainText(new RegExp(example.field, "i"));
      await expect.poll(matching).toEqual([]);
    }
    await chooseAuthoringOption(athletePage, "Goal type", "Completion");
    await athletePage.getByLabel("Duration", { exact: true }).fill("0:10:00");
    const distance = athletePage.getByLabel("Distance (km)", { exact: true });
    await distance.fill("10km");
    await athletePage.getByTestId("goal-submit").click();
    await expect(distance).toBeFocused();
    await expect(athletePage.getByRole("alert")).toContainText(/distance/i);
    await expect.poll(matching).toEqual([]);
    await distance.fill("10.00012345");
    await athletePage.getByTestId("goal-submit").click();
    await expect(athletePage.getByTestId("goal-form")).toHaveCount(0);
    await expect.poll(async () => (await matching()).length).toBe(1);
    const id = (await matching())[0]?.id;
    if (!id) throw new Error("Created goal was not persisted in the local fixture database.");
    fixture.rememberGoal(id);
    await expect
      .poll(() => fixture.getGoal(id))
      .toMatchObject({
        title: name,
        targetPayload: { type: "completion", distance_m: 10.00012345 * 1000, duration_s: 600 },
      });
    await athletePage.goto(`/goals/${id}`);
    await expect(athletePage.getByRole("heading", { name, exact: true })).toBeVisible();
  });
});

test("[authoring-final] goal metadata edit preserves precise objective fields", async ({
  athleteActor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  const athletePage = await createLocalAuthoringPage(athleteActor);
  await withGoalFixture(async (fixture) => {
    const id = e2eIdentity.uuid("precise-goal");
    const name = e2eIdentity.name("Precise goal");
    const targetPayload = {
      type: "event_performance",
      activity_category: "run",
      distance_m: 10000.1234567,
      target_speed_mps: 3.4567890123,
      environment: "outdoor",
      tolerance_pct: 0.0123456789,
    };
    fixture.rememberGoal(id);
    await e2eDatabase.typedTransaction((transaction) =>
      transaction.insert(profileGoals).values({
        id,
        profile_id: athleteActor.profileId,
        title: name,
        target_date: "2026-12-01",
        activity_category: "run",
        priority: 4,
        target_payload: targetPayload,
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );
    await athletePage.goto(`/goals/${id}/edit`);
    await athletePage.getByLabel("Title", { exact: true }).fill(`${name} renamed`);
    await chooseAuthoringOption(athletePage, "Priority", "8");
    await athletePage.getByLabel("Target date").fill("2026-12-02");
    await athletePage.getByLabel("Distance (km)").scrollIntoViewIfNeeded();
    await captureAuthoring(athletePage, testInfo, "goal-metadata-precision");
    await athletePage.getByTestId("goal-submit").click();
    await expect(
      athletePage.getByRole("heading", { name: `${name} renamed`, exact: true }),
    ).toBeVisible();
    await athletePage.reload();
    await expect
      .poll(() => fixture.getGoal(id))
      .toEqual({
        activityCategory: "run",
        priority: 8,
        targetDate: "2026-12-02",
        targetPayload,
        title: `${name} renamed`,
      });
  });
});

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
  const goals = new GoalsPage(page);
  await goals.startCreate(input.date);
  const goalForm = page.getByTestId("goal-form");
  await expect(goalForm.getByLabel("Target date")).toHaveValue(input.date);
  await expect(goalForm.getByLabel("Title")).toHaveAttribute("required", "");
  await goalForm.getByLabel("Title").fill(input.title);
  const category = activityCategoryChoices.find((option) => option.value === input.category);
  if (!category) throw new Error("Unsupported goal activity fixture.");
  await chooseAuthoringOption(page, "Activity", category.label);
  await chooseAuthoringOption(page, "Priority", input.priority);
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
    // Goal-list filter submission replaces the current search entry. Returning
    // would correctly revisit the preceding authoring route, so clear through
    // the visible list control rather than asserting an unrelated history hop.
    await athletePage.getByLabel("Search goals").fill("");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    await athletePage.getByLabel("Activity category").selectOption("bike");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    await athletePage.goto("/goals");
    await athletePage.getByLabel("Sort goals").selectOption("priority");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(goalCard(athletePage, firstId)).toBeVisible();
    await expect(goalCard(athletePage, secondId)).toBeVisible();
    await expect
      .poll(async () =>
        athletePage
          .locator('[data-testid^="goal-card-"]')
          .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid"))),
      )
      .toEqual(expect.arrayContaining([`goal-card-${firstId}`, `goal-card-${secondId}`]));
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
      athletePage.getByText("5 sessions/week for 12 weeks", { exact: true }),
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
    await chooseAuthoringOption(athletePage, "Activity", "Swim");
    await chooseAuthoringOption(athletePage, "Priority", "7");
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
