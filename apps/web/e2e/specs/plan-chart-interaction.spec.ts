import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withPlanningPathFixture } from "../planning/data";
import { openPlanningRoute } from "../planning/journeys";

test("plan training chart keeps its planned and completed load trends visible while the page is explored", async ({
  athletePage,
}, testInfo) => {
  await withPlanningPathFixture(testInfo, async () => {
    await openPlanningRoute(athletePage, "/plan", /^plan$/i);

    const chart = athletePage.getByRole("img", { name: /training load chart/i });
    await expect(chart).toBeVisible();
    await expect(chart.getByLabel("Chart legend")).toContainText("Scheduled / planned Common Load");
    await expect(chart.getByLabel("Chart legend")).toContainText("Completed Common Load");

    const chartPanels = chart.locator("svg");
    await expect(chartPanels).not.toHaveCount(0);
    await expect(chartPanels.locator("polyline").first()).toBeVisible();
    await expect(chartPanels.locator("circle").first()).toBeVisible();

    await chart.scrollIntoViewIfNeeded();
    await athletePage.mouse.wheel(0, 800);
    await expect(chart).toBeAttached();
    await expect(chartPanels.locator("polyline").first()).toBeVisible();
    await expect(chartPanels.locator("circle").first()).toBeVisible();
    await expectNoHorizontalOverflow(athletePage);
  });
});
