// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./integrations";

const mocks = vi.hoisted(() => ({
  error: null as Error | null,
  integrations: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../lib/api/client", () => {
  const mutation = {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  };
  return {
    api: {
      useUtils: () => ({
        integrations: {
          getSyncOverview: { invalidate: vi.fn() },
          list: { invalidate: vi.fn() },
        },
      }),
      integrations: {
        disconnect: { useMutation: () => mutation },
        getAuthUrl: { useMutation: () => mutation },
        getSyncOverview: {
          useQuery: () => ({
            data: mocks.integrations,
            error: mocks.error,
            isLoading: false,
            refetch: mocks.refetch,
          }),
        },
        refreshSetupData: { useMutation: () => mutation },
        syncNow: { useMutation: () => mutation },
      },
    },
  };
});

function integration(overrides: Record<string, unknown> = {}) {
  return {
    actions: [],
    activityHistory: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "idle",
    },
    configured: true,
    connected: false,
    integrationId: null,
    label: "Wahoo",
    plannedWorkouts: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "automatic",
    },
    primaryAction: "connect",
    provider: "wahoo",
    providerHealth: { lastError: null, status: "unsupported" },
    setupData: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      status: "idle",
    },
    summary: {
      badge: "Ready",
      health: "unavailable",
      subtitle: "Connect",
      title: "Wahoo",
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.error = null;
  mocks.integrations = [];
  window.history.replaceState(null, "", "/");
});

describe("web integrations journey", () => {
  const IntegrationsPage = (Route as unknown as { component: React.ComponentType }).component;

  it("shows enabled but unconfigured providers without offering connect", () => {
    mocks.integrations = [
      integration({
        configured: false,
        primaryAction: null,
        summary: {
          badge: "Unavailable",
          health: "unavailable",
          subtitle: "Server configuration required",
          title: "Wahoo",
        },
      }),
    ];

    render(<IntegrationsPage />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/not configured on this server/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("keeps cached provider status visible through a retryable network error", () => {
    mocks.integrations = [integration()];
    mocks.error = new Error("network unavailable");

    render(<IntegrationsPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Showing the last known provider status",
    );
    expect(screen.getByText("Wahoo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("offers reconnect but withholds scope- and health-gated sync actions", () => {
    mocks.integrations = [
      integration({
        actions: ["disconnect"],
        connected: true,
        integrationId: "77777777-7777-4777-8777-777777777777",
        primaryAction: "reconnect",
        providerHealth: { lastError: "Authorization expired", status: "needs_reconnect" },
        summary: {
          badge: "Reconnect",
          health: "needs_reconnect",
          subtitle: "Sync paused",
          title: "Wahoo",
        },
      }),
    ];

    render(<IntegrationsPage />);

    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });
});
