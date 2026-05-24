import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { TimeInput } from "@repo/ui/components/time-input";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { updateCalendarEventAction } from "../../lib/planning/server-actions";

type EditableCalendarEvent = {
  all_day?: boolean | null;
  id: string;
  notes?: string | null;
  scheduled_date?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
  title?: string | null;
};

type CalendarEventFormProps = {
  event: EditableCalendarEvent;
  month: string;
  view: "agenda" | "month";
};

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

export function CalendarEventForm({ event, month, view }: CalendarEventFormProps) {
  const [title, setTitle] = useState(event.title ?? "");
  const [date, setDate] = useState(event.scheduled_date ?? "");
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(Boolean(event.all_day));
  const [notes, setNotes] = useState(event.notes ?? "");

  useEffect(() => {
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

  return (
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
        <div>
          <DateInput
            id="event-date"
            label="Date"
            name="date"
            value={date}
            onChange={(value) => setDate(value ?? "")}
          />
        </div>
        <div>
          <TimeInput
            disabled={allDay}
            id="event-time"
            label="Time"
            name="time"
            value={time}
            onChange={(value) => setTime(value ?? "")}
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
            params={{ eventId: event.id }}
            search={{ flash: undefined, flashType: undefined, month, view }}
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
