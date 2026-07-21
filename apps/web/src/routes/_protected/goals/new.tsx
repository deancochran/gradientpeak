import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

import { PlanGoalForm } from "../../../components/protected/plan-goal-form";
import { api } from "../../../lib/api/client";
import { isValidDateKey } from "../../../lib/planning";

export const Route = createFileRoute("/_protected/goals/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    date: typeof search.date === "string" && isValidDateKey(search.date) ? search.date : undefined,
  }),
  component: NewGoalPage,
});

function NewGoalPage() {
  const search = Route.useSearch() as { date?: string };
  const profileQuery = api.profiles.get.useQuery();
  return (
    <div className="space-y-4">
      <a className="text-sm text-primary hover:underline" href="/goals">
        Back to goals
      </a>
      <Card>
        <CardHeader>
          <CardTitle>Create goal</CardTitle>
          <CardDescription>Create a persisted consistency target for planning.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlanGoalForm
            {...(search.date !== undefined ? { initialDate: search.date } : {})}
            {...(profileQuery.data?.id !== undefined ? { profileId: profileQuery.data.id } : {})}
            redirectTo="/goals"
          />
        </CardContent>
      </Card>
    </div>
  );
}
