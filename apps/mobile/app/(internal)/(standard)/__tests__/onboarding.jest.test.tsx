import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const completeOnboardingMock = jest.fn(async () => undefined);
const completeOnboardingMutationMock = jest.fn(async () => ({ ok: true }));
let importedOnboardingValuesMock: unknown = null;
let integrationOverviewMock: unknown[] = [];
let integrationOverviewErrorMock: Error | null = null;
const refetchIntegrationOverviewMock = jest.fn(async () => ({ data: [] }));

const createIntegrationOverview = (provider: "strava" | "wahoo", configured: boolean) => ({
  actions: [],
  activityHistory: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    queuedJobId: null,
    status: "idle",
  },
  configured,
  connected: false,
  integrationId: null,
  label: provider === "strava" ? "Strava" : "Wahoo",
  plannedWorkouts: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    queuedJobId: null,
    status: "unsupported",
  },
  primaryAction: "connect",
  provider,
  providerHealth: { lastError: null, status: "unsupported" },
  setupData: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    status: "idle",
  },
  summary: {
    badge: "Available",
    health: "unavailable",
    subtitle: "Not connected",
    title: provider === "strava" ? "Strava" : "Wahoo",
  },
});

type MockPressableHandler = (...args: unknown[]) => unknown;

type PressableMockProps = {
  children?: React.ReactNode;
  disabled?: boolean;
  onPress?: MockPressableHandler;
  testID?: string;
  testId?: string;
} & Record<string, unknown>;

type DateInputMockProps = {
  id?: string;
  value?: string;
  onChange: (nextValue: string) => void;
};

type PaceSecondsFieldMockProps = {
  id?: string;
  onChangeSeconds: (seconds: number) => void;
};

const ButtonHost = ({ children, disabled, onPress, ...props }: PressableMockProps) =>
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
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: PressableMockProps) =>
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

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      scheme: "gradientpeak-dev",
      extra: {
        redirectUri: "gradientpeak-dev://integrations",
      },
    },
  },
}));

jest.mock("expo-web-browser", () => ({
  __esModule: true,
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    completeOnboarding: completeOnboardingMock,
    isAuthenticated: true,
    isFullyLoaded: true,
  }),
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profiles: {
      get: {
        useQuery: () => ({ data: { id: "profile-1" } }),
      },
    },
    useUtils: () => ({
      onboarding: {
        getImportedOnboardingValues: { invalidate: jest.fn(async () => undefined) },
        getProviderEnrichmentStatus: { invalidate: jest.fn(async () => undefined) },
      },
      profiles: { get: { invalidate: jest.fn(async () => undefined) } },
    }),
    onboarding: {
      completeOnboarding: {
        useMutation: () => ({ mutateAsync: completeOnboardingMutationMock }),
      },
      getImportedOnboardingValues: {
        useQuery: () => ({
          data: importedOnboardingValuesMock,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
      getProviderEnrichmentStatus: {
        useQuery: () => ({ data: null, isLoading: false, refetch: jest.fn() }),
      },
      startProviderEnrichment: {
        useMutation: () => ({ mutateAsync: jest.fn(async () => undefined), isPending: false }),
      },
      clearProviderRequirement: {
        useMutation: () => ({ mutateAsync: jest.fn(async () => undefined), isPending: false }),
      },
    },
    integrations: {
      list: {
        useQuery: () => ({ data: [], refetch: jest.fn(async () => ({ data: [] })) }),
      },
      getSyncOverview: {
        useQuery: () => ({
          data: integrationOverviewMock,
          error: integrationOverviewErrorMock,
          isLoading: false,
          refetch: refetchIntegrationOverviewMock,
        }),
      },
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
  ...jest.requireActual("@repo/core"),
  estimateConservativeFTPFromWeight: jest.fn((weight?: number | null) => (weight ? 210 : null)),
  estimateMaxHRFromDOB: jest.fn((dob?: string | null) => (dob ? 185 : null)),
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
  DateInput: ({ id, value, onChange }: DateInputMockProps) =>
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
  PaceSecondsField: ({ id, onChangeSeconds }: PaceSecondsFieldMockProps) =>
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

const flushUsernameDebounce = async () => {
  await new Promise((resolve) => setTimeout(resolve, 450));
};

describe("onboarding screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    importedOnboardingValuesMock = null;
    integrationOverviewMock = [];
    integrationOverviewErrorMock = null;
  });

  const completeRequiredSteps = async () => {
    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(false);
    });
    fireEvent.press(screen.getByText("cycling"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Skip"));
    await waitFor(() => {
      expect(screen.getByText("beginner")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("beginner"));
    fireEvent.press(screen.getByText("male"));
    fireEvent.changeText(screen.getByTestId("onboarding-dob"), "1990-01-01");
    fireEvent.changeText(screen.getByPlaceholderText("70.0"), "72");
    fireEvent(screen.getByPlaceholderText("70.0"), "blur");
    fireEvent.press(screen.getByText("Next"));
  };

  it("completes the required onboarding flow and submits the profile", async () => {
    renderNative(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-intent-train_event"));
    fireEvent.press(screen.getByTestId("onboarding-intent-track_activities"));
    await completeRequiredSteps();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(completeOnboardingMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          experience_level: "beginner",
          full_name: "Riley Chen",
          ftp: 210,
          max_hr: 185,
          weight_kg: 72,
          gender: "male",
          intents: ["train_event", "track_activities"],
        }),
      );
      expect(completeOnboardingMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("lets users skip optional onboarding steps", async () => {
    renderNative(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);

    fireEvent.press(screen.getByTestId("onboarding-skip-button"));

    expect(screen.getByText("Connect Accounts")).toBeTruthy();
  });

  it("allows selecting more than one onboarding intent", () => {
    renderNative(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-intent-train_event"));
    fireEvent.press(screen.getByTestId("onboarding-intent-improve_fitness"));

    expect(
      screen.getByTestId("onboarding-intent-train_event").props.accessibilityState.checked,
    ).toBe(true);
    expect(
      screen.getByTestId("onboarding-intent-improve_fitness").props.accessibilityState.checked,
    ).toBe(true);
  });

  it("only shows integrations configured for the environment", async () => {
    integrationOverviewMock = [
      createIntegrationOverview("strava", true),
      createIntegrationOverview("wahoo", false),
    ];
    renderNative(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("integration-provider-strava")).toBeTruthy();
    expect(screen.queryByTestId("integration-provider-wahoo")).toBeNull();
  });

  it("shows retryable integration query errors without enabling unknown providers", async () => {
    integrationOverviewErrorMock = new Error("network unavailable");
    renderNative(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("integration-provider-list-error")).toBeTruthy();
    expect(screen.queryByTestId("integration-provider-fallback-strava")).toBeNull();
    expect(screen.queryByTestId("integration-connect-strava")).toBeNull();
    fireEvent.press(screen.getByTestId("integration-provider-list-retry"));
    expect(refetchIntegrationOverviewMock).toHaveBeenCalled();
  });

  it("lets users skip the signup onboarding flow after the intro", async () => {
    renderNative(<OnboardingScreen />);

    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);

    for (let i = 0; i < 2; i += 1) {
      fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    }

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-finish-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("onboarding-finish-button"));

    await waitFor(() => {
      expect(completeOnboardingMutationMock).toHaveBeenCalledWith({
        css_seconds_per_hundred_meters: undefined,
        dob: undefined,
        experience_level: "skip",
        ftp: undefined,
        full_name: "Riley Chen",
        gender: undefined,
        intents: [],
        max_hr: undefined,
        resting_hr: undefined,
        lthr: undefined,
        threshold_pace_seconds_per_km: undefined,
        username: "riley_runs",
        vo2max: undefined,
        weight_kg: undefined,
      });
      expect(completeOnboardingMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("prefills provider-imported onboarding fields before submission", async () => {
    importedOnboardingValuesMock = {
      profile: {
        dob: "1988-04-05",
        gender: "female",
        onboarded: false,
      },
      values: {
        dob: "1988-04-05",
        gender: "female",
        weight_kg: 64,
        ftp: 245,
      },
      sources: {
        dob: {
          provider: "wahoo",
          label: "Wahoo",
          sourceRecordedAt: "2026-04-03T11:05:00.000Z",
        },
        gender: {
          provider: "wahoo",
          label: "Wahoo",
          sourceRecordedAt: "2026-04-03T11:05:00.000Z",
        },
        weight_kg: {
          provider: "wahoo",
          label: "Wahoo",
          sourceRecordedAt: "2026-04-03T11:05:00.000Z",
        },
        ftp: {
          provider: "wahoo",
          label: "Wahoo",
          sourceRecordedAt: "2026-04-03T11:05:00.000Z",
        },
      },
    };

    renderNative(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    fireEvent.press(screen.getByText("cycling"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Skip"));
    await waitFor(() => {
      expect(screen.getByText("beginner")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("beginner"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(completeOnboardingMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dob: "1988-04-05T00:00:00.000Z",
          ftp: 245,
          gender: "female",
          weight_kg: 64,
        }),
      );
    });
  });
});
