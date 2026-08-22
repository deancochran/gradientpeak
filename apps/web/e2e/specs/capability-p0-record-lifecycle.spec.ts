import { expect, test } from "../fixtures";
import { waitForActiveRecordingDraft } from "../recording/indexed-db";
import { openRecordingPage } from "../recording/navigation";

test("recording publicly pauses, resumes, and finishes from the current session", async ({
  athletePage,
}) => {
  await openRecordingPage(athletePage, "/record");
  await athletePage.getByRole("button", { name: /^bike$/i }).click();
  await athletePage.getByRole("button", { name: /configure timer session/i }).click();
  await athletePage.getByRole("button", { name: /^start$/i }).click();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await waitForActiveRecordingDraft(athletePage);

  await athletePage.getByRole("button", { name: /^pause$/i }).click();
  await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
  await athletePage.getByRole("button", { name: /^resume$/i }).click();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  await expect(athletePage.getByRole("heading", { name: /review recording/i })).toBeVisible();
});
