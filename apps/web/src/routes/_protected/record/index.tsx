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
  Map,
  Route as RouteIcon,
  ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";

import { api } from "../../../lib/api/client";
import {
  getBrowserRecordingCapabilities,
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
  const capabilities = useMemo(() => getBrowserRecordingCapabilities(), []);
  const selectedEventQuery = api.events.getById.useQuery(
    { id: launcher.eventId ?? "" },
    { enabled: Boolean(launcher.eventId) },
  );
  const selectedRouteQuery = api.routes.get.useQuery(
    { id: launcher.routeId ?? "" },
    { enabled: Boolean(launcher.routeId) },
  );

  const updateLauncher = (updates: Partial<typeof launcher>) => {
    void navigate({
      to: "/record",
      search: {
        ...launcher,
        ...updates,
      },
      replace: true,
    });
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
              <CardTitle className="flex items-center gap-2 text-3xl">
                <Circle className="h-6 w-6 text-muted-foreground" />
                Web recording launcher
              </CardTitle>
              <CardDescription>
                Pick today&apos;s plan, attach a route, and import a finished FIT file without
                pretending browser recording hardware parity already exists.
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
                      variant={launcher.category === option.value ? "default" : "outline"}
                      onClick={() => updateLauncher({ category: option.value })}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {
                    recordingActivityOptions.find((option) => option.value === launcher.category)
                      ?.description
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
                  "Attach one of today's scheduled workouts."
                }
                icon={Map}
                actionLabel={launcher.eventId ? "Change plan" : "Choose plan"}
                to="/record/plan"
                search={launcher}
              />
              <LauncherActionCard
                title="Route"
                description={
                  selectedRouteQuery.data?.name ?? "Attach a saved route for preview and guidance."
                }
                icon={RouteIcon}
                actionLabel={launcher.routeId ? "Change route" : "Choose route"}
                to="/record/route"
                search={launcher}
              />
              <LauncherActionCard
                title="Submit or import"
                description="Upload a completed FIT file through the existing ingestion pipeline."
                icon={FileUp}
                actionLabel="Open FIT import"
                to="/record/submit"
                search={launcher}
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
            <StateRow label="Activity" value={launcher.category} />
            <StateRow
              label="GPS"
              value={launcher.gps === "on" ? "browser requested" : "disabled"}
            />
            <StateRow
              label="Plan"
              value={selectedEventQuery.data?.activity_plan?.name ?? "No plan attached"}
            />
            <StateRow label="Route" value={selectedRouteQuery.data?.name ?? "No route attached"} />
            {launcher.routeId ? (
              <Button asChild variant="outline" className="w-full">
                <Link
                  to="/record/route-preview/$routeId"
                  params={{ routeId: launcher.routeId }}
                  search={launcher}
                >
                  Preview attached route
                </Link>
              </Button>
            ) : null}
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
              Hardware-heavy parity is staged explicitly instead of hidden behind an incomplete
              launcher.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <CapabilityRow
              icon={LocateFixed}
              label="GPS live capture"
              status={capabilities.geolocation ? "Staged next" : "Unavailable in this browser"}
              detail="Web parity currently stops at setup plus FIT ingestion. Background tasks and durable local recording are still deferred."
            />
            <CapabilityRow
              icon={Bluetooth}
              label="BLE sensors"
              status={
                capabilities.bluetooth && capabilities.secureContext
                  ? "Deferred"
                  : "Blocked by browser support"
              }
              detail="Sensor discovery and reconnection are not part of this tier, even when Web Bluetooth exists."
            />
            <CapabilityRow
              icon={RouteIcon}
              label="FTMS trainer control"
              status="Deferred"
              detail="Trainer control needs a separate browser-capability pass and is intentionally not wired into this launcher."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What ships in this stage</CardTitle>
            <CardDescription>
              This web pass focuses on honest parity for launch, selection, and submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Choose today&apos;s planned workout and preserve it in the launcher URL.</p>
            <p>Browse saved routes, preview the route shape, and attach it before recording.</p>
            <p>
              Import a finished FIT file using the same backend ingestion operations mobile already
              uses.
            </p>
            <p>
              Keep live browser session controls staged until a dedicated web-safe recorder design
              lands.
            </p>
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
  title,
  to,
}: {
  actionLabel: string;
  description: string;
  icon: typeof Circle;
  search: ReturnType<typeof Route.useSearch>;
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
        <Button asChild className="w-full">
          <Link to={to} search={search}>
            {actionLabel}
          </Link>
        </Button>
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
