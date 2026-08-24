import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { type GoalFixture, withGoalFixture } from "../planning/data";
import { createE2EExecutionIdentity } from "../support/identity";

async function createGoal(page: Page, fixture: GoalFixture) {
  const title = createE2EExecutionIdentity(test.info()).name("Confirmation goal");
  await page.goto("/goals/new?date=2026-09-20");
  const form = page.getByTestId("goal-form");
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Activity", { exact: true }).selectOption("run");
  await form.getByLabel("Priority").fill("6");
  await form.getByLabel("Sessions / week").fill("3");
  await form.getByLabel("Weeks").fill("8");
  fixture.rememberGoalTitle(title);
  await page.getByTestId("goal-submit").click();
  await expect(page.getByText(title)).toBeVisible();
  const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
  const testId = await card.getAttribute("data-testid");
  if (!testId) throw new Error("Created goal card did not expose a goal ID.");
  const id = testId.replace("goal-card-", "");
  fixture.rememberGoal(id);
  return { id, title };
}

test("goals.delete requires explicit confirmation before changing an inspected goal", async ({
  athletePage,
}) => {
  await withGoalFixture(async (fixture) => {
    const goal = await createGoal(athletePage, fixture);

    await athletePage.getByTestId(`goal-card-${goal.id}`).click();
    await expect(athletePage.getByRole("heading", { name: goal.title })).toBeVisible();
    await athletePage.getByTestId(`goal-delete-${goal.id}`).click();
    await expect(athletePage.getByText("Delete this goal?")).toBeVisible();

    await athletePage.getByRole("button", { name: "Cancel" }).click();
    await expect(athletePage.getByText("Delete this goal?")).toHaveCount(0);
    await expect.poll(() => fixture.getGoal(goal.id)).toMatchObject({ title: goal.title });
  });
});
