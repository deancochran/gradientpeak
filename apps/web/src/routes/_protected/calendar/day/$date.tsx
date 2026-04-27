import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";

import { api } from "../../../../lib/api/client";
import {
  compareEventsByStart,
  formatDayLabel,
  formatEventTimeRange,
  getEventTitle,
  getMonthKey,
  getTodayDateKey,
  isValidDateKey,
  isValidMonthKey,
  type PlanningEvent,
} from "../../../../lib/planning";

export const Route = createFileRoute("/_protected/calendar/day/$date")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" ? "agenda" : "month",
  }),
  component: CalendarDayPage,
});

function CalendarDayPage() {
  const { date } = Route.useParams();
  const { month, view } = Route.useSearch();
  const normalizedDate = isValidDateKey(date) ? date : getTodayDateKey();
  const profileQuery = api.profiles.get.useQuery();
  const eventsQuery = api.events.list.useQuery({
    date_from: normalizedDate,
    date_to: normalizedDate,
    include_adhoc: true,
    limit: 100,
  });
  const goalsQuery = api.goals.list.useQuery(
    {
      profile_id: profileQuery.data?.id ?? "00000000-0000-0000-0000-000000000000",
      limit: 200,
    },
    { enabled: Boolean(profileQuery.data?.id) },
  );

  const events = useMemo(
    () => ((eventsQuery.data?.items ?? []) as PlanningEvent[]).slice().sort(compareEventsByStart),
    [eventsQuery.data?.items],
  );
  const goals = useMemo(
    () => (goalsQuery.data?.items ?? []).filter((goal) => goal.target_date === normalizedDate),
    [goalsQuery.data?.items, normalizedDate],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/calendar" search={{ flash: undefined, flashType: undefined, month, view }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to calendar
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {formatDayLabel(normalizedDate)}
          </h1>
          <p className="mt-1 text-muted-foreground">Day agenda and goal anchors.</p>
        </div>
      </div>

      {goals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Goal markers</CardTitle>
            <CardDescription>Targets landing on this day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {goals.map((goal) => (
              <div key={goal.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{goal.title}</p>
                    <p className="text-sm text-muted-foreground">Priority {goal.priority}/10</p>
                  </div>
                  <Badge>{goal.activity_category}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "Nothing scheduled yet."
              : `${events.length} scheduled event${events.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading day agenda...</p>
          ) : events.length > 0 ? (
            <div className="space-y-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  to="/calendar/events/$eventId"
                  params={{ eventId: event.id }}
                  search={{ flash: undefined, flashType: undefined, month, view }}
                  className="block rounded-xl border p-4 transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{getEventTitle(event)}</p>
                      <p className="text-sm text-muted-foreground">{formatEventTimeRange(event)}</p>
                    </div>
                    <Badge variant="outline">{event.event_type ?? "event"}</Badge>
                  </div>
                </Link>
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
