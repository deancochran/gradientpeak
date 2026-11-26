import { expect, test } from "../fixtures";
import { CalendarPage, expectNoHorizontalOverflow, expectNoOwnerControls } from "../pages";
import { withCalendarEventFixture } from "../planning/data";
import { planningTestIdentity } from "../planning/journeys";

test("calendar.events creates durable one-off, all-day, and bounded recurring events", async ({
  athletePage,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    await calendar.startCreate("2026-10-26");
    await expect(athletePage.getByRole("button", { name: /^create$/i })).toBeDisabled();
    await expect(athletePage).toHaveURL(/\/calendar\/new/);
    await expect(athletePage.locator("#agenda-title")).toHaveValue("");
    expect(
      await athletePage.locator("form").evaluate((form) => {
        if (!(form instanceof HTMLFormElement)) throw new Error("Expected the event form.");
        return !form.checkValidity();
      }),
    ).toBe(true);

    const title = planningTestIdentity("Area 9 timed");
    const eventId = await calendar.createEvent({ date: "2026-10-26", title });
    fixture.rememberSeries(eventId);
    await expect(athletePage.getByText("Event created").first()).toBeVisible();
    await expect(athletePage.getByText("Monday, October 26, 2026", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("All day").locator("..").getByText("No")).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
    await calendar.openEdit(eventId);
    await athletePage.getByLabel("Title", { exact: true }).fill(`${title} edited`);
    await athletePage.getByLabel("Notes").fill("durable browser edit");
    await athletePage.locator("#event-date-field").fill("2026-10-27");
    await athletePage.locator("#event-time-field").fill("10:30");
    await athletePage.getByRole("button", { name: /save changes/i }).press("Enter");
    await expect(athletePage.getByRole("heading", { name: `${title} edited` })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("durable browser edit")).toBeVisible();
    await calendar.openDelete();
    await calendar.confirmDelete();
    await expect(athletePage).toHaveURL(/\/calendar(?:\?.*)?$/);
    await expect.poll(() => fixture.getSeries(eventId)).toHaveLength(0);

    const allDayTitle = planningTestIdentity("Area 9 all-day event");
    const allDayId = await calendar.createEvent({
      date: "2026-10-28",
      title: allDayTitle,
      allDay: true,
    });
    fixture.rememberSeries(allDayId);
    await expect(athletePage.getByText("All day").locator("..").getByText("Yes")).toBeVisible();

    const seriesTitle = planningTestIdentity("Area 9 weekly");
    const anchorId = await calendar.createEvent({
      date: "2026-10-26",
      title: seriesTitle,
      repeat: true,
    });
    fixture.rememberSeries(anchorId);
    await expect.poll(() => fixture.getSeries(anchorId)).toHaveLength(4);
    const initialSeries = await fixture.getSeries(anchorId);
    expect(initialSeries.map((event) => event.scheduledDate)).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(initialSeries.filter((event) => event.seriesId === null)).toHaveLength(1);
    await calendar.deleteEvent(anchorId, "series");
    await expect.poll(() => fixture.getSeries(anchorId)).toHaveLength(0);
    await expectNoHorizontalOverflow(athletePage);
  });
});

test("calendar.events applies single, future, and series updates to exact recurring rows", async ({
  athletePage,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const initialTitle = planningTestIdentity("Area 9 update scopes");
    const initialNotes = "initial recurring notes";
    const anchorId = await calendar.createEvent({
      date: "2026-11-02",
      title: initialTitle,
      notes: initialNotes,
      repeat: true,
    });
    fixture.rememberSeries(anchorId);
    await expect.poll(() => fixture.getSeries(anchorId)).toHaveLength(4);
    const initial = await fixture.getSeries(anchorId);
    const [first, second, third, fourth] = initial;
    if (!first || !second || !third || !fourth)
      throw new Error("Expected four recurring event rows.");

    await calendar.openEdit(second.id);
    await athletePage.getByLabel("Title", { exact: true }).fill(`${initialTitle} single`);
    await athletePage.getByLabel("Notes", { exact: true }).fill("single occurrence notes");
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(
      athletePage.getByRole("heading", { name: `${initialTitle} single` }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("single occurrence notes")).toBeVisible();
    await expect
      .poll(() => fixture.getSeries(anchorId))
      .toEqual([
        expect.objectContaining({ id: first.id, notes: initialNotes, title: initialTitle }),
        expect.objectContaining({
          id: second.id,
          notes: "single occurrence notes",
          title: `${initialTitle} single`,
        }),
        expect.objectContaining({ id: third.id, notes: initialNotes, title: initialTitle }),
        expect.objectContaining({ id: fourth.id, notes: initialNotes, title: initialTitle }),
      ]);

    await calendar.openEdit(third.id);
    await calendar.saveEdit({
      scope: "future",
      title: `${initialTitle} future`,
      notes: "future occurrence notes",
    });
    await expect(
      athletePage.getByRole("heading", { name: `${initialTitle} future` }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("future occurrence notes")).toBeVisible();
    await expect
      .poll(() => fixture.getSeries(anchorId))
      .toEqual([
        expect.objectContaining({ id: first.id, notes: initialNotes, title: initialTitle }),
        expect.objectContaining({
          id: second.id,
          notes: "single occurrence notes",
          title: `${initialTitle} single`,
        }),
        expect.objectContaining({
          id: third.id,
          notes: "future occurrence notes",
          title: `${initialTitle} future`,
        }),
        expect.objectContaining({
          id: fourth.id,
          notes: "future occurrence notes",
          title: `${initialTitle} future`,
        }),
      ]);

    await calendar.openEdit(first.id);
    await calendar.saveEdit({
      scope: "series",
      title: `${initialTitle} series`,
      notes: "entire series notes",
    });
    await expect(
      athletePage.getByRole("heading", { name: `${initialTitle} series` }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("entire series notes")).toBeVisible();
    await expect
      .poll(() => fixture.getSeries(anchorId))
      .toEqual(
        [first, second, third, fourth].map((event) =>
          expect.objectContaining({
            id: event.id,
            notes: "entire series notes",
            title: `${initialTitle} series`,
          }),
        ),
      );

    await calendar.deleteEvent(first.id, "series");
    await expect.poll(() => fixture.getSeries(anchorId)).toHaveLength(0);
  });
});

test("calendar.events applies delete scopes exactly and does not disclose athlete events to coaches", async ({
  athletePage,
  coachActor,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    const calendar = new CalendarPage(athletePage);
    const singleAnchor = await calendar.createEvent({
      date: "2026-12-07",
      title: planningTestIdentity("Area 9 delete single"),
      repeat: true,
    });
    fixture.rememberSeries(singleAnchor);
    await expect.poll(() => fixture.getSeries(singleAnchor)).toHaveLength(4);
    const singleRows = await fixture.getSeries(singleAnchor);
    const singleTarget = singleRows[1];
    if (!singleTarget) throw new Error("Expected a second recurring event row.");
    await calendar.deleteEvent(singleTarget.id);
    await expect
      .poll(() => fixture.getSeries(singleAnchor))
      .toEqual(singleRows.filter((event) => event.id !== singleTarget.id));

    const futureAnchor = await calendar.createEvent({
      date: "2027-01-04",
      title: planningTestIdentity("Area 9 delete future"),
      repeat: true,
    });
    fixture.rememberSeries(futureAnchor);
    await expect.poll(() => fixture.getSeries(futureAnchor)).toHaveLength(4);
    const futureRows = await fixture.getSeries(futureAnchor);
    const futureTarget = futureRows[2];
    if (!futureTarget) throw new Error("Expected a third recurring event row.");
    await calendar.deleteEvent(futureTarget.id, "future");
    await expect.poll(() => fixture.getSeries(futureAnchor)).toEqual(futureRows.slice(0, 2));

    const seriesAnchor = await calendar.createEvent({
      date: "2027-02-01",
      title: planningTestIdentity("Area 9 delete series"),
      repeat: true,
    });
    fixture.rememberSeries(seriesAnchor);
    await expect.poll(() => fixture.getSeries(seriesAnchor)).toHaveLength(4);
    const seriesRows = await fixture.getSeries(seriesAnchor);
    const seriesTarget = seriesRows[1];
    if (!seriesTarget) throw new Error("Expected a second recurring event row.");
    await calendar.deleteEvent(seriesTarget.id, "series");
    await expect.poll(() => fixture.getSeries(seriesAnchor)).toHaveLength(0);

    const privateEventId = await calendar.createEvent({
      date: "2027-03-01",
      title: planningTestIdentity("Area 9 athlete private"),
    });
    fixture.rememberSeries(privateEventId);
    const coachPage = await coachActor.createPage(`/calendar/events/${privateEventId}`);
    try {
      await expect(coachPage.getByRole("alert")).toContainText("Event could not be loaded.", {
        timeout: 20_000,
      });
      await expectNoOwnerControls(coachPage, [/edit event/i, /^delete$/i]);
    } finally {
      await coachPage.close();
    }
  });
});
