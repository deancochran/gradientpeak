import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import type { ActivityPayload } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CalendarActionsSheet,
  CalendarDayList,
  CalendarEventPreviewSheet,
  CalendarHeader,
  CalendarMonthList,
  CalendarPlannedActivityPickerModal,
} from "@/components/calendar";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader } from "@/components/shared";
import {
  addDaysToDateKey,
  buildDayKeys,
  type CalendarMode,
  getNaturalAnchorForMode,
  getStartOfMonthKey,
  parseDateKey,
  toDateKey,
} from "@/lib/calendar/dateMath";
import { getEventTitle, isEditableEvent, isRecurringEvent } from "@/lib/calendar/eventPresentation";
import { buildEditEventRoute, buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import {
  buildCalendarQueryWindow,
  ensureCalendarQueryWindowCovers,
} from "@/lib/calendar/queryWindow";
import { ROUTES } from "@/lib/constants/routes";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { useCalendarStore } from "@/lib/stores/calendar-store";
import { trpc } from "@/lib/trpc";
import { scheduleAwareReadQueryOptions } from "@/lib/trpc/scheduleQueryOptions";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

type EventCreateType = "planned" | "rest_day" | "race_target" | "custom";
type ManualEventCreateType = Exclude<EventCreateType, "planned">;
type EventMutationScope = "single" | "future" | "series";

const CALENDAR_EVENT_QUERY_LIMIT = 500;

function formatContextLabel(mode: CalendarMode, visibleAnchor: string, activeDate: string): string {
  if (mode === "month") {
    return format(parseDateKey(visibleAnchor), "MMMM yyyy");
  }

  return format(parseDateKey(activeDate), "EEEE, MMM d");
}

function CalendarScreen() {
  const router = useRouter();
  const guardNavigation = useNavigationActionGuard();
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();
  const isMountedRef = useRef(true);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const hydrated = useCalendarStore((state) => state.hydrated);
  const mode = useCalendarStore((state) => state.mode);
  const persistedActiveDate = useCalendarStore((state) => state.activeDate);
  const persistedVisibleAnchor = useCalendarStore((state) => state.visibleAnchor);
  const selectedEventId = useCalendarStore((state) => state.selectedEventId);
  const sheetState = useCalendarStore((state) => state.sheetState);
  const setMode = useCalendarStore((state) => state.setMode);
  const setActiveDate = useCalendarStore((state) => state.setActiveDate);
  const setVisibleAnchor = useCalendarStore((state) => state.setVisibleAnchor);
  const setSelectedEventId = useCalendarStore((state) => state.setSelectedEventId);
  const setSheetState = useCalendarStore((state) => state.setSheetState);

  const activeDate = persistedActiveDate ?? todayKey;
  const visibleAnchor =
    persistedVisibleAnchor ?? getNaturalAnchorForMode(persistedActiveDate ?? todayKey, mode);

  const initialWindow = useMemo(
    () => buildCalendarQueryWindow(visibleAnchor, mode),
    [mode, visibleAnchor],
  );
  const [rangeStart, setRangeStart] = useState(initialWindow.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialWindow.rangeEnd);
  const [refreshing, setRefreshing] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventScope, setEditingEventScope] = useState<EventMutationScope | undefined>();
  const [showPlannedActivityPicker, setShowPlannedActivityPicker] = useState(false);
  const [schedulingActivityPlanId, setSchedulingActivityPlanId] = useState<string | null>(null);
  const [showManualCreateModal, setShowManualCreateModal] = useState(false);
  const [manualCreateType, setManualCreateType] = useState<ManualEventCreateType | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualStartsAt, setManualStartsAt] = useState(new Date());
  const [manualAllDay, setManualAllDay] = useState(false);
  const [showManualDatePicker, setShowManualDatePicker] = useState(false);
  const [showManualTimePicker, setShowManualTimePicker] = useState(false);
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [draggingScope, setDraggingScope] = useState<EventMutationScope | undefined>();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!persistedActiveDate) {
      setActiveDate(todayKey);
    }
    if (!persistedVisibleAnchor) {
      setVisibleAnchor(getNaturalAnchorForMode(todayKey, mode));
    }
  }, [
    mode,
    persistedActiveDate,
    persistedVisibleAnchor,
    setActiveDate,
    setVisibleAnchor,
    todayKey,
  ]);

  useEffect(() => {
    const nextWindow = ensureCalendarQueryWindowCovers({
      rangeStart,
      rangeEnd,
      anchorDate: visibleAnchor,
      mode,
    });

    if (nextWindow.rangeStart !== rangeStart) {
      setRangeStart(nextWindow.rangeStart);
    }
    if (nextWindow.rangeEnd !== rangeEnd) {
      setRangeEnd(nextWindow.rangeEnd);
    }
  }, [mode, rangeEnd, rangeStart, visibleAnchor]);

  const resetManualCreateState = useCallback(() => {
    setShowManualCreateModal(false);
    setManualCreateType(null);
    setManualTitle("");
    setManualNotes("");
    setShowManualDatePicker(false);
    setShowManualTimePicker(false);
  }, []);

  const closeSheetsAndTransientState = useCallback(() => {
    setSheetState("closed");
    setSelectedEventId(null);
    setDraggingEvent(null);
    setDraggingScope(undefined);
  }, [setSelectedEventId, setSheetState]);

  const dismissOverlaysBeforeNavigation = useCallback(
    (navigate: () => void) => {
      closeSheetsAndTransientState();
      setShowPlannedActivityPicker(false);
      setSchedulingActivityPlanId(null);
      resetManualCreateState();

      setTimeout(() => {
        if (!isMountedRef.current) return;
        guardNavigation(navigate);
      }, 0);
    },
    [closeSheetsAndTransientState, guardNavigation, resetManualCreateState],
  );

  const {
    data: activitiesData,
    isLoading: loadingEvents,
    refetch: refetchActivities,
  } = trpc.events.list.useQuery(
    {
      date_from: rangeStart,
      date_to: rangeEnd,
      include_adhoc: true,
      limit: CALENDAR_EVENT_QUERY_LIMIT,
    },
    scheduleAwareReadQueryOptions,
  );

  const deleteEventMutation = trpc.events.delete.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      closeSheetsAndTransientState();
      await refreshScheduleWithCallbacks({
        queryClient,
        scope: "eventDeletionMutation",
        callbacks: [refetchActivities],
      });
    },
  });

  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      resetManualCreateState();
      await refreshScheduleWithCallbacks({ queryClient, callbacks: [refetchActivities] });
    },
  });

  const moveEventMutation = trpc.events.update.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      closeSheetsAndTransientState();
      await refreshScheduleWithCallbacks({ queryClient, callbacks: [refetchActivities] });
    },
  });

  const events = useMemo(
    () => (activitiesData?.items ?? []) as CalendarEvent[],
    [activitiesData?.items],
  );
  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const dayKeys = useMemo(() => buildDayKeys(rangeStart, rangeEnd), [rangeEnd, rangeStart]);
  const pageHeight = Math.max(460, height - 240);
  const activeDayEventCount = eventsByDate.get(activeDate)?.length ?? 0;
  const headerTitle = formatContextLabel(mode, visibleAnchor, activeDate);
  const headerSubtitle = draggingEvent
    ? `Choose a day for ${getEventTitle(draggingEvent)}.`
    : `${activeDayEventCount} ${activeDayEventCount === 1 ? "event" : "events"} on ${format(parseDateKey(activeDate), "MMM d")}`;

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
    [rangeEnd, rangeStart, setVisibleAnchor],
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

  const initializeManualCreate = useCallback(
    (type: ManualEventCreateType) => {
      closeSheetsAndTransientState();
      const baseDate = new Date(`${activeDate}T09:00:00.000Z`);
      setManualCreateType(type);
      setManualStartsAt(baseDate);
      setManualTitle("");
      setManualNotes("");
      setManualAllDay(type === "rest_day");
      setShowManualCreateModal(true);
    },
    [activeDate, closeSheetsAndTransientState],
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
        router.push(route as never);
      });
    },
    [dismissOverlaysBeforeNavigation, router],
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
        router.push(ROUTES.RECORD);
      });
    },
    [dismissOverlaysBeforeNavigation, handleOpenEvent, router],
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
        router.push(route as never);
      });
    },
    [dismissOverlaysBeforeNavigation, router],
  );

  const handleDeleteEvent = useCallback(
    (event: CalendarEvent) => {
      const confirmDelete = (scope?: EventMutationScope) => {
        Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              deleteEventMutation.mutate(scope ? { id: event.id, scope } : { id: event.id }),
          },
        ]);
      };

      if (isRecurringEvent(event)) {
        getRecurringScopeOptions("delete", (scope) => confirmDelete(scope));
        return;
      }

      confirmDelete();
    },
    [deleteEventMutation, getRecurringScopeOptions],
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
    [activeDate, selectDate, setSelectedEventId, setSheetState],
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
    (dateKey: string) => {
      if (!draggingEvent) return;
      moveEventMutation.mutate(
        draggingScope
          ? { id: draggingEvent.id, scheduled_date: dateKey, scope: draggingScope }
          : { id: draggingEvent.id, scheduled_date: dateKey },
      );
    },
    [draggingEvent, draggingScope, moveEventMutation],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchActivities();
    if (!isMountedRef.current) return;
    setRefreshing(false);
  }, [refetchActivities]);

  const handleManualDateChange = useCallback(
    (_: unknown, date?: Date) => {
      setShowManualDatePicker(false);
      if (!date) return;
      const nextDate = new Date(manualStartsAt);
      nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setManualStartsAt(nextDate);
    },
    [manualStartsAt],
  );

  const handleManualTimeChange = useCallback(
    (_: unknown, date?: Date) => {
      setShowManualTimePicker(false);
      if (!date) return;
      const nextDate = new Date(manualStartsAt);
      nextDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setManualStartsAt(nextDate);
    },
    [manualStartsAt],
  );

  const submitManualCreate = useCallback(() => {
    if (!manualCreateType) return;

    const trimmedTitle = manualTitle.trim();
    const fallbackTitle =
      manualCreateType === "rest_day"
        ? "Rest day"
        : manualCreateType === "race_target"
          ? "Race target"
          : "Custom event";

    createEventMutation.mutate({
      event_type: manualCreateType,
      title: trimmedTitle || fallbackTitle,
      starts_at: manualStartsAt.toISOString(),
      all_day: manualAllDay,
      timezone: "UTC",
      notes: manualNotes.trim() || undefined,
    });
  }, [
    createEventMutation,
    manualAllDay,
    manualCreateType,
    manualNotes,
    manualStartsAt,
    manualTitle,
  ]);

  const canSubmitManualCreate =
    !createEventMutation.isPending &&
    !!manualCreateType &&
    (manualCreateType === "rest_day" || manualTitle.trim().length > 0);

  const manualCreateTitle =
    manualCreateType === "rest_day"
      ? "Create Rest Day"
      : manualCreateType === "race_target"
        ? "Create Race Target"
        : manualCreateType === "custom"
          ? "Create Custom Event"
          : "Create Event";

  const getCanStartPlannedEvent = useCallback(
    (event: CalendarEvent) => {
      if (event.event_type !== "planned") return false;
      const isCompleted = isActivityCompleted(event);
      return (
        !isCompleted && typeof event.scheduled_date === "string" && event.scheduled_date >= todayKey
      );
    },
    [todayKey],
  );

  useFocusEffect(
    useCallback(() => {
      void refetchActivities();
    }, [refetchActivities]),
  );

  if (loadingEvents && !activitiesData) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Calendar" />
        <ScrollView className="flex-1 p-6">
          <PlanCalendarSkeleton />
        </ScrollView>
        <View testID="calendar-screen-loading" />
      </View>
    );
  }

  if (!activitiesData) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Calendar" />
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-muted-foreground">
            Unable to load calendar events right now.
          </Text>
          <TouchableOpacity
            onPress={() => void refetchActivities()}
            className="rounded-full border border-border bg-card px-4 py-2"
            activeOpacity={0.85}
          >
            <Text className="text-sm text-foreground">Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="calendar-screen-ready">
      <AppHeader title="Calendar" />
      <CalendarHeader
        mode={mode}
        title={headerTitle}
        subtitle={headerSubtitle}
        onModeChange={handleModeChange}
        onTodayPress={handleTodayPress}
        onActionsPress={() => setSheetState("calendar-actions")}
        onQuickCreatePress={() => setSheetState("calendar-actions")}
      />

      <View className="flex-1" testID="calendar-screen-content-ready">
        {mode === "day" ? (
          <CalendarDayList
            dayKeys={dayKeys}
            activeDate={activeDate}
            todayKey={todayKey}
            pageHeight={pageHeight}
            eventsByDate={eventsByDate}
            draggingEventId={draggingEvent?.id ?? null}
            getCanStartPlannedEvent={getCanStartPlannedEvent}
            onVisibleDateChange={(dateKey) => {
              setVisibleAnchor(dateKey);
              const nextWindow = ensureCalendarQueryWindowCovers({
                rangeStart,
                rangeEnd,
                anchorDate: dateKey,
                mode: "day",
              });
              if (nextWindow.rangeStart !== rangeStart) setRangeStart(nextWindow.rangeStart);
              if (nextWindow.rangeEnd !== rangeEnd) setRangeEnd(nextWindow.rangeEnd);
            }}
            onSelectDate={(dateKey) => selectDate(dateKey, "day")}
            onOpenEvent={(event) => {
              setActiveDate(event.scheduled_date ?? activeDate);
              setSelectedEventId(event.id);
              setSheetState("event-preview");
            }}
            onQuickActionPress={(event) => {
              if (getCanStartPlannedEvent(event)) {
                handleStartPlannedEvent(event);
                return;
              }

              setSelectedEventId(event.id);
              setSheetState("event-preview");
            }}
            onDragStart={handleStartDragFromEvent}
            onDropOnDate={handleDropOnDate}
          />
        ) : (
          <CalendarMonthList
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            activeDate={activeDate}
            todayKey={todayKey}
            eventsByDate={eventsByDate}
            onVisibleMonthChange={(monthStartKey) => {
              setVisibleAnchor(monthStartKey);
              const nextWindow = ensureCalendarQueryWindowCovers({
                rangeStart,
                rangeEnd,
                anchorDate: monthStartKey,
                mode: "month",
              });
              if (nextWindow.rangeStart !== rangeStart) setRangeStart(nextWindow.rangeStart);
              if (nextWindow.rangeEnd !== rangeEnd) setRangeEnd(nextWindow.rangeEnd);
            }}
            onSelectDay={(dateKey) => selectDate(dateKey, "day")}
          />
        )}
      </View>

      <CalendarActionsSheet
        visible={sheetState === "calendar-actions"}
        selectedDate={activeDate}
        onClose={() => setSheetState("closed")}
        onCreatePlanned={() => {
          setSheetState("closed");
          setShowPlannedActivityPicker(true);
        }}
        onCreateRestDay={() => initializeManualCreate("rest_day")}
        onCreateRaceTarget={() => initializeManualCreate("race_target")}
        onCreateCustom={() => initializeManualCreate("custom")}
        onJumpToToday={handleTodayPress}
      />

      <CalendarEventPreviewSheet
        event={selectedEvent}
        visible={sheetState === "event-preview"}
        onClose={() => closeSheetsAndTransientState()}
        onOpenDetail={() => (selectedEvent ? handleOpenEvent(selectedEvent) : undefined)}
        onEdit={() => {
          if (selectedEvent) handleEditEvent(selectedEvent);
        }}
        onDelete={() => {
          if (selectedEvent) handleDeleteEvent(selectedEvent);
        }}
        onMove={() => {
          if (selectedEvent) handleStartDragFromEvent(selectedEvent);
        }}
        onStart={
          selectedEvent && getCanStartPlannedEvent(selectedEvent)
            ? () => handleStartPlannedEvent(selectedEvent)
            : null
        }
      />

      {editingEventId ? (
        <ScheduleActivityModal
          visible
          onClose={() => {
            setEditingEventId(null);
            setEditingEventScope(undefined);
          }}
          eventId={editingEventId}
          editScope={editingEventScope}
          onSuccess={() => {
            if (!isMountedRef.current) return;
            setEditingEventId(null);
            setEditingEventScope(undefined);
            void handleRefresh();
          }}
        />
      ) : null}

      {schedulingActivityPlanId ? (
        <ScheduleActivityModal
          visible
          onClose={() => setSchedulingActivityPlanId(null)}
          activityPlanId={schedulingActivityPlanId}
          preselectedDate={activeDate}
          onSuccess={() => {
            if (!isMountedRef.current) return;
            setSchedulingActivityPlanId(null);
            void handleRefresh();
            selectDate(activeDate, "day");
          }}
        />
      ) : null}

      <CalendarPlannedActivityPickerModal
        visible={showPlannedActivityPicker}
        selectedDate={activeDate}
        onClose={() => setShowPlannedActivityPicker(false)}
        onSelectPlan={(activityPlanId: string) => {
          setShowPlannedActivityPicker(false);
          setSchedulingActivityPlanId(activityPlanId);
        }}
      />

      {showManualCreateModal && manualCreateType ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={resetManualCreateState}
        >
          <View className="flex-1 bg-background">
            <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
              <Text className="text-lg font-semibold">{manualCreateTitle}</Text>
              <TouchableOpacity
                onPress={resetManualCreateState}
                className="rounded-md bg-muted px-3 py-2"
                activeOpacity={0.8}
                testID="close-manual-create"
              >
                <Text className="text-xs">Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1">
              <View className="gap-4 px-4 py-4" testID="manual-create-modal">
                <View>
                  <Text className="mb-2 text-sm font-medium">
                    Title {manualCreateType === "rest_day" ? "(optional)" : ""}
                  </Text>
                  <Input
                    value={manualTitle}
                    onChangeText={setManualTitle}
                    placeholder={
                      manualCreateType === "rest_day"
                        ? "Rest day"
                        : manualCreateType === "race_target"
                          ? "Race target"
                          : "Custom event"
                    }
                    editable={!createEventMutation.isPending}
                    testID="manual-create-title-input"
                  />
                </View>

                <View>
                  <Text className="mb-2 text-sm font-medium">Date</Text>
                  <TouchableOpacity
                    onPress={() => setShowManualDatePicker(true)}
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    testID="manual-create-date-button"
                  >
                    <Text className="text-sm">{format(manualStartsAt, "EEEE, MMM d, yyyy")}</Text>
                  </TouchableOpacity>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium">All day</Text>
                    <Switch
                      checked={manualAllDay}
                      onCheckedChange={setManualAllDay}
                      testID="manual-create-all-day-toggle"
                    />
                  </View>
                  {!manualAllDay ? (
                    <TouchableOpacity
                      onPress={() => setShowManualTimePicker(true)}
                      className="rounded-md border border-border bg-card px-3 py-3"
                      activeOpacity={0.8}
                      testID="manual-create-time-button"
                    >
                      <Text className="text-sm">{format(manualStartsAt, "h:mm a")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View>
                  <Text className="mb-2 text-sm font-medium">Notes (optional)</Text>
                  <Textarea
                    value={manualNotes}
                    onChangeText={setManualNotes}
                    placeholder="Add notes"
                    editable={!createEventMutation.isPending}
                    testID="manual-create-notes-input"
                  />
                </View>

                {createEventMutation.error ? (
                  <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <Text className="text-xs text-destructive">
                      {createEventMutation.error.message || "Failed to create event"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View className="border-t border-border px-4 py-4">
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={resetManualCreateState}
                  disabled={createEventMutation.isPending}
                >
                  <Text>Cancel</Text>
                </Button>
                <Button
                  className="flex-1"
                  onPress={submitManualCreate}
                  disabled={!canSubmitManualCreate}
                  testID="manual-create-submit"
                >
                  <Text className="text-primary-foreground">
                    {createEventMutation.isPending ? "Creating..." : "Create Event"}
                  </Text>
                </Button>
              </View>
            </View>

            {showManualDatePicker ? (
              <DateTimePicker
                value={manualStartsAt}
                mode="date"
                display="default"
                onChange={handleManualDateChange}
              />
            ) : null}
            {showManualTimePicker ? (
              <DateTimePicker
                value={manualStartsAt}
                mode="time"
                display="default"
                onChange={handleManualTimeChange}
              />
            ) : null}
          </View>
        </Modal>
      ) : null}

      <ScrollView
        className="hidden"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      />

      {!hydrated ? <View testID="calendar-store-pending" /> : null}
    </View>
  );
}

export default function CalendarScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <CalendarScreen />
    </ErrorBoundary>
  );
}
