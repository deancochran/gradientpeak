import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withPlanningPathFixture } from "../planning/data";
import { openPlanningRoute } from "../planning/journeys";

test("athlete home connects the visible training path to a selected planned day", async ({
  athletePage,
}, testInfo) => {
  await withPlanningPathFixture(testInfo, async (fixture) => {
    const compact = testInfo.project.use.viewport?.width === 390;
    const viewport = compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    const viewportName = `${viewport.width}x${viewport.height}`;
    await athletePage.setViewportSize(viewport);
    await openPlanningRoute(athletePage, "/", /^welcome back$/i);

    await expect(
      athletePage.getByRole("heading", { level: 2, name: /training path/i }),
    ).toBeVisible();
    await expect(athletePage.getByRole("img", { name: /training load chart/i })).toBeVisible();
    await expect(athletePage.getByText("Current Focus", { exact: true })).toHaveCount(0);
    await athletePage.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`athlete-home-workspace-${viewportName}.png`),
      scale: "css",
    });
    await expectNoHorizontalOverflow(athletePage);

    const scheduledDay = athletePage
      .getByTestId("home-upcoming-schedule")
      .locator(`a[href="/plan?date=${fixture.date}"]`);
    await expect(scheduledDay).toBeVisible();
    await scheduledDay.click();

    await expect(athletePage).toHaveURL(new RegExp(`/plan\\?date=${fixture.date}`));
    await expect(athletePage.getByLabel("Selected day")).toHaveValue(fixture.date);
    await athletePage.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`athlete-plan-selected-day-${viewportName}.png`),
      scale: "css",
    });
    await expectNoHorizontalOverflow(athletePage);

    const plannedSession = athletePage.locator(
      `a[href="/calendar/events/${fixture.eventId}?resourceType=planned_session"]`,
    );
    await expect(plannedSession).toBeVisible();
    await plannedSession.click();
    await expect(athletePage).toHaveURL(
      (url) =>
        url.pathname === `/calendar/events/${fixture.eventId}` &&
        url.searchParams.get("resourceType") === "planned_session",
    );
    await expect(athletePage.getByRole("link", { name: "Record activity" })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Edit this session only" })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Skip session" })).toBeVisible();
    await athletePage.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`athlete-planned-session-${viewportName}.png`),
      scale: "css",
    });
    await expectNoHorizontalOverflow(athletePage);

    await athletePage.goBack();
    await expect(athletePage).toHaveURL((url) => url.searchParams.get("date") === fixture.date);
    await expect(athletePage.getByLabel("Selected day")).toHaveValue(fixture.date);
  });
});
