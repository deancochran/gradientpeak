import * as SecureStore from "expo-secure-store";
import React from "react";
import {
  hasPendingOnboardingRecovery,
  loadOnboardingRecovery,
  ONBOARDING_RECOVERY_VERSION,
  onboardingRecoveryExpiry,
  saveOnboardingRecovery,
} from "@/lib/onboarding/onboarding-recovery";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const completeOnboardingMock = jest.fn(async () => undefined);
const secureStoreMock = SecureStore as typeof SecureStore & { __store: Map<string, string> };
const mockFlowAuthState = {
  isAuthenticated: true,
  isFullyLoaded: true,
  onboardingStatus: true,
  user: { id: "user-1" },
};
let mockCurrentProfile = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "Riley Chen",
  username: "riley_runs",
};
type LifecycleInput = {
  profile: Record<string, unknown>;
  goal?: Record<string, unknown>;
  settings_patch?: Record<string, unknown>;
};
type LifecycleResult = {
  status: "completed" | "already_completed";
  goal: {
    status: "saved" | "skipped" | "failed";
    retryable: boolean;
    failure_code?: "content_conflict" | "temporarily_unavailable";
  };
  settings: {
    status: "saved" | "unchanged" | "skipped" | "failed";
    retryable: boolean;
    failure_code?: "content_conflict" | "temporarily_unavailable";
  };
  retryable: boolean;
  cache_tags: readonly string[];
};
const completeLifecycleSetupMutationMock: jest.MockedFunction<
  (input: LifecycleInput) => Promise<LifecycleResult>
> = jest.fn(async (_input: LifecycleInput) => ({
  status: "completed" as const,
  goal: { status: "skipped" as const, retryable: false },
  settings: { status: "saved" as const, retryable: false },
  retryable: false,
  cache_tags: [
    "onboarding.getImportedOnboardingValues",
    "goals.list",
    "profileSettings.getForProfile",
  ] as const,
}));
const invalidateGoalsMock = jest.fn(async () => undefined);
const invalidateProfileSettingsMock = jest.fn(async () => undefined);
const invalidateProfileMock = jest.fn(async () => undefined);
const acceptInviteMutationMock = jest.fn(async () => ({ membership: {} }));
const joinOrRequestGroupMutationMock: jest.MockedFunction<
  (input: { groupId: string }) => Promise<{ outcome: string }>
> = jest.fn(async (_input: { groupId: string }) => ({ outcome: "joined" }));
const followProfileMutationMock: jest.MockedFunction<
  (input: { target_user_id: string }) => Promise<{ status: string }>
> = jest.fn(async (_input) => ({ status: "accepted" }));
const invalidateSocialBatchMock = jest.fn(async () => undefined);
const invalidateGroupDetailMock = jest.fn(async () => undefined);
const invalidateGroupMembersMock = jest.fn(async () => undefined);
const invalidateGroupInvitationsMock = jest.fn(async () => undefined);
const invalidateGroupJoinRequestsMock = jest.fn(async () => undefined);
const invalidateFollowersMock = jest.fn(async () => undefined);
const invalidateFollowingMock = jest.fn(async () => undefined);
const mutationOrder: string[] = [];
let importedOnboardingValuesMock: unknown = null;
let profileSettingsRecordMock: unknown = null;
let profileSettingsQueryStateMock: "loading" | "success" | "error" = "success";
let integrationOverviewMock: unknown[] = [];
let integrationOverviewErrorMock: Error | null = null;
const refetchIntegrationOverviewMock = jest.fn(async () => ({ data: [] }));
let usernameAvailabilityMock: { available: boolean } | undefined = { available: true };
let usernameAvailabilityErrorMock = false;
const usernameAvailabilityQueryMock = jest.fn();
let invitationItemsMock: unknown[] = [];
let groupItemsMock: unknown[] = [];
let peopleItemsMock: unknown[] = [];
let invitationNextItemsMock: unknown[] = [];
let groupNextItemsMock: unknown[] = [];
let peopleNextItemsMock: unknown[] = [];
let invitationsErrorMock = false;
let groupsErrorMock = false;
let peopleErrorMock = false;
const groupSearchQueryMock = jest.fn();
const peopleSearchQueryMock = jest.fn();

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
  clearable?: boolean;
  id?: string;
  value?: string;
  onChange: (nextValue: string | undefined) => void;
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
  TouchableOpacity: ({ children, disabled, onPress, ...props }: PressableMockProps) =>
    React.createElement(
      "Pressable",
      { disabled, onPress: disabled ? undefined : onPress, ...props },
      children,
    ),
  View: createHost("View"),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  SafeAreaView: createHost("SafeAreaView"),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
    ...mockFlowAuthState,
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
        useQuery: () => ({ data: mockCurrentProfile }),
      },
    },
    useUtils: () => ({
      onboarding: {
        getImportedOnboardingValues: { invalidate: jest.fn(async () => undefined) },
        getProviderEnrichmentStatus: { invalidate: jest.fn(async () => undefined) },
      },
      profiles: {
        get: { invalidate: invalidateProfileMock },
        invalidate: invalidateSocialBatchMock,
      },
      profileSettings: { getForProfile: { invalidate: invalidateProfileSettingsMock } },
      goals: { list: { invalidate: invalidateGoalsMock } },
      groups: {
        listDiscoverable: { invalidate: invalidateSocialBatchMock },
        myGroups: { invalidate: invalidateSocialBatchMock },
        myInvitations: { invalidate: invalidateSocialBatchMock },
        forProfile: { invalidate: invalidateSocialBatchMock },
        detail: { invalidate: invalidateGroupDetailMock },
        members: { invalidate: invalidateGroupMembersMock },
        pendingInvitations: { invalidate: invalidateGroupInvitationsMock },
        pendingJoinRequests: { invalidate: invalidateGroupJoinRequestsMock },
      },
      social: {
        searchUsers: { invalidate: invalidateSocialBatchMock },
        getFollowers: { invalidate: invalidateFollowersMock },
        getFollowing: { invalidate: invalidateFollowingMock },
      },
      feed: { getFeed: { invalidate: invalidateSocialBatchMock } },
    }),
    profileSettings: {
      getForProfile: {
        useQuery: () => ({
          data: profileSettingsQueryStateMock === "success" ? profileSettingsRecordMock : undefined,
          isError: profileSettingsQueryStateMock === "error",
          isLoading: profileSettingsQueryStateMock === "loading",
          isSuccess: profileSettingsQueryStateMock === "success",
        }),
      },
    },
    onboarding: {
      checkUsernameAvailability: {
        useQuery: (input: unknown, options: { enabled?: boolean }) => {
          usernameAvailabilityQueryMock(input, options);
          return {
            data: options.enabled ? usernameAvailabilityMock : undefined,
            isError: options.enabled ? usernameAvailabilityErrorMock : false,
            isFetching: Boolean(
              options.enabled && !usernameAvailabilityMock && !usernameAvailabilityErrorMock,
            ),
            isLoading: Boolean(
              options.enabled && !usernameAvailabilityMock && !usernameAvailabilityErrorMock,
            ),
          };
        },
      },
      completeLifecycleSetup: {
        useMutation: () => ({ mutateAsync: completeLifecycleSetupMutationMock, isPending: false }),
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
    groups: {
      acceptInvite: {
        useMutation: () => ({ mutateAsync: acceptInviteMutationMock, isPending: false }),
      },
      joinOrRequest: {
        useMutation: () => ({ mutateAsync: joinOrRequestGroupMutationMock, isPending: false }),
      },
      myInvitations: {
        useInfiniteQuery: () => {
          const [pageCount, setPageCount] = React.useState(1);
          return {
            data: {
              pages: [
                { items: invitationItemsMock, nextCursor: "invitation-next" },
                ...(pageCount > 1
                  ? [{ items: invitationNextItemsMock, nextCursor: undefined }]
                  : []),
              ],
            },
            fetchNextPage: jest.fn(async () => setPageCount(2)),
            hasNextPage: pageCount === 1 && invitationNextItemsMock.length > 0,
            isError: invitationsErrorMock,
            isFetchingNextPage: false,
            isLoading: false,
            refetch: jest.fn(),
          };
        },
      },
      listDiscoverable: {
        useInfiniteQuery: (input: unknown) => {
          const [pageCount, setPageCount] = React.useState(1);
          groupSearchQueryMock(input);
          return {
            data: {
              pages: [
                { items: groupItemsMock, nextCursor: "group-next" },
                ...(pageCount > 1 ? [{ items: groupNextItemsMock, nextCursor: undefined }] : []),
              ],
            },
            fetchNextPage: jest.fn(async () => setPageCount(2)),
            hasNextPage: pageCount === 1 && groupNextItemsMock.length > 0,
            isError: groupsErrorMock,
            isFetchingNextPage: false,
            isLoading: false,
            refetch: jest.fn(),
          };
        },
      },
    },
    social: {
      followUser: {
        useMutation: () => ({ mutateAsync: followProfileMutationMock, isPending: false }),
      },
      searchUsers: {
        useInfiniteQuery: (input: unknown) => {
          const [pageCount, setPageCount] = React.useState(1);
          peopleSearchQueryMock(input);
          return {
            data: {
              pages: [
                { users: peopleItemsMock, nextCursor: "people-next" },
                ...(pageCount > 1 ? [{ users: peopleNextItemsMock, nextCursor: undefined }] : []),
              ],
            },
            fetchNextPage: jest.fn(async () => setPageCount(2)),
            hasNextPage: pageCount === 1 && peopleNextItemsMock.length > 0,
            isError: peopleErrorMock,
            isFetchingNextPage: false,
            isLoading: false,
            refetch: jest.fn(),
          };
        },
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
  DateInput: ({ clearable, id, value, onChange }: DateInputMockProps) => (
    <>
      {React.createElement("TextInput", {
        testID: id,
        value,
        onChangeText: (nextValue: string) => onChange(nextValue),
      })}
      {clearable && value
        ? React.createElement(
            "Pressable",
            { accessibilityLabel: "Clear date", onPress: () => onChange(undefined) },
            "Clear",
          )
        : null}
    </>
  ),
}));

jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: { children?: React.ReactNode }) => children,
  FormTextField: ({
    control,
    name,
    placeholder,
    testId,
  }: {
    control: unknown;
    name: string;
    placeholder?: string;
    testId?: string;
  }) => {
    const { useController } = jest.requireActual("react-hook-form");
    const { field } = useController({ control, name });
    return React.createElement("TextInput", {
      onChangeText: field.onChange,
      placeholder,
      testID: testId,
      value: field.value,
    });
  },
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

jest.mock("@/components/settings/training-preferences/TrainingPreferencesSurface", () => ({
  __esModule: true,
  TrainingPreferencesSurface: ({
    onChange,
    value,
  }: {
    onChange: (change: Record<string, unknown>) => void;
    value: Record<string, unknown>;
  }) => (
    <React.Fragment>
      {React.createElement("Text", { testID: "compact-preferences-value" }, JSON.stringify(value))}
      {React.createElement(
        "Pressable",
        {
          onPress: () => onChange({ preset: "push_harder" }),
          testID: "training-preferences-preset-push_harder",
        },
        "Push harder",
      )}
      {React.createElement(
        "Pressable",
        {
          onPress: () => onChange({ maxSessionsPerWeek: 5 }),
          testID: "training-preferences-dose-change",
        },
        "Change dose",
      )}
      {React.createElement(
        "Pressable",
        {
          onPress: () => onChange({ maxWeeklyMinutes: 480 }),
          testID: "training-preferences-weekly-change",
        },
        "Change weekly minutes",
      )}
      {React.createElement(
        "Pressable",
        {
          onPress: () => onChange({ minSessionsPerWeek: 8 }),
          testID: "training-preferences-invalid-dose",
        },
        "Invalid dose",
      )}
    </React.Fragment>
  ),
}));

jest.mock("@/components/goals", () => ({
  __esModule: true,
  GoalEditorForm: ({
    onDraftChange,
  }: {
    onDraftChange: (draft: Record<string, unknown>) => void;
  }) => (
    <React.Fragment>
      {React.createElement(
        "Pressable",
        {
          onPress: () =>
            onDraftChange({
              title: "Spring 5K",
              targetDate: "2099-06-01",
              importance: 8,
              goalType: "race_performance",
              activityCategory: "run",
              raceDistanceKm: 5,
              raceTargetMode: "time",
              targetDuration: "25:00",
              targetPace: "",
              targetWatts: null,
              targetBpm: null,
              thresholdTestDuration: "20:00",
              consistencySessionsPerWeek: 4,
              consistencyWeeks: 8,
            }),
          testID: "onboarding-goal-valid-draft",
        },
        "Valid goal draft",
      )}
      {React.createElement(
        "Pressable",
        {
          onPress: () =>
            onDraftChange({
              title: "",
              targetDate: "",
              importance: 5,
              goalType: "race_performance",
              activityCategory: "run",
              raceDistanceKm: 5,
              raceTargetMode: "time",
              targetDuration: "",
            }),
          testID: "onboarding-goal-invalid-draft",
        },
        "Invalid goal draft",
      )}
    </React.Fragment>
  ),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  ArrowRight: createHost("ArrowRight"),
  Check: createHost("Check"),
  ChevronRight: createHost("ChevronRight"),
  Users: createHost("Users"),
}));

const OnboardingScreen = require("../onboarding").default;
const { TrainingBaselineStep } = require("@/components/onboarding/steps");
const { INITIAL_ONBOARDING_DATA } = require("@/components/onboarding/onboarding-data");
const { runSocialActionsWithLimit } = require("@/components/onboarding/useOnboardingFlow");
const {
  estimateConservativeFTPFromWeight,
  estimateMaxHRFromDOB,
}: {
  estimateConservativeFTPFromWeight: jest.Mock;
  estimateMaxHRFromDOB: jest.Mock;
} = require("@repo/core");

const TrainingBaselineHarness = ({
  initialData = {},
}: {
  initialData?: Record<string, unknown>;
}) => {
  const [data, setData] = React.useState({ ...INITIAL_ONBOARDING_DATA, ...initialData });

  return (
    <TrainingBaselineStep
      data={data}
      updateData={(updates: Record<string, unknown>) =>
        setData((current: Record<string, unknown>) => ({ ...current, ...updates }))
      }
    />
  );
};

const flushUsernameDebounce = async () => {
  await new Promise((resolve) => setTimeout(resolve, 450));
};

describe("onboarding screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    secureStoreMock.__store.clear();
    Object.assign(mockFlowAuthState, {
      isAuthenticated: true,
      isFullyLoaded: true,
      onboardingStatus: true,
      user: { id: "user-1" },
    });
    mockCurrentProfile = {
      id: "22222222-2222-4222-8222-222222222222",
      full_name: "Riley Chen",
      username: "riley_runs",
    };
    importedOnboardingValuesMock = null;
    profileSettingsRecordMock = null;
    profileSettingsQueryStateMock = "success";
    integrationOverviewMock = [];
    integrationOverviewErrorMock = null;
    usernameAvailabilityMock = { available: true };
    usernameAvailabilityErrorMock = false;
    invitationItemsMock = [];
    groupItemsMock = [];
    peopleItemsMock = [];
    invitationNextItemsMock = [];
    groupNextItemsMock = [];
    peopleNextItemsMock = [];
    invitationsErrorMock = false;
    groupsErrorMock = false;
    peopleErrorMock = false;
    acceptInviteMutationMock.mockResolvedValue({ membership: {} });
    joinOrRequestGroupMutationMock.mockResolvedValue({ outcome: "joined" });
    followProfileMutationMock.mockResolvedValue({ status: "accepted" });
    estimateConservativeFTPFromWeight.mockImplementation((weight?: number | null) =>
      weight ? 210 : null,
    );
    estimateMaxHRFromDOB.mockImplementation((dob?: string | null) => (dob ? 185 : null));
    mutationOrder.length = 0;
    completeLifecycleSetupMutationMock.mockImplementation(async () => {
      mutationOrder.push("complete");
      return {
        status: "completed" as const,
        goal: { status: "skipped" as const, retryable: false },
        settings: { status: "saved" as const, retryable: false },
        retryable: false,
        cache_tags: [
          "onboarding.getImportedOnboardingValues",
          "goals.list",
          "profileSettings.getForProfile",
        ] as const,
      };
    });
    completeOnboardingMock.mockImplementation(async () => {
      mutationOrder.push("local-complete");
    });
  });

  it("bounds social action concurrency at four while settling every action", async () => {
    let active = 0;
    let maximumActive = 0;
    const jobs = Array.from({ length: 9 }, (_, index) => ({
      key: `job-${index}`,
      run: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (index === 8) throw new Error("expected failure");
      },
    }));

    const results = await runSocialActionsWithLimit(jobs);

    expect(maximumActive).toBe(4);
    expect(results).toHaveLength(9);
    expect(results).toContainEqual({ key: "job-8", status: "failed" });
  });

  it("waits for the debounced availability result and blocks a taken username", async () => {
    usernameAvailabilityMock = undefined;
    renderNative(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(true);

    usernameAvailabilityMock = { available: false };
    await flushUsernameDebounce();
    await waitFor(() => expect(screen.getByTestId("onboarding-username-unavailable")).toBeTruthy());
    expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(true);
    expect(usernameAvailabilityQueryMock).toHaveBeenLastCalledWith(
      { username: "riley_runs" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("shows an availability error and keeps continue disabled", async () => {
    usernameAvailabilityMock = undefined;
    usernameAvailabilityErrorMock = true;
    renderNative(<OnboardingScreen />);
    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();

    await waitFor(() => expect(screen.getByTestId("onboarding-username-error")).toBeTruthy());
    expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(true);
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
    fireEvent.press(screen.getByText("Next"));
    await waitFor(() => {
      expect(screen.getByText("beginner")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("beginner"));
    fireEvent.press(screen.getByText("male"));
    fireEvent.changeText(screen.getByTestId("athlete-baseline-dob"), "1990-01-01");
    fireEvent.changeText(screen.getByPlaceholderText("70.0"), "72");
    fireEvent(screen.getByPlaceholderText("70.0"), "blur");
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Next"));
  };

  const reachGoalsAndPreferences = async () => {
    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(false),
    );
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Skip"));
    await waitFor(() => expect(screen.getByText("Training baseline")).toBeTruthy());
    fireEvent.press(screen.getByText("Skip"));
    await waitFor(() => expect(screen.getByText("Training preferences")).toBeTruthy());
  };

  const advanceFromGoalsToSummary = () => {
    fireEvent.press(screen.getByText("Next"));
    expect(screen.getByTestId("groups-people-step")).toBeTruthy();
    fireEvent.press(screen.getByText("Next"));
  };

  const skipFromGoalsToSummary = () => {
    fireEvent.press(screen.getByText("Skip"));
    expect(screen.getByTestId("groups-people-step")).toBeTruthy();
    fireEvent.press(screen.getByText("Skip"));
  };

  const seedRecovery = async (
    data: Record<string, unknown>,
    lifecycle: {
      required?: { status: "pending" | "saved"; retryable: boolean };
      goal: { status: "pending" | "saved" | "skipped" | "failed"; retryable: boolean };
      settings: { status: "pending" | "saved" | "skipped" | "failed"; retryable: boolean };
    },
  ) => {
    const source = { ...INITIAL_ONBOARDING_DATA, ...data };
    const unresolvedStatuses = Object.fromEntries(
      Object.entries(source.social_action_statuses).filter(
        (entry): entry is [string, "pending" | "failed"] =>
          entry[1] === "pending" || entry[1] === "failed",
      ),
    );
    const unresolvedIds = new Set(
      Object.keys(unresolvedStatuses).map((key) => key.slice(key.indexOf(":") + 1)),
    );
    const goal = source.should_create_goal
      ? {
          target_date: "2099-06-01",
          title: "Spring 5K",
          priority: 8,
          activity_category: "run" as const,
          target_payload: {
            type: "event_performance" as const,
            activity_category: "run" as const,
            distance_m: 5000,
            target_time_s: 1500,
          },
        }
      : undefined;
    await saveOnboardingRecovery({
      version: ONBOARDING_RECOVERY_VERSION,
      userId: "user-1",
      status: "pending",
      expiresAt: onboardingRecoveryExpiry(),
      profileRetry: {
        experienceLevel: source.experience_level ?? "skip",
        intents: source.intent,
      },
      social: {
        invitationIds: source.selected_invitation_ids.filter((id: string) => unresolvedIds.has(id)),
        groupIds: source.selected_group_ids.filter((id: string) => unresolvedIds.has(id)),
        followProfileIds: source.selected_follow_profile_ids.filter((id: string) =>
          unresolvedIds.has(id),
        ),
        statuses: unresolvedStatuses,
      },
      ...(goal ? { goal } : null),
      ...(lifecycle.settings.status === "pending" || lifecycle.settings.retryable
        ? { settingsPatch: source.training_preferences_patch }
        : null),
      lifecycle: {
        required: lifecycle.required ?? { status: "saved", retryable: false },
        goal: lifecycle.goal,
        settings: lifecycle.settings,
      },
    });
  };

  const groupFixture = (
    id: string,
    relationshipState: "member" | "invited" | "requested" | "non_member",
    action: "join" | "request" | null,
  ) => ({
    id,
    name: `Group ${id}`,
    slug: `group-${id}`,
    description: "A training group",
    avatar_url: null,
    cover_url: null,
    access_level: "public",
    join_policy: action === "join" ? "open" : "invite_only",
    viewer: {
      relationshipState,
      membershipRole: relationshipState === "member" ? "member" : null,
      canJoin: action === "join",
      canRequestToJoin: action === "request",
      canAcceptInvite: relationshipState === "invited",
      canLeave: relationshipState === "member",
      canEditGroup: false,
      canInvite: false,
      canManageJoinRequests: false,
      canManageMembers: false,
      canDeleteGroup: false,
      canViewGroupEvents: relationshipState === "member",
      canCreateGroupEvent: false,
    },
  });

  const profileFixture = (id: string, followStatus: "accepted" | "pending" | null = null) => ({
    id,
    full_name: `Athlete ${id}`,
    username: `athlete_${id}`,
    avatar_url: null,
    is_public: true,
    follow_status: followStatus,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  const SOCIAL_IDS = {
    invitation: "10000000-0000-4000-8000-000000000001",
    openGroup: "10000000-0000-4000-8000-000000000002",
    closedGroup: "10000000-0000-4000-8000-000000000003",
    savedProfile: "10000000-0000-4000-8000-000000000004",
    retryProfile: "10000000-0000-4000-8000-000000000005",
    failedProfile: "10000000-0000-4000-8000-000000000006",
    abandonedProfile: "10000000-0000-4000-8000-000000000007",
    newProfile: "10000000-0000-4000-8000-000000000008",
  } as const;

  it("places a skippable Goals & Preferences step between baseline and summary with canonical defaults", async () => {
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();

    expect(screen.getByText("Step 4 of 6")).toBeTruthy();
    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"preset":"balanced"',
    );
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"minSessionsPerWeek":3',
    );
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"maxSessionsPerWeek":4',
    );
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"maxSingleSessionMinutes":90',
    );
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"maxWeeklyMinutes":360',
    );

    skipFromGoalsToSummary();
    expect(screen.getByText("All Set!")).toBeTruthy();
    expect(screen.getAllByText("Skip").length).toBeGreaterThan(0);
  });

  it("renders independent canonical suggestions and disables existing viewer states", async () => {
    const invitationGroup = groupFixture("invite", "invited", null);
    invitationItemsMock = [
      {
        id: "invitation-1",
        group_id: invitationGroup.id,
        status: "pending",
        group: invitationGroup,
      },
    ];
    groupItemsMock = [
      groupFixture("open", "non_member", "join"),
      groupFixture("member", "member", null),
      groupFixture("requested", "requested", null),
    ];
    peopleItemsMock = [profileFixture("new"), profileFixture("following", "accepted")];
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("onboarding-invitation-invitation-1")).toBeTruthy();
    expect(screen.getByTestId("onboarding-group-open")).toBeTruthy();
    expect(screen.getByTestId("onboarding-profile-new")).toBeTruthy();
    expect(screen.getByTestId("onboarding-group-member").props.disabled).toBe(true);
    expect(screen.getByTestId("onboarding-group-requested").props.disabled).toBe(true);
    expect(
      screen.getByTestId("onboarding-profile-following-identity").props.accessibilityState.disabled,
    ).toBe(true);
    expect(screen.getByText("Following")).toBeTruthy();
  });

  it("keeps group and people errors independent and debounces each explicit search by 300ms", async () => {
    groupsErrorMock = true;
    peopleItemsMock = [profileFixture("person")];
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByTestId("onboarding-groups-error")).toBeTruthy();
    expect(screen.getByTestId("onboarding-profile-person")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-people-error")).toBeNull();

    fireEvent.changeText(screen.getByTestId("onboarding-groups-search"), "runners");
    fireEvent.changeText(screen.getByTestId("onboarding-people-search"), "ada");
    expect(groupSearchQueryMock).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "runners" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    await waitFor(() =>
      expect(groupSearchQueryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "runners" }),
      ),
    );
    expect(peopleSearchQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "ada" }),
    );
  });

  it("loads additional bounded invitation, group, and people pages on demand", async () => {
    invitationItemsMock = [
      {
        id: "invitation-1",
        group_id: "invite-1",
        status: "pending",
        group: groupFixture("invite-1", "invited", null),
      },
    ];
    invitationNextItemsMock = [
      {
        id: "invitation-2",
        group_id: "invite-2",
        status: "pending",
        group: groupFixture("invite-2", "invited", null),
      },
    ];
    groupItemsMock = [groupFixture("group-1", "non_member", "join")];
    groupNextItemsMock = [groupFixture("group-2", "non_member", "request")];
    peopleItemsMock = [profileFixture("person-1")];
    peopleNextItemsMock = [profileFixture("person-2")];
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));

    expect(screen.queryByTestId("onboarding-invitation-invitation-2")).toBeNull();
    expect(screen.queryByTestId("onboarding-group-group-2")).toBeNull();
    expect(screen.queryByTestId("onboarding-profile-person-2")).toBeNull();
    fireEvent.press(screen.getByTestId("onboarding-invitations-load-more"));
    fireEvent.press(screen.getByTestId("onboarding-groups-load-more"));
    fireEvent.press(screen.getByTestId("onboarding-people-load-more"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-invitation-invitation-2")).toBeTruthy();
      expect(screen.getByTestId("onboarding-group-group-2")).toBeTruthy();
      expect(screen.getByTestId("onboarding-profile-person-2")).toBeTruthy();
    });
    expect(groupSearchQueryMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 5 }));
    expect(peopleSearchQueryMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 5 }));
  });

  it("limits each social selection category to eight with concise feedback", async () => {
    const profileIds = Array.from(
      { length: 9 },
      (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    peopleItemsMock = profileIds.map((id) => profileFixture(id));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));

    for (const id of profileIds) {
      fireEvent.press(screen.getByTestId(`onboarding-profile-${id}-identity`));
    }

    expect(screen.getByTestId("onboarding-social-selection-limit").props.children).toBe(
      "Choose up to 8 people.",
    );
    expect(
      screen.getByTestId(`onboarding-profile-${profileIds[8]}-identity`).props.accessibilityState
        .selected,
    ).toBe(false);
    fireEvent.press(screen.getByText("Next"));
    expect(screen.getByText("8 profiles to follow")).toBeTruthy();
  });

  it("selects canonical cards and lets the server resolve each selected group action", async () => {
    const invitationGroup = groupFixture(SOCIAL_IDS.invitation, "invited", null);
    invitationItemsMock = [
      {
        id: SOCIAL_IDS.invitation,
        group_id: invitationGroup.id,
        status: "pending",
        group: invitationGroup,
      },
    ];
    groupItemsMock = [
      groupFixture(SOCIAL_IDS.openGroup, "non_member", "join"),
      groupFixture(SOCIAL_IDS.closedGroup, "non_member", "request"),
    ];
    peopleItemsMock = [profileFixture(SOCIAL_IDS.newProfile)];
    acceptInviteMutationMock.mockImplementation(async () => {
      mutationOrder.push("invite");
      return { membership: {} };
    });
    joinOrRequestGroupMutationMock.mockImplementation(async ({ groupId }) => {
      mutationOrder.push(`group:${groupId}`);
      return { outcome: groupId === SOCIAL_IDS.openGroup ? "joined" : "requested" };
    });
    followProfileMutationMock.mockImplementation(async () => {
      mutationOrder.push("follow");
      return { status: "accepted" };
    });
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));

    const openGroup = screen.getByTestId(`onboarding-group-${SOCIAL_IDS.openGroup}`);
    fireEvent.press(openGroup);
    expect(openGroup.props.accessibilityState.selected).toBe(true);
    fireEvent.press(openGroup);
    expect(
      screen.getByTestId(`onboarding-group-${SOCIAL_IDS.openGroup}`).props.accessibilityState
        .selected,
    ).toBe(false);
    fireEvent.press(screen.getByTestId(`onboarding-group-${SOCIAL_IDS.openGroup}`));
    fireEvent.press(screen.getByTestId(`onboarding-group-${SOCIAL_IDS.closedGroup}`));
    fireEvent.press(screen.getByTestId(`onboarding-invitation-${SOCIAL_IDS.invitation}`));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.newProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByText("1 invitation, 2 groups, 1 profile to follow")).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    expect(acceptInviteMutationMock).toHaveBeenCalledWith({ invitationId: SOCIAL_IDS.invitation });
    expect(joinOrRequestGroupMutationMock).toHaveBeenNthCalledWith(1, {
      groupId: SOCIAL_IDS.openGroup,
    });
    expect(joinOrRequestGroupMutationMock).toHaveBeenNthCalledWith(2, {
      groupId: SOCIAL_IDS.closedGroup,
    });
    expect(followProfileMutationMock).toHaveBeenCalledWith({
      target_user_id: SOCIAL_IDS.newProfile,
    });
    expect(mutationOrder).toEqual([
      "complete",
      "invite",
      `group:${SOCIAL_IDS.openGroup}`,
      `group:${SOCIAL_IDS.closedGroup}`,
      "follow",
      "local-complete",
    ]);
    expect(invalidateSocialBatchMock).toHaveBeenCalledTimes(7);
    expect(invalidateGroupDetailMock).toHaveBeenCalledTimes(1);
    expect(invalidateGroupMembersMock).toHaveBeenCalledTimes(1);
    expect(invalidateGroupInvitationsMock).toHaveBeenCalledTimes(1);
    expect(invalidateGroupJoinRequestsMock).toHaveBeenCalledTimes(1);
    expect(invalidateFollowersMock).toHaveBeenCalledTimes(1);
    expect(invalidateFollowingMock).toHaveBeenCalledTimes(1);
  });

  it("does not resend saved actions and retries only failed social actions", async () => {
    peopleItemsMock = [
      profileFixture(SOCIAL_IDS.savedProfile),
      profileFixture(SOCIAL_IDS.retryProfile),
    ];
    let retryAttempts = 0;
    followProfileMutationMock.mockImplementation(async ({ target_user_id }) => {
      if (target_user_id === SOCIAL_IDS.retryProfile && retryAttempts++ === 0)
        throw new Error("temporary");
      return { status: "accepted" };
    });
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.savedProfile}-identity`));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.retryProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(screen.getByTestId("onboarding-status-modal")).toBeTruthy());
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-finish-button").props.disabled).toBe(false),
    );
    expect(
      followProfileMutationMock.mock.calls.filter(
        ([input]) => input.target_user_id === SOCIAL_IDS.savedProfile,
      ),
    ).toHaveLength(1);
    expect(
      followProfileMutationMock.mock.calls.filter(
        ([input]) => input.target_user_id === SOCIAL_IDS.retryProfile,
      ),
    ).toHaveLength(2);
  });

  it("restores social action statuses after remount and sends only unresolved work", async () => {
    await seedRecovery(
      {
        full_name: "Riley Chen",
        username: "riley_runs",
        selected_follow_profile_ids: [SOCIAL_IDS.savedProfile, SOCIAL_IDS.retryProfile],
        social_action_statuses: {
          [`follow:${SOCIAL_IDS.savedProfile}`]: "saved",
          [`follow:${SOCIAL_IDS.retryProfile}`]: "failed",
        },
      },
      {
        goal: { status: "skipped", retryable: false },
        settings: { status: "skipped", retryable: false },
      },
    );
    renderNative(<OnboardingScreen />);
    await waitFor(() => expect(screen.getByTestId("onboarding-status-modal")).toBeTruthy());

    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));

    expect(followProfileMutationMock).toHaveBeenCalledTimes(1);
    expect(followProfileMutationMock).toHaveBeenCalledWith({
      target_user_id: SOCIAL_IDS.retryProfile,
    });
    expect(completeLifecycleSetupMutationMock).not.toHaveBeenCalled();
  });

  it("resumes pending social work after a crash following durable lifecycle success", async () => {
    await seedRecovery(
      {
        selected_follow_profile_ids: [SOCIAL_IDS.newProfile],
        social_action_statuses: { [`follow:${SOCIAL_IDS.newProfile}`]: "pending" },
      },
      {
        required: { status: "saved", retryable: false },
        goal: { status: "skipped", retryable: false },
        settings: { status: "skipped", retryable: false },
      },
    );

    renderNative(<OnboardingScreen />);
    await waitFor(() => expect(screen.getByText("All Set!")).toBeTruthy());
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));

    expect(completeLifecycleSetupMutationMock).not.toHaveBeenCalled();
    expect(followProfileMutationMock).toHaveBeenCalledWith({
      target_user_id: SOCIAL_IDS.newProfile,
    });
  });

  it("resets all user-owned recovery state before loading a different authenticated user", async () => {
    await seedRecovery(
      {
        selected_follow_profile_ids: [SOCIAL_IDS.failedProfile],
        social_action_statuses: { [`follow:${SOCIAL_IDS.failedProfile}`]: "failed" },
      },
      {
        goal: { status: "skipped", retryable: false },
        settings: { status: "skipped", retryable: false },
      },
    );
    const rendered = renderNative(<OnboardingScreen />);
    await waitFor(() => expect(screen.getByTestId("onboarding-status-modal")).toBeTruthy());

    mockFlowAuthState.user = { id: "user-2" };
    mockCurrentProfile = {
      id: "33333333-3333-4333-8333-333333333333",
      full_name: "Bailey Rivera",
      username: "bailey_rides",
    };
    rendered.rerender(<OnboardingScreen />);

    await waitFor(() => expect(screen.queryByTestId("onboarding-status-modal")).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-full-name-input").props.value).toBe("Bailey Rivera"),
    );
    expect(screen.queryByText(/social action/)).toBeNull();
  });

  it("ignores minimal recovery for a profile whose required onboarding is incomplete", async () => {
    await seedRecovery(
      {
        selected_follow_profile_ids: [SOCIAL_IDS.failedProfile],
        social_action_statuses: { [`follow:${SOCIAL_IDS.failedProfile}`]: "failed" },
      },
      {
        goal: { status: "skipped", retryable: false },
        settings: { status: "skipped", retryable: false },
      },
    );
    mockFlowAuthState.onboardingStatus = false;

    renderNative(<OnboardingScreen />);

    await waitFor(() => expect(screen.getByTestId("onboarding-full-name-input")).toBeTruthy());
    expect(screen.queryByTestId("onboarding-status-modal")).toBeNull();
    await waitFor(() => expect(secureStoreMock.__store.size).toBe(0));
  });

  it("offers retry and explicit discard when secure recovery cannot be read", async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("locked"));
    renderNative(<OnboardingScreen />);

    await waitFor(() => expect(screen.getByText("Recovery unavailable")).toBeTruthy());
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText("Discard recovery")).toBeTruthy();
    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    await waitFor(() => expect(screen.queryByTestId("onboarding-status-modal")).toBeNull());
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("onboarding-recovery:v2:user-1");
    expect(screen.getByTestId("onboarding-full-name-input")).toBeTruthy();
  });

  it("accurately reports when flow-level recovery discard cannot remove the key", async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("locked"));
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error("still locked"));
    renderNative(<OnboardingScreen />);
    await waitFor(() => expect(screen.getByText("Recovery unavailable")).toBeTruthy());

    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));

    await waitFor(() => expect(screen.getByText("Recovery could not be discarded")).toBeTruthy());
    expect(screen.getByText("Retry discard")).toBeTruthy();
  });

  it("keeps local completion gated while Continue explicitly abandons failed social actions", async () => {
    peopleItemsMock = [profileFixture(SOCIAL_IDS.failedProfile)];
    followProfileMutationMock.mockRejectedValue(new Error("temporary"));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.failedProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByTestId("onboarding-status-modal")).toBeTruthy());

    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByTestId("onboarding-status-confirm")).toBeTruthy());
    fireEvent.press(screen.getByTestId("onboarding-status-confirm"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
    expect(followProfileMutationMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an abandoned social action on a later Finish", async () => {
    peopleItemsMock = [profileFixture(SOCIAL_IDS.abandonedProfile)];
    followProfileMutationMock.mockRejectedValue(new Error("temporary"));
    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => ({
      status: "completed" as const,
      goal: { status: "skipped" as const, retryable: false },
      settings: { status: "failed" as const, retryable: true },
      retryable: true,
      cache_tags: [] as never,
    }));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(
      screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.abandonedProfile}-identity`),
    );
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByTestId("onboarding-status-confirm")).toBeTruthy());

    fireEvent.press(screen.getByTestId("onboarding-status-confirm"));
    await waitFor(() =>
      expect(screen.getAllByText(/training preferences could not be saved/).length).toBe(2),
    );
    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(2));
    expect(followProfileMutationMock).toHaveBeenCalledTimes(1);
  });

  it("runs social work after durable required setup while retaining optional lifecycle failure", async () => {
    peopleItemsMock = [profileFixture(SOCIAL_IDS.newProfile)];
    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => {
      mutationOrder.push("complete");
      return {
        status: "completed" as const,
        goal: { status: "failed" as const, retryable: true },
        settings: { status: "saved" as const, retryable: false },
        retryable: true,
        cache_tags: [] as never,
      };
    });
    followProfileMutationMock.mockImplementationOnce(async () => {
      mutationOrder.push("follow");
      return { status: "accepted" };
    });
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.newProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(screen.getAllByText(/goal could not be saved/).length).toBe(2));
    expect(mutationOrder).toEqual(["complete", "follow"]);
    expect(completeOnboardingMock).not.toHaveBeenCalled();
  });

  it("reports recovery persistence failure when Continue abandons failed social work", async () => {
    peopleItemsMock = [profileFixture(SOCIAL_IDS.failedProfile)];
    followProfileMutationMock.mockRejectedValue(new Error("temporary"));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.failedProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByText("Some connections failed")).toBeTruthy());
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("storage locked"));

    fireEvent.press(screen.getByTestId("onboarding-status-confirm"));

    await waitFor(() => expect(screen.getByText("Recovery could not be saved")).toBeTruthy());
    expect(screen.queryByText(/Setup is saved/)).toBeNull();
    expect(completeOnboardingMock).not.toHaveBeenCalled();
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
  });

  it("does not start social actions when required lifecycle setup throws", async () => {
    peopleItemsMock = [profileFixture(SOCIAL_IDS.failedProfile)];
    followProfileMutationMock.mockRejectedValue(new Error("temporary"));
    completeLifecycleSetupMutationMock.mockRejectedValueOnce(new Error("lifecycle unavailable"));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.failedProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByText("Setup could not be completed")).toBeTruthy());
    expect(screen.getAllByText(/No connection actions were started/).length).toBe(2);
    expect(screen.queryByText(/Setup is saved/)).toBeNull();
    expect(followProfileMutationMock).not.toHaveBeenCalled();
    expect(completeOnboardingMock).not.toHaveBeenCalled();
  });

  it("clears selected social actions on Skip and performs no social mutations", async () => {
    groupItemsMock = [groupFixture(SOCIAL_IDS.openGroup, "non_member", "join")];
    peopleItemsMock = [profileFixture(SOCIAL_IDS.newProfile)];
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-group-${SOCIAL_IDS.openGroup}`));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.newProfile}-identity`));
    fireEvent.press(screen.getByText("Skip"));
    expect(screen.getByText("Skipped")).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    expect(joinOrRequestGroupMutationMock).not.toHaveBeenCalled();
    expect(followProfileMutationMock).not.toHaveBeenCalled();
  });

  it("blocks compact edits and Next until settings hydration succeeds", async () => {
    profileSettingsQueryStateMock = "loading";
    const rendered = renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();

    expect(screen.getByTestId("onboarding-preferences-loading")).toBeTruthy();
    expect(screen.getByTestId("onboarding-training-preferences-controls").props.pointerEvents).toBe(
      "none",
    );
    expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(true);
    fireEvent.press(screen.getByTestId("training-preferences-preset-push_harder"));
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"preset":"balanced"',
    );

    profileSettingsQueryStateMock = "success";
    rendered.rerender(<OnboardingScreen />);
    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-preferences-loading")).toBeNull();
      expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(false);
    });
  });

  it("allows Next after a settings query error and preserves a valid opted-in goal", async () => {
    profileSettingsQueryStateMock = "error";
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();

    expect(screen.getByTestId("onboarding-preferences-query-error")).toBeTruthy();
    expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(false);
    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    advanceFromGoalsToSummary();
    expect(screen.getByText("Unavailable — skipped")).toBeTruthy();
    expect(screen.getByText("Create Spring 5K")).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "settings_patch",
    );
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0].goal).toEqual(
      expect.objectContaining({ title: "Spring 5K" }),
    );
  });

  it("sends only the exact compact settings patch", async () => {
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();

    fireEvent.press(screen.getByTestId("training-preferences-preset-push_harder"));
    fireEvent.press(screen.getByTestId("training-preferences-dose-change"));
    advanceFromGoalsToSummary();
    expect(
      screen.getByText(/Push harder · 3–5 sessions · 90 min\/session · 360 min\/week/i),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0].settings_patch).toEqual({
      maxSessionsPerWeek: 5,
      preset: "push_harder",
    });
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0]).not.toHaveProperty("settings");
  });

  it("shows invalid compact feedback without blocking skip", async () => {
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();

    fireEvent.press(screen.getByTestId("training-preferences-invalid-dose"));
    expect(screen.getByTestId("onboarding-training-preferences-feedback")).toBeTruthy();
    expect(screen.getByTestId("onboarding-next-button").props.disabled).toBe(true);
    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"minSessionsPerWeek":3',
    );
    expect(screen.getByTestId("onboarding-skip-button").props.disabled).toBe(false);
    skipFromGoalsToSummary();
    expect(screen.getByText("All Set!")).toBeTruthy();
    expect(screen.getAllByText("Skip").length).toBeGreaterThan(0);
  });

  it("does not send custom advanced settings when a compact value changes", async () => {
    const savedSettings = {
      ...INITIAL_ONBOARDING_DATA.training_settings,
      dose_limits: { sport_overrides: {} },
      training_style: {
        ...INITIAL_ONBOARDING_DATA.training_settings.training_style,
        progression_pace: 0.6,
      },
    };
    profileSettingsRecordMock = {
      profile_id: "22222222-2222-4222-8222-222222222222",
      settings: savedSettings,
      updated_at: "2026-07-14T00:00:00.000Z",
    };
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();

    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"preset":"balanced"',
    );
    fireEvent.press(screen.getByTestId("training-preferences-weekly-change"));
    advanceFromGoalsToSummary();
    expect(
      screen.getByText(
        /Custom \(60%\) · sessions\/week unset · session length unset · 480 min\/week/i,
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0].settings_patch).toEqual({
      maxWeeklyMinutes: 480,
    });
  });

  it("hydrates saved settings once but sends only the user compact change", async () => {
    const savedSettings = {
      ...INITIAL_ONBOARDING_DATA.training_settings,
      dose_limits: {
        ...INITIAL_ONBOARDING_DATA.training_settings.dose_limits,
        min_sessions_per_week: 1,
        max_sessions_per_week: 6,
      },
      training_style: {
        ...INITIAL_ONBOARDING_DATA.training_settings.training_style,
        progression_pace: 0.25,
      },
      recovery_preferences: {
        ...INITIAL_ONBOARDING_DATA.training_settings.recovery_preferences,
        recovery_priority: 0.91,
      },
    };
    profileSettingsRecordMock = {
      profile_id: "22222222-2222-4222-8222-222222222222",
      settings: savedSettings,
      updated_at: "2026-07-14T00:00:00.000Z",
    };
    renderNative(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId("onboarding-intent-improve_fitness"));
    await reachGoalsAndPreferences();

    expect(screen.getByTestId("compact-preferences-value").props.children).toContain(
      '"preset":"safer"',
    );
    fireEvent.press(screen.getByTestId("training-preferences-preset-push_harder"));
    advanceFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0].settings_patch).toEqual({
      preset: "push_harder",
    });
  });

  it("skips an optional goal when it is not selected or remains incomplete", async () => {
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-invalid-draft"));
    expect(screen.getByTestId("onboarding-goal-feedback")).toBeTruthy();
    advanceFromGoalsToSummary();
    expect(screen.getByText("Skip incomplete goal")).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalled());
    expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0]).not.toHaveProperty("goal");
  });

  it("sends one lifecycle request with a canonical optional goal and then completes locally", async () => {
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    advanceFromGoalsToSummary();
    expect(screen.getByText("Create Spring 5K")).toBeTruthy();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(mutationOrder).toEqual(["complete", "local-complete"]);
    const lifecycleInput = completeLifecycleSetupMutationMock.mock.calls[0]?.[0];
    expect(lifecycleInput.goal).toEqual(
      expect.objectContaining({
        title: "Spring 5K",
        target_date: "2099-06-01",
        activity_category: "run",
      }),
    );
    expect(lifecycleInput.goal).not.toHaveProperty("profile_id");
    expect(lifecycleInput.goal).not.toHaveProperty("id");
    expect(lifecycleInput).not.toHaveProperty("settings_patch");
    expect(invalidateGoalsMock).toHaveBeenCalled();
    expect(invalidateProfileSettingsMock).toHaveBeenCalled();
  });

  it("blocks rapid duplicate Finish presses with one synchronous in-flight request", async () => {
    const lifecycleResolution: { current?: (value: LifecycleResult) => void } = {};
    completeLifecycleSetupMutationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          lifecycleResolution.current = resolve;
        }),
    );
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    advanceFromGoalsToSummary();

    const finish = screen.getByText("Finish");
    fireEvent.press(finish);
    fireEvent.press(finish);
    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));

    lifecycleResolution.current?.({
      status: "completed",
      goal: { status: "skipped", retryable: false },
      settings: { status: "saved", retryable: false },
      retryable: false,
      cache_tags: [
        "onboarding.getImportedOnboardingValues",
        "goals.list",
        "profileSettings.getForProfile",
      ],
    });
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("gates local completion and offers retry when lifecycle completion fails", async () => {
    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => {
      mutationOrder.push("complete");
      throw new Error("completion failed");
    });
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    advanceFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(screen.getByText("Setup could not be completed")).toBeTruthy());
    expect(screen.getAllByText(/Required setup could not be confirmed/).length).toBe(2);
    expect(screen.getByTestId("onboarding-status-dismiss")).toBeTruthy();
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
    expect(completeOnboardingMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("retries the same idempotent lifecycle contract after a successful response is lost", async () => {
    completeLifecycleSetupMutationMock.mockRejectedValueOnce(
      new Error("response lost after server commit"),
    );
    peopleItemsMock = [profileFixture(SOCIAL_IDS.newProfile)];
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByTestId(`onboarding-profile-${SOCIAL_IDS.newProfile}-identity`));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByText("Setup could not be completed")).toBeTruthy());
    expect(followProfileMutationMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));

    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(2);
    expect(completeLifecycleSetupMutationMock.mock.calls[1]?.[0]).toEqual(
      completeLifecycleSetupMutationMock.mock.calls[0]?.[0],
    );
    expect(followProfileMutationMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a completed recovery marker and still navigates when cleanup fails", async () => {
    jest
      .mocked(SecureStore.deleteItemAsync)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    advanceFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    const recovery = await loadOnboardingRecovery("user-1");
    expect(recovery?.status).toBe("completed");
    expect(Object.keys(recovery ?? {}).sort()).toEqual([
      "expiresAt",
      "status",
      "userId",
      "version",
    ]);
    expect(hasPendingOnboardingRecovery(recovery)).toBe(false);
  });

  it("restores only optional retry state and uses current profile identity after remount", async () => {
    await seedRecovery(
      {
        full_name: "Riley Chen",
        username: "riley_runs",
        should_create_goal: true,
        goal_draft: {
          title: "Spring 5K",
          targetDate: "2099-06-01",
          importance: 8,
          goalType: "race_performance",
          activityCategory: "run",
          raceDistanceKm: 5,
          raceTargetMode: "time",
          targetDuration: "25:00",
          targetPace: "",
          targetWatts: null,
          targetBpm: null,
          thresholdTestDuration: "20:00",
          consistencySessionsPerWeek: 4,
          consistencyWeeks: 8,
        },
      },
      {
        goal: { status: "failed", retryable: true },
        settings: { status: "saved", retryable: false },
      },
    );
    mockCurrentProfile = {
      ...mockCurrentProfile,
      full_name: "Current Profile Name",
      username: "current_profile",
    };

    renderNative(<OnboardingScreen />);

    await waitFor(() => expect(screen.getByTestId("onboarding-status-modal")).toBeTruthy());
    expect(screen.getAllByText(/goal could not be saved/).length).toBe(2);
    expect(completeOnboardingMock).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalled());
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.objectContaining({ title: "Spring 5K" }),
        profile: expect.objectContaining({
          full_name: "Current Profile Name",
          username: "current_profile",
        }),
      }),
    );
  });

  it("uses retryable recovery copy and requires explicit Continue while dismiss allows retry", async () => {
    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => {
      mutationOrder.push("complete");
      return {
        status: "completed" as const,
        goal: { status: "failed" as const, retryable: true },
        settings: { status: "saved" as const, retryable: false },
        retryable: true,
        cache_tags: [] as never,
      };
    });
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    advanceFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(screen.getAllByText(/goal could not be saved/).length).toBe(2));
    expect(screen.getAllByText(/tap Finish to retry goal/).length).toBe(2);
    expect(mutationOrder).toEqual(["complete"]);
    expect(completeOnboardingMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("onboarding-status-dismiss"));
    await waitFor(() => expect(screen.queryByTestId("onboarding-status-modal")).toBeNull());
    expect(completeOnboardingMock).not.toHaveBeenCalled();

    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => {
      mutationOrder.push("retry");
      return {
        status: "already_completed" as const,
        goal: { status: "failed" as const, retryable: true },
        settings: { status: "unchanged" as const, retryable: false },
        retryable: true,
        cache_tags: [] as never,
      };
    });
    fireEvent.press(screen.getByText("Finish"));
    await waitFor(() => expect(screen.getByTestId("onboarding-status-modal")).toBeTruthy());
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByTestId("onboarding-status-confirm"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(mutationOrder).toEqual(["complete", "retry", "local-complete"]);
  });

  it("does not promise a retry for a non-retryable goal content conflict", async () => {
    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => ({
      status: "completed" as const,
      goal: {
        status: "failed" as const,
        retryable: false,
        failure_code: "content_conflict" as const,
      },
      settings: { status: "skipped" as const, retryable: false },
      retryable: false,
      cache_tags: [] as never,
    }));
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    advanceFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(screen.getAllByText(/goal could not be saved/).length).toBe(2));
    expect(screen.getAllByText(/Select Continue and manage goal later/).length).toBe(2);
    expect(screen.queryByText(/Finish to retry/)).toBeNull();
    expect(completeOnboardingMock).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("onboarding-status-confirm"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
  });

  it("shows the same recovery action when settings fail", async () => {
    completeLifecycleSetupMutationMock.mockImplementationOnce(async () => {
      mutationOrder.push("complete");
      return {
        status: "completed" as const,
        goal: { status: "saved" as const, retryable: false },
        settings: { status: "failed" as const, retryable: true },
        retryable: true,
        cache_tags: [] as never,
      };
    });
    renderNative(<OnboardingScreen />);
    await reachGoalsAndPreferences();
    fireEvent.press(screen.getByTestId("onboarding-add-goal"));
    fireEvent.press(screen.getByTestId("onboarding-goal-valid-draft"));
    advanceFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() =>
      expect(screen.getAllByText(/training preferences could not be saved/).length).toBe(2),
    );
    expect(screen.getAllByText(/tap Finish to retry training preferences/).length).toBe(2);
    fireEvent.press(screen.getByTestId("onboarding-status-confirm"));
    await waitFor(() => expect(completeOnboardingMock).toHaveBeenCalledTimes(1));
    expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1);
  });

  it("completes the required onboarding flow and submits the profile", async () => {
    renderNative(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-intent-train_event"));
    fireEvent.press(screen.getByTestId("onboarding-intent-track_activities"));
    await completeRequiredSteps();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(completeLifecycleSetupMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            experience_level: "beginner",
            full_name: "Riley Chen",
            max_hr: 185,
            weight_kg: 72,
            gender: "male",
            intents: ["train_event", "track_activities"],
          }),
          settings_patch: {},
        }),
      );
      expect(completeOnboardingMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("omits settings_patch when preferences are skipped while profile intents remain authoritative", async () => {
    renderNative(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId("onboarding-intent-improve_fitness"));
    await reachGoalsAndPreferences();
    skipFromGoalsToSummary();
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => expect(completeLifecycleSetupMutationMock).toHaveBeenCalledTimes(1));
    const lifecycleInput = completeLifecycleSetupMutationMock.mock.calls[0]?.[0];
    expect(lifecycleInput.profile.intents).toEqual(["improve_fitness"]);
    expect(lifecycleInput).not.toHaveProperty("settings_patch");
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

  it("marks every baseline metric optional and allows date of birth to be cleared", () => {
    renderNative(
      <TrainingBaselineHarness
        initialData={{
          dob: "1990-01-01",
          ftp: 210,
          max_hr: 185,
          sport_interests: ["cycling", "running", "swimming"],
          weight_kg: 72,
        }}
      />,
    );

    for (const label of ["Experience (Optional)", "Gender (Optional)"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText("Weight (Optional)").props["aria-required"]).toBe(false);
    expect(screen.getByLabelText("Max heart rate (Optional)")).toBeTruthy();
    expect(screen.getByLabelText("Resting heart rate (Optional)")).toBeTruthy();
    expect(screen.queryByLabelText("Bike FTP (Optional)")).toBeNull();
    expect(screen.queryByTestId("athlete-baseline-threshold-pace")).toBeNull();
    expect(screen.queryByTestId("athlete-baseline-css")).toBeNull();
    expect(screen.queryByText(/^Use estimate/)).toBeNull();

    fireEvent.press(screen.getByLabelText("Clear date"));

    expect(screen.getByTestId("athlete-baseline-dob").props.value).toBeUndefined();
  });

  it("only offers subtle estimate resets after baseline values differ from estimates", () => {
    renderNative(
      <TrainingBaselineHarness
        initialData={{
          dob: "1990-01-01",
          ftp: 220,
          max_hr: 190,
          sport_interests: ["cycling"],
          weight_kg: 72,
        }}
      />,
    );

    const maxHrReset = screen.getByTestId("athlete-baseline-maxHr-reset-estimate");
    expect(maxHrReset.props.variant).toBe("ghost");
    expect(screen.queryByTestId("athlete-baseline-ftp-reset-estimate")).toBeNull();

    fireEvent.press(maxHrReset);

    expect(screen.getByLabelText("Max heart rate (Optional)").props.value).toBe("185");
    expect(screen.queryByLabelText("Bike FTP (Optional)")).toBeNull();
    expect(screen.queryByText(/^Use estimate/)).toBeNull();
  });

  it("recalculates only estimated fields and preserves manual or cleared values", async () => {
    estimateMaxHRFromDOB.mockImplementation((dob?: string | null) => {
      if (!dob) return null;
      return dob === "1990-01-01" ? 185 : dob === "1980-01-01" ? 180 : 175;
    });
    renderNative(<OnboardingScreen />);
    fireEvent.changeText(screen.getByTestId("onboarding-full-name-input"), "Riley Chen");
    fireEvent.changeText(screen.getByTestId("onboarding-username-input"), "riley_runs");
    await flushUsernameDebounce();
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Skip"));
    await waitFor(() => expect(screen.getByText("Training baseline")).toBeTruthy());

    fireEvent.changeText(screen.getByTestId("athlete-baseline-dob"), "1990-01-01");
    await waitFor(() =>
      expect(screen.getByLabelText("Max heart rate (Optional)").props.value).toBe("185"),
    );
    fireEvent.changeText(screen.getByTestId("athlete-baseline-dob"), "1980-01-01");
    await waitFor(() =>
      expect(screen.getByLabelText("Max heart rate (Optional)").props.value).toBe("180"),
    );

    fireEvent.changeText(screen.getByLabelText("Max heart rate (Optional)"), "192");
    fireEvent.changeText(screen.getByTestId("athlete-baseline-dob"), "1970-01-01");
    expect(screen.getByLabelText("Max heart rate (Optional)").props.value).toBe("192");

    fireEvent.changeText(screen.getByLabelText("Max heart rate (Optional)"), "");
    fireEvent.changeText(screen.getByTestId("athlete-baseline-dob"), "1980-01-01");
    expect(screen.getByLabelText("Max heart rate (Optional)").props.value).toBe("");
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

    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    await waitFor(() => expect(screen.getByText("Training baseline")).toBeTruthy());
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    await waitFor(() => expect(screen.getByText("Training preferences")).toBeTruthy());
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));
    await waitFor(() => expect(screen.getByTestId("groups-people-step")).toBeTruthy());
    fireEvent.press(screen.getByTestId("onboarding-skip-button"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-finish-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("onboarding-finish-button"));

    await waitFor(() => {
      expect(completeLifecycleSetupMutationMock).toHaveBeenCalledWith({
        profile: {
          css_seconds_per_hundred_meters: undefined,
          dob: undefined,
          experience_level: "skip",
          ftp: undefined,
          full_name: "Riley Chen",
          gender: undefined,
          intents: [],
          max_hr: undefined,
          planning_timezone: "America/New_York",
          resting_hr: undefined,
          lthr: undefined,
          threshold_pace_seconds_per_km: undefined,
          username: "riley_runs",
          vo2max: undefined,
          weight_kg: undefined,
        },
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
    expect(screen.getAllByText("Imported from Wahoo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Imported from Wahoo").length).toBe(3);
    fireEvent.press(screen.getByText("beginner"));
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Skip"));
    fireEvent.press(screen.getByText("Skip"));
    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(completeLifecycleSetupMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            dob: "1988-04-05",
            gender: "female",
            weight_kg: 64,
          }),
        }),
      );
      expect(completeLifecycleSetupMutationMock.mock.calls[0]?.[0]?.profile).not.toHaveProperty(
        "ftp",
      );
    });
  });
});
