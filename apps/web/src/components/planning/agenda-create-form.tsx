import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { TimeInput } from "@repo/ui/components/time-input";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { contractEpochFormInputProps } from "../../lib/contract-epoch";
import { getTodayDateKey } from "../../lib/planning";
import { createCalendarEventAction } from "../../lib/planning/server-actions";

export function AgendaCreateForm({ initialDate }: { initialDate?: string }) {
  const [date, setDate] = useState(initialDate ?? getTodayDateKey());
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const createCalendarEvent = useServerFn(createCalendarEventAction);

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await createCalendarEvent({ data: new FormData(event.currentTarget) as never });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create event. Try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form
      action={createCalendarEventAction.url}
      method="post"
      className="space-y-5"
      onSubmit={handleSubmit}
    >
      <input {...contractEpochFormInputProps} />
      <input name="event_type" type="hidden" value="custom" />
      <input type="hidden" name="timezone" value={timezone} />

      <div className="space-y-2">
        <Label htmlFor="agenda-title">Title</Label>
        <Input id="agenda-title" name="title" required maxLength={255} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput
          id="agenda-date"
          label="Date"
          name="scheduled_date"
          value={date}
          onChange={(value) => setDate(value ?? "")}
        />
        <TimeInput
          disabled={allDay}
          id="agenda-time"
          label="Time"
          name="time"
          value={time}
          onChange={(value) => setTime(value ?? "")}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          checked={allDay}
          name="all_day"
          type="checkbox"
          value="true"
          onChange={(event) => setAllDay(event.target.checked)}
        />
        All day
      </label>

      <div className="space-y-2">
        <Label htmlFor="agenda-recurrence">Repeat weekly</Label>
        <select
          id="agenda-recurrence"
          name="recurrence_count"
          defaultValue="1"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="1">Does not repeat</option>
          <option value="4">4 occurrences</option>
          <option value="8">8 occurrences</option>
          <option value="12">12 occurrences</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Recurrence is persisted as a bounded weekly series on this weekday.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="agenda-notes">Notes</Label>
        <textarea
          id="agenda-notes"
          name="notes"
          maxLength={2000}
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {submitError ? (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" disabled={!date || isSubmitting}>
        {isSubmitting ? "Creating..." : "Create"}
      </Button>
    </form>
  );
}
