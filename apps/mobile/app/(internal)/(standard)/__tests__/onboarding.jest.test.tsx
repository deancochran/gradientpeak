import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const completeOnboardingMock = jest.fn(async () => undefined);
const completeOnboardingMutationMock = jest.fn(async () => ({ ok: true }));

const ButtonHost = ({ children, disabled, onPress, ...props }: any) =>
  React.createElement(
    "Pressable",
    {
      onPress: disabled ? undefined : onPress,
      testID: props.testID ?? props.testId,
      disabled,
      ...props,
    },
    children,
  );

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  SafeAreaView: createHost("SafeAreaView"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { replace: replaceMock },
}));

jest.mock("expo-web-browser", () => ({
  __esModule: true,
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ completeOnboarding: completeOnboardingMock }),
}));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    profiles: {
      get: {
        useQuery: () => ({ data: { id: "profile-1" } }),
      },
    },
    onboarding: {
      completeOnboarding: {
        useMutation: () => ({ mutateAsync: completeOnboardingMutationMock }),
      },
    },
    integrations: {
      getAuthUrl: {
        useMutation: () => ({
          mutateAsync: jest.fn(async () => ({ url: "https://example.test" })),
        }),
      },
    },
  },
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  estimateConservativeFTPFromWeight: jest.fn(() => 210),
  estimateMaxHRFromDOB: jest.fn(() => 185),
  formatWeightForDisplay: jest.fn((weight: number) => `${weight} kg`),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: ({ id, value, onChange }: any) =>
    React.createElement("TextInput", {
      testID: id,
      value,
      onChangeText: (nextValue: string) => onChange(nextValue),
    }),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/pace-seconds-field", () => ({
  __esModule: true,
  PaceSecondsField: ({ id, onChangeSeconds }: any) =>
    React.createElement("TextInput", {
      testID: id,
      onChangeText: (nextValue: string) => onChangeSeconds(Number(nextValue)),
    }),
}));

jest.mock("@repo/ui/components/progress", () => ({
  __esModule: true,
  Progress: createHost("Progress"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  ArrowRight: createHost("ArrowRight"),
  Check: createHost("Check"),
  ChevronRight: createHost("ChevronRight"),
}));

const OnboardingScreen = require("../onboarding").default;

describe("onboarding screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const completeRequiredSteps = () => {
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("beginner"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("male"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.changeText(screen.getByTestId("onboarding-dob"), "1990-01-01");
    fireEvent.press(screen.getByText("Next"));
    fireEvent.changeText(screen.getByPlaceholderText("70.0"), "72");
    fireEvent(screen.getByPlaceholderText("70.0"), "blur");
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("other"));
    fireEvent.press(screen.getByText("Next"));
  };

  it("completes the required onboarding flow and submits the profile", async () => {
    renderNative(<OnboardingScreen />);

    completeRequiredSteps();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(completeOnboardingMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          experience_level: "beginner",
          weight_kg: 72,
          gender: "male",
        }),
      );
      expect(completeOnboardingMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("lets users skip optional onboarding steps", () => {
    renderNative(<OnboardingScreen />);

    completeRequiredSteps();

    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);

    fireEvent.press(screen.getByTestId("onboarding-skip-button"));

    expect(screen.getByText("Resting Heart Rate")).toBeTruthy();
  });

  it("lets users skip the signup onboarding flow after the intro", async () => {
    renderNative(<OnboardingScreen />);

    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);

    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));

    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(completeOnboardingMutationMock).toHaveBeenCalledWith({
        css_seconds_per_hundred_meters: undefined,
        dob: undefined,
        experience_level: "skip",
        ftp: undefined,
        gender: undefined,
        max_hr: undefined,
        resting_hr: undefined,
        lthr: undefined,
        threshold_pace_seconds_per_km: undefined,
        vo2max: undefined,
        weight_kg: undefined,
      });
      expect(completeOnboardingMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });
});
