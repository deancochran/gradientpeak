import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFlashToast, type RouteFlashType } from "../../../components/route-flash-toast";
import { api } from "../../../lib/api/client";
import { formatShortDayLabel } from "../../../lib/planning";

export const Route = createFileRoute("/_protected/goals/")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search.category === "string" ? search.category : undefined,
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType: search.flashType as RouteFlashType | undefined,
    q: typeof search.q === "string" ? search.q : "",
    sort: search.sort === "priority" || search.sort === "created_at" ? search.sort : "target_date",
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const search = Route.useSearch() as {
    category?: string;
    flash?: string;
    flashType?: RouteFlashType;
    q: string;
    sort: "created_at" | "priority" | "target_date";
  };
  const profileQuery = api.profiles.get.useQuery();
  const goalsQuery = api.goals.list.useQuery(
    {
      profile_id: profileQuery.data?.id ?? "00000000-0000-0000-0000-000000000000",
      ...(search.q.trim() ? { search: search.q.trim() } : {}),
      ...(search.category ? { activity_category: search.category as "run" } : {}),
      sort_by: search.sort,
      sort_order: search.sort === "priority" ? "desc" : "asc",
      limit: 50,
    },
    { enabled: Boolean(profileQuery.data?.id) },
  );

  return (
    <div className="space-y-6">
      <RouteFlashToast
        {...(search.flash !== undefined ? { message: search.flash } : {})}
        {...(search.flashType !== undefined ? { type: search.flashType } : {})}
        clear={() => window.history.replaceState(null, "", "/goals")}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Goals</h1>
          <p className="mt-1 text-muted-foreground">
            Search, manage, and inspect goal intelligence.
          </p>
        </div>
        <Button asChild>
          <a href="/goals/new">Create goal</a>
        </Button>
      </div>
      <form method="get" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
        <Input
          aria-label="Search goals"
          name="q"
          defaultValue={search.q}
          placeholder="Search goals"
        />
        <select
          aria-label="Activity category"
          name="category"
          defaultValue={search.category ?? ""}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All activities</option>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
          <option value="strength">Strength</option>
          <option value="other">Other</option>
        </select>
        <select
          aria-label="Sort goals"
          name="sort"
          defaultValue={search.sort}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="target_date">Target date</option>
          <option value="priority">Priority</option>
          <option value="created_at">Created</option>
        </select>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>
      {goalsQuery.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/40 p-4">
          <p>Goals could not be loaded.</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void goalsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{goalsQuery.data?.total ?? 0} goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {goalsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading goals...</p>
          ) : null}
          {(goalsQuery.data?.items ?? []).map((goal) => (
            <a
              key={goal.id}
              href={`/goals/${goal.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border p-4 hover:bg-accent"
            >
              <div>
                <p className="font-medium">{goal.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatShortDayLabel(goal.target_date)}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge>{goal.activity_category}</Badge>
                <Badge variant="outline">{goal.priority}/10</Badge>
              </div>
            </a>
          ))}
          {!goalsQuery.isLoading && !goalsQuery.isError && goalsQuery.data?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals match these filters.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
