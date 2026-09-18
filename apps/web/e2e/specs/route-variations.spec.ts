import { events } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { AuthPage, CalendarPage, RecordingPage, RoutesPage } from "../pages";
import { withCalendarEventFixture } from "../planning/data";
import { waitForActiveRecordingDraft } from "../recording/indexed-db";
import { currentE2EActor } from "../support/actors";
import { LocalE2EDatabase } from "../support/database";
import { e2eArtifactIdentity } from "../utils/testData";

const routeGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="GradientPeak variations"><trk><name>Variation Ridge</name><trkseg>
<trkpt lat="40.0" lon="-74.0"><ele>10</ele></trkpt>
<trkpt lat="40.02" lon="-74.01"><ele>30</ele></trkpt>
</trkseg></trk></gpx>`;

const routeFile = {
  name: "variation-route.gpx",
  mimeType: "application/gpx+xml",
  buffer: Buffer.from(routeGpx),
};

async function detachEventRoute(eventId: string) {
  const database = new LocalE2EDatabase();
  try {
    await database.typedTransaction((transaction) =>
      transaction
        .update(events)
        .set({ route_id: null })
        .where(
          and(eq(events.id, eventId), eq(events.profile_id, currentE2EActor("athlete").profileId)),
        ),
    );
  } finally {
    await database.close();
  }
}

test("[variation:routes.preview:detail-history] route detail preview launches recording and browser back restores map and elevation", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "preview history route");
  const routes = new RoutesPage(athletePage);
  const recording = new RecordingPage(athletePage);
  await routes.deleteByNameIfPresent(name);
  try {
    const id = await routes.upload(routeFile, name, "keyboard");
    await recording.openRoutePreview(id);
    await expect(athletePage.getByText(name, { exact: true })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByText("Map preview", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("Elevation profile", { exact: true })).toBeVisible();
    await athletePage.goForward();
    await expect(athletePage).toHaveURL((url) => url.pathname === "/record");
    await expect(athletePage).toHaveURL(
      (url) =>
        new URLSearchParams([...url.searchParams].sort()).toString() ===
        `activity_category=run&gps=off&routeId=${id}`,
    );
  } finally {
    await routes.deleteByNameIfPresent(name);
  }
});

test("[variation:routes.preview:narrow-launcher] narrow route preview retains the selected route card after launcher reload", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "narrow preview route");
  const routes = new RoutesPage(athletePage);
  const recording = new RecordingPage(athletePage);
  await routes.deleteByNameIfPresent(name);
  try {
    const id = await routes.upload(routeFile, name, "keyboard");
    await athletePage.setViewportSize({ width: 390, height: 844 });
    await recording.openRoutePreview(id);
    const route = athletePage.getByText(name, { exact: true });
    await route.scrollIntoViewIfNeeded();
    await expect(route).toBeVisible();
    await athletePage.reload();
    await expect(route).toBeVisible();
    await expect(athletePage.getByRole("button", { name: /^open recorder$/i })).toBeVisible();
  } finally {
    await routes.deleteByNameIfPresent(name);
  }
});

test("[variation:routes.recording:keyboard-review] keyboard route handoff reaches review with the exact route before safe discard", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "keyboard recorded route");
  const routes = new RoutesPage(athletePage);
  const recording = new RecordingPage(athletePage);
  await routes.deleteByNameIfPresent(name);
  try {
    const id = await routes.upload(routeFile, name, "keyboard");
    await recording.openRoutePreview(id);
    await recording.startFromLauncher("keyboard");
    await waitForActiveRecordingDraft(athletePage);
    await recording.finish("keyboard");
    await expect(athletePage.getByText(name, { exact: true })).toBeVisible();
    await recording.discard("keyboard");
    await expect(athletePage.getByText(/no recording session/i)).toBeVisible();
  } finally {
    await routes.deleteByNameIfPresent(name);
  }
});

test("[variation:routes.recording:saved-history] saved route recording opens from activity history and returns to the same route relationship", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "saved history route");
  let activityId = "";
  const routes = new RoutesPage(athletePage);
  const recording = new RecordingPage(athletePage);
  await routes.deleteByNameIfPresent(name);
  try {
    const id = await routes.upload(routeFile, name, "keyboard");
    await recording.openRoutePreview(id);
    await recording.startFromLauncher();
    await waitForActiveRecordingDraft(athletePage);
    await recording.finish();
    await recording.save();
    const open = athletePage.getByRole("link", { name: "Open saved activity" });
    await expect(open).toBeVisible({ timeout: 20_000 });
    await open.click();
    activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    await expect(athletePage.getByRole("link", { name })).toHaveAttribute("href", `/routes/${id}`);
    await athletePage.goto("/activities");
    await athletePage.getByTestId(`activity-card-${activityId}-open`).click();
    await expect(athletePage.getByRole("link", { name })).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
    await routes.deleteByNameIfPresent(name);
  }
});

test("[variation:routes.event-attachment:keyboard] keyboard event selection persists an exact route link after detail reload", async ({
  athletePage,
}, testInfo) => {
  const routeName = e2eArtifactIdentity(testInfo, "keyboard event route");
  const eventTitle = e2eArtifactIdentity(testInfo, "keyboard route event");
  const routes = new RoutesPage(athletePage);
  const calendar = new CalendarPage(athletePage);
  let eventId = "";
  await routes.deleteByNameIfPresent(routeName);
  try {
    await withCalendarEventFixture(async (fixture) => {
      const routeId = await routes.upload(routeFile, routeName, "keyboard");
      eventId = await calendar.createEvent({ date: "2026-12-28", title: eventTitle });
      fixture.rememberSeries(eventId);
      await routes.openDetail(routeId);
      await routes.attachToEvent(eventId, "keyboard");
      await calendar.openDetail(eventId);
      const link = athletePage.getByRole("link", { name: routeName });
      await expect(link).toHaveAttribute("href", `/routes/${routeId}`);
      await athletePage.reload();
      await expect(link).toBeVisible();
    });
  } finally {
    if (eventId) await detachEventRoute(eventId);
    await routes.deleteByNameIfPresent(routeName);
  }
});

test("[variation:routes.event-attachment:route-back] event route link opens map detail and browser back restores the same event assignment", async ({
  athletePage,
}, testInfo) => {
  const routeName = e2eArtifactIdentity(testInfo, "event back route");
  const eventTitle = e2eArtifactIdentity(testInfo, "route back event");
  const routes = new RoutesPage(athletePage);
  const calendar = new CalendarPage(athletePage);
  let eventId = "";
  await routes.deleteByNameIfPresent(routeName);
  try {
    await withCalendarEventFixture(async (fixture) => {
      const routeId = await routes.upload(routeFile, routeName, "keyboard");
      eventId = await calendar.createEvent({ date: "2026-12-28", title: eventTitle });
      fixture.rememberSeries(eventId);
      await routes.openDetail(routeId);
      await routes.attachToEvent(eventId);
      await calendar.openDetail(eventId);
      await athletePage.getByRole("link", { name: routeName }).click();
      await expect(athletePage.getByText("Map preview", { exact: true })).toBeVisible();
      await athletePage.goBack();
      await expect(athletePage.getByRole("heading", { name: eventTitle })).toBeVisible();
      await expect(athletePage.getByRole("link", { name: routeName })).toBeVisible();
    });
  } finally {
    if (eventId) await detachEventRoute(eventId);
    await routes.deleteByNameIfPresent(routeName);
  }
});

test("[variation:routes.anonymous:return-login] anonymous route deep link uses the real form and returns to the route library", async ({
  athleteActor,
  page,
}) => {
  await page.goto("/routes");
  await new AuthPage(page).signIn(athleteActor, "keyboard");
  await expect(page).toHaveURL((url) => url.pathname === "/routes");
  await expect(page).toHaveURL(
    (url) =>
      new URLSearchParams([...url.searchParams].sort()).toString() ===
      "maxAscentM=&maxDistanceKm=&minAscentM=&minDistanceKm=&ownerScope=own&page=1&search=&sort=newest",
  );
  await expect(page.getByRole("heading", { name: "Find a route" })).toBeVisible();
});

test("[variation:routes.anonymous:invalid-retry] invalid credentials preserve the route return path before correction", async ({
  athleteActor,
  page,
}) => {
  const auth = new AuthPage(page);
  await page.goto("/routes");
  await auth.signIn({ email: athleteActor.email, password: "WrongRoutePassword123!" });
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/redirect=%2Froutes/);
  await auth.signIn(athleteActor);
  await expect(page.getByRole("heading", { name: "Find a route" })).toBeVisible();
});

test("[variation:routes.upload:cancel-delete] cancelling route deletion preserves the edited route and its filtered card", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "cancel delete route");
  const routes = new RoutesPage(athletePage);
  await routes.deleteByNameIfPresent(name);
  try {
    const id = await routes.upload(routeFile, name, "keyboard");
    await athletePage.getByTestId(`route-detail-edit-${id}`).click();
    await athletePage.getByTestId("route-edit-description-input").fill("Retained cancel variation");
    await athletePage.getByTestId("route-edit-save").click();
    await athletePage.getByTestId(`route-detail-delete-${id}`).click();
    await athletePage.getByRole("button", { name: "Cancel" }).click();
    await expect(athletePage.getByText("Retained cancel variation")).toBeVisible();
    await routes.openLibrary({ name, ownerScope: "own", page: 1 });
    await expect(athletePage.getByTestId(`route-card-${id}`)).toBeVisible();
  } finally {
    await routes.deleteByNameIfPresent(name);
  }
});

test("[variation:routes.upload:back-abandons-edit] browser back abandons an unsaved rename and keeps the original searchable route", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "abandon route edit");
  const routes = new RoutesPage(athletePage);
  await routes.deleteByNameIfPresent(name);
  try {
    const id = await routes.upload(routeFile, name, "keyboard");
    await athletePage.getByTestId(`route-detail-edit-${id}`).press("Enter");
    await athletePage.getByTestId("route-edit-name-input").fill("Unsaved route rename");
    await athletePage.goBack();
    await expect(athletePage.getByRole("heading", { name })).toBeVisible();
    await routes.openLibrary({ name, ownerScope: "own", page: 1 });
    await expect(
      athletePage.getByTestId(`route-card-${id}`).getByRole("heading", { name }),
    ).toBeVisible();
    await expect(athletePage.getByText("Unsaved route rename")).toHaveCount(0);
  } finally {
    await routes.deleteByNameIfPresent(name);
  }
});
