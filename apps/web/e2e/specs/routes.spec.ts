import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

const validGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="GradientPeak E2E">
  <trk><name>Firefox Ridge</name><trkseg>
    <trkpt lat="40.0000" lon="-74.0000"><ele>10</ele></trkpt>
    <trkpt lat="40.0100" lon="-74.0050"><ele>35</ele></trkpt>
    <trkpt lat="40.0200" lon="-74.0100"><ele>20</ele></trkpt>
  </trkseg></trk>
</gpx>`;

const routeName = "Firefox Ridge";

async function deleteOwnedRouteIfPresent(page: Page) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.goto(`/routes?search=${encodeURIComponent(routeName)}&ownerScope=own&page=1`);
    await expect(page.getByRole("heading", { name: "Find a route" })).toBeVisible();
    await expect(page.getByText("Loading routes...", { exact: true })).toHaveCount(0);

    const matchingRoute = page.getByRole("heading", { name: routeName, exact: true }).first();
    if ((await matchingRoute.count()) === 0) return;

    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: routeName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete route", exact: true }).click();
    await expect(page).toHaveURL(/\/routes(?:\?.*)?$/);
  }

  throw new Error(`Could not clean all ${routeName} route fixtures`);
}

test("route library redirects an unauthenticated browser through login", async ({ page }) => {
  await page.goto("/routes");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
  await expect(page.getByRole("heading", { name: "Login", exact: true })).toBeVisible();
});

test.describe("authenticated route journey", () => {
  test.skip(
    !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
    "route E2E requires a service-role credential for an authenticated athlete",
  );

  test("athlete can retry an XML upload and use the persisted route journey", async ({
    athletePage,
  }) => {
    await deleteOwnedRouteIfPresent(athletePage);

    try {
      await athletePage.goto("/routes/upload");
      await expect(
        athletePage.getByRole("heading", { name: "Upload route", exact: true }),
      ).toBeVisible();

      const fileInput = athletePage.getByTestId("route-upload-file-input");
      await fileInput.setInputFiles({
        name: "broken.xml",
        mimeType: "application/xml",
        buffer: Buffer.from("<not-a-route />"),
      });
      await athletePage.getByRole("button", { name: "Upload route", exact: true }).click();
      await expect(athletePage.getByRole("alert")).toContainText(/invalid route file/i);

      await fileInput.setInputFiles({
        name: "firefox-ridge.xml",
        mimeType: "application/xml",
        buffer: Buffer.from(validGpx),
      });
      await athletePage.getByLabel("Route name").fill(routeName);
      await athletePage.getByRole("button", { name: "Upload route", exact: true }).click();

      await expect(athletePage).toHaveURL(/\/routes\/[0-9a-f-]+\/?$/);
      await expect(athletePage.getByRole("heading", { name: routeName })).toBeVisible();
      await expect(athletePage.getByText("Map preview", { exact: true })).toBeVisible();
      await expect(athletePage.getByText("Elevation profile", { exact: true })).toBeVisible();
      await expect(athletePage.getByText("Use for an event", { exact: true })).toBeVisible();

      await athletePage.goto("/routes?search=Firefox&sort=distance_desc&page=1");
      await expect(athletePage.getByRole("searchbox", { name: "Search routes" })).toHaveValue(
        "Firefox",
      );
      await expect(athletePage.getByRole("combobox", { name: "Sort routes" })).toHaveValue(
        "distance_desc",
      );
      await expect(athletePage.getByRole("heading", { name: routeName })).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Previous page" })).toBeDisabled();
    } finally {
      await deleteOwnedRouteIfPresent(athletePage);
    }
  });
});
