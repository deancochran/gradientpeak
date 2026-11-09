import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const handleComplete = jest.fn(async () => undefined);
const restartProviderSelection = jest.fn(async () => undefined);
let progress: Record<string, unknown> | undefined;
let progressError: Error | null = null;
let lifecycleStatus: "provider_selection" | "processing" | "review" | "completed" =
  "provider_selection";
let integrationOverview: Array<{ provider: "wahoo"; connected: boolean }> = [];

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  SafeAreaView: createHost("SafeAreaView"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({
    children,
    onPress,
    testID,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => React.createElement("Pressable", { onPress, testID }, children),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppConfirmModal: createHost("AppConfirmModal"),
}));
jest.mock("@/components/onboarding/steps", () => ({
  __esModule: true,
  IdentityStep: () => React.createElement("View", { testID: "identity-form" }),
}));
jest.mock("@/components/onboarding/ProviderSelectionStep", () => ({
  ProviderSelectionStep: () =>
    React.createElement("View", { testID: "provider-selection-controls" }),
}));
jest.mock("@/components/onboarding/ProviderProcessingStep", () => ({
  ProviderProcessingStep: () =>
    React.createElement("View", { testID: "provider-processing-evidence" }),
}));
jest.mock("@/components/onboarding/useProviderConnection", () => ({
  useProviderConnection: () => ({ connect: jest.fn(), pendingProvider: null }),
}));
jest.mock("@/components/onboarding/useOnboardingFlow", () => ({
  __esModule: true,
  useOnboardingFlow: () => ({
    lifecycleStatus,
    integrationOverview,
    integrationOverviewError: null,
    integrationOverviewLoading: false,
    data: {},
    fieldSources: {},
    isBusy: false,
    progress,
    progressError,
    refreshProgress: jest.fn(),
    refreshIntegrationState: jest.fn(),
    retryProviderProcessing: jest.fn(),
    setStatusModal: jest.fn(),
    restartProviderSelection,
    statusModal: null,
    updateData: jest.fn(),
    usernameAvailability: { isChecking: false, isError: false },
    handleComplete,
  }),
}));

const OnboardingScreen = require("../onboarding").default;

describe("simplified onboarding lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lifecycleStatus = "provider_selection";
    integrationOverview = [];
    progress = undefined;
    progressError = null;
  });

  it("shows identity with an optional provider and finishes without starting provider processing", async () => {
    await renderNative(<OnboardingScreen />);
    expect(screen.getByTestId("onboarding-provider-selection")).toBeTruthy();
    expect(screen.getByTestId("provider-selection-controls")).toBeTruthy();
    expect(screen.getByTestId("identity-form")).toBeTruthy();
    expect(screen.getByText("Finish setup")).toBeTruthy();
    expect(screen.queryByText("Training baseline")).toBeNull();
    expect(screen.queryByText("Initial goal")).toBeNull();
    expect(screen.queryByText("Groups and people")).toBeNull();
    await fireEvent.press(screen.getByTestId("onboarding-finish-button"));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it("shows provider selection after restart even if stale processing progress remains cached", async () => {
    lifecycleStatus = "provider_selection";
    progress = {
      status: "processing",
      phase: "recovery_required",
      percent: 50,
      message: "Cached processing progress",
      detail: null,
      provider_summary: [],
      recovery: null,
    };
    await renderNative(<OnboardingScreen />);
    expect(screen.getByTestId("onboarding-provider-selection")).toBeTruthy();
    expect(screen.queryByTestId("provider-processing-evidence")).toBeNull();
  });

  it("renders processing progress without any editable onboarding form", async () => {
    lifecycleStatus = "processing";
    progress = {
      status: "processing",
      phase: "importing_activities",
      percent: 50,
      message: "Importing your activity history.",
      detail: null,
      provider_summary: [],
      recovery: null,
    };
    await renderNative(<OnboardingScreen />);
    expect(screen.getByTestId("onboarding-processing")).toBeTruthy();
    expect(screen.getByTestId("provider-processing-evidence")).toBeTruthy();
    expect(screen.queryByTestId("provider-selection-controls")).toBeNull();
    expect(screen.queryByTestId("identity-form")).toBeNull();
    expect(screen.queryByTestId("onboarding-finish-button")).toBeNull();
  });

  it("retains processing progress while showing a recoverable transient error", async () => {
    lifecycleStatus = "processing";
    progress = {
      status: "processing",
      phase: "importing_activities",
      percent: 50,
      message: "Importing your activity history.",
      detail: null,
      provider_summary: [],
      recovery: null,
    };
    progressError = new Error("temporary");
    await renderNative(<OnboardingScreen />);
    expect(screen.getByTestId("provider-processing-evidence")).toBeTruthy();
    expect(screen.getByText("Retry progress")).toBeTruthy();
  });

  it("shows an initial processing status instead of a blank screen", async () => {
    lifecycleStatus = "processing";
    await renderNative(<OnboardingScreen />);
    expect(screen.getByText("Loading preparation progress")).toBeTruthy();
  });

  it("renders only identity in review and finalizes with one action", async () => {
    lifecycleStatus = "review";
    await renderNative(<OnboardingScreen />);
    expect(screen.getByTestId("onboarding-identity")).toBeTruthy();
    expect(screen.getByTestId("identity-form")).toBeTruthy();
    expect(screen.queryByTestId("baseline-form")).toBeNull();
    expect(screen.queryByTestId("goal-form")).toBeNull();
    expect(screen.queryByTestId("social-form")).toBeNull();
    expect(screen.queryByTestId("provider-selection-controls")).toBeNull();
    expect(screen.queryByTestId("provider-processing-evidence")).toBeNull();
    await fireEvent.press(screen.getByTestId("onboarding-finish-button"));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it("renders nothing once AppBootstrapGate owns completed navigation", async () => {
    lifecycleStatus = "completed";
    const rendered = await renderNative(<OnboardingScreen />);
    expect(rendered.toJSON()).toBeNull();
  });
});
