import {
  activityFiles,
  activityFixtureIdentity,
  deleteImportedActivity,
  importActivity,
} from "../activities/fixture-files";
import { expect, test } from "../fixtures";

test("activity import, RPE, like, and comment remain usable in the browser", async ({
  athletePage,
}, testInfo) => {
  const name = activityFixtureIdentity(testInfo, "P1 activities");
  let activityId = "";
  try {
    activityId = await importActivity(athletePage, activityFiles.gpx, name);
    await expect(athletePage.getByRole("heading", { name: "Session RPE" })).toBeVisible();
    await athletePage.getByLabel("Perceived exertion").fill("6");
    await athletePage.getByRole("button", { name: "Save RPE" }).click();
    await expect(athletePage.getByText("Session RPE saved.")).toBeVisible();
    await athletePage.getByRole("button", { name: "Like", exact: true }).click();
    await expect(athletePage.getByRole("button", { name: /1 like/ })).toBeVisible();
    await athletePage.getByLabel("Add a comment").fill("P1 browser comment");
    await athletePage.getByRole("button", { name: "Post comment" }).click();
    await expect(athletePage.getByText("P1 browser comment")).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});
