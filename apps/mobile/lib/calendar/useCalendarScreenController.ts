import type { ActivityPayload } from "@repo/core";
import { type RefObject, useCallback } from "react";
import { Alert } from "react-native";
import { getMonthAnchor } from "@/lib/calendar/dateMath";
import { isRecurringEvent } from "@/lib/calendar/eventPresentation";
import { buildEditEventRoute, buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import {
  buildCalendarQueryWindow,
  ensureCalendarQueryWindowCovers,
} from "@/lib/calendar/queryWindow";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";

type EventMutationScope = "single" | "future" | "series";
type ManualEventCreateType = "race_target" | "custom";

type CreateManualEventInput = {
  createType: ManualEventCreateType;
  title: string;
  notes: string;
  startsAt: Date;
  allDay: boolean;
};

type UseCalendarScreenControllerParams = {
  isMountedRef: RefObject<boolean>;
  activeDate: string;
  visibleAnchor: string;
  todayKey: string;
  rangeStart: string;
  rangeEnd: string;
  setActiveDate: (activeDate: string) => void;
  setVisibleAnchor: (visibleAnchor: string) => void;
  setSelectedEventId: (selectedEventId: string | null) => void;
  setSheetState: (sheetState: "closed" | "calendar-actions" | "event-preview") => void;
  setRangeStart: (rangeStart: string) => void;
  setRangeEnd: (rangeEnd: string) => void;
  setEditingEventId: (eventId: string | null) => void;
  setEditingEventScope: (scope: EventMutationScope | undefined) => void;
  setShowPlannedActivityPicker: (visible: boolean) => void;
  setSchedulingActivityPlanId: (activityPlanId: string | null) => void;
  setShowManualCreateModal: (visible: boolean) => void;
  setManualCreateType: (type: ManualEventCreateType | null) => void;
  deleteEvent: (input: { id: string; scope?: EventMutationScope }) => void;
  createEvent: (input: {
    event_type: ManualEventCreateType;
    title: string;
    starts_at: string;
    all_day: boolean;
    timezone: string;
    notes?: string;
    lifecycle: { status: "scheduled" };
    read_only: boolean;
  }) => void;
  getCanStartPlannedEvent: (event: CalendarEvent) => boolean;
};

export function useCalendarScreenController({
  isMountedRef,
  visibleAnchor,
  todayKey,
  rangeStart,
  rangeEnd,
  setActiveDate,
  setVisibleAnchor,
  setSelectedEventId,
  setSheetState,
  setRangeStart,
  setRangeEnd,
  setEditingEventId,
  setEditingEventScope,
  setShowPlannedActivityPicker,
  setSchedulingActivityPlanId,
  setShowManualCreateModal,
  setManualCreateType,
  deleteEvent,
  createEvent,
  getCanStartPlannedEvent,
}: UseCalendarScreenControllerParams) {
  const guardNavigation = useNavigationActionGuard();
  const navigateTo = useAppNavigate();

  const resetManualCreateState = useCallback(() => {
    setShowManualCreateModal(false);
    setManualCreateType(null);
  }, [setManualCreateType, setShowManualCreateModal]);

  const closeSheetsAndTransientState = useCallback(() => {
    setSheetState("closed");
    setSelectedEventId(null);
  }, [setSelectedEventId, setSheetState]);

  const dismissOverlaysBeforeNavigation = useCallback(
    (navigate: () => void) => {
      closeSheetsAndTransientState();
      setShowPlannedActivityPicker(false);
      setSchedulingActivityPlanId(null);
      resetManualCreateState();

      if (!isMountedRef.current) return;
      guardNavigation(navigate);
    },
    [
      closeSheetsAndTransientState,
      guardNavigation,
      isMountedRef,
      resetManualCreateState,
      setSchedulingActivityPlanId,
      setShowPlannedActivityPicker,
    ],
  );

  const ensureDateVisible = useCallback(
    (dateKey: string) => {
      const nextAnchor = getMonthAnchor(dateKey);
      const nextWindow =
        nextAnchor < rangeStart || nextAnchor > rangeEnd
          ? buildCalendarQueryWindow(nextAnchor)
          : ensureCalendarQueryWindowCovers({
              rangeStart,
              rangeEnd,
              anchorDate: nextAnchor,
            });

      if (nextWindow.rangeStart !== rangeStart) setRangeStart(nextWindow.rangeStart);
      if (nextWindow.rangeEnd !== rangeEnd) setRangeEnd(nextWindow.rangeEnd);
    },
    [rangeEnd, rangeStart, setRangeEnd, setRangeStart],
  );

  const selectDate = useCallback(
    (dateKey: string) => {
      setActiveDate(dateKey);
      ensureDateVisible(dateKey);
    },
    [ensureDateVisible, setActiveDate],
  );

  const handleTodayPress = useCallback(() => {
    setVisibleAnchor(getMonthAnchor(todayKey));
    selectDate(todayKey);
  }, [selectDate, setVisibleAnchor, todayKey]);

  const handleOpenDayAgenda = useCallback(
    (dateKey: string) => {
      selectDate(dateKey);
      dismissOverlaysBeforeNavigation(() => {
        navigateTo(ROUTES.PLAN.CALENDAR_DAY(dateKey));
      });
    },
    [dismissOverlaysBeforeNavigation, navigateTo, selectDate],
  );

  const initializeManualCreate = useCallback(
    (type: ManualEventCreateType) => {
      closeSheetsAndTransientState();
      setManualCreateType(type);
      setShowManualCreateModal(true);
    },
    [closeSheetsAndTransientState, setManualCreateType, setShowManualCreateModal],
  );

  const handleOpenEvent = useCallback(
    (event: CalendarEvent) => {
      const route = buildOpenEventRoute({
        id: event.id,
        event_type: event.event_type === null ? undefined : (event.event_type as any),
      });
      if (!route) {
        Alert.alert("Open Event", "This event type is read-only.");
        return;
      }

      dismissOverlaysBeforeNavigation(() => {
        navigateTo(route as never);
      });
    },
    [dismissOverlaysBeforeNavigation, navigateTo],
  );

  const handleStartPlannedEvent = useCallback(
    (event: CalendarEvent) => {
      const activityPlan = event.activity_plan;
      if (!activityPlan) {
        handleOpenEvent(event);
        return;
      }

      const payload: ActivityPayload = {
        category: activityPlan.activity_category as ActivityPayload["category"],
        gpsRecordingEnabled: true,
        eventId: event.id,
        plan: activityPlan as ActivityPayload["plan"],
      };

      activitySelectionStore.setSelection(payload);
      dismissOverlaysBeforeNavigation(() => {
        navigateTo(ROUTES.RECORD);
      });
    },
    [dismissOverlaysBeforeNavigation, handleOpenEvent, navigateTo],
  );

  const getRecurringScopeOptions = useCallback(
    (action: "delete" | "move", onSelect: (scope: EventMutationScope) => void) => {
      Alert.alert(
        action === "delete" ? "Delete Recurring Event" : "Move Recurring Event",
        action === "delete"
          ? "Choose how much of this series to delete."
          : "Choose how much of this series to move.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "This event only", onPress: () => onSelect("single") },
          { text: "This and future events", onPress: () => onSelect("future") },
          { text: "Entire series", onPress: () => onSelect("series") },
        ],
      );
    },
    [],
  );

  const handleEditEvent = useCallback(
    (event: CalendarEvent) => {
      if (event.event_type === "planned") {
        setEditingEventScope(isRecurringEvent(event) ? undefined : "single");
        setEditingEventId(event.id);
        return;
      }

      const route = buildEditEventRoute({
        id: event.id,
        event_type: event.event_type === null ? undefined : (event.event_type as any),
      });
      if (!route) {
        Alert.alert("Edit Event", "This event cannot be edited.");
        return;
      }

      dismissOverlaysBeforeNavigation(() => {
        navigateTo(route as never);
      });
    },
    [dismissOverlaysBeforeNavigation, navigateTo, setEditingEventId, setEditingEventScope],
  );

  const handleDeleteEvent = useCallback(
    (event: CalendarEvent) => {
      const confirmDelete = (scope?: EventMutationScope) => {
        Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteEvent(scope ? { id: event.id, scope } : { id: event.id }),
          },
        ]);
      };

      if (isRecurringEvent(event)) {
        getRecurringScopeOptions("delete", (scope) => confirmDelete(scope));
        return;
      }

      confirmDelete();
    },
    [deleteEvent, getRecurringScopeOptions],
  );

  const handleVisibleMonthChange = useCallback(
    (monthStartKey: string) => {
      if (monthStartKey === visibleAnchor) {
        return;
      }

      setVisibleAnchor(monthStartKey);
    },
    [setVisibleAnchor, visibleAnchor],
  );

  const handleCreatePlanned = useCallback(() => {
    setSheetState("closed");
    setShowPlannedActivityPicker(true);
  }, [setSheetState, setShowPlannedActivityPicker]);

  const handlePlannedActivitySelected = useCallback(
    (activityPlanId: string) => {
      setShowPlannedActivityPicker(false);
      setSchedulingActivityPlanId(activityPlanId);
    },
    [setSchedulingActivityPlanId, setShowPlannedActivityPicker],
  );

  const submitManualCreate = useCallback(
    ({ createType, title, notes, startsAt, allDay }: CreateManualEventInput) => {
      const trimmedTitle = title.trim();
      const fallbackTitle = createType === "race_target" ? "Race target" : "Custom event";

      createEvent({
        event_type: createType,
        title: trimmedTitle || fallbackTitle,
        starts_at: startsAt.toISOString(),
        all_day: allDay,
        timezone: "UTC",
        notes: notes.trim() || undefined,
        lifecycle: { status: "scheduled" },
        read_only: false,
      });
    },
    [createEvent],
  );

  return {
    closeSheetsAndTransientState,
    resetManualCreateState,
    selectDate,
    handleTodayPress,
    handleOpenDayAgenda,
    initializeManualCreate,
    handleOpenEvent,
    handleStartPlannedEvent,
    handleEditEvent,
    handleDeleteEvent,
    handleVisibleMonthChange,
    handleCreatePlanned,
    handlePlannedActivitySelected,
    submitManualCreate,
  };
}
