import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { waitForActiveRecordingDraft } from "../recording/indexed-db";
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
      expect(recordingUrl.pathname).toBe("/record/session");
      expect(recordingUrl.searchParams.get("routeId")).toBe(routeId);
    } finally {
      await deleteOwnedRouteIfPresent(athletePage, routeName);
    }
  });

  test("[P0] attached route survives launcher reload and reaches the saved activity", async ({
    athletePage,
  }, testInfo) => {
    test.setTimeout(90_000);
    const routeName = e2eArtifactIdentity(testInfo, "recorded route");
    let activityId = "";
    await deleteOwnedRouteIfPresent(athletePage, routeName);

    try {
      await athletePage.goto("/routes/upload");
      await athletePage.getByTestId("route-upload-file-input").setInputFiles({
        name: "recorded-route.xml",
        mimeType: "application/xml",
        buffer: Buffer.from(validGpx),
      });
      await athletePage.getByLabel("Route name").fill(routeName);
      await athletePage.getByTestId("route-upload-submit").click();
      await expect(athletePage).toHaveURL(/\/routes\/[0-9a-f-]+\/?$/);
      const routeId = athletePage.url().match(/\/routes\/([0-9a-f-]+)/)?.[1];
      if (!routeId) throw new Error("Uploaded recording route URL did not include a route ID.");

      await athletePage.goto(`/record/route-preview/${routeId}`);
      await expect(athletePage).toHaveURL(new RegExp(`/record/session\\?.*routeId=${routeId}`));
      await expect(athletePage.getByText("Route", { exact: true })).toBeVisible();
      await expect(
        athletePage.getByRole("heading", { name: routeName, exact: true }),
      ).toBeVisible();
      await athletePage.reload();
      await expect(
        athletePage.getByRole("heading", { name: routeName, exact: true }),
      ).toBeVisible();

      await athletePage.getByRole("button", { name: /^start$/i }).click();
      await waitForActiveRecordingDraft(athletePage);
      await athletePage.getByRole("button", { name: /^finish$/i }).click();
      await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
      await expect(athletePage.getByText(routeName, { exact: true })).toBeVisible();
      await athletePage.getByRole("button", { name: /^save activity$/i }).click();
      const openActivity = athletePage.getByRole("link", { name: "Open saved activity" });
      await expect(openActivity).toBeVisible({ timeout: 20_000 });
      await openActivity.click();
      activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
      if (!activityId) throw new Error("Saved route recording did not expose an activity ID.");
      await expect(athletePage.getByRole("link", { name: routeName })).toHaveAttribute(
        "href",
        `/routes/${routeId}`,
      );
      await athletePage.reload();
      await expect(athletePage.getByRole("link", { name: routeName })).toBeVisible();
    } finally {
      await deleteImportedActivity(athletePage, activityId);
      await deleteOwnedRouteIfPresent(athletePage, routeName);
    }
  });
});
