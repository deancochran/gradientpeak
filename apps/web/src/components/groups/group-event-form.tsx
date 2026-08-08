import { formatIsoInstantInIanaZone, scheduledDateTimeToIsoInstant } from "@repo/core/calendar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useMemo, useState } from "react";
import { api } from "../../lib/api/client";
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

export function GroupEventForm({
  event,
  isSubmitting,
  onCancel,
  onSubmit,
  submitLabel,
}: GroupEventFormProps) {
  const routesQuery = api.routes.list.useQuery({ limit: 50, ownerScope: "all" });
  const plansQuery = api.activityPlans.list.useQuery({
    includeEstimation: false,
    ownerScope: "all",
    limit: 50,
  });
  const timezone = useMemo(
    () => event?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [event?.timezone],
  );
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startsAt, setStartsAt] = useState(
    wallDateTime(event?.starts_at, timezone) ||
      wallDateTime(new Date(Date.now() + 86_400_000).toISOString(), timezone),
  );
  const [endsAt, setEndsAt] = useState(wallDateTime(event?.ends_at, timezone));
  const [locationName, setLocationName] = useState(event?.location_name ?? "");
  const [routeId, setRouteId] = useState(event?.route_id ?? "");
  const [activityPlanId, setActivityPlanId] = useState(event?.activity_plan_id ?? "");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <form
      className="space-y-5"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        let startInstant: string;
        let endInstant: string | null;
        try {
          startInstant = wallDateTimeToInstant(startsAt, timezone);
          endInstant = endsAt ? wallDateTimeToInstant(endsAt, timezone) : null;
        } catch (wallTimeError) {
          setError(wallTimeError);
          return;
        }
        if (endInstant && Date.parse(endInstant) <= Date.parse(startInstant)) {
          setError(new Error("End time must be after start time."));
          return;
        }
        if (!event && recurrence !== "none" && !recurrenceUntil) {
          setError(new Error("Choose when the recurring series ends."));
          return;
        }
        setError(null);
        const recurrenceRule =
          recurrence === "none"
            ? undefined
            : `FREQ=${recurrence.toUpperCase()};UNTIL=${recurrenceUntil.replaceAll("-", "")}T235959Z`;
        void onSubmit({
          title: title.trim(),
          description: description.trim() || null,
          startsAt: startInstant,
          endsAt: endInstant,
          timezone,
          locationName: locationName.trim() || null,
          routeId: routeId || null,
          activityPlanId: activityPlanId || null,
          ...(recurrenceRule ? { recurrenceRule, recurrenceTimezone: timezone } : {}),
        }).catch(setError);
      }}
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Times use {timezone}.</p>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="group-event-start">Starts</Label>
          <Input
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
            id="group-event-end"
            type="datetime-local"
            value={endsAt}
            onChange={(changeEvent) => setEndsAt(changeEvent.target.value)}
          />
        </div>
      </div>
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
            onChange={(changeEvent) => setRouteId(changeEvent.target.value)}
          >
            <option value="">No route</option>
            {(routesQuery.data?.items ?? []).map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </select>
          {routesQuery.error ? (
            <span className="block text-xs text-destructive">Routes are unavailable.</span>
          ) : null}
        </label>
        <label className="space-y-2 text-sm font-medium" htmlFor="group-event-plan">
          Activity-plan attachment
          <select
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
            id="group-event-plan"
            value={activityPlanId}
            onChange={(changeEvent) => setActivityPlanId(changeEvent.target.value)}
          >
            <option value="">No activity plan</option>
            {(plansQuery.data?.items ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          {plansQuery.error ? (
            <span className="block text-xs text-destructive">Activity plans are unavailable.</span>
          ) : null}
        </label>
      </div>
      <MutationError error={error} />
      <div className="flex justify-end gap-3">
        <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isSubmitting || !title.trim() || !startsAt} type="submit">
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
