import type { Request } from "@playwright/test";
import {
  activityFiles,
  activityFixtureIdentity,
  deleteImportedActivity,
  importActivity,
} from "../activities/fixture-files";
import { expect, test } from "../fixtures";

// Uses the repository's real, actor-owned accepted-file import flow. Execution
// requires the coordinator-approved local DB/storage harness; no mocked streams.
test("[P0] accepted activity playback is keyboard accessible, gap-aware, resettable, and read-only", async ({
  athletePage,
}, testInfo) => {
  test.setTimeout(60_000);
  let activityId = "";
  const recordingWrites: string[] = [];
  const watch = (request: Request) => {
    if (
      request.method() === "POST" &&
      /(?:createFromRecordingSummary|beginMobileRecordingUpload|sendCompletedActivityToProvider)/.test(
        request.url(),
      )
    )
      recordingWrites.push(request.url());
  };
  try {
    activityId = await importActivity(
      athletePage,
      activityFiles.gpx,
      activityFixtureIdentity(testInfo, "persisted playback"),
    );
    const playback = athletePage.getByTestId("activity-playback");
    await expect(playback.getByRole("button", { name: "Play playback" })).toBeEnabled();
    await expect(playback.getByTestId("playback-metric-heartRate")).toContainText("145 bpm");
    await expect(playback.getByTestId("playback-position-marker")).toHaveAttribute(
      "data-latitude",
      "40.1",
    );
    athletePage.on("request", watch);
    await playback.getByRole("button", { name: "Playback speed 2x" }).click();
    await playback.getByRole("button", { name: "Play playback" }).click();
    const seek = playback.getByRole("slider", { name: "Playback elapsed time" });
    await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0);
    await playback.getByRole("button", { name: "Pause playback" }).click();
    await seek.focus();
    await seek.press("Home");
    await expect(seek).toHaveValue("0");
    await seek.press("ArrowRight");
    await expect(seek).toHaveValue("1000");
    await seek.press("PageUp");
    await expect(playback.getByTestId("playback-metric-heartRate")).toContainText("Unavailable");
    await expect(playback.getByTestId("playback-position-marker")).toHaveCount(0);
    await seek.press("End");
    await expect(playback.getByRole("status")).toHaveText("End of playback.");
    await expect(playback.getByTestId("playback-metric-heartRate")).toContainText("158 bpm");
    await expect(playback.getByTestId("playback-position-marker")).toHaveAttribute(
      "data-latitude",
      "40.102",
    );
    await playback.getByRole("button", { name: "Restart playback" }).click();
    await expect(seek).toHaveValue("0");
    await athletePage.reload();
    await expect(playback.getByRole("button", { name: "Play playback" })).toBeEnabled();
    await expect(seek).toHaveValue("0");
    await expect(playback.getByRole("button", { name: "Playback speed 1x" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(recordingWrites).toEqual([]);
  } finally {
    athletePage.off("request", watch);
    await deleteImportedActivity(athletePage, activityId);
  }
});
