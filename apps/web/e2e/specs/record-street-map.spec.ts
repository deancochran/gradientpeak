import { Buffer } from "node:buffer";
import { expect, test } from "../fixtures";

const OSM_TILES = "https://tile.openstreetmap.org/**";
// 1×1 transparent PNG. Test interception guarantees browser automation never contacts OSM.
const LOCAL_TEST_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

test("[P1] recorder street context is explicit, local-tile-only, recoverable, and revocable", async ({
  athletePage,
  athleteActor,
  e2eData,
}, testInfo) => {
  test.setTimeout(90_000);
  const planId = athleteActor.activityPlanId;
  if (!planId) throw new Error("Street-map proof requires the canonical athlete plan.");
  const tileRequests: Array<{ headers: Record<string, string>; url: string }> = [];
  let tileMode: "ok" | "fail" = "ok";
  await athletePage.context().route(OSM_TILES, async (route) => {
    tileRequests.push({ headers: route.request().headers(), url: route.request().url() });
    if (tileMode === "fail") {
      await route.fulfill({
        status: 500,
        body: "local test tile failure",
        contentType: "text/plain",
        headers: { "cache-control": "no-store" },
      });
      return;
    }
    await route.fulfill({
      body: LOCAL_TEST_TILE,
      contentType: "image/png",
      headers: { "cache-control": "no-store" },
    });
  });
  const route = await e2eData.routes.create({
    actorEmail: athleteActor.email,
    label: "street-map-local-fixture-route",
  });
  await athletePage.goto(
    `/record?activity_category=bike&gps=off&activityPlanId=${planId}&routeId=${route.id}`,
  );
  await expect(athletePage.getByRole("region", { name: "Recording cockpit" })).toBeVisible();
  const routeSurface = athletePage.getByTestId("recording-route-surface");
  await expect(routeSurface.getByText(/viewed area and IP address/)).toBeVisible();
  await expect(
    routeSurface.getByRole("link", { name: "OpenStreetMap contributors" }),
  ).toBeVisible();
  await expect(routeSurface.getByRole("link", { name: "Report a map issue" })).toBeVisible();
  expect(tileRequests).toHaveLength(0);

  await routeSurface.getByRole("button", { name: "Load street map" }).click();
  await expect(routeSurface.locator(".leaflet-container")).toBeVisible();
  await expect(routeSurface.locator(".leaflet-overlay-pane svg path")).toHaveCount(3);
  await expect(routeSurface.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  await expect(routeSurface.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(routeSurface.getByRole("button", { name: "Reset route view" })).toBeVisible();
  await expect(routeSurface.getByText(/no live GPS/i)).toBeVisible();
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  await expect
    .poll(() =>
      routeSurface
        .locator("img.leaflet-tile")
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  for (const request of tileRequests) {
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.authorization).toBeUndefined();
    const referer = request.headers.referer;
    expect(referer).toBeTruthy();
    expect(new URL(referer as string).origin).toBe(new URL(athletePage.url()).origin);
    expect(referer).not.toContain(route.id);
    expect(referer).not.toContain("?");
  }
  const screenshot = testInfo.outputPath(
    `record-street-map-${testInfo.project.name.replaceAll(" ", "-")}.png`,
  );
  await athletePage.screenshot({ fullPage: true, path: screenshot, scale: "css" });
  await testInfo.attach("street-map-local-test-tiles", {
    path: screenshot,
    contentType: "image/png",
  });

  await routeSurface.getByRole("button", { name: "Hide street map" }).click();
  const beforeFailedLoad = tileRequests.length;
  await athletePage.waitForTimeout(250);
  expect(tileRequests).toHaveLength(beforeFailedLoad);
  await routeSurface.getByRole("button", { name: "Load street map" }).click();
  await expect(routeSurface.locator(".leaflet-container")).toBeVisible();
  // Previously decoded tiles can legitimately be reused from the browser's
  // image cache. Fail a new zoom level, rather than bypassing normal caching.
  tileMode = "fail";
  await routeSurface.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(routeSurface.getByText(/Street imagery could not load/)).toBeVisible();
  await expect(routeSurface.getByLabel("Route preview")).toBeVisible();
  await expect(routeSurface.locator(".leaflet-container")).toHaveCount(0);

  tileMode = "ok";
  await routeSurface.getByRole("button", { name: "Retry street map" }).click();
  await expect(routeSurface.locator(".leaflet-container")).toBeVisible();
  await expect
    .poll(() =>
      routeSurface
        .locator("img.leaflet-tile")
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await routeSurface.getByRole("button", { name: "Hide street map" }).click();
  await expect(athletePage.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
});
