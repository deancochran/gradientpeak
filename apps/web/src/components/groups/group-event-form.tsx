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

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
    includeOwnOnly: false,
    includeSystemTemplates: true,
    includeEstimation: false,
    ownerScope: "all",
    compositionMode: "include_multisport",
    limit: 50,
  });
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startsAt, setStartsAt] = useState(
    localDateTime(event?.starts_at) ||
      localDateTime(new Date(Date.now() + 86_400_000).toISOString()),
  );
  const [endsAt, setEndsAt] = useState(localDateTime(event?.ends_at));
  const [locationName, setLocationName] = useState(event?.location_name ?? "");
  const [routeId, setRouteId] = useState(event?.route_id ?? "");
  const [activityPlanId, setActivityPlanId] = useState(event?.activity_plan_id ?? "");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [error, setError] = useState<unknown>(null);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  return (
    <form
      className="space-y-5"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        const start = new Date(startsAt);
        const end = endsAt ? new Date(endsAt) : null;
        if (Number.isNaN(start.getTime()) || (end && end <= start)) {
          setError(
            new Error(end ? "End time must be after start time." : "Choose a valid start time."),
          );
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
          startsAt: start.toISOString(),
          endsAt: end?.toISOString() ?? null,
          timezone,
          locationName: locationName.trim() || null,
          routeId: routeId || null,
          activityPlanId: activityPlanId || null,
          ...(recurrenceRule ? { recurrenceRule, recurrenceTimezone: timezone } : {}),
        }).catch(setError);
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
