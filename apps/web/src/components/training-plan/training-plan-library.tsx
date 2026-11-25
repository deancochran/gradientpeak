import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceMetricsRow,
} from "@repo/ui/components/resource-presentation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useRef, useState } from "react";

import { api } from "../../lib/api/client";
import {
  getOwnedTrainingPlansInput,
  getTemplateTrainingPlansInput,
} from "./training-plan-library-inputs";
import { summarizeTrainingPlan } from "./training-plan-model";
import { TrainingPlanPlannedPreview } from "./training-plan-planned-preview";

type TrainingPlanLibraryProps = {
  onCreate: () => void;
  onOpen: (id: string) => void;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  tab?: "owned" | "templates";
  onTabChange?: (tab: "owned" | "templates") => void;
};

function QueryState({
  error,
  loading,
  onRetry,
}: {
  error: { message: string } | null;
  loading: boolean;
  onRetry: () => Promise<unknown>;
}) {
  const retryGuard = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (retryGuard.current) return;
    retryGuard.current = true;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      /* Query error remains visible for an explicit retry. */
    } finally {
      retryGuard.current = false;
      setRetrying(false);
    }
  };
  if (loading) return <p aria-live="polite">Loading training plans…</p>;
  if (!error) return null;
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-4" role="alert">
      <p>Unable to load training plans: {error.message}</p>
      <Button disabled={retrying} onClick={() => void retry()} type="button" variant="outline">
        {retrying ? "Retrying…" : "Retry"}
      </Button>
      {retrying ? <p role="status">Retrying training plans…</p> : null}
    </div>
  );
}

type RouterOutputs = inferRouterOutputs<AppRouter>;
type OwnedLibraryPlan = RouterOutputs["trainingPlans"]["list"]["items"][number];
type TemplateLibraryPlan = RouterOutputs["trainingPlans"]["listTemplates"]["items"][number];
type LibraryPlan = OwnedLibraryPlan | TemplateLibraryPlan;

function templateStructure(plan: TemplateLibraryPlan) {
  const {
    id: _id,
    name: _name,
    description: _description,
    sessions_per_week_target: _sessionsPerWeekTarget,
    duration_hours: _durationHours,
    likes_count: _likesCount,
    has_liked: _hasLiked,
    created_at: _createdAt,
    updated_at: _updatedAt,
    plannedSchedulePreview: _plannedSchedulePreview,
    ...structure
  } = plan;
  return structure;
}

function PlanGrid({
  kind,
  plans,
  onOpen,
}: {
  kind: "owned" | "templates";
  plans: readonly LibraryPlan[];
  onOpen: (id: string) => void;
}) {
  if (plans.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center">No training plans found.</p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => {
        const isTemplate = kind === "templates";
        const structure = isTemplate
          ? templateStructure(plan as TemplateLibraryPlan)
          : "structure" in plan
            ? plan.structure
            : null;
        const summary = summarizeTrainingPlan(structure);
        const plannedSchedulePreview =
          "plannedSchedulePreview" in plan ? plan.plannedSchedulePreview : undefined;
        const visibility =
          !isTemplate && "content_visibility" in plan ? plan.content_visibility : null;
        const description = typeof plan.description === "string" ? plan.description : null;
        return (
          <ResourceCardShell
            accessibilityLabel={`Open training plan ${plan.name}`}
            cardClassName="transition-colors hover:border-primary/40"
            contentClassName="space-y-4 p-5"
            key={plan.id}
            onPress={() => onOpen(plan.id)}
            testID={`training-plan-card-${plan.id}`}
          >
            <ResourceCardHeader
              accessory={
                <Badge variant="outline">
                  {isTemplate ? "Template" : (visibility ?? "Visibility unavailable")}
                </Badge>
              }
              description={description}
              descriptionFallback="No description"
              title={plan.name}
              titleClassName="text-lg"
            />
            <ResourceMetricsRow
              metrics={[
                {
                  label: structure ? "Schedule" : "Availability",
                  value: structure
                    ? `${summary.sessionCount} activities · ${summary.weekCount} weeks`
                    : "Schedule unavailable",
                },
              ]}
            />
            <TrainingPlanPlannedPreview
              compact
              planId={plan.id}
              {...(plannedSchedulePreview !== undefined ? { preview: plannedSchedulePreview } : {})}
              structure={structure}
            />
          </ResourceCardShell>
        );
      })}
    </div>
  );
}

export function TrainingPlanLibrary({
  onCreate,
  onOpen,
  onSearchChange,
  searchValue,
  tab,
  onTabChange,
}: TrainingPlanLibraryProps) {
  const [localSearch, setLocalSearch] = useState("");
  const search = searchValue ?? localSearch;
  const pageFlights = useRef(new Set<string>());
  const [pageState, setPageState] = useState<{
    key: string;
    pending: boolean;
    error: string | null;
  } | null>(null);
  const owned = api.trainingPlans.list.useInfiniteQuery(getOwnedTrainingPlansInput(search), {
    enabled: tab === "owned",
    getNextPageParam: (page) => page.nextCursor,
  });
  const templates = api.trainingPlans.listTemplates.useInfiniteQuery(
    getTemplateTrainingPlansInput(search),
    { enabled: tab === "templates", getNextPageParam: (page) => page.nextCursor },
  );
  const ownedPlans = owned.data?.pages.flatMap((page) => page.items) ?? [];
  const templatePlans = templates.data?.pages.flatMap((page) => page.items) ?? [];
  const loadMore = async (kind: "owned" | "templates") => {
    const query = kind === "owned" ? owned : templates;
    const key = JSON.stringify([kind, search.trim()]);
    if (!query.hasNextPage || query.isFetchingNextPage || pageFlights.current.has(key)) return;
    pageFlights.current.add(key);
    setPageState({ key, pending: true, error: null });
    try {
      await query.fetchNextPage();
    } catch (error) {
      setPageState((current) =>
        current?.key === key
          ? {
              key,
              pending: false,
              error:
                error instanceof Error ? error.message : "Unable to load more plans. Try again.",
            }
          : current,
      );
      return;
    } finally {
      pageFlights.current.delete(key);
    }
    setPageState((current) =>
      current?.key === key ? { key, pending: false, error: null } : current,
    );
  };
  const ownedPage = pageState?.key === JSON.stringify(["owned", search.trim()]) ? pageState : null;
  const templatePage =
    pageState?.key === JSON.stringify(["templates", search.trim()]) ? pageState : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Plan library</p>
          <h1 className="text-3xl font-semibold tracking-tight">Training plans</h1>
        </div>
        <Button data-testid="training-plan-create" onClick={onCreate} type="button">
          Create training plan
        </Button>
      </div>
      <label className="block max-w-xl space-y-2" htmlFor="training-plan-search">
        <span className="text-sm font-medium">Search plans</span>
        <Input
          id="training-plan-search"
          onChange={(event) => {
            const value = event.target.value;
            if (onSearchChange) onSearchChange(value);
            else setLocalSearch(value);
          }}
          value={search}
        />
      </label>
      <Tabs
        defaultValue="owned"
        {...(tab ? { value: tab } : {})}
        onValueChange={(nextTab) => {
          if (nextTab === "owned" || nextTab === "templates") onTabChange?.(nextTab);
        }}
      >
        <TabsList aria-label="Training plan libraries">
          <TabsTrigger value="owned">My plans</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-4" value="owned">
          <QueryState
            error={owned.error}
            loading={owned.isLoading}
            onRetry={() => owned.refetch()}
          />
          {ownedPage?.error ? <p role="alert">{ownedPage.error}</p> : null}
          {!owned.isLoading && (!owned.error || ownedPlans.length > 0) ? (
            <PlanGrid kind="owned" onOpen={onOpen} plans={ownedPlans} />
          ) : null}
          {owned.hasNextPage ? (
            <Button
              disabled={owned.isFetchingNextPage || ownedPage?.pending}
              onClick={() => void loadMore("owned")}
              type="button"
              variant="outline"
            >
              {owned.isFetchingNextPage || ownedPage?.pending ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </TabsContent>
        <TabsContent className="space-y-4" value="templates">
          <QueryState
            error={templates.error}
            loading={templates.isLoading}
            onRetry={() => templates.refetch()}
          />
          {templatePage?.error ? <p role="alert">{templatePage.error}</p> : null}
          {!templates.isLoading && (!templates.error || templatePlans.length > 0) ? (
            <PlanGrid kind="templates" onOpen={onOpen} plans={templatePlans} />
          ) : null}
          {templates.hasNextPage ? (
            <Button
              disabled={templates.isFetchingNextPage || templatePage?.pending}
              onClick={() => void loadMore("templates")}
              type="button"
              variant="outline"
            >
              {templates.isFetchingNextPage || templatePage?.pending ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
