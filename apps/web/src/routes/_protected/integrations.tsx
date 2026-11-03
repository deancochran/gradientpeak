import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { skipToken } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api/client";
import { getIntegrationPollingInterval } from "../../lib/integrations/polling";

export const Route = createFileRoute("/_protected/integrations")({
  component: IntegrationsPage,
});

function formatSyncDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function athleteStateCopy(status: string) {
  switch (status) {
    case "pending":
      return "Activities imported; state pending";
    case "rebuilding":
      return "State rebuilding";
    case "current":
    case "fresh":
      return "State current";
    case "failed_incomplete":
      return "History incomplete after failed import";
    default:
      return "State unavailable";
  }
}

function activityHistoryCopy(status: string) {
  switch (status) {
    case "queued":
      return "Activities queued";
    case "importing":
      return "Activities importing";
    case "synced":
      return "Activities imported";
    case "failed":
      return "History import failed";
    case "unsupported":
      return "History import unsupported";
    default:
      return "Ready to import";
  }
}

function getOAuthCallbackMessage(error: string | null) {
  switch (error) {
    case "authorization_denied":
      return "The provider connection was cancelled or denied. Try again when you are ready.";
    case "wahoo_token_limit_exceeded":
      return "This Wahoo account has too many active authorizations. Remove an older authorization in Wahoo, then try again.";
    case "invalid_state":
    case "missing_code":
    case "token_exchange_failed":
    case "provider_identity_failed":
    case "store_integration_failed":
    case "disconnect_in_progress":
      return "The provider could not be connected safely. Try again in a moment.";
    default:
      return "Integration connection failed. Try again.";
  }
}

function IntegrationsPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const profileQuery = api.profiles.get.useQuery();
  const publishedStateQuery = api.athleteIntelligence.getReadModel.useQuery(
    profileQuery.data
      ? {
          profileId: profileQuery.data.id,
          sections: { publishedState: true, status: true },
        }
      : skipToken,
    { enabled: Boolean(profileQuery.data) },
  );
  const overviewQuery = api.integrations.getSyncOverview.useQuery(undefined, {
    refetchInterval: (query) => {
      return getIntegrationPollingInterval(query.state.data);
    },
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation({
    onError: () => toast.error("Unable to start connection"),
  });
  const syncNowMutation = api.integrations.syncNow.useMutation({
    onSuccess: async () => {
      await utils.integrations.getSyncOverview.invalidate();
      toast.success("Sync queued");
    },
    onError: () => toast.error("Unable to start sync"),
  });
  const refreshSetupMutation = api.integrations.refreshSetupData.useMutation({
    onSuccess: async () => {
      await utils.integrations.getSyncOverview.invalidate();
      toast.success("Setup data refresh queued");
    },
    onError: () => toast.error("Unable to refresh setup data"),
  });
  const disconnectMutation = api.integrations.disconnect.useMutation({
    onSuccess: async () => {
      await utils.integrations.getSyncOverview.invalidate();
      toast.success("Disconnecting integration");
    },
    onError: () => toast.error("Unable to disconnect integration"),
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("integration");
    if (!outcome) return;

    if (outcome === "connected") toast.success("Integration connected");
    else toast.error(getOAuthCallbackMessage(url.searchParams.get("error")));
    url.searchParams.delete("error");
    url.searchParams.delete("integration");
    url.searchParams.delete("error_message");
    url.searchParams.delete("provider");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const integrations = overviewQuery.data ?? [];
  const hasCachedData = integrations.length > 0;

  const connect = async (provider: (typeof integrations)[number]["provider"]) => {
    const redirectUri = `${window.location.origin}/integrations`;
    try {
      const result = await getAuthUrlMutation.mutateAsync({ provider, redirectUri });
      window.location.assign(result.url);
    } catch {
      // The mutation owns the sanitized user-visible error.
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-4">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
            <p className="text-muted-foreground">
              Review provider status, queue supported manual syncs, and disconnect linked accounts.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={overviewQuery.isFetching}
            onClick={() => void overviewQuery.refetch()}
          >
            Refresh status
          </Button>
        </div>

        {overviewQuery.error ? (
          <Card className="border-destructive/30" role="alert">
            <CardHeader>
              <CardTitle>Couldn’t refresh integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {hasCachedData
                  ? "Showing the last known provider status. Retry when your connection recovers."
                  : "Retry to check provider availability and sync status."}
              </p>
              <Button onClick={() => void overviewQuery.refetch()}>Retry</Button>
            </CardContent>
          </Card>
        ) : null}

        {overviewQuery.isLoading && !hasCachedData ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Loader2 aria-label="Checking integrations" className="h-8 w-8 animate-spin" />
          </div>
        ) : !overviewQuery.error && integrations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No integrations available</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Server credentials are not configured for a provider yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Athlete state</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBlock
                  label="Published baseline"
                  status={athleteStateCopy(
                    publishedStateQuery.data?.status?.importStatus === "failed"
                      ? "failed_incomplete"
                      : (publishedStateQuery.data?.status?.rebuildStatus ?? "unavailable"),
                  )}
                  detail={`Published: ${formatSyncDate(publishedStateQuery.data?.publishedState?.publishedAt ?? null)}`}
                />
              </CardContent>
            </Card>
            {integrations.map((integration) => {
              const importRun = integration.activityHistory.importRun;
              const isMutating =
                getAuthUrlMutation.isPending ||
                syncNowMutation.isPending ||
                refreshSetupMutation.isPending ||
                disconnectMutation.isPending;
              const canSyncNow = integration.actions.includes("sync_now") && integration.connected;
              const canRefreshSetup =
                integration.actions.includes("refresh_setup_data") && integration.connected;
              const canConnect =
                integration.configured &&
                (integration.primaryAction === "connect" ||
                  integration.primaryAction === "reconnect");
              const canRetryDisconnect =
                integration.providerHealth.status === "disconnecting" &&
                integration.primaryAction === "disconnect";

              return (
                <Card key={integration.provider}>
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>{integration.summary.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {integration.summary.subtitle}
                        </p>
                      </div>
                      <Badge variant="outline">{integration.summary.badge}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 text-sm sm:grid-cols-3">
                      <StatusBlock
                        label="Activity history"
                        status={activityHistoryCopy(integration.activityHistory.status)}
                        detail={`Last synced: ${formatSyncDate(integration.activityHistory.lastSucceededAt)}`}
                      />
                      <StatusBlock
                        label="Planned activities"
                        status={integration.plannedActivities.status}
                        detail={`Last synced: ${formatSyncDate(integration.plannedActivities.lastSucceededAt)}`}
                      />
                      <StatusBlock
                        label="Setup data"
                        status={integration.setupData.status}
                        detail={`Last refreshed: ${formatSyncDate(integration.setupData.lastSucceededAt)}`}
                      />
                    </div>

                    {integration.providerHealth.lastError ? (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {integration.providerHealth.lastError}
                      </p>
                    ) : null}
                    {integration.unresolvedReviewCount > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {integration.unresolvedReviewCount} imported{" "}
                        {integration.unresolvedReviewCount === 1
                          ? "activity needs"
                          : "activities need"}{" "}
                        review. Open the matching activity to resolve it.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {integration.providerHealth.status === "disconnecting" &&
                      !canRetryDisconnect ? (
                        <Button variant="outline" disabled>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting
                        </Button>
                      ) : canConnect ? (
                        <Button
                          variant="outline"
                          disabled={isMutating}
                          onClick={() => void connect(integration.provider)}
                        >
                          {integration.primaryAction === "reconnect" ? "Reconnect" : "Connect"}
                        </Button>
                      ) : null}
                      {canSyncNow ? (
                        <Button
                          variant="outline"
                          disabled={isMutating}
                          onClick={() => syncNowMutation.mutate({ provider: integration.provider })}
                        >
                          Sync now
                        </Button>
                      ) : null}
                      {canRefreshSetup ? (
                        <Button
                          variant="outline"
                          disabled={isMutating}
                          onClick={() =>
                            refreshSetupMutation.mutate({ provider: integration.provider })
                          }
                        >
                          Refresh setup data
                        </Button>
                      ) : null}
                      {integration.actions.includes("disconnect") &&
                      (integration.connected || canRetryDisconnect) ? (
                        <Button
                          variant="destructive"
                          disabled={isMutating}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Disconnect ${integration.label}? Your GradientPeak data stays. Sync stops.`,
                              )
                            ) {
                              disconnectMutation.mutate({ provider: integration.provider });
                            }
                          }}
                        >
                          {canRetryDisconnect ? "Retry disconnect" : "Disconnect"}
                        </Button>
                      ) : null}
                      {importRun ? (
                        <Button
                          onClick={() =>
                            void navigate({
                              to: "/activities",
                              search: { importRunId: importRun.id },
                            })
                          }
                          type="button"
                          variant="ghost"
                        >
                          View imported activities
                        </Button>
                      ) : null}
                      {integration.unresolvedReviewCount > 0 ? (
                        <Button
                          onClick={() => void navigate({ to: "/activities" })}
                          type="button"
                          variant="ghost"
                        >
                          Review imported activities
                        </Button>
                      ) : null}
                    </div>

                    {!integration.configured ? (
                      <p className="text-xs text-muted-foreground">
                        This provider is not configured on this server. No credentials are required
                        to view its availability.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBlock({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{formatStatus(status)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
