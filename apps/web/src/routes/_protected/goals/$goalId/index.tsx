import { formatGoalTypeLabel, getGoalObjectiveSummary, parseProfileGoalRecord } from "@repo/core";
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
import { useMemo, useRef, useState } from "react";

import { GoalIntelligenceCard } from "../../../../components/planning/goal-intelligence-card";
import { GoalProgressChart } from "../../../../components/planning/goal-progress-chart";
import { RecordedGoalHistory } from "../../../../components/planning/recorded-goal-history";
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
  const goalRecord = useMemo(() => {
    try {
      return goal ? parseProfileGoalRecord(goal) : null;
    } catch {
      return null;
    }
  }, [goal]);
  const profileQuery = api.profiles.get.useQuery();
  const assessmentQuery = api.athleteIntelligence.getGoalAssessment.useQuery(
    { goalId },
    { enabled: Boolean(goal) },
  );
  const progressQuery = api.athleteIntelligence.getGoalProgress.useQuery(
    { goalId },
    { enabled: Boolean(goal) },
  );
  const historyQuery = api.athleteIntelligence.getThresholdOverview.useQuery(
    { historyLimit: 100 },
    { enabled: Boolean(progressQuery.data && progressQuery.data.result.status !== "unsupported") },
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
          <GoalTargetDetails goal={goal} />
        </CardContent>
      </Card>
      {goalRecord && goalRecord.objective.type !== "threshold" ? (
        <RecordedGoalHistory
          key={goalId}
          goal={goalRecord}
          timezone={profileQuery.data?.planning_timezone}
        />
      ) : (
        <GoalProgressChart
          planningTimezone={profileQuery.data?.planning_timezone ?? null}
          targetDate={goal.target_date}
          key={goalId}
          data={progressQuery.data}
          history={historyQuery.data?.history.items ?? []}
          isLoading={
            progressQuery.isLoading ||
            (Boolean(progressQuery.data && progressQuery.data.result.status !== "unsupported") &&
              historyQuery.isLoading)
          }
          isError={progressQuery.isError}
          historyError={historyQuery.isError}
          onRetry={() => {
            void progressQuery.refetch();
            void historyQuery.refetch();
          }}
        />
      )}
      <GoalIntelligenceCard
        {...(assessmentQuery.data !== undefined ? { assessment: assessmentQuery.data } : {})}
        isError={assessmentQuery.isError}
        isLoading={assessmentQuery.isLoading}
        onRetry={() => void assessmentQuery.refetch()}
      />
    </div>
  );
}

function GoalTargetDetails({ goal }: { goal: unknown }) {
  let record: ReturnType<typeof parseProfileGoalRecord>;
  try {
    record = parseProfileGoalRecord(goal);
  } catch {
    return <p className="text-sm text-muted-foreground">No target details are available.</p>;
  }
  return (
    <div className="border-l-4 border-primary pl-4">
      <p className="text-xs text-muted-foreground">{formatGoalTypeLabel(record)}</p>
      <p className="mt-1 text-2xl font-semibold">{getGoalObjectiveSummary(record)}</p>
    </div>
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
