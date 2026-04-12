import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Bell, CalendarDays, MessageSquare, Settings } from "lucide-react";

import { useAuth } from "../../components/providers/auth-provider";
import { api } from "../../lib/api/client";

export const Route = createFileRoute("/_protected/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const dashboardQuery = api.home.getDashboard.useQuery();

  const dashboard = dashboardQuery.data;
  const schedule = dashboard?.schedule.slice(0, 4) ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard
        </p>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted-foreground">{user?.email ?? "Athlete"}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current Form"
          value={dashboard ? dashboard.currentStatus.form : "..."}
          description={
            dashboard
              ? `CTL ${dashboard.currentStatus.ctl} / ATL ${dashboard.currentStatus.atl}`
              : "Loading dashboard status"
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
          title="This Week"
          value={dashboard ? `${dashboard.weeklySummary.actual.count} sessions` : "..."}
          description={
            dashboard
              ? `${Math.round(dashboard.weeklySummary.actual.tss)} TSS completed`
              : "Loading weekly summary"
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Active Plan"
          value={dashboard?.activePlan?.name ?? "No active plan"}
          description={
            dashboard?.activePlan?.phase
              ? `Phase: ${dashboard.activePlan.phase}`
              : "Create or assign a plan to see progress here"
          }
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
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
            <CardTitle>Quick Links</CardTitle>
            <CardDescription>Jump into the migrated areas of the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuickLink
              to="/messages"
              icon={<MessageSquare className="h-4 w-4" />}
              label="Messages"
            />
            <QuickLink
              to="/notifications"
              icon={<Bell className="h-4 w-4" />}
              label="Notifications"
            />
            <QuickLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
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

function QuickLink({
  to,
  icon,
  label,
}: {
  to: "/messages" | "/notifications" | "/settings";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button asChild variant="outline" className="w-full justify-start gap-2">
      <Link to={to}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}
