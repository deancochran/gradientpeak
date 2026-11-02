import { usePlannedSessionMutations } from "@repo/api/react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Form, FormNumberField, FormTextareaField } from "@repo/ui/components/form";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { flushPendingFormDrafts, useZodForm } from "@repo/ui/hooks";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";

import { RouteFlashToast, type RouteFlashType } from "../../../../../components/route-flash-toast";
import { api } from "../../../../../lib/api/client";
import { contractEpochFormInputProps } from "../../../../../lib/contract-epoch";
import {
  formatDayLabel,
  formatEventTimeRange,
  getEventTitle,
  getEventTypeLabel,
  getMonthKey,
  isValidMonthKey,
} from "../../../../../lib/planning";
import { deleteCalendarEventAction } from "../../../../../lib/planning/server-actions";

function formatComparisonDuration(value: number | null) {
  if (value === null) return "Unknown";
  const minutes = Math.round(value / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatComparisonDistance(value: number | null) {
  if (value === null) return "Unknown";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

const actualDetailsSchema = z.object({
  distanceMeters: z.number().finite().nonnegative().nullable(),
  durationMinutes: z.number().finite().nonnegative().nullable(),
  notes: z.string().max(10_000).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
});

export const Route = createFileRoute("/_protected/calendar/events/$eventId/")({
  validateSearch: (search: Record<string, unknown>) => {
    if ("resourceType" in search && search.resourceType !== "planned_session") {
      throw new Error("Unsupported calendar resource type");
    }
    return {
      flash: typeof search.flash === "string" ? search.flash : undefined,
      flashType:
        search.flashType === "success" ||
        search.flashType === "error" ||
        search.flashType === "info"
          ? (search.flashType as RouteFlashType)
          : undefined,
      month:
        typeof search.month === "string" && isValidMonthKey(search.month)
          ? search.month
          : getMonthKey(new Date()),
      view: search.view === "agenda" || search.view === "week" ? search.view : "month",
      ...(search.resourceType === "planned_session" ? { resourceType: "planned_session" } : {}),
    };
  },
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { flash, flashType, month, resourceType, view } = Route.useSearch();
  const isPlannedSession = resourceType === "planned_session";
  const eventQuery = api.events.getById.useQuery(
    { id: eventId, personalize: false },
    { enabled: Boolean(eventId) && !isPlannedSession },
  );
  const plannedSessionQuery = api.plannedSessions.getById.useQuery(
    { id: eventId },
    { enabled: Boolean(eventId) && isPlannedSession },
  );
  const profileQuery = api.profiles.get.useQuery(undefined, { enabled: isPlannedSession });
  const plannedSession = plannedSessionQuery.data;
  const activityPlanId = plannedSession?.activityPlanId ?? "";
  const activityPlanQuery = api.activityPlans.getById.useQuery(
    { id: activityPlanId, personalize: false },
    { enabled: isPlannedSession && Boolean(activityPlanId) },
  );
  const utils = api.useUtils();
  const createManualDiaryEntry = api.activities.createManualDiaryEntry.useMutation({
    retry: false,
  });
  const skipPlannedSession = api.plannedSessions.skip.useMutation({ retry: false });
  const changePlanOnly = usePlannedSessionMutations({
    onConflict: () => plannedSessionQuery.refetch(),
  }).changePlanOnly;
  const linkPlannedSessionCompletion = api.plannedSessions.linkCompletion.useMutation({
    retry: false,
  });
  const [associationOpen, setAssociationOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const completionForm = useZodForm({
    defaultValues: { distanceMeters: null, durationMinutes: null, notes: null, rpe: null },
    schema: actualDetailsSchema,
  });
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionStatus, setCompletionStatus] = useState<string | null>(null);
  const [sessionEditError, setSessionEditError] = useState<string | null>(null);
  const [actualDetailsOpen, setActualDetailsOpen] = useState(false);
  const completionRequestRef = useRef<
    | {
        kind: "complete";
        input: Parameters<typeof createManualDiaryEntry.mutateAsync>[0];
      }
    | {
        kind: "skip";
        input: Parameters<typeof skipPlannedSession.mutateAsync>[0];
      }
    | {
        kind: "associate";
        input: Parameters<typeof linkPlannedSessionCompletion.mutateAsync>[0];
      }
    | null
  >(null);
  const completionInFlightRef = useRef(false);
  const event = eventQuery.data;
  const routeQuery = api.routes.get.useQuery(
    { id: event?.route_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(event?.route_id) },
  );
  const completionCandidatesQuery = api.plannedSessions.completionCandidates.useInfiniteQuery(
    { sessionId: eventId, limit: 20 },
    {
      enabled: isPlannedSession && associationOpen,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );
  if (isPlannedSession && plannedSessionQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading planned session...</p>;
  }

  if (!isPlannedSession && eventQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading event...</p>;
  }

  if (isPlannedSession && plannedSessionQuery.isError) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm">Planned session could not be loaded.</p>
        <Button variant="outline" onClick={() => void plannedSessionQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!isPlannedSession && eventQuery.isError) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm">Event could not be loaded.</p>
        <Button variant="outline" onClick={() => void eventQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (isPlannedSession && !plannedSession) {
    return <p className="text-sm text-muted-foreground">Planned session not found.</p>;
  }

  if (isPlannedSession && plannedSession) {
    const activityCategory = activityPlanQuery.data?.detail?.activityCategory;
    if (!activityCategory) {
      return (
        <div role="alert" className="space-y-3">
          <p className="text-sm">The current activity plan for this session is unavailable.</p>
          <Button variant="outline" onClick={() => void activityPlanQuery.refetch()}>
            Retry activity plan
          </Button>
        </div>
      );
    }
    const planningTimezone = profileQuery.data?.planning_timezone ?? null;
    const today = planningTimezone ? getDateKeyInTimeZone(planningTimezone) : null;
    const canComplete =
      plannedSession.lifecycle.status === "scheduled" &&
      today !== null &&
      plannedSession.planningDate <= today;
    const isCompletionPending = completionInFlightRef.current;
    const completedActivityId =
      plannedSession.lifecycle.status === "completed" &&
      plannedSession.lifecycle.completion.state === "linked"
        ? plannedSession.lifecycle.completion.activityId
        : null;
    const completedTitle = activityPlanQuery.data?.detail?.name ?? "Completed activity";
    const editThisSessionOnly = async () => {
      if (plannedSession.lifecycle.status !== "scheduled" || changePlanOnly.isPending) return;
      setSessionEditError(null);
      try {
        const receipt = await changePlanOnly.mutateAsync({
          expectedRevision: plannedSession.sessionRevision,
          profileId: plannedSession.profileId,
          sessionId: plannedSession.id,
        });
        await navigate({
          to: "/activity-plans/$activityPlanId",
          params: { activityPlanId: receipt.session.activityPlanId },
          search: { edit: true },
        });
      } catch (error) {
        setSessionEditError(
          error instanceof Error
            ? error.message
            : "This session could not be prepared for editing. Refresh and try again.",
        );
      }
    };

    const submitCompletion = async (outcome: "full" | "partial") => {
      if (!canComplete || !planningTimezone || completionInFlightRef.current) return;
      flushPendingFormDrafts(completionForm.control);
      if (!(await completionForm.trigger(undefined, { shouldFocus: true }))) {
        setCompletionError("Correct the actual details before completing this session.");
        return;
      }
      const { distanceMeters, durationMinutes, notes, rpe: effort } = completionForm.getValues();

      const existing = completionRequestRef.current;
      if (existing && existing.kind !== "complete") {
        setCompletionError(
          "Retry the saved request before choosing a different completion action.",
        );
        return;
      }
      if (
        existing?.kind === "complete" &&
        existing.input.plannedSession?.outcome !== undefined &&
        existing.input.plannedSession.outcome !== outcome
      ) {
        setCompletionError(
          "Retry the saved completion request before choosing a different action.",
        );
        return;
      }
      const input =
        existing?.kind === "complete"
          ? existing.input
          : {
              observation: {
                operationId: crypto.randomUUID(),
                diaryDate: plannedSession.planningDate,
                diaryTimezone: planningTimezone,
                name: completedTitle,
                activityCategory,
                ...(notes?.trim() ? { notes: notes.trim() } : {}),
                ...(durationMinutes !== null ? { elapsedMs: durationMinutes * 60_000 } : {}),
                ...(distanceMeters !== null ? { distanceMeters } : {}),
                ...(effort !== null ? { rpe: effort, rpeOperationId: crypto.randomUUID() } : {}),
              },
              plannedSession: {
                sessionId: plannedSession.id,
                expectedRevision: plannedSession.sessionRevision,
                outcome,
              },
            };
      completionRequestRef.current = { kind: "complete", input };
      completionInFlightRef.current = true;
      setCompletionError(null);
      setCompletionStatus(null);
      try {
        await createManualDiaryEntry.mutateAsync(input);
        completionRequestRef.current = null;
        setCompletionStatus("Activity completion saved.");
        await Promise.all([
          utils.plannedSessions.getById.invalidate({ id: plannedSession.id }),
          utils.calendar.invalidate(),
        ]);
      } catch (error) {
        setCompletionError(
          error instanceof Error
            ? error.message
            : "Completion could not be saved. Retry the same request.",
        );
      } finally {
        completionInFlightRef.current = false;
      }
    };

    const submitSkip = async () => {
      if (!canComplete || completionInFlightRef.current) return;
      const existing = completionRequestRef.current;
      if (existing?.kind === "complete") {
        setCompletionError(
          "Retry the saved completion request before choosing a different action.",
        );
        return;
      }
      const input =
        existing?.kind === "skip"
          ? existing.input
          : {
              profileId: plannedSession.profileId,
              sessionId: plannedSession.id,
              expectedRevision: plannedSession.sessionRevision,
              operationId: crypto.randomUUID(),
            };
      completionRequestRef.current = { kind: "skip", input };
      completionInFlightRef.current = true;
      setCompletionError(null);
      setCompletionStatus(null);
      try {
        await skipPlannedSession.mutateAsync(input);
        completionRequestRef.current = null;
        setCompletionStatus("Planned session skipped.");
        await Promise.all([
          utils.plannedSessions.getById.invalidate({ id: plannedSession.id }),
          utils.calendar.invalidate(),
        ]);
      } catch (error) {
        setCompletionError(
          error instanceof Error
            ? error.message
            : "Session could not be skipped. Retry the same request.",
        );
      } finally {
        completionInFlightRef.current = false;
      }
    };

    const completionCandidates =
      completionCandidatesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const selectedCandidate = completionCandidates.find((item) => item.id === selectedCandidateId);
    const submitAssociation = async () => {
      if (!selectedCandidate || completionInFlightRef.current) return;
      const existing = completionRequestRef.current;
      if (existing && existing.kind !== "associate") {
        setCompletionError(
          "Retry the saved completion request before choosing a different action.",
        );
        return;
      }
      const input =
        existing?.kind === "associate"
          ? existing.input
          : {
              profileId: plannedSession.profileId,
              sessionId: plannedSession.id,
              expectedRevision: plannedSession.sessionRevision,
              activityId: selectedCandidate.id,
              operationId: crypto.randomUUID(),
            };
      completionRequestRef.current = { kind: "associate", input };
      completionInFlightRef.current = true;
      setCompletionError(null);
      try {
        await linkPlannedSessionCompletion.mutateAsync(input);
        completionRequestRef.current = null;
        await Promise.all([
          utils.plannedSessions.getById.invalidate({ id: plannedSession.id }),
          utils.plannedSessions.completionCandidates.invalidate({ sessionId: plannedSession.id }),
          utils.calendar.invalidate(),
          utils.activities.invalidate(),
        ]);
      } catch (error) {
        setCompletionError(
          error instanceof Error
            ? error.message
            : "Association status is unknown. Retry the same request.",
        );
        await plannedSessionQuery.refetch();
      } finally {
        completionInFlightRef.current = false;
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link
                to="/calendar/day/$date"
                params={{ date: plannedSession.planningDate }}
                search={{ month, view }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to day
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-semibold tracking-tight">
                {activityPlanQuery.data?.detail?.name ?? `${activityCategory} session`}
              </h1>
              <p className="mt-1 text-muted-foreground">
                Planned for {formatDayLabel(plannedSession.planningDate)}
              </p>
            </div>
          </div>
          {canComplete ? (
            <Button asChild>
              <Link
                to="/record"
                search={{
                  activity_category: activityCategory,
                  gps: "off",
                  plannedSessionId: plannedSession.id,
                  plannedSessionDate: plannedSession.planningDate,
                }}
              >
                Record activity
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Planned activity</CardTitle>
              <CardDescription>
                Frozen prescription details for this scheduled session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{activityCategory}</Badge>
                <Badge variant="secondary">{plannedSession.lifecycle.status}</Badge>
              </div>
              <DetailRow label="Planning date" value={plannedSession.planningDate} />
              <DetailRow label="Session id" value={plannedSession.id} />
              <DetailRow
                label="Planned duration"
                value={formatComparisonDuration(
                  plannedSession.comparison?.planned.durationSeconds ?? null,
                )}
              />
              {plannedSession.comparison?.actual.state === "observed" ||
              plannedSession.comparison?.actual.state === "unknown" ? (
                <>
                  <DetailRow
                    label="Actual duration"
                    value={formatComparisonDuration(
                      plannedSession.comparison.actual.durationSeconds,
                    )}
                  />
                  <DetailRow
                    label="Actual distance"
                    value={formatComparisonDistance(
                      plannedSession.comparison.actual.distanceMeters,
                    )}
                  />
                </>
              ) : plannedSession.comparison?.actual.state === "not_performed" ? (
                <DetailRow label="Actual" value="Not performed" />
              ) : null}
              {completedActivityId ? (
                <DetailRow
                  label="Completed activity"
                  value="Linked activity available"
                  href={`/activities/${completedActivityId}`}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completion</CardTitle>
              <CardDescription>
                Record only what you know. Empty actual fields are not assumed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plannedSession.lifecycle.status === "scheduled" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={changePlanOnly.isPending}
                      onClick={() => void editThisSessionOnly()}
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {changePlanOnly.isPending ? "Preparing session..." : "Edit this session only"}
                    </Button>
                    <Button asChild type="button" variant="ghost">
                      <Link
                        to="/activity-plans/$activityPlanId"
                        params={{ activityPlanId: plannedSession.activityPlanId }}
                        search={{ edit: true }}
                      >
                        Edit plan for all sessions
                      </Link>
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Editing this session creates a private copy first. Editing the plan applies to
                    all future sessions that reference it.
                  </p>
                  {sessionEditError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {sessionEditError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {plannedSession.lifecycle.status === "scheduled" ? (
                <>
                  {!planningTimezone ? (
                    <p role="alert" className="text-sm text-destructive">
                      Set a planning timezone before recording this completion.
                    </p>
                  ) : null}
                  {planningTimezone && !canComplete ? (
                    <p className="text-sm text-muted-foreground">
                      Completion is available on or after the planned date in {planningTimezone}.
                    </p>
                  ) : null}
                  <Button
                    disabled={!canComplete || isCompletionPending}
                    onClick={() => setActualDetailsOpen((open) => !open)}
                    type="button"
                    variant="outline"
                  >
                    Actual details (optional)
                  </Button>
                  {actualDetailsOpen ||
                  Object.values(completionForm.watch()).some((value) => value !== null) ? (
                    <Form {...completionForm}>
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Leave fields blank when unknown. Planned values are never copied here.
                        </p>
                        <FormNumberField
                          clampOnBlur={false}
                          control={completionForm.control}
                          disabled={!canComplete || isCompletionPending}
                          emptyValue={null}
                          label="Actual duration (minutes, optional)"
                          min={0}
                          name="durationMinutes"
                        />
                        <FormNumberField
                          clampOnBlur={false}
                          control={completionForm.control}
                          disabled={!canComplete || isCompletionPending}
                          emptyValue={null}
                          label="Actual distance (meters, optional)"
                          min={0}
                          name="distanceMeters"
                        />
                        <FormNumberField
                          allowDecimal={false}
                          clampOnBlur={false}
                          control={completionForm.control}
                          disabled={!canComplete || isCompletionPending}
                          emptyValue={null}
                          label="RPE (1-10, optional)"
                          max={10}
                          min={1}
                          name="rpe"
                        />
                        <FormTextareaField
                          control={completionForm.control}
                          disabled={!canComplete || isCompletionPending}
                          formatValue={(value) => value ?? ""}
                          label="Notes (optional)"
                          name="notes"
                          parseValue={(value) => value || null}
                        />
                      </div>
                    </Form>
                  ) : null}
                  {completionError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {completionError}
                    </p>
                  ) : null}
                  {completionStatus ? (
                    <p aria-live="polite" className="text-sm text-muted-foreground">
                      {completionStatus}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!canComplete || isCompletionPending}
                      onClick={() => void submitCompletion("full")}
                      type="button"
                    >
                      Complete activity
                    </Button>
                    <Button
                      disabled={!canComplete || isCompletionPending}
                      onClick={() => void submitCompletion("partial")}
                      type="button"
                      variant="outline"
                    >
                      Complete partially
                    </Button>
                    <Button
                      disabled={!canComplete || isCompletionPending}
                      onClick={() => void submitSkip()}
                      type="button"
                      variant="outline"
                    >
                      Skip session
                    </Button>
                  </div>
                  {completionRequestRef.current ? (
                    <Button
                      disabled={!canComplete || isCompletionPending}
                      onClick={() => {
                        const request = completionRequestRef.current;
                        if (!request) return;
                        void (request.kind === "skip"
                          ? submitSkip()
                          : request.kind === "associate"
                            ? submitAssociation()
                            : submitCompletion(request.input.plannedSession?.outcome ?? "full"));
                      }}
                      type="button"
                      variant="outline"
                    >
                      Retry saved request
                    </Button>
                  ) : null}
                </>
              ) : completedActivityId ? (
                <>
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    to="/activities/$activityId"
                    params={{ activityId: completedActivityId }}
                  >
                    View linked completed activity
                  </Link>
                  <Button
                    disabled={isCompletionPending}
                    onClick={() => setAssociationOpen((open) => !open)}
                    type="button"
                    variant="outline"
                  >
                    Associate recorded activity
                  </Button>
                  {associationOpen ? (
                    <div className="space-y-3" data-testid="completion-candidates">
                      {completionCandidatesQuery.isLoading ? (
                        <p className="text-sm text-muted-foreground">
                          Loading recorded activities...
                        </p>
                      ) : null}
                      {completionCandidatesQuery.data?.pages[0]?.canAssociate === false ? (
                        <p className="text-sm text-muted-foreground">
                          This completion cannot be replaced right now.
                        </p>
                      ) : null}
                      <RadioGroup
                        disabled={isCompletionPending}
                        onValueChange={setSelectedCandidateId}
                        value={selectedCandidateId ?? ""}
                      >
                        {completionCandidates.map((candidate) => (
                          <label
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                            htmlFor={`completion-candidate-${candidate.id}`}
                            key={candidate.id}
                          >
                            <span>
                              <span className="block font-medium">{candidate.name}</span>
                              <span className="text-muted-foreground">
                                {formatCandidateActivity(candidate)}
                              </span>
                            </span>
                            <RadioGroupItem
                              id={`completion-candidate-${candidate.id}`}
                              value={candidate.id}
                            />
                          </label>
                        ))}
                      </RadioGroup>
                      {!completionCandidatesQuery.isLoading &&
                      completionCandidatesQuery.data?.pages[0]?.canAssociate !== false &&
                      completionCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No recorded activities are available.
                        </p>
                      ) : null}
                      {completionCandidatesQuery.hasNextPage ? (
                        <Button
                          disabled={
                            completionCandidatesQuery.isFetchingNextPage || isCompletionPending
                          }
                          onClick={() => void completionCandidatesQuery.fetchNextPage()}
                          type="button"
                          variant="outline"
                        >
                          Load more
                        </Button>
                      ) : null}
                      <Button
                        disabled={!selectedCandidate || isCompletionPending}
                        onClick={() => void submitAssociation()}
                        type="button"
                      >
                        Confirm association
                      </Button>
                      {completionRequestRef.current?.kind === "associate" ? (
                        <Button
                          disabled={isCompletionPending}
                          onClick={() => void submitAssociation()}
                          type="button"
                          variant="outline"
                        >
                          Retry saved request
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This session is {plannedSession.lifecycle.status}.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!event) {
    return <p className="text-sm text-muted-foreground">Event not found.</p>;
  }

  const scheduledDate = event.scheduled_date;

  if (!scheduledDate) {
    return <p className="text-sm text-muted-foreground">Event schedule is unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      <RouteFlashToast
        {...(flash === undefined ? {} : { message: flash })}
        {...(flashType === undefined ? {} : { type: flashType })}
        clear={() =>
          void navigate({
            to: "/calendar/events/$eventId",
            params: { eventId },
            search: { flash: undefined, flashType: undefined, month, view },
            replace: true,
          })
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/calendar/day/$date"
              params={{ date: scheduledDate }}
              search={{ month, view }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to day
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-semibold tracking-tight">
              {getEventTitle(event)}
            </h1>
            <p className="mt-1 text-muted-foreground">{formatDayLabel(scheduledDate)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              to="/calendar/events/$eventId/edit"
              params={{ eventId: event.id }}
              search={{ month, view }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit event
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                <AlertDialogDescription>
                  {event.series_id || event.recurrence_rule
                    ? "Choose whether to delete this occurrence, future occurrences, or the entire series."
                    : "This removes the scheduled event."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <EventDeleteForm
                  eventId={event.id}
                  recurring={Boolean(event.series_id || event.recurrence_rule)}
                  redirectTo={`/calendar?month=${month}&view=${view}`}
                />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Event details</CardTitle>
            <CardDescription>Schedule and planning context for this event.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{getEventTypeLabel(event.event_type)}</Badge>
              {event.status ? <Badge variant="secondary">{event.status}</Badge> : null}
            </div>
            <DetailRow
              label="When"
              value={`${formatDayLabel(scheduledDate)} · ${formatEventTimeRange(event)}`}
            />
            <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start">
              <dt className="text-sm font-medium text-muted-foreground">Route</dt>
              <dd className="min-w-0 text-sm">
                {event.route_id ? (
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    to="/routes/$routeId"
                    params={{ routeId: event.route_id }}
                  >
                    {routeQuery.data?.name ?? "Open attached route"}
                  </Link>
                ) : (
                  "None attached"
                )}
              </dd>
            </div>
            <DetailRow label="Notes" value={event.notes?.trim() || "No notes yet."} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription>Useful planning metadata for the first web slice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailRow label="Scheduled date" value={scheduledDate} />
            <DetailRow label="All day" value={event.all_day ? "Yes" : "No"} />
            <DetailRow label="Event id" value={event.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function EventDeleteForm({
  eventId,
  recurring,
  redirectTo,
}: {
  eventId: string;
  recurring: boolean;
  redirectTo: string;
}) {
  const deleteCalendarEvent = useServerFn(deleteCalendarEventAction);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await deleteCalendarEvent({ data: new FormData(event.currentTarget) as never });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to delete event. Try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form action={deleteCalendarEventAction.url} method="post" onSubmit={handleSubmit}>
      <input {...contractEpochFormInputProps} />
      <input type="hidden" name="event_id" value={eventId} />
      {recurring ? (
        <select
          name="scope"
          aria-label="Delete recurrence scope"
          defaultValue="single"
          className="mb-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="single">This event only</option>
          <option value="future">This and future events</option>
          <option value="series">Entire series</option>
        </select>
      ) : (
        <input type="hidden" name="scope" value="single" />
      )}
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {submitError ? (
        <p role="alert" aria-live="polite" className="mb-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
      <Button type="submit" variant="destructive" disabled={isSubmitting}>
        {isSubmitting ? "Deleting..." : "Delete event"}
      </Button>
    </form>
  );
}

function DetailRow({ href, label, value }: { href?: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {href ? (
        <a
          className="mt-2 block text-sm text-primary underline-offset-4 hover:underline"
          href={href}
        >
          {value}
        </a>
      ) : (
        <p className="mt-2 text-sm text-foreground">{value}</p>
      )}
    </div>
  );
}

function getDateKeyInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatCandidateActivity(candidate: {
  activityCategory: string;
  elapsedMs: number;
  startedAt: string;
}) {
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(candidate.startedAt),
  );
  return `${date} · ${Math.round(candidate.elapsedMs / 60_000)} min · ${candidate.activityCategory}`;
}
