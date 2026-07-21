import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

import { PlanGoalForm } from "../../../../components/protected/plan-goal-form";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/goals/$goalId/edit")({
  component: GoalEditPage,
});
function GoalEditPage() {
  const { goalId } = Route.useParams();
  const goalQuery = api.goals.getById.useQuery({ id: goalId }, { enabled: Boolean(goalId) });
  if (goalQuery.isLoading) return <p>Loading goal...</p>;
  if (goalQuery.isError || !goalQuery.data)
    return (
      <div role="alert">
        <p>Goal could not be loaded.</p>
        <button type="button" onClick={() => void goalQuery.refetch()}>
          Retry
        </button>
      </div>
    );
  return (
    <div className="space-y-4">
      <a className="text-sm text-primary" href={`/goals/${goalId}`}>
        Back to goal
      </a>
      <Card>
        <CardHeader>
          <CardTitle>Edit goal</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanGoalForm goal={goalQuery.data} redirectTo={`/goals/${goalId}`} />
        </CardContent>
      </Card>
    </div>
  );
}
