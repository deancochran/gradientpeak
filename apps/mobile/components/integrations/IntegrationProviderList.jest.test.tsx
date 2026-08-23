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
      importRun: null,
    },
    configured: true,
    connected: false,
    integrationId: null,
    label: "Wahoo",
    onboarding: {
      summary: "Import profile details and activity history from your Wahoo account.",
      evidence: { activityHistory: true, profileDetails: true },
    },
    plannedActivities: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "unsupported",
    },
    primaryAction: "connect",
    provider: "wahoo",
    providerHealth: { lastError: null, status: "unsupported" },
    setupData: {
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      profile: { dob: null, gender: null, onboarding_status: "provider_selection" },
      sources: {},
      status: "idle",
      values: {},
    },
    summary: {
      badge: "Available",
      health: "unavailable",
      subtitle: "Not connected",
      title: "Wahoo",
    },
    ...overrides,
  };
}

describe("IntegrationProviderList", () => {
  it("uses an accessible shared loading status without a duplicate header announcement", async () => {
    const { getAllByText, getByRole } = await render(
      <IntegrationProviderList integrations={[]} isLoading onConnect={jest.fn()} />,
    );

    expect(getByRole("progressbar", { name: "Checking…" }).props.accessibilityState).toMatchObject({
      busy: true,
    });
    expect(getAllByText("Checking…")).toHaveLength(1);
  });

  it("uses a labeled 48dp icon-sized Button for provider actions and preserves callbacks", async () => {
    const onConnect = jest.fn();
    const { getByTestId } = await render(
      <IntegrationProviderList integrations={[createIntegration()]} onConnect={onConnect} />,
    );

    const connectButton = getByTestId("integration-connect-wahoo");
    expect(connectButton.props.accessibilityLabel).toBe("Connect Wahoo");
    expect(connectButton.props.accessibilityRole).toBe("button");
    expect(connectButton.props.accessibilityState).toEqual({ disabled: false });
    expect(connectButton.props.className).toContain("min-h-12");
    await fireEvent.press(connectButton);
    expect(onConnect).toHaveBeenCalledWith("wahoo");
  });

  it("uses semantic success and info status colors", async () => {
    const connected = createIntegration({
      connected: true,
      integrationId: "integration-1",
      primaryAction: null,
      providerHealth: { lastError: null, status: "connected" },
      summary: {
        badge: "Connected",
        health: "connected",
        subtitle: "Ready",
        title: "Wahoo",
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
    const connectedView = await render(
      <IntegrationProviderList integrations={[connected]} onConnect={jest.fn()} />,
    );
    expect(connectedView.getByText("Connected").props.className).toContain(
      "text-success-subtle-foreground",
    );
    await connectedView.rerender(
      <IntegrationProviderList integrations={[syncing]} onConnect={jest.fn()} />,
    );
    expect(connectedView.getByText("Syncing").props.className).toContain(
      "text-info-subtle-foreground",
    );
  });

  it("announces a pending provider action once through the shared spinner", async () => {
    const { getByLabelText, queryByText } = await render(
      <IntegrationProviderList
        integrations={[createIntegration()]}
        onConnect={jest.fn()}
        pendingByProvider={{ wahoo: "connect" }}
      />,
    );

    expect(getByLabelText("Wahoo action in progress").props).toMatchObject({
      accessibilityLiveRegion: "polite",
      accessibilityRole: "progressbar",
      accessibilityState: { busy: true },
    });
    expect(queryByText("Wahoo action in progress")).toBeNull();
  });

  it("renders transitional cached data without published state as unavailable", async () => {
    const transitional = createIntegration();
    const { getByText } = await render(
      <IntegrationProviderList integrations={[transitional]} onConnect={jest.fn()} />,
    );

    expect(getByText("State unavailable")).toBeTruthy();
  });

  it("shows truthful rebuild state and opens the exact imported batch", async () => {
    const onViewImportedActivities = jest.fn();
    const importRunId = "77777777-7777-4777-8777-777777777777";
    const integration = createIntegration({
      activityHistory: {
        importRun: {
          id: importRunId,
          status: "completed",
          importedCount: 12,
          skippedCount: 1,
          failedCount: 0,
        },
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: "2026-08-01T12:00:00.000Z",
        queuedJobId: null,
        status: "synced",
      },
    });
    const { getByTestId, getByText } = await render(
      <IntegrationProviderList
        integrations={[integration]}
        onConnect={jest.fn()}
        onViewImportedActivities={onViewImportedActivities}
        publishedState={{
          contractVersion: "athlete-read-model-v1",
          profileId: "11111111-1111-4111-8111-111111111111",
          asOf: "2026-08-01T12:00:00.000Z",
          publishedRevision: 4,
          algorithmVersion: "athlete-state-projection-v1",
          status: {
            freshness: "stale",
            rebuildStatus: "rebuilding",
            importStatus: "complete",
            sourceRevision: 5,
            publishedRevision: 4,
            coverage: { startAt: null, endAt: null, lastActivityAt: null },
          },
        }}
      />,
    );

    expect(getByText(/State rebuilding/)).toBeTruthy();
    await fireEvent.press(getByTestId("integration-view-import-wahoo"));
    expect(onViewImportedActivities).toHaveBeenCalledWith(importRunId);
  });

  it.each([
    ["pending", "Activities imported; state pending"],
    ["rebuilding", "State rebuilding"],
    ["fresh", "State current"],
    ["failed_incomplete", "History incomplete after failed import"],
  ] as const)("renders truthful athlete-state status %s", async (status, expected) => {
    const integration = createIntegration();
    const { getByText } = await render(
      <IntegrationProviderList
        integrations={[integration]}
        onConnect={jest.fn()}
        publishedState={{
          contractVersion: "athlete-read-model-v1",
          profileId: "11111111-1111-4111-8111-111111111111",
          asOf: "2026-08-01T12:00:00.000Z",
          publishedRevision: 4,
          algorithmVersion: "athlete-state-projection-v1",
          status: {
            freshness: status === "fresh" ? "fresh" : "stale",
            rebuildStatus: status === "failed_incomplete" ? "failed" : status,
            importStatus: status === "failed_incomplete" ? "failed" : "complete",
            sourceRevision: 4,
            publishedRevision: 4,
            coverage: { startAt: null, endAt: null, lastActivityAt: null },
          },
        }}
      />,
    );
    expect(getByText(expected)).toBeTruthy();
  });

  it("keeps a persisted disabled provider visible and disconnectable", async () => {
    const integration = createIntegration({
      configured: false,
      connected: true,
      primaryAction: "disconnect",
      providerHealth: { lastError: null, status: "connected" },
    });
    const onDisconnect = jest.fn();
    const { getByTestId } = await render(
      <IntegrationProviderList
        integrations={[integration]}
        onConnect={jest.fn()}
        onDisconnect={onDisconnect}
      />,
    );
    await fireEvent.press(getByTestId("integration-disconnect-wahoo"));
    expect(onDisconnect).toHaveBeenCalledWith(integration);
  });
});
