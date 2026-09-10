// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTRACT_EPOCH_RECORDING_RECOVERY_KEY } from "../../../lib/contract-epoch";
import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  configure: vi.fn(() => true),
  navigate: vi.fn(),
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
    useSearch: () => ({ activity_category: "bike", gps: "off" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record/plan">{children}</a>,
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    events: { getById: { useQuery: () => ({ data: undefined }) } },
    activityPlans: {
      getById: { useQuery: () => ({ data: undefined, isLoading: false, isError: false }) },
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
