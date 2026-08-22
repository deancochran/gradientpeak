import { expect, test } from "../fixtures";
import { openRecordingPage } from "../recording/navigation";

test("manual recording exposes laps through review", async ({ athletePage }) => {
  await openRecordingPage(athletePage, "/record");
  await athletePage.getByRole("button", { name: /^bike$/i }).click();
  await athletePage.getByRole("button", { name: /^open recorder$/i }).click();
  await athletePage.getByRole("button", { name: /^start$/i }).click();
  await expect(athletePage.getByText(/^recording$/i)).toBeVisible();

  // This is intentionally one broad red test until the web timer exposes a lap action.
  await athletePage.getByRole("button", { name: /^lap$/i }).click();
  await athletePage.getByRole("button", { name: /^finish$/i }).click();
  await expect(athletePage.getByText(/^Laps:/i)).toBeVisible();
});
