import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withPlanningPathFixture } from "../planning/data";
import { openPlanningRoute } from "../planning/journeys";

test("athlete home connects the visible training path to a selected planned day", async ({
  athletePage,
}, testInfo) => {
  await withPlanningPathFixture(testInfo, async (fixture) => {
    await openPlanningRoute(athletePage, "/", /^welcome back$/i);

    await expect(
      athletePage.getByRole("heading", { level: 2, name: /training path/i }),
    ).toBeVisible();
    await expect(athletePage.getByRole("img", { name: /training load chart/i })).toBeVisible();
    await expect(athletePage.getByText("Current Focus", { exact: true })).toHaveCount(0);

    const scheduledDay = athletePage
      .getByTestId("home-upcoming-schedule")
      .getByRole("link", { name: fixture.title });
    await expect(scheduledDay).toBeVisible();
    await scheduledDay.click();

    await expect(athletePage).toHaveURL(new RegExp(`/plan\\?date=${fixture.date}`));
    await expect(athletePage.getByLabel("Selected day")).toHaveValue(fixture.date);
    await expectNoHorizontalOverflow(athletePage);
  });
});
