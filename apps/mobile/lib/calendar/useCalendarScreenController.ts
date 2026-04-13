import type { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { type RefObject, useCallback } from "react";
import { Alert } from "react-native";
import { type CalendarMode, getNaturalAnchorForMode, parseDateKey } from "@/lib/calendar/dateMath";
import { getEventTitle, isEditableEvent, isRecurringEvent } from "@/lib/calendar/eventPresentation";
import { buildEditEventRoute, buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { ensureCalendarQueryWindowCovers } from "@/lib/calendar/queryWindow";
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
  mode: CalendarMode;
  todayKey: string;
  rangeStart: string;
  rangeEnd: string;
  setMode: (mode: CalendarMode) => void;
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
  setDraggingEvent: (event: CalendarEvent | null) => void;
  setDraggingScope: (scope: EventMutationScope | undefined) => void;
  deleteEvent: (input: { id: string; scope?: EventMutationScope }) => void;
  moveEvent: (input: { id: string; scheduled_date: string; scope?: EventMutationScope }) => void;
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

export function formatCalendarContextLabel(
  mode: CalendarMode,
  visibleAnchor: string,
  activeDate: string,
): string {
  if (mode === "month") {
    return format(parseDateKey(visibleAnchor), "MMMM yyyy");
  }

  return format(parseDateKey(activeDate), "EEEE, MMM d");
}

export function useCalendarScreenController({
  isMountedRef,
  activeDate,
  visibleAnchor,
  mode,
  todayKey,
  rangeStart,
  rangeEnd,
  setMode,
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
  setDraggingEvent,
  setDraggingScope,
  deleteEvent,
  moveEvent,
  createEvent,
  getCanStartPlannedEvent,
}: UseCalendarScreenControllerParams) {
  const router = useRouter();
  const guardNavigation = useNavigationActionGuard();
  const navigateTo = useAppNavigate();

  const resetManualCreateState = useCallback(() => {
    setShowManualCreateModal(false);
    setManualCreateType(null);
  }, [setManualCreateType, setShowManualCreateModal]);

  const closeSheetsAndTransientState = useCallback(() => {
    setSheetState("closed");
    setSelectedEventId(null);
    setDraggingEvent(null);
    setDraggingScope(undefined);
  }, [setDraggingEvent, setDraggingScope, setSelectedEventId, setSheetState]);

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
    (dateKey: string, nextMode: CalendarMode) => {
      const nextAnchor = getNaturalAnchorForMode(dateKey, nextMode);
      const nextWindow = ensureCalendarQueryWindowCovers({
        rangeStart,
        rangeEnd,
        anchorDate: nextAnchor,
        mode: nextMode,
      });

      if (nextWindow.rangeStart !== rangeStart) setRangeStart(nextWindow.rangeStart);
      if (nextWindow.rangeEnd !== rangeEnd) setRangeEnd(nextWindow.rangeEnd);

      setVisibleAnchor(nextAnchor);
    },
    [rangeEnd, rangeStart, setRangeEnd, setRangeStart, setVisibleAnchor],
  );

  const selectDate = useCallback(
    (dateKey: string, nextMode: CalendarMode = mode) => {
      setActiveDate(dateKey);
      if (nextMode !== mode) {
        setMode(nextMode);
      }
      ensureDateVisible(dateKey, nextMode);
    },
    [ensureDateVisible, mode, setActiveDate, setMode],
  );

  const handleModeChange = useCallback(
    (nextMode: CalendarMode) => {
      if (nextMode === mode) return;
      setMode(nextMode);
      ensureDateVisible(activeDate, nextMode);
    },
    [activeDate, ensureDateVisible, mode, setMode],
  );

  const handleTodayPress = useCallback(() => {
    selectDate(todayKey, mode);
  }, [mode, selectDate, todayKey]);

  const handleResetToDayPress = useCallback(() => {
    selectDate(activeDate, "day");
  }, [activeDate, selectDate]);

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

  const startDragging = useCallback(
    (event: CalendarEvent, scope?: EventMutationScope) => {
      if (!isEditableEvent(event)) {
        Alert.alert("Read-only event", "Imported events are read-only and cannot be moved.");
        return;
      }

      setDraggingEvent(event);
      setDraggingScope(scope);
      setSheetState("closed");
      setSelectedEventId(null);
      selectDate(event.scheduled_date ?? activeDate, "day");
    },
    [activeDate, selectDate, setDraggingEvent, setDraggingScope, setSelectedEventId, setSheetState],
  );

  const handleStartDragFromEvent = useCallback(
    (event: CalendarEvent) => {
      if (isRecurringEvent(event)) {
        getRecurringScopeOptions("move", (scope) => startDragging(event, scope));
        return;
      }

      startDragging(event);
    },
    [getRecurringScopeOptions, startDragging],
  );

  const handleDropOnDate = useCallback(
    (dateKey: string, draggingEvent: CalendarEvent | null, draggingScope?: EventMutationScope) => {
      if (!draggingEvent) return;

      moveEvent(
        draggingScope
          ? { id: draggingEvent.id, scheduled_date: dateKey, scope: draggingScope }
          : { id: draggingEvent.id, scheduled_date: dateKey },
      );
    },
    [moveEvent],
  );

  const handleVisibleDayChange = useCallback(
    (dateKey: string) => {
      if (dateKey === activeDate && dateKey === visibleAnchor) {
        return;
      }

      setActiveDate(dateKey);
      setVisibleAnchor(dateKey);
      const nextWindow = ensureCalendarQueryWindowCovers({
        rangeStart,
        rangeEnd,
        anchorDate: dateKey,
        mode: "day",
      });
      if (nextWindow.rangeStart !== rangeStart) setRangeStart(nextWindow.rangeStart);
      if (nextWindow.rangeEnd !== rangeEnd) setRangeEnd(nextWindow.rangeEnd);
    },
    [
      activeDate,
      rangeEnd,
      rangeStart,
      setActiveDate,
      setRangeEnd,
      setRangeStart,
      setVisibleAnchor,
      visibleAnchor,
    ],
  );

  const handleVisibleMonthChange = useCallback(
    (monthStartKey: string) => {
      if (monthStartKey === visibleAnchor) {
        return;
      }

      setVisibleAnchor(monthStartKey);
      const nextWindow = ensureCalendarQueryWindowCovers({
        rangeStart,
        rangeEnd,
        anchorDate: monthStartKey,
        mode: "month",
      });
      if (nextWindow.rangeStart !== rangeStart) setRangeStart(nextWindow.rangeStart);
      if (nextWindow.rangeEnd !== rangeEnd) setRangeEnd(nextWindow.rangeEnd);
    },
    [rangeEnd, rangeStart, setRangeEnd, setRangeStart, setVisibleAnchor, visibleAnchor],
  );

  const handleOpenEventPreview = useCallback(
    (event: CalendarEvent) => {
      setActiveDate(event.scheduled_date ?? activeDate);
      setSelectedEventId(event.id);
      setSheetState("event-preview");
    },
    [activeDate, setActiveDate, setSelectedEventId, setSheetState],
  );

  const handleQuickActionPress = useCallback(
    (event: CalendarEvent) => {
      if (getCanStartPlannedEvent(event)) {
        handleStartPlannedEvent(event);
        return;
      }

      setSelectedEventId(event.id);
      setSheetState("event-preview");
    },
    [getCanStartPlannedEvent, handleStartPlannedEvent, setSelectedEventId, setSheetState],
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
    handleModeChange,
    handleTodayPress,
    handleResetToDayPress,
    initializeManualCreate,
    handleOpenEvent,
    handleStartPlannedEvent,
    handleEditEvent,
    handleDeleteEvent,
    handleStartDragFromEvent,
    handleDropOnDate,
    handleVisibleDayChange,
    handleVisibleMonthChange,
    handleOpenEventPreview,
    handleQuickActionPress,
    handleCreatePlanned,
    handlePlannedActivitySelected,
    submitManualCreate,
  };
}
