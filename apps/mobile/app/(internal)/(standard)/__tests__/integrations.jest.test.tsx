import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const refetchMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: backMock }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock("expo-linking", () => ({
  __esModule: true,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  createURL: jest.fn(() => "gradientpeak-dev://integrations"),
}));

jest.mock("expo-web-browser", () => ({
  __esModule: true,
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: (mutation: { useMutation?: () => unknown }) =>
    mutation.useMutation?.() ?? {
      mutateAsync: jest.fn(async () => ({ url: "https://example.test" })),
      isPending: false,
    },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      integrations: {
        getSyncOverview: { invalidate: jest.fn(async () => undefined) },
        list: { invalidate: jest.fn(async () => undefined) },
      },
    }),
    integrations: {
      list: {
        useQuery: () => ({
          data: [{ provider: "strava" }],
          refetch: refetchMock,
          isLoading: false,
        }),
      },
      getSyncOverview: {
        useQuery: () => ({
          data: [
            {
              actions: ["disconnect"],
              activityHistory: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "unsupported",
              },
              plannedWorkouts: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "unsupported",
              },
              providerHealth: {
                lastError: null,
                status: "connected",
              },
              setupData: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                status: "unsupported",
              },
              connected: true,
              integrationId: "integration-strava",
              label: "Strava",
              provider: "strava",
            },
            {
              actions: ["disconnect", "sync_now"],
              activityHistory: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "idle",
              },
              plannedWorkouts: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "automatic",
              },
              providerHealth: {
                lastError: null,
                status: "connected",
              },
              setupData: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: "2026-05-17T12:00:00.000Z",
                status: "refreshed",
              },
              connected: true,
              integrationId: "integration-wahoo",
              label: "Wahoo",
              provider: "wahoo",
            },
            {
              actions: ["disconnect"],
              activityHistory: {
                lastError: "401 unauthorized",
                lastFailedAt: "2026-05-17T12:00:00.000Z",
                lastSucceededAt: null,
                queuedJobId: null,
                status: "failed",
              },
              plannedWorkouts: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "unsupported",
              },
              providerHealth: {
                lastError: "401 unauthorized",
                status: "needs_reconnect",
              },
              setupData: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                status: "unsupported",
              },
              connected: true,
              integrationId: "integration-garmin",
              label: "Garmin Connect",
              provider: "garmin",
            },
          ],
          refetch: refetchMock,
          isLoading: false,
        }),
      },
      getAuthUrl: {
        useMutation: () => ({
          mutateAsync: jest.fn(async () => ({ url: "https://example.test" })),
        }),
      },
      disconnect: {
        useMutation: () => ({ mutateAsync: jest.fn(async () => undefined) }),
      },
      syncNow: {
        useMutation: () => ({
          mutateAsync: jest.fn(async () => ({
            jobId: "job-1",
            queued: true,
            setupRefresh: {
              fieldsFilled: [],
              fieldsKept: ["dob"],
              fieldsUpdated: ["weight_kg", "ftp"],
              keptExistingValues: true,
              status: "succeeded",
            },
          })),
        }),
      },
      refreshSetupData: {
        useMutation: () => ({
          mutateAsync: jest.fn(async () => ({
            fieldsFilled: ["dob"],
            fieldsKept: [],
            fieldsUpdated: ["dob"],
            keptExistingValues: true,
            provider: "wahoo",
            status: "succeeded",
          })),
        }),
      },
    },
  },
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Check: createHost("Check"),
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
}));

const IntegrationsScreen = require("../integrations").default;

describe("integrations screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    refetchMock.mockReset();
  });

  it("renders provider connections with sync status actions instead of import setup", () => {
    renderNative(<IntegrationsScreen />);

    expect(screen.getByTestId("integration-provider-strava")).toBeTruthy();
    expect(screen.queryByTestId("integration-refresh-setup-wahoo")).toBeNull();
    expect(screen.getByTestId("integration-sync-now-wahoo")).toBeTruthy();
    expect(screen.queryByTestId("integration-refresh-setup-strava")).toBeNull();
    expect(screen.queryByTestId("integration-sync-now-strava")).toBeNull();
    expect(screen.queryByText("Import FIT Activity")).toBeNull();
    expect(screen.getByText("Automatic history import")).toBeTruthy();
    expect(screen.getByText("Setup data: Refreshed safely.")).toBeTruthy();
    expect(screen.getByText("Planned workouts: Automatic when connected.")).toBeTruthy();
    expect(screen.getByTestId("integration-reconnect-garmin")).toBeTruthy();
    expect(screen.queryByTestId("integration-sync-now-garmin")).toBeNull();
  });

  it("shows sync now queued copy", async () => {
    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByTestId("integration-sync-now-wahoo"));

    await waitFor(() => {
      expect(
        screen.getAllByText(
          "Updated weight and FTP from Wahoo. Kept your existing GradientPeak date of birth because Wahoo differs. Recent history sync has been queued.",
        ).length,
      ).toBeTruthy();
    });
  });

  it("navigates back from the custom header", () => {
    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByTestId("back-button"));
    expect(backMock).toHaveBeenCalled();
  });

  it("explains that local GradientPeak data remains on disconnect", () => {
    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByTestId("integration-disconnect-strava"));

    expect(
      screen.getAllByText(
        "Disconnect Strava? Existing GradientPeak activities, files, plans, and metrics stay in your account. Future provider sync will stop until you reconnect.",
      ).length,
    ).toBeTruthy();
  });
});
