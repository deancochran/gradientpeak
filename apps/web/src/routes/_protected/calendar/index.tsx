import { usePlannedSessionMutations } from "@repo/api/react";
import { type CalendarProjectionItem, compareCalendarProjectionItems } from "@repo/core";
import {
  deriveCalendarDayVisualState,
  describeCalendarDayVisualState,
  summarizePlannedSessionComparisons,
} from "@repo/core/calendar";
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

import { CalendarProjectionCard } from "../../../components/calendar/calendar-projection-card";
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
import { CalendarDayVisual } from "./CalendarDayVisual";

export const Route = createFileRoute("/_protected/calendar/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    date?: string;
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
  const gridDays = useMemo(() => getCalendarGrid(month), [month]);
  const visibleMonthWindow = useMemo(() => {
    const firstDay = gridDays[0];
    const lastDay = gridDays.at(-1);
    return firstDay && lastDay
      ? { endKey: toDateKey(lastDay), startKey: toDateKey(firstDay) }
      : monthWindow;
  }, [gridDays, monthWindow]);
  const { startKey, endKey } = view === "week" ? weekWindow : visibleMonthWindow;
  const todayKey = getTodayDateKey();
  const eventsQuery = api.calendar.range.useQuery({
    startDate: startKey,
    endDateExclusive: shiftDateKey(endKey, 1),
    includeAdhoc: true,
    limit: 500,
  });
  const plannedSessionMutations = usePlannedSessionMutations({
    onConflict: () => eventsQuery.refetch(),
  });

  const projectionItems = useMemo(() => {
    return [...(eventsQuery.data?.items ?? [])].sort(compareCalendarProjectionItems);
  }, [eventsQuery.data?.items]);
  const visibleProjectionItems = useMemo(
    () =>
      view === "week"
        ? projectionItems
        : projectionItems.filter((item) => item.calendarDate.startsWith(month)),
    [month, projectionItems, view],
  );
  const plannedSessions = visibleProjectionItems.flatMap((item) =>
    item.plannedSession ? [{ session: item.plannedSession, title: item.title }] : [],
  );
  const weekComparison = useMemo(
    () =>
      summarizePlannedSessionComparisons(
        projectionItems.flatMap((item) => (item.plannedActual ? [item.plannedActual] : [])),
      ),
    [projectionItems],
  );
  const projectionItemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarProjectionItem[]>();
    for (const item of projectionItems) {
      const bucket = grouped.get(item.calendarDate) ?? [];
      bucket.push(item);
      grouped.set(item.calendarDate, bucket);
    }
    return grouped;
  }, [projectionItems]);
  const formatDistance = (value: number | null) =>
    value === null
      ? null
      : value >= 1_000
        ? `${(value / 1_000).toFixed(1)} km`
        : `${Math.round(value)} m`;
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
            <Link to="/calendar/new" search={{ date, month, view }}>
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

      <Card>
        <CardHeader>
          <CardTitle>Personal planned sessions</CardTitle>
          <CardDescription>
            Current activity-plan details for your scheduled sessions. Event-specific calendar items
            stay in the calendar views below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {eventsQuery.data && Object.values(eventsQuery.data.truncation).some(Boolean) ? (
            <p role="alert" className="text-sm text-destructive">
              This calendar period could not be shown completely. Narrow the period before making
              decisions from these results.
            </p>
          ) : null}
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading personal planned sessions...</p>
          ) : plannedSessions.length > 0 ? (
            <div className="space-y-2">
              {plannedSessions.map(({ session, title }) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  key={session.id}
                >
                  <div>
                    <p className="font-medium capitalize">{title}</p>
                    <p className="text-sm text-muted-foreground">
                      {session.planningDate} · {session.lifecycle.status}
                    </p>
                  </div>
                  {session.lifecycle.status === "scheduled" ? (
                    <Button
                      disabled={plannedSessionMutations.cancel.isPending}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        plannedSessionMutations.cancel.mutate({
                          profileId: session.profileId,
                          sessionId: session.id,
                          expectedRevision: session.sessionRevision,
                          reason: "user_requested",
                        })
                      }
                    >
                      Cancel session
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : eventsQuery.isError && !eventsQuery.data ? (
            <p className="text-sm text-muted-foreground">
              Personal planned sessions are unavailable until the calendar can be loaded.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No personal planned sessions in this period.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs
        value={view}
        onValueChange={(nextView) =>
          void navigate({
            to: "/calendar",
            search: {
              date: nextView === "week" && !date.startsWith(month) ? monthWindow.startKey : date,
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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {gridDays.map((date) => {
                  const dateKey = toDateKey(date);
                  const dayEvents = projectionItemsByDate.get(dateKey) ?? [];
                  const isCurrentMonth = date.getMonth() === parseInt(month.slice(5, 7), 10) - 1;
                  const visualState = deriveCalendarDayVisualState(dayEvents);

                  return (
                    <Link
                      key={dateKey}
                      to="/calendar/day/$date"
                      params={{ date: dateKey }}
                      search={{ month, view }}
                      aria-label={`${dateKey}. ${describeCalendarDayVisualState(visualState)} Open day.`}
                      className={cn(
                        "flex min-h-16 items-center justify-center rounded-xl p-1 transition-colors hover:bg-accent/40",
                        !isCurrentMonth && "text-muted-foreground",
                      )}
                    >
                      <CalendarDayVisual
                        day={date.getDate()}
                        decorative
                        muted={!isCurrentMonth}
                        state={visualState}
                        today={dateKey === todayKey}
                      />
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
            </CardHeader>
            <CardContent className="space-y-3">
              {weekComparison.planned.durationSeconds.value !== null ? (
                <p className="text-sm text-muted-foreground">
                  Planned duration: {Math.round(weekComparison.planned.durationSeconds.value / 60)}{" "}
                  min · Actual duration:{" "}
                  {weekComparison.actual.durationSeconds.value === null
                    ? "Unknown"
                    : `${Math.round(weekComparison.actual.durationSeconds.value / 60)} min${weekComparison.actual.durationSeconds.missingCount ? " (partial)" : ""}`}
                  {formatDistance(weekComparison.actual.distanceMeters.value)
                    ? ` · Actual distance: ${formatDistance(weekComparison.actual.distanceMeters.value)}${weekComparison.actual.distanceMeters.missingCount ? " (partial)" : ""}`
                    : ""}
                </p>
              ) : null}
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {weekWindow.days.map((dateKey) => (
                  <div key={`week-label-${dateKey}`}>{formatShortDayLabel(dateKey)}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekWindow.days.map((dateKey) => {
                  const visualState = deriveCalendarDayVisualState(
                    projectionItemsByDate.get(dateKey) ?? [],
                  );
                  return (
                    <Link
                      aria-label={`${dateKey}. ${describeCalendarDayVisualState(visualState)} Open day.`}
                      className="flex min-h-20 items-center justify-center rounded-xl p-1 transition-colors hover:bg-accent/40"
                      key={dateKey}
                      params={{ date: dateKey }}
                      search={{ month, view }}
                      to="/calendar/day/$date"
                    >
                      <CalendarDayVisual
                        day={Number(dateKey.slice(8, 10))}
                        decorative
                        state={visualState}
                        today={dateKey === todayKey}
                      />
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
              <h2 className="leading-none font-semibold">Month agenda</h2>
            </CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading agenda...</p>
              ) : visibleProjectionItems.length > 0 ? (
                <div className="space-y-3">
                  {visibleProjectionItems.map((item) => (
                    <CalendarProjectionCard item={item} key={`${item.kind}-${item.id}`} />
                  ))}
                </div>
              ) : eventsQuery.isError && !eventsQuery.data ? (
                <p className="text-sm text-muted-foreground">
                  The agenda is unavailable until the calendar can be loaded.
                </p>
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
