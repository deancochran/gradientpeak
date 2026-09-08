import type { Page } from "@playwright/test";
import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { RecordingPage } from "../pages";
import {
  recordingSubmissionActivityId,
  recordingSubmissionJobCount,
  waitForActiveRecordingDraft,
} from "../recording/indexed-db";

async function startBike(page: Page) {
  const recording = new RecordingPage(page);
  await recording.configureBikeTimer();
  await recording.startSession("keyboard");
  await waitForActiveRecordingDraft(page);
  await expect(page.getByText(/^recording$/i)).toBeVisible();
}

async function chooseTempoPlan(page: Page) {
  await new RecordingPage(page).chooseActivityPlan("Playwright Tempo Builder");
}

async function finishAndDiscard(page: Page) {
  await new RecordingPage(page).finishAndDiscard();
}

test("[variation:recording.plan:keyboard-review] keyboard-selected plan remains named through review before safe discard", async ({
  athletePage,
}) => {
  const recording = new RecordingPage(athletePage);
  await recording.chooseActivityPlan("Playwright Tempo Builder", "keyboard");
  await recording.startFromLauncher("keyboard");
  await waitForActiveRecordingDraft(athletePage);
  await recording.finish("keyboard");
  await expect(athletePage.getByText("Playwright Tempo Builder", { exact: true })).toBeVisible();
  await recording.discard("keyboard");
});

test("[variation:recording.plan:activity-history] saved plan recording opens from history and preserves its plan relationship after back-forward", async ({
  athletePage,
}) => {
  let activityId = "";
  const recording = new RecordingPage(athletePage);
  try {
    await chooseTempoPlan(athletePage);
    await recording.startFromLauncher();
    await waitForActiveRecordingDraft(athletePage);
    await recording.finish();
    await recording.save();
    const open = athletePage.getByRole("link", { name: "Open saved activity" });
    await expect(open).toBeVisible({ timeout: 20_000 });
    await open.click();
    activityId = athletePage.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
    await athletePage.goto("/activities");
    await athletePage.getByTestId(`activity-card-${activityId}-open`).click();
    await expect(athletePage.getByText("Playwright Tempo Builder", { exact: true })).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage.getByTestId(`activity-card-${activityId}`)).toBeVisible();
    await athletePage.goForward();
    await expect(
      athletePage.getByRole("heading", { name: "Playwright Tempo Builder" }),
    ).toBeVisible();
  } finally {
    await deleteImportedActivity(athletePage, activityId);
  }
});

test("[variation:recording.pause-resume:paused-reload] a paused current session reloads safely and resumes before discard", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  const recording = new RecordingPage(athletePage);
  await recording.pause();
  await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
  await athletePage.reload();
  await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
  await recording.resume("keyboard");
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await finishAndDiscard(athletePage);
});

test("[variation:recording.pause-resume:repeat-controls] repeated pause and resume cycles retain one current artifact and one review", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  const recording = new RecordingPage(athletePage);
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await recording.pause("keyboard");
    await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
    await recording.resume("keyboard");
    await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  }
  await recording.finish();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toHaveCount(1);
  await recording.discard();
});

test("[variation:recording.recovery:review-history] recovered review survives a feature navigation history round trip before discard", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  await athletePage.reload();
  await athletePage.getByRole("button", { name: /^resume$/i }).click();
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
  await athletePage.goto("/activities");
  await athletePage.goBack();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
  await athletePage.getByRole("button", { name: /^discard$/i }).click();
  await expect(athletePage.getByText(/no recording session/i)).toBeVisible();
});

test("[variation:recording.recovery:double-reload] two reloads keep the same paused recovery and produce one discardable review", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  await athletePage.reload();
  await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
  await athletePage.reload();
  await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
  await athletePage.getByRole("button", { name: /^resume$/i }).click();
  await finishAndDiscard(athletePage);
});

test("[variation:recording.takeover:decline-by-close] opening a takeover tab without accepting leaves the original recorder usable", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  const contender = await athletePage.context().newPage();
  await new RecordingPage(contender).openLauncher();
  await expect(contender.getByRole("button", { name: /take over recording/i })).toBeVisible();
  await contender.close();
  await athletePage.getByRole("button", { name: /^pause$/i }).click();
  await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
  await athletePage.getByRole("button", { name: /^resume$/i }).click();
  await finishAndDiscard(athletePage);
});

test("[variation:recording.takeover:persisted-fence] accepted takeover remains authoritative after both tabs reload", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  const takeover = await athletePage.context().newPage();
  try {
    const takeoverRecording = new RecordingPage(takeover);
    await takeoverRecording.openLauncher();
    await takeoverRecording.takeOver();
    await takeoverRecording.resume();
    await athletePage.reload();
    await expect(athletePage.getByRole("alert")).toContainText(
      "This timer is active in another tab. Take over only if that tab is no longer recording.",
    );
    await takeover.reload();
    await expect(
      takeover.getByText(/recovered safely in paused state|paused timer recovered/i),
    ).toBeVisible();
    await takeoverRecording.resume();
    await finishAndDiscard(takeover);
  } finally {
    await takeover.close();
  }
});

test("[variation:recording.offline:reload-queue] waiting submission survives reload and succeeds once connectivity returns", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  try {
    await athletePage.context().setOffline(true);
    await athletePage.getByRole("button", { name: /^save activity$/i }).click();
    await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
    expect(await recordingSubmissionJobCount(athletePage)).toBe(1);
    await athletePage.context().setOffline(false);
    await athletePage.reload();
    await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
    expect(await recordingSubmissionJobCount(athletePage)).toBe(1);
    await athletePage.getByRole("button", { name: /retry now/i }).click();
    await expect(athletePage.getByText(/submission: saved on server/i)).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await athletePage.context().setOffline(false);
    const activityId = await recordingSubmissionActivityId(athletePage);
    expect(activityId).not.toBeNull();
    await deleteImportedActivity(athletePage, activityId ?? "");
  }
});

test("[variation:recording.offline:feature-navigation] queued save remains the same artifact after leaving and reopening recording review", async ({
  athletePage,
}) => {
  await startBike(athletePage);
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  try {
    await athletePage.context().setOffline(true);
    await athletePage.getByRole("button", { name: /^save activity$/i }).click();
    await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
    await athletePage.context().setOffline(false);
    await athletePage.goto("/activities");
    await new RecordingPage(athletePage).openLauncher();
    await athletePage.getByRole("button", { name: /^return to recorder$/i }).click();
    await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
    expect(await recordingSubmissionJobCount(athletePage)).toBe(1);
    await athletePage.getByRole("button", { name: /retry now/i }).click();
    await expect(athletePage.getByText(/submission: saved on server/i)).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await athletePage.context().setOffline(false);
    const activityId = await recordingSubmissionActivityId(athletePage);
    expect(activityId).not.toBeNull();
    await deleteImportedActivity(athletePage, activityId ?? "");
  }
});
