import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { expect, test } from "../fixtures";
import { withCalendarEventFixture } from "../planning/data";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  resetLocalAuthRateLimits,
} from "../utils/testData";

const validGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="GradientPeak E2E">
  <trk><name>Route attachment fixture</name><trkseg>
    <trkpt lat="40.0000" lon="-74.0000"><ele>10</ele></trkpt>
    <trkpt lat="40.0100" lon="-74.0050"><ele>35</ele></trkpt>
  </trkseg></trk>
</gpx>`;

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Route capability fixtures only support the local database.");
  }
  return value;
}

async function eventRouteId(eventId: string) {
  const pool = new Pool({ connectionString: localDatabaseUrl(), max: 1 });
  try {
    const result = await pool.query<{ route_id: string | null }>(
      'select "route_id" from "events" where "id" = $1',
      [eventId],
    );
    return result.rows[0]?.route_id ?? null;
  } finally {
    await pool.end();
  }
}

async function createEvent(page: Page, title: string) {
  await resetLocalAuthRateLimits();
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 7);
  const dateKey = eventDate.toISOString().slice(0, 10);
  await page.goto(`/calendar/new?date=${dateKey}`);
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /^create$/i }).press("Enter");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const eventId = await page.getByText("Event id").locator("..").locator("p").last().textContent();
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    throw new Error("Created event detail did not expose a valid event ID.");
  }
  return eventId;
}

test("routes.attach-to-calendar-event persists the selected route on an event", async ({
  athletePage,
}, testInfo) => {
  test.setTimeout(90_000);
  const routeName = e2eArtifactIdentity(testInfo, "route attachment");
  const eventTitle = e2eArtifactIdentity(testInfo, "route attachment event");

  await cleanupOwnedActivityPlans({ planNames: [eventTitle], routeNames: [routeName] });

  try {
    await withCalendarEventFixture(async (fixture) => {
      await athletePage.goto("/routes/upload");
      await athletePage.getByTestId("route-upload-file-input").setInputFiles({
        name: "route-attachment.xml",
        mimeType: "application/xml",
        buffer: Buffer.from(validGpx),
      });
      await athletePage.getByLabel("Route name").fill(routeName);
      await athletePage.getByTestId("route-upload-submit").click();
      await expect(athletePage).toHaveURL(/\/routes\/[0-9a-f-]+\/?$/);
      const routeId = athletePage.url().match(/\/routes\/([0-9a-f-]+)/)?.[1];
      if (!routeId) throw new Error("Uploaded route URL did not include a route ID.");

      const eventId = await createEvent(athletePage, eventTitle);
      fixture.rememberSeries(eventId);
      await athletePage.goto(`/routes/${routeId}`);
      await expect(athletePage.getByRole("heading", { name: routeName })).toBeVisible();
      await athletePage.getByLabel("Event", { exact: true }).selectOption(eventId);
      await athletePage.getByRole("button", { name: "Attach route" }).click();
      await expect(athletePage.getByText("Route attached to event")).toBeVisible();

      await expect.poll(() => eventRouteId(eventId)).toBe(routeId);
      await athletePage.reload();
      await expect(athletePage.getByRole("heading", { name: routeName })).toBeVisible();
      await expect.poll(() => eventRouteId(eventId)).toBe(routeId);
    });
  } finally {
    await cleanupOwnedActivityPlans({ planNames: [eventTitle], routeNames: [routeName] });
  }
});
