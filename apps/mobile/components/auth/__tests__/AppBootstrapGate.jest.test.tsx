import { waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import React from "react";
import {
  createCompletedOnboardingRecovery,
  ONBOARDING_RECOVERY_VERSION,
  onboardingRecoveryExpiry,
  saveOnboardingRecovery,
} from "@/lib/onboarding/onboarding-recovery";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { AppBootstrapGate } from "../AppBootstrapGate";

const authState = {
  authState: "authenticated-verified",
  onboardingStatus: true,
  isFullyLoaded: true,
  user: { id: "user-1", email: "athlete@example.com" },
  profileLoading: false,
  profileError: null,
  refreshProfile: jest.fn(async () => undefined),
};
let segmentsValue = ["(internal)", "(standard)", "onboarding"];
const secureStoreMock = SecureStore as typeof SecureStore & { __store: Map<string, string> };

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Redirect: ({ href }: { href: unknown }) =>
    React.createElement("Text", { testID: "redirect-target" }, JSON.stringify(href)),
  useSegments: () => segmentsValue,
}));

jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => authState }));
jest.mock("@/lib/server-config", () => ({ useServerConfig: () => ({ initialized: true }) }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { clearSession: () => Promise<void> }) => unknown) =>
    selector({ clearSession: jest.fn(async () => undefined) }),
}));

describe("AppBootstrapGate onboarding recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    secureStoreMock.__store.clear();
    segmentsValue = ["(internal)", "(standard)", "onboarding"];
  });

  it("keeps an onboarded user on onboarding while same-user recovery is pending", async () => {
    await saveOnboardingRecovery({
      version: ONBOARDING_RECOVERY_VERSION,
      userId: "user-1",
      status: "pending",
      expiresAt: onboardingRecoveryExpiry(),
      profileRetry: { experienceLevel: "skip", intents: [] },
      social: { invitationIds: [], groupIds: [], followProfileIds: [], statuses: {} },
      settingsPatch: {},
      lifecycle: {
        required: { status: "saved", retryable: false },
        goal: { status: "skipped", retryable: false },
        settings: { status: "pending", retryable: true },
      },
    });

    renderNative(
      <AppBootstrapGate>
        {React.createElement("Text", null, "Onboarding content")}
      </AppBootstrapGate>,
    );

    await waitFor(() => expect(screen.getByText("Onboarding content")).toBeTruthy());
    expect(screen.queryByTestId("redirect-target")).toBeNull();
  });

  it("redirects an onboarded user without recovery from onboarding to the app", async () => {
    renderNative(
      <AppBootstrapGate>
        {React.createElement("Text", null, "Onboarding content")}
      </AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toContain("(tabs)"),
    );
    expect(screen.queryByText("Onboarding content")).toBeNull();
  });

  it("shows recoverable storage error UI and retries without treating the error as pending", async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("locked"));
    renderNative(
      <AppBootstrapGate>
        {React.createElement("Text", null, "Onboarding content")}
      </AppBootstrapGate>,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-storage-retry")).toBeTruthy());
    expect(screen.queryByText("Onboarding content")).toBeNull();
    fireEvent.press(screen.getByTestId("recovery-storage-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toContain("(tabs)"),
    );
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
  });

  it("lets an onboarded user explicitly continue without unreadable local recovery", async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("locked"));
    renderNative(
      <AppBootstrapGate>
        {React.createElement("Text", null, "Onboarding content")}
      </AppBootstrapGate>,
    );

    await waitFor(() => expect(screen.getByTestId("recovery-storage-continue")).toBeTruthy());
    fireEvent.press(screen.getByTestId("recovery-storage-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toContain("(tabs)"),
    );
  });

  it("treats a completed marker as non-pending and retries its deletion", async () => {
    await saveOnboardingRecovery(createCompletedOnboardingRecovery("user-1"));
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error("locked"));

    renderNative(
      <AppBootstrapGate>
        {React.createElement("Text", null, "Onboarding content")}
      </AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toContain("(tabs)"),
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});
