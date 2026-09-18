import { formatIsoInstantInIanaZone, scheduledDateTimeToIsoInstant } from "@repo/core/calendar";
import { Button } from "@repo/ui/components/button";
import { Form, FormTimezoneField } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useZodForm } from "@repo/ui/hooks";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { api } from "../../lib/api/client";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";
import { type GroupEventSummary, MutationError } from "./group-ui";

export type GroupEventFormValue = {
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  locationName: string | null;
  routeId: string | null;
  activityPlanId: string | null;
  recurrenceRule?: string;
  recurrenceTimezone?: string;
};

type GroupEventFormProps = {
  event?: GroupEventSummary | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSuccess?: () => void;
  onSubmit: (value: GroupEventFormValue) => Promise<void>;
  submitLabel: string;
};

function wallDateTime(value: string | null | undefined, timezone: string) {
  if (!value) return "";
  try {
    return formatIsoInstantInIanaZone(value, timezone);
  } catch {
    return "";
  }
}

function wallDateTimeToInstant(value: string, timezone: string) {
  const [scheduledDate, time] = value.split("T");
  return scheduledDateTimeToIsoInstant({
    scheduledDate: scheduledDate ?? "",
    time: time ?? "",
    timeZone: timezone,
  });
}

function recurrenceUntilInTimezone(value: string, timezone: string) {
  return wallDateTimeToInstant(`${value}T23:59`, timezone)
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".000Z", "Z");
}

export function GroupEventForm({
  event,
  isSubmitting,
  onCancel,
  onSuccess,
  onSubmit,
  submitLabel,
}: GroupEventFormProps) {
  const routesQuery = api.routes.list.useQuery({ limit: 50, ownerScope: "all" });
  const plansQuery = api.activityPlans.list.useQuery({
    ownerScope: "all",
    limit: 50,
  });
  const displayTimezone = useMemo(() => event?.timezone ?? "UTC", [event?.timezone]);
  const timezoneForm = useZodForm({
    schema: z.object({ timezone: z.string().min(1, "Choose an event time zone.").nullable() }),
    defaultValues: { timezone: event?.timezone ?? null },
  });
  const timezone = timezoneForm.watch("timezone");
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startsAt, setStartsAt] = useState(wallDateTime(event?.starts_at, displayTimezone));
  const [endsAt, setEndsAt] = useState(wallDateTime(event?.ends_at, displayTimezone));
  const [locationName, setLocationName] = useState(event?.location_name ?? "");
  const [routeId, setRouteId] = useState(event?.route_id ?? "");
  const [activityPlanId, setActivityPlanId] = useState(event?.activity_plan_id ?? "");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const initialValues = useRef({
    activityPlanId: event?.activity_plan_id ?? "",
    description: event?.description ?? "",
    endsAt: wallDateTime(event?.ends_at, displayTimezone),
    locationName: event?.location_name ?? "",
    routeId: event?.route_id ?? "",
    startsAt,
    title: event?.title ?? "",
  });
  const { guardedCancel, markSaved } = useUnsavedChangesGuard({
    draft: {
      activityPlanId,
      description,
      endsAt,
      locationName,
      recurrence,
      recurrenceUntil,
      routeId,
      startsAt,
      title,
      timezone,
    },
    dirty:
      title !== initialValues.current.title ||
      description !== initialValues.current.description ||
      startsAt !== initialValues.current.startsAt ||
      endsAt !== initialValues.current.endsAt ||
      locationName !== initialValues.current.locationName ||
      routeId !== initialValues.current.routeId ||
      activityPlanId !== initialValues.current.activityPlanId ||
      timezone !== event?.timezone ||
      recurrence !== "none" ||
      recurrenceUntil !== "",
    pending: isSubmitting,
  });
  return (
    <Form {...timezoneForm}>
      <form
        className="space-y-5"
        onSubmit={async (submitEvent) => {
          submitEvent.preventDefault();
          if (isSubmitting || submittingRef.current) return;
          const isTimezoneValid = await timezoneForm.trigger("timezone");
          if (!isTimezoneValid || !timezone) return;
          let startInstant: string;
          let endInstant: string | null;
          try {
            startInstant = wallDateTimeToInstant(startsAt, timezone);
            endInstant = endsAt ? wallDateTimeToInstant(endsAt, timezone) : null;
          } catch (wallTimeError) {
            setScheduleError(
              wallTimeError instanceof Error ? wallTimeError.message : "Choose valid event times.",
            );
            setError(wallTimeError);
            return;
          }
          if (endInstant && Date.parse(endInstant) <= Date.parse(startInstant)) {
            const message = "End time must be after start time.";
            setScheduleError(message);
            setError(new Error(message));
            return;
          }
          if (!event && recurrence !== "none" && !recurrenceUntil) {
            setError(new Error("Choose when the recurring series ends."));
            return;
          }
          setError(null);
          setScheduleError(null);
          const recurrenceRule =
            recurrence === "none"
              ? undefined
              : `FREQ=${recurrence.toUpperCase()};UNTIL=${recurrenceUntilInTimezone(recurrenceUntil, timezone)}`;
          submittingRef.current = true;
          try {
            await onSubmit({
              title: title.trim(),
              description: description.trim() || null,
              startsAt: startInstant,
              endsAt: endInstant,
              timezone,
              locationName: locationName.trim() || null,
              routeId: routeId || null,
              activityPlanId: activityPlanId || null,
              ...(recurrenceRule ? { recurrenceRule, recurrenceTimezone: timezone } : {}),
            });
            markSaved();
            onSuccess?.();
          } catch (submitError) {
            setError(submitError);
          } finally {
            submittingRef.current = false;
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="group-event-title">Title</Label>
          <Input
            id="group-event-title"
            maxLength={160}
            required
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
          />
        </div>
        {!event ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium" htmlFor="group-event-recurrence">
              Event cadence
              <select
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
                id="group-event-recurrence"
                value={recurrence}
                onChange={(changeEvent) =>
                  setRecurrence(changeEvent.target.value as typeof recurrence)
                }
              >
                <option value="none">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {recurrence !== "none" ? (
              <div className="space-y-2">
                <Label htmlFor="group-event-until">Repeat until</Label>
                <Input
                  id="group-event-until"
                  required
                  type="date"
                  value={recurrenceUntil}
                  onChange={(changeEvent) => setRecurrenceUntil(changeEvent.target.value)}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="group-event-description">Description</Label>
          <Textarea
            id="group-event-description"
            maxLength={4000}
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
          />
        </div>
        {scheduleError ? (
          <p className="text-xs text-destructive" id="group-event-schedule-error" role="alert">
            {scheduleError}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="group-event-start">Starts</Label>
            <Input
              aria-describedby={scheduleError ? "group-event-schedule-error" : undefined}
              aria-invalid={Boolean(scheduleError)}
              id="group-event-start"
              required
              type="datetime-local"
              value={startsAt}
              onChange={(changeEvent) => setStartsAt(changeEvent.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-event-end">Ends</Label>
            <Input
              aria-describedby={scheduleError ? "group-event-schedule-error" : undefined}
              aria-invalid={Boolean(scheduleError)}
              id="group-event-end"
              type="datetime-local"
              value={endsAt}
              onChange={(changeEvent) => setEndsAt(changeEvent.target.value)}
            />
          </div>
        </div>
        <FormTimezoneField
          control={timezoneForm.control}
          deviceTimeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          label="Event time zone"
          name="timezone"
          rules={{ required: "Choose an event time zone." }}
        />
        <div className="space-y-2">
          <Label htmlFor="group-event-location">Location</Label>
          <Input
            id="group-event-location"
            value={locationName}
            onChange={(changeEvent) => setLocationName(changeEvent.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium" htmlFor="group-event-route">
            Route attachment
            <select
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
              id="group-event-route"
              value={routeId}
              onChange={(changeEvent) => {
                setRouteId(changeEvent.target.value);
                if (changeEvent.target.value) setActivityPlanId("");
              }}
            >
              <option value="">No route</option>
              {(routesQuery.data?.items ?? []).map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
            {routesQuery.isLoading ? (
              <span className="block text-xs text-muted-foreground">Loading routes…</span>
            ) : null}
            {routesQuery.error ? (
              <span className="block text-xs text-destructive">
                Routes are unavailable.{" "}
                <button onClick={() => void routesQuery.refetch()} type="button">
                  Retry
                </button>
              </span>
            ) : null}
          </label>
          <label className="space-y-2 text-sm font-medium" htmlFor="group-event-plan">
            Activity-plan attachment
            <select
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
              id="group-event-plan"
              value={activityPlanId}
              onChange={(changeEvent) => {
                setActivityPlanId(changeEvent.target.value);
                if (changeEvent.target.value) setRouteId("");
              }}
            >
              <option value="">No activity plan</option>
              {(plansQuery.data?.items ?? []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            {plansQuery.isLoading ? (
              <span className="block text-xs text-muted-foreground">Loading activity plans…</span>
            ) : null}
            {plansQuery.error ? (
              <span className="block text-xs text-destructive">
                Activity plans are unavailable.{" "}
                <button onClick={() => void plansQuery.refetch()} type="button">
                  Retry
                </button>
              </span>
            ) : null}
          </label>
        </div>
        <MutationError error={error} />
        <div className="flex justify-end gap-3">
          <Button
            disabled={isSubmitting}
            onClick={() => guardedCancel(onCancel)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting || !title.trim() || !startsAt || !timezone} type="submit">
            {isSubmitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
