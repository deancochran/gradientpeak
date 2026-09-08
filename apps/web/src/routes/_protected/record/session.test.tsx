// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertOnlineRecordingSubmission,
  isReviewFrozen,
  RecordSessionPage,
  submissionRecoveryLabel,
} from "./session";

const mocks = vi.hoisted(() => ({
  recording: null as unknown as Record<string, unknown>,
  completeStep: vi.fn(),
  previousStep: vi.fn(),
  skipStep: vi.fn(),
  lap: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record">{children}</a>,
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    activityFiles: {
      beginMobileRecordingUpload: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      getIngestionStatus: { useQuery: () => ({ data: null }) },
    },
    activities: {
      createFromRecordingSummary: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      recordSessionRpe: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    profiles: { get: { useQuery: () => ({ data: { id: "profile-1" } }) } },
    routes: { get: { useQuery: () => ({ data: null }) } },
  },
}));

vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => mocks.recording,
}));

const structure = {
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Main",
      role: "activity",
      intervals: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "Set",
          repetitions: 1,
          steps: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              name: "Tempo",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
            {
              id: "30000000-0000-4000-8000-000000000002",
              name: "Repetitions",
              duration: { type: "repetitions", count: 8 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
} as const;
const occurrence = {
  occurrenceId:
    "activity:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000001:0:30000000-0000-4000-8000-000000000001",
  globalOrdinal: 0,
  segmentId: "10000000-0000-4000-8000-000000000001",
  segmentIndex: 0,
  role: "activity",
  activity_category: "run",
  intervalId: "20000000-0000-4000-8000-000000000001",
  intervalIndex: 0,
  stepId: "30000000-0000-4000-8000-000000000001",
  stepIndex: 0,
  repeatIteration: 0,
  completionPolicy: "time",
  duration: { type: "time", seconds: 60 },
  targets: [{ type: "RPE", intensity: 5 }],
} as const;
const snapshot = {
  activity: { activity_category: "run", activityPlanId: "plan-1", eventId: "event-1" },
  planExecution: {
    name: "Indoor intervals",
    structure,
    targetPresentations: [{ occurrenceId: occurrence.occurrenceId, labels: ["5 RPE"] }],
  },
};

function baseRecording() {
  return {
    state: {
      reducer: { lifecycle: "recording", snapshot },
      configuration: { activity_category: "run", activityPlanId: "plan-1" },
    },
    elapsedSeconds: 90,
    activeSeconds: 80,
    movingSeconds: 80,
    planStatus: {
      totalOccurrences: 2,
      currentOccurrence: occurrence,
      currentOccurrenceIndex: 0,
      currentStepElapsedSeconds: 20,
      currentStepRemainingSeconds: 40,
      processedCount: 0,
      completedCount: 0,
      skippedCount: 0,
      currentLapElapsedSeconds: 30,
      laps: [],
      nextOccurrence: {
        ...occurrence,
        occurrenceId: "next",
        stepId: "30000000-0000-4000-8000-000000000002",
        duration: { type: "repetitions", count: 8 },
      },
    },
    error: null,
    statusMessage: null,
    savingCommand: false,
    durabilityFenced: false,
    backgroundPaused: false,
    hydrationStatus: "ready",
    hasRecoveredDraft: false,
    canTakeOver: false,
    busy: false,
    artifact: null,
    submissionJob: null,
    pause: vi.fn(),
    resume: vi.fn(),
    start: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
    completeStep: mocks.completeStep,
    previousStep: mocks.previousStep,
    skipStep: mocks.skipStep,
    lap: mocks.lap,
    save: vi.fn(),
    discardFinalizedArtifact: vi.fn(),
    retrySubmission: vi.fn(),
    retryDurableStorage: vi.fn(),
    drainSubmissionQueue: vi.fn(),
    reset: vi.fn(),
    takeOver: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("recording session UI", () => {
  it("shows honest live plan metrics and keyboard-usable controls", () => {
    mocks.recording = baseRecording();
    render(<RecordSessionPage />);

    expect(screen.getByText("Tempo")).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByText("5 RPE")).toBeTruthy();
    expect(screen.getByText("Remaining: 00:00:40")).toBeTruthy();
    expect(screen.queryByText(/heart rate|power|cadence|speed|distance/i)).toBeNull();
    expect(document.querySelector("[aria-live]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Complete / Next" }));
    expect(mocks.completeStep).toHaveBeenCalledTimes(1);
  });

  it("reviews completed, skipped, and remaining work and marks manual fields honestly", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
      planStatus: null,
      artifact: {
        elapsedMs: 120_000,
        movingMs: 100_000,
        snapshot,
        review: {
          name: "Indoor intervals",
          notes: null,
          perceivedEffort: null,
          distanceMeters: 0,
          calories: null,
        },
        planExecution: {
          completedOccurrenceIds: [occurrence.occurrenceId],
          skippedOccurrenceIds: [],
          laps: [],
        },
      },
    };
    render(<RecordSessionPage />);

    expect(screen.getByText(/Completed steps:/)).toBeTruthy();
    expect(screen.getByText(/Remaining steps:/)).toBeTruthy();
    expect(screen.getByText(/Target adherence is unavailable/)).toBeTruthy();
    expect(screen.getByText("Manual distance (metres, optional)")).toBeTruthy();
    expect(screen.getByText("Manual calories (optional)")).toBeTruthy();
  });

  it("fences recorder controls and offers local-save recovery after a failed write", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "paused", snapshot } },
      durabilityFenced: true,
      error: "The latest recorder change could not be saved.",
    };
    render(<RecordSessionPage />);

    expect(screen.getByText("Local saving needs attention")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Complete / Next" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry local saving" }));
    expect(recording.retryDurableStorage).toHaveBeenCalledTimes(1);
  });
});

describe("recording submission recovery copy", () => {
  it("states that the activity is saved while Session RPE can be retried", () => {
    expect(
      submissionRecoveryLabel({
        status: "retry_wait",
        activityId: "activity-1",
        lastError: "session_rpe_pending",
      }),
    ).toBe("Activity saved; Session RPE is pending");
  });

  it("freezes local review fields after an activity is durably created", () => {
    expect(isReviewFrozen(null)).toBe(false);
    expect(isReviewFrozen({ activityId: "activity-1" })).toBe(true);
  });

  it("fails fast while offline so the durable queue can schedule a retry", () => {
    expect(() => assertOnlineRecordingSubmission(false)).toThrow(TypeError);
    expect(() => assertOnlineRecordingSubmission(true)).not.toThrow();
  });
});
