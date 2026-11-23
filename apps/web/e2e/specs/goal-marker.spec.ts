import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { type GoalFixture, withGoalFixture, withPlanningPathFixture } from "../planning/data";
import { openPlanningRoute } from "../planning/journeys";
import { createE2EExecutionIdentity } from "../support/identity";

async function createGoalMarker({
  date,
  goalsFixture,
  page,
  title,
}: {
  date: string;
  goalsFixture: GoalFixture;
  page: Page;
  title: string;
}) {
  await new GoalsPage(page).startCreate(date);
  const form = page.getByTestId("goal-form");
  await form.getByLabel("Title").fill(title);
  await chooseAuthoringOption(page, "Activity", "Run");
  await chooseAuthoringOption(page, "Priority", "6");
  await form.getByLabel("Sessions / week").fill("3");
  await form.getByLabel("Weeks").fill("8");
  goalsFixture.rememberGoalTitle(title);
  await form.getByTestId("goal-submit").click();

  const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
  await expect(card).toBeVisible();
  const cardId = await card.getAttribute("data-testid");
  if (!cardId) throw new Error("The disposable goal card did not expose an ID.");
  const id = cardId.replace("goal-card-", "");
  goalsFixture.rememberGoal(id);
  return id;
}

test("a personal goal target date appears on Home and Plan without implying a goal-plan link", async ({
  athletePage,
}, testInfo) => {
  await withGoalFixture(async (goalsFixture) => {
    await withPlanningPathFixture(testInfo, async (planning) => {
      const title = createE2EExecutionIdentity(testInfo).name("Timeline marker goal");
      const viewport =
        testInfo.project.use.viewport?.width === 390
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 };
      await athletePage.setViewportSize(viewport);
      const goalId = await createGoalMarker({
        date: planning.date,
        goalsFixture,
        page: athletePage,
        title,
      });
      await createGoalMarker({
        date: planning.endDate,
        goalsFixture,
        page: athletePage,
        title: createE2EExecutionIdentity(testInfo).name("Outside timeline marker goal"),
      });

      for (const route of ["/", `/plan?date=${planning.date}`]) {
        await openPlanningRoute(athletePage, route, route === "/" ? /^welcome back$/i : /plan/i);
        const chart = athletePage.getByRole("region", { name: "Daily training chart" });
        await expect(chart).toBeVisible();
        await expect(
          chart.getByRole("link", {
            name: new RegExp(`${title}, target date ${planning.date}, priority 6, run`),
          }),
        ).toBeVisible();
        await expect(chart).toMatchAriaSnapshot(`
          - link /target date ${planning.date}, priority 6, run/
        `);
        const goalLink = chart.getByRole("link", { name: new RegExp(`${title}, target date`) });
        await expect(goalLink).toHaveAttribute("href", `/goals/${goalId}`);
        await goalLink.focus();
        await expect(goalLink).toBeFocused();
        await expect(chart.getByText(/Outside timeline marker goal/)).toHaveCount(0);
        await expectNoHorizontalOverflow(athletePage);
      }
    });
  });
});
