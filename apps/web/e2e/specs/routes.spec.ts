import type { Page } from "@playwright/test";
import { activityRoutes } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { RoutesPage } from "../pages";
import { withLocalE2EDatabase } from "../support/database";
import { e2eArtifactIdentity } from "../utils/testData";

const validGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="GradientPeak E2E">
  <trk><name>Firefox Ridge</name><trkseg>
    <trkpt lat="40.0000" lon="-74.0000"><ele>10</ele></trkpt>
    <trkpt lat="40.0100" lon="-74.0050"><ele>35</ele></trkpt>
    <trkpt lat="40.0200" lon="-74.0100"><ele>20</ele></trkpt>
  </trkseg></trk>
</gpx>`;

async function setRouteStorageState(routeId: string, state: "deletion_pending" | "ready") {
  return withLocalE2EDatabase(async (database) => {
    const result = await database.db
      .update(activityRoutes)
      .set({ storage_state: state, updated_at: new Date() })
      .where(eq(activityRoutes.id, routeId))
      .returning({ id: activityRoutes.id });
    return result.length;
  });
}

async function deleteOwnedRouteIfPresent(page: Page, routeName: string) {
  const routes = new RoutesPage(page);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await routes.openLibrary({ name: routeName, ownerScope: "own", page: 1 });
    } catch (error) {
      if (
        error instanceof Error &&
        /(NS_BINDING_ABORTED|interrupted by another navigation)/.test(error.message)
      ) {
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        continue;
      }
      throw error;
    }
    await expect(page.getByRole("heading", { name: "Find a route" })).toBeVisible();
    const matchingRoute = routes.card(routeName);
    if ((await matchingRoute.count()) === 0) return;

    await routes.openCard(routeName);
    await expect(page.getByRole("heading", { name: new RegExp(routeName) })).toBeVisible();
    await routes.deleteFromDetail();
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
    e2eData,
  }, testInfo) => {
    const routes = new RoutesPage(athletePage);
    const routeName = e2eArtifactIdentity(testInfo, "route");
    const updatedRouteName = `${routeName} Updated`;
    let createdRouteId: string | null = null;
    let routeDeleted = false;
    await deleteOwnedRouteIfPresent(athletePage, routeName);

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
      await athletePage.getByTestId("route-upload-submit").click();
      await expect(athletePage.getByRole("alert")).toContainText(/invalid route file/i);

      await fileInput.setInputFiles({
        name: "firefox-ridge.xml",
        mimeType: "application/xml",
        buffer: Buffer.from(validGpx),
      });
      await athletePage.getByLabel("Route name").fill(routeName);
      await athletePage.getByTestId("route-upload-submit").click();

      await expect(athletePage).toHaveURL(/\/routes\/[0-9a-f-]+\/?$/);
      createdRouteId = athletePage.url().match(/\/routes\/([0-9a-f-]+)/)?.[1] ?? null;
      if (!createdRouteId) throw new Error("Uploaded route URL did not include a route ID");
      e2eData.routes.register(createdRouteId);
      await expect(athletePage.getByRole("heading", { name: routeName })).toBeVisible();
      await expect(athletePage.getByText("Map preview", { exact: true })).toBeVisible();
      await expect(athletePage.getByText("Elevation profile", { exact: true })).toBeVisible();
      await expect(athletePage.getByText("Use for an event", { exact: true })).toBeVisible();

      await athletePage.getByTestId(`route-detail-edit-${createdRouteId}`).click();
      await athletePage.getByTestId("route-edit-name-input").fill(updatedRouteName);
      await athletePage
        .getByTestId("route-edit-description-input")
        .fill("Updated through the browser CRUD journey.");
      await athletePage.getByTestId("route-edit-save").click();
      await expect(athletePage.getByRole("heading", { name: updatedRouteName })).toBeVisible();
      await expect(
        athletePage.getByText("Updated through the browser CRUD journey."),
      ).toBeVisible();

      expect(await setRouteStorageState(createdRouteId, "deletion_pending")).toBe(1);
      await athletePage.reload();
      await expect(
        athletePage.getByText("Route deletion is pending", { exact: true }),
      ).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Retry deletion" })).toBeVisible();
      await expect(athletePage.getByTestId(`route-detail-edit-${createdRouteId}`)).toHaveCount(0);
      await expect(athletePage.getByTestId("route-comments")).toHaveCount(0);
      await expect(athletePage.getByText("Map preview", { exact: true })).toHaveCount(0);
      await expect(athletePage.getByText("Elevation profile", { exact: true })).toHaveCount(0);
      await expect(athletePage.getByRole("button", { name: /like/i })).toHaveCount(0);
      expect(await setRouteStorageState(createdRouteId, "ready")).toBe(1);

      await routes.openLibrary({ name: routeName, sort: "distance_desc", page: 1 });
      await expect(athletePage.getByRole("searchbox", { name: "Search routes" })).toHaveValue(
        routeName,
      );
      await expect(athletePage.getByRole("combobox", { name: "Sort routes" })).toHaveValue(
        "distance_desc",
      );
      const routeCard = athletePage.getByTestId(`route-card-${createdRouteId}`);
      await expect(routeCard).toBeVisible();
      await expect(routeCard.getByRole("heading", { name: updatedRouteName })).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Previous page" })).toBeDisabled();

      await routes.openCard(updatedRouteName);
      await athletePage.getByTestId(`route-detail-delete-${createdRouteId}`).click();
      await athletePage.getByTestId(`route-detail-delete-${createdRouteId}-confirm`).click();
      await expect(athletePage).toHaveURL(/\/routes(?:\?.*)?$/);
      routeDeleted = true;
    } finally {
      if (!routeDeleted) {
        if (createdRouteId) await setRouteStorageState(createdRouteId, "ready");
        else await deleteOwnedRouteIfPresent(athletePage, routeName);
      }
    }
  });
});
