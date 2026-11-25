import { ACTIVITY_PLAN_COMPILER_VERSION, compileActivityPlan } from "@repo/core/activity-plan";
import { indexSimulationRoute } from "@repo/core/recording/simulation-route";
import { recordingPlanExecutionSnapshotSchema } from "@repo/core/schemas/recording-session";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PlanRouteSimulator } from "../../../components/activity/plan-route-simulator";
import { api } from "../../../lib/api/client";
import { validateRecordingSearch } from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/simulate")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: SimulationPage,
});

function guidanceManifest(structure: unknown) {
  return {
    manifestVersion: 2,
    personalizationEnabled: false,
    targetPresentations: compileActivityPlan(structure).occurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      labels: occurrence.targets.map((target) =>
        target.type === "rest" ? "Rest" : `${target.type} ${target.intensity}`,
      ),
    })),
  };
}

export function SimulationPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [locked, setLocked] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const calendar = api.calendar.day.useQuery(
    { date: search.plannedSessionDate ?? "" },
    { enabled: Boolean(search.plannedSessionId && search.plannedSessionDate), retry: false },
  );
  const planned = calendar.data?.projection?.items
    .flatMap((item) => (item.plannedSession ? [item.plannedSession] : []))
    .find((session) => session.id === search.plannedSessionId);
  const plan = api.activityPlans.getById.useQuery(
    {
      id: search.plannedSessionId ? (planned?.activityPlanId ?? "") : (search.activityPlanId ?? ""),
      personalize: false,
    },
    {
      enabled: Boolean(search.plannedSessionId ? planned?.activityPlanId : search.activityPlanId),
      retry: false,
    },
  );
  const route = api.routes.loadFull.useQuery(
    { id: search.routeId ?? "" },
    { enabled: Boolean(search.routeId), retry: false },
  );
  const cursor = cursors.at(-1);
  const routes = api.routes.list.useQuery(
    { limit: 20, ownerScope: "all", sort_by: "newest", ...(cursor ? { cursor } : {}) },
    { retry: false },
  );
  const selectionKey = `${search.plannedSessionId ?? search.activityPlanId ?? "none"}:${search.plannedSessionDate ?? "none"}:${search.routeId ?? "none"}`;
  const loading = Boolean(
    (search.plannedSessionId &&
      (calendar.isLoading ||
        calendar.isPlaceholderData ||
        plan.isLoading ||
        plan.isPlaceholderData)) ||
      (!search.plannedSessionId &&
        search.activityPlanId &&
        (plan.isLoading || plan.isPlaceholderData)) ||
      (search.routeId && (route.isLoading || route.isPlaceholderData)),
  );
  const resources = useMemo(() => {
    try {
      if (search.plannedSessionId && !search.plannedSessionDate)
        throw new Error("A calendar date is required to load the planned session.");
      if (loading) return { snapshot: undefined, coordinates: undefined, error: null };
      let snapshot: ReturnType<typeof recordingPlanExecutionSnapshotSchema.parse> | undefined;
      if (search.plannedSessionId) {
        const detail = plan.data?.detail;
        if (
          calendar.isError ||
          !planned ||
          plan.isError ||
          !detail?.structure ||
          !detail.structureHash ||
          detail.id !== planned.activityPlanId
        )
          throw new Error(
            "The selected planned session's current activity plan could not be loaded.",
          );
        snapshot = recordingPlanExecutionSnapshotSchema.parse({
          ...guidanceManifest(detail.structure),
          activityPlanId: detail.id,
          activityPlanRevision: detail.activityPlanRevision,
          compilerVersion: ACTIVITY_PLAN_COMPILER_VERSION,
          structureHash: detail.structureHash,
          name: detail.name,
          description: detail.description,
          scheduledEventId: null,
          structure: detail.structure,
        });
      } else if (search.activityPlanId) {
        const detail = plan.data?.detail;
        if (
          plan.isError ||
          !detail?.structure ||
          !detail.structureHash ||
          detail.id !== search.activityPlanId
        )
          throw new Error("The selected canonical activity plan could not be loaded.");
        snapshot = recordingPlanExecutionSnapshotSchema.parse({
          ...guidanceManifest(detail.structure),
          activityPlanId: detail.id,
          activityPlanRevision: detail.activityPlanRevision,
          compilerVersion: ACTIVITY_PLAN_COMPILER_VERSION,
          structureHash: detail.structureHash,
          name: detail.name,
          description: detail.description,
          scheduledEventId: search.eventId ?? null,
          structure: detail.structure,
        });
      }
      if (snapshot) compileActivityPlan(snapshot.structure);
      let coordinates: NonNullable<typeof route.data>["coordinates"] | undefined;
      if (search.routeId) {
        if (route.isError || !route.data || route.data.id !== search.routeId)
          throw new Error("Full route geometry could not be loaded or is not accessible.");
        const indexed = indexSimulationRoute(route.data.coordinates);
        if (indexed.totalDistanceMeters <= 0)
          throw new Error(
            "The selected route has no traversable full geometry. Choose another route or remove it.",
          );
        coordinates = route.data.coordinates;
      }
      if (!snapshot && !coordinates)
        throw new Error("Choose an activity plan from the launcher or select a route below.");
      return { snapshot, coordinates, error: null };
    } catch (error) {
      return {
        snapshot: undefined,
        coordinates: undefined,
        error: error instanceof Error ? error.message : "Simulation inputs are unavailable.",
      };
    }
  }, [
    search.activityPlanId,
    search.plannedSessionId,
    search.plannedSessionDate,
    search.routeId,
    search.eventId,
    loading,
    planned,
    calendar.isError,
    plan.data,
    plan.isError,
    route.data,
    route.isError,
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/record" search={search}>
            Back to recording launcher
          </Link>
        </Button>
        {!search.plannedSessionId ? (
          <Button asChild variant="outline">
            <Link to="/record/plan" search={search}>
              Choose an activity plan
            </Link>
          </Button>
        ) : null}
      </div>
      <h1 className="text-2xl font-semibold">Plan / route simulation</h1>
      <p>
        This separate virtual session cannot save an activity or change training history. Its
        controls never connect Bluetooth or control a trainer.
      </p>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Simulation inputs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Plan:{" "}
            {resources.snapshot?.name ??
              (search.activityPlanId || search.plannedSessionId
                ? loading
                  ? "Loading…"
                  : "Unavailable"
                : "No plan selected")}
          </p>
          <p>
            Route:{" "}
            {search.routeId
              ? (route.data?.name ?? (route.isLoading ? "Loading full geometry…" : "Unavailable"))
              : "No route selected"}
          </p>
          {resources.error ? (
            <div className="flex flex-wrap gap-2">
              {search.plannedSessionId ? (
                <Button variant="outline" onClick={() => void calendar.refetch()}>
                  Retry planned session
                </Button>
              ) : search.activityPlanId ? (
                <Button variant="outline" onClick={() => void plan.refetch()}>
                  Retry plan
                </Button>
              ) : null}
              {search.routeId ? (
                <Button variant="outline" onClick={() => void route.refetch()}>
                  Retry route geometry
                </Button>
              ) : null}
            </div>
          ) : null}
          {search.routeId ? (
            <Button
              disabled={locked}
              variant="outline"
              onClick={() => {
                const nextSearch = { ...search };
                delete nextSearch.routeId;
                void navigate({
                  to: "/record/simulate",
                  search: nextSearch,
                  replace: true,
                });
              }}
            >
              Remove simulation route
            </Button>
          ) : null}
          <section className="space-y-2" aria-label="Simulation route library">
            <h3 className="font-medium">Choose an accessible route</h3>
            {routes.isLoading || routes.isPlaceholderData ? (
              <p role="status">Loading routes…</p>
            ) : routes.isError ? (
              <div role="alert">
                Routes could not be loaded.{" "}
                <Button variant="outline" onClick={() => void routes.refetch()}>
                  Retry routes
                </Button>
              </div>
            ) : routes.data?.items.length ? (
              <div className="flex flex-wrap gap-2">
                {routes.data.items.map((item) => (
                  <Button
                    key={item.id}
                    disabled={locked}
                    variant="outline"
                    aria-pressed={search.routeId === item.id}
                    onClick={() =>
                      void navigate({
                        to: "/record/simulate",
                        search: { ...search, routeId: item.id },
                        replace: true,
                      })
                    }
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            ) : (
              <p>No routes are available on this page.</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={locked || cursors.length === 0 || routes.isLoading}
                onClick={() => setCursors((previous) => previous.slice(0, -1))}
              >
                Previous routes
              </Button>
              <Button
                variant="outline"
                disabled={locked || !routes.data?.nextCursor || routes.isError || routes.isLoading}
                onClick={() => {
                  const next = routes.data?.nextCursor;
                  if (next) setCursors((previous) => [...previous, next]);
                }}
              >
                More routes
              </Button>
            </div>
          </section>
        </CardContent>
      </Card>
      <PlanRouteSimulator
        key={selectionKey}
        loading={loading}
        error={resources.error}
        {...(resources.snapshot ? { planSnapshot: resources.snapshot } : {})}
        {...(resources.coordinates ? { coordinates: resources.coordinates } : {})}
        onLockChange={setLocked}
      />
    </div>
  );
}
