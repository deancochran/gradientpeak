import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { skipToken } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { api } from "../../lib/api/client";
import { GoalProgressChart } from "./goal-progress-chart";
import { formatGoalTimeLeft, goalPlanningDate } from "./goal-progress-presentation";

type UpcomingGoal = {
  id: string;
  target_date: string;
  title: string;
};

export function GoalProgressWorkspace({
  goal,
  planningTimezone,
}: {
  goal: UpcomingGoal;
  planningTimezone: string | null;
}) {
  const progressQuery = api.athleteIntelligence.getGoalProgress.useQuery({ goalId: goal.id });
  const supportsThresholdProgress =
    progressQuery.data !== undefined && progressQuery.data.result.status !== "unsupported";
  const historyQuery = api.athleteIntelligence.getThresholdOverview.useQuery(
    supportsThresholdProgress ? { historyLimit: 100 } : skipToken,
  );
  const timeLeft = formatGoalTimeLeft(
    goal.target_date,
    goalPlanningDate(new Date(), planningTimezone),
  );

  if (progressQuery.data?.result.status === "unsupported") {
    return (
      <Card data-testid="goal-progress-unsupported">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Goal progress
            </p>
            <p className="font-medium">Observed numerical progress is unavailable for this goal.</p>
            <p className="text-sm text-muted-foreground">
              Target date: {goal.target_date} · {timeLeft}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link
              params={{ goalId: goal.id }}
              search={{ flash: undefined, flashType: undefined }}
              to="/goals/$goalId"
            >
              View goal
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby={`goal-progress-${goal.id}`} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Goal progress
          </p>
          <h2
            className="flex items-center gap-2 text-lg font-semibold"
            id={`goal-progress-${goal.id}`}
          >
            <Activity aria-hidden="true" className="size-4 text-primary" />
            <Link
              className="underline-offset-4 hover:underline"
              params={{ goalId: goal.id }}
              search={{ flash: undefined, flashType: undefined }}
              to="/goals/$goalId"
            >
              {goal.title}
            </Link>
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Target date: {goal.target_date} · {timeLeft}
        </p>
      </div>
      <GoalProgressChart
        data={progressQuery.data}
        history={historyQuery.data?.history.items ?? []}
        historyError={historyQuery.isError}
        isError={progressQuery.isError}
        isLoading={progressQuery.isLoading || (supportsThresholdProgress && historyQuery.isLoading)}
        onRetry={() => {
          void progressQuery.refetch();
          void historyQuery.refetch();
        }}
        planningTimezone={planningTimezone}
        targetDate={goal.target_date}
      />
    </section>
  );
}
