import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api/client";

export function RouteEventAttachment({ routeId }: { routeId: string }) {
  const utils = api.useUtils();
  const [eventId, setEventId] = useState("");
  const eventsQuery = api.events.list.useQuery({ include_adhoc: true, limit: 100 });
  const events = useMemo(
    () =>
      [...(eventsQuery.data?.items ?? [])].sort((left, right) =>
        String(left.starts_at).localeCompare(String(right.starts_at)),
      ),
    [eventsQuery.data?.items],
  );
  const attachMutation = api.events.update.useMutation({
    onSuccess: async () => {
      await utils.events.invalidate();
      toast.success("Route attached to event");
    },
    onError: (error) => toast.error(error.message || "Route attachment failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Use for an event</CardTitle>
        <CardDescription>
          Attach this route to one of your calendar events. The event keeps the route until you
          replace or remove it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {eventsQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Events could not be loaded. Try again.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="min-w-0 flex-1 space-y-2 text-sm font-medium">
              <span>Event</span>
              <select
                aria-label="Event"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={eventsQuery.isLoading || events.length === 0}
                onChange={(event) => setEventId(event.target.value)}
                value={eventId}
              >
                <option value="">Select an event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} · {String(event.scheduled_date ?? event.starts_at).slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="self-end"
              disabled={!eventId || attachMutation.isPending}
              onClick={() =>
                attachMutation.mutate({
                  id: eventId,
                  patch: { route_id: routeId },
                  scope: "single",
                })
              }
              type="button"
            >
              {attachMutation.isPending ? "Attaching..." : "Attach route"}
            </Button>
          </div>
        )}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events are available to attach.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
