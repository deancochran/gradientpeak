import { type CalendarProjectionItem, formatDateOnlyInTimeZone } from "@repo/core";
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
  isValidDateKey,
  shiftDateKey,
} from "../../lib/planning";
import { CalendarProjectionCard } from "../calendar/calendar-projection-card";
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

function LoadValue({
  label,
  status,
  value,
}: {
  label: string;
  status: "complete" | "known_zero" | "partial" | "unavailable";
  value: number | null;
}) {
  if (status === "unavailable" || value === null) {
    return <p className="text-sm text-muted-foreground">{label}: unavailable</p>;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {label}: {status === "partial" ? "~" : ""}
      {Math.round(value * 10) / 10}
      {status === "known_zero" ? " (zero)" : ""}
    </p>
  );
}

export function PlanDashboard({
  onSelectedDateChange,
  selectedDate: selectedDateFromRoute,
}: {
  onSelectedDateChange?: (date: string) => void;
  selectedDate?: string;
} = {}) {
  const profileQuery = api.profiles.get.useQuery();
  const planningTimezone = profileQuery.data?.planning_timezone ?? null;
  const bootstrapToday = planningTimezone
    ? formatDateOnlyInTimeZone(new Date(), planningTimezone)
    : getTodayDateKey();
  // Keep the request's selected date stable while the initial projection is loading.
  // Its authoritative today then drives all temporal labels and goal boundaries.
  const selectedDate =
    selectedDateFromRoute && isValidDateKey(selectedDateFromRoute)
      ? selectedDateFromRoute
      : bootstrapToday;
  const planTabQuery = api.trainingPlans.getPlanTabProjection.useQuery(
    {
      startDate: shiftDateKey(selectedDate, -42),
      endDate: shiftDateKey(selectedDate, 47),
    },
    { enabled: Boolean(profileQuery.data) },
  );
  const trainingPlansQuery = api.trainingPlans.list.useQuery({ ownerScope: "own", limit: 6 });
  const selectedDayQuery = api.calendar.day.useQuery({ date: selectedDate });
  const today = planTabQuery.data?.today ?? bootstrapToday;
  const goalsQuery = api.goals.list.useQuery(
    {
      profile_id: profileQuery.data?.id ?? "00000000-0000-0000-0000-000000000000",
      limit: 1,
      sort_by: "target_date",
      sort_order: "asc",
      target_date_on_or_after: today,
    },
    {
      enabled: Boolean(profileQuery.data?.id),
    },
  );
  const nextGoal = goalsQuery.data?.items[0] ?? null;
  const selectedTimelineDay = useMemo(
    () => planTabQuery.data?.timeline?.days.find((day) => day.date === selectedDate),
    [planTabQuery.data?.timeline?.days, selectedDate],
  );
  const selectedDayItems = useMemo(
    () =>
      (selectedDayQuery.data?.projection.items ?? []).filter(
        (item) => item.calendarDate === selectedDate && item.kind !== "goal",
      ),
    [selectedDate, selectedDayQuery.data?.projection.items],
  );
  const profileUnavailable = profileQuery.isError || (profileQuery.isSuccess && !profileQuery.data);
  const profileLoading = profileQuery.isLoading;
  const trainingPathLoading = profileLoading || planTabQuery.isLoading;
  const trainingPathUnavailable =
    profileUnavailable || (planTabQuery.isError && !planTabQuery.data);

  return (
    <>
      {selectedDayQuery.isError || goalsQuery.isError ? (
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
            onClick={() => void Promise.all([selectedDayQuery.refetch(), goalsQuery.refetch()])}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <TrainingLoadPath
        {...(profileUnavailable
          ? {
              errorMessage:
                "Training path is unavailable because your planning profile could not be loaded.",
              retryLabel: "Retry planning profile",
            }
          : {})}
        isError={trainingPathUnavailable}
        isLoading={trainingPathLoading}
        onRetry={() => void (profileUnavailable ? profileQuery.refetch() : planTabQuery.refetch())}
        projection={planTabQuery.data}
        selectedDate={selectedDate}
        {...(onSelectedDateChange ? { onSelectedDateChange } : {})}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {selectedDate === today ? "Today" : formatShortDayLabel(selectedDate)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedTimelineDay ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedDate <= today ? (
                <LoadValue
                  label="Observed Load"
                  status={selectedTimelineDay.load.completedLoadStatus}
                  value={selectedTimelineDay.load.completedLoad}
                />
              ) : null}
              {selectedDate >= today ? (
                <LoadValue
                  label="Planned Load"
                  status={selectedTimelineDay.load.plannedLoadStatus}
                  value={selectedTimelineDay.load.plannedLoad}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Load is unavailable for this day.</p>
          )}
          {selectedDate === today ? (
            selectedTimelineDay?.scheduledItems.find((item) => item.status !== "cancelled") ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                <p className="text-sm">Next action: follow your scheduled session.</p>
                <Button asChild size="sm">
                  <Link
                    to="/calendar/events/$eventId"
                    params={{
                      eventId:
                        selectedTimelineDay.scheduledItems.find(
                          (item) => item.status !== "cancelled",
                        )?.id ?? "",
                    }}
                    search={{
                      flash: undefined,
                      flashType: undefined,
                      month: getMonthKey(new Date(`${selectedDate}T12:00:00`)),
                      resourceType: "planned_session",
                      view: "agenda",
                    }}
                  >
                    Open & follow session
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Next action: add or plan today’s work.
              </p>
            )
          ) : null}
          {selectedDayQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading this day’s work...</p>
          ) : selectedDayQuery.isError && !selectedDayQuery.data ? (
            <p className="text-sm text-muted-foreground">This day’s work is unavailable.</p>
          ) : selectedDayItems.length ? (
            <div className="space-y-3">
              {selectedDayItems.map((item) => (
                <CalendarProjectionCard item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link
                to="/calendar/new"
                search={{
                  date: selectedDate,
                  month: getMonthKey(new Date(`${selectedDate}T12:00:00`)),
                  view: "month",
                }}
              >
                Add to this day
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
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
                    Next session{` `}
                    {new Date(
                      `${planTabQuery.data.currentScheduledPlan.nextPlannedSessionDate}T12:00:00`,
                    ).toLocaleDateString()}
                  </Badge>
                </div>
              </>
            ) : profileLoading || planTabQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading active plan...</p>
            ) : profileUnavailable || (planTabQuery.isError && !planTabQuery.data) ? (
              <p className="text-sm text-muted-foreground">Active plan is unavailable.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active plan detected from future planned sessions.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next goal anchor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profileQuery.isLoading || goalsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading goals...</p>
            ) : profileUnavailable || (goalsQuery.isError && !goalsQuery.data) ? (
              <p className="text-sm text-muted-foreground">Goal anchors are unavailable.</p>
            ) : nextGoal ? (
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
              <p className="text-sm text-muted-foreground">No upcoming goals.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
                  <PlanGoalForm
                    {...(profileQuery.data?.id !== undefined
                      ? { profileId: profileQuery.data.id }
                      : {})}
                  />
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
            {profileQuery.isLoading || goalsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading goals...</p>
            ) : profileUnavailable || (goalsQuery.isError && !goalsQuery.data) ? (
              <p className="text-sm text-muted-foreground">Goals are unavailable.</p>
            ) : nextGoal ? (
              <div className="space-y-3">
                <div className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{nextGoal.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatShortDayLabel(nextGoal.target_date)}
                      </p>
                    </div>
                    <Badge variant="outline">{nextGoal.priority}/10</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge>{nextGoal.activity_category}</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming goals. Add one to anchor your plan.
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
          {trainingPlansQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading training plans...</p>
          ) : trainingPlansQuery.isError && !trainingPlansQuery.data ? (
            <p className="text-sm text-muted-foreground">Training plans are unavailable.</p>
          ) : trainingPlansQuery.data?.items?.length ? (
            <div className="flex flex-wrap gap-2">
              {trainingPlansQuery.data.items.map((plan) => (
                <Badge asChild key={plan.id} variant="outline">
                  <Link params={{ planId: plan.id }} to="/training-plans/$planId">
                    {plan.name}
                  </Link>
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
          <Link to="/training-plans" search={{ tab: "owned" }}>
            Open training-plan library
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/calendar" search={{ month: getMonthKey(new Date()), view: "month" }}>
            Open calendar
          </Link>
        </Button>
      </div>
    </>
  );
}
