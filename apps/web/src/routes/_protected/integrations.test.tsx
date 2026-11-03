// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./integrations";

const mocks = vi.hoisted(() => ({
  error: null as Error | null,
  integrations: [] as Array<Record<string, unknown>>,
  navigate: vi.fn(),
  publishedState: {
    publishedState: { publishedAt: "2026-08-01T12:00:00.000Z" },
    status: { rebuildStatus: "fresh", importStatus: "complete" },
  } as Record<string, unknown>,
  refetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
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
      profiles: {
        get: { useQuery: () => ({ data: { id: "11111111-1111-4111-8111-111111111111" } }) },
      },
      athleteIntelligence: {
        getReadModel: { useQuery: () => ({ data: mocks.publishedState }) },
      },
    },
  };
});

function integration(overrides: Record<string, unknown> = {}) {
  return {
    actions: [],
    activityHistory: {
      importRun: null,
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "idle",
    },
    athleteState: { revision: null, status: "unavailable" },
    configured: true,
    connected: false,
    integrationId: null,
    label: "Wahoo",
    plannedActivities: {
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
      profile: { dob: null, gender: null, onboarding_status: "provider_selection" },
      sources: {},
      status: "idle",
      values: {},
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
  mocks.publishedState = {
    publishedAt: "2026-08-01T12:00:00.000Z",
    rebuildStatus: "fresh",
    importStatus: "complete",
  };
  mocks.navigate.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("web integrations journey", () => {
  const IntegrationsPage = (Route as unknown as { component: React.ComponentType }).component;

  it("offers retry for a pending Garmin disconnect without offering reconnect", () => {
    mocks.integrations = [
      integration({
        provider: "garmin",
        label: "Garmin Connect",
        actions: ["disconnect"],
        connected: false,
        primaryAction: "disconnect",
        providerHealth: { lastError: null, status: "disconnecting" },
      }),
    ];
    render(<IntegrationsPage />);
    expect(screen.getByRole("button", { name: "Retry disconnect" }).hasAttribute("disabled")).toBe(
      false,
    );
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull();
  });

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

  it("shows allowlisted OAuth recovery copy and removes callback details", () => {
    window.history.replaceState(
      null,
      "",
      "/integrations?integration=failed&provider=wahoo&error=wahoo_token_limit_exceeded&error_message=untrusted+provider+detail",
    );

    render(<IntegrationsPage />);

    expect(mocks.toastError).toHaveBeenCalledWith(
      "This Wahoo account has too many active authorizations. Remove an older authorization in Wahoo, then try again.",
    );
    expect(window.location.search).toBe("");
  });

  it("does not render a valid empty state when loading integrations failed", () => {
    mocks.error = new Error("network unavailable");

    render(<IntegrationsPage />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No integrations available")).toBeNull();
  });

  it("shows truthful incomplete history and opens the exact imported batch", () => {
    const importRunId = "77777777-7777-4777-8777-777777777777";
    mocks.integrations = [
      integration({
        activityHistory: {
          importRun: {
            id: importRunId,
            status: "failed",
            importedCount: 12,
            skippedCount: 1,
            failedCount: 1,
          },
          lastError: "Activity history sync failed",
          lastFailedAt: "2026-08-01T12:00:00.000Z",
          lastSucceededAt: null,
          queuedJobId: null,
          status: "failed",
        },
        athleteState: { revision: 4, status: "failed_incomplete" },
      }),
    ];
    mocks.publishedState = {
      publishedState: { publishedAt: "2026-08-01T12:00:00.000Z" },
      status: { rebuildStatus: "failed", importStatus: "failed" },
    };

    render(<IntegrationsPage />);
    expect(screen.getByText("History incomplete after failed import")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View imported activities" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/activities",
      search: { importRunId },
    });
  });

  it.each([
    ["pending", "Activities imported; state pending"],
    ["rebuilding", "State rebuilding"],
    ["current", "State current"],
    ["failed_incomplete", "History incomplete after failed import"],
  ])("renders truthful athlete-state status %s", (status, expected) => {
    mocks.integrations = [integration({ athleteState: { revision: 4, status } })];
    mocks.publishedState = {
      publishedState: { publishedAt: "2026-08-01T12:00:00.000Z" },
      status: {
        rebuildStatus: status === "current" ? "fresh" : status,
        importStatus: status === "failed_incomplete" ? "failed" : "complete",
      },
    };
    render(<IntegrationsPage />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("labels an active history run as activities importing", () => {
    mocks.integrations = [
      integration({
        activityHistory: {
          importRun: null,
          lastError: null,
          lastFailedAt: null,
          lastSucceededAt: null,
          queuedJobId: "77777777-7777-4777-8777-777777777777",
          status: "importing",
        },
      }),
    ];
    render(<IntegrationsPage />);
    expect(screen.getByText("Activities importing")).toBeTruthy();
  });
});
