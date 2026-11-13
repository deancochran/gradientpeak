import React from "react";
import { createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const authState = {
  completeOnboarding: jest.fn(async () => undefined),
  isAuthenticated: true,
  isFullyLoaded: true,
  onboardingStatus: "provider_selection" as const,
  refreshOnboardingStatus: jest.fn(async () => undefined),
  user: { id: "account-a" as string },
};
const profileQuery = {
  data: undefined as { full_name: string | null; id: string; username: string | null } | undefined,
};
const completeMutation = { isPending: false, mutateAsync: jest.fn() };

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
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({
    children,
    onPress,
    testID,
    ...props
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
    disabled?: boolean;
    accessibilityState?: object;
  }) => React.createElement("Pressable", { onPress, testID, ...props }, children),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));
jest.mock("@/components/athlete-baseline", () => ({ AthleteBaselineFields: () => null }));
jest.mock("@/components/goals", () => ({ GoalEditorForm: () => null }));
jest.mock("@/components/onboarding/ProviderProcessingStep", () => ({
  ProviderProcessingStep: () => null,
}));
jest.mock("@/components/onboarding/ProviderSelectionStep", () => ({
  ProviderSelectionStep: () => null,
}));
jest.mock("@/components/onboarding/useProviderConnection", () => ({
  useProviderConnection: () => ({ connect: jest.fn(), pendingProvider: null }),
}));
jest.mock("@/components/shared/AppFormModal", () => ({ AppConfirmModal: () => null }));
jest.mock("@/lib/auth/auth-headers", () => ({ hasSessionAuthCredentials: () => true }));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => authState }));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    integrations: {
      cancelPendingOAuth: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      getSyncOverview: {
        useQuery: () => ({ data: [], error: null, isLoading: false, refetch: jest.fn() }),
      },
    },
    onboarding: {
      checkUsernameAvailability: {
        useQuery: () => ({ data: undefined, isError: false, isFetching: false }),
      },
      completeLifecycleSetup: { useMutation: () => completeMutation },
      getProgress: { useQuery: () => ({ data: undefined, error: null, refetch: jest.fn() }) },
      restartProviderSelection: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
      retryProviderProcessing: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
    },
    profiles: { get: { useQuery: () => profileQuery } },
    useUtils: () => ({ profiles: { get: { invalidate: jest.fn() } } }),
  },
}));

const OnboardingScreen = require("../onboarding").default;

describe("OnboardingScreen account ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.user = { id: "account-a" };
    profileQuery.data = undefined;
    completeMutation.mutateAsync.mockReset();
  });

  it("keeps a dirty identity for the same account and clears it when the parent receives a new account", async () => {
    const rendered = await renderNative(<OnboardingScreen />);
    const fullName = screen.getByTestId("onboarding-full-name-input");
    await fireEvent.changeText(fullName, "Draft A");
    await waitFor(() => expect(screen.getByDisplayValue("Draft A")).toBeTruthy());

    await rendered.rerender(<OnboardingScreen />);
    expect(screen.getByDisplayValue("Draft A")).toBeTruthy();

    authState.user = { id: "account-b" };
    await rendered.rerender(<OnboardingScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-full-name-input").props.value).toBe(""),
    );
    expect(screen.getByTestId("onboarding-username-input").props.value).toBe("");
    expect(screen.queryByDisplayValue("Draft A")).toBeNull();
  });

  it("shows single-flight completion busy state and restores the action after rejection", async () => {
    let reject!: (reason: Error) => void;
    completeMutation.mutateAsync.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    await renderNative(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Test Athlete");
    await fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "test_athlete");
    const finish = screen.getByTestId("onboarding-finish-button");
    await act(() => {
      finish.props.onPress();
      finish.props.onPress();
    });
    expect(completeMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("onboarding-finish-button").props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(screen.getByText("Finishing setup...")).toBeTruthy();
    await act(async () => {
      reject(new Error("offline"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-finish-button").props.disabled).toBe(false),
    );
    expect(screen.getByDisplayValue("Test Athlete")).toBeTruthy();
  });
});
