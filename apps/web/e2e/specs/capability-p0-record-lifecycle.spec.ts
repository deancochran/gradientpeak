import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { RecordingPage } from "../pages";
import { waitForActiveRecordingDraft } from "../recording/indexed-db";

test("[P0] athlete records from a selected plan through a persisted saved activity", async ({
  athletePage,
}) => {
  let activityId = "";
  const recording = new RecordingPage(athletePage);
  try {
    await recording.chooseActivityPlan("Playwright Tempo Builder");
    await recording.startFromLauncher();
    await waitForActiveRecordingDraft(athletePage);
    await recording.finish();
    await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
    await expect(
      athletePage
        .getByRole("region", { name: "Review recording" })
        .getByText("Playwright Tempo Builder", { exact: true })
        .first(),
    ).toBeVisible();
    await recording.save();
    const openActivity = athletePage.getByRole("link", { name: "Open saved activity" });
    await expect(openActivity).toBeVisible({ timeout: 20_000 });
    await openActivity.click();
    activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    if (!activityId) throw new Error("Saved plan recording did not expose an activity ID.");

    await expect(athletePage.getByText("Playwright Tempo Builder", { exact: true })).toBeVisible();
    await expect(athletePage.getByRole("heading", { name: "Activity" })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText("Playwright Tempo Builder", { exact: true })).toBeVisible();

    await athletePage.goto("/activities");
    await expect(athletePage.getByTestId(`activity-card-${activityId}`)).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("recording publicly pauses, resumes, and finishes from the current session", async ({
  athletePage,
}) => {
  const recording = new RecordingPage(athletePage);
  await recording.configureBikeTimer();
  await recording.startSession();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await waitForActiveRecordingDraft(athletePage);

  await recording.pause();
  await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
  await recording.resume();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await recording.finish();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
});
