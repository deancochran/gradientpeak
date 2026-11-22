import { Button } from "@repo/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { ErrorStateCard } from "@repo/ui/components/error-state-card";
import { InlineLoadingStatus } from "@repo/ui/components/loading";
import { SearchField } from "@repo/ui/components/search-field";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ActivityPlanCard } from "../../../components/activity-plan/activity-plan-card";
import { ActivityPlanComposer } from "../../../components/activity-plan/activity-plan-composer";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";
import { loadRouteQuery } from "../../../lib/api/route-loading";
import {
  activityPlanPreparationSearch,
  parseActivityPlanPreparationContext,
} from "../../../lib/coaching/activity-plan-preparation-context";

const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Running", value: "run" },
  { label: "Cycling", value: "bike" },
  { label: "Swimming", value: "swim" },
  { label: "Strength", value: "strength" },
  { label: "Other", value: "other" },
] as const;

type ActivityPlanCategory = Exclude<(typeof categoryOptions)[number]["value"], "all">;

export const Route = createFileRoute("/_protected/activity-plans/")({
  validateSearch: (search: Record<string, unknown>) => {
    const preparation = parseActivityPlanPreparationContext(search);
    return {
      ...(preparation ?? {}),
      activity_category: categoryOptions.some(
        (option) => option.value !== "all" && option.value === search.activity_category,
      )
        ? (search.activity_category as (typeof categoryOptions)[number]["value"])
        : undefined,
      q: typeof search.q === "string" && search.q ? search.q.slice(0, 100) : undefined,
    };
  },
  loaderDeps: ({ search }) => ({
    activity_category: search.activity_category === "all" ? undefined : search.activity_category,
    q: search.q,
  }),
  loader: ({ context, deps }) => {
    const input = getActivityPlansInput(deps);
    return loadRouteQuery(
      () => context.apiUtils.activityPlans.list.getInfiniteData(input),
      () =>
        context.apiUtils.activityPlans.list.fetchInfinite(input, {
          pages: context.apiUtils.activityPlans.list.getInfiniteData(input)?.pages.length || 1,
          getNextPageParam: (page) => page.nextCursor,
        }),
    );
  },
  component: ActivityPlansPage,
});

function getActivityPlansInput(search: {
  activity_category?: ActivityPlanCategory | undefined;
  q?: string | undefined;
}) {
  return {
    activityCategories: search.activity_category ? [search.activity_category] : undefined,
    limit: 20,
    ownerScope: "own" as const,
    search: search.q?.trim() || undefined,
  };
}

function ActivityPlansPage() {
  const navigate = Route.useNavigate();
  const routeSearch = Route.useSearch();
  const preparation = parseActivityPlanPreparationContext(routeSearch);
  const activity_category = routeSearch.activity_category ?? "all";
  const search = routeSearch.q ?? "";
  const utils = api.useUtils();
  const [creating, setCreating] = useState(false);
  const createdPlanId = useRef<string | null>(null);
  const creationOwner = useRef(0);
  useEffect(() => {
    const leave = () => {
      creationOwner.current += 1;
      createdPlanId.current = null;
      setCreating(false);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      creationOwner.current += 1;
      window.removeEventListener("pagehide", leave);
    };
  }, []);
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    getActivityPlansInput({
      ...(activity_category === "all" ? {} : { activity_category }),
      ...(search ? { q: search } : {}),
    }),
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const plans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const createMutation = api.activityPlans.create.useMutation({
    retry: false,
    onSuccess: async () => {
      await Promise.allSettled([Promise.resolve().then(() => utils.activityPlans.invalidate())]);
    },
  });

  if (creating) {
    const owner = creationOwner.current;
    return (
      <div className="container mx-auto max-w-6xl space-y-6 py-4">
        <ActivityPlanComposer
          mode="create"
          onCancel={() => {
            creationOwner.current += 1;
            createdPlanId.current = null;
            setCreating(false);
          }}
          onSave={async (values) => {
            const owner = creationOwner.current;
            const result = await createMutation.mutateAsync(values);
            if (creationOwner.current !== owner) return;
            createdPlanId.current = result.id;
            toast.success("Activity plan created");
          }}
          onSaved={async () => {
            if (creationOwner.current !== owner || !createdPlanId.current) return;
            const activityPlanId = createdPlanId.current;
            if (preparation) {
              await navigate({
                to: "/organizations/$organizationId/athletes/$athleteId",
                params: {
                  athleteId: preparation.athleteId,
                  organizationId: preparation.organizationId,
                },
                search: activityPlanPreparationSearch(preparation, activityPlanId),
              } as never);
              return;
            }
            await navigate({
              to: "/activity-plans/$activityPlanId",
              params: { activityPlanId },
            } as never);
            if (creationOwner.current !== owner) return;
          }}
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
            onClick={() => {
              creationOwner.current += 1;
              createdPlanId.current = null;
              setCreating(true);
            }}
            type="button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create activity plan
          </Button>
        }
        description="Reusable activities for scheduling or recording."
        title="Activity plans"
      />
      {preparation ? (
        <Card className="border-cyan-700/50 bg-cyan-950/20">
          <CardHeader>
            <CardTitle>Preparing for an athlete</CardTitle>
            <CardDescription>
              This is your coach-owned draft. Saving returns you to {preparation.planningDate} so
              you can preview publication before publishing a separate athlete copy.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section aria-label="Find a plan" className="space-y-3">
        <SearchField
          accessibilityLabel="Search activity plans"
          loading={plansQuery.isFetching}
          loadingLabel="Searching activity plans"
          maxLength={100}
          name="activityPlanSearch"
          onValueChange={(q) =>
            void navigate({
              search: (previous) => ({ ...previous, q: q || undefined }),
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
              aria-pressed={activity_category === option.value}
              key={option.value}
              onClick={() =>
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    activity_category: option.value === "all" ? undefined : option.value,
                  }),
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
      </section>

      {plansQuery.isLoading ? (
        <InlineLoadingStatus label="Loading activity plans" />
      ) : plansQuery.isError ? (
        <ErrorStateCard
          compact
          title="Unable to load activity plans"
          message={plansQuery.error.message || "Try again to load your activity plans."}
          onRetry={() => void plansQuery.refetch()}
          retryLabel="Retry"
        />
      ) : (
        <section aria-label="Activity plan results" className="space-y-4">
          <p className="text-sm text-muted-foreground" role="status">
            {plans.length}
            {plansQuery.hasNextPage ? "+" : ""} activity plans loaded
          </p>
          {plans.length === 0 ? (
            <EmptyStateCard
              compact
              icon={ClipboardList}
              title="No activity plans found"
              description={
                search.trim() || activity_category !== "all"
                  ? "Try a different search or activity category."
                  : "Your reusable activities will appear here."
              }
            />
          ) : (
            plans.map((plan) => (
              <ActivityPlanCard
                key={plan.id}
                onOpen={() =>
                  void navigate({
                    to: "/activity-plans/$activityPlanId",
                    params: { activityPlanId: plan.id },
                    ...(preparation ? { search: activityPlanPreparationSearch(preparation) } : {}),
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
        </section>
      )}
    </div>
  );
}
