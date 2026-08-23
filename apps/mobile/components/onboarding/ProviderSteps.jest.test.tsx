import { createHost, createPressableHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { ProviderProcessingStep } from "./ProviderProcessingStep";
import { ProviderSelectionStep } from "./ProviderSelectionStep";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createPressableHost() }));
jest.mock("@repo/ui/components/progress", () => ({
  ProgressBar: ({ accessibilityLabel, value }: { accessibilityLabel: string; value: number }) =>
    createHost("ProgressBar")({
      accessibilityLabel,
      accessibilityRole: "progressbar",
      accessibilityValue: { min: 0, max: 100, now: value },
    }),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));

type Provider = "alpha" | "beta";

function overview(provider: Provider, connected: boolean) {
  return {
    provider,
    label: provider === "alpha" ? "Alpha" : "Beta",
    configured: true,
    connected,
    primaryAction: connected ? "disconnect" : "connect",
    providerHealth: { status: connected ? "connected" : "disconnected", lastError: null },
    onboarding: {
      summary: `Import useful evidence from ${provider}.`,
      evidence: { activityHistory: true, profileDetails: true },
    },
  } as const;
}

describe("mobile provider onboarding steps", () => {
  it("renders and dispatches a generic multiple-provider selection fixture", async () => {
    const onConnect = jest.fn();
    await renderNative(
      <ProviderSelectionStep
        integrations={[overview("alpha", true), overview("beta", false)]}
        onConnect={onConnect}
      />,
    );
    expect(screen.getByText("Connect your accounts")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText(/imported ·/i)).toBeNull();
    await fireEvent.press(screen.getByLabelText("Connect Beta"));
    expect(onConnect).toHaveBeenCalledWith("beta");
  });

  it("shows aggregate processing progress without the deprecated stage matrix", async () => {
    await renderNative(
      <ProviderProcessingStep
        isBusy={false}
        onRecovery={jest.fn()}
        progress={{
          status: "processing",
          phase: "importing_activities",
          percent: 50,
          message: "Importing your activity history.",
          detail: "4 activities imported so far · 1 skipped.",
          provider_summary: [{ provider: "wahoo", label: "Wahoo", state: "working" }],
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("Preparing your starting point")).toBeTruthy();
    expect(screen.getByText("Importing your activity history.")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(
      screen.getByLabelText("Onboarding preparation progress").props.accessibilityValue.now,
    ).toBe(50);
    expect(screen.queryByText("Activities")).toBeNull();
    expect(screen.queryByText("Baseline")).toBeNull();
    expect(screen.queryByLabelText(/Connect /)).toBeNull();
    expect(
      screen.getByText(
        "Importing your activity history. 50% 4 activities imported so far · 1 skipped.",
      ).props.accessibilityLiveRegion,
    ).toBe("polite");
  });

  it("dispatches the exact aggregate recovery action", async () => {
    const onRecovery = jest.fn();
    await renderNative(
      <ProviderProcessingStep
        isBusy={false}
        onRecovery={onRecovery}
        progress={{
          status: "processing",
          phase: "recovery_required",
          percent: 25,
          message: "Wahoo needs attention before setup can continue.",
          detail: null,
          provider_summary: [{ provider: "wahoo", label: "Wahoo", state: "needs_attention" }],
          recovery: {
            provider: "wahoo",
            label: "Wahoo",
            action: "restart_selection",
            message: "Return to account selection to reconnect or choose another account.",
          },
        }}
      />,
    );
    await fireEvent.press(screen.getByText("Return to account selection"));
    const recoveryAlert = screen.getByLabelText(
      "Return to account selection to reconnect or choose another account.",
    );
    expect(recoveryAlert.props.accessibilityRole).toBe("alert");
    expect(recoveryAlert.props.accessibilityLiveRegion).toBe("assertive");
    expect(onRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ action: "restart_selection" }),
    );
  });
});
