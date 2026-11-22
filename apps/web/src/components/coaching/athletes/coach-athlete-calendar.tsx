import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { activityPlanPreparationSearch } from "../../../lib/coaching/activity-plan-preparation-context";
import {
  loadCoachAthleteCalendar,
  shiftCalendarWeek,
} from "../../../lib/coaching/athlete-calendar-server-functions";

type Range = { startDate: string; endDateExclusive: string };
type Event = {
  eventId: string;
  planningDate: string;
  activityCategory: string;
  status: string;
  activityPlanId: string | null;
};
type Granted = {
  status: "granted";
  source: "planned_sessions";
  truncated: boolean;
  nextCursor: { eventId: string; planningDate: string } | null;
  projection: { events: ReadonlyArray<Event> };
};
type Result = { status: "error" } | { status: "forbidden" } | Granted;

function requestKey(
  actorProfileId: string,
  organizationId: string,
  athleteId: string,
  range: Range,
) {
  return `${actorProfileId}:${organizationId}:${athleteId}:${range.startDate}:${range.endDateExclusive}`;
}

function mergeEvents(current: ReadonlyArray<Event>, next: ReadonlyArray<Event>) {
  const events = new Map(current.map((event) => [event.eventId, event]));
  for (const event of next) events.set(event.eventId, event);
  return [...events.values()].sort(
    (left, right) =>
      left.planningDate.localeCompare(right.planningDate) ||
      left.eventId.localeCompare(right.eventId),
  );
}

/** Displays only consented, date-only planned sessions; it is not an availability or full-calendar view. */
export function CoachAthleteCalendar({
  actorProfileId,
  athleteId,
  initialRange,
  organizationId,
  result: initialResult,
}: {
  actorProfileId: string;
  athleteId: string;
  initialRange: Range;
  organizationId: string;
  result: Result;
}) {
  const navigate = useNavigate();
  const load = useServerFn(loadCoachAthleteCalendar);
  const sourceScope = requestKey(actorProfileId, organizationId, athleteId, initialRange);
  const initialStartDate = initialRange.startDate;
  const initialEndDateExclusive = initialRange.endDateExclusive;
  const scopeFence = useRef({
    activeRequest: 0,
    activeTarget: sourceScope,
    lifetime: 0,
    snapshot: initialResult,
    source: sourceScope,
  });
  let snapshotChanged = false;
  if (scopeFence.current.source !== sourceScope || scopeFence.current.snapshot !== initialResult) {
    scopeFence.current = {
      activeRequest: 0,
      activeTarget: sourceScope,
      lifetime: scopeFence.current.lifetime + 1,
      snapshot: initialResult,
      source: sourceScope,
    };
    snapshotChanged = true;
  }
  const [range, setRange] = useState(initialRange);
  const [result, setResult] = useState<Result>(initialResult);
  const [loadedLifetime, setLoadedLifetime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [failedRequest, setFailedRequest] = useState<{
    cursor: Granted["nextCursor"];
    range: Range;
  } | null>(null);
  const prepareFor = (planningDate: string) =>
    activityPlanPreparationSearch(
      // The selected date is navigation context only. Publication still checks
      // current coach ownership and creates a separate immutable athlete copy.
      {
        athleteId,
        calendarStartDate: displayedRange.startDate,
        organizationId,
        planningDate,
        returnTo: "athlete-workspace",
      },
    );

  // Scope fences are advanced synchronously during render. Effects only hydrate
  // new input; no prior actor/org/athlete/range data is rendered in that gap.
  useEffect(() => {
    if (scopeFence.current.source !== sourceScope || scopeFence.current.snapshot !== initialResult)
      return;
    setRange({ startDate: initialStartDate, endDateExclusive: initialEndDateExclusive });
    setResult(initialResult);
    setLoadedLifetime(scopeFence.current.lifetime);
    setIsLoading(false);
    setFailedRequest(null);
  }, [initialEndDateExclusive, initialResult, initialStartDate, sourceScope]);

  const request = async (nextRange: Range, cursor: Granted["nextCursor"], append: boolean) => {
    const targetScope = requestKey(actorProfileId, organizationId, athleteId, nextRange);
    const fence = {
      lifetime: scopeFence.current.lifetime,
      request: scopeFence.current.activeRequest + 1,
      targetScope,
    };
    scopeFence.current.activeRequest = fence.request;
    scopeFence.current.activeTarget = targetScope;
    setIsLoading(true);
    setFailedRequest(null);
    try {
      const next = await load({
        data: {
          athleteProfileId: athleteId,
          cursor,
          endDateExclusive: nextRange.endDateExclusive,
          organizationId,
          startDate: nextRange.startDate,
        },
      });
      if (
        scopeFence.current.lifetime !== fence.lifetime ||
        scopeFence.current.activeRequest !== fence.request ||
        scopeFence.current.activeTarget !== fence.targetScope
      )
        return;
      if (next.status === "forbidden") {
        // Consent/access loss is terminal for this section: do not retain rows.
        setRange(nextRange);
        setResult(next);
        return;
      }
      setRange(nextRange);
      if (!append) {
        void navigate({
          search: ((previous: Record<string, unknown>) => ({
            ...previous,
            calendarStartDate: nextRange.startDate,
          })) as never,
          replace: true,
        });
      }
      setResult(
        append && result.status === "granted"
          ? {
              ...next,
              projection: { events: mergeEvents(result.projection.events, next.projection.events) },
            }
          : next,
      );
    } catch {
      if (
        scopeFence.current.lifetime !== fence.lifetime ||
        scopeFence.current.activeRequest !== fence.request ||
        scopeFence.current.activeTarget !== fence.targetScope
      )
        return;
      setFailedRequest({ cursor, range: nextRange });
    } finally {
      if (
        scopeFence.current.lifetime === fence.lifetime &&
        scopeFence.current.activeRequest === fence.request &&
        scopeFence.current.activeTarget === fence.targetScope
      )
        setIsLoading(false);
    }
  };

  // A new loader snapshot is authoritative immediately, including a same-scope
  // access revocation. Subsequent renders wait for its state hydration instead
  // of briefly reviving the preceding snapshot.
  const displayedRange = snapshotChanged ? initialRange : range;
  const displayedResult = snapshotChanged ? initialResult : result;
  const displayedLoading = snapshotChanged ? false : isLoading;
  if (!snapshotChanged && loadedLifetime !== scopeFence.current.lifetime)
    return <p role="status">Loading planned sessions…</p>;

  if (displayedResult.status === "forbidden")
    return (
      <Card className="border-border bg-card text-foreground">
        <CardHeader>
          <CardTitle>
            <h2>Planned sessions unavailable</h2>
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Calendar sharing is not available for this athlete in the selected organization.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  if (displayedResult.status === "error")
    return (
      <Card className="border-border bg-card text-foreground">
        <CardHeader>
          <CardTitle>
            <h2>Planned sessions could not be loaded</h2>
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            The athlete overview is still available. Retry this calendar section.
          </CardDescription>
          <Button
            className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={displayedLoading}
            onClick={() => request(displayedRange, null, false)}
            type="button"
          >
            Retry calendar
          </Button>
        </CardHeader>
      </Card>
    );

  return (
    <Card className="border-border bg-card text-foreground">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Read-only</p>
        <CardTitle>
          <h2>Next scheduled work</h2>
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Scheduled work in {displayedRange.startDate} to {displayedRange.endDateExclusive}{" "}
          (exclusive). This selected range is not the athlete’s full personal calendar or
          availability.
        </CardDescription>
        <div className="flex gap-2">
          <Button
            className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={displayedLoading}
            onClick={() => request(shiftCalendarWeek(displayedRange, -1), null, false)}
            type="button"
            variant="outline"
          >
            Previous week
          </Button>
          <Button
            className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={displayedLoading}
            onClick={() => request(shiftCalendarWeek(displayedRange, 1), null, false)}
            type="button"
            variant="outline"
          >
            Next week
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {failedRequest ? (
          <div
            aria-atomic="true"
            aria-live="assertive"
            role="alert"
            className="mb-3 text-sm text-warning"
          >
            Planned sessions could not be loaded.{" "}
            <Button
              className="text-primary hover:text-primary focus-visible:ring-ring disabled:text-muted-foreground"
              onClick={() =>
                request(failedRequest.range, failedRequest.cursor, Boolean(failedRequest.cursor))
              }
              type="button"
              variant="link"
            >
              Retry
            </Button>
          </div>
        ) : null}
        {displayedLoading ? (
          <p aria-live="polite" role="status" className="mb-3 text-sm text-muted-foreground">
            Loading planned sessions…
          </p>
        ) : null}
        {displayedResult.projection.events.length ? (
          <ul className="space-y-2" aria-label="Planned sessions">
            {displayedResult.projection.events.map((event) => (
              <li key={event.eventId} className="rounded border border-border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{event.planningDate}</span>
                    <span className="capitalize text-muted-foreground">
                      {event.activityCategory}
                    </span>
                    <Badge className="border-primary/30 bg-primary/10 text-primary">
                      {event.status}
                    </Badge>
                  </div>
                  <Button
                    asChild
                    className="w-full whitespace-normal sm:w-auto sm:shrink-0"
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Link to="/activity-plans" search={prepareFor(event.planningDate) as never}>
                      Prepare a separate plan
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No planned sessions are shared in this range. This does not indicate availability.
          </p>
        )}
        {displayedResult.truncated && displayedResult.nextCursor ? (
          <Button
            className="mt-3 border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={displayedLoading}
            onClick={() => request(displayedRange, displayedResult.nextCursor, true)}
            type="button"
            variant="outline"
          >
            Load more planned sessions
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
