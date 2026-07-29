// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  configure: vi.fn(() => true),
  event: undefined as undefined | { activity_plan_id: string | null; activity_plan: unknown },
  eventRefetch: vi.fn(),
  eventQueryState: { isError: false, isLoading: false, isSuccess: true },
  navigate: vi.fn(),
  search: { activity_category: "bike" as const, eventId: "event-direct", gps: "off" as const },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.search,
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    events: {
      getById: {
        useQuery: () => ({
          data: mocks.event,
          refetch: mocks.eventRefetch,
          ...mocks.eventQueryState,
        }),
      },
    },
    routes: { get: { useQuery: () => ({ data: undefined }) } },
  },
}));

vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({
    configure: mocks.configure,
    discardRecoveredDraft: vi.fn(),
    error: null,
    hasRecoveredDraft: false,
    history: [],
    hydrationStatus: "ready",
    resume: vi.fn(),
    state: { reducer: { lifecycle: "idle", snapshot: null } },
  }),
}));

vi.mock("../../../lib/recording/use-browser-recording-adapters", () => ({
  useBrowserRecordingAdapters: () => [],
}));

beforeEach(() => {
  mocks.configure.mockClear();
  mocks.eventRefetch.mockClear();
  mocks.eventQueryState.isError = false;
  mocks.eventQueryState.isLoading = false;
  mocks.eventQueryState.isSuccess = true;
  mocks.navigate.mockClear();
});

afterEach(cleanup);

describe("RecordPage direct event launch", () => {
  it("fail-closes an invalid nested plan and offers change or detach recovery", () => {
    mocks.event = {
      activity_plan_id: "invalid-plan",
      activity_plan: {
        id: "invalid-plan",
        name: "Invalid plan",
        activity_category: null,
        structure: { version: 3, segments: [{ activity_category: "run", role: "activity" }] },
      },
    };
    const RecordPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<RecordPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Selected plan unavailable for recording",
    );
    expect(screen.getByRole("link", { name: "Change or detach plan" }).getAttribute("href")).toBe(
      "/record/plan",
    );
    const start = screen.getByRole("button", { name: "Selected plan unavailable" });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(start);
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("fail-closes a linked plan whose DTO relationship is unavailable", () => {
    mocks.event = { activity_plan_id: "missing-plan", activity_plan: null };
    const RecordPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<RecordPage />);

    expect(screen.getByRole("alert").textContent).toContain("unavailable or invalid plan");
    expect(screen.getByRole("link", { name: "Change or detach plan" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Selected plan unavailable" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it("keeps a transient selected-plan failure retryable without offering detach recovery", () => {
    mocks.event = undefined;
    mocks.eventQueryState.isError = true;
    mocks.eventQueryState.isSuccess = false;
    const RecordPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<RecordPage />);

    expect(screen.getByRole("alert").textContent).toContain("Unable to load the selected plan");
    expect(screen.queryByRole("link", { name: "Change or detach plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.eventRefetch).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "Unable to load selected plan" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("starts a canonical plan using its valid ID and activity_category", () => {
    mocks.event = {
      activity_plan_id: "repeat-run",
      activity_plan: {
        id: "repeat-run",
        name: "Double run",
        activity_category: "run",
        structure: {
          version: 3,
          segments: [{ activity_category: "run" }, { activity_category: "run" }],
        },
      },
    };
    const RecordPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<RecordPage />);

    fireEvent.click(screen.getByRole("button", { name: "Configure timer session" }));
    expect(mocks.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        activityPlanId: "repeat-run",
        activity_category: "run",
        eventId: "event-direct",
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/record/session" });
  });
});
