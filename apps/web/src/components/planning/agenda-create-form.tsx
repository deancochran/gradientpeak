import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { TimeInput } from "@repo/ui/components/time-input";
import { useEffect, useState } from "react";

import { api } from "../../lib/api/client";
import { getTodayDateKey } from "../../lib/planning";
import { createCalendarEventAction } from "../../lib/planning/server-actions";

export type AgendaCreateType = "custom" | "race_target" | "planned";

export function AgendaCreateForm({
  initialDate,
  initialType = "custom",
}: {
  initialDate?: string;
  initialType?: AgendaCreateType;
}) {
  const [eventType, setEventType] = useState<AgendaCreateType>(initialType);
  const [date, setDate] = useState(initialDate ?? getTodayDateKey());
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const activityPlansQuery = api.activityPlans.list.useQuery(
    { ownerScope: "own", limit: 100 },
    { enabled: eventType === "planned" },
  );

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  return (
    <form action={createCalendarEventAction.url} method="post" className="space-y-5">
      <input type="hidden" name="timezone" value={timezone} />
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Creation type</legend>
        {(
          [
            ["custom", "Custom event"],
            ["race_target", "Race"],
            ["planned", "Planned activity"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"
          >
            <input
              checked={eventType === value}
              name="event_type"
              type="radio"
              value={value}
              onChange={() => setEventType(value)}
            />
            <span className="text-sm font-medium">{label}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="agenda-title">Title</Label>
        <Input id="agenda-title" name="title" required maxLength={255} />
      </div>

      {eventType === "planned" ? (
        <div className="space-y-2">
          <Label htmlFor="agenda-activity-plan">Activity plan</Label>
          <select
            id="agenda-activity-plan"
            name="activity_plan_id"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose an activity plan</option>
            {(activityPlansQuery.data?.items ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          {activityPlansQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Activity plans could not be loaded. Retry the query before scheduling.
            </p>
          ) : null}
          {!activityPlansQuery.isLoading && activityPlansQuery.data?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create an activity plan before scheduling planned work.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput
          id="agenda-date"
          label="Date"
          name="scheduled_date"
          value={date}
          onChange={(value) => setDate(value ?? "")}
        />
        {eventType !== "planned" ? (
          <TimeInput
            disabled={allDay}
            id="agenda-time"
            label="Time"
            name="time"
            value={time}
            onChange={(value) => setTime(value ?? "")}
          />
        ) : null}
      </div>

      {eventType !== "planned" ? (
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
      ) : null}

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

      <Button
        type="submit"
        disabled={!date || (eventType === "planned" && activityPlansQuery.isError)}
      >
        Create
      </Button>
    </form>
  );
}
