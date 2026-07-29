import { Button } from "@repo/ui/components/button";
import { Form } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { AccessibilityInfo } from "react-native";
import { z } from "zod";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";
import { api } from "@/lib/api";
import { getDeviceTimeZone, getEventScheduledDate } from "@/lib/calendar/eventSchedule";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
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
});

export type CreateEventDefaults = {
  createEventType?: CreateEventMode | null;
  helperText?: string | null;
  notes?: string;
  title?: string;
};

export type CreateEventFlowHandle = {
  submit: () => void;
};

function mergeNotes(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n\n");
}

type EditableEvent = {
  activity_plan?: ActivityPlanListItem | null;
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

function isRecurringEvent(event: EditableEvent | null | undefined) {
  return !!(event?.series_id || event?.recurrence_rule || event?.recurrence?.rule);
}

function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function buildDraftFromEvent(event: EditableEvent): CreateEventDraft {
  const startsAt = parseEventDateForEditor(event);
  const scheduledDate = getEventScheduledDate(event) ?? toDateOnly(startsAt);
  const timezone = event.timezone || getDeviceTimeZone();
  const recurrenceFrequency = parseRecurrenceFrequency(event);
  const recurrenceEndDate = parseRecurrenceEndDate(event);

  if (event.event_type === "planned" || event.activity_plan_id || event.activity_plan?.id) {
    return {
      mode: "planned",
      activityPlanId: event.activity_plan_id ?? event.activity_plan?.id ?? null,
      activityPlanName: event.activity_plan?.name ?? null,
      routeId: event.route_id ?? event.route?.id ?? null,
      routeName: event.route?.name ?? null,
      scheduledDate,
      timezone,
      recurrenceFrequency,
      recurrenceEndDate,
      title: event.title ?? event.activity_plan?.name ?? "Planned Activity",
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
      recurrenceEndDate: draft.recurrenceEndDate,
      title: draft.title,
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
  };
}

function applyMainFormValues(draft: CreateEventDraft, values: EventFormValues): CreateEventDraft {
  if (draft.mode === "planned") {
    return {
      ...draft,
      notes: values.notes,
      recurrenceEndDate: values.recurrenceEndDate,
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
    left.title === right.title
  );
}

export const CreateEventFlow = forwardRef<
  CreateEventFlowHandle,
  {
    createDate?: string;
    defaults?: CreateEventDefaults | null;
    onCancel: () => void;
    onCreated: (event: { id: string }) => void;
    onUpdated?: (event: { id: string }) => void;
    preselectedActivityPlanId?: string;
    scheduleGapNote?: string | null;
    showFooterActions?: boolean;
    testIDPrefix?: string;
    trainingPlanId?: string;
    updateEvent?: EditableEvent;
  }
>(function CreateEventFlow(
  {
    createDate,
    defaults,
    onCancel,
    onCreated,
    onUpdated,
    preselectedActivityPlanId,
    scheduleGapNote,
    showFooterActions = true,
    testIDPrefix = "event-detail",
    trainingPlanId,
    updateEvent,
  },
  ref,
) {
  const queryClient = useQueryClient();
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
      : createDefaultEventDraft({
          createDate,
          mode: initialMode,
          notes: initialNotes,
          title: defaults?.title,
        }),
  );
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [titleErrorMessage, setTitleErrorMessage] = useState<string | null>(null);
  const [recurrenceErrorMessage, setRecurrenceErrorMessage] = useState<string | null>(null);
  const [knownActivityPlans, setKnownActivityPlans] = useState<ActivityPlanListItem[]>([]);
  const [knownRoutes, setKnownRoutes] = useState<EventRouteSummary[]>([]);
  const [activityPlanPickerOpen, setActivityPlanPickerOpen] = useState(false);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [saveScopeModalVisible, setSaveScopeModalVisible] = useState(false);
  const [pendingUpdateDraft, setPendingUpdateDraft] = useState<CreateEventDraft | null>(null);
  const form = useZodForm<EventFormValues>({
    schema: createEventMainFormSchema,
    defaultValues: toMainFormValues(draft),
  });
  const watchedFormValues = useWatch({ control: form.control }) as EventFormValues;
  const syncingFormFromDraftRef = useRef(false);

  const createMutation = api.events.create.useMutation({
    onSuccess: async (createdEvent) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      onCreated(createdEvent);
    },
  });
  const updateMutation = api.events.update.useMutation({
    onSuccess: async (updatedEvent) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      onUpdated?.(updatedEvent as { id: string });
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
    const plans = (activityPlansData?.items ?? []) as ActivityPlanListItem[];
    if (plans.length === 0) return;
    setKnownActivityPlans((current) => {
      const next = [...plans];
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
    if (!preselectedActivityPlan) return;
    setKnownActivityPlans((current) =>
      current.some((plan) => plan.id === preselectedActivityPlan.id)
        ? current
        : [...current, preselectedActivityPlan as ActivityPlanListItem],
    );
  }, [preselectedActivityPlan]);

  useEffect(() => {
    if (draft.mode !== "planned" || !preselectedActivityPlanId || draft.activityPlanId) {
      return;
    }

    const selectedPlan = knownActivityPlans.find((plan) => plan.id === preselectedActivityPlanId);
    if (!selectedPlan) return;
    handleSelectPlan(selectedPlan);
  }, [draft, knownActivityPlans, preselectedActivityPlanId, handleSelectPlan]);

  useEffect(() => {
    const updateActivityPlan = updateEvent?.activity_plan;
    if (updateActivityPlan) {
      setKnownActivityPlans((current) =>
        current.some((plan) => plan.id === updateActivityPlan.id)
          ? current
          : [...current, updateActivityPlan],
      );
    }
  }, [updateEvent?.activity_plan]);

  useEffect(() => {
    const route = updateEvent?.route;
    if (!route) return;
    setKnownRoutes((current) =>
      current.some((item) => item.id === route.id) ? current : [...current, route],
    );
  }, [updateEvent?.route]);

  useEffect(() => {
    if (!updateEvent) return;
    setDraft(buildDraftFromEvent(updateEvent));
    setStep("main");
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
  }, [updateEvent?.id, updateEvent]);

  useEffect(() => {
    if (updateEvent) return;
    setDraft(
      createDefaultEventDraft({
        createDate,
        mode: initialMode,
        notes: initialNotes,
        title: defaults?.title,
      }),
    );
    setStep("main");
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
  }, [createDate, defaults?.title, initialMode, initialNotes, updateEvent]);

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
        const scheduledDate = current.scheduledDate;
        return {
          mode: "planned",
          activityPlanId: null,
          activityPlanName: null,
          routeId: current.routeId,
          routeName: current.routeName,
          scheduledDate,
          timezone: current.timezone,
          recurrenceFrequency: current.recurrenceFrequency,
          recurrenceEndDate: current.recurrenceEndDate,
          title: current.title,
          notes: current.notes,
        };
      }

      const startsAt =
        current.mode === "planned"
          ? buildStartsAtFromDateOnly(current.scheduledDate)
          : current.startsAt;
      return {
        mode: "custom",
        eventType: "custom",
        title: current.title,
        startsAt,
        scheduledDate: current.scheduledDate,
        timezone: current.timezone,
        allDay: current.mode === "planned" ? true : current.allDay,
        recurrenceFrequency: current.recurrenceFrequency,
        recurrenceEndDate: current.recurrenceEndDate,
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
    handleSelectPlan({
      authoritative_metrics: {
        estimated_duration: item.estimatedDuration ?? null,
        estimated_tss: item.estimatedTss ?? null,
      },
      description: item.description ?? null,
      activity_category: item.activityCategory ?? "other",
      id: item.id,
      name: item.name,
    });
    setActivityPlanPickerOpen(false);
  };

  const validateDraft = (nextDraft: CreateEventDraft) => {
    if (nextDraft.mode === "planned" && !nextDraft.activityPlanId && !nextDraft.routeId) {
      setFormErrorMessage("Choose an activity plan, a route, or both before saving.");
      return false;
    }

    if (nextDraft.mode === "custom" && !nextDraft.title.trim()) {
      setTitleErrorMessage("Please add a title for this event.");
      return false;
    }

    if (nextDraft.recurrenceFrequency !== "none" && !nextDraft.recurrenceEndDate) {
      setRecurrenceErrorMessage("Choose when this repeating series should end.");
      setStep("repeat");
      return false;
    }

    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
    return true;
  };

  const runUpdate = (nextDraft: CreateEventDraft, scope: EventMutationScope = "single") => {
    if (existingEventReadOnly) return;
    if (!updateEvent?.id || !validateDraft(nextDraft)) return;
    try {
      updateMutation.mutate({
        id: updateEvent.id,
        scope,
        patch: buildUpdatePatch(nextDraft),
      });
    } catch (error) {
      setFormErrorMessage(
        error instanceof Error
          ? error.message
          : "This time cannot be scheduled in the event time zone.",
      );
    }
  };

  const submitCreate = () => {
    if (existingEventReadOnly) return;
    if (updateEvent) {
      if (isRecurringEvent(updateEvent)) {
        if (!validateDraft(draft)) return;
        setPendingUpdateDraft(draft);
        setSaveScopeModalVisible(true);
        return;
      }

      runUpdate(draft, "single");
      return;
    }

    if (!validateDraft(draft)) return;
    try {
      createMutation.mutate(buildCreateEventInput(draft, { trainingPlanId }));
    } catch (error) {
      setFormErrorMessage(
        error instanceof Error
          ? error.message
          : "This time cannot be scheduled in the event time zone.",
      );
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;
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

  if (step === "repeat") {
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
          onOpenRepeat={() => setStep("repeat")}
          onSubmit={submitCreate}
          selectedActivityPlan={selectedCreateActivityPlan}
          selectedRoute={selectedRoute}
          showFooterActions={showFooterActions}
          testIDPrefix={testIDPrefix}
          titleErrorMessage={titleErrorMessage}
        />
      </Form>
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
      {saveScopeModalVisible ? (
        <AppFormModal
          description="Choose how much of this recurring event series to update."
          onClose={() => {
            setSaveScopeModalVisible(false);
            setPendingUpdateDraft(null);
          }}
          testID={`${testIDPrefix}-scope-modal`}
          title="Recurring Event"
        >
          <Button
            onPress={() => {
              if (pendingUpdateDraft) runUpdate(pendingUpdateDraft, "single");
              setSaveScopeModalVisible(false);
              setPendingUpdateDraft(null);
            }}
            testID={`${testIDPrefix}-scope-single`}
            variant="outline"
          >
            <Text className="text-foreground font-medium">This event only</Text>
          </Button>
          <Button
            onPress={() => {
              if (pendingUpdateDraft) runUpdate(pendingUpdateDraft, "future");
              setSaveScopeModalVisible(false);
              setPendingUpdateDraft(null);
            }}
            testID={`${testIDPrefix}-scope-future`}
            variant="outline"
          >
            <Text className="text-foreground font-medium">This and future events</Text>
          </Button>
          <Button
            onPress={() => {
              if (pendingUpdateDraft) runUpdate(pendingUpdateDraft, "series");
              setSaveScopeModalVisible(false);
              setPendingUpdateDraft(null);
            }}
            testID={`${testIDPrefix}-scope-series`}
            variant="outline"
          >
            <Text className="text-foreground font-medium">Entire series</Text>
          </Button>
        </AppFormModal>
      ) : null}
    </>
  );
});
