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
import { CalendarDays, CheckCircle2, CircleArrowRight, Flag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const routeSelectedDate =
    selectedDateFromRoute && isValidDateKey(selectedDateFromRoute)
      ? selectedDateFromRoute
      : undefined;
  // A URL date always wins. Without one, request once from the bootstrap date and
  // then re-anchor once to the server's authoritative planning-day boundary.
  const [projectionAnchorDate, setProjectionAnchorDate] = useState(bootstrapToday);
  const requestedDate = routeSelectedDate ?? projectionAnchorDate;
  const planTabQuery = api.trainingPlans.getPlanTabProjection.useQuery(
    {
      startDate: shiftDateKey(requestedDate, -42),
      endDate: shiftDateKey(requestedDate, 47),
    },
    { enabled: Boolean(profileQuery.data) },
  );
  const authoritativeToday = planTabQuery.data?.today ?? null;
  useEffect(() => {
    if (!routeSelectedDate && authoritativeToday && authoritativeToday !== projectionAnchorDate) {
      setProjectionAnchorDate(authoritativeToday);
    }
  }, [authoritativeToday, projectionAnchorDate, routeSelectedDate]);
  const selectedDate = routeSelectedDate ?? authoritativeToday ?? projectionAnchorDate;
  const selectedDayQuery = api.calendar.day.useQuery({ date: selectedDate });
  const today = authoritativeToday ?? bootstrapToday;
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
  const profileUnavailable = !profileQuery.data && (profileQuery.isError || profileQuery.isSuccess);
  const profileLoading = profileQuery.isLoading;
  const trainingPathLoading = !planTabQuery.data && (profileLoading || planTabQuery.isLoading);
  const trainingPathUnavailable =
    !planTabQuery.data && (profileUnavailable || planTabQuery.isError);
  const hasRefreshFailure =
    (profileQuery.isError && Boolean(profileQuery.data)) ||
    (planTabQuery.isError && Boolean(planTabQuery.data)) ||
    selectedDayQuery.isError ||
    goalsQuery.isError;
  const scheduledSession = selectedDayItems.find(
    (item) =>
      item.kind === "planned_activity" &&
      item.status === "scheduled" &&
      item.plannedSession?.lifecycle.status === "scheduled",
  );
  const completedSession = selectedDayItems.find(
    (item) =>
      item.kind === "planned_activity" &&
      (item.status === "completed" || item.plannedSession?.lifecycle.status === "completed"),
  );
  const selectedDayPending = selectedDayQuery.isLoading && !selectedDayQuery.data;
  const selectedDayUnavailable = selectedDayQuery.isError && !selectedDayQuery.data;
  const selectedDayStale = selectedDayQuery.isError && Boolean(selectedDayQuery.data);

  return (
    <>
      {hasRefreshFailure ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm">
            Some planning data could not be refreshed. Available data remains visible and may be
            stale.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void Promise.all([
                ...(profileQuery.isError ? [profileQuery.refetch()] : []),
                ...(planTabQuery.isError ? [planTabQuery.refetch()] : []),
                ...(selectedDayQuery.isError ? [selectedDayQuery.refetch()] : []),
                ...(goalsQuery.isError ? [goalsQuery.refetch()] : []),
              ])
            }
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
      <Card className="overflow-hidden" data-testid="plan-selected-day-context">
        <CardHeader className="gap-3 border-b bg-muted/20 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                Your day
              </p>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <CalendarDays className="h-5 w-5 text-primary" />
                {selectedDate === today ? "Today" : formatShortDayLabel(selectedDate)}
              </CardTitle>
            </div>
            {selectedDate === today ? <Badge>Selected</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
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
          {selectedDate >= today &&
          selectedTimelineDay?.load.plannedLoadStatus === "unavailable" &&
          selectedDayItems.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Planned Load is unavailable for this day. Scheduled work is listed below with its own
              available details.
            </p>
          ) : null}
          {selectedDate === today ? (
            profileUnavailable ? (
              <div className="rounded-xl border border-dashed p-4">
                <p className="font-medium">Today’s next action is unavailable</p>
                <p className="text-sm text-muted-foreground">
                  Reload your planning profile to see today’s session.
                </p>
              </div>
            ) : selectedDayPending ? (
              <div className="rounded-xl border border-dashed p-4">
                <p className="font-medium">Loading today’s next action...</p>
              </div>
            ) : selectedDayUnavailable ? (
              <div className="rounded-xl border border-dashed p-4">
                <p className="font-medium">Today’s next action is unavailable</p>
                <p className="text-sm text-muted-foreground">
                  Retry to load today’s scheduled work.
                </p>
              </div>
            ) : scheduledSession ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium tracking-[0.12em] text-primary uppercase">
                    Next up
                  </p>
                  <p className="font-medium">{scheduledSession.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Open your scheduled session when you’re ready.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link
                    to="/calendar/events/$eventId"
                    params={{
                      eventId: scheduledSession.id,
                    }}
                    search={{
                      flash: undefined,
                      flashType: undefined,
                      month: getMonthKey(new Date(`${selectedDate}T12:00:00`)),
                      resourceType: "planned_session",
                      view: "agenda",
                    }}
                  >
                    Open session
                    <CircleArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              </div>
            ) : completedSession ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-700/25 bg-emerald-500/5 p-4">
                <CheckCircle2 aria-hidden="true" className="size-5 text-emerald-700" />
                <div>
                  <p className="font-medium">Session complete</p>
                  <p className="text-sm text-muted-foreground">
                    Today’s scheduled work is already completed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
                <div>
                  <p className="font-medium">
                    {selectedDayStale
                      ? "No session in the last available update"
                      : "No session scheduled"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedDayStale
                      ? "Retry to confirm today’s current work before adding anything."
                      : "Add today’s work when you’re ready to plan it."}
                  </p>
                </div>
                {!selectedDayStale ? (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/calendar/new"
                      search={{
                        date: selectedDate,
                        month: getMonthKey(new Date(`${selectedDate}T12:00:00`)),
                        view: "month",
                      }}
                    >
                      Add work
                    </Link>
                  </Button>
                ) : null}
              </div>
            )
          ) : null}
          {selectedDayPending ? (
            <p className="text-sm text-muted-foreground">Loading this day’s work...</p>
          ) : selectedDayUnavailable ? (
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
      {planTabQuery.data?.currentScheduledPlan ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Current plan
              </p>
              <p className="font-medium">{planTabQuery.data.currentScheduledPlan.name}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link
                to="/calendar/events/$eventId"
                params={{ eventId: planTabQuery.data.currentScheduledPlan.nextPlannedSessionId }}
                search={{
                  flash: undefined,
                  flashType: undefined,
                  month: getMonthKey(
                    new Date(
                      `${planTabQuery.data.currentScheduledPlan.nextPlannedSessionDate}T12:00:00`,
                    ),
                  ),
                  resourceType: "planned_session",
                  view: "agenda",
                }}
              >
                {planTabQuery.data.currentScheduledPlan.nextPlannedSessionDate}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-muted-foreground" />
              Goals
            </CardTitle>
            <div className="flex flex-wrap gap-2">
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
          </div>
        </CardHeader>
        <CardContent>
          {profileQuery.isLoading || goalsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading goals...</p>
          ) : profileUnavailable || (goalsQuery.isError && !goalsQuery.data) ? (
            <p className="text-sm text-muted-foreground">Goals are unavailable.</p>
          ) : nextGoal ? (
            <Link
              className="block rounded-xl border p-3 transition-colors hover:border-primary hover:bg-accent/40"
              params={{ goalId: nextGoal.id }}
              search={{ flash: undefined, flashType: undefined }}
              to="/goals/$goalId"
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-medium">{nextGoal.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatShortDayLabel(nextGoal.target_date)}
                  </span>
                </span>
                <Badge variant="outline">{nextGoal.priority}/10</Badge>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming goals yet.</p>
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
