import { expect, test } from "../fixtures";
import { recordingSubmissionJobCount, waitForActiveRecordingDraft } from "../recording/indexed-db";
import { openRecordingPage } from "../recording/navigation";

async function startTimer(page: Parameters<typeof openRecordingPage>[0]) {
  await page.getByRole("button", { name: /^bike$/i }).click();
  await page.getByRole("button", { name: /configure timer session/i }).click();
  await expect(page).toHaveURL(/\/record\/session$/);
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/^recording$/i)).toBeVisible();
  await waitForActiveRecordingDraft(page);
}

test("athlete recovers after refresh, then reviews and discards an atomic finalized artifact", async ({
  athletePage,
}) => {
  await openRecordingPage(athletePage, "/record");
  await startTimer(athletePage);
  await athletePage.reload();
  await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
  await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
  await athletePage.getByRole("button", { name: /^resume$/i }).click();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();

  await athletePage.reload();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
  await athletePage.getByRole("button", { name: /^discard$/i }).click();
  await expect(athletePage.getByText(/no recording session/i)).toBeVisible();
});

test("cross-tab takeover fences the old recorder and recovers in the new tab", async ({
  athletePage,
}) => {
  await openRecordingPage(athletePage, "/record");
  await startTimer(athletePage);

  const takeoverPage = await athletePage.context().newPage();
  await openRecordingPage(takeoverPage, "/record");
  await expect(takeoverPage.getByRole("button", { name: /take over recording/i })).toBeVisible();
  await takeoverPage.getByRole("button", { name: /take over recording/i }).click();
  await expect(takeoverPage.getByText(/paused timer recovered/i)).toBeVisible();
  await takeoverPage.getByRole("button", { name: /^resume$/i }).click();
  await expect(takeoverPage.getByText(/^recording$/i)).toBeVisible();

  await athletePage.getByRole("button", { name: /^pause$/i }).click();
  await expect(athletePage.getByRole("alert")).toContainText(/ownership moved to another tab/i);

  await takeoverPage.getByRole("button", { name: /^finish$/i }).click();
  await expect(takeoverPage.getByRole("heading", { name: /review recording/i })).toBeVisible();
  await takeoverPage.getByRole("button", { name: /^discard$/i }).click();
  await takeoverPage.close();
});

test("offline saves stay idempotent in IndexedDB and retry through the server handoff", async ({
  athletePage,
}) => {
  await openRecordingPage(athletePage, "/record");
  await startTimer(athletePage);
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
  await athletePage.getByLabel(/activity name/i).fill("Offline browser ride");

  await athletePage.context().setOffline(true);
  await athletePage.getByRole("button", { name: /^save activity$/i }).click();
  await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
  expect(await recordingSubmissionJobCount(athletePage)).toBe(1);

  await athletePage.getByRole("button", { name: /^save activity$/i }).click();
  await expect(athletePage.getByText(/submission: waiting to retry/i)).toBeVisible();
  expect(await recordingSubmissionJobCount(athletePage)).toBe(1);

  await athletePage.context().setOffline(false);
  await athletePage.getByRole("button", { name: /retry now/i }).click();
  await expect(athletePage.getByText(/submission: saved on server/i)).toBeVisible({
    timeout: 20_000,
  });
  expect(await recordingSubmissionJobCount(athletePage)).toBe(1);
});
