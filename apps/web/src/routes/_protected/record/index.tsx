import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Separator } from "@repo/ui/components/separator";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bluetooth,
  Circle,
  FileUp,
  LocateFixed,
  Map as MapIcon,
  Play,
  Route as RouteIcon,
  ShieldAlert,
} from "lucide-react";

import { api } from "../../../lib/api/client";
import { useTimerOnlyRecording } from "../../../lib/recording/provider";
import { useBrowserRecordingAdapters } from "../../../lib/recording/use-browser-recording-adapters";
import {
  recordingActivityOptions,
  recordingGpsOptions,
  validateRecordingSearch,
} from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordPage,
});

function RecordPage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const recording = useTimerOnlyRecording();
  const lockedSnapshot = recording.state.reducer.snapshot;
  const effectiveLauncher = lockedSnapshot
    ? {
        category: lockedSnapshot.activity.category,
        gps: launcher.gps,
        ...(lockedSnapshot.activity.eventId != null
          ? { eventId: lockedSnapshot.activity.eventId }
          : {}),
        ...(lockedSnapshot.activity.routeId != null
          ? { routeId: lockedSnapshot.activity.routeId }
          : {}),
      }
    : launcher;
  const adapters = useBrowserRecordingAdapters();
  const browserBle = adapters.find((adapter) => adapter.id === "browser-ble");
  const desktopBridge = adapters.find((adapter) => adapter.id === "desktop-bridge");
  const selectedEventQuery = api.events.getById.useQuery(
    { id: effectiveLauncher.eventId ?? "" },
    { enabled: Boolean(effectiveLauncher.eventId) },
  );
  const selectedRouteQuery = api.routes.get.useQuery(
    { id: effectiveLauncher.routeId ?? "" },
    { enabled: Boolean(effectiveLauncher.routeId) },
  );
  const selectedActivityPlanId = selectedEventQuery.data?.activity_plan?.id;
  const hasActiveTimerSession =
    recording.state.reducer.lifecycle === "recording" ||
    recording.state.reducer.lifecycle === "paused";
  const canOpenTimerSession =
    recording.hydrationStatus === "ready" &&
    (hasActiveTimerSession || !effectiveLauncher.eventId || Boolean(selectedActivityPlanId));

  const updateLauncher = (updates: Partial<typeof launcher>) => {
    if (lockedSnapshot) return;
    void navigate({
      to: "/record",
      search: {
        ...launcher,
        ...updates,
      },
      replace: true,
    });
  };

  const openTimerSession = () => {
    if (!canOpenTimerSession) return;

    if (!hasActiveTimerSession) {
      const configured = recording.configure({
        category: effectiveLauncher.category,
        eventId: effectiveLauncher.eventId,
        activityPlanId: selectedActivityPlanId,
        routeId: effectiveLauncher.routeId,
      });
      if (!configured) return;
    }
    void navigate({ to: "/record/session" });
  };

  const resumeRecoveredTimer = () => {
    recording.resume();
    void navigate({ to: "/record/session" });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Recording</Badge>
              <Badge>Tier 1 Web Parity</Badge>
            </div>
            <div className="space-y-2">
              <CardTitle aria-level={1} className="flex items-center gap-2 text-3xl" role="heading">
                <Circle className="h-6 w-6 text-muted-foreground" />
                Web recording launcher
              </CardTitle>
              <CardDescription>
                Attach plan and route context, record a foreground timer, recover after refresh,
                then review and queue the finished activity durably.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium">Activity</p>
                <div className="flex flex-wrap gap-2">
                  {recordingActivityOptions.map((option) => (
                    <Button
                      key={option.value}
                      disabled={Boolean(lockedSnapshot)}
                      variant={effectiveLauncher.category === option.value ? "default" : "outline"}
                      onClick={() => updateLauncher({ category: option.value })}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {
                    recordingActivityOptions.find(
                      (option) => option.value === effectiveLauncher.category,
                    )?.description
                  }
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Session mode</p>
                <div className="flex flex-wrap gap-2">
                  {recordingGpsOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={launcher.gps === option.value ? "default" : "outline"}
                      disabled={Boolean(lockedSnapshot)}
                      onClick={() => updateLauncher({ gps: option.value })}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {recordingGpsOptions.find((option) => option.value === launcher.gps)?.description}
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-3">
              <LauncherActionCard
                title="Plan"
                description={
                  selectedEventQuery.data?.activity_plan?.name ??
                  "Attach one of today's scheduled activities."
                }
                icon={MapIcon}
                actionLabel={effectiveLauncher.eventId ? "Change plan" : "Choose plan"}
                to="/record/plan"
                search={effectiveLauncher}
                locked={Boolean(lockedSnapshot)}
              />
              <LauncherActionCard
                title="Route"
                description={
                  selectedRouteQuery.data?.name ?? "Attach a saved route for preview and guidance."
                }
                icon={RouteIcon}
                actionLabel={effectiveLauncher.routeId ? "Change route" : "Choose route"}
                to="/record/route"
                search={effectiveLauncher}
                locked={Boolean(lockedSnapshot)}
              />
              <LauncherActionCard
                title="Submit or import"
                description="Upload a completed activity file through the existing ingestion pipeline."
                icon={FileUp}
                actionLabel="Open activity import"
                to="/record/submit"
                search={launcher}
                locked={false}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current launch state</CardTitle>
            <CardDescription>
              URL-backed setup so plan and route choices survive refreshes and shared links.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {recording.hydrationStatus === "hydrating" ? (
              <p className="rounded-lg border p-3 text-muted-foreground" role="status">
                Checking this browser for a saved timer…
              </p>
            ) : null}
            {recording.hydrationStatus === "error" && recording.error ? (
              <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
                <p className="text-destructive" role="alert">
                  {recording.error}
                </p>
                {recording.canTakeOver ? (
                  <Button variant="destructive" onClick={() => void recording.takeOver()}>
                    Take over recording
                  </Button>
                ) : null}
              </div>
            ) : null}
            {recording.hasRecoveredDraft ? (
              <div className="space-y-3 rounded-lg border border-primary/40 p-3">
                <div>
                  <p className="font-medium">Paused timer recovered</p>
                  <p className="text-xs text-muted-foreground">
                    Elapsed and moving time were restored. It will stay paused until you resume it.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={resumeRecoveredTimer}>
                    <Play className="h-4 w-4" /> Resume
                  </Button>
                  <Button variant="outline" onClick={recording.discardRecoveredDraft}>
                    Discard
                  </Button>
                </div>
              </div>
            ) : null}
            <StateRow label="Activity" value={effectiveLauncher.category} />
            <StateRow label="GPS" value="disabled" />
            <StateRow
              label="Plan"
              value={selectedEventQuery.data?.activity_plan?.name ?? "No plan attached"}
            />
            <StateRow label="Route" value={selectedRouteQuery.data?.name ?? "No route attached"} />
            {effectiveLauncher.routeId ? (
              <Button asChild variant="outline" className="w-full">
                <Link
                  to="/record/route-preview/$routeId"
                  params={{ routeId: effectiveLauncher.routeId }}
                  search={effectiveLauncher}
                >
                  Preview attached route
                </Link>
              </Button>
            ) : null}
            <Separator />
            <Button
              className="w-full"
              disabled={!canOpenTimerSession || recording.hasRecoveredDraft}
              onClick={openTimerSession}
            >
              <Play className="h-4 w-4" />
              {recording.hydrationStatus === "hydrating"
                ? "Checking for saved timer…"
                : hasActiveTimerSession
                  ? "Return to timer session"
                  : effectiveLauncher.eventId && !selectedActivityPlanId
                    ? "Loading selected plan…"
                    : "Configure timer session"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              Browser-safe limits
            </CardTitle>
            <CardDescription>
              The core workflow is equal across supported browsers. Hardware capability remains
              explicit and adapter-owned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <CapabilityRow
              icon={LocateFixed}
              label="GPS live capture"
              status="Not required"
              detail="Browser recording deliberately does not capture GPS. Native mobile remains the background GPS authority."
            />
            <CapabilityRow
              icon={Bluetooth}
              label="BLE sensors"
              status={
                browserBle?.status === "experimental"
                  ? "Optional transport only"
                  : "Unavailable in this browser"
              }
              detail="Web Bluetooth detection never implies sensor-complete parity. This browser adapter exposes no FTMS measurement or control claim."
            />
            <CapabilityRow
              icon={RouteIcon}
              label="FTMS trainer control"
              status={desktopBridge?.statusLabel ?? "Desktop adapter required"}
              detail="BLE scanning, FTMS measurement, and trainer control belong to the explicit desktop bridge adapter and are unavailable in the browser timer adapter."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What ships in this stage</CardTitle>
            <CardDescription>
              Browser-equal recording with desktop-ready adapter boundaries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Choose today&apos;s planned activity and preserve it in the launcher URL.</p>
            <p>Browse saved routes, preview the route shape, and attach it before recording.</p>
            <p>
              Finish into a durable local review artifact and queue an idempotent server submission.
            </p>
            <p>
              Recover active timers paused after refresh and fence ownership across tabs with an
              explicit takeover action.
            </p>
            {recording.history.length > 0 ? (
              <div className="space-y-2 border-t pt-3">
                <p className="font-medium text-foreground">Local recording history</p>
                {recording.history.slice(0, 5).map((artifact) => (
                  <div key={artifact.recordingSessionId} className="flex justify-between gap-3">
                    <span>{artifact.review.name}</span>
                    <span>{new Date(artifact.finishedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function LauncherActionCard({
  actionLabel,
  description,
  icon: Icon,
  search,
  locked,
  title,
  to,
}: {
  actionLabel: string;
  description: string;
  icon: typeof Circle;
  search: ReturnType<typeof Route.useSearch>;
  locked: boolean;
  title: string;
  to: "/record/plan" | "/record/route" | "/record/submit";
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {locked ? (
          <Button className="w-full" disabled>
            Locked for this session
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link to={to} search={search}>
              {actionLabel}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CapabilityRow({
  detail,
  icon: Icon,
  label,
  status,
}: {
  detail: string;
  icon: typeof Circle;
  label: string;
  status: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">{detail}</p>
    </div>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
