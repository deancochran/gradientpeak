import {
  activityFiles,
  activityFixtureIdentity,
  deleteImportedActivity,
  importActivity,
} from "../activities/fixture-files";
import { expect, test } from "../fixtures";

test("activity.change-visibility and activity.delete preserve the owned activity safety flow", async ({
  athletePage,
}, testInfo) => {
  const name = activityFixtureIdentity(testInfo, "P0 activity safety");
  let activityId = "";
  try {
    activityId = await importActivity(athletePage, activityFiles.gpx, name);
    await athletePage.getByRole("button", { name: "Change visibility" }).click();
    await athletePage.getByRole("button", { name: /^Followers/ }).click();
    await expect(athletePage.getByText("Visibility updated")).toBeVisible();

    await athletePage.getByRole("button", { name: "Delete", exact: true }).click();
    await athletePage.getByRole("button", { name: "Cancel" }).click();
    await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}`));
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});
