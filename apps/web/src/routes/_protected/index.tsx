import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CalendarDays, RotateCcw, Target } from "lucide-react";

import { SearchLauncher } from "../../components/protected/search-launcher";
import { useAuth } from "../../components/providers/auth-provider";
import { api } from "../../lib/api/client";

export const Route = createFileRoute("/_protected/")({
  component: DashboardPage,
});

export function DashboardPage() {
  const { user } = useAuth();
  const dashboardQuery = api.home.getDashboard.useQuery();

  const dashboard = dashboardQuery.data;
  const schedule = dashboard?.schedule.slice(0, 4) ?? [];
  const isInitialLoading = dashboardQuery.isLoading && !dashboard;
  const isRefreshing = dashboardQuery.isFetching && Boolean(dashboard);

  const retryDashboard = () => void dashboardQuery.refetch();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted-foreground">{user?.email ?? "Athlete"}</p>
        </div>
        <SearchLauncher mode="bar" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Current Form"
          value={
            dashboard ? dashboard.currentStatus.form : isInitialLoading ? "Loading" : "Unavailable"
          }
          description={
            dashboard
              ? `CTL ${dashboard.currentStatus.ctl} / ATL ${dashboard.currentStatus.atl}`
              : isInitialLoading
                ? "Loading dashboard status"
                : "Dashboard status could not be loaded"
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Consistency"
          value={
            dashboard
              ? `${dashboard.consistency.streak} days`
              : isInitialLoading
                ? "Loading"
                : "Unavailable"
          }
          description={
            dashboard
              ? `${dashboard.consistency.weeklyCount} activities this week`
              : isInitialLoading
                ? "Loading consistency"
                : "Consistency could not be loaded"
          }
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <MetricCard
          title="Active Plan"
          value={
            dashboard?.activePlan?.name ??
            (isInitialLoading
              ? "Loading"
              : dashboardQuery.isError
                ? "Unavailable"
                : "No active plan")
          }
          description={
            dashboard?.activePlan?.phase
              ? `Phase: ${dashboard.activePlan.phase}`
              : isInitialLoading
                ? "Loading active plan"
                : dashboardQuery.isError
                  ? "Active plan could not be loaded"
                  : "Create or assign a plan to see progress here"
          }
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Schedule</CardTitle>
            <CardDescription>Your next planned sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            {isInitialLoading ? (
              <p className="text-sm text-muted-foreground">Loading upcoming activities...</p>
            ) : dashboardQuery.isError && !dashboard ? (
              <QueryRetry
                message="Upcoming activities could not be loaded."
                isRetrying={dashboardQuery.isFetching}
                onRetry={retryDashboard}
              />
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
                        {item.activityType} on {item.date}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{Math.round(item.estimatedDuration / 60)} min</p>
                      <p>{Math.round(item.estimatedTSS)} TSS</p>
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
            {isRefreshing ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                Refreshing dashboard…
              </div>
            ) : null}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-muted-foreground" />
                {dashboard?.activePlan?.name ?? "No active plan"}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {dashboard?.activePlan?.phase
                  ? `Phase: ${dashboard.activePlan.phase}`
                  : "Use search to jump directly into planning, messages, settings, or calendar workflows."}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Search is now the primary jump-off point for deeper areas of the web app.
            </p>
            {dashboardQuery.isError && dashboard ? (
              <QueryRetry
                message="Showing your last loaded dashboard data."
                isRetrying={dashboardQuery.isFetching}
                onRetry={retryDashboard}
              />
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function QueryRetry({
  message,
  isRetrying,
  onRetry,
}: {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isRetrying}
        onClick={onRetry}
      >
        <RotateCcw className={isRetrying ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        {isRetrying ? "Retrying…" : "Retry"}
      </button>
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
