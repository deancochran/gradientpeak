// @vitest-environment jsdom

import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  planDetail: null as {
    detail: Record<string, unknown>;
  } | null,
  planList: [] as Array<Record<string, unknown>>,
  routeList: [] as Array<Record<string, unknown>>,
  routeGet: null as {
    name: string;
  } | null,
  routeFull: null as {
    coordinates: Array<{
      latitude: number;
      longitude: number;
      altitude?: number;
    }>;
    totalDistance: number | null;
    totalAscent: number | null;
  } | null,
  routeGetInput: "",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useSearch: () => ({ activity_category: "run", gps: "off" }),
  }),
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
    routes: {
      loadFull: {
        useQuery: () => ({
          data: mocks.routeFull,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      get: {
        useQuery: (input: { id: string }) => {
          mocks.routeGetInput = input.id;
          return { data: mocks.routeGet };
        },
      },
      list: { useInfiniteQuery: () => ({ data: { pages: [{ items: mocks.routeList }] } }) },
    },
    activityPlans: {
      list: { useInfiniteQuery: () => ({ data: { pages: [{ items: mocks.planList }] } }) },
      getById: { useQuery: () => ({ data: mocks.planDetail }) },
    },
    plannedSessions: {
      recordingLaunch: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    calendar: { day: { useQuery: () => ({ data: { projection: { items: [] } } }) } },
  },
}));
vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => mocks.recording,
}));
const structure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "30000000-0000-4000-8000-000000000001",
      name: "Tempo",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
    {
      type: "step",
      id: "30000000-0000-4000-8000-000000000002",
      name: "Repetitions",
      duration: { type: "repetitions", count: 8 },
      targets: [{ type: "RPE", intensity: 7 }],
    },
  ],
} as const;
const occurrence = {
  occurrenceId:
    "activity:20000000-0000-4000-8000-000000000001:0:30000000-0000-4000-8000-000000000001",
  globalOrdinal: 0,
  blockId: "20000000-0000-4000-8000-000000000001",
  blockIndex: 0,
  role: "activity",
  activity_category: "run",
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
    configure: vi.fn(() => true),
    changePlan: vi.fn(async () => true),
    changeRoute: vi.fn(async () => true),
    adjustIntensity: vi.fn(async () => true),
    sensors: {
      state: {
        supported: true,
        status: "connected",
        deviceName: "Trainer",
        controlEligible: true,
        controlGranted: false,
        targetPowerSupported: true,
        error: null,
        metrics: {
          heartRateBpm: 148,
          cadenceRpm: 90,
          powerWatts: 250,
          speedKph: 25,
          distanceMeters: 1200,
          calories: 80,
        },
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      requestControl: vi.fn(),
      setTargetPower: vi.fn(),
    },
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.planDetail = null;
  mocks.planList = [];
  mocks.routeList = [];
  mocks.routeGet = null;
  mocks.routeFull = null;
  mocks.routeGetInput = "";
});
describe("recording session UI", () => {
  it("keeps paused controls unavailable while finish is committing the artifact", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      busy: true,
      state: { ...recording.state, reducer: { ...recording.state.reducer, lifecycle: "paused" } },
    };
    render(<RecordSessionPage />);
    for (const name of ["Resume", "Complete / Next", "Previous", "Skip step"]) {
      expect(screen.getByRole("button", { name })).toHaveProperty("disabled", true);
    }
  });
  it("keeps an intensity draft local until an explicit valid Apply", async () => {
    const recording = baseRecording();
    const powerStructure = {
      ...structure,
      activity_category: "bike",
      items: activityPlanStructureSchema.parse(structure).items.map((item) =>
        item.type === "step"
          ? { ...item, targets: [{ type: "%FTP" as const, intensity: 80 }] }
          : {
              ...item,
              steps: item.steps.map((step) => ({
                ...step,
                targets: [{ type: "%FTP" as const, intensity: 80 }],
              })),
            },
      ),
    };
    mocks.recording = {
      ...recording,
      state: {
        ...recording.state,
        reducer: {
          ...recording.state.reducer,
          snapshot: {
            ...snapshot,
            planExecution: {
              ...snapshot.planExecution,
              activityPlanId: "plan-1",
              structure: powerStructure,
            },
          },
        },
      },
    };
    render(<RecordSessionPage />);
    const input = screen.getByRole("spinbutton", { name: "Intensity %" });
    fireEvent.change(input, { target: { value: "9" } });
    expect(input).toHaveProperty("value", "9");
    expect(screen.getByRole("button", { name: "Apply intensity" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(recording.adjustIntensity).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply intensity" }));
    await waitFor(() => expect(recording.adjustIntensity).toHaveBeenCalledWith(0.9));
    expect(screen.getByLabelText(/Live telemetry: Connected/).textContent).toContain("250 W");
    expect(recording.sensors.setTargetPower).not.toHaveBeenCalled();
  });
  it("configures a free direct session after hydration and exposes Start without a launcher", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { reducer: { lifecycle: "pending", snapshot: null }, configuration: null },
    };
    render(<RecordSessionPage />);
    expect(recording.configure).toHaveBeenCalledWith({ activity_category: "run" });
  });
  it("honors a live detachment instead of resurrecting the initial plan or route", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: {
        ...recording.state,
        guidance: {
          version: 1,
          revisions: [
            {
              revision: 1,
              kind: "route",
              timestamp: "2026-09-21T00:00:00.000Z",
              elapsedMs: 1,
              activeMs: 1,
              plan: null,
              routeId: null,
              intensityScale: 1,
            },
          ],
        },
      },
      planStatus: null,
    };
    render(<RecordSessionPage />);
    expect(screen.getByText("No plan guidance attached.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "No route" })).toBeTruthy();
    expect(screen.queryByLabelText("Intensity")).toBeNull();
  });
  it("keeps a failed plan selection actionable and never attaches a stale detail response", async () => {
    const recording = baseRecording();
    recording.changePlan.mockResolvedValue(false);
    mocks.recording = recording;
    mocks.planList = [{ id: "plan-new", name: "New plan", capabilities: { canRecord: true } }];
    mocks.planDetail = {
      detail: {
        id: "plan-old",
        name: "Old plan",
        description: null,
        capabilities: { canRecord: true },
        structure,
        structureHash: "v1:sha256:test",
        activityPlanRevision: 1,
      },
    };
    const view = render(<RecordSessionPage />);
    fireEvent.click(screen.getByRole("button", { name: "New plan" }));
    expect(screen.getByRole("button", { name: "Attach / replace" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Attach / replace" }));
    expect(recording.changePlan).not.toHaveBeenCalled();
    mocks.planDetail = { detail: { ...mocks.planDetail.detail, id: "plan-new", name: "New plan" } };
    view.rerender(<RecordSessionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Attach / replace" }));
    await waitFor(() => expect(recording.changePlan).toHaveBeenCalledOnce());
    expect(
      screen.getByText("The plan was not saved. It remains selected so you can retry."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
  it("keeps live controls out of the finished review", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
      planStatus: null,
      artifact: {
        elapsedMs: 1,
        movingMs: 1,
        snapshot,
        review: {
          name: "Indoor intervals",
          notes: null,
          perceivedEffort: null,
          distanceMeters: 0,
          calories: null,
        },
      },
    };
    render(<RecordSessionPage />);
    expect(screen.queryByRole("heading", { name: "Live guidance" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Review recording" })).toBeTruthy();
  });
  it.each([
    "recording",
    "paused",
  ])("keeps Previous available after the final step while %s", (lifecycle) => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle, snapshot } },
      planStatus: {
        ...recording.planStatus,
        currentOccurrence: null,
        currentOccurrenceIndex: null,
        nextOccurrence: null,
        processedCount: 2,
      },
    };
    render(<RecordSessionPage />);
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous).toHaveProperty("disabled", false);
    fireEvent.click(previous);
    expect(mocks.previousStep).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Complete / Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip step" })).toBeNull();
  });
  it.each([
    ["My unsaved notes", "8", "750", "90"],
    ["", "", "", ""],
  ])("preserves review drafts [%s, %s, %s, %s] across queue refreshes and initializes intentional loads", (...values) => {
    vi.useFakeTimers();
    const recording = baseRecording();
    const artifact = {
      recordingSessionId: "recording-1",
      elapsedMs: 120000,
      movingMs: 100000,
      snapshot,
      review: {
        name: "Indoor intervals",
        notes: "Saved",
        perceivedEffort: 3,
        distanceMeters: 500,
        calories: 20,
      },
    };
    const state = { ...recording.state, reducer: { lifecycle: "finished", snapshot } };
    mocks.recording = { ...recording, state, planStatus: null, artifact };
    const view = render(<RecordSessionPage />);
    const fields = [/^Notes$/, /Perceived effort/, /Manual distance/, /Manual calories/];
    fields.forEach((label, index) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value: values[index] } });
    });
    recording.drainSubmissionQueue.mockImplementation(() => {
      mocks.recording = { ...mocks.recording, artifact: structuredClone(artifact) };
      view.rerender(<RecordSessionPage />);
    });
    act(() => vi.advanceTimersByTime(30000));
    expect(recording.drainSubmissionQueue).toHaveBeenCalledOnce();
    fields.forEach((label, index) => {
      expect(screen.getByLabelText(label)).toHaveProperty("value", values[index]);
    });
    // An intentional restoration replaces the recording state, even for the same artifact ID.
    mocks.recording = { ...mocks.recording, state: structuredClone(state) };
    view.rerender(<RecordSessionPage />);
    const savedValues = ["Saved", "3", "500", "20"];
    fields.forEach((label, index) => {
      expect(screen.getByLabelText(label)).toHaveProperty("value", savedValues[index]);
    });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Another draft" } });
    mocks.recording = {
      ...mocks.recording,
      artifact: {
        ...artifact,
        recordingSessionId: "recording-2",
        review: { ...artifact.review, notes: "New recording" },
      },
    };
    view.rerender(<RecordSessionPage />);
    expect(screen.getByLabelText("Notes")).toHaveProperty("value", "New recording");
  });
  it("refreshes untouched review fields without replacing a dirty field", () => {
    const recording = baseRecording();
    const artifact = {
      recordingSessionId: "recording-1",
      elapsedMs: 120000,
      movingMs: 100000,
      snapshot,
      review: {
        name: "Indoor intervals",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
    };
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
      planStatus: null,
      artifact,
    };
    const view = render(<RecordSessionPage />);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Draft" } });
    mocks.recording = {
      ...mocks.recording,
      artifact: { ...artifact, review: { ...artifact.review, calories: 100 } },
    };
    view.rerender(<RecordSessionPage />);
    expect(screen.getByLabelText("Notes")).toHaveProperty("value", "Draft");
    expect(screen.getByLabelText(/Manual calories/)).toHaveProperty("value", "100");
  });
  it("shows honest live plan metrics and keyboard-usable controls", () => {
    mocks.recording = baseRecording();
    render(<RecordSessionPage />);
    expect(screen.getAllByText("Tempo")).not.toHaveLength(0);
    expect(screen.getByTestId("recording-cockpit-timeline")).toBeTruthy();
    expect(screen.getAllByText("Step 1 of 2")).not.toHaveLength(0);
    expect(screen.getAllByText("5 RPE")).not.toHaveLength(0);
    expect(screen.getByText(/Remaining: 00:00:40/)).toBeTruthy();
    expect(screen.getByLabelText("Live sensor metrics").textContent).toContain("Heart rate");
    expect(document.querySelector("[aria-live]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Complete / Next" }));
    expect(mocks.completeStep).toHaveBeenCalledTimes(1);
  });
  it("keeps the attached route as an honest stored-geometry reference in the cockpit", () => {
    const recording = baseRecording();
    mocks.routeGet = { name: "River loop" };
    mocks.routeFull = {
      coordinates: [
        { latitude: 51.5, longitude: -0.1, altitude: 12 },
        { latitude: 51.51, longitude: -0.11, altitude: 21 },
      ],
      totalDistance: 2400,
      totalAscent: 9,
    };
    mocks.recording = {
      ...recording,
      state: {
        ...recording.state,
        configuration: { ...recording.state.configuration, routeId: "route-1" },
        reducer: {
          ...recording.state.reducer,
          snapshot: { ...snapshot, activity: { ...snapshot.activity, routeId: "route-1" } },
        },
      },
    };
    render(<RecordSessionPage />);
    expect(screen.getByTestId("recording-route-surface").textContent).toContain(
      "Route reference · no live GPS",
    );
    expect(screen.getByLabelText("Route preview").querySelector("polyline")).not.toBeNull();
  });
  it("shows connected sensor metrics and gates trainer commands behind control", () => {
    mocks.recording = baseRecording();
    render(<RecordSessionPage />);
    expect(screen.getByText(/Connected to Trainer/)).toBeTruthy();
    expect(screen.getByLabelText("Live sensor metrics").textContent).toContain("148 bpm");
    fireEvent.click(screen.getByRole("button", { name: "Enable trainer control" }));
    expect(
      (
        mocks.recording as {
          sensors: {
            requestControl: ReturnType<typeof vi.fn>;
          };
        }
      ).sensors.requestControl,
    ).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      "retains fresh measured zeroes",
      "connected",
      { heartRateBpm: 0, cadenceRpm: 0, powerWatts: 0, speedKph: 0 },
      "Connected",
      ["0 bpm", "0 W", "0 rpm", "0 km/h"],
    ],
    [
      "shows dashes while a connected device has not reported metrics",
      "connected",
      { heartRateBpm: null, cadenceRpm: null, powerWatts: null, speedKph: null },
      "Connected",
      ["—"],
    ],
    [
      "shows a stale cleared metric as unavailable without replacing fresh readings",
      "connected",
      { heartRateBpm: 148, cadenceRpm: 90, powerWatts: null, speedKph: 25 },
      "Connected",
      ["148 bpm", "90 rpm", "25 km/h", "—"],
    ],
    [
      "does not retain readings after disconnect",
      "disconnected",
      { heartRateBpm: 148, cadenceRpm: 90, powerWatts: 250, speedKph: 25 },
      "Disconnected",
      ["—"],
    ],
    [
      "shows unavailable instead of invented readings",
      "unavailable",
      { heartRateBpm: 148, cadenceRpm: 90, powerWatts: 250, speedKph: 25 },
      "Bluetooth unavailable",
      ["—"],
    ],
  ])("%s", (_name, status, metrics, expectedStatus, values) => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      sensors: {
        ...recording.sensors,
        state: { ...recording.sensors.state, status, metrics },
      },
    };
    render(<RecordSessionPage />);
    const telemetry = screen.getByLabelText(`Live telemetry: ${expectedStatus}`);
    for (const value of values) expect(telemetry.textContent).toContain(value);
    if (values.includes("—")) expect(telemetry.textContent).not.toContain("250 W");
  });
  it("does not render target-power controls when the connected trainer lacks that FTMS capability", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      sensors: {
        ...recording.sensors,
        state: {
          ...recording.sensors.state,
          controlGranted: true,
          targetPowerSupported: false,
        },
      },
    };
    render(<RecordSessionPage />);
    expect(screen.getByText(/does not advertise FTMS target-power support/)).toBeTruthy();
    expect(screen.queryByLabelText("Target power (W)")).toBeNull();
  });
  it("hides connected trainer control dispatches after recording is finished", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
    };
    render(<RecordSessionPage />);
    expect(screen.queryByRole("button", { name: "Enable trainer control" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set power" })).toBeNull();
    expect(recording.sensors.requestControl).not.toHaveBeenCalled();
    expect(recording.sensors.setTargetPower).not.toHaveBeenCalled();
  });
  it("reviews completed, skipped, and remaining work and marks manual fields honestly", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
      planStatus: null,
      artifact: {
        elapsedMs: 120000,
        movingMs: 100000,
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
  it("uses the primary guidance route for a finished review rather than the final live route", () => {
    const firstRoute = "10000000-0000-4000-8000-000000000010";
    const finalRoute = "10000000-0000-4000-8000-000000000011";
    const recording = baseRecording();
    mocks.routeGet = { name: "First route" };
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
      planStatus: null,
      artifact: {
        elapsedMs: 1,
        movingMs: 1,
        snapshot: { ...snapshot, activity: { ...snapshot.activity, routeId: finalRoute } },
        guidance: {
          version: 1,
          revisions: [
            {
              revision: 0,
              kind: "initial",
              timestamp: "2026-09-21T00:00:00.000Z",
              elapsedMs: 0,
              activeMs: 0,
              plan: null,
              routeId: firstRoute,
              intensityScale: 1,
            },
            {
              revision: 1,
              kind: "route",
              timestamp: "2026-09-21T00:00:01.000Z",
              elapsedMs: 1,
              activeMs: 1,
              plan: null,
              routeId: finalRoute,
              intensityScale: 1,
            },
          ],
        },
        review: {
          name: "Indoor intervals",
          notes: null,
          perceivedEffort: null,
          distanceMeters: 0,
          calories: null,
        },
      },
    };
    render(<RecordSessionPage />);
    expect(mocks.routeGetInput).toBe(firstRoute);
    expect(screen.getByText("First route")).toBeTruthy();
  });
  it("does not invoke save for invalid review measurements and preserves the finalized artifact", () => {
    const recording = baseRecording();
    const artifact = {
      elapsedMs: 120000,
      movingMs: 100000,
      snapshot,
      review: {
        name: "Indoor intervals",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 345,
        calories: null,
      },
    };
    mocks.recording = {
      ...recording,
      state: { ...recording.state, reducer: { lifecycle: "finished", snapshot } },
      planStatus: null,
      artifact,
    };
    render(<RecordSessionPage />);
    fireEvent.change(screen.getByLabelText(/Manual distance/), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
    expect(recording.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("non-negative manual distance");
    expect(artifact.review.distanceMeters).toBe(345);
  });
  it("rejects invalid trainer power and dispatches explicit zero only with supported control", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      sensors: {
        ...recording.sensors,
        state: { ...recording.sensors.state, controlGranted: true },
      },
    };
    render(<RecordSessionPage />);
    const power = screen.getByLabelText("Target power (W)");
    fireEvent.change(power, { target: { value: "NaN" } });
    fireEvent.click(screen.getByRole("button", { name: "Set power" }));
    expect(recording.sensors.setTargetPower).not.toHaveBeenCalled();
    fireEvent.change(power, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Set power" }));
    expect(recording.sensors.setTargetPower).toHaveBeenCalledWith(0);
  });
  it("offers safe five-watt adjustments without dispatching device commands", () => {
    const recording = baseRecording();
    mocks.recording = {
      ...recording,
      sensors: {
        ...recording.sensors,
        state: { ...recording.sensors.state, controlGranted: true },
      },
    };
    render(<RecordSessionPage />);
    const power = screen.getByLabelText("Target power (W)");
    fireEvent.change(power, { target: { value: "153" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase trainer target power" }));
    expect((power as HTMLInputElement).value).toBe("155");
    expect(recording.sensors.setTargetPower).not.toHaveBeenCalled();
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
  it("requires an explicit confirmation before discarding a live recording", () => {
    const recording = baseRecording();
    mocks.recording = recording;
    render(<RecordSessionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    expect(screen.getByText("Discard this recording?")).toBeTruthy();
    expect(recording.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep recording" }));
    expect(screen.queryByText("Discard this recording?")).toBeNull();
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
