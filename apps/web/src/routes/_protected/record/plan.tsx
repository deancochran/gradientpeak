import {
  type CalendarProjectionItem,
  compileActivityPlan,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { SearchField } from "@repo/ui/components/search-field";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ActivityPlanCard } from "../../../components/activity-plan/activity-plan-card";
import { api } from "../../../lib/api/client";
import { getTodayDateKey } from "../../../lib/planning";
import { useTimerOnlyRecording } from "../../../lib/recording/provider";
import { formatScheduledTime, validateRecordingSearch } from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/plan")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordPlanPage,
});

type PlannedSession = NonNullable<CalendarProjectionItem["plannedSession"]>;
type SelectedPlan =
  | { kind: "library"; planId: string }
  | { kind: "planned_session"; session: PlannedSession };

export function RecordPlanPage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const recording = useTimerOnlyRecording();
  const identityLocked = Boolean(recording.state.reducer.snapshot);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<SelectedPlan | null>(
    launcher.activityPlanId ? { kind: "library", planId: launcher.activityPlanId } : null,
  );
  const todayQuery = api.calendar.day.useQuery({ date: getTodayDateKey() });
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "all", limit: 50, ...(searchText.trim() ? { search: searchText.trim() } : {}) },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const selectedPlanId =
    selected?.kind === "library"
      ? selected.planId
      : selected?.kind === "planned_session"
        ? selected.session.activityPlanId
        : undefined;
  const detailQuery = api.activityPlans.getById.useQuery(
    { id: selectedPlanId ?? "", personalize: false },
    { enabled: Boolean(selectedPlanId), retry: false },
  );

  const todaySessions = (todayQuery.data?.projection.items ?? []).flatMap((item) =>
    item.kind === "planned_activity" &&
    item.status === "scheduled" &&
    item.plannedSession?.lifecycle.status === "scheduled"
      ? [item.plannedSession]
      : [],
  );
  const visiblePlans = useMemo(
    () => plansQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [plansQuery.data?.pages],
  );
  const detail = detailQuery.data?.detail;
  const plannedSession = selected?.kind === "planned_session" ? selected.session : null;
  const selectedStructure = detail?.structure;
  const selectedCategory = detail?.activityCategory;
  const compiled = selectedStructure ? compileActivityPlan(selectedStructure) : null;
  const selectedName = plannedSession ? (detail?.name ?? "Scheduled activity plan") : detail?.name;

  const usePlan = () => {
    if (!selected || !selectedStructure || !selectedCategory) return;
    if (
      selected.kind === "library" &&
      (detailQuery.isLoading || detailQuery.isError || detail?.id !== selected.planId)
    )
      return;
    if (selected.kind === "planned_session") {
      void navigate({
        to: "/record/session",
        search: {
          activity_category: selectedCategory,
          gps: "off",
          plannedSessionId: selected.session.id,
          plannedSessionDate: selected.session.planningDate,
          ...(launcher.routeId ? { routeId: launcher.routeId } : {}),
        },
      });
      return;
    }
    if (!detail?.capabilities.canRecord) return;
    void navigate({
      to: "/record/session",
      search: {
        activity_category: selectedCategory,
        gps: "off",
        activityPlanId: detail.id,
        ...(launcher.routeId ? { routeId: launcher.routeId } : {}),
      },
    });
  };

  if (identityLocked) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Activity plan locked</CardTitle>
          <CardDescription>A plan cannot change after recording starts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/record/session" search={launcher}>
              Return to recording
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Choose an activity plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Scheduled sessions use their current activity plan when recording starts. Library plans
            start without inventing a scheduled identity.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/record" search={launcher}>
            Back to launcher
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s planned sessions</CardTitle>
          <CardDescription>
            Choose a scheduled session to record its current activity plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {todayQuery.isLoading ? <p role="status">Loading today&apos;s sessions…</p> : null}
          {todayQuery.isError ? (
            <div role="alert" className="text-sm text-destructive">
              <p>Today&apos;s planned sessions could not be loaded.</p>
              <Button type="button" variant="outline" onClick={() => void todayQuery.refetch()}>
                Retry planned sessions
              </Button>
            </div>
          ) : null}
          {!todayQuery.isLoading && !todayQuery.isError && todaySessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No planned sessions today.</p>
          ) : null}
          {todaySessions.map((session) => {
            return (
              <button
                aria-pressed={
                  selected?.kind === "planned_session" && selected.session.id === session.id
                }
                className="rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={session.id}
                onClick={() => setSelected({ kind: "planned_session", session })}
                type="button"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge>{session.activityPlanId ? "Planned session" : "Plan unavailable"}</Badge>
                  <Badge variant="outline">{formatScheduledTime(session.planningDate)}</Badge>
                </div>
                <p className="mt-2 font-medium capitalize">Scheduled activity plan</p>
                <p className="text-sm text-muted-foreground">Uses the current plan at start</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All visible activity plans</CardTitle>
          <CardDescription>
            Search plans you can see. Record any available plan, including public plans and
            templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchField
            accessibilityLabel="Search all activity plans"
            loading={plansQuery.isFetching}
            loadingLabel="Loading activity plans"
            maxLength={80}
            name="planSearch"
            onValueChange={setSearchText}
            placeholder="Search activity plans"
            testId="record-plan-search"
            value={searchText}
          />
          {plansQuery.isLoading ? <p role="status">Loading activity plans…</p> : null}
          {plansQuery.isError ? (
            <div role="alert">
              <p>Activity plans could not be loaded.</p>
              <Button type="button" variant="outline" onClick={() => void plansQuery.refetch()}>
                Retry activity plans
              </Button>
            </div>
          ) : null}
          {!plansQuery.isLoading && !plansQuery.isError && visiblePlans.length === 0 ? (
            <p>No activity plans match your search.</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {visiblePlans.map((plan) => (
              <ActivityPlanCard
                disabled={!plan.capabilities.canRecord}
                key={plan.id}
                onOpen={() => setSelected({ kind: "library", planId: plan.id })}
                openLabel={`Select ${plan.name}${plan.capabilities.canRecord ? "" : " (view only)"}`}
                selected={selected?.kind === "library" && selected.planId === plan.id}
                plan={plan}
              />
            ))}
          </div>
          {plansQuery.hasNextPage ? (
            <Button
              disabled={plansQuery.isFetchingNextPage}
              onClick={() => void plansQuery.fetchNextPage()}
              variant="outline"
            >
              {plansQuery.isFetchingNextPage ? "Loading…" : "Load more plans"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>{selectedName ?? "Plan setup"}</CardTitle>
            <CardDescription>
              Review the prescription before locking it into this recording.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selected.kind === "library" && detailQuery.isLoading ? (
              <Loader2 aria-label="Loading plan setup" className="h-5 w-5 animate-spin" />
            ) : null}
            {selected.kind === "library" &&
            (detailQuery.isError || (detail && !detail.capabilities.canRecord)) ? (
              <div role="alert" className="text-sm text-destructive">
                This plan&apos;s executable steps are unavailable for recording.
                {detailQuery.isError ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void detailQuery.refetch()}
                  >
                    Retry selected plan
                  </Button>
                ) : null}
              </div>
            ) : null}
            {selectedStructure && selectedCategory && compiled ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{selectedCategory}</Badge>
                  <Badge variant="outline">{compiled.occurrences.length} steps</Badge>
                  {(detail?.metrics ?? [])
                    .filter((metric) => metric.status !== "unavailable")
                    .map((metric) => (
                      <Badge key={metric.key} variant="outline">
                        {metric.label}: {metric.value} {metric.unit}
                      </Badge>
                    ))}
                </div>
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                  {plannedSession
                    ? "Recording captures the current plan when this session starts."
                    : "Recording uses the plan's authored targets. Session Flow personalization is display-only until it explicitly hands a selected target representation to the recorder."}
                </p>
                <ol className="space-y-2">
                  {compiled.occurrences.map((occurrence, index) => (
                    <li className="rounded-lg border p-3 text-sm" key={occurrence.occurrenceId}>
                      <p className="font-medium">
                        Step {index + 1} of {compiled.occurrences.length} ·{" "}
                        {durationLabel(occurrence.duration)}
                      </p>
                      <p className="text-muted-foreground">
                        {orderActivityPlanTargetsForPresentation(occurrence.targets)
                          .map(
                            (target) =>
                              resolveActivityPlanTargetPresentation({
                                target,
                                activityCategory: selectedCategory,
                                asOf: new Date().toISOString(),
                              }).label,
                          )
                          .join(" · ") || "No target"}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={
                      selected.kind === "library" &&
                      (detailQuery.isLoading ||
                        detailQuery.isError ||
                        !detail?.capabilities.canRecord)
                    }
                    onClick={usePlan}
                  >
                    Use this plan
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(null);
                    }}
                  >
                    Choose another
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void navigate({
                        to: "/record",
                        search: {
                          activity_category: launcher.activity_category,
                          gps: "off",
                          ...(launcher.routeId ? { routeId: launcher.routeId } : {}),
                        },
                      })
                    }
                  >
                    Record without a plan
                  </Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CalendarDays className="h-5 w-5" />
            Select a scheduled or library plan to review its steps.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function durationLabel(duration: {
  type: string;
  seconds?: number;
  meters?: number;
  count?: number;
}) {
  if (duration.type === "time") return `${duration.seconds} seconds`;
  if (duration.type === "distance") return `${duration.meters} metres · manual completion`;
  if (duration.type === "repetitions") return `${duration.count} repetitions · manual completion`;
  return "Open step · manual completion";
}
