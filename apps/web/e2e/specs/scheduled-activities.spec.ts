import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { withCalendarEventFixture } from "../planning/data";
import { planningTestIdentity } from "../planning/journeys";
import { TEST_ACTIVITY_PLAN_ID } from "../utils/testData";

async function eventIdFromDetail(page: Page) {
  const value = await page.getByText("Event id").locator("..").locator("p").last().textContent();
  if (!value || !/^[0-9a-f-]{36}$/i.test(value))
    throw new Error("Event detail did not expose its ID.");
  return value;
}

async function createEvent(page: Page, date: string, title: string, planned: boolean) {
  await page.goto(`/calendar/new?date=${date}&type=${planned ? "planned" : "custom"}`);
  await page.getByLabel("Title").fill(title);
  if (planned) await page.getByLabel("Activity plan").selectOption(TEST_ACTIVITY_PLAN_ID);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return eventIdFromDetail(page);
}

test("scheduled-activities.library and scheduled-activities.detail persist filters and controls", async ({
  athletePage,
}) => {
  test.setTimeout(90_000);
  await withCalendarEventFixture(async (fixture) => {
    const pastTitle = planningTestIdentity("Area 10 planned past");
    const futureTitle = planningTestIdentity("Area 10 planned future");
    const customTitle = planningTestIdentity("Area 10 custom attach");
    const pastId = await createEvent(athletePage, "2020-01-06", pastTitle, true);
    const futureId = await createEvent(athletePage, "2030-01-07", futureTitle, true);
    fixture.rememberSeries(pastId);
    fixture.rememberSeries(futureId);

    await athletePage.goto("/scheduled-activities");
    await expect(athletePage.getByText(futureTitle)).toBeVisible();
    await expect(athletePage.getByText(pastTitle)).toHaveCount(0);
    await athletePage.getByLabel("Schedule range").selectOption("past");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(athletePage).toHaveURL(/range=past/);
    await expect(athletePage.getByText(pastTitle)).toBeVisible();
    await expect(athletePage.getByText(futureTitle)).toHaveCount(0);
    await athletePage.getByLabel("Schedule range").selectOption("all");
    await athletePage.getByLabel("Activity category").selectOption("bike");
    await athletePage.getByRole("button", { name: /apply filters/i }).click();
    await expect(athletePage).toHaveURL(
      /activity_category=bike.*range=all|range=all.*activity_category=bike/,
    );
    await expect(athletePage.getByText(pastTitle)).toBeVisible();
    await expect(athletePage.getByText(futureTitle)).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByLabel("Activity category")).toHaveValue("bike");
    await athletePage.getByText(futureTitle).click();
    await expect(athletePage.getByRole("heading", { name: futureTitle })).toBeVisible();
    await expect(
      athletePage.locator("p").filter({ hasText: "Playwright Tempo Builder" }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: futureTitle })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByLabel("Activity category")).toHaveValue("bike");

    const customId = await createEvent(athletePage, "2030-01-08", customTitle, false);
    fixture.rememberSeries(customId);
    await athletePage.goto(`/scheduled-activities/${customId}`);
    await expect(athletePage.getByText("No activity plan attached")).toBeVisible();
    await athletePage.getByLabel("Activity plan").selectOption(TEST_ACTIVITY_PLAN_ID);
    await athletePage.getByRole("button", { name: "Attach activity plan" }).click();
    await expect(athletePage.getByText("Activity plan attached")).toBeVisible();
    await expect(
      athletePage.locator("p").filter({ hasText: "Playwright Tempo Builder" }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(
      athletePage.locator("p").filter({ hasText: "Playwright Tempo Builder" }),
    ).toBeVisible();
    await athletePage.goto("/scheduled-activities?range=all&activity_category=bike");
    await expect(athletePage.getByText(customTitle)).toBeVisible();
    await athletePage.getByText(customTitle).click();
    await athletePage.getByRole("button", { name: "Remove activity plan" }).click();
    await expect(athletePage.getByText("Activity plan removed")).toBeVisible();
    await expect(athletePage.getByText("No activity plan attached")).toBeVisible();
    await athletePage.goto("/scheduled-activities?range=all");
    await expect(athletePage.getByText(customTitle)).toHaveCount(0);

    await athletePage.getByText(futureTitle).click();
    await expect(athletePage).toHaveURL(new RegExp(`/scheduled-activities/${futureId}$`));
    await athletePage.locator("#reschedule-date").fill("2030-01-09");
    await athletePage.getByRole("button", { name: "Reschedule occurrence" }).click();
    await expect(athletePage.getByText("Event updated")).toBeVisible();
    await expect(athletePage.locator("#reschedule-date")).toHaveValue("2030-01-09");
    await athletePage.reload();
    await expect(athletePage.locator("#reschedule-date")).toHaveValue("2030-01-09");
    await athletePage.getByRole("button", { name: "Remove from schedule" }).click();
    await expect(athletePage).toHaveURL(/\/scheduled-activities\/?(?:\?.*)?$/);
    await athletePage.goto("/scheduled-activities?range=all");
    await expect(athletePage.getByText(futureTitle)).toHaveCount(0);
    await expect(
      athletePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).resolves.toBe(true);
  });
});
