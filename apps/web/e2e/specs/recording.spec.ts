import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { RecordingPage } from "../pages";
import {
  recordingSubmissionActivityId,
  recordingSubmissionJobCount,
  waitForActiveRecordingDraft,
} from "../recording/indexed-db";

async function startTimer(page: import("@playwright/test").Page) {
  const recording = new RecordingPage(page);
  await recording.configureBikeTimer();
  await recording.startSession();
  await expect(page.getByText(/^recording$/i)).toBeVisible();
  await waitForActiveRecordingDraft(page);
}

test("athlete recovers after refresh, then reviews and discards an atomic finalized artifact", async ({
  athletePage,
}) => {
  const recording = new RecordingPage(athletePage);
  await startTimer(athletePage);
  await athletePage.reload();
  await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
  await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
  await recording.resume();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await recording.finish();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();

  await athletePage.reload();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
  await recording.discard();
  await expect(athletePage.getByText(/no recording session/i)).toBeVisible();
});

test("cross-tab takeover fences the old recorder and recovers in the new tab", async ({
  athletePage,
}) => {
  const recording = new RecordingPage(athletePage);
  await startTimer(athletePage);

  const takeoverPage = await athletePage.context().newPage();
  const takeover = new RecordingPage(takeoverPage);
  await takeover.openLauncher();
  await expect(takeoverPage.getByRole("button", { name: /take over recording/i })).toBeVisible();
  await takeover.takeOver();
  await expect(
    takeoverPage.getByText(/recovered safely in paused state|paused timer recovered/i),
  ).toBeVisible();
  await takeover.resume();
  await expect(takeoverPage.getByText(/^recording$/i)).toBeVisible();

  await recording.pause();
  await expect(athletePage.getByRole("alert")).toContainText(/ownership moved to another tab/i);

  await takeover.finishAndDiscard();
  await takeoverPage.close();
});

test("offline saves stay idempotent in IndexedDB and retry through the server handoff", async ({
  athletePage,
}) => {
  const recording = new RecordingPage(athletePage);
  await startTimer(athletePage);
  await recording.finish();
  try {
    await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
    await expect(athletePage.getByLabel(/activity name/i)).toHaveCount(0);

    await athletePage.context().setOffline(true);
    await recording.save();
    await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
    expect(await recordingSubmissionJobCount(athletePage)).toBe(1);

    await recording.save();
    await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
    expect(await recordingSubmissionJobCount(athletePage)).toBe(1);

    await athletePage.context().setOffline(false);
    await athletePage.getByRole("button", { name: /retry now/i }).click();
    await expect(athletePage.getByText(/submission: saved on server/i)).toBeVisible({
      timeout: 20_000,
    });
    expect(await recordingSubmissionJobCount(athletePage)).toBe(1);
  } finally {
    await athletePage.context().setOffline(false);
    const activityId = await recordingSubmissionActivityId(athletePage);
    expect(activityId).not.toBeNull();
    await deleteImportedActivity(athletePage, activityId ?? "");
  }
});
