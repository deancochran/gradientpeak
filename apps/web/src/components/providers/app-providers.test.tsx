// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../lib/api/client";

import { AppProviders } from "./app-providers";

const mocks = vi.hoisted(() => ({
  ensureCurrentBrowserContractEpoch: vi.fn(() => new Promise<boolean>(() => undefined)),
  invalidateProfileIdentityQueries: vi.fn(),
  posthogOptions: undefined as { loaded?: (client: unknown) => void } | undefined,
  telemetryLoaded: vi.fn(),
}));

vi.mock("@posthog/react", () => ({
  PostHogProvider: ({
    children,
    options,
  }: {
    children: React.ReactNode;
    options?: { loaded?: (client: unknown) => void };
  }) => {
    mocks.posthogOptions = options;
    return children;
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@repo/api/profile-identity-cache", () => ({
  invalidateProfileIdentityQueries: mocks.invalidateProfileIdentityQueries,
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    useUtils: () => ({}),
  },
  createApiClient: () => ({}),
  getQueryClient: () => ({}),
}));

vi.mock("../../lib/contract-epoch", () => ({
  ensureCurrentBrowserContractEpoch: mocks.ensureCurrentBrowserContractEpoch,
}));

vi.mock("../../lib/telemetry", () => ({
  posthogOptions: { loaded: mocks.telemetryLoaded },
  posthogProjectToken: "test-project-token",
}));

vi.mock("./auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(cleanup);

describe("AppProviders", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    mocks.posthogOptions = undefined;
    mocks.telemetryLoaded.mockReset();
  });

  it("renders normal pages immediately without preparing recording storage", () => {
    render(
      <AppProviders queryClient={new QueryClient()} apiClient={createApiClient()}>
        <div>Normal page content</div>
      </AppProviders>,
    );

    expect(screen.getByText("Normal page content")).toBeTruthy();
    expect(screen.queryByText("Preparing GradientPeak")).toBeNull();
    expect(mocks.ensureCurrentBrowserContractEpoch).not.toHaveBeenCalled();
  });

  it("refreshes profile-derived queries when the browser regains focus", () => {
    render(
      <AppProviders queryClient={new QueryClient()} apiClient={createApiClient()}>
        <div>Normal page content</div>
      </AppProviders>,
    );

    window.dispatchEvent(new Event("focus"));

    expect(mocks.invalidateProfileIdentityQueries).toHaveBeenCalledTimes(1);
  });

  it("reconciles explicit consent before the configured SDK captures initialization", () => {
    const operations: string[] = [];
    const posthog = {
      opt_in_capturing: vi.fn(() => operations.push("opt-in")),
      opt_out_capturing: vi.fn(() => operations.push("opt-out")),
    };
    mocks.telemetryLoaded.mockImplementation(() => operations.push("telemetry-loaded"));
    localStorage.setItem("gradientpeak-product-analytics-consent", "granted");

    render(
      <AppProviders queryClient={new QueryClient()} apiClient={createApiClient()}>
        <div>Normal page content</div>
      </AppProviders>,
    );

    mocks.posthogOptions?.loaded?.(posthog);

    expect(operations).toEqual(["opt-in", "telemetry-loaded"]);
    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
  });

  it("keeps missing consent opted out after the configured SDK initializes", () => {
    const posthog = {
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };

    render(
      <AppProviders queryClient={new QueryClient()} apiClient={createApiClient()}>
        <div>Normal page content</div>
      </AppProviders>,
    );

    mocks.posthogOptions?.loaded?.(posthog);

    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
  });
});
