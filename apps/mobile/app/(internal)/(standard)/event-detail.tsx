import { Button } from "@repo/ui/components/button";
import { Form, FormNumberField, FormTextareaField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { flushPendingFormDrafts, useZodForm } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import {
  type CreateEventDefaults,
  CreateEventFlow,
  type CreateEventFlowHandle,
} from "@/components/event/create/CreateEventFlow";
import type { CreateEventMode } from "@/components/event/create/createEventDraft";
import {
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { AppConfirmModal, AppFormModal } from "@/components/shared/AppFormModal";
import { DetailOverflowMenu } from "@/components/shared/detail";
import { RouteCard } from "@/components/shared/RouteCard";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { getEventStatusLabel, getEventTitle } from "@/lib/calendar/eventPresentation";
import { formatEventTime, getEventScheduledDate } from "@/lib/calendar/eventSchedule";
import { ROUTES } from "@/lib/constants/routes";
import { markEstimated } from "@/lib/estimatedMetrics";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { buildPlannedSessionRecordingLaunchPayload } from "@/lib/recording/plannedSessionLaunch";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const actualDetailsSchema = z.object({
  distanceKilometers: z.number().finite().nonnegative().nullable(),
  durationMinutes: z.number().finite().nonnegative().nullable(),
  notes: z.string().max(10_000).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
});

function formatComparisonDuration(value: number | null) {
  if (value === null) return "Unknown";
  const minutes = Math.round(value / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatComparisonDistance(value: number | null) {
  if (value === null) return "Unknown";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

function isRecurringEvent(
  event:
    | {
        series_id?: string | null;
        recurrence_rule?: string | null;
        recurrence?: { rule?: string | null } | null;
      }
    | null
    | undefined,
) {
  if (!event) {
    return false;
  }

  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

function formatEventType(eventType: string | null | undefined) {
  return String(eventType || "event").replace(/_/g, " ");
}

function formatEventTimeRange(event: {
  all_day?: boolean | null;
  ends_at?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
  preserveInstant?: boolean;
}) {
  if (event.all_day) {
    return "All day";
  }

  if (!event.starts_at) {
    return "Scheduled";
  }

  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) {
    return "Scheduled";
  }

  if (!event.ends_at) {
    return event.preserveInstant
      ? format(start, "h:mm a")
      : formatEventTime(event.starts_at, event.timezone);
  }

  const end = new Date(event.ends_at);
  if (Number.isNaN(end.getTime())) {
    return event.preserveInstant
      ? format(start, "h:mm a")
      : formatEventTime(event.starts_at, event.timezone);
  }

  const formatTime = (instant: Date, isoInstant: string) =>
    event.preserveInstant ? format(instant, "h:mm a") : formatEventTime(isoInstant, event.timezone);
  return `${formatTime(start, event.starts_at)} - ${formatTime(end, event.ends_at)}`;
}

type EventMutationScope = "single" | "series";

function EventStatusPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border/60 bg-muted/60 px-2 py-1">
      <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}

function formatScheduleDateLabel(value: Date) {
  return format(value, "EEEE, MMMM d, yyyy");
}

function formatScheduleRepeatLabel(
  event:
    | {
        recurrence_rule?: string | null;
        recurrence?: { rule?: string | null } | null;
      }
    | null
    | undefined,
  recurring: boolean,
) {
  if (!recurring) {
    return "Does not repeat";
  }

  if (!event) return "Repeats";

  const frequency = parseRecurrenceFrequency(event);
  const endDate = parseRecurrenceEndDate(event);

  const cadenceLabel =
    frequency === "daily"
      ? "Every day"
      : frequency === "weekly"
        ? "Every week"
        : frequency === "monthly"
          ? "Every month"
          : "Repeats";

  if (!endDate) {
    return cadenceLabel;
  }

  const endAt = new Date(`${endDate}T12:00:00.000Z`);
  if (Number.isNaN(endAt.getTime())) {
    return cadenceLabel;
  }

  return `${cadenceLabel} until ${format(endAt, "MMMM d, yyyy")}`;
}

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAccessDeniedError(error: unknown) {
  const code = (error as { data?: { code?: string | null } | null } | null | undefined)?.data?.code;
  return code === "FORBIDDEN" || code === "UNAUTHORIZED";
}

function parseSuggestionLoadDelta(value: string | string[] | undefined) {
  const parsed = Number(readSearchParam(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPlanSuggestionDefaults(input: {
  type?: string;
  loadDelta: number | null;
  description?: string;
}): CreateEventDefaults | null {
  const roundedDelta = input.loadDelta === null ? null : Math.round(input.loadDelta);
  const absoluteDelta = roundedDelta === null ? null : Math.abs(roundedDelta);
  const targetCopy =
    absoluteDelta && absoluteDelta > 0
      ? `Target: about ${markEstimated(`${absoluteDelta} Load`)}.`
      : null;
  const description = input.description?.trim() || null;
  const notes = [description, targetCopy, "Created from the Plan tab readiness suggestion."]
    .filter(Boolean)
    .join("\n\n");

  if ((input.type === "add_load" || (roundedDelta ?? 0) > 0) && (roundedDelta ?? 0) > 0) {
    return {
      createEventType: "planned" as CreateEventMode,
      title: absoluteDelta
        ? `Suggested ${markEstimated(`${absoluteDelta} Load`)} session`
        : "Suggested session",
      notes,
      helperText: absoluteDelta
        ? `Plan suggested adding about ${markEstimated(`${absoluteDelta} Load`)}. Select or adjust the matched activity plan before creating.`
        : "Plan suggested adding load. Select or adjust an activity plan before creating.",
    };
  }

  if (input.type || roundedDelta !== null || description) {
    return {
      createEventType: "custom" as CreateEventMode,
      title: roundedDelta && roundedDelta < 0 ? "Reduce scheduled load" : "Plan adjustment",
      notes,
      helperText:
        "Plan suggested a schedule adjustment. Custom events do not change training load; edit existing sessions to reduce scheduled Load.",
    };
  }

  return null;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const createEventFlowRef = useRef<CreateEventFlowHandle>(null);
  const [createDirty, setCreateDirty] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty: createDirty,
    isPending: createPending,
  });
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = useQueryClient();
  const {
    id,
    mode,
    date,
    activityPlanId,
    routeId,
    routeName,
    scheduleGapLoadDelta,
    planSuggestionType,
    planSuggestionLoadDelta,
    planSuggestionDescription,
    resourceType,
  } = useLocalSearchParams<{
    id?: string;
    mode?: string;
    date?: string;
    activityPlanId?: string;
    routeId?: string;
    routeName?: string;
    scheduleGapLoadDelta?: string;
    planSuggestionType?: string;
    planSuggestionLoadDelta?: string;
    planSuggestionDescription?: string;
    resourceType?: string;
  }>();
  const eventId = typeof id === "string" ? id : "";
  const isPlannedSession = resourceType === "planned_session" && UUID_PATTERN.test(eventId);
  const hasInvalidResource = resourceType !== undefined && !isPlannedSession;
  const startsInCreateMode = mode === "create";
  const createDate = typeof date === "string" ? date : undefined;
  const preselectedActivityPlanId = typeof activityPlanId === "string" ? activityPlanId : undefined;
  const preselectedRoute = useMemo(
    () =>
      typeof routeId === "string" && typeof routeName === "string"
        ? { id: routeId, name: routeName }
        : null,
    [routeId, routeName],
  );
  const scheduleGapLoad = parseSuggestionLoadDelta(scheduleGapLoadDelta);
  const scheduleGapNote =
    scheduleGapLoad !== null && scheduleGapLoad > 0
      ? `Schedule gap: about ${markEstimated(`${Math.round(scheduleGapLoad)} Load`)}.`
      : null;
  const planSuggestionDefaults = useMemo(
    () =>
      buildPlanSuggestionDefaults({
        type: readSearchParam(planSuggestionType),
        loadDelta: parseSuggestionLoadDelta(planSuggestionLoadDelta),
        description: readSearchParam(planSuggestionDescription),
      }),
    [planSuggestionDescription, planSuggestionLoadDelta, planSuggestionType],
  );

  const { beginRedirect, isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.dismissTo(ROUTES.PLAN.CALENDAR),
  });
  const [isClosingAfterDelete, setIsClosingAfterDelete] = useState(false);

  const {
    data: event,
    error,
    isLoading,
  } = api.events.getById.useQuery(
    { id: eventId },
    {
      ...scheduleAwareReadQueryOptions,
      enabled:
        !!eventId &&
        !hasInvalidResource &&
        !isPlannedSession &&
        !isRedirecting &&
        !isClosingAfterDelete &&
        !startsInCreateMode,
    },
  );
  const plannedSessionQuery = api.plannedSessions.getById.useQuery(
    { id: eventId },
    { enabled: isPlannedSession && !startsInCreateMode && !hasInvalidResource },
  );
  const profileQuery = api.profiles.get.useQuery(undefined, { enabled: isPlannedSession });
  const createManualDiaryEntry = api.activities.createManualDiaryEntry.useMutation({
    retry: false,
  });
  const skipPlannedSession = api.plannedSessions.skip.useMutation({ retry: false });
  const linkPlannedSessionCompletion = api.plannedSessions.linkCompletion.useMutation({
    retry: false,
  });
  const [associationOpen, setAssociationOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const plannedRequestRef = useRef<
    | { kind: "complete"; input: Parameters<typeof createManualDiaryEntry.mutateAsync>[0] }
    | { kind: "skip"; input: Parameters<typeof skipPlannedSession.mutateAsync>[0] }
    | { kind: "associate"; input: Parameters<typeof linkPlannedSessionCompletion.mutateAsync>[0] }
    | null
  >(null);
  const plannedInFlightRef = useRef(false);
  const [plannedError, setPlannedError] = useState<string | null>(null);
  const [actualDetailsOpen, setActualDetailsOpen] = useState(false);
  const completionForm = useZodForm({
    defaultValues: { distanceKilometers: null, durationMinutes: null, notes: null, rpe: null },
    schema: actualDetailsSchema,
  });
  const completionCandidatesQuery = api.plannedSessions.completionCandidates.useInfiniteQuery(
    { sessionId: eventId, limit: 20 },
    {
      enabled: isPlannedSession && associationOpen,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );
  const accessDenied = !startsInCreateMode && isAccessDeniedError(error);

  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteScopeModalVisible, setDeleteScopeModalVisible] = useState(false);
  const [pendingDeleteScope, setPendingDeleteScope] = useState<EventMutationScope | null>(null);

  useEffect(() => {
    redirectOnNotFound(error);
  }, [error, redirectOnNotFound]);

  const deleteMutation = api.events.delete.useMutation({
    onSuccess: async () => {
      beginRedirect();
      await refreshScheduleViews(queryClient, "eventMutation");
    },
    onError: () => {
      setIsClosingAfterDelete(false);
    },
  });
  const recurring = useMemo(() => isRecurringEvent(event), [event]);
  const route = event?.route;
  const updateSupportsRecurrence = true;
  const comments = useEntityCommentsController({ entityId: event?.id, entityType: "event" });
  const _detailTitle = startsInCreateMode ? "Create Event" : "Event details";
  const _detailSubtitle = startsInCreateMode
    ? "choose event type"
    : event
      ? `${formatEventType(event.event_type)}${recurring ? " · recurring" : ""}`
      : "event";
  const displayTitle = startsInCreateMode ? "Create event" : event ? getEventTitle(event) : "Event";
  const statusLabel = event ? getEventStatusLabel(event) : null;
  const displayStartsAt = event ? new Date(event.starts_at) : new Date();
  const displayAllDay = !!event?.all_day;
  const displayScheduleDate = event ? getEventScheduledDate(event) : null;
  const displayNotes = event?.notes ?? "";

  const handleOpenRouteDetail = () => {
    if (!route?.id) return;
    navigateTo(ROUTES.ROUTES.DETAIL(route.id));
  };

  const closeDeleteFlow = () => {
    setDeleteScopeModalVisible(false);
    setDeleteConfirmVisible(false);
    setPendingDeleteScope(null);
  };

  const handleSelectDeleteScope = (scope: EventMutationScope) => {
    setPendingDeleteScope(scope);
    setDeleteScopeModalVisible(false);
    setDeleteConfirmVisible(true);
  };

  const handleDeleteEvent = (scope?: EventMutationScope) => {
    if (!event) {
      return;
    }

    setIsClosingAfterDelete(true);
    deleteMutation.mutate(scope ? { id: event.id, scope } : { id: event.id });
  };

  const handleDeletePress = () => {
    if (!event) {
      return;
    }

    if (updateSupportsRecurrence && recurring) {
      setDeleteScopeModalVisible(true);
      return;
    }

    setPendingDeleteScope("single");
    setDeleteConfirmVisible(true);
  };

  const renderHeaderActions = () => {
    if (startsInCreateMode) {
      return (
        <Button
          onPress={() => createEventFlowRef.current?.submit()}
          disabled={createPending}
          accessibilityState={{ busy: createPending, disabled: createPending }}
          size="sm"
          testID="event-detail-save-button"
          variant="ghost"
        >
          <Text className="text-sm font-semibold text-primary">
            {createPending ? "Creating…" : "Create"}
          </Text>
        </Button>
      );
    }

    if (!event) {
      return null;
    }

    return (
      <DetailOverflowMenu
        actions={[
          {
            label: "Edit Event",
            onPress: () => router.navigate(ROUTES.PLAN.EVENT_UPDATE(event.id)),
            testID: "event-detail-options-edit",
          },
          {
            label: deleteMutation.isPending ? "Deleting..." : "Delete Event",
            onPress: handleDeletePress,
            testID: "event-detail-options-delete",
            variant: "destructive" as const,
          },
        ]}
        testID="event-detail-options-trigger"
      />
    );
  };

  if (
    (!startsInCreateMode && (isPlannedSession ? plannedSessionQuery.isLoading : isLoading)) ||
    isRedirecting
  ) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message={isRedirecting ? "Closing event..." : "Loading event..."} />
      </View>
    );
  }

  if (accessDenied) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <EmptyState
          actionLabel="Go back"
          description="You do not have permission to view this event."
          onAction={() => router.back()}
          title="Event unavailable"
        />
      </View>
    );
  }

  if (hasInvalidResource) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <EmptyState
          actionLabel="Go back"
          description="This calendar resource link is invalid."
          onAction={() => router.back()}
          title="Event unavailable"
        />
      </View>
    );
  }

  if (isPlannedSession && !plannedSessionQuery.data) {
    return (
      <EmptyState
        actionLabel="Go back"
        description="This planned session may have been removed."
        onAction={() => router.back()}
        title="Planned session not found"
      />
    );
  }

  if (!startsInCreateMode && !isPlannedSession && !event) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <EmptyState
          actionLabel="Go back"
          description="This event may have been removed."
          onAction={() => router.back()}
          title="Event not found"
        />
      </View>
    );
  }

  if (isPlannedSession && plannedSessionQuery.data) {
    const session = plannedSessionQuery.data;
    const category = session.prescription.resolutionManifest.resolved_structure.activity_category;
    const timezone = profileQuery.data?.planning_timezone ?? null;
    const today = timezone
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .formatToParts(new Date())
          .filter((part) => part.type !== "literal")
          .map((part) => part.value)
          .join("-")
      : null;
    const available =
      session.lifecycle.status === "scheduled" && today !== null && session.planningDate <= today;
    const run = async (outcome: "full" | "partial" | "skip") => {
      if (!available || !timezone || plannedInFlightRef.current) return;
      const existing = plannedRequestRef.current;
      if (existing && (outcome === "skip") !== (existing.kind === "skip")) {
        setPlannedError("Retry the saved action or refresh before choosing a different action.");
        return;
      }
      flushPendingFormDrafts(completionForm.control);
      if (outcome !== "skip" && !(await completionForm.trigger())) {
        setPlannedError("Correct the actual details before completing this session.");
        return;
      }
      const { distanceKilometers, durationMinutes, notes, rpe } = completionForm.getValues();
      plannedInFlightRef.current = true;
      setPlannedError(null);
      try {
        if (outcome === "skip") {
          const input =
            existing?.kind === "skip"
              ? existing.input
              : {
                  profileId: session.profileId,
                  sessionId: session.id,
                  expectedRevision: session.sessionRevision,
                  operationId: crypto.randomUUID(),
                };
          plannedRequestRef.current = { kind: "skip", input };
          await skipPlannedSession.mutateAsync(input);
        } else {
          const input =
            existing?.kind === "complete"
              ? existing.input
              : {
                  observation: {
                    operationId: crypto.randomUUID(),
                    diaryDate: session.planningDate,
                    diaryTimezone: timezone,
                    name: "Completed activity",
                    activityCategory: category,
                    notes: notes?.trim() || null,
                    elapsedMs: durationMinutes === null ? null : durationMinutes * 60_000,
                    distanceMeters: distanceKilometers === null ? null : distanceKilometers * 1_000,
                    startedAt: null,
                    finishedAt: null,
                    ...(rpe === null ? {} : { rpe, rpeOperationId: crypto.randomUUID() }),
                  },
                  plannedSession: {
                    sessionId: session.id,
                    expectedRevision: session.sessionRevision,
                    outcome,
                  },
                };
          plannedRequestRef.current = { kind: "complete", input };
          await createManualDiaryEntry.mutateAsync(input);
        }
        plannedRequestRef.current = null;
        await plannedSessionQuery.refetch();
      } catch (error) {
        setPlannedError(
          error instanceof Error
            ? error.message
            : "Action status is unknown. Retry the saved action or refresh.",
        );
      } finally {
        plannedInFlightRef.current = false;
      }
    };
    const record = async () => {
      activitySelectionStore.setSelection(
        await buildPlannedSessionRecordingLaunchPayload({
          plannedSession: {
            id: session.id,
            sessionRevision: session.sessionRevision,
            source: session.source,
            prescription: session.prescription,
          },
          name: "Scheduled activity plan",
        }),
      );
      navigateTo(ROUTES.RECORD as never);
    };
    const linkedActivityId =
      session.lifecycle.status === "completed" && session.lifecycle.completion.state === "linked"
        ? session.lifecycle.completion.activityId
        : null;
    const completionCandidates =
      completionCandidatesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const selectedCandidate = completionCandidates.find((item) => item.id === selectedCandidateId);
    const associateRecordedActivity = async () => {
      if (!selectedCandidate || plannedInFlightRef.current) return;
      const existing = plannedRequestRef.current;
      if (existing && existing.kind !== "associate") {
        setPlannedError("Retry the saved action or refresh before choosing a different action.");
        return;
      }
      const input =
        existing?.kind === "associate"
          ? existing.input
          : {
              profileId: session.profileId,
              sessionId: session.id,
              expectedRevision: session.sessionRevision,
              activityId: selectedCandidate.id,
              operationId: crypto.randomUUID(),
            };
      plannedRequestRef.current = { kind: "associate", input };
      plannedInFlightRef.current = true;
      setPlannedError(null);
      try {
        await linkPlannedSessionCompletion.mutateAsync(input);
        plannedRequestRef.current = null;
        await Promise.all([
          plannedSessionQuery.refetch(),
          completionCandidatesQuery.refetch(),
          refreshScheduleViews(queryClient, "eventMutation"),
          queryClient.invalidateQueries({ queryKey: ["activities"] }),
        ]);
      } catch (error) {
        setPlannedError(
          error instanceof Error
            ? error.message
            : "Association status is unknown. Retry the same request.",
        );
        await plannedSessionQuery.refetch();
      } finally {
        plannedInFlightRef.current = false;
      }
    };
    return (
      <View className="flex-1 bg-background" testID="planned-session-detail-screen">
        <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
          <View className="gap-3 rounded-3xl bg-card p-5">
            <Text className="text-3xl font-semibold text-foreground">{category} session</Text>
            <Text className="text-sm text-muted-foreground">
              Planned for {session.planningDate}
            </Text>
            <EventStatusPill label={session.lifecycle.status} />
            <View className="gap-1 border-t border-border pt-3" testID="planned-session-comparison">
              <Text className="text-sm text-muted-foreground">
                Planned duration:{" "}
                {formatComparisonDuration(session.comparison?.planned.durationSeconds ?? null)}
              </Text>
              {session.comparison?.actual.state === "observed" ||
              session.comparison?.actual.state === "unknown" ? (
                <>
                  <Text className="text-sm text-muted-foreground">
                    Actual duration:{" "}
                    {formatComparisonDuration(session.comparison.actual.durationSeconds)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Actual distance:{" "}
                    {formatComparisonDistance(session.comparison.actual.distanceMeters)}
                  </Text>
                </>
              ) : session.comparison?.actual.state === "not_performed" ? (
                <Text className="text-sm text-muted-foreground">Actual: Not performed</Text>
              ) : null}
            </View>
          </View>
          {linkedActivityId ? (
            <Button
              onPress={() => navigateTo(ROUTES.ACTIVITIES.DETAIL(linkedActivityId))}
              testID="planned-session-linked-activity"
            >
              <Text>View completed activity</Text>
            </Button>
          ) : null}
          {linkedActivityId ? (
            <View className="gap-2">
              <Button
                disabled={plannedInFlightRef.current}
                onPress={() => setAssociationOpen((open) => !open)}
                testID="planned-session-associate-recorded"
                variant="outline"
              >
                <Text>Associate recorded activity</Text>
              </Button>
              {associationOpen ? (
                <View className="gap-2" testID="planned-session-completion-candidates">
                  {completionCandidatesQuery.isLoading ? (
                    <Text className="text-sm text-muted-foreground">
                      Loading recorded activities...
                    </Text>
                  ) : null}
                  {completionCandidatesQuery.data?.pages[0]?.canAssociate === false ? (
                    <Text className="text-sm text-muted-foreground">
                      This completion cannot be replaced right now.
                    </Text>
                  ) : null}
                  {completionCandidates.map((candidate) => (
                    <Button
                      key={candidate.id}
                      onPress={() => setSelectedCandidateId(candidate.id)}
                      testID={`planned-session-candidate-${candidate.id}`}
                      variant={selectedCandidateId === candidate.id ? "default" : "outline"}
                    >
                      <Text>
                        {candidate.name} · {format(new Date(candidate.startedAt), "MMM d, yyyy")} ·{" "}
                        {Math.round(candidate.elapsedMs / 60_000)} min ·{" "}
                        {candidate.activityCategory}
                      </Text>
                    </Button>
                  ))}
                  {!completionCandidatesQuery.isLoading &&
                  completionCandidatesQuery.data?.pages[0]?.canAssociate !== false &&
                  completionCandidates.length === 0 ? (
                    <Text className="text-sm text-muted-foreground">
                      No recorded activities are available.
                    </Text>
                  ) : null}
                  {completionCandidatesQuery.hasNextPage ? (
                    <Button
                      disabled={
                        completionCandidatesQuery.isFetchingNextPage || plannedInFlightRef.current
                      }
                      onPress={() => void completionCandidatesQuery.fetchNextPage()}
                      testID="planned-session-candidates-load-more"
                      variant="outline"
                    >
                      <Text>Load more</Text>
                    </Button>
                  ) : null}
                  <Button
                    disabled={!selectedCandidate || plannedInFlightRef.current}
                    onPress={() => void associateRecordedActivity()}
                    testID="planned-session-confirm-association"
                  >
                    <Text>Confirm association</Text>
                  </Button>
                  {plannedRequestRef.current?.kind === "associate" ? (
                    <Button
                      disabled={plannedInFlightRef.current}
                      onPress={() => void associateRecordedActivity()}
                      testID="planned-session-retry-association"
                      variant="outline"
                    >
                      <Text>Retry saved request</Text>
                    </Button>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {available ? (
            <View className="gap-2">
              <Button onPress={() => void record()} testID="planned-session-record">
                <Text>Record activity</Text>
              </Button>
              <Button
                onPress={() => setActualDetailsOpen((open) => !open)}
                testID="planned-session-actual-details-toggle"
                variant="outline"
              >
                <Text>Actual details (optional)</Text>
              </Button>
              {actualDetailsOpen ||
              Object.values(completionForm.watch()).some((value) => value !== null) ? (
                <Form {...completionForm}>
                  <View className="gap-2 rounded-xl border border-border p-3">
                    <Text className="text-sm text-muted-foreground">
                      Leave fields blank when unknown. Planned values are never copied here.
                    </Text>
                    <FormNumberField
                      clampOnBlur={false}
                      control={completionForm.control}
                      emptyValue={null}
                      label="Actual duration (minutes, optional)"
                      min={0}
                      name="durationMinutes"
                      testId="planned-session-actual-duration"
                    />
                    <FormNumberField
                      clampOnBlur={false}
                      control={completionForm.control}
                      emptyValue={null}
                      label="Actual distance (km, optional)"
                      min={0}
                      name="distanceKilometers"
                      testId="planned-session-actual-distance"
                    />
                    <FormNumberField
                      allowDecimal={false}
                      clampOnBlur={false}
                      control={completionForm.control}
                      emptyValue={null}
                      label="RPE (1-10, optional)"
                      max={10}
                      min={1}
                      name="rpe"
                      testId="planned-session-actual-rpe"
                    />
                    <FormTextareaField
                      control={completionForm.control}
                      formatValue={(value) => value ?? ""}
                      label="Notes (optional)"
                      name="notes"
                      parseValue={(value) => value || null}
                      testId="planned-session-actual-notes"
                    />
                  </View>
                </Form>
              ) : null}
              <Button
                disabled={plannedInFlightRef.current}
                onPress={() => void run("full")}
                testID="planned-session-complete-full"
              >
                <Text>Complete activity</Text>
              </Button>
              <Button
                disabled={plannedInFlightRef.current}
                onPress={() => void run("partial")}
                testID="planned-session-complete-partial"
                variant="outline"
              >
                <Text>Complete partially</Text>
              </Button>
              <Button
                disabled={plannedInFlightRef.current}
                onPress={() => void run("skip")}
                testID="planned-session-skip"
                variant="outline"
              >
                <Text>Skip session</Text>
              </Button>
            </View>
          ) : (
            <Text className="text-sm text-muted-foreground">
              Completion is available on or after the planned date in your planning timezone.
            </Text>
          )}
          {plannedError ? (
            <View>
              <Text className="text-sm text-destructive">{plannedError}</Text>
              {plannedRequestRef.current ? (
                <Button
                  onPress={() =>
                    void (plannedRequestRef.current?.kind === "associate"
                      ? associateRecordedActivity()
                      : run(plannedRequestRef.current?.kind === "skip" ? "skip" : "full"))
                  }
                  testID="planned-session-retry"
                >
                  <Text>Retry saved action</Text>
                </Button>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      enabled={startsInCreateMode}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
      testID="event-detail-screen"
    >
      <Stack.Screen
        options={{
          headerRight: renderHeaderActions,
          title: startsInCreateMode ? "Create Event" : undefined,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-4"
        keyboardShouldPersistTaps="handled"
      >
        {!startsInCreateMode ? (
          <View className="gap-4 rounded-3xl bg-card p-5">
            <View className="gap-2">
              <View className="flex-row flex-wrap gap-2">
                {statusLabel ? <EventStatusPill label={statusLabel} /> : null}
                {recurring ? <EventStatusPill label="Recurring" /> : null}
              </View>
              <Text className="text-3xl font-semibold text-foreground" testID="event-detail-title">
                {displayTitle}
              </Text>
            </View>

            <View className="gap-1">
              <Text className="text-sm font-medium text-foreground">
                {displayAllDay && displayScheduleDate
                  ? formatScheduleDateLabel(new Date(`${displayScheduleDate}T12:00:00.000Z`))
                  : formatScheduleDateLabel(displayStartsAt)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {formatEventTimeRange({
                  all_day: displayAllDay,
                  starts_at: displayStartsAt.toISOString(),
                  ends_at: event?.ends_at ?? null,
                  timezone: event?.timezone,
                  preserveInstant: false,
                })}
              </Text>
              {recurring ? (
                <Text className="text-sm text-muted-foreground">
                  {formatScheduleRepeatLabel(event, recurring)}
                </Text>
              ) : null}
            </View>

            {displayNotes.trim().length > 0 ? (
              <Text className="text-sm leading-6 text-muted-foreground">{displayNotes}</Text>
            ) : null}
          </View>
        ) : null}

        {!startsInCreateMode && route ? (
          <View className="gap-3 rounded-2xl bg-card p-4">
            <View className="gap-0.5">
              <Text className="text-base font-semibold text-foreground">Route</Text>
              <Text className="text-sm text-muted-foreground">
                Open the linked route to review its course details.
              </Text>
            </View>
            <RouteCard
              onPress={handleOpenRouteDetail}
              route={route}
              showAttribution={false}
              showLike={false}
              variant="compact"
            />
          </View>
        ) : null}

        {startsInCreateMode ? (
          <CreateEventFlow
            ref={createEventFlowRef}
            createDate={createDate}
            defaults={planSuggestionDefaults}
            onCancel={() => router.back()}
            onDirtyChange={setCreateDirty}
            onPendingChange={setCreatePending}
            onCreated={(resource) => {
              allowNavigationAfterSuccess();
              resource.kind === "event"
                ? router.replace(ROUTES.PLAN.EVENT_DETAIL(resource.id))
                : router.replace(ROUTES.PLAN.CALENDAR);
            }}
            preselectedActivityPlanId={preselectedActivityPlanId}
            preselectedRoute={preselectedRoute}
            scheduleGapNote={scheduleGapNote}
            showFooterActions={false}
            testIDPrefix="event-detail"
          />
        ) : null}

        {!startsInCreateMode ? (
          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            commentsError={comments.commentsError}
            comments={comments.comments}
            hasMoreComments={comments.hasMoreComments}
            isLoadingComments={comments.isLoadingComments}
            isLoadingMoreComments={comments.isLoadingMoreComments}
            newComment={comments.newComment}
            onAddComment={comments.handleAddComment}
            onChangeNewComment={comments.setNewComment}
            onLoadMoreComments={comments.loadMoreComments}
            testIDPrefix="event-detail"
          />
        ) : null}
      </ScrollView>

      {deleteScopeModalVisible ? (
        <AppFormModal
          description="Choose how much of this series to delete."
          onClose={closeDeleteFlow}
          secondaryAction={
            <Button onPress={closeDeleteFlow} variant="outline">
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
          }
          testID="event-detail-delete-scope-modal"
          title="Recurring Event"
        >
          <View className="gap-3">
            <Button
              onPress={() => handleSelectDeleteScope("single")}
              testID="event-detail-delete-scope-single"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This event only</Text>
            </Button>
            <Button
              onPress={() => handleSelectDeleteScope("series")}
              testID="event-detail-delete-scope-series"
              variant="outline"
            >
              <Text className="text-foreground font-medium">Entire series</Text>
            </Button>
          </View>
        </AppFormModal>
      ) : null}

      {deleteConfirmVisible ? (
        <AppConfirmModal
          description="Are you sure you want to delete this event?"
          onClose={closeDeleteFlow}
          primaryAction={{
            label: deleteMutation.isPending ? "Deleting..." : "Delete Event",
            onPress: () => handleDeleteEvent(pendingDeleteScope ?? undefined),
            testID: "event-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: closeDeleteFlow,
            variant: "outline",
          }}
          testID="event-detail-delete-confirm-modal"
          title="Delete Event"
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
