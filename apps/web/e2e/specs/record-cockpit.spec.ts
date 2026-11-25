import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "../fixtures";
import { RoutesPage } from "../pages";

function screenshotStem(testInfo: TestInfo) {
  return testInfo.project.name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/-$/u, "");
}

async function expectInInitialViewport(page: Page, controls: Locator[]) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Cockpit evidence requires a fixed browser viewport.");
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    if (!box) throw new Error("Visible cockpit control has no layout box.");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

async function captureCockpit(
  page: Page,
  testInfo: TestInfo,
  state: "ready" | "active",
  prefix = "record-cockpit",
) {
  await expectInInitialViewport(page, [
    page.getByRole("button", { name: state === "ready" ? "Start" : "Pause", exact: true }),
    page.getByRole("button", { name: "Plan", exact: true }),
    page.getByRole("button", { name: "Devices", exact: true }),
  ]);
  const path = testInfo.outputPath(`${prefix}-${state}-${screenshotStem(testInfo)}.png`);
  await page.screenshot({ fullPage: true, path, scale: "css" });
  await testInfo.attach(`cockpit-${state}`, { path, contentType: "image/png" });
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("[P0] plan and route cockpit remains actionable at ready and active states", async ({
  athletePage,
  athleteActor,
  e2eData,
}, testInfo) => {
  test.setTimeout(60_000);
  const activityPlanId = athleteActor.activityPlanId;
  if (!activityPlanId) throw new Error("The canonical athlete Tempo Builder plan is required.");
  const route = await e2eData.routes.create({
    actorEmail: athleteActor.email,
    label: "cockpit-metadata-polyline-route",
  });
  await athletePage.setViewportSize(
    testInfo.project.name === "Narrow Firefox"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
  );

  await athletePage.goto(
    `/record?activity_category=bike&gps=off&activityPlanId=${activityPlanId}&routeId=${route.id}`,
  );
  await expect(athletePage).toHaveURL(/\/record\/session\?/);
  await expect(athletePage.getByRole("region", { name: "Recording cockpit" })).toBeVisible();
  await expect(athletePage.getByText("Playwright Tempo Builder", { exact: true })).toBeVisible();
  await expect(athletePage.getByTestId("recording-route-surface")).toContainText(route.name);
  await expect(athletePage.getByLabel("Route preview").locator("polyline")).toHaveAttribute(
    "points",
    /.+/,
  );
  await expect(athletePage.getByText(/Preview geometry from route metadata/)).toBeVisible();
  const timeline = athletePage.locator('[data-testid^="recording-cockpit-timeline-bar-"]');
  await expect(timeline).toHaveCount(3);
  const readyOverflow = await captureCockpit(athletePage, testInfo, "ready");

  await athletePage.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(
    athletePage.locator("details").filter({ hasText: "Plan & route setup" }),
  ).toHaveAttribute("open", "");
  await athletePage.getByRole("button", { name: "Devices", exact: true }).click();
  await expect(
    athletePage.locator("details").filter({ hasText: "Devices & trainer" }),
  ).toHaveAttribute("open", "");

  await athletePage.getByRole("button", { name: "Start", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await expect(timeline.nth(0)).toHaveAttribute("aria-pressed", "true");
  const activeOverflow = await captureCockpit(athletePage, testInfo, "active");
  await athletePage.getByRole("button", { name: "Pause", exact: true }).click();
  await athletePage.getByRole("button", { name: "Resume", exact: true }).click();
  await athletePage.getByRole("button", { name: "Complete / Next", exact: true }).click();
  await expect(timeline.nth(1)).toHaveAttribute("aria-pressed", "true");
  await athletePage.getByRole("button", { name: "Skip step", exact: true }).click();
  await expect(timeline.nth(2)).toHaveAttribute("aria-pressed", "true");

  await athletePage.getByRole("button", { name: "Cancel recording", exact: true }).click();
  await athletePage.getByRole("button", { name: "Discard recording", exact: true }).click();
  await expect.soft(athletePage.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await expect
    .soft(athletePage.getByText("Discard this recording?", { exact: true }))
    .toHaveCount(0);
  expect(
    readyOverflow,
    "Ready cockpit must not extend past the viewport horizontally.",
  ).toBeLessThanOrEqual(0);
  expect(
    activeOverflow,
    "Active cockpit must not extend past the viewport horizontally.",
  ).toBeLessThanOrEqual(0);
});

test("[P0] uploaded full route geometry and elevation render in the recording cockpit", async ({
  athletePage,
  athleteActor,
  e2eData,
}, testInfo) => {
  test.setTimeout(90_000);
  const activityPlanId = athleteActor.activityPlanId;
  if (!activityPlanId) throw new Error("The canonical athlete Tempo Builder plan is required.");
  const routeName = "Playwright cockpit full-route elevation";
  const routes = new RoutesPage(athletePage);
  await athletePage.setViewportSize(
    testInfo.project.name === "Narrow Firefox"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
  );
  const routeId = await routes.upload(
    {
      name: "cockpit-full-route.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GradientPeak Playwright">
  <trk><name>Gradient switchback</name><trkseg>
    <trkpt lat="40.71280" lon="-74.00600"><ele>12</ele></trkpt>
    <trkpt lat="40.71330" lon="-74.00490"><ele>26</ele></trkpt>
    <trkpt lat="40.71270" lon="-74.00380"><ele>41</ele></trkpt>
    <trkpt lat="40.71340" lon="-74.00270"><ele>35</ele></trkpt>
    <trkpt lat="40.71290" lon="-74.00160"><ele>58</ele></trkpt>
    <trkpt lat="40.71360" lon="-74.00050"><ele>49</ele></trkpt>
  </trkseg></trk>
</gpx>`),
    },
    routeName,
  );
  e2eData.routes.register(routeId);

  await athletePage.goto(
    `/record?activity_category=bike&gps=off&activityPlanId=${activityPlanId}&routeId=${routeId}`,
  );
  await expect(athletePage).toHaveURL(/\/record\/session\?/);
  const timeline = athletePage.locator('[data-testid^="recording-cockpit-timeline-bar-"]');
  await expect(timeline).toHaveCount(3);
  const firstTimelineBar = timeline.first();
  await expect(firstTimelineBar).toBeVisible();
  const timelineBox = await firstTimelineBar.boundingBox();
  const viewport = athletePage.viewportSize();
  if (!timelineBox || !viewport)
    throw new Error("Cockpit timeline must have a viewport layout box.");
  expect(timelineBox.y).toBeLessThan(viewport.height);
  await expect(athletePage.getByText("60% FTP", { exact: true })).toBeVisible();
  await expect(athletePage.getByLabel("Route preview").locator("polyline")).toHaveAttribute(
    "points",
    /.+/,
  );
  await expect(
    athletePage.getByLabel("Route elevation profile").locator("polyline"),
  ).toHaveAttribute("points", /.+/);
  await expect(athletePage.getByText(/Preview geometry from route metadata/)).toHaveCount(0);
  const readyOverflow = await captureCockpit(
    athletePage,
    testInfo,
    "ready",
    "record-cockpit-full-route",
  );

  await athletePage.getByRole("button", { name: "Start", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await expect(timeline.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => athletePage.getByLabel(/Elapsed time/).getAttribute("aria-label"))
    .not.toContain("00:00:00");
  const activeOverflow = await captureCockpit(
    athletePage,
    testInfo,
    "active",
    "record-cockpit-full-route",
  );
  await athletePage.getByRole("button", { name: "Complete / Next", exact: true }).click();
  await expect(timeline.nth(1)).toHaveAttribute("aria-pressed", "true");
  await athletePage.getByRole("button", { name: "Cancel recording", exact: true }).click();
  await athletePage.getByRole("button", { name: "Discard recording", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  expect(readyOverflow).toBeLessThanOrEqual(0);
  expect(activeOverflow).toBeLessThanOrEqual(0);
});
