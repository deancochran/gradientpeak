// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ProviderCatalogItem,
  ProviderProcessingState,
  ProviderProcessingStep,
  ProviderSelectionStep,
} from "./provider-onboarding";

type FixtureProvider = "alpha" | "beta";

function catalog(
  provider: FixtureProvider,
  connected: boolean,
): ProviderCatalogItem<FixtureProvider> {
  return {
    provider,
    label: provider === "alpha" ? "Alpha" : "Beta",
    configured: true,
    connected,
    primaryAction: connected ? "disconnect" : "connect",
    providerHealth: { status: connected ? "connected" : "disconnected", lastError: null },
    onboarding: {
      summary: `Import useful training evidence from ${provider}.`,
      evidence: { activityHistory: true, profileDetails: true },
    },
    activityHistory: { status: connected ? "synced" : "idle", importRun: null },
  };
}

afterEach(cleanup);

describe("provider onboarding compositions", () => {
  it("renders a multiple-provider selection fixture without provider-specific composition", () => {
    const onConnect = vi.fn();
    render(
      <ProviderSelectionStep
        integrations={[catalog("alpha", true), catalog("beta", false)]}
        isBusy={false}
        onConnect={onConnect}
      />,
    );
    expect(screen.getByRole("heading", { name: "Connect your accounts" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Connect your accounts" }).tagName).toBe("H2");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText(/imported ·/i)).toBeNull();
    expect(screen.getAllByText(/Can import activity history/)).toHaveLength(2);
    expect(screen.getAllByText(/Can use profile details/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledWith("beta");
  });

  it("keeps processing evidence separate from selection controls", () => {
    render(
      <ProviderProcessingStep
        isBusy={false}
        onRecovery={vi.fn()}
        progress={{
          status: "processing",
          phase: "importing_activities",
          percent: 50,
          message: "Importing your activity history.",
          detail: "8 activities imported so far · 2 skipped.",
          provider_summary: [{ provider: "wahoo", label: "Wahoo", state: "working" }],
          recovery: null,
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Preparing your starting point" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preparing your starting point" }).tagName).toBe(
      "H2",
    );
    expect(screen.getByText("Importing your activity history.")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(screen.queryByText("Activities")).toBeNull();
    expect(screen.queryByText("Baseline")).toBeNull();
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull();
  });

  it("keeps aggregate progress visible independently of a route-level transient error", () => {
    render(
      <ProviderProcessingStep
        isBusy={false}
        onRecovery={vi.fn()}
        progress={{
          status: "processing",
          phase: "building_targets",
          percent: 75,
          message: "Finalizing your starting point.",
          detail: "8 activities imported.",
          provider_summary: [{ provider: "wahoo", label: "Wahoo", state: "complete" }],
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("Finalizing your starting point.")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("renders an initial processing status instead of a blank surface", () => {
    render(
      <ProviderProcessingState
        error={null}
        isBusy={false}
        onRecovery={vi.fn()}
        onRetryProgress={vi.fn()}
        progress={null}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/Loading preparation progress/);
  });

  it("retains aggregate progress with a visible transient error and retry", () => {
    const onRetryProgress = vi.fn();
    render(
      <ProviderProcessingState
        error="Preparation progress could not be refreshed."
        isBusy={false}
        onRecovery={vi.fn()}
        onRetryProgress={onRetryProgress}
        progress={{
          status: "processing",
          phase: "importing_activities",
          percent: 50,
          message: "Importing your activity history.",
          detail: null,
          provider_summary: [],
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("50%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry progress" }));
    expect(onRetryProgress).toHaveBeenCalledOnce();
  });

  it("renders an overview error with retry instead of the valid empty state", () => {
    const onRetry = vi.fn();
    render(
      <ProviderSelectionStep
        error="Available training accounts could not be loaded. Try again."
        integrations={[]}
        isBusy={false}
        onConnect={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/could not be loaded/i);
    expect(screen.queryByText(/No training account providers/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading accounts" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps valid empty catalog optional", () => {
    render(<ProviderSelectionStep integrations={[]} isBusy={false} onConnect={vi.fn()} />);
    expect(screen.getByText(/No training account providers are available/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
