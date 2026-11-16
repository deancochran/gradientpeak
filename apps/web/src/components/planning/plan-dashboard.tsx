import { type CalendarProjectionItem, formatDateOnlyInTimeZone } from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, CircleArrowRight, Flag } from "lucide-react";
import { useMemo } from "react";
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
      <Card className="overflow-hidden">
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
                  <p className="font-medium">No session scheduled</p>
                  <p className="text-sm text-muted-foreground">
                    Add today’s work when you’re ready to plan it.
                  </p>
                </div>
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
              </div>
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
      {nextGoal || profileLoading || goalsQuery.isLoading ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  Goals
                </CardTitle>
              </div>
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
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/calendar" search={{ month: getMonthKey(new Date()), view: "month" }}>
            Open calendar
          </Link>
        </Button>
      </div>
    </>
  );
}
