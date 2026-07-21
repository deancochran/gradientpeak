import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

import { api } from "../../../lib/api/client";
import {
  formatEventTimeRange,
  getEventTitle,
  getTodayDateKey,
  type PlanningEvent,
} from "../../../lib/planning";

export const Route = createFileRoute("/_protected/scheduled-activities/")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search.category === "string" ? search.category : undefined,
    range: search.range === "past" || search.range === "all" ? search.range : "upcoming",
  }),
  component: ScheduledActivitiesPage,
});

function ScheduledActivitiesPage() {
  const search = Route.useSearch() as { category?: string; range: "all" | "past" | "upcoming" };
  const today = getTodayDateKey();
  const eventsQuery = api.events.list.useQuery({
    event_types: ["planned"],
    ...(search.category ? { activity_category: search.category } : {}),
    ...(search.range === "upcoming" ? { date_from: today } : {}),
    ...(search.range === "past" ? { date_to: today } : {}),
    include_adhoc: true,
    limit: 500,
  });
  const events = (eventsQuery.data?.items ?? []) as PlanningEvent[];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Scheduled activities</h1>
          <p className="mt-1 text-muted-foreground">
            Filter persisted planned work and open schedule details.
          </p>
        </div>
        <Button asChild>
          <a href="/calendar/new?type=planned">Schedule activity</a>
        </Button>
      </div>
      <form method="get" className="flex flex-wrap gap-3 rounded-xl border p-4">
        <select
          aria-label="Schedule range"
          name="range"
          defaultValue={search.range}
          className="h-10 rounded-md border bg-background px-3"
        >
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="all">All</option>
        </select>
        <select
          aria-label="Activity category"
          name="category"
          defaultValue={search.category ?? ""}
          className="h-10 rounded-md border bg-background px-3"
        >
          <option value="">All activities</option>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
          <option value="strength">Strength</option>
          <option value="other">Other</option>
        </select>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>
      {eventsQuery.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/40 p-4">
          <p>Scheduled activities could not be loaded.</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void eventsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{events.length} scheduled activities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {eventsQuery.isLoading ? <p>Loading scheduled activities...</p> : null}
          {events.map((event) => (
            <a
              key={event.id}
              href={`/scheduled-activities/${event.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border p-4 hover:bg-accent"
            >
              <div>
                <p className="font-medium">{getEventTitle(event)}</p>
                <p className="text-sm text-muted-foreground">
                  {event.scheduled_date} · {formatEventTimeRange(event)}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge>{event.activity_plan?.activity_category ?? "planned"}</Badge>
                {event.status ? <Badge variant="outline">{event.status}</Badge> : null}
              </div>
            </a>
          ))}
          {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scheduled activities match these filters.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
