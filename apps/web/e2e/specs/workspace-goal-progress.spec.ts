import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { createE2EExecutionIdentity } from "../support/identity";

test("Home and Plan expose observed threshold-goal progress from canonical athlete evidence", async ({
  athletePage,
}, testInfo) => {
  const title = createE2EExecutionIdentity(testInfo).name("Observed bike threshold goal");

  await withGoalFixture(async (fixture) => {
    const goals = new GoalsPage(athletePage);
    await goals.startCreate("2027-02-01");
    const form = athletePage.getByTestId("goal-form");
    await form.getByLabel("Title").fill(title);
    await chooseAuthoringOption(athletePage, "Goal type", "Power threshold");
    await form.getByLabel("Watts").fill("300");
    await form.getByLabel("Test duration").fill("0:30:00");
    fixture.rememberGoalTitle(title);
    await form.getByTestId("goal-submit").click();

    const card = athletePage.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
    await expect(card).toBeVisible();
    const cardId = await card.getAttribute("data-testid");
    if (!cardId) throw new Error("The fixture goal card did not expose an ID.");
    const goalId = cardId.replace("goal-card-", "");
    fixture.rememberGoal(goalId);

    for (const route of ["/", "/plan?date=2026-11-28"]) {
      await athletePage.goto(route);
      const workspace = athletePage.getByRole("region", { name: title });
      await expect(workspace).toBeVisible();
      await expect(workspace.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        `/goals/${goalId}`,
      );
      await expect(workspace.getByText("Current")).toBeVisible();
      await expect(workspace.getByText("285 W", { exact: true })).toBeVisible();
      await expect(workspace.getByText("Target")).toBeVisible();
      await expect(workspace.getByText("300 W", { exact: true })).toBeVisible();
      await expect(workspace.getByText("Remaining gap")).toBeVisible();
      await expect(
        workspace.getByRole("link", { name: /Source activity: Playwright threshold source/ }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(athletePage);
      await workspace.getByRole("link", { name: title }).click();
      await expect(athletePage.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await athletePage.goBack();
      await expect(athletePage).toHaveURL(new RegExp(`${route.replace("?", "\\?")}$`));
      const sourceLink = athletePage
        .getByRole("region", { name: title })
        .getByRole("link", { name: /Source activity: Playwright threshold source/ });
      await sourceLink.click();
      await expect(athletePage).toHaveURL(/\/activities\//);
      await athletePage.goBack();
      await expect(athletePage).toHaveURL(new RegExp(`${route.replace("?", "\\?")}$`));
    }
  });
});
