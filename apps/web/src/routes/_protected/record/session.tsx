import {
  canRetryDirectIngestion,
  IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS,
  ingestionStatusPollingInterval,
} from "@repo/api/client";
import {
  activityPlanStructureSchema,
  type CompiledActivityPlanOccurrence,
  compileActivityPlan,
  decodePolyline,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import {
  primaryRecordingGuidancePlan,
  primaryRecordingGuidanceRoute,
} from "@repo/core/recording/guidance";
import { nudgeNumberByStep, numericUxPolicies } from "@repo/core/utils/numeric-ux-policy";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { SearchField } from "@repo/ui/components/search-field";
import { Textarea } from "@repo/ui/components/textarea";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bluetooth,
  Flag,
  Pause,
  Play,
  Save,
  SkipForward,
  Square,
  StepBack,
  Timer,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { RecordingCockpit } from "../../../components/recording/recording-cockpit";
import { uploadFileToSignedUrl } from "../../../lib/activity-route-upload";
import { api } from "../../../lib/api/client";
import { buildUploadedRecordingSummaryInput } from "../../../lib/recording/finalized-artifact";
import { useTimerOnlyRecording } from "../../../lib/recording/provider";
import {
  parseManualReviewValues,
  parseTrainerTargetPower,
} from "../../../lib/recording/review-inputs";
import {
  type SubmitWebRecording,
  submitWebRecordingArtifact,
} from "../../../lib/recording/submission-queue";
import { recordingActivityOptions, validateRecordingSearch } from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/session")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordSessionPage,
});

export function RecordSessionPage() {
  const search = Route.useSearch();
  const recording = useTimerOnlyRecording();
  const { lifecycle, snapshot } = recording.state.reducer;
  const configuration = recording.state.configuration;
  const [planChoiceId, setPlanChoiceId] = useState<string | null>(null);
  const [planSearch, setPlanSearch] = useState("");
  const [intensityDraft, setIntensityDraft] = useState("100");
  const selectedPlanId = planChoiceId ?? search.activityPlanId ?? null;
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "all", limit: 12, ...(planSearch.trim() ? { search: planSearch.trim() } : {}) },
    { getNextPageParam: (last) => last.nextCursor },
  );
  const chosenPlanQuery = api.activityPlans.getById.useQuery(
    { id: selectedPlanId ?? "", personalize: false },
    { enabled: Boolean(selectedPlanId), retry: false },
  );
  const plannedSessionQuery = api.calendar.day.useQuery(
    { date: search.plannedSessionDate ?? "" },
    { enabled: Boolean(search.plannedSessionId && search.plannedSessionDate), retry: false },
  );
  const plannedSession = plannedSessionQuery.data?.projection.items
    .flatMap((item) => (item.plannedSession ? [item.plannedSession] : []))
    .find((session) => session.id === search.plannedSessionId);
  const recordingLaunch = api.plannedSessions.recordingLaunch.useMutation({ retry: false });
  const plannedLaunchAttempt = useRef<string | null>(null);
  const routesQuery = api.routes.list.useInfiniteQuery(
    { limit: 12, ownerScope: "own", sort_by: "newest" },
    { getNextPageParam: (last) => last.nextCursor, retry: false },
  );
  const visiblePlans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleRoutes = routesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const currentGuidance = recording.state.guidance?.revisions.at(-1);
  // A revision explicitly records null for a detached plan or route. Do not fall
  // back to the start snapshot in that case, or detached guidance reappears.
  const currentPlan = currentGuidance
    ? currentGuidance.plan
    : (snapshot?.planExecution ?? configuration?.plan ?? null);
  const currentRouteId = currentGuidance
    ? currentGuidance.routeId
    : (snapshot?.activity.routeId ?? configuration?.routeId ?? null);
  const beginRecordingUpload = api.activityFiles.beginMobileRecordingUpload.useMutation(
    IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS,
  );
  const createActivity = api.activities.createFromRecordingSummary.useMutation();
  const recordSessionRpe = api.activities.recordSessionRpe.useMutation();
  const [notes, setNotes] = useState("");
  const [perceivedEffort, setPerceivedEffort] = useState("");
  const [distanceMeters, setDistanceMeters] = useState("");
  const [calories, setCalories] = useState("");
  const loadedReview = useRef<{
    state: typeof recording.state;
    sessionId: string;
    notes: string;
    perceivedEffort: string;
    distanceMeters: string;
    calories: string;
  } | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [targetPower, setTargetPower] = useState("150");
  const [targetPowerError, setTargetPowerError] = useState<string | null>(null);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [ingestionId, setIngestionId] = useState<string | null>(null);
  const profileQuery = api.profiles.get.useQuery();
  const ingestionStatusQuery = api.activityFiles.getIngestionStatus.useQuery(
    { profileId: profileQuery.data?.id ?? "", ingestionId: ingestionId ?? "" },
    {
      enabled: Boolean(profileQuery.data?.id && ingestionId),
      refetchInterval: (query) => ingestionStatusPollingInterval(query.state.data),
    },
  );
  const hasSavedActivity = isReviewFrozen(recording.submissionJob);
  const reviewPrimaryPlan = recording.artifact?.guidance
    ? primaryRecordingGuidancePlan(recording.artifact.guidance)
    : (recording.artifact?.snapshot.planExecution ?? null);
  const reviewPrimaryRouteId = recording.artifact?.guidance
    ? primaryRecordingGuidanceRoute(recording.artifact.guidance)
    : (recording.artifact?.snapshot.activity.routeId ?? null);
  const setTrainerTargetPower = () => {
    const value = parseTrainerTargetPower(targetPower);
    if (value === null) {
      setTargetPowerError("Enter a supported non-negative target power.");
      return;
    }
    setTargetPowerError(null);
    void recording.sensors.setTargetPower(value);
  };
  const adjustTrainerTargetPower = (direction: -1 | 1) => {
    const value = parseTrainerTargetPower(targetPower);
    if (value === null) return;
    setTargetPower(
      String(
        nudgeNumberByStep(value, direction, {
          min: 0,
          max: Number.MAX_SAFE_INTEGER,
          step: numericUxPolicies.plannedPowerWatts.adjustmentStep,
        }),
      ),
    );
    setTargetPowerError(null);
  };
  const saveReview = () => {
    const values = parseManualReviewValues({
      artifactDistanceMeters: recording.artifact?.review.distanceMeters ?? 0,
      calories,
      distanceMeters,
    });
    if (!values) {
      setReviewError("Enter non-negative manual distance and calories, or leave them blank.");
      return;
    }
    setReviewError(null);
    void recording.save({
      name: activityPersistenceName,
      notes: notes.trim() || null,
      perceivedEffort: perceivedEffort ? Number(perceivedEffort) : null,
      ...values,
    });
  };
  const activityPersistenceName = recording.artifact?.review.name ?? "Activity";
  const planStatus = recording.planStatus;
  const effectiveIntensity = planStatus?.intensityScale ?? configuration?.intensityScale ?? 1;
  const supportsIntensity = Boolean(
    currentPlan &&
      compileActivityPlan(
        activityPlanStructureSchema.parse(currentPlan.structure),
      ).occurrences.some(
        (occurrence) =>
          occurrence.role === "activity" &&
          occurrence.targets.some((target) => target.type === "%FTP"),
      ),
  );
  useEffect(() => {
    setIntensityDraft(
      currentPlan?.activityPlanId ? String(Math.round(effectiveIntensity * 100)) : "100",
    );
  }, [effectiveIntensity, currentPlan?.activityPlanId]);
  const planSnapshot = currentPlan;
  const routeId = recording.artifact ? reviewPrimaryRouteId : currentRouteId;
  const trainerCommandsAllowed =
    lifecycle !== "finishing" &&
    lifecycle !== "finished" &&
    !recording.savingCommand &&
    !recording.durabilityFenced;
  const selectedRouteQuery = api.routes.get.useQuery(
    { id: routeId ?? "" },
    { enabled: Boolean(routeId), retry: false },
  );
  // The review route is intentionally queried above from the finalized artifact's
  // primary guidance. The cockpit always follows only current live guidance.
  const liveRouteFullQuery = api.routes.loadFull.useQuery(
    { id: currentRouteId ?? "" },
    { enabled: lifecycle !== "finished" && Boolean(currentRouteId), retry: false },
  );
  const currentOccurrence = planStatus?.currentOccurrence ?? null;
  const compiledPreview = planSnapshot
    ? compileActivityPlan(activityPlanStructureSchema.parse(planSnapshot.structure)).occurrences
    : [];
  const cockpitOccurrence =
    lifecycle === "pending" ? (compiledPreview[0] ?? null) : currentOccurrence;
  const nextPreviewOccurrence =
    lifecycle === "pending" ? (compiledPreview[1] ?? null) : (planStatus?.nextOccurrence ?? null);
  const targetPresentations =
    planSnapshot && "targetPresentations" in planSnapshot ? planSnapshot.targetPresentations : [];
  const currentTargetLabels =
    planStatus?.targetLabels ??
    (cockpitOccurrence
      ? (targetPresentations.find(
          (presentation) => presentation.occurrenceId === cockpitOccurrence.occurrenceId,
        )?.labels ??
        orderActivityPlanTargetsForPresentation(cockpitOccurrence.targets).map(
          (target) =>
            resolveActivityPlanTargetPresentation({
              target,
              activityCategory: configuration?.activity_category ?? search.activity_category,
              asOf: new Date().toISOString(),
            }).label,
        ))
      : []);
  const previewRouteCoordinates =
    selectedRouteQuery.data?.polyline && !liveRouteFullQuery.data?.coordinates.length
      ? decodePolyline(selectedRouteQuery.data.polyline)
      : [];
  const recordingControls = (
    <fieldset className="flex flex-wrap gap-3" aria-label="Recording controls">
      {lifecycle === "pending" ? (
        <Button
          size="lg"
          disabled={recording.busy || recording.savingCommand || recording.durabilityFenced}
          onClick={recording.start}
        >
          <Play className="h-5 w-5" /> Start
        </Button>
      ) : null}
      {lifecycle === "recording" ? (
        <Button
          size="lg"
          variant="outline"
          disabled={recording.busy || recording.savingCommand || recording.durabilityFenced}
          onClick={recording.pause}
        >
          <Pause className="h-5 w-5" /> Pause
        </Button>
      ) : null}
      {lifecycle === "paused" && !recording.hasRecoveredDraft ? (
        <Button
          size="lg"
          disabled={
            recording.hydrationStatus !== "ready" ||
            recording.busy ||
            recording.savingCommand ||
            recording.durabilityFenced
          }
          onClick={recording.resume}
        >
          <Play className="h-5 w-5" /> Resume
        </Button>
      ) : null}
      {lifecycle === "recording" || lifecycle === "paused" ? (
        <>
          <Button
            size="lg"
            variant="outline"
            disabled={recording.busy || recording.savingCommand || recording.durabilityFenced}
            onClick={recording.lap}
          >
            <Flag className="h-5 w-5" /> Lap
          </Button>
          <Button
            size="lg"
            variant="destructive"
            disabled={recording.busy || recording.savingCommand || recording.durabilityFenced}
            onClick={recording.finish}
          >
            <Square className="h-5 w-5" /> {recording.busy ? "Finishing…" : "Finish"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            disabled={recording.busy || recording.savingCommand}
            onClick={() => setIsConfirmingCancel(true)}
          >
            Cancel recording
          </Button>
        </>
      ) : null}
    </fieldset>
  );
  const stepCommands =
    lifecycle === "recording" || lifecycle === "paused" ? (
      <div className="mt-3 flex flex-wrap gap-2">
        {currentOccurrence ? (
          <Button
            size="sm"
            aria-label="Complete / Next"
            disabled={recording.busy || recording.durabilityFenced || recording.savingCommand}
            onClick={recording.completeStep}
          >
            <SkipForward className="h-4 w-4" /> Next
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={
            recording.durabilityFenced ||
            recording.busy ||
            recording.savingCommand ||
            (planStatus?.currentOccurrenceIndex ?? planStatus?.totalOccurrences ?? 0) <= 0
          }
          onClick={recording.previousStep}
        >
          <StepBack className="h-4 w-4" /> Previous
        </Button>
        {currentOccurrence ? (
          <Button
            size="sm"
            aria-label="Skip step"
            variant="outline"
            disabled={recording.busy || recording.durabilityFenced || recording.savingCommand}
            onClick={recording.skipStep}
          >
            Skip
          </Button>
        ) : null}
      </div>
    ) : null;

  useEffect(() => {
    if (
      recording.hydrationStatus !== "ready" ||
      configuration ||
      snapshot ||
      lifecycle !== "pending"
    )
      return;
    const detail = chosenPlanQuery.data?.detail;
    if (search.plannedSessionId) {
      if (!plannedSession || plannedLaunchAttempt.current === plannedSession.id) return;
      plannedLaunchAttempt.current = plannedSession.id;
      void recordingLaunch
        .mutateAsync({ id: plannedSession.id })
        .then((launch) => {
          if (recording.state.configuration || recording.state.reducer.snapshot) return;
          const manifest = launch.prescription.resolutionManifest;
          recording.configure({
            activity_category: manifest.resolved_structure.activity_category,
            activityPlanId: manifest.activity_plan_id,
            plan: {
              activityPlanId: manifest.activity_plan_id,
              scheduledEventId: null,
              name: `Scheduled ${manifest.resolved_structure.activity_category} session`,
              description: null,
              activityPlanRevision: manifest.activity_plan_revision,
              structureHash: manifest.resolved_structure_hash,
              structure: manifest.resolved_structure,
              plannedSession: launch,
            },
            ...(search.routeId ? { routeId: search.routeId } : {}),
          });
        })
        .catch(() => {
          plannedLaunchAttempt.current = null;
          setGuidanceError("The current activity plan could not be captured for recording. Retry.");
        });
      return;
    }
    if (
      search.activityPlanId &&
      (!detail || !detail.capabilities.canRecord || !detail.structure || !detail.structureHash)
    )
      return;
    recording.configure({
      activity_category: detail?.activityCategory ?? search.activity_category,
      ...(detail?.capabilities.canRecord && detail.structure && detail.structureHash
        ? {
            activityPlanId: detail.id,
            plan: {
              activityPlanId: detail.id,
              scheduledEventId: null,
              name: detail.name,
              description: detail.description,
              activityPlanRevision: detail.activityPlanRevision,
              structureHash: detail.structureHash,
              structure: detail.structure,
            },
          }
        : {}),
      ...(search.routeId ? { routeId: search.routeId } : {}),
    });
  }, [
    chosenPlanQuery.data?.detail,
    configuration,
    lifecycle,
    plannedSession,
    recording,
    recordingLaunch,
    search,
    snapshot,
  ]);

  const applyPlan = async () => {
    const detail = chosenPlanQuery.data?.detail;
    if (
      !planChoiceId ||
      detail?.id !== planChoiceId ||
      !detail.capabilities.canRecord ||
      !detail.structure ||
      !detail.structureHash
    ) {
      setGuidanceError("Choose a recordable plan after its details finish loading.");
      return;
    }
    setGuidanceError(null);
    const changed = await recording.changePlan({
      activityPlanId: detail.id,
      scheduledEventId: null,
      name: detail.name,
      description: detail.description,
      activityPlanRevision: detail.activityPlanRevision,
      structureHash: detail.structureHash,
      structure: detail.structure,
    });
    if (changed) setPlanChoiceId(null);
    else setGuidanceError("The plan was not saved. It remains selected so you can retry.");
  };

  const applyGuidanceChange = async (change: () => Promise<boolean>, failureMessage: string) => {
    setGuidanceError(null);
    if (!(await change())) setGuidanceError(failureMessage);
  };

  useEffect(() => {
    if (!recording.artifact) {
      loadedReview.current = null;
      return;
    }
    const { review, recordingSessionId } = recording.artifact;
    const previous = loadedReview.current;
    const next = {
      state: recording.state,
      sessionId: recordingSessionId,
      notes: review.notes ?? "",
      perceivedEffort: review.perceivedEffort?.toString() ?? "",
      distanceMeters:
        (review.distanceEnteredManually ?? review.distanceMeters > 0)
          ? review.distanceMeters.toString()
          : "",
      calories: review.calories?.toString() ?? "",
    };
    // Queue refreshes replace artifacts, but only an explicit load replaces the
    // finished runtime state. Preserve edits until that load or a different session.
    const reset = previous?.sessionId !== next.sessionId || previous?.state !== next.state;
    setNotes((value) => (reset || value === previous?.notes ? next.notes : value));
    setPerceivedEffort((value) =>
      reset || value === previous?.perceivedEffort ? next.perceivedEffort : value,
    );
    setDistanceMeters((value) =>
      reset || value === previous?.distanceMeters ? next.distanceMeters : value,
    );
    setCalories((value) => (reset || value === previous?.calories ? next.calories : value));
    if (reset) setReviewError(null);
    loadedReview.current = next;
  }, [recording.artifact, recording.state]);

  useEffect(() => {
    setIngestionId(recording.submissionJob?.ingestionId ?? null);
  }, [recording.submissionJob?.ingestionId]);

  const submit = useCallback<SubmitWebRecording>(
    async (artifact: NonNullable<typeof recording.artifact>, progress) => {
      assertOnlineRecordingSubmission(navigator.onLine);
      const file = new File([artifact.fileText], artifact.fileName, {
        type: "application/vnd.garmin.tcx+xml",
      });
      const uploadClaim = await beginRecordingUpload.mutateAsync({
        recordingSessionId: artifact.recordingSessionId,
        byteSize: file.size,
        sha256: artifact.sha256,
        format: "tcx",
      });
      await progress.ingestionClaimed(uploadClaim.ingestionId);
      setIngestionId(uploadClaim.ingestionId);
      if (uploadClaim.status === "upload") {
        await uploadFileToSignedUrl(file, uploadClaim.signedUrl);
      }
      return submitWebRecordingArtifact({
        artifact,
        createActivity: () =>
          uploadClaim.status === "ready"
            ? Promise.resolve({ id: uploadClaim.activityId })
            : createActivity.mutateAsync(
                buildUploadedRecordingSummaryInput(artifact, {
                  ingestionId: uploadClaim.ingestionId,
                }),
              ),
        recordSessionRpe: ({ activityId, operationId, rpe }) =>
          recordSessionRpe.mutateAsync({
            activity_id: activityId,
            operation_id: operationId,
            rpe,
            scale: "borg_cr10",
            scale_version: "1",
            source: "user",
          }),
      });
    },
    [beginRecordingUpload, createActivity, recordSessionRpe],
  );

  useEffect(() => {
    if (
      recording.submissionJob?.status !== "queued" &&
      recording.submissionJob?.status !== "submitting"
    )
      return;
    void recording.drainSubmissionQueue(submit);
  }, [recording.drainSubmissionQueue, recording.submissionJob?.status, submit]);

  useEffect(() => {
    const drain = () => void recording.drainSubmissionQueue(submit);
    window.addEventListener("online", drain);
    const interval = window.setInterval(drain, 30_000);
    return () => {
      window.removeEventListener("online", drain);
      window.clearInterval(interval);
    };
  }, [recording.drainSubmissionQueue, submit]);

  if (recording.hydrationStatus === "hydrating") {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <Card>
          <CardHeader>
            <CardTitle>Checking for a saved timer</CardTitle>
            <CardDescription>
              The timer will remain stopped while this browser checks for a recoverable recording.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!configuration) {
    return (
      <div className="mx-auto max-w-2xl py-4">
        <Card>
          <CardHeader>
            <CardTitle>Preparing your recorder</CardTitle>
            <CardDescription>Setting up a free timer session locally.</CardDescription>
          </CardHeader>
          <CardContent>
            {recording.error ? (
              <p className="mb-4 text-sm text-destructive" role="alert">
                {recording.error}
              </p>
            ) : null}
            {recording.canTakeOver ? (
              <Button
                className="mb-4"
                variant="destructive"
                onClick={() => void recording.takeOver()}
              >
                Take over recording
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto flex w-full flex-col gap-4 py-4 ${lifecycle === "finished" ? "max-w-3xl" : "max-w-7xl"}`}
    >
      <Card>
        <CardHeader className="gap-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle role="heading" aria-level={1} className="flex items-center gap-2 text-xl">
              <Timer className="h-5 w-5" />
              {snapshot?.activity.activity_category ?? configuration.activity_category} session
            </CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">Indoor recording</Badge>
              <Badge>{lifecycleLabel(lifecycle)}</Badge>
            </div>
          </div>
          <CardDescription className="hidden sm:block">
            Foreground recording · Changes save locally · No live GPS
          </CardDescription>
          {lifecycle === "pending" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                className="font-medium underline underline-offset-4"
                to="/record/simulate"
                search={{
                  activity_category: configuration.activity_category,
                  gps: "off",
                  ...(configuration.activityPlanId
                    ? { activityPlanId: configuration.activityPlanId }
                    : {}),
                  ...(currentRouteId ? { routeId: currentRouteId } : {}),
                  ...(configuration.plan?.plannedSession
                    ? {
                        plannedSessionId: configuration.plan.plannedSession.id,
                        plannedSessionDate: search.plannedSessionDate,
                      }
                    : {}),
                }}
              >
                Try simulation
              </Link>
              <span className="text-muted-foreground">
                Generated guidance only; never saves an activity.
              </span>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          {recording.hasRecoveredDraft ? (
            <div className="space-y-3 rounded-lg border border-primary/40 p-4 text-left">
              <div>
                <p className="font-medium">Recovered safely in paused state</p>
                <p className="text-sm text-muted-foreground">
                  Review the restored times, then resume explicitly or discard this recording.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={
                    recording.hydrationStatus !== "ready" ||
                    recording.busy ||
                    recording.durabilityFenced
                  }
                  onClick={recording.resume}
                >
                  <Play className="h-4 w-4" /> Resume
                </Button>
                <Button variant="outline" onClick={() => setIsConfirmingCancel(true)}>
                  <Trash2 className="h-4 w-4" /> Cancel recording
                </Button>
              </div>
            </div>
          ) : null}
          {lifecycle !== "finished" ? (
            <RecordingCockpit
              key={planSnapshot?.activityPlanId ?? "free"}
              controls={recordingControls}
              currentOccurrenceId={cockpitOccurrence?.occurrenceId ?? null}
              currentStep={
                cockpitOccurrence
                  ? occurrenceLabel(planSnapshot?.structure, cockpitOccurrence)
                  : planSnapshot
                    ? "Plan preview unavailable"
                    : "Free activity"
              }
              elapsedSeconds={recording.elapsedSeconds}
              lifecycle={lifecycleLabel(lifecycle)}
              nextStep={
                nextPreviewOccurrence
                  ? occurrenceLabel(planSnapshot?.structure, nextPreviewOccurrence)
                  : null
              }
              onOpenDevices={() => setDevicesOpen(true)}
              onOpenGuidance={() => setGuidanceOpen(true)}
              plan={
                planSnapshot ? { name: planSnapshot.name, structure: planSnapshot.structure } : null
              }
              route={
                currentRouteId
                  ? {
                      name: selectedRouteQuery.data?.name ?? "Attached route",
                      totalDistance:
                        liveRouteFullQuery.data?.totalDistance ??
                        selectedRouteQuery.data?.total_distance ??
                        null,
                      totalAscent:
                        liveRouteFullQuery.data?.totalAscent ??
                        selectedRouteQuery.data?.total_ascent ??
                        null,
                      coordinates: liveRouteFullQuery.data?.coordinates ?? previewRouteCoordinates,
                      source: liveRouteFullQuery.data
                        ? "full"
                        : previewRouteCoordinates.length
                          ? "preview"
                          : "none",
                      loading: liveRouteFullQuery.isLoading && !previewRouteCoordinates.length,
                      error: liveRouteFullQuery.isError,
                      onRetry: () => void liveRouteFullQuery.refetch(),
                    }
                  : null
              }
              stepCommands={stepCommands}
              stepElapsed={currentOccurrence ? (planStatus?.currentStepElapsedSeconds ?? 0) : null}
              stepPosition={
                planStatus
                  ? currentOccurrence && planStatus.currentOccurrenceIndex !== null
                    ? `Step ${planStatus.currentOccurrenceIndex + 1} of ${planStatus.totalOccurrences}`
                    : `${planStatus.processedCount} of ${planStatus.totalOccurrences} processed`
                  : "Ready"
              }
              stepRemaining={
                currentOccurrence ? (planStatus?.currentStepRemainingSeconds ?? null) : null
              }
              telemetry={{
                status: recording.sensors.state.status,
                metrics: {
                  heartRateBpm: recording.sensors.state.metrics.heartRateBpm,
                  powerWatts: recording.sensors.state.metrics.powerWatts,
                  cadenceRpm: recording.sensors.state.metrics.cadenceRpm,
                  speedKph: recording.sensors.state.metrics.speedKph,
                },
              }}
              targetLabels={currentTargetLabels}
            />
          ) : null}

          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              Elapsed time is shown in the cockpit. Active time excludes pauses, so compare it with
              elapsed time to see paused time.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <TimeStat label="Active time" seconds={recording.activeSeconds} />
              {planStatus ? (
                <TimeStat label="Current lap" seconds={planStatus.currentLapElapsedSeconds} />
              ) : null}
              {currentOccurrence ? (
                <TimeStat
                  label="Current step"
                  seconds={planStatus?.currentStepElapsedSeconds ?? 0}
                />
              ) : null}
            </div>
          </div>

          {lifecycle !== "finished" ? (
            <details
              className="rounded-xl border p-4 text-left"
              onToggle={(event) => setGuidanceOpen(event.currentTarget.open)}
              open={guidanceOpen}
            >
              <summary className="cursor-pointer font-semibold">Plan & route setup</summary>
              <section className="mt-4 space-y-3" aria-labelledby="guidance-heading">
                <div>
                  <h2 id="guidance-heading" className="font-semibold">
                    Live guidance
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Plans, routes, and session intensity can change without resetting the timer,
                    laps, or measured samples.
                  </p>
                </div>
                {lifecycle === "pending" ? (
                  <fieldset className="flex flex-wrap gap-2" aria-label="Activity category">
                    {recordingActivityOptions.map((option) => (
                      <Button
                        key={option.value}
                        size="sm"
                        type="button"
                        variant={
                          configuration.activity_category === option.value ? "default" : "outline"
                        }
                        onClick={() =>
                          recording.configure({
                            activity_category: option.value,
                            ...(configuration.routeId ? { routeId: configuration.routeId } : {}),
                          })
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </fieldset>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Activity category is fixed after starting.
                  </p>
                )}
                <p className="text-sm">
                  {currentPlan ? `Current plan: ${currentPlan.name}` : "No plan guidance attached."}
                </p>
                <SearchField
                  accessibilityLabel="Search activity plans"
                  name="recording-plan-search"
                  value={planSearch}
                  onValueChange={setPlanSearch}
                  placeholder="Find an activity plan"
                  maxLength={80}
                  loading={plansQuery.isFetching}
                  loadingLabel="Loading activity plans"
                />
                {plansQuery.isError ? (
                  <div className="text-sm text-destructive" role="alert">
                    Plans could not load. You can still start a free session and retry this list.
                    <Button size="sm" variant="outline" onClick={() => void plansQuery.refetch()}>
                      Retry plans
                    </Button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {visiblePlans.map((plan) => (
                    <Button
                      key={plan.id}
                      className="max-w-full h-auto whitespace-normal break-words text-left"
                      size="sm"
                      type="button"
                      variant="outline"
                      disabled={
                        !plan.capabilities.canRecord ||
                        recording.savingCommand ||
                        lifecycle === "finishing"
                      }
                      onClick={() => setPlanChoiceId(plan.id)}
                    >
                      {plan.name}
                    </Button>
                  ))}
                  {plansQuery.hasNextPage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={plansQuery.isFetchingNextPage}
                      onClick={() => void plansQuery.fetchNextPage()}
                    >
                      {plansQuery.isFetchingNextPage ? "Loading…" : "More plans"}
                    </Button>
                  ) : null}
                </div>
                {planChoiceId ? (
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2"
                    aria-live="polite"
                  >
                    <span className="text-sm">
                      {chosenPlanQuery.isLoading
                        ? "Loading plan…"
                        : chosenPlanQuery.isError
                          ? "Could not load this plan."
                          : chosenPlanQuery.data?.detail?.id === planChoiceId
                            ? chosenPlanQuery.data.detail.name
                            : "Plan unavailable"}
                    </span>
                    <Button
                      size="sm"
                      disabled={
                        chosenPlanQuery.isLoading ||
                        chosenPlanQuery.data?.detail?.id !== planChoiceId ||
                        !chosenPlanQuery.data?.detail?.capabilities.canRecord ||
                        recording.savingCommand
                      }
                      onClick={() => void applyPlan()}
                    >
                      Attach / replace
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPlanChoiceId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
                {currentPlan ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={recording.savingCommand || lifecycle === "finishing"}
                    onClick={() =>
                      void applyGuidanceChange(
                        () => recording.changePlan(null),
                        "The plan was not saved. Try again.",
                      )
                    }
                  >
                    Detach plan
                  </Button>
                ) : null}
                <fieldset className="flex flex-wrap gap-2" aria-label="Route guidance">
                  <Button
                    size="sm"
                    variant={currentRouteId ? "outline" : "default"}
                    disabled={recording.savingCommand || lifecycle === "finishing"}
                    onClick={() =>
                      void applyGuidanceChange(
                        () => recording.changeRoute(null),
                        "The route was not saved. Try again.",
                      )
                    }
                  >
                    No route
                  </Button>
                  {visibleRoutes.map((route) => (
                    <Button
                      key={route.id}
                      className="max-w-full h-auto whitespace-normal break-words text-left"
                      size="sm"
                      variant={route.id === currentRouteId ? "default" : "outline"}
                      disabled={recording.savingCommand || lifecycle === "finishing"}
                      onClick={() =>
                        void applyGuidanceChange(
                          () => recording.changeRoute(route.id),
                          "The route was not saved. Try again.",
                        )
                      }
                    >
                      {route.name}
                    </Button>
                  ))}
                  {routesQuery.hasNextPage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={routesQuery.isFetchingNextPage}
                      onClick={() => void routesQuery.fetchNextPage()}
                    >
                      {routesQuery.isFetchingNextPage ? "Loading…" : "More routes"}
                    </Button>
                  ) : null}
                </fieldset>
                {currentPlan ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm" htmlFor="session-intensity">
                        Intensity %
                      </label>
                      <Input
                        id="session-intensity"
                        className="w-20"
                        min="50"
                        max="150"
                        step="5"
                        type="number"
                        value={intensityDraft}
                        disabled={
                          !supportsIntensity || recording.savingCommand || lifecycle === "finishing"
                        }
                        onChange={(event) => setIntensityDraft(event.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !supportsIntensity ||
                          recording.savingCommand ||
                          lifecycle === "finishing" ||
                          !intensityDraft.trim() ||
                          !Number.isFinite(Number(intensityDraft)) ||
                          Number(intensityDraft) < 50 ||
                          Number(intensityDraft) > 150
                        }
                        onClick={() =>
                          void applyGuidanceChange(
                            () => recording.adjustIntensity(Number(intensityDraft) / 100),
                            "The intensity was not saved. Enter a value from 50% to 150% and try again.",
                          )
                        }
                      >
                        Apply intensity
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {supportsIntensity
                        ? "50–150% of authored relative-power guidance. This does not change measured performance or send a trainer command."
                        : "Intensity scaling is available for relative cycling-power targets; other authored targets stay unchanged."}
                    </p>
                  </div>
                ) : null}
                {guidanceError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {guidanceError}
                  </p>
                ) : null}
                {recording.savingCommand ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Saving guidance locally…
                  </p>
                ) : null}
              </section>
            </details>
          ) : null}

          {lifecycle !== "finished" ? (
            <details
              className="rounded-xl border p-4 text-left"
              onToggle={(event) => setDevicesOpen(event.currentTarget.open)}
              open={devicesOpen}
            >
              <summary className="cursor-pointer font-semibold">Devices & trainer</summary>
              <section className="mt-4 space-y-3" aria-labelledby="sensor-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="sensor-heading" className="flex items-center gap-2 font-semibold">
                      <Bluetooth className="h-4 w-4" /> Bluetooth sensors
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {sensorStatusLabel(recording.sensors.state)} Foreground use only; this tab
                      disconnects sensors when hidden.
                    </p>
                  </div>
                  {recording.sensors.state.supported ? (
                    recording.sensors.state.status === "connected" ? (
                      <Button variant="outline" onClick={recording.sensors.disconnect}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        disabled={
                          recording.sensors.state.status === "connecting" || !trainerCommandsAllowed
                        }
                        onClick={() => void recording.sensors.connect()}
                      >
                        {recording.sensors.state.status === "connecting"
                          ? "Connecting…"
                          : "Choose compatible device"}
                      </Button>
                    )
                  ) : null}
                </div>
                {recording.sensors.state.status === "connected" ? (
                  <>
                    <fieldset
                      aria-label="Live sensor metrics"
                      className="m-0 grid grid-cols-2 gap-2 border-0 p-0 text-sm sm:grid-cols-3"
                    >
                      <legend className="sr-only">Live sensor metrics</legend>
                      <Metric
                        label="Heart rate"
                        value={recording.sensors.state.metrics.heartRateBpm}
                        unit="bpm"
                      />
                      <Metric
                        label="Cadence"
                        value={recording.sensors.state.metrics.cadenceRpm}
                        unit="rpm"
                      />
                      <Metric
                        label="Power"
                        value={recording.sensors.state.metrics.powerWatts}
                        unit="W"
                      />
                      <Metric
                        label="Speed"
                        value={recording.sensors.state.metrics.speedKph}
                        unit="km/h"
                      />
                      <Metric
                        label="Distance"
                        value={recording.sensors.state.metrics.distanceMeters}
                        unit="m"
                      />
                      <Metric
                        label="Calories"
                        value={recording.sensors.state.metrics.calories}
                        unit="kcal"
                      />
                    </fieldset>
                    {recording.sensors.state.controlEligible && trainerCommandsAllowed ? (
                      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/30 p-3">
                        <p className="basis-full text-sm font-medium">Trainer control</p>
                        {!recording.sensors.state.controlGranted ? (
                          <Button
                            variant="outline"
                            onClick={() => void recording.sensors.requestControl()}
                          >
                            Enable trainer control
                          </Button>
                        ) : recording.sensors.state.targetPowerSupported ? (
                          <>
                            <Button
                              aria-label="Decrease trainer target power"
                              disabled={
                                parseTrainerTargetPower(targetPower) === null ||
                                Number(targetPower) <= 0
                              }
                              onClick={() => adjustTrainerTargetPower(-1)}
                              type="button"
                              variant="outline"
                            >
                              -5 W
                            </Button>
                            <label className="grid gap-1 text-sm" htmlFor="trainer-target-power">
                              <span>Target power (W)</span>
                              <Input
                                aria-describedby={
                                  targetPowerError ? "trainer-target-power-error" : undefined
                                }
                                aria-invalid={Boolean(targetPowerError)}
                                id="trainer-target-power"
                                min={0}
                                type="number"
                                value={targetPower}
                                onChange={(event) => {
                                  setTargetPower(event.target.value);
                                  setTargetPowerError(null);
                                }}
                              />
                              {targetPowerError ? (
                                <span
                                  className="text-sm text-destructive"
                                  id="trainer-target-power-error"
                                  role="alert"
                                >
                                  {targetPowerError}
                                </span>
                              ) : null}
                            </label>
                            <Button
                              aria-label="Increase trainer target power"
                              disabled={parseTrainerTargetPower(targetPower) === null}
                              onClick={() => adjustTrainerTargetPower(1)}
                              type="button"
                              variant="outline"
                            >
                              +5 W
                            </Button>
                            <Button
                              disabled={targetPower.trim() === ""}
                              onClick={setTrainerTargetPower}
                            >
                              Set power
                            </Button>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            This trainer does not advertise FTMS target-power support.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {recording.sensors.state.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {recording.sensors.state.error}
                  </p>
                ) : null}
              </section>
            </details>
          ) : null}

          {planSnapshot && planStatus && lifecycle === "finishing" ? (
            <section className="space-y-4 rounded-xl border p-4 text-left">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{planSnapshot.name}</p>
                  <h2 className="text-xl font-semibold">
                    {currentOccurrence
                      ? occurrenceLabel(planSnapshot.structure, currentOccurrence)
                      : "Plan steps complete"}
                  </h2>
                </div>
                <Badge variant="outline">
                  {currentOccurrence && planStatus.currentOccurrenceIndex !== null
                    ? `Step ${planStatus.currentOccurrenceIndex + 1} of ${planStatus.totalOccurrences}`
                    : `${planStatus.processedCount} of ${planStatus.totalOccurrences} processed`}
                </Badge>
              </div>
              {currentOccurrence ? (
                <div className="space-y-2 text-sm">
                  <p>{durationGuidance(currentOccurrence.duration)}</p>
                  {planStatus.currentStepRemainingSeconds !== null ? (
                    <p>Remaining: {formatTimer(planStatus.currentStepRemainingSeconds)}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      This step waits for you to complete or skip it.
                    </p>
                  )}
                  <p className="font-medium">Target guidance</p>
                  <p className="text-muted-foreground">
                    {currentTargetLabels.join(" · ") || "No authored target guidance"}
                  </p>
                  <p className="text-muted-foreground">
                    Next:{" "}
                    {planStatus.nextOccurrence
                      ? occurrenceLabel(planSnapshot.structure, planStatus.nextOccurrence)
                      : "Finish or review"}
                  </p>
                </div>
              ) : null}
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                aria-label={`${planStatus.processedCount} of ${planStatus.totalOccurrences} plan steps processed`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={planStatus.totalOccurrences}
                aria-valuenow={planStatus.processedCount}
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${planStatus.totalOccurrences ? (planStatus.processedCount / planStatus.totalOccurrences) * 100 : 100}%`,
                  }}
                />
              </div>
              {lifecycle !== "finishing" ? (
                <div className="flex flex-wrap gap-2">
                  {currentOccurrence ? (
                    <Button disabled={recording.durabilityFenced} onClick={recording.completeStep}>
                      <SkipForward className="h-4 w-4" /> Complete / Next
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={
                      recording.durabilityFenced ||
                      (planStatus.currentOccurrenceIndex ?? planStatus.totalOccurrences) <= 0
                    }
                    onClick={recording.previousStep}
                  >
                    <StepBack className="h-4 w-4" /> Previous
                  </Button>
                  {currentOccurrence ? (
                    <Button
                      variant="outline"
                      disabled={recording.durabilityFenced}
                      onClick={recording.skipStep}
                    >
                      Skip step
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {isConfirmingCancel && (lifecycle === "recording" || lifecycle === "paused") ? (
            <div
              className="space-y-3 rounded-lg border border-destructive/40 p-4 text-left"
              role="alert"
            >
              <div>
                <p className="font-medium">Discard this recording?</p>
                <p className="text-sm text-muted-foreground">
                  This removes the locally saved timer and any unsaved recording progress.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setIsConfirmingCancel(false)}>
                  Keep recording
                </Button>
                <Button
                  variant="destructive"
                  disabled={recording.busy || recording.savingCommand}
                  onClick={async () => {
                    await recording.cancel({ confirmed: true });
                    setIsConfirmingCancel(false);
                  }}
                >
                  Discard recording
                </Button>
              </div>
            </div>
          ) : null}

          {recording.savingCommand ? (
            <p className="text-center text-sm text-muted-foreground">
              Saving recorder command locally…
            </p>
          ) : null}
          {recording.durabilityFenced ? (
            <div className="space-y-3 rounded-lg border border-destructive/40 p-4 text-left">
              <div>
                <p className="font-medium">Local saving needs attention</p>
                <p className="text-sm text-muted-foreground">
                  The recorder returned to its last saved checkpoint and stopped progressing. Retry
                  local saving before you continue.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={recording.savingCommand}
                  onClick={() => void recording.retryDurableStorage()}
                >
                  Retry local saving
                </Button>
                {recording.canTakeOver ? (
                  <Button variant="destructive" onClick={() => void recording.takeOver()}>
                    Take over this recording
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {recording.backgroundPaused ? (
            <p className="rounded-lg border border-amber-500/40 p-3 text-sm">
              This recording paused when the tab moved to the background. Active time and timed
              steps remain frozen until you explicitly Resume.
            </p>
          ) : null}
          {recording.statusMessage ? (
            <p className="sr-only" role="status">
              {recording.statusMessage}
            </p>
          ) : null}

          {recording.error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {recording.error}
            </p>
          ) : null}

          {lifecycle === "finished" && recording.artifact ? (
            <section
              className="space-y-4 rounded-xl border p-4 text-left"
              aria-labelledby="record-review-heading"
            >
              <div>
                <h2 id="record-review-heading" className="text-lg font-semibold">
                  Review recording
                </h2>
                <p className="text-sm text-muted-foreground">
                  The finished artifact is durable locally. Save queues an idempotent server
                  submission.
                </p>
              </div>
              <div className="grid gap-3 rounded-lg bg-muted/30 p-3 text-sm sm:grid-cols-2">
                <p>
                  Duration:{" "}
                  <span className="font-medium">
                    {formatTimer(Math.floor(recording.artifact.elapsedMs / 1_000))}
                  </span>
                </p>
                <p>
                  Active time:{" "}
                  <span className="font-medium">
                    {formatTimer(Math.floor(recording.artifact.movingMs / 1_000))}
                  </span>
                </p>
                <p>
                  Plan association:{" "}
                  <span className="font-medium">
                    {reviewPrimaryPlan?.name ?? "Free indoor activity"}
                  </span>
                </p>
                <p>
                  Category:{" "}
                  <span className="font-medium">
                    {recording.artifact.snapshot.activity.activity_category}
                  </span>
                </p>
                {reviewPrimaryRouteId && selectedRouteQuery.data ? (
                  <p>
                    Route association:{" "}
                    <Link
                      className="font-medium underline underline-offset-4"
                      params={{ routeId: reviewPrimaryRouteId }}
                      to="/routes/$routeId"
                    >
                      {selectedRouteQuery.data.name}
                    </Link>
                  </p>
                ) : null}
                {recording.artifact.planExecution && recording.artifact.snapshot.planExecution ? (
                  <>
                    <p>
                      Completed steps:{" "}
                      <span className="font-medium">
                        {recording.artifact.planExecution.completedOccurrenceIds.length}
                      </span>
                    </p>
                    <p>
                      Skipped steps:{" "}
                      <span className="font-medium">
                        {recording.artifact.planExecution.skippedOccurrenceIds.length}
                      </span>
                    </p>
                    <p>
                      Remaining steps:{" "}
                      <span className="font-medium">
                        {Math.max(
                          0,
                          compileOccurrenceCount(
                            recording.artifact.snapshot.planExecution.structure,
                          ) -
                            recording.artifact.planExecution.completedOccurrenceIds.length -
                            recording.artifact.planExecution.skippedOccurrenceIds.length,
                        )}
                      </span>
                    </p>
                    <p>
                      Laps:{" "}
                      <span className="font-medium">
                        {recording.artifact.planExecution.laps.length}
                      </span>
                    </p>
                  </>
                ) : null}
                <p className="text-muted-foreground sm:col-span-2">
                  Target adherence is unavailable because a timer does not prove heart rate, power,
                  pace, cadence, or other target execution.
                </p>
              </div>
              {recording.artifact.planExecution?.laps.length ? (
                <ol className="space-y-1 text-sm" aria-label="Lap history">
                  {recording.artifact.planExecution.laps.map((lap, index, laps) => (
                    <li key={lap.lapNumber}>
                      Lap {lap.lapNumber}:{" "}
                      {formatTimer(
                        Math.floor((lap.elapsedMs - (laps[index - 1]?.elapsedMs ?? 0)) / 1_000),
                      )}{" "}
                      elapsed
                    </li>
                  ))}
                </ol>
              ) : null}
              <label className="grid gap-1 text-sm" htmlFor="recording-notes">
                <span className="font-medium">Notes</span>
                <Textarea
                  id="recording-notes"
                  value={notes}
                  maxLength={4000}
                  disabled={
                    hasSavedActivity ||
                    recording.busy ||
                    recording.submissionJob?.status === "submitting"
                  }
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm" htmlFor="recording-rpe">
                  <span className="font-medium">Perceived effort (1–10)</span>
                  <Input
                    id="recording-rpe"
                    type="number"
                    min={1}
                    max={10}
                    value={perceivedEffort}
                    disabled={
                      hasSavedActivity ||
                      recording.busy ||
                      recording.submissionJob?.status === "submitting"
                    }
                    onChange={(event) => setPerceivedEffort(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm" htmlFor="recording-distance">
                  <span className="font-medium">Manual distance (metres, optional)</span>
                  <Input
                    id="recording-distance"
                    type="number"
                    min={0}
                    step={1}
                    value={distanceMeters}
                    disabled={
                      hasSavedActivity ||
                      recording.busy ||
                      recording.submissionJob?.status === "submitting"
                    }
                    onChange={(event) => setDistanceMeters(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm" htmlFor="recording-calories">
                  <span className="font-medium">Manual calories (optional)</span>
                  <Input
                    id="recording-calories"
                    type="number"
                    min={0}
                    step={1}
                    value={calories}
                    disabled={
                      hasSavedActivity ||
                      recording.busy ||
                      recording.submissionJob?.status === "submitting"
                    }
                    onChange={(event) => setCalories(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={
                    recording.busy ||
                    recording.submissionJob?.status === "submitting" ||
                    hasSavedActivity
                  }
                  onClick={saveReview}
                >
                  <Save className="h-4 w-4" /> Save activity
                </Button>
                {reviewError ? (
                  <p className="basis-full text-sm text-destructive" role="alert">
                    {reviewError}
                  </p>
                ) : null}
                {hasSavedActivity ? (
                  <p className="basis-full text-sm text-muted-foreground">
                    This activity is saved. Edit activity details or correct Session RPE on its
                    detail page.
                  </p>
                ) : null}
                {recording.submissionJob?.status === "retry_wait" &&
                (!ingestionId || canRetryDirectIngestion(ingestionStatusQuery.data)) ? (
                  <Button variant="outline" onClick={() => void recording.retrySubmission()}>
                    Retry now
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  disabled={recording.busy || recording.submissionJob?.status === "submitted"}
                  onClick={() => void recording.discardFinalizedArtifact()}
                >
                  <Trash2 className="h-4 w-4" />
                  {recording.submissionJob?.status === "review_required"
                    ? "Discard local RPE retry"
                    : "Discard"}
                </Button>
              </div>
              {recording.submissionJob ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {submissionRecoveryLabel(recording.submissionJob)}
                </p>
              ) : null}
              {ingestionStatusQuery.data ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Server intake: {ingestionStatusQuery.data.status.replaceAll("_", " ")}
                  {"failureCode" in ingestionStatusQuery.data
                    ? ` (${ingestionStatusQuery.data.failureCode.replaceAll("_", " ")})`
                    : ""}
                </p>
              ) : null}
              {recording.submissionJob?.activityId ? (
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link
                      to="/activities/$activityId"
                      params={{ activityId: recording.submissionJob.activityId }}
                    >
                      Open saved activity
                    </Link>
                  </Button>
                  <Button onClick={recording.reset}>Start a new recording</Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            This indoor recorder captures foreground elapsed and active time. It pauses active time
            and timed steps whenever the tab moves to the background. Attached routes are reference
            only; the browser does not record GPS, route progress, or inferred movement.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimeStat({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-mono text-3xl font-semibold tabular-nums">{formatTimer(seconds)}</p>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <p className="rounded border p-2">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value === null ? "—" : `${Math.round(value)} ${unit}`}</span>
    </p>
  );
}

function sensorStatusLabel(
  state: ReturnType<typeof useTimerOnlyRecording>["sensors"]["state"],
): string {
  if (!state.supported) return "Web Bluetooth is unavailable in this browser.";
  if (state.status === "connected") return `Connected to ${state.deviceName ?? "sensor"}.`;
  if (state.status === "connecting") return "Choose a nearby compatible device.";
  if (state.status === "error") return "Sensor connection failed.";
  return "Choose an FTMS trainer, heart-rate monitor, or cycling-power sensor.";
}

function compileOccurrenceCount(structure: unknown): number {
  return compileActivityPlan(structure).occurrences.length;
}

function occurrenceLabel(structure: unknown, occurrence: CompiledActivityPlanOccurrence): string {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  if (!parsed.success) return "Plan step";
  const step = parsed.data.items
    .flatMap((item) => (item.type === "step" ? [item] : item.steps))
    .find((candidate) => candidate.id === occurrence.stepId);
  if (step) return step.name ?? "Plan step";
  return "Plan step";
}

function durationGuidance(duration: CompiledActivityPlanOccurrence["duration"]): string {
  if (duration.type === "time") return `${duration.seconds} seconds`;
  if (duration.type === "distance") return `${duration.meters} metres prescribed`;
  if (duration.type === "repetitions") return `${duration.count} repetitions prescribed`;
  return "Continue until finished";
}

function formatTimer(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function lifecycleLabel(lifecycle: string): string {
  if (lifecycle === "pending") return "Ready to start";
  if (lifecycle === "recording") return "Recording";
  if (lifecycle === "paused") return "Paused";
  if (lifecycle === "finished") return "Finished";
  return lifecycle;
}

function submissionLabel(status: string): string {
  if (status === "queued") return "queued locally";
  if (status === "submitting") return "submitting";
  if (status === "retry_wait") return "waiting to retry";
  if (status === "review_required") return "review required";
  if (status === "submitted") return "saved on server";
  return status;
}

export function submissionRecoveryLabel({
  activityId,
  lastError,
  status,
}: Pick<
  NonNullable<ReturnType<typeof useTimerOnlyRecording>["submissionJob"]>,
  "activityId" | "lastError" | "status"
>): string {
  if (status === "retry_wait" && activityId && lastError?.startsWith("session_rpe_")) {
    return lastError === "session_rpe_conflict"
      ? "Activity saved; Session RPE needs review"
      : "Activity saved; Session RPE is pending";
  }
  return `Submission: ${submissionLabel(status)}`;
}

export function isReviewFrozen(
  job: Pick<
    NonNullable<ReturnType<typeof useTimerOnlyRecording>["submissionJob"]>,
    "activityId"
  > | null,
): boolean {
  return Boolean(job?.activityId);
}

export function assertOnlineRecordingSubmission(isOnline: boolean): void {
  if (!isOnline) throw new TypeError("Network unavailable");
}
