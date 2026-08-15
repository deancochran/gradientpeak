import type { CalendarProjectionItem } from "@repo/core";
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
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { useMemo } from "react";

import { RouteFlashToast, type RouteFlashType } from "../../../components/route-flash-toast";
import { api } from "../../../lib/api/client";
import {
  formatMonthLabel,
  formatShortDayLabel,
  getCalendarGrid,
  getMonthKey,
  getMonthWindow,
  getTodayDateKey,
  getWeekWindow,
  isValidDateKey,
  isValidMonthKey,
  shiftDateKey,
  shiftMonthKey,
  toDateKey,
} from "../../../lib/planning";

function formatProjectionItemTime(item: CalendarProjectionItem) {
  if (item.timing.allDay) return "All day";
  if (!item.timing.startsAt) return "Scheduled";
  return new Date(item.timing.startsAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: item.timing.timezone,
  });
}

export const Route = createFileRoute("/_protected/calendar/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    date?: string;
    scheduled?: true;
    flash?: string;
    flashType?: RouteFlashType;
    month: string;
    view: "agenda" | "month" | "week";
  } => ({
    ...(typeof search.flash === "string" ? { flash: search.flash } : {}),
    ...(search.flashType === "success" ||
    search.flashType === "error" ||
    search.flashType === "info"
      ? { flashType: search.flashType as RouteFlashType }
      : {}),
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    ...(typeof search.date === "string" && isValidDateKey(search.date)
      ? { date: search.date }
      : {}),
    ...(search.scheduled === true || search.scheduled === "true"
      ? { scheduled: true as const }
      : {}),
    view: search.view === "agenda" || search.view === "week" ? search.view : "month",
  }),
  component: CalendarIndexPage,
});

function CalendarIndexPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { flash, flashType } = search;
  const month = isValidMonthKey(search.month) ? search.month : getMonthKey(new Date());
  const date = search.date && isValidDateKey(search.date) ? search.date : getTodayDateKey();
  const view = search.view === "agenda" || search.view === "week" ? search.view : "month";
  const monthWindow = useMemo(() => getMonthWindow(month), [month]);
  const weekWindow = useMemo(() => getWeekWindow(date), [date]);
  const { startKey, endKey } = view === "week" ? weekWindow : monthWindow;
  const todayKey = getTodayDateKey();
  const eventsQuery = api.calendar.range.useQuery({
    startDate: startKey,
    endDateExclusive: shiftDateKey(endKey, 1),
    includeAdhoc: true,
    ...(search.scheduled ? { eventTypes: ["planned" as const] } : {}),
    limit: 500,
  });

  const projectionItems = eventsQuery.data?.items ?? [];
  const projectionItemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarProjectionItem[]>();
    for (const item of projectionItems) {
      const bucket = grouped.get(item.calendarDate) ?? [];
      bucket.push(item);
      grouped.set(item.calendarDate, bucket);
    }
    return grouped;
  }, [projectionItems]);
  const goalDates = useMemo(
    () =>
      new Set(
        projectionItems.filter((item) => item.kind === "goal").map((item) => item.calendarDate),
      ),
    [projectionItems],
  );
  const gridDays = useMemo(() => getCalendarGrid(month), [month]);
  const monthEventDays = projectionItemsByDate.size;

  return (
    <div className="space-y-6">
      <RouteFlashToast
        {...(flash !== undefined ? { message: flash } : {})}
        {...(flashType !== undefined ? { type: flashType } : {})}
        clear={() =>
          void navigate({
            to: "/calendar",
            search: { date, month, view },
            replace: true,
          })
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-2 text-muted-foreground">
            Your monthly schedule and agenda, backed by real events and goals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Button asChild>
            <Link to="/calendar/new" search={{ date, type: "custom" }}>
              <Plus className="mr-2 h-4 w-4" />
              Create
            </Link>
          </Button>
          <Button
            aria-label="Previous calendar period"
            variant="outline"
            size="icon"
            onClick={() =>
              void navigate({
                to: "/calendar",
                search: {
                  date: view === "week" ? shiftDateKey(date, -7) : date,
                  month:
                    view === "week"
                      ? getMonthKey(new Date(`${shiftDateKey(date, -7)}T12:00:00`))
                      : shiftMonthKey(month, -1),
                  view,
                },
              })
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            aria-live="polite"
            className="min-w-0 flex-1 text-center text-sm font-medium sm:min-w-40"
          >
            {view === "week"
              ? `${weekWindow.startKey} – ${weekWindow.endKey}`
              : formatMonthLabel(month)}
          </div>
          <Button
            aria-label="Next calendar period"
            variant="outline"
            size="icon"
            onClick={() =>
              void navigate({
                to: "/calendar",
                search: {
                  date: view === "week" ? shiftDateKey(date, 7) : date,
                  month:
                    view === "week"
                      ? getMonthKey(new Date(`${shiftDateKey(date, 7)}T12:00:00`))
                      : shiftMonthKey(month, 1),
                  view,
                },
              })
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Calendar items"
          value={projectionItems.length}
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

      {eventsQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm">
            Some calendar data could not be loaded. Existing results remain visible.
          </p>
          <Button size="sm" variant="outline" onClick={() => void eventsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <Tabs
        value={view}
        onValueChange={(nextView) =>
          void navigate({
            to: "/calendar",
            search: {
              date,
              month,
              view: nextView === "agenda" || nextView === "week" ? nextView : "month",
            },
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
          <TabsTrigger value="week" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Week
          </TabsTrigger>
        </TabsList>

        <TabsContent value="month">
          <Card>
            <CardHeader>
              <h2 className="leading-none font-semibold">Month view</h2>
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
                  const dayEvents = projectionItemsByDate.get(dateKey) ?? [];
                  const isCurrentMonth = date.getMonth() === parseInt(month.slice(5, 7), 10) - 1;
                  const hasGoal = goalDates.has(dateKey);

                  return (
                    <Link
                      key={dateKey}
                      to="/calendar/day/$date"
                      params={{ date: dateKey }}
                      search={{ month, view }}
                      aria-label={`Open calendar day ${dateKey}`}
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
                            key={`${event.kind}-${event.id}`}
                            className="truncate rounded-md bg-muted px-2 py-1 text-xs"
                          >
                            {event.title}
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

        <TabsContent value="week">
          <Card>
            <CardHeader>
              <h2 className="leading-none font-semibold">Week view</h2>
              <CardDescription>Open a day or create work in this seven-day window.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-7">
              {weekWindow.days.map((dateKey) => {
                const dayEvents = projectionItemsByDate.get(dateKey) ?? [];
                return (
                  <div key={dateKey} className="min-h-40 rounded-xl border p-3">
                    <Link
                      to="/calendar/day/$date"
                      params={{ date: dateKey }}
                      search={{ month, view }}
                      className="font-medium hover:underline"
                    >
                      {formatShortDayLabel(dateKey)}
                    </Link>
                    <div className="mt-3 space-y-2">
                      {dayEvents.map((event) =>
                        event.kind === "event" || event.kind === "planned_activity" ? (
                          <Link
                            key={`${event.kind}-${event.id}`}
                            to="/calendar/events/$eventId"
                            params={{ eventId: event.id }}
                            search={{ flash: undefined, flashType: undefined, month, view }}
                            className="block rounded-md bg-muted p-2 text-xs hover:bg-accent"
                          >
                            {event.title}
                          </Link>
                        ) : (
                          <a
                            className="block rounded-md bg-muted p-2 text-xs hover:bg-accent"
                            href={event.navigation.href}
                            key={`${event.kind}-${event.id}`}
                          >
                            {event.title}
                          </a>
                        ),
                      )}
                      <Link
                        to="/calendar/new"
                        search={{ date: dateKey, type: "custom" }}
                        className="block text-xs text-primary hover:underline"
                      >
                        Add
                      </Link>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda">
          <Card>
            <CardHeader>
              <h2 className="leading-none font-semibold">Month agenda</h2>
              <CardDescription>
                Every scheduled event for {formatMonthLabel(month)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading agenda...</p>
              ) : projectionItems.length > 0 ? (
                <div className="space-y-3">
                  {projectionItems.map((item) => {
                    const content = (
                      <div
                        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                        key={`content-${item.kind}-${item.id}`}
                      >
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.calendarDate} · {formatProjectionItemTime(item)}
                          </p>
                          {item.plan ? (
                            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                              {item.plan.activityCategory}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{item.status}</Badge>
                          {goalDates.has(item.calendarDate) ? <Badge>Goal day</Badge> : null}
                        </div>
                      </div>
                    );
                    return item.kind === "event" || item.kind === "planned_activity" ? (
                      <Link
                        key={`${item.kind}-${item.id}`}
                        to="/calendar/events/$eventId"
                        params={{ eventId: item.id }}
                        search={{ flash: undefined, flashType: undefined, month, view }}
                        className="block rounded-xl border p-4 transition-colors hover:border-primary hover:bg-accent/40"
                      >
                        {content}
                      </Link>
                    ) : (
                      <a
                        className="block rounded-xl border p-4 transition-colors hover:border-primary hover:bg-accent/40"
                        href={item.navigation.href}
                        key={`${item.kind}-${item.id}`}
                      >
                        {content}
                      </a>
                    );
                  })}
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
