import { isValidDateOnlyUtc } from "@repo/core";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { CalendarProjectionCard } from "../../../../components/calendar/calendar-projection-card";
import { PlannedDaySummary } from "../../../../components/planning/planned-day-summary";
import { api } from "../../../../lib/api/client";
import {
  formatDayLabel,
  getMonthKey,
  isValidMonthKey,
  shiftDateKey,
} from "../../../../lib/planning";

export const Route = createFileRoute("/_protected/calendar/day/$date")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" || search.view === "week" ? search.view : "month",
  }),
  beforeLoad: ({ params }) => {
    if (!isValidDateOnlyUtc(params.date)) throw notFound();
  },
  component: CalendarDayPage,
});

function CalendarDayPage() {
  const { date: routeDate } = Route.useParams();
  const { month, view } = Route.useSearch();
  const eventsQuery = api.calendar.day.useQuery({ date: routeDate });

  const projectionItems = (eventsQuery.data?.projection.items ?? []).filter(
    (item) => item.calendarDate === routeDate,
  );
  const goals = projectionItems.filter((item) => item.kind === "goal");
  const agendaItems = projectionItems.filter((item) => item.kind !== "goal");
  const agendaCount = agendaItems.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/calendar"
          search={{
            date: routeDate,
            month,
            view: view as "agenda" | "month" | "week",
          }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to calendar
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{formatDayLabel(routeDate)}</h1>
          <p className="mt-1 text-muted-foreground">Day agenda and goal anchors.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/calendar/day/$date"
          params={{ date: shiftDateKey(routeDate, -1) }}
          search={{ month, view }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Previous day
        </Link>
        <Link
          to="/calendar/day/$date"
          params={{ date: shiftDateKey(routeDate, 1) }}
          search={{ month, view }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Next day
        </Link>
        <Link
          to="/calendar/new"
          search={{ date: routeDate }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Create event for this day
        </Link>
      </div>

      {goals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Goal markers</CardTitle>
            <CardDescription>Targets landing on this day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {goals.map((goal) => (
              <CalendarProjectionCard item={goal} key={goal.id} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <PlannedDaySummary
        {...(eventsQuery.data?.plannedLoadSummary === undefined
          ? {}
          : { data: eventsQuery.data.plannedLoadSummary })}
        error={eventsQuery.isError}
        isLoading={eventsQuery.isLoading}
        onRetry={() => eventsQuery.refetch()}
      />

      {eventsQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm">The day agenda could not be fully loaded.</p>
          <Button size="sm" variant="outline" onClick={() => void eventsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
          <CardDescription>
            {agendaCount === 0
              ? "Nothing scheduled yet."
              : `${agendaCount} calendar item${agendaCount === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading day agenda...</p>
          ) : agendaCount > 0 ? (
            <div className="space-y-3">
              {agendaItems.map((item) => (
                <CalendarProjectionCard item={item} key={`${item.kind}-${item.id}`} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No events scheduled for this day.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
