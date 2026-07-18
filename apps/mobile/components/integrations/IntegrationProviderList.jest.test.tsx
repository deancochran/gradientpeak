import { fireEvent, render } from "@testing-library/react-native";
import type { IntegrationOverviewItem } from "./IntegrationProviderList";
import { IntegrationProviderList } from "./IntegrationProviderList";

function createIntegration(
  overrides: Partial<IntegrationOverviewItem> = {},
): IntegrationOverviewItem {
  return {
    actions: [],
    activityHistory: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "idle",
    },
    configured: true,
    connected: false,
    integrationId: null,
    label: "Strava",
    plannedWorkouts: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "unsupported",
    },
    primaryAction: "connect",
    provider: "strava",
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
      title: "Strava",
    },
    ...overrides,
  };
}

describe("IntegrationProviderList", () => {
  it("uses an accessible shared loading status without a duplicate header announcement", () => {
    const { getAllByText, getByRole } = render(
      <IntegrationProviderList integrations={[]} isLoading onConnect={jest.fn()} />,
    );

    expect(getByRole("progressbar", { name: "Checking…" }).props.accessibilityState).toMatchObject({
      busy: true,
    });
    expect(getAllByText("Checking…")).toHaveLength(1);
  });

  it("uses a labeled 48dp icon-sized Button for provider actions and preserves callbacks", () => {
    const onConnect = jest.fn();
    const { getByTestId } = render(
      <IntegrationProviderList integrations={[createIntegration()]} onConnect={onConnect} />,
    );

    const connectButton = getByTestId("integration-connect-strava");
    expect(connectButton.props.accessibilityLabel).toBe("Connect Strava");
    expect(connectButton.props.accessibilityRole).toBe("button");
    expect(connectButton.props.accessibilityState).toEqual({ disabled: false });
    expect(connectButton.props.className).toContain("min-h-12");
    fireEvent.press(connectButton);
    expect(onConnect).toHaveBeenCalledWith("strava");
  });

  it("uses semantic success and info status colors", () => {
    const connected = createIntegration({
      connected: true,
      integrationId: "integration-1",
      primaryAction: null,
      providerHealth: { lastError: null, status: "connected" },
      summary: {
        badge: "Connected",
        health: "connected",
        subtitle: "Ready",
        title: "Strava",
      },
    });
    const syncing = createIntegration({
      label: "Wahoo",
      provider: "wahoo",
      summary: {
        badge: "Syncing",
        health: "syncing",
        subtitle: "Sync in progress",
        title: "Wahoo",
      },
    });
    const { getByText } = render(
      <IntegrationProviderList integrations={[connected, syncing]} onConnect={jest.fn()} />,
    );

    expect(getByText("Connected").props.className).toContain("text-success-subtle-foreground");
    expect(getByText("Syncing").props.className).toContain("text-info-subtle-foreground");
  });

  it("announces a pending provider action once through the shared spinner", () => {
    const { getByLabelText, queryByText } = render(
      <IntegrationProviderList
        integrations={[createIntegration()]}
        onConnect={jest.fn()}
        pendingByProvider={{ strava: "connect" }}
      />,
    );

    expect(getByLabelText("Strava action in progress").props).toMatchObject({
      accessibilityLiveRegion: "polite",
      accessibilityRole: "progressbar",
      accessibilityState: { busy: true },
    });
    expect(queryByText("Strava action in progress")).toBeNull();
  });
});
