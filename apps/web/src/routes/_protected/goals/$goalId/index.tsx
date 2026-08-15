import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";

import { GoalIntelligenceCard } from "../../../../components/planning/goal-intelligence-card";
import { RouteFlashToast, type RouteFlashType } from "../../../../components/route-flash-toast";
import { api } from "../../../../lib/api/client";
import { formatDayLabel } from "../../../../lib/planning";
import { deletePlanGoalAction } from "../../../../lib/planning/server-actions";

export const Route = createFileRoute("/_protected/goals/$goalId/")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType: search.flashType as RouteFlashType | undefined,
  }),
  component: GoalDetailPage,
});

function GoalDetailPage() {
  const { goalId } = Route.useParams();
  const search = Route.useSearch() as { flash?: string; flashType?: RouteFlashType };
  const goalQuery = api.goals.getById.useQuery(
    { id: goalId },
    { enabled: Boolean(goalId), retry: false },
  );
  const goal = goalQuery.data;
  const assessmentQuery = api.athleteIntelligence.getGoalAssessment.useQuery(
    { goalId },
    { enabled: Boolean(goal) },
  );
  if (goalQuery.isLoading) return <p>Loading goal...</p>;
  if (goalQuery.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>Goal could not be loaded.</p>
        <Button onClick={() => void goalQuery.refetch()}>Retry</Button>
      </div>
    );
  if (!goal) return <p>Goal not found.</p>;
  return (
    <div className="space-y-6">
      <RouteFlashToast
        {...(search.flash !== undefined ? { message: search.flash } : {})}
        {...(search.flashType !== undefined ? { type: search.flashType } : {})}
        clear={() => window.history.replaceState(null, "", `/goals/${goalId}`)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/goals"
            className="text-sm text-primary"
            search={{
              category: undefined,
              flash: undefined,
              flashType: undefined,
              q: "",
              sort: "target_date",
            }}
          >
            Back to goals
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">{goal.title}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link
              data-testid={`goal-edit-${goal.id}`}
              to="/goals/$goalId/edit"
              params={{ goalId: goal.id }}
              search={{ flash: undefined, flashType: undefined }}
            >
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button data-testid={`goal-delete-${goal.id}`} variant="destructive">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes the goal.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <GoalDeleteForm goalId={goal.id} />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Goal details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Badge>{goal.activity_category}</Badge>
            <Badge variant="outline">Priority {goal.priority}/10</Badge>
          </div>
          <p>Target: {formatDayLabel(goal.target_date)}</p>
          <GoalTargetDetails target={goal.target_payload} />
        </CardContent>
      </Card>
      <GoalIntelligenceCard
        {...(assessmentQuery.data !== undefined ? { assessment: assessmentQuery.data } : {})}
        isError={assessmentQuery.isError}
        isLoading={assessmentQuery.isLoading}
        onRetry={() => void assessmentQuery.refetch()}
      />
    </div>
  );
}

function GoalTargetDetails({ target }: { target: unknown }) {
  if (!target || typeof target !== "object") {
    return <p className="text-sm text-muted-foreground">No target details are available.</p>;
  }
  const payload = target as {
    target_sessions_per_week?: unknown;
    target_weeks?: unknown;
    type?: unknown;
  };
  if (payload.type === "consistency") {
    return (
      <p className="text-sm">
        Consistency target: {String(payload.target_sessions_per_week ?? "unspecified")} sessions per
        week for {String(payload.target_weeks ?? "unspecified")} weeks.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Target type: {String(payload.type ?? "unknown")}.
    </p>
  );
}

function GoalDeleteForm({ goalId }: { goalId: string }) {
  const deletePlanGoal = useServerFn(deletePlanGoalAction);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await deletePlanGoal({ data: new FormData(event.currentTarget) as never });
      if (result.status === "error") {
        setSubmitError(result.message);
        return;
      }
      // This is a full-page navigation, so the destination creates a fresh query cache. Waiting
      // for detail-query invalidation here would refetch the just-deleted goal and delay redirect.
      window.location.assign(result.redirectTo);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to delete goal. Try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="goal_id" value={goalId} />
      <input type="hidden" name="redirectTo" value="/goals" />
      {submitError ? (
        <p role="alert" aria-live="polite" className="mb-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
      <Button
        data-testid={`goal-delete-${goalId}-confirm`}
        type="submit"
        variant="destructive"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Deleting..." : "Delete goal"}
      </Button>
    </form>
  );
}
