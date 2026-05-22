import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";
import { api } from "@/lib/api";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import {
  type ActivityPlanListItem,
  buildAllDayStartIso,
  buildRecurrenceFromFrequency,
  parseEventDateForEditor,
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "../EventEditorCard";
import { CreateEventMainStep } from "./CreateEventMainStep";
import {
  buildCreateEventInput,
  type CreateEventDraft,
  type CreateEventMode,
  createDefaultEventDraft,
} from "./createEventDraft";
import { RepeatStep } from "./RepeatStep";

type CreateEventStep = "main" | "repeat";
type EventMutationScope = "single" | "future" | "series";

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

function isRecurringEvent(event: any) {
  return !!(event?.series_id || event?.recurrence_rule || event?.recurrence?.rule);
}

function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function buildDraftFromEvent(event: any): CreateEventDraft {
  const startsAt = parseEventDateForEditor(event);
  const recurrenceFrequency = parseRecurrenceFrequency(event);
  const recurrenceEndDate = parseRecurrenceEndDate(event);

  if (event.event_type === "planned" || event.activity_plan_id || event.activity_plan?.id) {
    return {
      mode: "planned",
      activityPlanId: event.activity_plan_id ?? event.activity_plan?.id ?? null,
      activityPlanName: event.activity_plan?.name ?? null,
      scheduledDate: toDateOnly(startsAt),
      recurrenceFrequency,
      recurrenceEndDate,
      title: event.title ?? event.activity_plan?.name ?? "Planned Activity",
      notes: event.notes ?? "",
    };
  }

  return {
    mode: "custom",
    title: event.title ?? "",
    startsAt,
    allDay: !!event.all_day,
    recurrenceFrequency,
    recurrenceEndDate,
    notes: event.notes ?? "",
  };
}

function buildStartsAtFromDateOnly(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function buildUpdatePatch(draft: CreateEventDraft) {
  const notes = draft.notes.trim() ? draft.notes.trim() : null;

  if (draft.mode === "planned") {
    const startsAt = buildStartsAtFromDateOnly(draft.scheduledDate);
    return {
      activity_plan_id: draft.activityPlanId,
      all_day: true,
      event_type: "planned" as const,
      notes,
      recurrence: buildRecurrenceFromFrequency(draft.recurrenceFrequency, draft.recurrenceEndDate),
      starts_at: buildAllDayStartIso(startsAt),
      timezone: "UTC",
      title: draft.title.trim() || draft.activityPlanName?.trim() || "Planned Activity",
    };
  }

  return {
    activity_plan_id: null,
    all_day: draft.allDay,
    event_type: "custom" as const,
    notes,
    recurrence: buildRecurrenceFromFrequency(draft.recurrenceFrequency, draft.recurrenceEndDate),
    starts_at: draft.allDay ? buildAllDayStartIso(draft.startsAt) : draft.startsAt.toISOString(),
    timezone: "UTC",
    title: draft.title.trim(),
  };
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
    updateEvent?: any;
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
  const [activityPlanPickerOpen, setActivityPlanPickerOpen] = useState(false);
  const [saveScopeModalVisible, setSaveScopeModalVisible] = useState(false);
  const [pendingUpdateDraft, setPendingUpdateDraft] = useState<CreateEventDraft | null>(null);

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
    { id: preselectedActivityPlanId! },
    {
      enabled: draft.mode === "planned" && !!preselectedActivityPlanId,
    },
  );

  const selectedCreateActivityPlan = useMemo(() => {
    if (draft.mode !== "planned") return null;
    return knownActivityPlans.find((plan) => plan.id === draft.activityPlanId) ?? null;
  }, [draft, knownActivityPlans]);

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
  }, [draft, knownActivityPlans, preselectedActivityPlanId]);

  useEffect(() => {
    if (updateEvent?.activity_plan) {
      setKnownActivityPlans((current) =>
        current.some((plan) => plan.id === updateEvent.activity_plan.id)
          ? current
          : [...current, updateEvent.activity_plan as ActivityPlanListItem],
      );
    }
  }, [updateEvent?.activity_plan]);

  useEffect(() => {
    if (!updateEvent) return;
    setDraft(buildDraftFromEvent(updateEvent));
    setStep("main");
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
  }, [updateEvent?.id]);

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

  const handleChangeMode = (mode: CreateEventMode) => {
    setFormErrorMessage(null);
    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);
    setDraft((current) => {
      if (current.mode === mode) return current;
      if (mode === "planned") {
        const scheduledDate =
          current.mode === "custom" ? toDateOnly(current.startsAt) : current.scheduledDate;
        return {
          mode: "planned",
          activityPlanId: null,
          activityPlanName: null,
          scheduledDate,
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
        title: current.title,
        startsAt,
        allDay: current.mode === "planned" ? true : current.allDay,
        recurrenceFrequency: current.recurrenceFrequency,
        recurrenceEndDate: current.recurrenceEndDate,
        notes: current.notes,
      };
    });
  };

  const handleRemoveActivityPlan = () => {
    setFormErrorMessage(null);
    setDraft((current) => {
      if (current.mode !== "planned") return current;
      const startsAt = buildStartsAtFromDateOnly(current.scheduledDate);
      return {
        mode: "custom",
        title: current.title,
        startsAt,
        allDay: true,
        recurrenceFrequency: current.recurrenceFrequency,
        recurrenceEndDate: current.recurrenceEndDate,
        notes: current.notes,
      };
    });
  };

  const handleSelectPlan = (plan: ActivityPlanListItem) => {
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
  };

  const handleSelectPlanResource = (item: ResourcePickerItem) => {
    handleSelectPlan({
      activity_category: item.activityCategory ?? null,
      authoritative_metrics: {
        estimated_duration: item.estimatedDuration ?? null,
        estimated_tss: item.estimatedTss ?? null,
      },
      description: item.description ?? null,
      id: item.id,
      name: item.name,
    } as ActivityPlanListItem);
    setActivityPlanPickerOpen(false);
  };

  const validateDraft = (nextDraft: CreateEventDraft) => {
    if (nextDraft.mode === "planned" && !nextDraft.activityPlanId) {
      setFormErrorMessage("Choose an activity plan before saving.");
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
    if (!updateEvent?.id || !validateDraft(nextDraft)) return;
    updateMutation.mutate({
      id: updateEvent.id,
      scope,
      patch: buildUpdatePatch(nextDraft),
    } as any);
  };

  const submitCreate = () => {
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
    createMutation.mutate(buildCreateEventInput(draft, { trainingPlanId }) as any);
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  useImperativeHandle(
    ref,
    () => ({
      submit: () => {
        if (!pending) {
          submitCreate();
        }
      },
    }),
    [pending, submitCreate],
  );

  if (step === "repeat") {
    return (
      <RepeatStep
        errorMessage={recurrenceErrorMessage}
        onBack={() => setStep("main")}
        onChangeEndDate={(recurrenceEndDate) => {
          setDraft({ ...draft, recurrenceEndDate } as CreateEventDraft);
          setRecurrenceErrorMessage(null);
        }}
        onChangeFrequency={(recurrenceFrequency) => {
          setDraft({
            ...draft,
            recurrenceFrequency,
            recurrenceEndDate: recurrenceFrequency === "none" ? null : draft.recurrenceEndDate,
          } as CreateEventDraft);
          setRecurrenceErrorMessage(null);
        }}
        recurrenceEndDate={draft.recurrenceEndDate}
        recurrenceFrequency={draft.recurrenceFrequency}
        testIDPrefix={testIDPrefix}
      />
    );
  }

  return (
    <>
      <CreateEventMainStep
        draft={draft}
        formErrorMessage={formErrorMessage}
        helperText={
          preselectedActivityPlanId
            ? `Review ${selectedCreateActivityPlan?.name ?? "the selected activity plan"} before creating this event.`
            : (defaults?.helperText ?? null)
        }
        isPending={pending}
        onCancel={onCancel}
        onChangeDraft={(nextDraft) => {
          setDraft(nextDraft);
          setFormErrorMessage(null);
          setTitleErrorMessage(null);
        }}
        onChangeMode={handleChangeMode}
        onOpenActivityPlan={() => setActivityPlanPickerOpen(true)}
        onRemoveActivityPlan={handleRemoveActivityPlan}
        onOpenRepeat={() => setStep("repeat")}
        onSubmit={submitCreate}
        selectedActivityPlan={selectedCreateActivityPlan}
        showFooterActions={showFooterActions}
        testIDPrefix={testIDPrefix}
        titleErrorMessage={titleErrorMessage}
      />
      <ResourcePickerModal
        visible={activityPlanPickerOpen}
        scope="activityPlans"
        selectedId={draft.mode === "planned" ? draft.activityPlanId : null}
        title="Choose Activity Plan"
        description="Search activity plans visible to your profile."
        onClose={() => setActivityPlanPickerOpen(false)}
        onSelect={handleSelectPlanResource}
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
