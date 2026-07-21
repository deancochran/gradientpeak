import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { RouteFlashToast, type RouteFlashType } from "../../../components/route-flash-toast";
import { api } from "../../../lib/api/client";
import { formatDayLabel, formatEventTimeRange, getEventTitle } from "../../../lib/planning";
import {
  attachCalendarActivityPlanAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "../../../lib/planning/server-actions";

export const Route = createFileRoute("/_protected/scheduled-activities/$eventId")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType: search.flashType as RouteFlashType | undefined,
  }),
  component: ScheduledActivityDetailPage,
});

function ScheduledActivityDetailPage() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch() as { flash?: string; flashType?: RouteFlashType };
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const eventQuery = api.events.getById.useQuery({ id: eventId }, { enabled: Boolean(eventId) });
  const plansQuery = api.activityPlans.list.useQuery({ ownerScope: "own", limit: 100 });
  const event = eventQuery.data;
  if (eventQuery.isLoading) return <p>Loading scheduled activity...</p>;
  if (eventQuery.isError)
    return (
      <div role="alert">
        <p>Scheduled activity could not be loaded.</p>
        <Button onClick={() => void eventQuery.refetch()}>Retry</Button>
      </div>
    );
  if (!event) return <p>Scheduled activity not found.</p>;
  const recurring = Boolean(event.series_id || event.recurrence_rule);
  return (
    <div className="space-y-6">
      <RouteFlashToast
        {...(search.flash !== undefined ? { message: search.flash } : {})}
        {...(search.flashType !== undefined ? { type: search.flashType } : {})}
        clear={() => window.history.replaceState(null, "", `/scheduled-activities/${eventId}`)}
      />
      <div>
        <a className="text-sm text-primary" href="/scheduled-activities">
          Back to scheduled activities
        </a>
        <h1 className="mt-2 text-3xl font-semibold">{getEventTitle(event)}</h1>
        <p className="text-muted-foreground">
          {formatDayLabel(event.scheduled_date)} · {formatEventTimeRange(event)}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity plan</CardTitle>
            <CardDescription>
              Attach, change, or remove the persisted activity-plan association.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{event.activity_plan?.name ?? "No activity plan attached"}</p>
            {plansQuery.isError ? (
              <div role="alert">
                <p>Activity plans could not be loaded.</p>
                <Button size="sm" variant="outline" onClick={() => void plansQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <form
                action={attachCalendarActivityPlanAction.url}
                method="post"
                className="space-y-3"
              >
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="operation" value="attach" />
                <input
                  type="hidden"
                  name="title"
                  value={event.title ?? event.activity_plan?.name ?? "Scheduled activity"}
                />
                <input
                  type="hidden"
                  name="redirectTo"
                  value={`/scheduled-activities/${event.id}`}
                />
                <select
                  aria-label="Activity plan"
                  name="activity_plan_id"
                  required
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="">Choose activity plan</option>
                  {(plansQuery.data?.items ?? []).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={!selectedPlanId}>
                  Attach activity plan
                </Button>
              </form>
            )}
            {event.activity_plan ? (
              <form action={attachCalendarActivityPlanAction.url} method="post">
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="operation" value="remove" />
                <input
                  type="hidden"
                  name="title"
                  value={event.title ?? event.activity_plan.name ?? "Event"}
                />
                <input
                  type="hidden"
                  name="redirectTo"
                  value={`/scheduled-activities/${event.id}`}
                />
                <Button type="submit" variant="outline">
                  Remove activity plan
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reschedule</CardTitle>
            <CardDescription>
              Rescheduling changes this occurrence only
              {recurring ? "; series-wide time moves are not supported by the API" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateCalendarEventAction.url} method="post" className="space-y-3">
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="scope" value="single" />
              <input
                type="hidden"
                name="title"
                value={event.title ?? event.activity_plan?.name ?? "Scheduled activity"}
              />
              <input type="hidden" name="notes" value={event.notes ?? ""} />
              <input type="hidden" name="all_day" value="true" />
              <input type="hidden" name="redirectTo" value={`/scheduled-activities/${event.id}`} />
              <label className="block text-sm font-medium" htmlFor="reschedule-date">
                New date
              </label>
              <input
                id="reschedule-date"
                className="h-10 w-full rounded-md border bg-background px-3"
                type="date"
                name="scheduled_date"
                defaultValue={event.scheduled_date}
                required
              />
              <Button type="submit">Reschedule occurrence</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Remove scheduled activity</CardTitle>
          <CardDescription>Recurring schedules require an explicit mutation scope.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={deleteCalendarEventAction.url}
            method="post"
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="redirectTo" value="/scheduled-activities" />
            {recurring ? (
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Remove scope</span>
                <select
                  name="scope"
                  defaultValue="single"
                  className="h-10 rounded-md border bg-background px-3"
                >
                  <option value="single">This event only</option>
                  <option value="future">This and future events</option>
                  <option value="series">Entire series</option>
                </select>
              </label>
            ) : (
              <input type="hidden" name="scope" value="single" />
            )}
            <Button type="submit" variant="destructive">
              Remove from schedule
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
