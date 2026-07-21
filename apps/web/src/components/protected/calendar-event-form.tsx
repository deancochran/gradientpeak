import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { TimeInput } from "@repo/ui/components/time-input";
import { useZodForm } from "@repo/ui/hooks";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { updateCalendarEventAction } from "../../lib/planning/server-actions";

type EditableCalendarEvent = {
  all_day?: boolean | null;
  id: string;
  notes?: string | null;
  scheduled_date?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
  title?: string | null;
  recurrence_rule?: string | null;
  series_id?: string | null;
};

type CalendarEventFormProps = {
  event: EditableCalendarEvent;
  month: string;
  view: "agenda" | "month" | "week";
};

const calendarEventDetailsSchema = z.object({
  notes: z.string(),
  title: z.string().trim().min(1, "Enter an event title."),
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

export function CalendarEventForm({ event, month, view }: CalendarEventFormProps) {
  const [date, setDate] = useState(event.scheduled_date ?? "");
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(Boolean(event.all_day));
  const recurring = Boolean(event.series_id || event.recurrence_rule);
  const [scope, setScope] = useState<"single" | "future" | "series">("single");
  const form = useZodForm({
    defaultValues: {
      notes: event.notes ?? "",
      title: event.title ?? "",
    },
    schema: calendarEventDetailsSchema,
  });
  const title = form.watch("title");

  useEffect(() => {
    setDate(event.scheduled_date ?? "");
    setAllDay(Boolean(event.all_day));
    form.reset({ notes: event.notes ?? "", title: event.title ?? "" });

    if (event.starts_at) {
      const formattedTime = formatTimeForInput(event.starts_at, event.timezone);
      if (formattedTime) {
        setTime(formattedTime);
      }
    }
  }, [event, form]);

  return (
    <Form {...form}>
      <form action={updateCalendarEventAction.url} method="post" className="space-y-4">
        <input type="hidden" name="event_id" value={event.id} />
        <input type="hidden" name="scope" value={scope} />
        {scope !== "single" ? <input type="hidden" name="scheduled_date" value={date} /> : null}
        <input
          type="hidden"
          name="redirectTo"
          value={`/calendar/events/${event.id}?month=${month}&view=${view}`}
        />
        <FormTextField control={form.control} label="Title" name="title" required />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* These controls retain explicit names because this form must submit browser FormData
              directly to the server action; the shared RHF date/time fields do not emit names. */}
          <div>
            <DateInput
              disabled={scope !== "single"}
              id="event-date"
              label="Date"
              name="scheduled_date"
              value={date}
              onChange={(value) => setDate(value ?? "")}
            />
          </div>
          <div>
            <TimeInput
              disabled={allDay || scope !== "single"}
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

        <FormTextareaField control={form.control} label="Notes" name="notes" />

        {recurring ? (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="space-y-2">
              <label htmlFor="event-scope" className="text-sm font-medium">
                Apply changes to
              </label>
              <select
                id="event-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as typeof scope)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="single">This event only</option>
                <option value="future">This and future events</option>
                <option value="series">Entire series</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Rescheduling is instance-only. Future and series scopes update title and notes
                without changing occurrence dates.
              </p>
            </div>
          </div>
        ) : null}

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
    </Form>
  );
}
