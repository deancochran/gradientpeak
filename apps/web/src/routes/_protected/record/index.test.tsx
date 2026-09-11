// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTRACT_EPOCH_RECORDING_RECOVERY_KEY } from "../../../lib/contract-epoch";
import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  configure: vi.fn(() => true),
  navigate: vi.fn(),
  event: undefined as unknown,
  plan: undefined as unknown,
  planInputs: [] as unknown[],
  planOptions: [] as unknown[],
  search: { activity_category: "bike", gps: "off" } as Record<string, unknown>,
  recording: {
    artifact: null as null | {
      recordingSessionId: string;
      snapshot: { activity: { routeId?: string } };
    },
    error: null,
    hydrationStatus: "ready" as const,
    hasRecoveredDraft: false,
    canTakeOver: false,
    state: { reducer: { lifecycle: "pending", snapshot: null } },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.search,
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record/plan">{children}</a>,
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    events: {
      getById: {
        useQuery: () => ({ data: mocks.event, isLoading: false, isError: false }),
      },
    },
    activityPlans: {
      getById: {
        useQuery: (input: unknown, options: unknown) => {
          mocks.planInputs.push(input);
          mocks.planOptions.push(options);
          return { data: mocks.plan, isLoading: false, isError: false };
        },
      },
    },
    routes: {
      get: { useQuery: () => ({ data: undefined }) },
      list: { useQuery: () => ({ data: { items: [] }, isLoading: false, isError: false }) },
    },
    athleteIntelligence: {
      getReadModel: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
  },
}));

vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({ ...mocks.recording, configure: mocks.configure }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  mocks.recording.artifact = null;
  mocks.event = undefined;
  mocks.plan = undefined;
  mocks.planInputs = [];
  mocks.planOptions = [];
  mocks.search = { activity_category: "bike", gps: "off" };
});

describe("RecordPage", () => {
  it("offers the indoor recorder, plan selection, and honest unsupported capability copy", () => {
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    expect(screen.getByText("Indoor recording")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Choose plan" })).toBeTruthy();
    expect(screen.getByText(/not GPS/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open recorder" }));
    expect(mocks.configure).toHaveBeenCalledWith({ activity_category: "bike" });
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/record/session" });
  });

  it("returns to a finalized recording review without replacing it with a new session", () => {
    mocks.recording.artifact = {
      recordingSessionId: "recording-1",
      snapshot: { activity: {} },
    };
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "Return to recorder" }));

    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/record/session" });
  });

  it("requests the selected variant and gives recording only its resolved V3 structure", () => {
    const activityPlanId = "11111111-1111-4111-8111-111111111111";
    const variantId = "22222222-2222-4222-8222-222222222222";
    const structure = {
      version: 3,
      activity_category: "bike",
      segments: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          role: "activity",
          name: "Ride",
          intervals: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              name: "Work",
              repetitions: 1,
              steps: [
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  name: "Tempo",
                  duration: { type: "time", seconds: 300 },
                  targets: [{ type: "RPE", intensity: 6 }],
                },
              ],
            },
          ],
        },
      ],
    };
    mocks.search = { activity_category: "bike", gps: "off", activityPlanId, variantId };
    mocks.plan = {
      detail: {
        id: activityPlanId,
        name: "Build ride",
        description: null,
        activityCategory: "bike",
        activityPlanRevision: 3,
        structure,
        structureHash: `v1:sha256:${"a".repeat(64)}`,
        capabilities: { canRecord: true },
      },
    };
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "Open recorder" }));

    expect(mocks.planInputs).toContainEqual({ id: activityPlanId, personalize: false, variantId });
    expect(mocks.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        activityPlanId,
        plan: expect.objectContaining({ structure }),
      }),
    );
  });

  it("records a scheduled event from its immutable prescription instead of reloading the current plan", () => {
    const activityPlanId = "11111111-1111-4111-8111-111111111111";
    const eventId = "22222222-2222-4222-8222-222222222222";
    const variantId = "33333333-3333-4333-8333-333333333333";
    const structure = {
      version: 3,
      activity_category: "run",
      segments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          role: "activity",
          name: "Run",
          intervals: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              name: "Work",
              repetitions: 1,
              steps: [
                {
                  id: "66666666-6666-4666-8666-666666666666",
                  name: "Threshold",
                  duration: { type: "time", seconds: 600 },
                  targets: [{ type: "RPE", intensity: 8 }],
                },
              ],
            },
          ],
        },
      ],
    };
    mocks.search = { activity_category: "bike", gps: "off", eventId };
    mocks.event = {
      id: eventId,
      title: "Pinned threshold run",
      description: null,
      planned_session: {
        prescription: {
          activityPlanId,
          activityPlanRevision: 7,
          variantId,
          variantName: "Threshold",
          structure,
          structureHash: `v1:sha256:${"b".repeat(64)}`,
        },
      },
      activityPlanSummary: null,
    };

    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open recorder" }));

    expect(mocks.planOptions).toContainEqual(expect.objectContaining({ enabled: false }));
    expect(mocks.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_category: "run",
        eventId,
        plan: expect.objectContaining({
          activityPlanId,
          activityPlanRevision: 7,
          structure,
          structureHash: `v1:sha256:${"b".repeat(64)}`,
        }),
      }),
    );
  });

  it("surfaces preserved prior-epoch recorder data without opening or deleting it", () => {
    localStorage.setItem(
      CONTRACT_EPOCH_RECORDING_RECOVERY_KEY,
      JSON.stringify({
        previousEpoch: "0",
        detection: "detected",
        detectedDatabaseNames: ["gradientpeak-web-recording-epoch-0"],
      }),
    );
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    expect(screen.getByRole("alert").textContent).toContain("Older recorder data was preserved");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(localStorage.getItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY)).toBeNull();
  });
});
