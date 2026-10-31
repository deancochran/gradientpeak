import { Button } from "@repo/ui/components/button";
import { Form } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { randomUUID } from "expo-crypto";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWatch } from "react-hook-form";
import { AccessibilityInfo, View } from "react-native";
import { z } from "zod";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";
import { api } from "@/lib/api";
import { getEventScheduledDate } from "@/lib/calendar/eventSchedule";
import { omitUndefined } from "@/lib/omitUndefined";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  type ActivityPlanListItem,
  parseEventDateForEditor,
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "../EventEditorCard";
import {
  CreateEventMainStep,
  type EventFormValues,
  type EventRouteSummary,
} from "./CreateEventMainStep";
import {
  buildCreateEventInput,
  buildUpdatePatch,
  type CreateEventDraft,
  type CreateEventMode,
  createDefaultEventDraft,
  removeActivityPlanFromDraft,
} from "./createEventDraft";
import { isExistingEventActivityPlanEditable } from "./eventEditability";
import { RepeatStep } from "./RepeatStep";

type CreateEventStep = "main" | "repeat";
type EventMutationScope = "single" | "future" | "series";

const createEventMainFormSchema = z.object({
  allDay: z.boolean(),
  customDate: z.string(),
  customTime: z.string(),
  notes: z.string(),
  plannedDate: z.string(),
  recurrenceEndDate: z.string().nullable(),
  title: z.string(),
  timezone: z.string().nullable(),
});

export type CreateEventDefaults = {
  createEventType?: CreateEventMode | null;
  helperText?: string | null;
  notes?: string;
  title?: string;
};

function withPreselectedRoute(
  draft: CreateEventDraft,
  route: EventRouteSummary | null | undefined,
): CreateEventDraft {
  return route ? { ...draft, routeId: route.id, routeName: route.name } : draft;
}

function draftKey(draft: CreateEventDraft) {
  const { routeName: _routeName, ...values } = draft;
  if (values.mode === "planned") {
    const { activityPlanName: _activityPlanName, ...editable } = values;
    return JSON.stringify(editable);
  }
  return JSON.stringify({ ...values, startsAt: format(values.startsAt, "HH:mm") });
}

export type CreateEventFlowHandle = {
  submit: () => void;
};

function mergeNotes(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n\n");
}

type EditableEvent = {
  activityPlanSummary?: ActivityPlanListItem | null;
  activity_plan_id?: string | null;
  route?: EventRouteSummary | null;
  route_id?: string | null;
  all_day?: boolean | null;
  event_type?: string | null;
  id: string;
  notes?: string | null;
  recurrence?: { rule?: string | null } | null;
  recurrence_rule?: string | null;
  scheduled_date?: string | null;
  series_id?: string | null;
  starts_at: string;
  timezone?: string | null;
  title?: string | null;
};

function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function buildDraftFromEvent(event: EditableEvent): CreateEventDraft {
  const startsAt = parseEventDateForEditor(event);
  const scheduledDate = getEventScheduledDate(event) ?? toDateOnly(startsAt);
  const timezone = event.timezone ?? null;
  const recurrenceFrequency = parseRecurrenceFrequency(event);
  const recurrenceEndDate = parseRecurrenceEndDate(event);

  if (event.event_type === "planned" || event.activity_plan_id || event.activityPlanSummary?.id) {
    return {
      mode: "planned",
      activityPlanId: event.activity_plan_id ?? event.activityPlanSummary?.id ?? null,
      activityPlanName: event.activityPlanSummary?.name ?? null,
      routeId: event.route_id ?? event.route?.id ?? null,
      routeName: event.route?.name ?? null,
      scheduledDate,
      title: event.title ?? event.activityPlanSummary?.name ?? "Planned Activity",
      notes: event.notes ?? "",
    };
  }

  return {
    mode: "custom",
    eventType: event.event_type === "race_target" ? "race_target" : "custom",
    title: event.title ?? "",
    startsAt,
    scheduledDate,
    timezone,
    allDay: !!event.all_day,
    recurrenceFrequency,
    recurrenceEndDate,
    notes: event.notes ?? "",
    routeId: event.route_id ?? event.route?.id ?? null,
    routeName: event.route?.name ?? null,
  };
}

function buildStartsAtFromDateOnly(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function applyDateOnlyToDate(current: Date, dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const next = new Date(current);
  next.setFullYear(
    year ?? current.getFullYear(),
    (month ?? current.getMonth() + 1) - 1,
    day ?? current.getDate(),
  );
  return next;
}

function toMainFormValues(draft: CreateEventDraft): EventFormValues {
  if (draft.mode === "planned") {
    return {
      allDay: true,
      customDate: draft.scheduledDate,
      customTime: "12:00",
      notes: draft.notes,
      plannedDate: draft.scheduledDate,
      recurrenceEndDate: null,
      title: draft.title,
      timezone: null,
    };
  }

  return {
    allDay: draft.allDay,
    customDate: draft.scheduledDate,
    customTime: format(draft.startsAt, "HH:mm"),
    notes: draft.notes,
    plannedDate: draft.scheduledDate,
    recurrenceEndDate: draft.recurrenceEndDate,
    title: draft.title,
    timezone: draft.timezone,
  };
}

function applyMainFormValues(draft: CreateEventDraft, values: EventFormValues): CreateEventDraft {
  if (draft.mode === "planned") {
    return {
      ...draft,
      notes: values.notes,
      scheduledDate: values.plannedDate || draft.scheduledDate,
      title: values.title,
    };
  }

  const startsAt = values.customDate
    ? applyDateOnlyToDate(draft.startsAt, values.customDate)
    : draft.startsAt;
  const [hours, minutes] = values.customTime.split(":").map(Number);
  if (values.customTime) {
    startsAt.setHours(hours ?? startsAt.getHours(), minutes ?? startsAt.getMinutes(), 0, 0);
  }

  return {
    ...draft,
    allDay: values.allDay,
    notes: values.notes,
    recurrenceEndDate: values.recurrenceEndDate,
    scheduledDate: values.customDate || draft.scheduledDate,
    startsAt,
    title: values.title,
    timezone: values.timezone,
  };
}

function areMainFormValuesEqual(left: EventFormValues, right: EventFormValues) {
  return (
    left.allDay === right.allDay &&
    left.customDate === right.customDate &&
    left.customTime === right.customTime &&
    left.notes === right.notes &&
    left.plannedDate === right.plannedDate &&
    left.recurrenceEndDate === right.recurrenceEndDate &&
    left.title === right.title &&
    left.timezone === right.timezone
  );
}

export const CreateEventFlow = forwardRef<
  CreateEventFlowHandle,
  {
    createDate?: string;
    defaults?: CreateEventDefaults | null;
    onCancel: () => void;
    onCreated: (resource: { id: string; kind: "event" | "planned_session" }) => void;
    onDirtyChange?: (isDirty: boolean) => void;
    onPendingChange?: (isPending: boolean) => void;
    onUpdated?: (event: { id: string }) => void;
    preselectedActivityPlanId?: string;
    preselectedRoute?: EventRouteSummary | null;
    scheduleGapNote?: string | null;
    showFooterActions?: boolean;
    testIDPrefix?: string;
    updateEvent?: EditableEvent;
  }
>(function CreateEventFlow(
  {
    createDate,
    defaults,
    onCancel,
    onCreated,
    onDirtyChange,
    onPendingChange,
    onUpdated,
    preselectedActivityPlanId,
    preselectedRoute,
    scheduleGapNote,
    showFooterActions = true,
    testIDPrefix = "event-detail",
    updateEvent,
  },
  ref,
) {
  const queryClient = useQueryClient();
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const directOperationId = useRef(randomUUID());
  const initialMode = updateEvent
    ? buildDraftFromEvent(updateEvent).mode
    : preselectedActivityPlanId
      ? "planned"
      : (defaults?.createEventType ?? "custom");
  const initialNotes = mergeNotes([defaults?.notes, scheduleGapNote]);
  const [step, setStep] = useState<CreateEventStep>("main");
  const [draft, setDraft] = useState<CreateEventDraft>(() =>
    updateEvent
      ? buildDraftFromEvent(updateEvent)
      : withPreselectedRoute(
          createDefaultEventDraft(
            omitUndefined({
              createDate,
              mode: initialMode,
              notes: initialNotes,
              title: defaults?.title,
            }),
          ),
          preselectedRoute,
        ),
  );
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [titleErrorMessage, setTitleErrorMessage] = useState<string | null>(null);
  const [recurrenceErrorMessage, setRecurrenceErrorMessage] = useState<string | null>(null);
  const [knownActivityPlans, setKnownActivityPlans] = useState<ActivityPlanListItem[]>([]);
  const [knownRoutes, setKnownRoutes] = useState<EventRouteSummary[]>(() =>
    preselectedRoute ? [preselectedRoute] : [],
  );
  const [activityPlanPickerOpen, setActivityPlanPickerOpen] = useState(false);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [pendingUpdateDraft, setPendingUpdateDraft] = useState<CreateEventDraft | null>(null);
  const form = useZodForm<EventFormValues>({
    schema: createEventMainFormSchema,
    defaultValues: toMainFormValues(draft),
  });
  const watchedFormValues = useWatch({ control: form.control }) as EventFormValues;
  const initialDraftKeyRef = useRef(draftKey(draft));
  const customDraftBeforePlannedRef = useRef<Extract<CreateEventDraft, { mode: "custom" }> | null>(
    draft.mode === "custom" ? draft : null,
  );
  const isDraftDirty = draftKey(draft) !== initialDraftKeyRef.current || form.formState.isDirty;
  const isDraftDirtyRef = useRef(isDraftDirty);
  isDraftDirtyRef.current = isDraftDirty;
  const syncingFormFromDraftRef = useRef(false);

  const createMutation = api.events.create.useMutation({
    onSuccess: async (createdEvent) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      onCreated({ id: createdEvent.id, kind: "event" });
    },
  });
  const createPlannedSessionMutation = api.plannedSessions.create.useMutation({
    onSuccess: async (receipt) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      onCreated({ id: receipt.session.id, kind: "planned_session" });
    },
  });
  const updateMutation = api.events.update.useMutation({
    onSuccess: (updatedEvent) => {
      onUpdated?.(updatedEvent as { id: string });
      void refreshScheduleViews(queryClient, "eventMutation");
    },
  });
  const { data: activityPlansData } = api.activityPlans.list.useQuery(
    {
      ownerScope: "own",
      limit: 100,
    },
    {
      enabled: draft.mode === "planned",
    },
  );
  const { data: preselectedActivityPlan } = api.activityPlans.getById.useQuery(
    { id: preselectedActivityPlanId ?? "" },
    {
      enabled: draft.mode === "planned" && !!preselectedActivityPlanId,
    },
  );

  const selectedCreateActivityPlan = useMemo(() => {
    if (draft.mode !== "planned") return null;
    return knownActivityPlans.find((plan) => plan.id === draft.activityPlanId) ?? null;
  }, [draft, knownActivityPlans]);
  const selectedRoute = useMemo(
    () => knownRoutes.find((route) => route.id === draft.routeId) ?? null,
    [draft.routeId, knownRoutes],
  );
  const existingEventReadOnly = Boolean(
    updateEvent && !isExistingEventActivityPlanEditable(updateEvent),
  );

  useEffect(() => {
    const plans = activityPlansData?.items ?? [];
    if (plans.length === 0) return;
    setKnownActivityPlans((current) => {
      const next: ActivityPlanListItem[] = [...plans];
      for (const plan of current) {
        if (!next.some((item) => item.id === plan.id)) {
          next.push(plan);
        }
      }
      return next;
    });
  }, [activityPlansData?.items]);

  const handleSelectPlan = useCallback(
    (plan: ActivityPlanListItem) => {
      if (existingEventReadOnly) return;
      setKnownActivityPlans((current) =>
        current.some((item) => item.id === plan.id) ? current : [...current, plan],
      );
      setDraft((current) => {
        if (current.mode !== "planned") return current;
        return {
          ...current,
          activityPlanId: plan.id,
          activityPlanName: plan.name,
          title: plan.name,
        };
      });
      setFormErrorMessage(null);
      AccessibilityInfo?.announceForAccessibility?.(`Selected activity plan ${plan.name}`);
    },
    [existingEventReadOnly],
  );

  useEffect(() => {
    const detail = preselectedActivityPlan?.detail;
    if (!detail) return;
    setKnownActivityPlans((current) =>
      current.some((plan) => plan.id === detail.id) ? current : [...current, detail],
    );
  }, [preselectedActivityPlan]);

  useEffect(() => {
    if (draft.mode !== "planned" || !preselectedActivityPlanId || draft.activityPlanId) {
      return;
    }

    const selectedPlan = knownActivityPlans.find((plan) => plan.id === preselectedActivityPlanId);
    if (!selectedPlan) return;
    if (!isDraftDirtyRef.current) {
      initialDraftKeyRef.current = draftKey({
        ...draft,
        activityPlanId: selectedPlan.id,
        activityPlanName: selectedPlan.name,
        title: selectedPlan.name,
      });
    }
    handleSelectPlan(selectedPlan);
  }, [draft, knownActivityPlans, preselectedActivityPlanId, handleSelectPlan]);

  useEffect(() => {
    if (!preselectedRoute) return;
    setKnownRoutes((current) =>
      current.some((route) => route.id === preselectedRoute.id)
        ? current
        : [...current, preselectedRoute],
    );
  }, [preselectedRoute]);

  useEffect(() => {
    const updateActivityPlan = updateEvent?.activityPlanSummary;
    if (updateActivityPlan) {
      setKnownActivityPlans((current) =>
        current.some((plan) => plan.id === updateActivityPlan.id)
          ? current
          : [...current, updateActivityPlan],
      );
    }
  }, [updateEvent?.activityPlanSummary]);

  useEffect(() => {
    const route = updateEvent?.route;
    if (!route) return;
    setKnownRoutes((current) =>
      current.some((item) => item.id === route.id) ? current : [...current, route],
    );
  }, [updateEvent?.route]);

  useEffect(() => {
    if (!updateEvent) return;
    if (isDraftDirtyRef.current) return;
    const nextDraft = buildDraftFromEvent(updateEvent);
    initialDraftKeyRef.current = draftKey(nextDraft);
    setDraft(nextDraft);
    setStep("main");
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
  }, [updateEvent?.id, updateEvent]);

  useEffect(() => {
    if (updateEvent) return;
    if (isDraftDirtyRef.current) return;
    const nextDraft = withPreselectedRoute(
      createDefaultEventDraft(
        omitUndefined({
          createDate,
          mode: initialMode,
          notes: initialNotes,
          title: defaults?.title,
        }),
      ),
      preselectedRoute,
    );
    initialDraftKeyRef.current = draftKey(nextDraft);
    setDraft(nextDraft);
    setStep("main");
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
  }, [createDate, defaults?.title, initialMode, initialNotes, preselectedRoute, updateEvent]);

  useEffect(() => {
    const formValues = toMainFormValues(draft);
    if (areMainFormValuesEqual(form.getValues(), formValues)) {
      syncingFormFromDraftRef.current = false;
      return;
    }

    syncingFormFromDraftRef.current = true;
    form.reset(formValues);
  }, [draft, form]);

  useEffect(() => {
    const formValues = watchedFormValues ?? form.getValues();
    if (syncingFormFromDraftRef.current) {
      if (areMainFormValuesEqual(formValues, toMainFormValues(draft))) {
        syncingFormFromDraftRef.current = false;
      }
      return;
    }

    const nextDraft = applyMainFormValues(draft, formValues);
    if (areMainFormValuesEqual(toMainFormValues(nextDraft), toMainFormValues(draft))) {
      if (!areMainFormValuesEqual(formValues, toMainFormValues(draft))) {
        form.reset(toMainFormValues(draft));
      }
      return;
    }

    setDraft(nextDraft);
    setFormErrorMessage(null);
    form.clearErrors("title");
    form.clearErrors("timezone");
    setTitleErrorMessage(null);
  }, [draft, form, watchedFormValues]);

  const handleChangeMode = (mode: CreateEventMode) => {
    if (existingEventReadOnly) return;
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
    setDraft((current) => {
      if (current.mode === mode) return current;
      if (mode === "planned") {
        if (current.mode === "custom") {
          customDraftBeforePlannedRef.current = current;
        }
        const scheduledDate = current.scheduledDate;
        return {
          mode: "planned",
          activityPlanId: null,
          activityPlanName: null,
          routeId: current.routeId,
          routeName: current.routeName,
          scheduledDate,
          title: current.title,
          notes: current.notes,
        };
      }

      const startsAt =
        current.mode === "planned"
          ? buildStartsAtFromDateOnly(current.scheduledDate)
          : current.startsAt;
      if (customDraftBeforePlannedRef.current) {
        return customDraftBeforePlannedRef.current;
      }
      return {
        mode: "custom",
        eventType: "custom",
        title: current.title,
        startsAt,
        scheduledDate: current.scheduledDate,
        timezone: current.mode === "planned" ? null : current.timezone,
        allDay: current.mode === "planned" ? true : current.allDay,
        recurrenceFrequency: current.mode === "planned" ? "none" : current.recurrenceFrequency,
        recurrenceEndDate: current.mode === "planned" ? null : current.recurrenceEndDate,
        notes: current.notes,
        routeId: current.routeId,
        routeName: current.routeName,
      };
    });
  };

  const handleRemoveActivityPlan = () => {
    if (existingEventReadOnly) return;
    setFormErrorMessage(null);
    setDraft(removeActivityPlanFromDraft);
  };

  const handleSelectRouteResource = (item: ResourcePickerItem) => {
    const route: EventRouteSummary =
      "routeCardData" in item ? item.routeCardData : { id: item.id, name: item.name };
    setKnownRoutes((current) =>
      current.some((candidate) => candidate.id === route.id) ? current : [...current, route],
    );
    setDraft((current) => ({ ...current, routeId: route.id, routeName: route.name }));
    setFormErrorMessage(null);
    AccessibilityInfo?.announceForAccessibility?.(`Selected route ${route.name}`);
    setRoutePickerOpen(false);
  };

  const handleRemoveRoute = () => {
    setFormErrorMessage(null);
    setDraft((current) => ({ ...current, routeId: null, routeName: null }));
  };

  const handleSelectPlanResource = (item: ResourcePickerItem) => {
    if (existingEventReadOnly) return;
    if (!("activityPlan" in item)) return;
    handleSelectPlan(item.activityPlan);
    setActivityPlanPickerOpen(false);
  };

  const validateDraft = (nextDraft: CreateEventDraft) => {
    if (nextDraft.mode === "planned" && !nextDraft.activityPlanId) {
      setFormErrorMessage("Choose an activity plan before saving.");
      return false;
    }

    if (nextDraft.mode === "custom" && !nextDraft.title.trim()) {
      form.setError("title", { message: "Please add a title for this event." });
      return false;
    }
    if (nextDraft.mode === "custom" && !nextDraft.timezone) {
      form.setError("timezone", { message: "Choose the event time zone." });
      return false;
    }

    const preservesOpenEndedExistingRecurrence =
      updateEvent &&
      !parseRecurrenceEndDate(updateEvent) &&
      parseRecurrenceFrequency(updateEvent) ===
        (nextDraft.mode === "custom" ? nextDraft.recurrenceFrequency : "none");

    if (
      nextDraft.mode === "custom" &&
      nextDraft.recurrenceFrequency !== "none" &&
      !nextDraft.recurrenceEndDate &&
      !preservesOpenEndedExistingRecurrence
    ) {
      setRecurrenceErrorMessage("Choose when this repeating series should end.");
      setStep("repeat");
      return false;
    }
    if (
      nextDraft.mode === "custom" &&
      nextDraft.recurrenceEndDate &&
      nextDraft.recurrenceEndDate < nextDraft.scheduledDate
    ) {
      setRecurrenceErrorMessage("Repeat end date must be on or after the event start date.");
      setStep("repeat");
      return false;
    }

    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
    return true;
  };

  const hasUnsupportedSeriesChanges = (nextDraft: CreateEventDraft) => {
    if (!updateEvent || nextDraft.mode !== "custom") return false;
    const current = buildDraftFromEvent(updateEvent);
    if (current.mode !== "custom") return true;
    return (
      current.allDay !== nextDraft.allDay ||
      current.scheduledDate !== nextDraft.scheduledDate ||
      (!nextDraft.allDay &&
        (current.startsAt.getHours() !== nextDraft.startsAt.getHours() ||
          current.startsAt.getMinutes() !== nextDraft.startsAt.getMinutes())) ||
      current.routeId !== nextDraft.routeId ||
      current.timezone !== nextDraft.timezone
    );
  };

  const submitUpdateWithScope = (nextDraft: CreateEventDraft, scope: EventMutationScope) => {
    if (existingEventReadOnly) return;
    if (!updateEvent?.id || !validateDraft(nextDraft)) return;
    if (scope !== "single" && hasUnsupportedSeriesChanges(nextDraft)) {
      setFormErrorMessage(
        "This and future events and the entire series can only change title and notes. Save schedule or route changes to this event only.",
      );
      return;
    }
    try {
      const fullPatch = buildUpdatePatch(nextDraft);
      updateMutation.mutate({
        id: updateEvent.id,
        scope,
        patch:
          scope === "single"
            ? fullPatch
            : {
                notes: fullPatch.notes,
                title: fullPatch.title,
              },
      });
    } catch (error) {
      setFormErrorMessage(
        error instanceof Error
          ? error.message
          : "This time cannot be scheduled in the event time zone.",
      );
    }
  };

  const runUpdate = (nextDraft: CreateEventDraft) => {
    const recurring = Boolean(
      updateEvent?.series_id || updateEvent?.recurrence_rule || updateEvent?.recurrence?.rule,
    );
    if (recurring) {
      if (validateDraft(nextDraft)) setPendingUpdateDraft(nextDraft);
      return;
    }
    submitUpdateWithScope(nextDraft, "single");
  };

  const handleSelectUpdateScope = (scope: EventMutationScope) => {
    if (!pendingUpdateDraft) return;
    const nextDraft = pendingUpdateDraft;
    setPendingUpdateDraft(null);
    submitUpdateWithScope(nextDraft, scope);
  };

  const submitCreate = () => {
    if (existingEventReadOnly) return;
    if (updateEvent) {
      runUpdate(draft);
      return;
    }

    if (!validateDraft(draft)) return;
    try {
      if (draft.mode === "planned") {
        if (!profileId || !draft.activityPlanId) {
          setFormErrorMessage("Wait for your profile and choose an activity plan before saving.");
          return;
        }
        createPlannedSessionMutation.mutate(
          buildDirectPlannedSessionCreateInput({
            profileId,
            planningDate: draft.scheduledDate,
            operationId: directOperationId.current,
            activityPlanId: draft.activityPlanId,
          }),
        );
      } else {
        createMutation.mutate(buildCreateEventInput(draft));
      }
    } catch (error) {
      setFormErrorMessage(
        error instanceof Error
          ? error.message
          : "This time cannot be scheduled in the event time zone.",
      );
    }
  };

  const pending =
    createMutation.isPending || updateMutation.isPending || createPlannedSessionMutation.isPending;
  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  const isDirty = isDraftDirty;
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);
  const submitCreateRef = useRef(submitCreate);
  submitCreateRef.current = submitCreate;

  useImperativeHandle(
    ref,
    () => ({
      submit: () => {
        if (!pending) {
          submitCreateRef.current();
        }
      },
    }),
    [pending],
  );

  if (existingEventReadOnly) {
    return (
      <CreateEventMainStep
        control={form.control}
        draft={draft}
        isPending={pending}
        isReadOnly
        onCancel={onCancel}
        onChangeMode={handleChangeMode}
        onOpenActivityPlan={() => {}}
        onOpenRoute={() => {}}
        onOpenRepeat={() => {}}
        onSubmit={submitCreate}
        selectedActivityPlan={selectedCreateActivityPlan}
        selectedRoute={selectedRoute}
        testIDPrefix={testIDPrefix}
      />
    );
  }

  if (step === "repeat" && draft.mode === "custom") {
    return (
      <RepeatStep
        control={form.control}
        errorMessage={recurrenceErrorMessage}
        onBack={() => setStep("main")}
        onChangeFrequency={(recurrenceFrequency) => {
          setDraft({
            ...draft,
            recurrenceFrequency,
            recurrenceEndDate: recurrenceFrequency === "none" ? null : draft.recurrenceEndDate,
          } as CreateEventDraft);
          setRecurrenceErrorMessage(null);
        }}
        recurrenceFrequency={draft.recurrenceFrequency}
        testIDPrefix={testIDPrefix}
      />
    );
  }

  return (
    <>
      <Form {...form}>
        <CreateEventMainStep
          control={form.control}
          draft={draft}
          formErrorMessage={formErrorMessage}
          helperText={
            preselectedActivityPlanId
              ? `Review ${selectedCreateActivityPlan?.name ?? "the selected activity plan"} before creating this event.`
              : (defaults?.helperText ?? null)
          }
          isPending={pending}
          onCancel={onCancel}
          onChangeMode={handleChangeMode}
          onOpenActivityPlan={() => {
            if (!existingEventReadOnly) setActivityPlanPickerOpen(true);
          }}
          onOpenRoute={() => setRoutePickerOpen(true)}
          onRemoveActivityPlan={handleRemoveActivityPlan}
          onRemoveRoute={handleRemoveRoute}
          onOpenRepeat={() => {
            if (!updateEvent) setStep("repeat");
          }}
          onSubmit={submitCreate}
          selectedActivityPlan={selectedCreateActivityPlan}
          selectedRoute={selectedRoute}
          showFooterActions={showFooterActions}
          showRepeat={!updateEvent}
          testIDPrefix={testIDPrefix}
          titleErrorMessage={titleErrorMessage}
        />
      </Form>
      {pendingUpdateDraft ? (
        <AppFormModal
          description="Choose how much of this recurring series to update."
          onClose={() => setPendingUpdateDraft(null)}
          secondaryAction={
            <Button onPress={() => setPendingUpdateDraft(null)} variant="outline">
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
          }
          testID={`${testIDPrefix}-scope-modal`}
          title="Recurring Event"
        >
          <View className="gap-3">
            {hasUnsupportedSeriesChanges(pendingUpdateDraft) ? (
              <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
                Schedule, all-day, time zone, and route changes apply only to this event. Future and
                series scopes support title and notes only.
              </Text>
            ) : null}
            <Button
              onPress={() => handleSelectUpdateScope("single")}
              testID={`${testIDPrefix}-scope-single`}
              variant="outline"
            >
              <Text className="text-foreground font-medium">This event only</Text>
            </Button>
            <Button
              disabled={hasUnsupportedSeriesChanges(pendingUpdateDraft)}
              onPress={() => handleSelectUpdateScope("future")}
              testID={`${testIDPrefix}-scope-future`}
              variant="outline"
            >
              <Text className="text-foreground font-medium">This and future events</Text>
            </Button>
            <Button
              disabled={hasUnsupportedSeriesChanges(pendingUpdateDraft)}
              onPress={() => handleSelectUpdateScope("series")}
              testID={`${testIDPrefix}-scope-series`}
              variant="outline"
            >
              <Text className="text-foreground font-medium">Entire series</Text>
            </Button>
          </View>
        </AppFormModal>
      ) : null}
      <ResourcePickerModal
        visible={activityPlanPickerOpen && !existingEventReadOnly}
        scope="activityPlans"
        selectedId={draft.mode === "planned" ? draft.activityPlanId : null}
        title="Choose Activity Plan"
        description="Search activity plans visible to your profile."
        onClose={() => setActivityPlanPickerOpen(false)}
        onSelect={handleSelectPlanResource}
      />
      <ResourcePickerModal
        visible={routePickerOpen}
        scope="routes"
        selectedId={draft.routeId}
        title="Choose Route"
        description="Search routes visible to your profile."
        onClose={() => setRoutePickerOpen(false)}
        onSelect={handleSelectRouteResource}
      />
    </>
  );
});

import { buildDirectPlannedSessionCreateInput } from "@repo/api/client";
