import { createGroupEventEditorDraft, prepareGroupEventEditorPayload } from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormTextareaField,
  FormTextField,
  FormTimezoneField,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
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
  const initialDraft = useMemo(
    () =>
      createGroupEventEditorDraft(
        event
          ? {
              description: event.description,
              endsAt: event.ends_at,
              locationName: event.location_name,
              recurrenceRule: event.recurrence_rule,
              routeId: event.route_id,
              startsAt: event.starts_at,
              timezone: event.timezone,
              title: event.title,
            }
          : undefined,
        displayTimezone,
      ),
    [displayTimezone, event],
  );
  const form = useZodForm({
    schema: z.object({
      description: z.string(),
      locationName: z.string(),
      timezone: z.string().min(1, "Choose an event time zone.").nullable(),
      title: z.string(),
    }),
    defaultValues: {
      description: initialDraft.description,
      locationName: initialDraft.locationName,
      timezone: event?.timezone ?? null,
      title: initialDraft.title,
    },
  });
  const timezone = form.watch("timezone");
  const title = form.watch("title");
  const description = form.watch("description");
  const [startsAt, setStartsAt] = useState(
    initialDraft.date && initialDraft.startsTime
      ? `${initialDraft.date}T${initialDraft.startsTime}`
      : "",
  );
  const [endsAt, setEndsAt] = useState(
    initialDraft.endDate && initialDraft.endsTime
      ? `${initialDraft.endDate}T${initialDraft.endsTime}`
      : "",
  );
  const locationName = form.watch("locationName");
  const [routeId, setRouteId] = useState(initialDraft.routeId ?? "");
  const [activityPlanId, setActivityPlanId] = useState(event?.activity_plan_id ?? "");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(
    initialDraft.initializationError ?? null,
  );
  const submittingRef = useRef(false);
  const initialValues = useRef({
    activityPlanId: event?.activity_plan_id ?? "",
    description: initialDraft.description,
    endsAt:
      initialDraft.endDate && initialDraft.endsTime
        ? `${initialDraft.endDate}T${initialDraft.endsTime}`
        : "",
    locationName: initialDraft.locationName,
    routeId: initialDraft.routeId ?? "",
    startsAt,
    title: initialDraft.title,
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
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={async (submitEvent) => {
          submitEvent.preventDefault();
          if (isSubmitting || submittingRef.current) return;
          const isTimezoneValid = await form.trigger("timezone");
          if (!isTimezoneValid || !timezone) return;
          const [date = "", startsTime = ""] = startsAt.split("T");
          const [endDate = "", endsTime = ""] = endsAt.split("T");
          const prepared = prepareGroupEventEditorPayload(
            {
              date,
              description,
              endDate: endsAt ? endDate : null,
              endsTime: endsAt ? endsTime : null,
              locationName,
              recurrenceEndDate: recurrenceUntil || null,
              recurrenceFrequency: recurrence,
              routeId: routeId || null,
              startsTime,
              title,
              timezone,
            },
            {
              activityPlanId: activityPlanId || null,
              isRecurringCreate: !event && recurrence !== "none",
            },
          );
          if (!prepared.success) {
            setScheduleError(prepared.message);
            setError(new Error(prepared.message));
            return;
          }
          setError(null);
          setScheduleError(null);
          submittingRef.current = true;
          try {
            await onSubmit({
              ...prepared.data,
              activityPlanId: prepared.data.activityPlanId ?? null,
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
        <FormTextField control={form.control} label="Title" maxLength={160} name="title" required />
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
        <FormTextareaField
          control={form.control}
          label="Description"
          maxLength={4000}
          name="description"
        />
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
          control={form.control}
          deviceTimeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          label="Event time zone"
          name="timezone"
          rules={{ required: "Choose an event time zone." }}
        />
        <FormTextField control={form.control} label="Location" name="locationName" />
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
