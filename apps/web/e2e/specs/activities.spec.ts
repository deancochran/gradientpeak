import {
  activityFiles,
  activityFixtureIdentity,
  deleteImportedActivity,
  importActivity,
} from "../activities/fixture-files";
import { expect, test } from "../fixtures";

test.describe("completed activities and imports", () => {
  test("imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes", async ({
    athletePage,
  }, testInfo) => {
    const name = activityFixtureIdentity(testInfo, "GPX");
    let activityId = "";
    try {
      activityId = await importActivity(athletePage, activityFiles.gpx, name);
      await expect(athletePage.getByRole("heading", { name })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Route preview" })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Stream charts" })).toBeVisible();
      await expect(athletePage.getByRole("img", { name: "Heart rate over time" })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Stream analysis" })).toBeVisible();
      await expect(athletePage.getByRole("heading", { name: "Session RPE" })).toBeVisible();
      await expect(athletePage.getByLabel("Perceived exertion")).toHaveValue("5");
      await athletePage.getByLabel("Perceived exertion").fill("6");
      await athletePage.getByRole("button", { name: "Save RPE" }).click();
      await expect(athletePage.getByText("Session RPE saved.")).toBeVisible();
      await expect(athletePage.getByText(/Current RPE 6\/10/)).toBeVisible();

      await athletePage.route("**/api/trpc/social.toggleLike*", (route) => route.abort(), {
        times: 1,
      });
      await athletePage.getByRole("button", { name: "Like", exact: true }).click();
      await expect(athletePage.getByRole("button", { name: "Retry like" })).toBeVisible();
      await athletePage.getByRole("button", { name: "Retry like" }).click();
      await expect(athletePage.getByRole("button", { name: /1 like/ })).toBeVisible();

      await athletePage.route("**/api/trpc/social.addComment*", (route) => route.abort(), {
        times: 1,
      });
      await athletePage.getByLabel("Add a comment").fill("Deterministic activity comment");
      await athletePage.getByRole("button", { name: "Post comment" }).click();
      await expect(
        athletePage.getByText("Comment was not posted. Your text is preserved."),
      ).toBeVisible();
      await athletePage.getByRole("button", { name: "Retry comment" }).click();
      await expect(athletePage.getByText("Deterministic activity comment")).toBeVisible();

      for (const visibility of ["Private", "Followers"] as const) {
        await athletePage.getByRole("button", { name: "Change visibility" }).click();
        await athletePage.getByRole("button", { name: new RegExp(`^${visibility}`) }).click();
        await expect(athletePage.getByText("Visibility updated")).toBeVisible();
        await athletePage.keyboard.press("Escape");
        await athletePage.goto(`/share/activities/${activityId}`);
        await expect(athletePage.getByRole("heading", { name })).not.toBeVisible();
        await athletePage.goto(`/activities/${activityId}`);
      }
      await athletePage.getByRole("button", { name: "Change visibility" }).click();
      await athletePage.getByRole("button", { name: /^Public/ }).click();
      await expect(athletePage.getByText("Visibility updated")).toBeVisible();
      await athletePage.goto(`/share/activities/${activityId}`);
      await expect(athletePage.getByRole("heading", { name })).toBeVisible();

      await athletePage.goto("/activities");
      await athletePage.getByLabel("Search activities").fill(name);
      await athletePage.getByRole("button", { name: "Search" }).click();
      await expect(athletePage.getByText(name)).toBeVisible();
      await athletePage.getByLabel("Sport").selectOption("run");
      await athletePage.getByLabel("Sort by").selectOption("distance");
      await athletePage.getByLabel("Order").selectOption("asc");
      await athletePage.getByLabel("From").fill("2026-01-01");
      await athletePage.getByLabel("To").fill("2026-01-01");
      await expect(athletePage.getByText(name)).toBeVisible();
      await athletePage.getByRole("button", { name: "Open" }).click();

      await athletePage.getByRole("button", { name: "Delete", exact: true }).click();
      await athletePage.getByRole("button", { name: "Cancel" }).click();
      await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}`));
      await athletePage.route("**/api/trpc/activities.delete*", (route) => route.abort(), {
        times: 1,
      });
      await athletePage.getByRole("button", { name: "Delete", exact: true }).click();
      await athletePage.getByRole("button", { name: "Delete activity", exact: true }).click();
      await expect(
        athletePage.getByText("Activity could not be deleted. Nothing was removed."),
      ).toBeVisible();
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
      const name = activityFixtureIdentity(testInfo, format);
      let activityId = "";
      try {
        activityId = await importActivity(athletePage, fixture, name);
        await expect(athletePage.getByRole("heading", { name })).toBeVisible();
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
    const name = activityFixtureIdentity(testInfo, "GPX retry");
    let activityId = "";
    try {
      await athletePage.goto("/activities/import");
      await athletePage.getByTestId("activity-import-file-input").setInputFiles({
        name: "broken.gpx",
        mimeType: "application/gpx+xml",
        buffer: Buffer.from("<gpx>broken"),
      });
      await athletePage.getByTestId("activity-import-name-input").fill(name);
      await athletePage.getByRole("button", { name: "Import activity" }).click();
      await expect(athletePage.getByRole("alert")).toBeVisible();
      await athletePage.getByTestId("activity-import-file-input").setInputFiles(activityFiles.gpx);
      await athletePage.getByRole("button", { name: "Import activity" }).click();
      await expect(athletePage.getByRole("heading", { name })).toBeVisible();
      activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    } finally {
      await deleteImportedActivity(athletePage, activityId);
    }
  });
});
