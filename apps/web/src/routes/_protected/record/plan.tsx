import {
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

import { api } from "../../../lib/api/client";
import { getTodayDateKey } from "../../../lib/planning";
import { useTimerOnlyRecording } from "../../../lib/recording/provider";
import { formatScheduledTime, validateRecordingSearch } from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/plan")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordPlanPage,
});

type SelectedPlan = { planId: string; eventId: string | null };

export function RecordPlanPage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const recording = useTimerOnlyRecording();
  const identityLocked = Boolean(recording.state.reducer.snapshot);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<SelectedPlan | null>(
    launcher.activityPlanId
      ? { planId: launcher.activityPlanId, eventId: launcher.eventId ?? null }
      : null,
  );
  const todayQuery = api.calendar.day.useQuery({ date: getTodayDateKey() });
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "all", limit: 50, ...(searchText.trim() ? { search: searchText.trim() } : {}) },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const detailQuery = api.activityPlans.getById.useQuery(
    { id: selected?.planId ?? "", personalize: false },
    { enabled: Boolean(selected?.planId), retry: false },
  );

  const todayEvents = (todayQuery.data?.projection.items ?? []).filter(
    (event) => event.kind === "planned_activity" && event.status === "scheduled" && event.plan,
  );
  const visiblePlans = useMemo(
    () => plansQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [plansQuery.data?.pages],
  );
  const detail = detailQuery.data?.detail;
  const compiled = detail?.structure ? compileActivityPlan(detail.structure) : null;

  const usePlan = () => {
    if (!selected || !detail?.capabilities.canRecord || !detail.structure) return;
    void navigate({
      to: "/record",
      search: {
        activity_category: detail.activityCategory,
        gps: "off",
        activityPlanId: detail.id,
        ...(selected.eventId ? { eventId: selected.eventId } : {}),
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
            <Link to="/record/session">Return to recording</Link>
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
            Scheduled plans keep their event identity. Library plans start without inventing one.
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
          <CardTitle>Today&apos;s scheduled plans</CardTitle>
          <CardDescription>
            Prefer the scheduled instance when it matches today&apos;s session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {todayQuery.isLoading ? <p role="status">Loading today&apos;s plans…</p> : null}
          {!todayQuery.isLoading && todayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled plans today.</p>
          ) : null}
          {todayEvents.map((event) => {
            const plan = event.plan;
            if (!plan) return null;
            return (
              <button
                className="rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={event.id}
                onClick={() => setSelected({ planId: plan.id, eventId: event.id })}
                type="button"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge>{plan.activityCategory}</Badge>
                  <Badge variant="outline">
                    {formatScheduledTime(event.timing.startsAt ?? event.calendarDate)}
                  </Badge>
                </div>
                <p className="mt-2 font-medium">{plan.name}</p>
                <p className="text-sm text-muted-foreground">Scheduled instance</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All visible activity plans</CardTitle>
          <CardDescription>
            Search plans you can see. Only plans with available private steps can be recorded.
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
          <div className="grid gap-3 sm:grid-cols-2">
            {visiblePlans.map((plan) => (
              <button
                className="rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!plan.capabilities.canRecord}
                key={plan.id}
                onClick={() => setSelected({ planId: plan.id, eventId: null })}
                type="button"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{plan.activityCategory}</Badge>
                  {!plan.capabilities.canRecord ? (
                    <Badge variant="secondary">View only</Badge>
                  ) : null}
                </div>
                <p className="mt-2 font-medium">{plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {plan.description ?? "Activity plan"}
                </p>
              </button>
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
            <CardTitle>{detail?.name ?? "Plan setup"}</CardTitle>
            <CardDescription>
              Review the prescription before locking it into this recording.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {detailQuery.isLoading ? (
              <Loader2 aria-label="Loading plan setup" className="h-5 w-5 animate-spin" />
            ) : null}
            {detailQuery.isError || (detail && !detail.capabilities.canRecord) ? (
              <p role="alert" className="text-sm text-destructive">
                This plan&apos;s executable steps are unavailable for recording.
              </p>
            ) : null}
            {detail && compiled ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{detail.activityCategory}</Badge>
                  <Badge variant="outline">{compiled.occurrences.length} steps</Badge>
                  {detail.metrics
                    .filter((metric) => metric.status !== "unavailable")
                    .map((metric) => (
                      <Badge key={metric.key} variant="outline">
                        {metric.label}: {metric.value} {metric.unit}
                      </Badge>
                    ))}
                </div>
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                  Recording uses the plan&apos;s authored targets. Session Flow personalization is
                  display-only until it explicitly hands a selected target representation to the
                  recorder.
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
                                activityCategory: detail.activityCategory,
                                asOf: new Date().toISOString(),
                              }).label,
                          )
                          .join(" · ") || "No target"}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={usePlan}>Use this plan</Button>
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
                        search: { activity_category: launcher.activity_category, gps: "off" },
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
