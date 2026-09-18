import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { TimeInput } from "@repo/ui/components/time-input";
import { useZodForm } from "@repo/ui/hooks";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { contractEpochFormInputProps } from "../../lib/contract-epoch";
import { updateCalendarEventAction } from "../../lib/planning/server-actions";
import { useFormServerFn } from "../../lib/use-form-server-fn";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";

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

type ScopeOption = "single" | "future" | "series";

const calendarEventDetailsSchema = z.object({
  notes: z.string(),
  title: z.string().trim().min(1, "Enter an event title."),
});
const calendarScheduleSchema = z
  .object({
    allDay: z.boolean(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid event date."),
    time: z.string(),
  })
  .superRefine((value, context) => {
    if (!value.allDay && !/^\d{2}:\d{2}$/.test(value.time)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose an event time.",
        path: ["time"],
      });
    }
  });

function formatTimeForInput(startsAtIso: string, timeZone: string | null | undefined) {
  if (!timeZone) return null;
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
  const initialTime = event.starts_at
    ? (formatTimeForInput(event.starts_at, event.timezone) ?? "")
    : "";
  const [date, setDate] = useState(event.scheduled_date ?? "");
  const [time, setTime] = useState(initialTime);
  const [allDay, setAllDay] = useState(Boolean(event.all_day));
  const [scope, setScope] = useState<ScopeOption>("single");
  const recurring = Boolean(event.series_id || event.recurrence_rule);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const form = useZodForm({
    defaultValues: {
      notes: event.notes ?? "",
      title: event.title ?? "",
    },
    schema: calendarEventDetailsSchema,
  });
  const title = form.watch("title");
  const calendarDraft = { allDay, date, notes: form.watch("notes"), time, title };
  const scheduleChanged =
    date !== (event.scheduled_date ?? "") ||
    time !== initialTime ||
    allDay !== Boolean(event.all_day);
  const { guardedCancel, markSaveFailed, markSaved } = useUnsavedChangesGuard({
    draft: calendarDraft,
    dirty: form.formState.isDirty || scheduleChanged,
    pending: isSubmitting,
  });
  const updateCalendarEvent = useFormServerFn(updateCalendarEventAction, markSaved);

  useEffect(() => {
    setDate(event.scheduled_date ?? "");
    setAllDay(Boolean(event.all_day));
    setScope("single");
    form.reset({ notes: event.notes ?? "", title: event.title ?? "" });

    setTime(event.starts_at ? (formatTimeForInput(event.starts_at, event.timezone) ?? "") : "");
  }, [event, form]);

  useEffect(() => {
    if (scheduleChanged && scope !== "single") {
      setScope("single");
    }
  }, [scheduleChanged, scope]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const scheduleResult = calendarScheduleSchema.safeParse({ allDay, date, time });
    if (!scheduleResult.success) {
      setSubmitError(scheduleResult.error.issues[0]?.message ?? "Check the event schedule.");
      return;
    }

    const submittedScope = new FormData(event.currentTarget).get("scope") ?? "single";
    if (scheduleChanged && (submittedScope === "future" || submittedScope === "series")) {
      setSubmitError(
        "This and future events and entire series only accept title and notes changes. " +
          "Date, time, and all-day changes apply to this event only.",
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // The wrapper marks the form saved only after the server request resolves; successful
      // redirects complete through TanStack Router inside useServerFn before the promise settles.
      await updateCalendarEvent({ data: new FormData(event.currentTarget) as never });
    } catch (error) {
      markSaveFailed();
      setSubmitError(error instanceof Error ? error.message : "Unable to update event. Try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form
        action={updateCalendarEventAction.url}
        method="post"
        className="space-y-4"
        onSubmit={handleSubmit}
      >
        <input {...contractEpochFormInputProps} />
        <input type="hidden" name="event_id" value={event.id} />
        {recurring ? (
          <label className="grid gap-1 text-sm font-medium">
            Apply changes to
            <select
              aria-describedby={scheduleChanged ? "calendar-scope-hint" : undefined}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              name="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as ScopeOption)}
            >
              <option value="single">This event</option>
              <option disabled={scheduleChanged} value="future">
                This and future events (title and notes only)
              </option>
              <option disabled={scheduleChanged} value="series">
                Entire series (title and notes only)
              </option>
            </select>
            {scheduleChanged ? (
              <p
                aria-live="polite"
                className="text-xs font-normal text-muted-foreground"
                id="calendar-scope-hint"
              >
                Date, time, and all-day changes apply only to this event.
              </p>
            ) : null}
          </label>
        ) : (
          <input type="hidden" name="scope" value="single" />
        )}
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
              {...(date && /^\d{4}-\d{2}-\d{2}$/.test(date)
                ? {}
                : { error: "Enter a valid event date." })}
              id="event-date"
              label="Date"
              name="scheduled_date"
              value={date}
              onChange={(value) => setDate(value ?? "")}
            />
          </div>
          <div>
            <TimeInput
              disabled={allDay}
              id="event-time"
              label="Time"
              {...(allDay || /^\d{2}:\d{2}$/.test(time) ? {} : { error: "Choose an event time." })}
              name="time"
              required={!allDay}
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

        {submitError ? (
          <p role="alert" aria-live="polite" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={!title.trim() || !date || (!allDay && !time) || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save changes"}
          </Button>
          <Button asChild variant="outline" disabled={isSubmitting}>
            <Link
              onClick={(event) => {
                if (!guardedCancel(() => undefined)) event.preventDefault();
              }}
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
