// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  location: { pathname: "/plan" },
  recording: {
    hydrationStatus: "hydrating" as "hydrating" | "ready",
    state: { reducer: { lifecycle: "pending" } },
  },
  storage: { state: "ready" as "checking" | "ready" | "blocked", retry: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useRouteContext: () => ({ authUserId: "user-1" }),
  }),
  Outlet: () => {
    const [count, setCount] = useState(0);
    return (
      <div>
        Protected page content
        <button onClick={() => setCount((current) => current + 1)} type="button">
          Page count: {count}
        </button>
      </div>
    );
  },
  redirect: vi.fn(),
  useLocation: () => mocks.location,
}));

vi.mock("../components/protected/protected-header", () => ({
  ProtectedHeader: () => <header>Protected header</header>,
}));
vi.mock("../components/providers/recording-storage-boundary", () => ({
  RecordingStorageBoundary: ({ children }: { children: React.ReactNode }) => children,
  useRecordingStorageReadiness: () => mocks.storage,
}));
vi.mock("../lib/auth/route-guards", () => ({
  authSessionMiddleware: vi.fn(),
  getProtectedAccessRedirect: vi.fn(),
  resolveRouteAuthSession: vi.fn(),
  resolveRouteProfileState: vi.fn(),
}));
vi.mock("../lib/recording/provider", () => ({
  TimerOnlyRecordingProvider: ({ children }: { children: React.ReactNode }) => children,
  useTimerOnlyRecording: () => mocks.recording,
}));

import { ProtectedRecordingShell } from "./_protected";

afterEach(() => cleanup());

describe("ProtectedRecordingShell", () => {
  it("keeps ordinary protected pages visible during recording recovery", () => {
    mocks.storage.state = "checking";
    mocks.recording.hydrationStatus = "hydrating";
    mocks.recording.state.reducer.lifecycle = "pending";

    render(<ProtectedRecordingShell />);

    expect(screen.getByText("Protected header")).toBeTruthy();
    expect(screen.getByText("Protected page content")).toBeTruthy();
    expect(screen.queryByText("Checking for a saved recording…")).toBeNull();
  });

  it("blocks recorder pages during recording recovery", () => {
    mocks.storage.state = "ready";
    mocks.recording.hydrationStatus = "hydrating";
    mocks.recording.state.reducer.lifecycle = "pending";
    mocks.location.pathname = "/record/session";

    render(<ProtectedRecordingShell />);

    expect(screen.getByText("Checking for a saved recording…")).toBeTruthy();
    expect(screen.queryByText("Protected page content")).toBeNull();
  });

  it("does not expose another protected page while redirecting to an active recorder", () => {
    mocks.storage.state = "ready";
    mocks.recording.hydrationStatus = "ready";
    mocks.recording.state.reducer.lifecycle = "paused";
    mocks.location.pathname = "/plan";

    render(<ProtectedRecordingShell />);

    expect(screen.getByText("Returning to your active recording…")).toBeTruthy();
    expect(screen.queryByText("Protected header")).toBeNull();
    expect(screen.queryByText("Protected page content")).toBeNull();
  });

  it("keeps the ordinary protected shell when there is no active recording", () => {
    mocks.storage.state = "ready";
    mocks.recording.hydrationStatus = "ready";
    mocks.recording.state.reducer.lifecycle = "pending";

    render(<ProtectedRecordingShell />);

    expect(screen.getByText("Protected header")).toBeTruthy();
    expect(screen.getByText("Protected page content")).toBeTruthy();
  });

  it("blocks recorder pages until contract storage is ready", () => {
    mocks.recording.hydrationStatus = "hydrating";
    mocks.recording.state.reducer.lifecycle = "pending";
    mocks.location.pathname = "/record/session";
    mocks.storage.state = "blocked";

    render(<ProtectedRecordingShell />);

    expect(screen.getByText("Recorder storage is blocked.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText("Protected page content")).toBeNull();
  });

  it("keeps normal route state through storage readiness", () => {
    mocks.recording.hydrationStatus = "hydrating";
    mocks.recording.state.reducer.lifecycle = "pending";
    mocks.location.pathname = "/plan";
    mocks.storage.state = "checking";
    const rendered = render(<ProtectedRecordingShell />);

    fireEvent.click(screen.getByRole("button", { name: "Page count: 0" }));
    expect(screen.getByRole("button", { name: "Page count: 1" })).toBeTruthy();

    mocks.storage.state = "ready";
    rendered.rerender(<ProtectedRecordingShell />);

    expect(screen.getByRole("button", { name: "Page count: 1" })).toBeTruthy();
  });
});
