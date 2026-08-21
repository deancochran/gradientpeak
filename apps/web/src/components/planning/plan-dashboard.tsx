import type { CalendarProjectionItem } from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Flag } from "lucide-react";
import { useMemo } from "react";
import { PlanGoalForm } from "../../components/protected/plan-goal-form";
import { api } from "../../lib/api/client";
import {
  formatShortDayLabel,
  getMonthKey,
  getTodayDateKey,
  shiftDateKey,
} from "../../lib/planning";
import { TrainingLoadPath } from "./training-load-path";

export function getUpcomingScheduledWorkItems(
  items: readonly CalendarProjectionItem[],
): CalendarProjectionItem[] {
  return items.filter(
    (item) =>
      item.status === "scheduled" && (item.kind === "planned_activity" || item.kind === "event"),
  );
}

export function getScheduledWorkTypeLabel(item: CalendarProjectionItem): string {
  return (item.plan?.activityCategory ?? item.event?.type ?? "planned activity").replaceAll(
    "_",
    " ",
  );
}

export function PlanDashboard() {
  const today = getTodayDateKey();
  const profileQuery = api.profiles.get.useQuery();
  const planTabQuery = api.trainingPlans.getPlanTabProjection.useQuery({
    startDate: today,
    endDate: shiftDateKey(today, 89),
  });
  const trainingPlansQuery = api.trainingPlans.list.useQuery({ ownerScope: "own", limit: 6 });
  const upcomingEventsQuery = api.calendar.range.useQuery({
    startDate: today,
    endDateExclusive: shiftDateKey(today, 366),
    includeAdhoc: false,
    limit: 12,
  });
  const goalsQuery = api.goals.list.useQuery(
    { profile_id: profileQuery.data?.id ?? "00000000-0000-0000-0000-000000000000", limit: 200 },
    { enabled: Boolean(profileQuery.data?.id) },
  );
  const upcomingEvents = useMemo(
    () => getUpcomingScheduledWorkItems(upcomingEventsQuery.data?.items ?? []),
    [upcomingEventsQuery.data?.items],
  );
  const nextGoal = useMemo(() => {
    const goals = [...(goalsQuery.data?.items ?? [])];
    return goals.sort((a, b) => a.target_date.localeCompare(b.target_date))[0] ?? null;
  }, [goalsQuery.data?.items]);

  return (
    <>
      {upcomingEventsQuery.isError || goalsQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm">
            Some planning data could not be refreshed. Available data remains visible.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([upcomingEventsQuery.refetch(), goalsQuery.refetch()])}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <TrainingLoadPath
        isError={planTabQuery.isError}
        isLoading={planTabQuery.isLoading}
        onRetry={() => void planTabQuery.refetch()}
        projection={planTabQuery.data}
      />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Active plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {planTabQuery.data?.currentScheduledPlan ? (
              <>
                <div>
                  <p className="text-xl font-semibold">
                    {planTabQuery.data.currentScheduledPlan.name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Next event{` `}
                    {new Date(
                      planTabQuery.data.currentScheduledPlan.nextEventAt,
                    ).toLocaleDateString()}
                  </Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active plan detected from future scheduled events.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next goal anchor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextGoal ? (
              <>
                <div className="rounded-xl border p-4">
                  <p className="font-medium">{nextGoal.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatShortDayLabel(nextGoal.target_date)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{nextGoal.activity_category}</Badge>
                  <Badge variant="outline">Priority {nextGoal.priority}/10</Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No goals created yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Upcoming scheduled work
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading scheduled work...</p>
            ) : upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {upcomingEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {event.title || event.plan?.name || "Untitled event"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatShortDayLabel(event.calendarDate)}
                        </p>
                      </div>
                      <Badge variant="outline">{getScheduledWorkTypeLabel(event)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming scheduled events yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  Goals
                </CardTitle>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">New goal</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create goal</DialogTitle>
                  </DialogHeader>
                  <PlanGoalForm profileId={profileQuery.data?.id} />
                </DialogContent>
              </Dialog>
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/goals"
                  search={{
                    category: undefined,
                    flash: undefined,
                    flashType: undefined,
                    q: "",
                    sort: "target_date",
                  }}
                >
                  All goals
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {goalsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading goals...</p>
            ) : goalsQuery.data?.items?.length ? (
              <div className="space-y-3">
                {goalsQuery.data.items.map((goal) => (
                  <div key={goal.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{goal.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatShortDayLabel(goal.target_date)}
                        </p>
                      </div>
                      <Badge variant="outline">{goal.priority}/10</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{goal.activity_category}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No goals yet. Add one to anchor your plan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Available training plans</CardTitle>
        </CardHeader>
        <CardContent>
          {trainingPlansQuery.data?.items?.length ? (
            <div className="flex flex-wrap gap-2">
              {trainingPlansQuery.data.items.map((plan) => (
                <Badge key={plan.id} variant="outline">
                  {plan.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No saved training plans yet.</p>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/calendar" search={{ month: getMonthKey(new Date()), view: "month" }}>
            Open calendar
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            to="/calendar"
            search={{ month: getMonthKey(new Date()), scheduled: true, view: "agenda" }}
          >
            Scheduled activities
          </Link>
        </Button>
      </div>
    </>
  );
}
