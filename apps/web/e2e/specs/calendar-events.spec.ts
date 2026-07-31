import { expect, test } from "../fixtures";
import { withCalendarEventFixture } from "../planning/data";
import { planningTestIdentity } from "../planning/journeys";
import { authenticateTestActor, resetLocalAuthRateLimits } from "../utils/testData";

async function eventIdFromDetail(page: import("@playwright/test").Page) {
  const value = await page.getByText("Event id").locator("..").locator("p").last().textContent();
  if (!value || !/^[0-9a-f-]{36}$/i.test(value))
    throw new Error("Event detail did not expose its ID.");
  return value;
}

async function createEvent(
  page: import("@playwright/test").Page,
  input: {
    date: string;
    title: string;
    allDay?: boolean;
    notes?: string;
    race?: boolean;
    repeat?: boolean;
  },
) {
  await resetLocalAuthRateLimits();
  await page.goto(`/calendar/new?date=${input.date}&type=${input.race ? "race_target" : "custom"}`);
  await expect(page.locator("#agenda-date-field")).toHaveValue(input.date);
  if (input.race) await page.getByLabel("Race").check();
  await page.getByLabel("Title").fill(input.title);
  if (input.notes) await page.getByLabel("Notes").fill(input.notes);
  if (input.allDay) await page.getByLabel("All day").check();
  if (input.repeat) await page.getByLabel("Repeat weekly").selectOption("4");
  await page.getByRole("button", { name: /^create$/i }).press("Enter");
  await expect(page.getByRole("heading", { name: input.title })).toBeVisible();
  return eventIdFromDetail(page);
}

async function deleteSeries(page: import("@playwright/test").Page, eventId: string) {
  await page.goto(`/calendar/events/${eventId}`);
  await page.getByRole("button", { name: /^delete$/i }).click();
  await page.getByLabel("Delete recurrence scope").selectOption("series");
  await page.getByRole("button", { name: /^delete event$/i }).press("Enter");
  await expect(page).toHaveURL(/\/calendar(?:\?.*)?$/);
}

test("calendar.events creates durable one-off, all-day, and bounded recurring events", async ({
  athletePage,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    await athletePage.goto("/calendar/new?date=2026-10-26&type=custom");
    await athletePage.getByRole("button", { name: /^create$/i }).click();
    await expect(athletePage).toHaveURL(/\/calendar\/new/);
    await expect(athletePage.locator("#agenda-title")).toHaveValue("");
    expect(
      await athletePage.locator("form").evaluate((form) => {
        if (!(form instanceof HTMLFormElement)) throw new Error("Expected the event form.");
        return !form.checkValidity();
      }),
    ).toBe(true);

    const title = planningTestIdentity("Area 9 timed");
    const eventId = await createEvent(athletePage, { date: "2026-10-26", title });
    fixture.rememberSeries(eventId);
    await expect(athletePage.getByText("Event created").first()).toBeVisible();
    await expect(athletePage.getByText("Monday, October 26, 2026", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("All day").locator("..").getByText("No")).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();
    await athletePage.goto(`/calendar/events/${eventId}/edit`);
    await expect(athletePage.getByRole("heading", { name: /edit event/i })).toBeVisible();
    await athletePage.getByLabel("Title").fill(`${title} edited`);
    await athletePage.getByLabel("Notes").fill("durable browser edit");
    await athletePage.locator("#event-date-field").fill("2026-10-27");
    await athletePage.locator("#event-time-field").fill("10:30");
    await athletePage.getByRole("button", { name: /save changes/i }).press("Enter");
    await expect(athletePage.getByRole("heading", { name: `${title} edited` })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("durable browser edit")).toBeVisible();
    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await athletePage.getByRole("button", { name: /^delete event$/i }).press("Enter");
    await expect(athletePage).toHaveURL(/\/calendar(?:\?.*)?$/);
    await expect.poll(() => fixture.getSeries(eventId)).toHaveLength(0);

    const allDayTitle = planningTestIdentity("Area 9 all-day race");
    const allDayId = await createEvent(athletePage, {
      date: "2026-10-28",
      title: allDayTitle,
      allDay: true,
      race: true,
    });
    fixture.rememberSeries(allDayId);
    await expect(athletePage.getByText("All day").locator("..").getByText("Yes")).toBeVisible();

    const seriesTitle = planningTestIdentity("Area 9 weekly");
    const anchorId = await createEvent(athletePage, {
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
    await deleteSeries(athletePage, anchorId);
    await expect.poll(() => fixture.getSeries(anchorId)).toHaveLength(0);
    const overflowState = await athletePage.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter(
          (element) =>
            getComputedStyle(element).position !== "fixed" &&
            element.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .map((element) => ({
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        }))
        .slice(0, 10),
      viewportWidth: window.innerWidth,
    }));
    expect(
      overflowState.documentWidth,
      `Overflowing elements: ${JSON.stringify(overflowState.offenders)}`,
    ).toBeLessThanOrEqual(overflowState.viewportWidth);
  });
});

test("calendar.events applies single, future, and series updates to exact recurring rows", async ({
  athletePage,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    const initialTitle = planningTestIdentity("Area 9 update scopes");
    const initialNotes = "initial recurring notes";
    const anchorId = await createEvent(athletePage, {
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

    await athletePage.goto(`/calendar/events/${second.id}/edit`);
    await athletePage.getByLabel("Title").fill(`${initialTitle} single`);
    await athletePage.getByLabel("Notes").fill("single occurrence notes");
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

    await athletePage.goto(`/calendar/events/${third.id}/edit`);
    await athletePage.getByLabel("Apply changes to").selectOption("future");
    await athletePage.getByLabel("Title").fill(`${initialTitle} future`);
    await athletePage.getByLabel("Notes").fill("future occurrence notes");
    await athletePage.getByRole("button", { name: /save changes/i }).click();
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

    await athletePage.goto(`/calendar/events/${first.id}/edit`);
    await athletePage.getByLabel("Apply changes to").selectOption("series");
    await athletePage.getByLabel("Title").fill(`${initialTitle} series`);
    await athletePage.getByLabel("Notes").fill("entire series notes");
    await athletePage.getByRole("button", { name: /save changes/i }).click();
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

    await deleteSeries(athletePage, first.id);
    await expect.poll(() => fixture.getSeries(anchorId)).toHaveLength(0);
  });
});

test("calendar.events applies delete scopes exactly and does not disclose athlete events to coaches", async ({
  athletePage,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    const singleAnchor = await createEvent(athletePage, {
      date: "2026-12-07",
      title: planningTestIdentity("Area 9 delete single"),
      repeat: true,
    });
    fixture.rememberSeries(singleAnchor);
    await expect.poll(() => fixture.getSeries(singleAnchor)).toHaveLength(4);
    const singleRows = await fixture.getSeries(singleAnchor);
    const singleTarget = singleRows[1];
    if (!singleTarget) throw new Error("Expected a second recurring event row.");
    await athletePage.goto(`/calendar/events/${singleTarget.id}`);
    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await athletePage.getByRole("button", { name: /^delete event$/i }).press("Enter");
    await expect
      .poll(() => fixture.getSeries(singleAnchor))
      .toEqual(singleRows.filter((event) => event.id !== singleTarget.id));

    const futureAnchor = await createEvent(athletePage, {
      date: "2027-01-04",
      title: planningTestIdentity("Area 9 delete future"),
      repeat: true,
    });
    fixture.rememberSeries(futureAnchor);
    await expect.poll(() => fixture.getSeries(futureAnchor)).toHaveLength(4);
    const futureRows = await fixture.getSeries(futureAnchor);
    const futureTarget = futureRows[2];
    if (!futureTarget) throw new Error("Expected a third recurring event row.");
    await athletePage.goto(`/calendar/events/${futureTarget.id}`);
    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await athletePage.getByLabel("Delete recurrence scope").selectOption("future");
    await athletePage.getByRole("button", { name: /^delete event$/i }).press("Enter");
    await expect.poll(() => fixture.getSeries(futureAnchor)).toEqual(futureRows.slice(0, 2));

    const seriesAnchor = await createEvent(athletePage, {
      date: "2027-02-01",
      title: planningTestIdentity("Area 9 delete series"),
      repeat: true,
    });
    fixture.rememberSeries(seriesAnchor);
    await expect.poll(() => fixture.getSeries(seriesAnchor)).toHaveLength(4);
    const seriesRows = await fixture.getSeries(seriesAnchor);
    const seriesTarget = seriesRows[1];
    if (!seriesTarget) throw new Error("Expected a second recurring event row.");
    await deleteSeries(athletePage, seriesTarget.id);
    await expect.poll(() => fixture.getSeries(seriesAnchor)).toHaveLength(0);

    const privateEventId = await createEvent(athletePage, {
      date: "2027-03-01",
      title: planningTestIdentity("Area 9 athlete private"),
    });
    fixture.rememberSeries(privateEventId);
    // The athlete fixture owns the shared actor-state lock, so switch this browser context to the
    // coach only after all athlete actions are complete rather than attempting a second fixture.
    await athletePage.context().clearCookies();
    await authenticateTestActor(athletePage.context().request, "coach", {
      persistStorageState: false,
    });
    await resetLocalAuthRateLimits();
    const coachPage = await athletePage.context().newPage();
    try {
      await coachPage.goto(`/calendar/events/${privateEventId}`);
      await expect(coachPage.getByRole("alert")).toContainText("Event could not be loaded.", {
        timeout: 20_000,
      });
      await expect(coachPage.getByRole("button", { name: /edit event/i })).toHaveCount(0);
      await expect(coachPage.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
    } finally {
      await coachPage.close();
    }
  });
});
