import { portableTimerRecordingDraftSchema, portableWebRecordingArtifactSchema } from "@repo/core";
import { PLAYBACK_EXECUTION, SIMULATION_EXECUTION } from "@repo/core/recording/execution-evidence";
import {
  emptyMeasuredJournal,
  MeasuredNotificationAppender,
  measuredRecordingJournalSchema,
} from "@repo/core/recording/measured-journal";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  buildUploadedRecordingSummaryInput,
  finalizeTimerRecordingArtifact,
} from "./finalized-artifact";
import { createQueuedSubmissionJob } from "./submission-queue";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  createTimerOnlyRecordingDraft,
  finishTimerOnlyRecording,
  startTimerOnlyRecording,
} from "./timer-runtime";

describe("simulation/replay cannot persist as real recording", () => {
  it.each([
    SIMULATION_EXECUTION,
    PLAYBACK_EXECUTION,
  ])("rejects $mode at serializer, journal, artifact, and queue boundaries", async (execution) => {
    const state = startTimerOnlyRecording(
      configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
        activity_category: "bike",
      }).state,
      1000,
      "real-session",
    ).state;
    const realDraft = createTimerOnlyRecordingDraft(state, 2000, "owner");
    expect(portableTimerRecordingDraftSchema.safeParse(realDraft).success).toBe(true);
    expect(portableTimerRecordingDraftSchema.safeParse({ ...realDraft, execution }).success).toBe(
      false,
    );
    const attemptedState = { ...state, execution };
    expect(() => createTimerOnlyRecordingDraft(attemptedState, 2000, "owner")).toThrow(
      "cannot enter real recording",
    );
    expect(
      measuredRecordingJournalSchema.safeParse({ ...emptyMeasuredJournal(), execution }).success,
    ).toBe(false);
    const journal = { ...emptyMeasuredJournal(), execution };
    // Runtime crossing is intentional: negative evidence, not a manufactured measurement.
    const appender = new MeasuredNotificationAppender();
    expect(() => Reflect.apply(appender.append, appender, [journal, {}])).toThrow(
      "cannot enter real recording",
    );
    const finished = finishTimerOnlyRecording(state, 3000).state;
    const digest = vi.fn(async () => "a".repeat(64));
    const input = {
      state: finished,
      ownerId: "owner",
      segmentId: "11111111-1111-4111-8111-111111111111",
      review: {
        name: "Real",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest,
    };
    await expect(finalizeTimerRecordingArtifact({ ...input, execution })).rejects.toThrow(
      "cannot enter real recording",
    );
    expect(digest).not.toHaveBeenCalled();
    const artifact = await finalizeTimerRecordingArtifact(input);
    expect(portableWebRecordingArtifactSchema.safeParse(artifact).success).toBe(true);
    Reflect.set(artifact, "execution", execution);
    expect(portableWebRecordingArtifactSchema.safeParse(artifact).success).toBe(false);
    expect(() => createQueuedSubmissionJob(artifact, new Date(3000).toISOString())).toThrow(
      ZodError,
    );
    expect(() =>
      buildUploadedRecordingSummaryInput(artifact, {
        ingestionId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow("cannot enter real recording");
  });
});
