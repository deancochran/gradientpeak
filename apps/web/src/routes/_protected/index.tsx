import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CalendarDays, Target } from "lucide-react";
import { ActivityFeed } from "../../components/feed/activity-feed";
import { SearchLauncher } from "../../components/protected/search-launcher";
import { useAuth } from "../../components/providers/auth-provider";
import { api } from "../../lib/api/client";
import { loadRouteQuery } from "../../lib/api/route-loading";

export const Route = createFileRoute("/_protected/")({
  loader: async ({ context }) => {
    void context.apiUtils.athleteIntelligence.getThresholdOverview.prefetch({});
    await loadRouteQuery(
      () => context.apiUtils.home.getDashboard.getData(undefined),
      () => context.apiUtils.home.getDashboard.fetch(undefined),
    );
  },
  component: DashboardPage,
});

function ScheduleQuantification({
  objectiveIntensity,
  load,
}: {
  objectiveIntensity: number | null;
  load: number | null;
}) {
  return (
    <p>
      Common Load {load === null ? "unavailable" : Math.round(load * 10) / 10} · Intensity{" "}
      {objectiveIntensity === null ? "unavailable" : objectiveIntensity.toFixed(2)}
    </p>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const dashboardQuery = api.home.getDashboard.useQuery(undefined, { retry: false });
  const thresholdOverviewQuery = api.athleteIntelligence.getThresholdOverview.useQuery({});

  if (dashboardQuery.isError && !dashboardQuery.data) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <Card role="alert">
          <CardHeader>
            <CardTitle>Dashboard unavailable</CardTitle>
            <CardDescription>We could not load your dashboard. Please try again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => void dashboardQuery.refetch()}>
              Retry dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dashboard = dashboardQuery.data;
  const schedule = dashboard?.schedule.slice(0, 4) ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted-foreground">{user?.email ?? "Athlete"}</p>
        </div>
        <SearchLauncher mode="bar" />
      </section>

      {dashboardQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm">
            Dashboard updates are unavailable. Showing the most recent data.
          </p>
          <Button type="button" variant="outline" onClick={() => void dashboardQuery.refetch()}>
            Retry dashboard
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Fitness"
          value={
            dashboard?.currentLoadStatus ? dashboard.currentLoadStatus.longTermLoad.toFixed(1) : "—"
          }
          description={
            dashboard?.currentLoadStatus
              ? `Long-term load · ${dashboard.currentLoadStatus.maturity} maturity`
              : dashboardQuery.isLoading
                ? "Loading Common Load history"
                : "Complete Common Load history is unavailable"
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Fatigue"
          value={
            dashboard?.currentLoadStatus ? dashboard.currentLoadStatus.recentLoad.toFixed(1) : "—"
          }
          description={
            dashboard?.currentLoadStatus
              ? "Recent load"
              : dashboardQuery.isLoading
                ? "Loading Common Load history"
                : "Complete Common Load history is unavailable"
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Form"
          value={
            dashboard?.currentLoadStatus ? dashboard.currentLoadStatus.loadBalance.toFixed(1) : "—"
          }
          description={
            dashboard?.currentLoadStatus
              ? `Load balance · ${dashboard.currentLoadStatus.coverageStatus} coverage`
              : dashboardQuery.isLoading
                ? "Loading Common Load history"
                : "Complete Common Load history is unavailable"
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Consistency"
          value={dashboard ? `${dashboard.consistency.streak} days` : "..."}
          description={
            dashboard
              ? `${dashboard.consistency.weeklyCount} activities this week`
              : "Loading consistency"
          }
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <MetricCard
          title="Active Plan"
          value={dashboard?.activePlan?.name ?? (dashboardQuery.isLoading ? "…" : "No active plan")}
          description={
            dashboardQuery.isLoading
              ? "Loading active plan"
              : "Create or assign a plan to see progress here"
          }
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
            <CardDescription>
              {thresholdOverviewQuery.isLoading
                ? "Loading calculated thresholds"
                : thresholdOverviewQuery.isError
                  ? "Threshold status is unavailable"
                  : thresholdOverviewQuery.data?.publication.status === "unavailable"
                    ? "Calculated thresholds are not available yet"
                    : "Calculated thresholds are available"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/thresholds">Manage thresholds</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <ActivityFeed />

      <section className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Schedule</CardTitle>
            <CardDescription>Your next planned sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading upcoming activities...</p>
            ) : schedule.length > 0 ? (
              <div className="space-y-3">
                {schedule.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{item.activityName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.activity_category} on {item.date}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>
                        {item.estimatedDuration === null
                          ? "Duration unavailable"
                          : `${Math.round(item.estimatedDuration / 60)} min`}
                      </p>
                      <ScheduleQuantification
                        objectiveIntensity={item.objectiveIntensity}
                        load={item.load}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Focus</CardTitle>
            <CardDescription>Keep the home surface lightweight and task-oriented.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-muted-foreground" />
                {dashboard?.activePlan?.name ?? "No active plan"}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Use search to jump directly into planning, messages, settings, or calendar
                workflows.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Search is now the primary jump-off point for deeper areas of the web app.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
