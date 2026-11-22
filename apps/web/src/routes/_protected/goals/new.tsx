import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";

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
  if (profileQuery.isLoading) return <p>Loading profile...</p>;
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="space-y-3" role="alert">
        <p>Profile could not be loaded.</p>
        <Button type="button" variant="outline" onClick={() => void profileQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Link
        className="text-sm text-primary hover:underline"
        to="/goals"
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
      <Card>
        <CardHeader>
          <CardTitle>Create goal</CardTitle>
          <CardDescription>Create a persisted goal to guide your planning.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlanGoalForm
            {...(search.date !== undefined ? { initialDate: search.date } : {})}
            profileId={profileQuery.data.id}
            redirectTo="/goals"
          />
        </CardContent>
      </Card>
    </div>
  );
}
