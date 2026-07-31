import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api/client";
import { buildActivityReorderInput, moveScheduledActivity } from "./training-plan-model";

type ReorderActivity = {
  activity_plan_id: string;
  id: string;
  scheduled_date: string;
  title?: string | null;
  training_plan_id: string;
};

export function TrainingPlanActivityReorder() {
  const utils = api.useUtils();
  const events = api.events.list.useQuery({ limit: 100 });
  const reorder = api.trainingPlans.reorderActivities.useMutation();
  const source = useMemo(
    () =>
      (events.data?.items ?? []).filter(
        (event): event is typeof event & ReorderActivity =>
          typeof event.activity_plan_id === "string" &&
          typeof event.scheduled_date === "string" &&
          typeof event.training_plan_id === "string" &&
          !("completed_activity_id" in event && event.completed_activity_id),
      ),
    [events.data?.items],
  );
  const [activities, setActivities] = useState<ReorderActivity[]>([]);
  const [original, setOriginal] = useState<ReorderActivity[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (dirty) return;
    const snapshot = source.map((activity) => ({
      activity_plan_id: activity.activity_plan_id,
      id: activity.id,
      scheduled_date: activity.scheduled_date,
      title: activity.title,
      training_plan_id: activity.training_plan_id,
    }));
    setActivities(snapshot);
    setOriginal(structuredClone(snapshot));
  }, [dirty, source]);

  const save = async () => {
    setMessage(null);
    setSaveFailed(false);
    try {
      const input = buildActivityReorderInput(original, activities);
      if (!input) return;
      await reorder.mutateAsync(input);
      await Promise.all([utils.events.invalidate(), events.refetch()]);
      setOriginal(structuredClone(activities));
      setDirty(false);
      setMessage("Activity schedule saved.");
    } catch (error) {
      // Keep the edited schedule so a transient failure can be retried without redoing it.
      setDirty(true);
      setSaveFailed(true);
      setMessage(
        `${error instanceof Error ? error.message : "Activity reorder failed."} Your changes are still ready to retry.`,
      );
    }
  };

  if (events.isLoading) return <p aria-live="polite">Loading scheduled activities…</p>;
  if (events.error) {
    return (
      <div className="space-y-3" role="alert">
        <p>Unable to load scheduled activities: {events.error.message}</p>
        <Button onClick={() => void events.refetch()} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Schedule management</p>
        <h1 className="text-3xl font-semibold">Reorder training plan activities</h1>
        <p className="mt-2 text-muted-foreground">
          Move upcoming activities by day. All changed activities save together or not at all.
        </p>
      </div>
      {activities.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center">
          No upcoming training plan activities.
        </p>
      ) : (
        <div className="space-y-3">
          {[...activities]
            .sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date))
            .map((activity) => (
              <Card data-training-plan-id={activity.training_plan_id} key={activity.id}>
                <CardHeader>
                  <CardTitle>{activity.title || "Scheduled activity"}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <time dateTime={activity.scheduled_date}>{activity.scheduled_date}</time>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setActivities((items) => moveScheduledActivity(items, activity.id, -1));
                        setDirty(true);
                        setMessage(null);
                        setSaveFailed(false);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Previous day
                    </Button>
                    <Button
                      onClick={() => {
                        setActivities((items) => moveScheduledActivity(items, activity.id, 1));
                        setDirty(true);
                        setMessage(null);
                        setSaveFailed(false);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Next day
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
      {message ? (
        <p aria-live="polite" role={saveFailed ? "alert" : undefined}>
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={!dirty || reorder.isPending} onClick={() => void save()} type="button">
          {reorder.isPending ? "Saving…" : saveFailed ? "Retry save" : "Save order"}
        </Button>
        <Button
          disabled={!dirty || reorder.isPending}
          onClick={() => {
            setActivities(structuredClone(original));
            setDirty(false);
            setMessage(null);
            setSaveFailed(false);
          }}
          type="button"
          variant="outline"
        >
          Discard changes
        </Button>
      </div>
    </div>
  );
}
