import { portableWebRecordingSubmissionJobSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
import { finalizeTimerRecordingArtifact } from "./finalized-artifact";
import { type LegacyRecordingArchive, prepareLegacyRecordingCopy } from "./legacy-storage";
import { createQueuedSubmissionJob } from "./submission-queue";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  startTimerOnlyRecording,
} from "./timer-runtime";

async function artifact(id: string) {
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "bike",
  });
  const state = finishTimerOnlyRecording(
    startTimerOnlyRecording(configured.state, 1000, id).state,
    2000,
  ).state;
  return finalizeTimerRecordingArtifact({
    state,
    ownerId: "owner",
    segmentId: "11111111-1111-4111-8111-111111111111",
    review: {
      name: "Legacy",
      notes: null,
      perceivedEffort: null,
      distanceMeters: 0,
      calories: null,
    },
    digest: async () => "a".repeat(64),
  });
}
describe("legacy active-copy eligibility", () => {
  it.each([
    "queued",
    "submitting",
    "retry_wait",
    "submitted",
    "review_required",
  ] as const)("keeps %s evidence archive-only even when a cached block list is incomplete", async (status) => {
    const blocked = await artifact("legacy-job");
    const review = await artifact("legacy-review");
    const job = portableWebRecordingSubmissionJobSchema.parse({
      ...createQueuedSubmissionJob(blocked, new Date(2000).toISOString()),
      status,
      activityId:
        status === "submitted" || status === "review_required"
          ? "22222222-2222-4222-8222-222222222222"
          : null,
    });
    const archive: LegacyRecordingArchive = {
      version: 1,
      ownerId: "owner",
      blockedArtifactIds: [],
      databases: [
        {
          name: "legacy",
          draft: null,
          leaseExpiresAtMs: 0,
          artifacts: [blocked, review],
          jobs: [{ job }],
        },
      ],
    };
    const before = structuredClone(archive);
    expect(
      prepareLegacyRecordingCopy(archive, 3000).artifacts.map((item) => item.recordingSessionId),
    ).toEqual(["legacy-review"]);
    expect(archive).toEqual(before);
  });
  it("honors archived job history even if the current source no longer has the job row", async () => {
    const blocked = await artifact("legacy-job");
    const archive: LegacyRecordingArchive = {
      version: 1,
      ownerId: "owner",
      blockedArtifactIds: [blocked.recordingSessionId],
      databases: [
        { name: "prior-journal", draft: null, leaseExpiresAtMs: 0, artifacts: [blocked], jobs: [] },
      ],
    };
    expect(
      prepareLegacyRecordingCopy(archive, 3000).artifacts.map((item) => item.recordingSessionId),
    ).toEqual([]);
  });
});
