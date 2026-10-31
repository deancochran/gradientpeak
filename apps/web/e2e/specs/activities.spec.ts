import {
  activityFileForIdentity,
  activityFiles,
  activityFixtureIdentity,
  deleteImportedActivity,
  importActivity,
} from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { ActivitiesPage, withTrpcFailure } from "../pages";

test.describe("completed activities and imports", () => {
  test("[P0] anonymous readers see public activity disclosure while private activity stays blocked", async ({
    anonymousPage,
    athletePage,
  }, testInfo) => {
    const name = activityFixtureIdentity(testInfo, "public privacy boundary");
    const activities = new ActivitiesPage(athletePage);
    const publicActivity = new ActivitiesPage(anonymousPage);
    let activityId = "";
    try {
      activityId = await importActivity(athletePage, activityFiles.gpx, name);
      await publicActivity.openPublicShare(activityId);
      await expect(anonymousPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await expect(anonymousPage.getByRole("region", { name: "Activity summary" })).toHaveCount(0);

      await activities.openDetail(activityId);
      await activities.setVisibility("Public");

      await publicActivity.openPublicShare(activityId);
      await expect(
        anonymousPage.getByRole("heading", { name: "Activity", exact: true }),
      ).toBeVisible();
      await expect(anonymousPage.getByRole("region", { name: "Activity summary" })).toBeVisible();
      await expect(anonymousPage.getByText("Elapsed", { exact: true })).toBeVisible();
      await expect(anonymousPage.getByText("Distance", { exact: true })).toBeVisible();
      await expect(anonymousPage.getByText(/Shared by Athlete User/)).toBeVisible();
      await anonymousPage.reload();
      await expect(
        anonymousPage.getByRole("heading", { name: "Performance details" }),
      ).toBeVisible();

      await activities.openDetail(activityId);
      await activities.setVisibility("Private");
      await anonymousPage.reload();
      await expect(anonymousPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await expect(anonymousPage.getByText("Performance details", { exact: true })).toHaveCount(0);
    } finally {
      await deleteImportedActivity(athletePage, activityId);
    }
  });

  test("imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes", async ({
    athletePage,
  }, testInfo) => {
    test.setTimeout(60_000);
    const name = activityFixtureIdentity(testInfo, "GPX");
    const activities = new ActivitiesPage(athletePage);
    let activityId = "";
    try {
      activityId = await importActivity(athletePage, activityFiles.gpx, name);
      await expect(
        athletePage.getByRole("heading", { name: "Activity", exact: true }),
      ).toBeVisible();
      await expect(athletePage.getByText(name, { exact: true })).toHaveCount(0);
      await expect(athletePage.getByRole("heading", { name: "Route preview" })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Stream charts" })).toBeVisible();
      await expect(athletePage.getByRole("img", { name: "Heart rate over time" })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Stream analysis" })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Session RPE" })).toBeVisible();
      await expect(athletePage.getByText("No RPE recorded", { exact: true })).toBeVisible();
      await expect(athletePage.getByLabel("Perceived exertion")).toHaveValue("");
      await expect(athletePage.getByRole("button", { name: "Save RPE" })).toBeDisabled();
      await athletePage.getByLabel("Perceived exertion").fill("6");
      await athletePage.getByRole("button", { name: "Save RPE" }).click();
      await expect(athletePage.getByText("Session RPE saved.")).toBeVisible();
      await expect(athletePage.getByText(/Current RPE 6\/10/)).toBeVisible();

      await test.step("recovers a failed like without double-toggling", async () => {
        await withTrpcFailure(
          athletePage,
          "social.toggleLike",
          async () => {
            await athletePage.getByRole("button", { name: "Like", exact: true }).click();
            await expect(athletePage.getByRole("button", { name: "Retry like" })).toBeVisible();
          },
          { times: 1 },
        );
        await athletePage.getByRole("button", { name: "Retry like" }).click();
        await expect(athletePage.getByRole("button", { name: /1 like/ })).toBeVisible();
      });

      await test.step("idempotently retries a comment after response loss", async () => {
        await withTrpcFailure(
          athletePage,
          "social.addComment",
          async () => {
            await athletePage.getByLabel("Add a comment").fill("Deterministic activity comment");
            await athletePage.getByRole("button", { name: "Post comment" }).click();
            await expect(
              athletePage.getByText("Comment was not posted. Your text is preserved."),
            ).toBeVisible();
          },
          { afterRequest: true, times: 1 },
        );
        await athletePage.getByRole("button", { name: "Post comment" }).click();
        await expect(athletePage.getByText("Deterministic activity comment")).toHaveCount(1);
      });

      await activities.openPublicShare(activityId);
      await expect(athletePage.getByText(name, { exact: true })).toHaveCount(0);
      await activities.openDetail(activityId);
      await activities.setVisibility("Followers");
      await athletePage.keyboard.press("Escape");
      await activities.openPublicShare(activityId);
      await expect(athletePage.getByText(name, { exact: true })).toHaveCount(0);
      await activities.openDetail(activityId);
      await activities.setVisibility("Public");
      await activities.openPublicShare(activityId);
      await expect(
        athletePage.getByRole("heading", { name: "Activity", exact: true }),
      ).toBeVisible();
      await expect(athletePage.getByText(name, { exact: true })).toHaveCount(0);

      await activities.openLibrary();
      await expect(athletePage.getByLabel("Search activities")).toHaveCount(0);
      await activities.filter({ category: "run", sort: "distance", order: "asc" });
      await athletePage.getByRole("textbox", { name: "From", exact: true }).fill("2026-01-01");
      await athletePage.getByRole("textbox", { name: "To", exact: true }).fill("2026-01-01");
      await athletePage.getByRole("button", { name: "Apply dates", exact: true }).click();
      await expect(athletePage).toHaveURL(/from=2026-01-01/);
      await expect(athletePage).toHaveURL(/to=2026-01-01/);
      await expect(athletePage.getByTestId(`activity-card-${activityId}`)).toBeVisible();
      await activities.openCard(activityId);

      await athletePage.getByRole("button", { name: "Delete", exact: true }).click();
      await athletePage.getByRole("button", { name: "Cancel" }).click();
      await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}`));
      await withTrpcFailure(
        athletePage,
        "activities.delete",
        async () => {
          await activities.deleteFromDetail();
          await expect(
            athletePage.getByText("Activity could not be deleted. Nothing was removed."),
          ).toBeVisible();
        },
        { times: 1 },
      );
      await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}`));
      await deleteImportedActivity(athletePage, activityId);
      activityId = "";
    } finally {
      await deleteImportedActivity(athletePage, activityId);
    }
  });

  for (const [format, fixture] of [
    ["FIT", activityFiles.fit],
    ["TCX", activityFiles.tcx],
  ] as const) {
    test(`imports a real ${format} file through signed storage and processing`, async ({
      athletePage,
    }, testInfo) => {
      if (format === "TCX") test.slow();
      const name = activityFixtureIdentity(testInfo, format);
      let activityId = "";
      try {
        activityId = await importActivity(athletePage, fixture, name);
        await expect(
          athletePage.getByRole("heading", { name: "Activity", exact: true }),
        ).toBeVisible();
        await expect(athletePage.getByText(name, { exact: true })).toHaveCount(0);
        if (format === "FIT") {
          await expect(
            athletePage.getByRole("heading", { name: "Pool swim detail" }),
          ).toBeVisible();
          await expect(athletePage.getByText("25 meters")).toBeVisible();
          await expect(athletePage.getByRole("heading", { name: "Laps" })).toBeVisible();
        }
      } finally {
        await deleteImportedActivity(athletePage, activityId);
      }
    });
  }

  test("keeps the selected file recoverable after a failed parse and retries with valid GPX", async ({
    athletePage,
  }, testInfo) => {
    test.setTimeout(60_000);
    const name = activityFixtureIdentity(testInfo, "GPX retry");
    const activities = new ActivitiesPage(athletePage);
    let activityId = "";
    try {
      await activities.openImporter();
      await activities.selectImportFile({
        name: "broken.gpx",
        mimeType: "application/gpx+xml",
        buffer: Buffer.from("<gpx>broken"),
      });
      await expect(athletePage.getByTestId("activity-import-name-input")).toHaveCount(0);
      await activities.submitImport();
      await expect(athletePage.getByRole("alert")).toBeVisible();
      await activities.selectImportFile(activityFileForIdentity(activityFiles.gpx, name));
      await activities.submitImport();
      await athletePage.waitForURL(/\/activities\/[0-9a-f-]+\/?$/, { timeout: 30_000 });
      await expect(
        athletePage.getByRole("heading", { name: "Activity", exact: true }),
      ).toBeVisible();
      await expect(athletePage.getByText(name, { exact: true })).toHaveCount(0);
      activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    } finally {
      await deleteImportedActivity(athletePage, activityId);
    }
  });
});
