import { compileActivityPlan } from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../../../lib/api/client";
import {
  clearContractEpochRecordingRecoveryNotice,
  readContractEpochRecordingRecoveryNotice,
} from "../../../lib/contract-epoch";
import { useTimerOnlyRecording } from "../../../lib/recording/provider";
import { recordingActivityOptions, validateRecordingSearch } from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordPage,
});

function RecordPage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const recording = useTimerOnlyRecording();
  const [epochRecoveryNotice, setEpochRecoveryNotice] =
    useState<ReturnType<typeof readContractEpochRecordingRecoveryNotice>>(null);
  useEffect(() => {
    setEpochRecoveryNotice(readContractEpochRecordingRecoveryNotice());
  }, []);
  const snapshot = recording.state.reducer.snapshot;
  const eventId = snapshot?.activity.eventId ?? launcher.eventId;
  const selectedEvent = api.events.getById.useQuery(
    { id: eventId ?? "", personalize: false },
    { enabled: Boolean(eventId) },
  );
  const activityPlanId =
    snapshot?.activity.activityPlanId ??
    launcher.activityPlanId ??
    selectedEvent.data?.activityPlanSummary?.id;
  const routeId = snapshot?.activity.routeId ?? launcher.routeId;
  const selectedPlanQuery = api.activityPlans.getById.useQuery(
    { id: activityPlanId ?? "", personalize: false },
    { enabled: Boolean(activityPlanId), retry: false },
  );
  const selectedPlan = selectedPlanQuery.data?.detail;
  const selectedRouteQuery = api.routes.get.useQuery(
    { id: routeId ?? "" },
    { enabled: Boolean(routeId), retry: false },
  );
  const selectedRoute = selectedRouteQuery.data;
  const activityCategory =
    snapshot?.activity.activity_category ??
    selectedPlan?.activityCategory ??
    launcher.activity_category;
  const active =
    recording.state.reducer.lifecycle === "recording" ||
    recording.state.reducer.lifecycle === "paused";
  const planUnavailable = Boolean(
    activityPlanId &&
      !selectedPlanQuery.isLoading &&
      (selectedPlanQuery.isError ||
        !selectedPlan?.capabilities.canRecord ||
        !selectedPlan.structure),
  );

  const chooseActivity = (category: typeof launcher.activity_category) => {
    if (snapshot || activityPlanId) return;
    void navigate({
      to: "/record",
      search: { ...launcher, activity_category: category, gps: "off" },
      replace: true,
    });
  };

  const openSession = () => {
    if (!active) {
      const configured = recording.configure({
        activity_category: activityCategory,
        ...(eventId ? { eventId } : {}),
        ...(activityPlanId ? { activityPlanId } : {}),
        ...(routeId ? { routeId } : {}),
        ...(selectedPlan?.capabilities.canRecord &&
        selectedPlan.structure &&
        selectedPlan.structureHash
          ? {
              plan: {
                activityPlanId: selectedPlan.id,
                scheduledEventId: eventId ?? null,
                name: selectedPlan.name,
                description: selectedPlan.description,
                activityPlanRevision: selectedPlan.activityPlanRevision,
                structureHash: selectedPlan.structureHash,
                structure: selectedPlan.structure,
              },
            }
          : {}),
      });
      if (!configured) return;
    }
    void navigate({ to: "/record/session" });
  };

  const occurrenceCount = selectedPlan?.structure
    ? compileActivityPlan(selectedPlan.structure).occurrences.length
    : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-4">
      <Card>
        <CardHeader>
          <div className="flex gap-2">
            <Badge>Indoor recording</Badge>
            <Badge variant="outline">Foreground only</Badge>
          </div>

          {routeId ? (
            <div className="space-y-3 rounded-lg border p-4 text-sm">
              <p className="font-medium">Route</p>
              <p className="text-muted-foreground">
                {selectedRoute?.name ??
                  (selectedRouteQuery.isLoading ? "Loading route…" : "Route unavailable")}
              </p>
            </div>
          ) : null}
          <CardTitle aria-level={1} className="text-3xl" role="heading">
            Start an indoor activity
          </CardTitle>
          <CardDescription>
            Keep this tab open. The recorder tracks time and plan progress, not GPS or sensor data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {epochRecoveryNotice ? (
            <div className="space-y-2 rounded-lg border border-amber-500/40 p-4" role="alert">
              <p className="font-medium">Older recorder data was preserved</p>
              <p className="text-sm text-muted-foreground">
                A browser contract update was detected. Current recorder data will recover normally.
                Older recorder databases were left intact and may require a compatible app version
                or manual support to inspect safely.
              </p>
              <Button
                onClick={() => {
                  clearContractEpochRecordingRecoveryNotice();
                  setEpochRecoveryNotice(null);
                }}
                size="sm"
                variant="outline"
              >
                Dismiss notice
              </Button>
            </div>
          ) : null}
          {recording.hydrationStatus === "hydrating" ? (
            <p role="status">Checking for a saved recording…</p>
          ) : null}
          {recording.error ? (
            <p className="text-sm text-destructive" role="alert">
              {recording.error}
            </p>
          ) : null}
          {recording.canTakeOver ? (
            <Button variant="destructive" onClick={() => void recording.takeOver()}>
              Take over recording
            </Button>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium">Activity</p>
            <div className="flex flex-wrap gap-2">
              {recordingActivityOptions.map((option) => (
                <Button
                  key={option.value}
                  disabled={Boolean(snapshot || activityPlanId)}
                  variant={activityCategory === option.value ? "default" : "outline"}
                  onClick={() => chooseActivity(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Activity plan</p>
                <p className="text-muted-foreground">
                  {selectedPlan?.name ??
                    (activityPlanId ? "Loading selected plan…" : "No plan attached")}
                </p>
              </div>
              {!snapshot ? (
                <Button asChild variant="outline">
                  <Link to="/record/plan" search={launcher}>
                    {activityPlanId ? "Change plan" : "Choose plan"}
                  </Link>
                </Button>
              ) : (
                <Button disabled variant="outline">
                  Plan locked
                </Button>
              )}
            </div>
            {selectedPlan ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  Category: <span className="font-medium">{selectedPlan.activityCategory}</span>
                </p>
                <p>
                  Steps: <span className="font-medium">{occurrenceCount}</span>
                </p>
                <p className="sm:col-span-2">Target display: authored values</p>
              </div>
            ) : null}
            {activityPlanId && !snapshot ? (
              <Button
                variant="ghost"
                className="px-0 text-destructive"
                onClick={() =>
                  void navigate({
                    to: "/record",
                    search: {
                      activity_category: launcher.activity_category,
                      gps: "off",
                      ...(routeId ? { routeId } : {}),
                    },
                    replace: true,
                  })
                }
              >
                Remove activity plan
              </Button>
            ) : null}
          </div>

          {planUnavailable ? (
            <p className="rounded-lg border border-destructive/40 p-3 text-sm" role="alert">
              This plan cannot be recorded because its private step structure is unavailable. Choose
              one of your own plans or record without a plan.
            </p>
          ) : null}
          {recording.hasRecoveredDraft ? (
            <div className="rounded-lg border border-primary/40 p-4">
              <p className="font-medium">Paused recording recovered</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Time, steps, transitions, and laps were restored.
              </p>
            </div>
          ) : null}
          <Button
            className="w-full"
            disabled={
              recording.hydrationStatus !== "ready" ||
              planUnavailable ||
              Boolean(activityPlanId && selectedPlanQuery.isLoading)
            }
            onClick={openSession}
          >
            <Play className="h-4 w-4" />
            {active || recording.hasRecoveredDraft ? "Return to recorder" : "Open recorder"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
