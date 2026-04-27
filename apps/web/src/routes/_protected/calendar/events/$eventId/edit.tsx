import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../../../../../lib/api/client";
import { getMonthKey, isValidMonthKey } from "../../../../../lib/planning";
import { updateCalendarEventAction } from "../../../../../lib/planning/server-actions";

export const Route = createFileRoute("/_protected/calendar/events/$eventId/edit")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" ? "agenda" : "month",
  }),
  component: EventEditPage,
});

function formatTimeForInput(startsAtIso: string, timeZone: string | null | undefined) {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(startsAt);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  if (typeof values.hour !== "string" || typeof values.minute !== "string") {
    return null;
  }

  return `${values.hour}:${values.minute}`;
}

function EventEditPage() {
  const { eventId } = Route.useParams();
  const { month, view } = Route.useSearch();
  const eventQuery = api.events.getById.useQuery({ id: eventId }, { enabled: Boolean(eventId) });
  const event = eventQuery.data;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!event) {
      return;
    }

    setTitle(event.title ?? "");
    setDate(event.scheduled_date ?? "");
    setAllDay(Boolean(event.all_day));
    setNotes(event.notes ?? "");

    if (event.starts_at) {
      const formattedTime = formatTimeForInput(event.starts_at, event.timezone);
      if (formattedTime) {
        setTime(formattedTime);
      }
    }
  }, [event]);

  if (eventQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading event...</p>;
  }

  if (!event) {
    return <p className="text-sm text-muted-foreground">Event not found.</p>;
  }

  if (event.event_type === "imported") {
    return <p className="text-sm text-muted-foreground">Imported events are read-only.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link
            to="/calendar/events/$eventId"
            params={{ eventId }}
            search={{ flash: undefined, flashType: undefined, month, view }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to event
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit event</h1>
          <p className="mt-1 text-muted-foreground">
            Progressive single-event editing for the web calendar slice.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Update schedule</CardTitle>
          <CardDescription>This route updates one event instance at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCalendarEventAction.url} method="post" className="space-y-4">
            <input type="hidden" name="event_id" value={event.id} />
            <input
              type="hidden"
              name="redirectTo"
              value={`/calendar/events/${event.id}?month=${month}&view=${view}`}
            />
            <div className="space-y-2">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time">Time</Label>
                <Input
                  id="event-time"
                  name="time"
                  type="time"
                  value={time}
                  disabled={allDay}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                checked={allDay}
                name="all_day"
                type="checkbox"
                value="true"
                onChange={(event) => setAllDay(event.target.checked)}
              />
              All day event
            </label>

            <div className="space-y-2">
              <Label htmlFor="event-notes">Notes</Label>
              <Textarea
                id="event-notes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={!title.trim() || !date}>
                Save changes
              </Button>
              <Button asChild variant="outline">
                <Link
                  to="/calendar/events/$eventId"
                  params={{ eventId }}
                  search={{ flash: undefined, flashType: undefined, month, view }}
                >
                  Cancel
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
