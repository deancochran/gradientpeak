// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "./app-providers";

const mocks = vi.hoisted(() => ({
  ensureCurrentBrowserContractEpoch: vi.fn(() => new Promise<boolean>(() => undefined)),
}));

vi.mock("@posthog/react", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../lib/api/client", () => ({
  api: { Provider: ({ children }: { children: React.ReactNode }) => children },
  createApiClient: () => ({}),
  getQueryClient: () => ({}),
}));

vi.mock("../../lib/contract-epoch", () => ({
  ensureCurrentBrowserContractEpoch: mocks.ensureCurrentBrowserContractEpoch,
}));

vi.mock("../../lib/telemetry", () => ({
  posthogOptions: {},
  posthogProjectToken: undefined,
}));

vi.mock("./auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(cleanup);

describe("AppProviders", () => {
  it("renders normal pages immediately without preparing recording storage", () => {
    render(
      <AppProviders>
        <div>Normal page content</div>
      </AppProviders>,
    );

    expect(screen.getByText("Normal page content")).toBeTruthy();
    expect(screen.queryByText("Preparing GradientPeak")).toBeNull();
    expect(mocks.ensureCurrentBrowserContractEpoch).not.toHaveBeenCalled();
  });
});
