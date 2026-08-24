import { expect, test } from "../fixtures";
import { CalendarPage, expectRouteQuery } from "../pages";
import { withCalendarEventFixture, withPlanningPathFixture } from "../planning/data";
import { withDayAgendaFixture } from "../planning/day-agenda";
import { openPlanningRoute, planningTestIdentity } from "../planning/journeys";

test("[variation:calendar.create:cancel-invalid] invalid creation remains editable and browser back returns to the selected calendar day", async ({
  athletePage,
}) => {
  const calendar = new CalendarPage(athletePage);
  await calendar.openDay("2026-10-30", { month: "2026-10", view: "agenda" });
  await athletePage.getByText("Create event for this day", { exact: true }).click();
  await expect(athletePage.locator("#agenda-date-field")).toHaveValue("2026-10-30");
  await athletePage.getByRole("button", { name: /^create$/i }).click();
  await expect(athletePage).toHaveURL(/\/calendar\/new/);
  await expect(athletePage.getByLabel("Title")).toBeFocused();
  await athletePage.goBack();
  await expect(athletePage).toHaveURL(/\/calendar\/day\/2026-10-30/);
  await expect(athletePage.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
});

test("[variation:calendar.create:all-day-reopen] an all-day event opens from its selected day and retains its date after reload", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation all-day reopen");
    const id = await calendar.createEvent({
      date: "2026-10-31",
      title,
      allDay: true,
    });
    fixture.rememberSeries(id);
    await calendar.openDay("2026-10-31", { month: "2026-10", view: "agenda" });
    await athletePage.getByRole("link", { name: new RegExp(title) }).click();
    const context = athletePage.getByText("All day", { exact: true }).locator("..");
    await expect(context.getByText("Yes", { exact: true })).toBeVisible();
    await athletePage.reload();
    await expect(
      athletePage
        .getByText("When", { exact: true })
        .locator("..")
        .getByText("Saturday, October 31, 2026 · All day", { exact: true }),
    ).toBeVisible();
  });
});

test("[variation:calendar.update:cancel-single] an unsaved single-occurrence edit is abandoned without changing sibling rows", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation cancel occurrence");
    const anchor = await calendar.createEvent({
      date: "2026-11-09",
      title,
      repeat: true,
    });
    fixture.rememberSeries(anchor);
    const rows = await fixture.getSeries(anchor);
    const second = rows[1];
    if (!second) throw new Error("Expected a second occurrence.");
    await calendar.openEdit(second.id);
    await athletePage.getByLabel("Title").fill("Unsaved occurrence title");
    await athletePage.goBack();
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
    await expect.poll(() => fixture.getSeries(anchor)).toEqual(rows);
  });
});

test("[variation:calendar.update:future-reopen] future-scope notes appear on later details but not the prior occurrence", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation future detail");
    const anchor = await calendar.createEvent({
      date: "2026-11-16",
      title,
      repeat: true,
    });
    fixture.rememberSeries(anchor);
    const rows = await fixture.getSeries(anchor);
    const [first, , third, fourth] = rows;
    if (!first || !third || !fourth) throw new Error("Expected recurring rows.");
    await calendar.openEdit(third.id);
    await calendar.saveEdit({ scope: "future", notes: "Future-only detail variation" });
    await calendar.openDetail(fourth.id);
    await expect(athletePage.getByText("Future-only detail variation")).toBeVisible();
    await calendar.openDetail(first.id);
    await expect(athletePage.getByText("Future-only detail variation")).toHaveCount(0);
  });
});

test("[variation:calendar.delete:cancel-confirmation] cancelling recurrence deletion preserves every exact occurrence", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation cancel recurrence deletion");
    const anchor = await calendar.createEvent({
      date: "2027-01-11",
      title,
      repeat: true,
    });
    fixture.rememberSeries(anchor);
    const before = await fixture.getSeries(anchor);
    await calendar.openDelete();
    await athletePage.getByLabel("Delete recurrence scope").selectOption("series");
    await athletePage.getByRole("button", { name: "Cancel" }).click();
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
    await expect.poll(() => fixture.getSeries(anchor)).toEqual(before);
  });
});

test("[variation:calendar.delete:future-boundary] future deletion removes the chosen and later cards while preserving earlier detail navigation", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation future deletion");
    const anchor = await calendar.createEvent({
      date: "2027-02-08",
      title,
      repeat: true,
    });
    fixture.rememberSeries(anchor);
    const rows = await fixture.getSeries(anchor);
    const target = rows[2];
    const first = rows[0];
    if (!target || !first) throw new Error("Expected recurring deletion rows.");
    await calendar.deleteEvent(target.id, "future");
    await expect.poll(() => fixture.getSeries(anchor)).toEqual(rows.slice(0, 2));
    await calendar.openDetail(first.id);
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
  });
});

test("[variation:planning.training-path:tab-history] firm path selection survives detail history and retains the seeded scheduled row", async ({
  athletePage,
}, testInfo) => {
  await withPlanningPathFixture(testInfo, async (fixture) => {
    await openPlanningRoute(athletePage, "/plan", /^plan$/i);
    await athletePage.getByRole("tab", { name: /^firm$/i }).press("Enter");
    const row = athletePage.locator(`[data-scheduled-item-id="${fixture.eventId}"]`);
    await expect(row).toBeVisible();
    await athletePage.goto("/calendar?month=2026-07&date=2026-07-20&view=month");
    await athletePage.goBack();
    await expect(athletePage.getByRole("tab", { name: /^firm$/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(row).toContainText("Common Load");
  });
});

test("[variation:planning.calendar-navigation:narrow-agenda] narrow month-to-day navigation returns to the exact retained month and view", async ({
  athletePage,
}) => {
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await athletePage.goto("/calendar?month=2026-07&date=2026-07-20&view=month");
  const day = athletePage.getByRole("link", { name: /^2026-07-20\./ });
  await day.scrollIntoViewIfNeeded();
  await day.click();
  await expect(athletePage.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
  await athletePage.getByText("Back to calendar", { exact: true }).press("Enter");
  await expect(athletePage).toHaveURL((url) => url.pathname === "/calendar");
  await expectRouteQuery(athletePage, "/calendar", {
    date: "2026-07-20",
    month: "2026-07",
    view: "month",
  });
  await expect(athletePage.getByText("July 2026")).toBeVisible();
});

test("[variation:planning.recurrence:cancel-series-delete] series delete cancellation retains the detail and all bounded occurrences", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation agenda cancel series");
    const anchor = await calendar.createEvent({
      date: "2026-08-10",
      title,
      repeat: true,
    });
    fixture.rememberSeries(anchor);
    await calendar.openDelete();
    await athletePage.getByLabel("Delete recurrence scope").selectOption("series");
    await athletePage.getByRole("button", { name: "Cancel" }).click();
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
    await expect.poll(() => fixture.getSeries(anchor)).toHaveLength(4);
  });
});

test("[variation:planning.recurrence:single-delete] deleting one middle occurrence keeps the remaining day details reachable", async ({
  athletePage,
}) => {
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const title = planningTestIdentity("variation agenda single delete");
    const anchor = await calendar.createEvent({
      date: "2026-08-17",
      title,
      repeat: true,
    });
    fixture.rememberSeries(anchor);
    const rows = await fixture.getSeries(anchor);
    const second = rows[1];
    const third = rows[2];
    if (!second || !third) throw new Error("Expected middle occurrences.");
    await calendar.deleteEvent(second.id);
    await expect
      .poll(() => fixture.getSeries(anchor))
      .toEqual(rows.filter((row) => row.id !== second.id));
    await calendar.openDetail(third.id);
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
  });
});

test("[variation:planning.day-agenda:deep-link-history] completed activity detail returns to the same arbitrary day after forward and back navigation", async ({
  athletePage,
}, testInfo) => {
  await withDayAgendaFixture(testInfo, async (fixture) => {
    const dayUrl = `/calendar/day/${fixture.date}?month=2026-11&view=agenda`;
    await athletePage.goto(dayUrl);
    await athletePage.getByTestId(`activity-card-${fixture.activityId}-open`).click();
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
    await expect(
      athletePage
        .getByTestId(`activity-card-${fixture.activityId}`)
        .getByRole("heading", { name: fixture.completedName, exact: true }),
    ).toBeVisible();
    await athletePage.goForward();
    await expect(athletePage.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
    await expect(
      detailCard.getByRole("heading", { name: fixture.completedName, exact: true }),
    ).toBeVisible();
  });
});
