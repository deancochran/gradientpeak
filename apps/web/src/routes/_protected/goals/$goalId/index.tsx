import {
  AlertDialog,
  AlertDialogAction,
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
import { createFileRoute } from "@tanstack/react-router";

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
  const goalQuery = api.goals.getById.useQuery({ id: goalId }, { enabled: Boolean(goalId) });
  const intelligenceQuery = api.athleteIntelligence.evaluate.useQuery(
    { goalId },
    { enabled: Boolean(goalId) },
  );
  const goal = goalQuery.data;
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
          <a href="/goals" className="text-sm text-primary">
            Back to goals
          </a>
          <h1 className="mt-2 text-3xl font-semibold">{goal.title}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <a href={`/goals/${goal.id}/edit`}>Edit</a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes the goal.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <form action={deletePlanGoalAction.url} method="post">
                  <input type="hidden" name="goal_id" value={goal.id} />
                  <input type="hidden" name="redirectTo" value="/goals" />
                  <AlertDialogAction type="submit">Delete goal</AlertDialogAction>
                </form>
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
          <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
            {JSON.stringify(goal.target_payload, null, 2)}
          </pre>
        </CardContent>
      </Card>
      <GoalIntelligenceCard
        {...(intelligenceQuery.data !== undefined ? { intelligence: intelligenceQuery.data } : {})}
        isError={intelligenceQuery.isError}
        isLoading={intelligenceQuery.isLoading}
        onRetry={() => void intelligenceQuery.refetch()}
      />
    </div>
  );
}
