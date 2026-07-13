import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();
const refetchMock = jest.fn();
let integrationOverviewErrorMock: Error | null = null;
let integrationOverviewMock: unknown[] | undefined;
let integrationOverviewHasCachedDataMock = false;

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
          data:
            integrationOverviewErrorMock && !integrationOverviewHasCachedDataMock
              ? undefined
              : (integrationOverviewMock ?? [
                  {
                    actions: ["disconnect"],
                    configured: true,
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
                    primaryAction: "disconnect",
                    provider: "strava",
                    summary: {
                      badge: "Auto",
                      health: "connected",
                      subtitle: "Connected",
                      title: "Strava",
                    },
                  },
                  {
                    actions: ["disconnect", "sync_now"],
                    configured: true,
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
                    primaryAction: "disconnect",
                    provider: "wahoo",
                    summary: {
                      badge: "Auto",
                      health: "connected",
                      subtitle: "Connected",
                      title: "Wahoo",
                    },
                  },
                  {
                    actions: ["disconnect"],
                    configured: true,
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
                    primaryAction: "reconnect",
                    provider: "garmin",
                    summary: {
                      badge: "Reconnect",
                      health: "needs_reconnect",
                      subtitle: "Sync paused",
                      title: "Garmin Connect",
                    },
                  },
                ]),
          error: integrationOverviewErrorMock,
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
  AlertCircle: createHost("AlertCircle"),
  Link: createHost("Link"),
  RefreshCcw: createHost("RefreshCcw"),
  Unlink: createHost("Unlink"),
}));

const IntegrationsScreen = require("../integrations").default;

describe("integrations screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    refetchMock.mockReset();
    integrationOverviewErrorMock = null;
    integrationOverviewMock = undefined;
    integrationOverviewHasCachedDataMock = false;
  });

  it("renders compact provider cards with one action", () => {
    renderNative(<IntegrationsScreen />);

    expect(screen.getByTestId("integration-provider-strava")).toBeTruthy();
    expect(screen.getByTestId("integration-provider-wahoo")).toBeTruthy();
    expect(screen.getByText("2/3 ready")).toBeTruthy();
    expect(screen.getAllByText("Auto").length).toBeTruthy();
    expect(screen.queryByTestId("integration-sync-now-wahoo")).toBeNull();
    expect(screen.getByTestId("integration-disconnect-wahoo")).toBeTruthy();
    expect(screen.getByTestId("integration-reconnect-garmin")).toBeTruthy();
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
      screen.getAllByText("Disconnect Strava? Your GradientPeak data stays. Sync stops.").length,
    ).toBeTruthy();
  });

  it("shows the missing-credentials state for a successful empty response", () => {
    integrationOverviewMock = [];
    renderNative(<IntegrationsScreen />);

    expect(screen.getByText("Server credentials are not configured.")).toBeTruthy();
    expect(screen.queryByTestId("integration-provider-list-error")).toBeNull();
  });

  it("shows a retryable query error without enabling unknown providers", () => {
    integrationOverviewErrorMock = new Error("network unavailable");
    renderNative(<IntegrationsScreen />);

    expect(screen.getByTestId("integration-provider-list-error")).toBeTruthy();
    expect(screen.queryByTestId("integration-provider-fallback-strava")).toBeNull();
    expect(screen.queryByTestId("integration-connect-strava")).toBeNull();
    fireEvent.press(screen.getByTestId("integration-provider-list-retry"));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("keeps only cached configured providers actionable during a refresh error", () => {
    integrationOverviewErrorMock = new Error("network unavailable");
    integrationOverviewHasCachedDataMock = true;

    renderNative(<IntegrationsScreen />);

    expect(screen.getByTestId("integration-provider-list-error")).toBeTruthy();
    expect(screen.getByTestId("integration-provider-strava")).toBeTruthy();
    expect(screen.getByTestId("integration-disconnect-strava")).toBeTruthy();
    expect(screen.queryByTestId("integration-provider-fallback-strava")).toBeNull();
  });
});
