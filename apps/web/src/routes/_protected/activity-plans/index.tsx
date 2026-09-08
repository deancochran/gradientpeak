import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { SearchField } from "@repo/ui/components/search-field";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ActivityPlanCard } from "../../../components/activity-plan/activity-plan-card";
import { ActivityPlanComposer } from "../../../components/activity-plan/activity-plan-composer";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";

const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Running", value: "run" },
  { label: "Cycling", value: "bike" },
  { label: "Swimming", value: "swim" },
  { label: "Strength", value: "strength" },
  { label: "Other", value: "other" },
] as const;

export const Route = createFileRoute("/_protected/activity-plans/")({
  validateSearch: (search: Record<string, unknown>) => ({
    activity_category: categoryOptions.some(
      (option) => option.value !== "all" && option.value === search.activity_category,
    )
      ? (search.activity_category as (typeof categoryOptions)[number]["value"])
      : undefined,
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 100) : undefined,
  }),
  component: ActivityPlansPage,
});

function ActivityPlansPage() {
  const navigate = Route.useNavigate();
  const routeSearch = Route.useSearch();
  const activity_category = routeSearch.activity_category ?? "all";
  const search = routeSearch.q ?? "";
  const utils = api.useUtils();
  const [creating, setCreating] = useState(false);
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    {
      activityCategories: activity_category === "all" ? undefined : [activity_category],
      limit: 20,
      ownerScope: "own",
      search: search.trim() || undefined,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const plans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const createMutation = api.activityPlans.create.useMutation({
    onSuccess: async (plan) => {
      await utils.activityPlans.invalidate();
      toast.success("Activity plan created");
      void navigate({
        to: "/activity-plans/$activityPlanId",
        params: { activityPlanId: plan.id },
      } as never);
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be created"),
  });

  if (creating) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 py-4">
        <ActivityPlanComposer
          mode="create"
          onCancel={() => setCreating(false)}
          onSave={(values) => createMutation.mutateAsync(values).then(() => undefined)}
          pending={createMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button
            data-testid="activity-plan-create"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create activity plan
          </Button>
        }
        description="Search and review your reusable structured activities before scheduling or recording them."
        eyebrow="Training library"
        title="Activity plans"
      />

      <Card>
        <CardHeader>
          <CardTitle>Find a plan</CardTitle>
          <CardDescription>Filter your own plans by name and primary activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchField
            accessibilityLabel="Search activity plans"
            loading={plansQuery.isFetching}
            loadingLabel="Searching activity plans"
            maxLength={100}
            name="activityPlanSearch"
            onValueChange={(q) =>
              void navigate({
                search: {
                  activity_category: activity_category === "all" ? undefined : activity_category,
                  q: q || undefined,
                },
                replace: true,
              })
            }
            placeholder="Search activity plans"
            testId="activity-plan-search"
            value={search}
          />
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Activity category</legend>
            {categoryOptions.map((option) => (
              <Button
                key={option.value}
                onClick={() =>
                  void navigate({
                    search: {
                      activity_category: option.value === "all" ? undefined : option.value,
                      q: search || undefined,
                    },
                    replace: true,
                  })
                }
                size="sm"
                type="button"
                variant={activity_category === option.value ? "default" : "outline"}
              >
                {option.label}
              </Button>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      {plansQuery.isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border">
          <Loader2 aria-label="Loading activity plans" className="h-8 w-8 animate-spin" />
        </div>
      ) : plansQuery.isError ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Unable to load activity plans</CardTitle>
            <CardDescription>{plansQuery.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void plansQuery.refetch()} type="button" variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {plans.length}
              {plansQuery.hasNextPage ? "+" : ""} activity plans loaded
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {plans.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">No activity plans found</p>
                  <p className="text-sm text-muted-foreground">
                    {search.trim() || activity_category !== "all"
                      ? "Try a different search or activity category."
                      : "Your reusable activities will appear here."}
                  </p>
                </div>
              </div>
            ) : (
              plans.map((plan) => (
                <ActivityPlanCard
                  key={plan.id}
                  onOpen={() =>
                    void navigate({
                      to: "/activity-plans/$activityPlanId",
                      params: { activityPlanId: plan.id },
                    } as never)
                  }
                  plan={plan}
                />
              ))
            )}
            {plansQuery.hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  disabled={plansQuery.isFetchingNextPage}
                  onClick={() => void plansQuery.fetchNextPage()}
                  type="button"
                  variant="outline"
                >
                  {plansQuery.isFetchingNextPage ? "Loading more..." : "Load more activity plans"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
