import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { withTrpcFailure } from "../pages";
import { type GoalFixture, withGoalFixture } from "../planning/data";
import { createE2EExecutionIdentity } from "../support/identity";

async function createGoal(page: Page, fixture: GoalFixture, suffix: string) {
  const title = createE2EExecutionIdentity(test.info()).name(`Variation goal ${suffix}`);
  await page.goto("/goals/new?date=2026-09-27");
  const form = page.getByTestId("goal-form");
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Activity", { exact: true }).selectOption("run");
  await form.getByLabel("Priority").fill("8");
  await form.getByLabel("Sessions / week").fill("4");
  await form.getByLabel("Weeks").fill("10");
  fixture.rememberGoalTitle(title);
  await page.getByTestId("goal-submit").press("Enter");
  const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
  const testId = await card.getAttribute("data-testid");
  const id = testId?.replace("goal-card-", "");
  if (!id) throw new Error("Variation goal did not expose an id.");
  fixture.rememberGoal(id);
  return { id, title };
}

test("[variation:goals.delete:keyboard-cancel] keyboard cancellation keeps the inspected goal and restores focus to its delete control", async ({
  athletePage,
}) => {
  await withGoalFixture(async (fixture) => {
    const goal = await createGoal(athletePage, fixture, "keyboard cancel");
    await athletePage.getByTestId(`goal-card-${goal.id}`).press("Enter");
    const remove = athletePage.getByTestId(`goal-delete-${goal.id}`);
    await remove.press("Enter");
    const cancel = athletePage.getByRole("button", { name: "Cancel" });
    await cancel.focus();
    await cancel.press("Enter");
    await expect(athletePage.getByRole("heading", { name: goal.title })).toBeVisible();
    await expect(remove).toBeFocused();
    await expect.poll(() => fixture.getGoal(goal.id)).toMatchObject({ title: goal.title });
  });
});

test("[variation:goals.delete:confirm-disposable] explicit confirmation removes only the disposable inspected goal", async ({
  athletePage,
}) => {
  await withGoalFixture(async (fixture) => {
    const keep = await createGoal(athletePage, fixture, "kept sibling");
    const remove = await createGoal(athletePage, fixture, "confirmed removal");
    await athletePage.getByTestId(`goal-card-${remove.id}`).click();
    await athletePage.getByTestId(`goal-delete-${remove.id}`).click();
    await athletePage.getByTestId(`goal-delete-${remove.id}-confirm`).press("Enter");
    await expect.poll(() => fixture.getGoal(remove.id)).toBeNull();
    await athletePage.getByLabel("Search goals").fill(keep.title);
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(athletePage.getByTestId(`goal-card-${keep.id}`)).toBeVisible();
  });
});

test("[variation:goals.lifecycle:narrow-filter-detail] narrow filtered card opens intelligence and returns to retained exact search", async ({
  athletePage,
}) => {
  await withGoalFixture(async (fixture) => {
    const goal = await createGoal(athletePage, fixture, "narrow intelligence");
    await athletePage.setViewportSize({ width: 390, height: 844 });
    await athletePage.goto("/goals");
    const search = athletePage.getByLabel("Search goals");
    await search.fill(goal.title);
    await athletePage.getByRole("button", { name: /apply filters/i }).press("Enter");
    const card = athletePage.getByTestId(`goal-card-${goal.id}`);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(athletePage.getByTestId("goal-intelligence")).toBeVisible();
    await athletePage.goBack();
    await expect(search).toHaveValue(goal.title);
    await expect(card).toBeVisible();
  });
});

test("[variation:goals.lifecycle:cancel-edit] browser back abandons unsaved goal edits and detail reload retains original values", async ({
  athletePage,
}) => {
  await withGoalFixture(async (fixture) => {
    const goal = await createGoal(athletePage, fixture, "cancel edit");
    await athletePage.getByTestId(`goal-card-${goal.id}`).click();
    await athletePage.getByTestId(`goal-edit-${goal.id}`).click();
    await athletePage.getByLabel("Title").fill("Unsaved goal variation");
    await athletePage.getByLabel("Priority").fill("1");
    await athletePage.goBack();
    await expect(athletePage.getByRole("heading", { name: goal.title })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("Unsaved goal variation")).toHaveCount(0);
    await expect
      .poll(() => fixture.getGoal(goal.id))
      .toMatchObject({ priority: 8, title: goal.title });
  });
});

test("[variation:goals.transport:reload-then-retry] a failed filtered list remains an error after reload and recovers through its retry control", async ({
  athletePage,
}) => {
  await withTrpcFailure(athletePage, "goals.list", async () => {
    await athletePage.goto("/goals?q=transport-variation");
    await expect(athletePage.getByRole("alert")).toContainText("Goals could not be loaded");
    await athletePage.reload();
    await expect(athletePage.getByText(/no goals match these filters/i)).toHaveCount(0);
  });
  await athletePage.getByTestId("goal-list-retry").press("Enter");
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await expect(athletePage.getByText(/no goals match these filters/i)).toBeVisible();
});

test("[variation:goals.transport:invalid-history] normalized invalid filters remain healthy through back-forward navigation", async ({
  athletePage,
}) => {
  await athletePage.goto("/goals?category=invalid&sort=unknown");
  await expect(athletePage.getByLabel("Activity category")).toHaveValue("");
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await athletePage.goto("/goals?q=history-no-match");
  await expect(athletePage.getByText(/no goals match these filters/i)).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByLabel("Activity category")).toHaveValue("");
  await athletePage.goForward();
  await expect(athletePage.getByLabel("Search goals")).toHaveValue("history-no-match");
  await expect(athletePage.getByText(/no goals match these filters/i)).toBeVisible();
});
