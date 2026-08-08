import React from "react";

import { createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();
const pushMock = jest.fn();
const refetchMock = jest.fn();
let integrationOverviewErrorMock: Error | null = null;
let integrationOverviewMock: unknown[] | undefined;
let integrationOverviewHasCachedDataMock = false;
let deepLinkHandlerMock: ((event: { url: string }) => void) | null = null;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({
    children,
    onPress,
    ...props
  }: React.PropsWithChildren<{ onPress?: () => void } & Record<string, unknown>>) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock("expo-linking", () => ({
  __esModule: true,
  addEventListener: jest.fn((_event: string, handler: (event: { url: string }) => void) => {
    deepLinkHandlerMock = handler;
    return { remove: jest.fn() };
  }),
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
    profiles: {
      get: {
        useQuery: () => ({ data: { id: "11111111-1111-4111-8111-111111111111" } }),
      },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: () => ({
          data: {
            contractVersion: "athlete-read-model-v1",
            profileId: "11111111-1111-4111-8111-111111111111",
            asOf: "2026-08-01T12:00:00.000Z",
            publishedRevision: 1,
            algorithmVersion: "athlete-state-projection-v1",
            publishedState: { publishedAt: "2026-08-01T12:00:00.000Z" },
            status: {
              freshness: "fresh",
              rebuildStatus: "fresh",
              importStatus: "complete",
            },
          },
        }),
      },
    },
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
                      importRun: null,
                    },
                    athleteState: { status: "unavailable", revision: null },
                    plannedActivities: {
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
                      importRun: null,
                    },
                    athleteState: { status: "current", revision: 1 },
                    plannedActivities: {
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
                      importRun: null,
                    },
                    athleteState: { status: "failed_incomplete", revision: 1 },
                    plannedActivities: {
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
              fieldsUpdated: ["weight_kg"],
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
  Button: ({ testId, testID, ...props }: Record<string, unknown> & { testId?: string }) =>
    React.createElement("Button", { ...props, testID: testId ?? testID }),
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
    pushMock.mockReset();
    refetchMock.mockReset();
    integrationOverviewErrorMock = null;
    integrationOverviewMock = undefined;
    integrationOverviewHasCachedDataMock = false;
    deepLinkHandlerMock = null;
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

  it("shows the durable disconnect transition without offering a false reconnect", () => {
    integrationOverviewMock = [
      {
        actions: [],
        configured: true,
        activityHistory: {
          lastError: null,
          lastFailedAt: null,
          lastSucceededAt: null,
          queuedJobId: null,
          status: "idle",
          importRun: null,
        },
        athleteState: { status: "unavailable", revision: null },
        plannedActivities: {
          lastError: null,
          lastFailedAt: null,
          lastSucceededAt: null,
          queuedJobId: null,
          status: "automatic",
        },
        providerHealth: { lastError: null, status: "disconnecting" },
        setupData: {
          lastError: null,
          lastFailedAt: null,
          lastSucceededAt: null,
          status: "idle",
        },
        connected: false,
        integrationId: null,
        label: "Wahoo",
        primaryAction: null,
        provider: "wahoo",
        summary: {
          badge: "Disconnecting",
          health: "disconnecting",
          subtitle: "Revoking provider access",
          title: "Wahoo",
        },
      },
    ];

    renderNative(<IntegrationsScreen />);

    expect(screen.getByText("Disconnecting")).toBeTruthy();
    expect(screen.getByText("Revoking provider access")).toBeTruthy();
    expect(screen.queryByTestId("integration-connect-wahoo")).toBeNull();
    expect(screen.queryByTestId("integration-disconnect-wahoo")).toBeNull();
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

  it("shows non-sensitive copy for a provider identity callback failure", () => {
    renderNative(<IntegrationsScreen />);

    act(() => {
      deepLinkHandlerMock?.({
        url: "gradientpeak-dev://integrations?error=provider_identity_failed&error_detail=provider-account-42",
      });
    });

    expect(screen.getAllByText("Could not verify the provider account.").length).toBeTruthy();
    expect(screen.queryByText("provider-account-42")).toBeNull();
  });

  it("explains how to recover from Wahoo's active-authorization limit", () => {
    renderNative(<IntegrationsScreen />);

    act(() => {
      deepLinkHandlerMock?.({
        url: "gradientpeak-dev://integrations?integration=failed&provider=wahoo&error=wahoo_token_limit_exceeded",
      });
    });

    expect(
      screen.getAllByText(
        "Wahoo has too many active GradientPeak authorizations. Revoke GradientPeak in your Wahoo account, then try again.",
      ).length,
    ).toBeTruthy();
  });
});
