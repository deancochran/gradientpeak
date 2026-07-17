import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api/client";

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

function IntegrationsPage() {
  const utils = api.useUtils();
  const overviewQuery = api.integrations.getSyncOverview.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnReconnect: true,
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
      toast.success("Setup data refreshed");
    },
    onError: () => toast.error("Unable to refresh setup data"),
  });
  const disconnectMutation = api.integrations.disconnect.useMutation({
    onSuccess: async () => {
      await utils.integrations.getSyncOverview.invalidate();
      await utils.integrations.list.invalidate();
      toast.success("Integration disconnected");
    },
    onError: () => toast.error("Unable to disconnect integration"),
  });

  const integrations = overviewQuery.data?.filter((integration) => integration.configured) ?? [];

  return (
    <div className="container mx-auto max-w-4xl py-4">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Review provider status, queue supported manual syncs, and disconnect linked accounts.
          </p>
        </div>

        {overviewQuery.isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : overviewQuery.error ? (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Couldn’t load integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Retry to check provider availability and sync status.
              </p>
              <Button onClick={() => void overviewQuery.refetch()}>Retry</Button>
            </CardContent>
          </Card>
        ) : integrations.length === 0 ? (
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
            {integrations.map((integration) => {
              const isMutating =
                syncNowMutation.isPending ||
                refreshSetupMutation.isPending ||
                disconnectMutation.isPending;
              const canSyncNow = integration.actions.includes("sync_now") && integration.connected;
              const canRefreshSetup =
                integration.actions.includes("refresh_setup_data") && integration.connected;
              const connectDeferred =
                integration.primaryAction === "connect" ||
                integration.primaryAction === "reconnect";

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
                        status={integration.activityHistory.status}
                        detail={`Last synced: ${formatSyncDate(integration.activityHistory.lastSucceededAt)}`}
                      />
                      <StatusBlock
                        label="Planned workouts"
                        status={integration.plannedWorkouts.status}
                        detail={`Last synced: ${formatSyncDate(integration.plannedWorkouts.lastSucceededAt)}`}
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

                    <div className="flex flex-wrap gap-2">
                      {connectDeferred ? (
                        <Button variant="outline" disabled title="Web OAuth return is deferred">
                          {integration.primaryAction === "reconnect" ? "Reconnect" : "Connect"}{" "}
                          deferred
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
                      {integration.actions.includes("disconnect") && integration.connected ? (
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
                          Disconnect
                        </Button>
                      ) : null}
                    </div>

                    {connectDeferred ? (
                      <p className="text-xs text-muted-foreground">
                        Web connect/reconnect is deferred because the current OAuth flow stores a
                        mobile return URI only.
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
      <p className="capitalize text-muted-foreground">{formatStatus(status)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
