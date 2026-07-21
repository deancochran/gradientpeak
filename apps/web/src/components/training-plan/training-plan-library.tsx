import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useState } from "react";

import { api } from "../../lib/api/client";
import { summarizeTrainingPlan } from "./training-plan-model";

type TrainingPlanLibraryProps = {
  onCreate: () => void;
  onOpen: (id: string) => void;
};

function QueryState({
  error,
  loading,
  onRetry,
}: {
  error: { message: string } | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading) return <p aria-live="polite">Loading training plans…</p>;
  if (!error) return null;
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-4" role="alert">
      <p>Unable to load training plans: {error.message}</p>
      <Button onClick={onRetry} type="button" variant="outline">
        Retry
      </Button>
    </div>
  );
}

type LibraryPlan = {
  content_visibility?: string | null;
  description?: string | null;
  duration_hours?: number | null;
  id: string;
  is_system_template?: boolean | null;
  name: string;
  sessions_per_week_target?: number | null;
  structure?: unknown;
};

function PlanGrid({ plans, onOpen }: { plans: LibraryPlan[]; onOpen: (id: string) => void }) {
  if (plans.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center">No training plans found.</p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => {
        const summary = summarizeTrainingPlan(plan.structure);
        return (
          <Card key={plan.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle>{plan.name}</CardTitle>
                <Badge variant="outline">
                  {plan.is_system_template ? "Template" : (plan.content_visibility ?? "private")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {plan.description || "No description"}
              </p>
              <p className="text-sm">
                {plan.structure
                  ? `${summary.sessionCount} workouts · ${summary.weekCount} weeks`
                  : `${plan.sessions_per_week_target ?? "Flexible"} sessions/week · ${plan.duration_hours ?? "Flexible"} hours`}
              </p>
              <Button onClick={() => onOpen(plan.id)} type="button" variant="outline">
                View plan
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function TrainingPlanLibrary({ onCreate, onOpen }: TrainingPlanLibraryProps) {
  const [search, setSearch] = useState("");
  const owned = api.trainingPlans.list.useInfiniteQuery(
    {
      ownerScope: "own",
      includeOwnOnly: true,
      includeSystemTemplates: false,
      search: search.trim() || undefined,
      limit: 25,
    },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const templates = api.trainingPlans.listTemplates.useInfiniteQuery(
    { search: search.trim() || undefined, limit: 25 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const ownedPlans = owned.data?.pages.flatMap((page) => page.items) ?? [];
  const templatePlans = templates.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Plan library</p>
          <h1 className="text-3xl font-semibold tracking-tight">Training plans</h1>
        </div>
        <Button onClick={onCreate} type="button">
          Create training plan
        </Button>
      </div>
      <label className="block max-w-xl space-y-2" htmlFor="training-plan-search">
        <span className="text-sm font-medium">Search plans</span>
        <Input
          id="training-plan-search"
          onChange={(event) => setSearch(event.target.value)}
          value={search}
        />
      </label>
      <Tabs defaultValue="owned">
        <TabsList aria-label="Training plan libraries">
          <TabsTrigger value="owned">My plans</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-4" value="owned">
          <QueryState
            error={owned.error}
            loading={owned.isLoading}
            onRetry={() => void owned.refetch()}
          />
          {!owned.isLoading && !owned.error ? (
            <PlanGrid onOpen={onOpen} plans={ownedPlans} />
          ) : null}
          {owned.hasNextPage ? (
            <Button
              disabled={owned.isFetchingNextPage}
              onClick={() => void owned.fetchNextPage()}
              type="button"
              variant="outline"
            >
              {owned.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </TabsContent>
        <TabsContent className="space-y-4" value="templates">
          <QueryState
            error={templates.error}
            loading={templates.isLoading}
            onRetry={() => void templates.refetch()}
          />
          {!templates.isLoading && !templates.error ? (
            <PlanGrid onOpen={onOpen} plans={templatePlans} />
          ) : null}
          {templates.hasNextPage ? (
            <Button
              disabled={templates.isFetchingNextPage}
              onClick={() => void templates.fetchNextPage()}
              type="button"
              variant="outline"
            >
              {templates.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
