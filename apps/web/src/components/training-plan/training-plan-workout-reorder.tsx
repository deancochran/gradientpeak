import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api/client";
import { buildWorkoutReorderInput, moveScheduledWorkout } from "./training-plan-model";

type ReorderWorkout = {
  activity_plan_id: string;
  id: string;
  scheduled_date: string;
  title?: string | null;
  training_plan_id: string;
};

export function TrainingPlanWorkoutReorder() {
  const utils = api.useUtils();
  const events = api.events.list.useQuery({ limit: 100 });
  const reorder = api.trainingPlans.reorderWorkouts.useMutation();
  const source = useMemo(
    () =>
      (events.data?.items ?? []).filter(
        (event): event is typeof event & ReorderWorkout =>
          typeof event.activity_plan_id === "string" &&
          typeof event.scheduled_date === "string" &&
          typeof event.training_plan_id === "string" &&
          !("completed_activity_id" in event && event.completed_activity_id),
      ),
    [events.data?.items],
  );
  const [workouts, setWorkouts] = useState<ReorderWorkout[]>([]);
  const [original, setOriginal] = useState<ReorderWorkout[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (dirty) return;
    const snapshot = source.map((workout) => ({
      activity_plan_id: workout.activity_plan_id,
      id: workout.id,
      scheduled_date: workout.scheduled_date,
      title: workout.title,
      training_plan_id: workout.training_plan_id,
    }));
    setWorkouts(snapshot);
    setOriginal(structuredClone(snapshot));
  }, [dirty, source]);

  const save = async () => {
    setMessage(null);
    try {
      const input = buildWorkoutReorderInput(original, workouts);
      if (!input) return;
      await reorder.mutateAsync(input);
      await Promise.all([utils.events.invalidate(), events.refetch()]);
      setOriginal(structuredClone(workouts));
      setDirty(false);
      setMessage("Workout schedule saved.");
    } catch (error) {
      setWorkouts(structuredClone(original));
      setDirty(false);
      await utils.events.invalidate();
      setMessage(
        `${error instanceof Error ? error.message : "Workout reorder failed."} The schedule was not changed.`,
      );
    }
  };

  if (events.isLoading) return <p aria-live="polite">Loading scheduled workouts…</p>;
  if (events.error) {
    return (
      <div className="space-y-3" role="alert">
        <p>Unable to load scheduled workouts: {events.error.message}</p>
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
        <h1 className="text-3xl font-semibold">Reorder training plan workouts</h1>
        <p className="mt-2 text-muted-foreground">
          Move upcoming workouts by day. All changed workouts save together or not at all.
        </p>
      </div>
      {workouts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center">
          No upcoming training plan workouts.
        </p>
      ) : (
        <div className="space-y-3">
          {[...workouts]
            .sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date))
            .map((workout) => (
              <Card key={workout.id}>
                <CardHeader>
                  <CardTitle>{workout.title || "Scheduled workout"}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <time dateTime={workout.scheduled_date}>{workout.scheduled_date}</time>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setWorkouts((items) => moveScheduledWorkout(items, workout.id, -1));
                        setDirty(true);
                        setMessage(null);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Previous day
                    </Button>
                    <Button
                      onClick={() => {
                        setWorkouts((items) => moveScheduledWorkout(items, workout.id, 1));
                        setDirty(true);
                        setMessage(null);
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
        <p aria-live="polite" role={reorder.isError ? "alert" : undefined}>
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={!dirty || reorder.isPending} onClick={() => void save()} type="button">
          {reorder.isPending ? "Saving…" : reorder.isError ? "Retry save" : "Save order"}
        </Button>
        <Button
          disabled={!dirty || reorder.isPending}
          onClick={() => {
            setWorkouts(structuredClone(original));
            setDirty(false);
            setMessage(null);
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
