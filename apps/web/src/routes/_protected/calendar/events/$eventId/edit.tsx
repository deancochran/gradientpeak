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
import { type FormEvent, useEffect, useState } from "react";

import { api } from "../../../../../lib/api/client";
import {
  buildAllDayStartIso,
  buildTimedEndIso,
  buildTimedStartIso,
  getEventDurationMs,
  getMonthKey,
} from "../../../../../lib/planning";

const monthSearchPattern = /^\d{4}-\d{2}$/;

export const Route = createFileRoute("/_protected/calendar/events/$eventId/edit")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && monthSearchPattern.test(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" ? "agenda" : "month",
  }),
  component: EventEditPage,
});

function EventEditPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { eventId } = Route.useParams();
  const { month, view } = Route.useSearch();
  const eventQuery = api.events.getById.useQuery({ id: eventId }, { enabled: Boolean(eventId) });
  const event = eventQuery.data;
  const updateMutation = api.events.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.events.invalidate(),
        utils.trainingPlans.getActivePlan.invalidate(),
      ]);
      void navigate({
        to: "/calendar/events/$eventId",
        params: { eventId },
        search: { month, view },
      });
    },
  });

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
      const startsAt = new Date(event.starts_at);
      if (!Number.isNaN(startsAt.getTime())) {
        setTime(
          `${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`,
        );
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

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();

    const normalizedTitle = title.trim();
    if (!normalizedTitle || !date) {
      return;
    }

    const startsAt = allDay ? buildAllDayStartIso(date) : buildTimedStartIso(date, time);
    updateMutation.mutate({
      id: event.id,
      scope: "single",
      patch: {
        title: normalizedTitle,
        notes: notes.trim() ? notes.trim() : null,
        all_day: allDay,
        timezone: "UTC",
        starts_at: startsAt,
        ends_at: allDay ? undefined : buildTimedEndIso(startsAt, getEventDurationMs(event)),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/calendar/events/$eventId" params={{ eventId }} search={{ month, view }}>
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
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time">Time</Label>
                <Input
                  id="event-time"
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
                type="checkbox"
                onChange={(event) => setAllDay(event.target.checked)}
              />
              All day event
            </label>

            <div className="space-y-2">
              <Label htmlFor="event-notes">Notes</Label>
              <Textarea
                id="event-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={updateMutation.isPending}>
                Save changes
              </Button>
              <Button asChild variant="outline">
                <Link to="/calendar/events/$eventId" params={{ eventId }} search={{ month, view }}>
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
