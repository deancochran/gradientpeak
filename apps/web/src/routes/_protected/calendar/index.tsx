import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/cn";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { useMemo } from "react";

import { api } from "../../../lib/api/client";
import {
  compareEventsByStart,
  formatEventTimeRange,
  formatMonthLabel,
  getCalendarGrid,
  getEventTitle,
  getMonthKey,
  getMonthWindow,
  getTodayDateKey,
  isValidMonthKey,
  type PlanningEvent,
  shiftMonthKey,
  toDateKey,
} from "../../../lib/planning";

export const Route = createFileRoute("/_protected/calendar/")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" ? "agenda" : "month",
  }),
  component: CalendarIndexPage,
});

function CalendarIndexPage() {
  const navigate = Route.useNavigate();
  const { month, view } = Route.useSearch();
  const { startKey, endKey } = useMemo(() => getMonthWindow(month), [month]);
  const todayKey = getTodayDateKey();
  const profileQuery = api.profiles.get.useQuery();
  const eventsQuery = api.events.list.useQuery({
    date_from: startKey,
    date_to: endKey,
    include_adhoc: true,
    limit: 500,
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
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, PlanningEvent[]>();
    for (const event of events) {
      const dateKey = event.scheduled_date ?? toDateKey(new Date(event.starts_at ?? Date.now()));
      const bucket = grouped.get(dateKey) ?? [];
      bucket.push(event);
      grouped.set(dateKey, bucket);
    }
    return grouped;
  }, [events]);
  const goalDates = useMemo(
    () => new Set((goalsQuery.data?.items ?? []).map((goal) => goal.target_date)),
    [goalsQuery.data?.items],
  );
  const gridDays = useMemo(() => getCalendarGrid(month), [month]);
  const monthEventDays = eventsByDate.size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-2 text-muted-foreground">
            Your monthly schedule and agenda, backed by real events and goals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              void navigate({
                to: "/calendar",
                search: { month: shiftMonthKey(month, -1), view },
              })
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-40 text-center text-sm font-medium">{formatMonthLabel(month)}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              void navigate({
                to: "/calendar",
                search: { month: shiftMonthKey(month, 1), view },
              })
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Scheduled events"
          value={events.length}
          description="Across this month"
        />
        <SummaryCard
          title="Active days"
          value={monthEventDays}
          description="Days with at least one event"
        />
        <SummaryCard
          title="Goal markers"
          value={
            Array.from(goalDates).filter((dateKey) => dateKey >= startKey && dateKey <= endKey)
              .length
          }
          description="Targets landing this month"
        />
      </div>

      <Tabs
        value={view}
        onValueChange={(nextView) =>
          void navigate({
            to: "/calendar",
            search: { month, view: nextView === "agenda" ? "agenda" : "month" },
          })
        }
      >
        <TabsList>
          <TabsTrigger value="month" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Month
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2">
            <List className="h-4 w-4" />
            Agenda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="month">
          <Card>
            <CardHeader>
              <CardTitle>Month view</CardTitle>
              <CardDescription>Open a day to inspect its agenda and goal anchors.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {gridDays.map((date) => {
                  const dateKey = toDateKey(date);
                  const dayEvents = eventsByDate.get(dateKey) ?? [];
                  const isCurrentMonth = date.getMonth() === parseInt(month.slice(5, 7), 10) - 1;
                  const hasGoal = goalDates.has(dateKey);

                  return (
                    <Link
                      key={dateKey}
                      to="/calendar/day/$date"
                      params={{ date: dateKey }}
                      search={{ month, view }}
                      className={cn(
                        "rounded-xl border p-2 transition-colors hover:border-primary hover:bg-accent/40",
                        !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                        dateKey === todayKey && "border-primary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{date.getDate()}</span>
                        {hasGoal ? <Badge variant="secondary">Goal</Badge> : null}
                      </div>
                      <div className="mt-3 space-y-1">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className="truncate rounded-md bg-muted px-2 py-1 text-xs"
                          >
                            {getEventTitle(event)}
                          </div>
                        ))}
                        {dayEvents.length > 2 ? (
                          <div className="text-xs text-muted-foreground">
                            +{dayEvents.length - 2} more
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda">
          <Card>
            <CardHeader>
              <CardTitle>Month agenda</CardTitle>
              <CardDescription>
                Every scheduled event for {formatMonthLabel(month)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading agenda...</p>
              ) : events.length > 0 ? (
                <div className="space-y-3">
                  {events.map((event) => (
                    <Link
                      key={event.id}
                      to="/calendar/events/$eventId"
                      params={{ eventId: event.id }}
                      search={{ month, view }}
                      className="block rounded-xl border p-4 transition-colors hover:border-primary hover:bg-accent/40"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{getEventTitle(event)}</p>
                          <p className="text-sm text-muted-foreground">
                            {event.scheduled_date} · {formatEventTimeRange(event)}
                          </p>
                          {event.activity_plan?.activity_category ? (
                            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                              {event.activity_plan.activity_category}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{event.event_type ?? "event"}</Badge>
                          {goalDates.has(event.scheduled_date ?? "") ? (
                            <Badge>Goal day</Badge>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No events scheduled this month.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
