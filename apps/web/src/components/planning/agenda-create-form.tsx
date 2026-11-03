import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Form, FormTimezoneField } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { TimeInput } from "@repo/ui/components/time-input";
import { useZodForm } from "@repo/ui/hooks";
import { useRef, useState } from "react";
import { z } from "zod";

import { contractEpochFormInputProps } from "../../lib/contract-epoch";
import { getTodayDateKey } from "../../lib/planning";
import { createCalendarEventAction } from "../../lib/planning/server-actions";
import { useFormServerFn } from "../../lib/use-form-server-fn";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";

const agendaTimezoneSchema = z.object({ timezone: z.string().nullable() });

export function AgendaCreateForm({
  initialDate,
  redirectTo,
}: {
  initialDate?: string;
  redirectTo?: string;
}) {
  const [date, setDate] = useState(initialDate ?? getTodayDateKey());
  const [time, setTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrenceCount, setRecurrenceCount] = useState("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const initialValues = useRef({ date: initialDate ?? getTodayDateKey(), time: "" });
  const timezoneForm = useZodForm({
    schema: agendaTimezoneSchema,
    defaultValues: { timezone: null },
  });
  const timezone = timezoneForm.watch("timezone");
  const { markSaveFailed, markSaved } = useUnsavedChangesGuard({
    draft: { allDay, date, notes, recurrenceCount, time, timezone, title },
    dirty:
      title !== "" ||
      notes !== "" ||
      date !== initialValues.current.date ||
      time !== initialValues.current.time ||
      allDay ||
      recurrenceCount !== "1" ||
      timezone !== null,
    pending: isSubmitting,
  });
  const createCalendarEvent = useFormServerFn(createCalendarEventAction, markSaved);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // The wrapper marks the form saved only after the server request resolves; successful
      // redirects complete through TanStack Router inside useServerFn before the promise settles.
      await createCalendarEvent({ data: new FormData(event.currentTarget) as never });
    } catch (error) {
      markSaveFailed();
      setSubmitError(error instanceof Error ? error.message : "Unable to create event. Try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...timezoneForm}>
      <form
        action={createCalendarEventAction.url}
        className="space-y-5"
        method="post"
        onSubmit={handleSubmit}
      >
        <input {...contractEpochFormInputProps} />
        <input name="event_type" type="hidden" value="custom" />
        {redirectTo ? <input name="redirectTo" type="hidden" value={redirectTo} /> : null}
        <input type="hidden" name="timezone" value={timezone ?? ""} />

        <div className="space-y-2">
          <Label htmlFor="agenda-title">Title</Label>
          <Input
            autoFocus
            id="agenda-title"
            name="title"
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
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
            required={!allDay}
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

        <FormTimezoneField
          control={timezoneForm.control}
          deviceTimeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          label="Event time zone"
          name="timezone"
        />

        <div className="space-y-2">
          <Label htmlFor="agenda-recurrence">Repeat weekly</Label>
          <select
            id="agenda-recurrence"
            name="recurrence_count"
            value={recurrenceCount}
            onChange={(event) => setRecurrenceCount(event.target.value)}
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
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        {submitError ? (
          <p role="alert" aria-live="polite" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" disabled={!date || !timezone || (!allDay && !time) || isSubmitting}>
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
      </form>
    </Form>
  );
}
