import { expect, test } from "../fixtures";
import { withDayAgendaFixture } from "../planning/day-agenda";
import { withTrainingPlanLibraryFixture } from "../training-plans/data";

test("[variation:agenda-detail] planned and completed cards open and return to the selected day", async ({
  athletePage,
}, testInfo) => {
  await withDayAgendaFixture(testInfo, async (fixture) => {
    await athletePage.goto(`/calendar/day/${fixture.date}?month=2026-11&view=agenda`);
    const planned = athletePage.getByRole("link", {
      name: `Open planned activity ${fixture.plannedPlanName}`,
    });
    await planned.scrollIntoViewIfNeeded();
    await planned.click();
    await expect(athletePage).toHaveURL(
      (url) => url.pathname === `/calendar/events/${fixture.eventId}`,
    );
    await expect(
      athletePage.getByRole("heading", { name: "Agenda prescription", exact: true }),
    ).toBeVisible();
    await expect(
      athletePage
        .getByText("Activity plan", { exact: true })
        .locator("..")
        .getByText(fixture.plannedPlanName, { exact: true }),
    ).toBeVisible();
    await athletePage.goBack();
    const completed = athletePage.getByTestId(`activity-card-${fixture.activityId}`);
    await completed.scrollIntoViewIfNeeded();
    await completed.getByTestId(`activity-card-${fixture.activityId}-open`).click();
    const detailCard = athletePage.getByTestId(`activity-card-${fixture.activityId}`);
    await expect(athletePage.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
    await expect(
      detailCard.getByRole("heading", { name: fixture.completedName, exact: true }),
    ).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage).toHaveURL((url) => url.pathname === `/calendar/day/${fixture.date}`);
    await expect(athletePage).toHaveURL(
      (url) =>
        new URLSearchParams([...url.searchParams].sort()).toString() ===
        "month=2026-11&view=agenda",
    );
    await expect(planned).toBeVisible();
    await expect(
      completed.getByRole("heading", { name: fixture.completedName, exact: true }),
    ).toBeVisible();
  });
});

test("[variation:training-plan-keyboard] searched plan opens, schedules, and returns from agenda", async ({
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async (fixture) => {
    await athletePage.goto("/training-plans");
    const search = athletePage.getByLabel("Search plans");
    await search.fill(fixture.ownedName);
    await search.press("Enter");
    const card = athletePage
      .getByTestId(/^training-plan-card-/)
      .filter({ hasText: fixture.ownedName });
    const open = card.getByRole("button", { name: "View plan" });
    await open.focus();
    await open.press("Enter");
    await athletePage.getByLabel("Start date").fill("2026-12-14");
    await athletePage.getByRole("button", { name: "Apply to schedule" }).press("Enter");
    await expect(athletePage.getByText("Plan scheduled.", { exact: true })).toBeVisible();
    await athletePage.goto("/calendar/day/2026-12-14?month=2026-12&view=agenda");
    await expect(
      athletePage.getByRole("link", { name: /Open planned activity Playwright Tempo Builder/ }),
    ).toBeVisible();
  });
});
