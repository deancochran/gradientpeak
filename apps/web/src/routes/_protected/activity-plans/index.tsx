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

import { ActivityPlanCategoryBadges } from "../../../components/activity-plan/activity-plan-category-badges";
import { ActivityPlanComposer } from "../../../components/activity-plan/activity-plan-composer";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import { getActivityPlanMetricSummary } from "../../../lib/activity-plan-presentation";
import { api } from "../../../lib/api/client";

const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Running", value: "run" },
  { label: "Cycling", value: "bike" },
  { label: "Swimming", value: "swim" },
  { label: "Strength", value: "strength" },
  { label: "Other", value: "other" },
] as const;

const compositionOptions = [
  { label: "Include multisport", value: "include_multisport" },
  { label: "Single-sport only", value: "single_only" },
  { label: "Multisport only", value: "multisport_only" },
] as const;

export const Route = createFileRoute("/_protected/activity-plans/")({
  component: ActivityPlansPage,
});

function ActivityPlansPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof categoryOptions)[number]["value"]>("all");
  const [composition, setComposition] =
    useState<(typeof compositionOptions)[number]["value"]>("include_multisport");
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    {
      activityCategories: category === "all" ? undefined : [category],
      compositionMode: composition,
      includeEstimation: true,
      includeOwnOnly: true,
      includeSystemTemplates: false,
      limit: 20,
      ownerScope: "own",
      search: search.trim() || undefined,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const plans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const routesQuery = api.routes.list.useQuery({ limit: 100, ownerScope: "all" });
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
          routeOptions={routesQuery.data?.items ?? []}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button onClick={() => setCreating(true)} type="button">
            <Plus className="mr-2 h-4 w-4" />
            Create activity plan
          </Button>
        }
        description="Search and review your reusable structured workouts before scheduling or recording them."
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
            onValueChange={setSearch}
            placeholder="Search activity plans"
            testId="activity-plan-search"
            value={search}
          />
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Activity category</legend>
            {categoryOptions.map((option) => (
              <Button
                key={option.value}
                onClick={() => setCategory(option.value)}
                size="sm"
                type="button"
                variant={category === option.value ? "default" : "outline"}
              >
                {option.label}
              </Button>
            ))}
          </fieldset>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Activity composition</legend>
            {compositionOptions.map((option) => (
              <Button
                key={option.value}
                onClick={() => setComposition(option.value)}
                size="sm"
                type="button"
                variant={composition === option.value ? "default" : "outline"}
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
                    {search.trim() || category !== "all" || composition !== "include_multisport"
                      ? "Try a different search, category, or composition."
                      : "Your reusable workouts will appear here."}
                  </p>
                </div>
              </div>
            ) : (
              plans.map((plan) => {
                const metrics = getActivityPlanMetricSummary(plan.authoritative_metrics);
                return (
                  <button
                    className="w-full rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={plan.id}
                    onClick={() =>
                      void navigate({
                        to: "/activity-plans/$activityPlanId",
                        params: { activityPlanId: plan.id },
                      } as never)
                    }
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold">{plan.name}</h2>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {plan.description || "No description provided."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActivityPlanCategoryBadges categories={plan.categories} />
                      </div>
                    </div>
                    {metrics.length ? (
                      <p className="mt-4 text-sm text-muted-foreground">{metrics.join(" · ")}</p>
                    ) : null}
                  </button>
                );
              })
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
