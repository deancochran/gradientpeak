import { expect, test } from "../fixtures";
import { e2eArtifactIdentity } from "../utils/testData";

const validGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="GradientPeak E2E">
  <trk><name>Wave Two Route</name><trkseg>
    <trkpt lat="40.0000" lon="-74.0000"/><trkpt lat="40.0100" lon="-74.0050"/>
  </trkseg></trk>
</gpx>`;

async function deleteOwnedRouteIfPresent(page: import("@playwright/test").Page, routeName: string) {
  await page.goto(`/routes?search=${encodeURIComponent(routeName)}&ownerScope=own&page=1`);
  await expect(page.getByText("Loading routes...", { exact: true })).toHaveCount(0);
  const route = page.locator('[data-testid^="route-card-"]').filter({ hasText: routeName }).first();
  if ((await route.count()) === 0) return;
  await route.locator('[data-testid$="-open"]').click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete route", exact: true }).click();
  await expect(page).toHaveURL(/\/routes(?:\?.*)?$/);
}

test.describe("P0 route attachment boundary", () => {
  test("recording route preview carries the selected route into recording setup", async ({
    athletePage,
  }, testInfo) => {
    const routeName = e2eArtifactIdentity(testInfo, "route handoff");
    await deleteOwnedRouteIfPresent(athletePage, routeName);

    let routeId: string | null = null;
    try {
      await athletePage.goto("/routes/upload");
      await athletePage.getByTestId("route-upload-file-input").setInputFiles({
        name: "wave-two-route.xml",
        mimeType: "application/xml",
        buffer: Buffer.from(validGpx),
      });
      await athletePage.getByLabel("Route name").fill(routeName);
      await athletePage.getByTestId("route-upload-submit").click();
      await expect(athletePage).toHaveURL(/\/routes\/[0-9a-f-]+\/?$/);
      routeId = athletePage.url().match(/\/routes\/([0-9a-f-]+)/)?.[1] ?? null;
      if (!routeId) throw new Error("Created route URL did not include a route ID");

      await athletePage.goto(`/record/route-preview/${routeId}`);
      const recordingUrl = new URL(athletePage.url());
      expect(recordingUrl.pathname).toBe("/record");
      expect(recordingUrl.searchParams.get("routeId")).toBe(routeId);
    } finally {
      await deleteOwnedRouteIfPresent(athletePage, routeName);
    }
  });
});
