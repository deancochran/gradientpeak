import { useFocusEffect } from "@react-navigation/native";
import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  CalendarManualCreateModal,
  CalendarMonthList,
  CalendarPlannedActivityPickerModal,
} from "@/components/calendar";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader } from "@/components/shared";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import {
  buildDayKeys,
  getNaturalAnchorForMode,
  parseDateKey,
  toDateKey,
} from "@/lib/calendar/dateMath";
import { getEventTitle } from "@/lib/calendar/eventPresentation";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import {
  buildCalendarQueryWindow,
  ensureCalendarQueryWindowCovers,
} from "@/lib/calendar/queryWindow";
import { useCalendarScreenController } from "@/lib/calendar/useCalendarScreenController";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { useCalendarStore } from "@/lib/stores/calendar-store";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

type EventMutationScope = "single" | "future" | "series";

const CALENDAR_EVENT_QUERY_LIMIT = 500;

function CalendarScreen() {
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
  const [calendarChromeHeight, setCalendarChromeHeight] = useState(0);
  const [manualCreateType, setManualCreateType] = useState<"race_target" | "custom" | null>(null);
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [draggingScope, setDraggingScope] = useState<EventMutationScope | undefined>();

  const handleManualCreateTypeChange = useCallback((type: "race_target" | "custom" | null) => {
    setManualCreateType(type);
  }, []);

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

  const {
    data: activitiesData,
    isLoading: loadingEvents,
    refetch: refetchActivities,
  } = api.events.list.useQuery(
    {
      date_from: rangeStart,
      date_to: rangeEnd,
      include_adhoc: true,
      limit: CALENDAR_EVENT_QUERY_LIMIT,
    },
    scheduleAwareReadQueryOptions,
  );

  const deleteEventMutation = api.events.delete.useMutation({
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

  const createEventMutation = api.events.create.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      resetManualCreateState();
      await refreshScheduleWithCallbacks({ queryClient, callbacks: [refetchActivities] });
    },
  });

  const moveEventMutation = api.events.update.useMutation({
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
  const pageHeight = Math.max(
    460,
    height - (calendarChromeHeight > 0 ? calendarChromeHeight + 88 : 188),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchActivities();
    if (!isMountedRef.current) return;
    setRefreshing(false);
  }, [refetchActivities]);

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

  const {
    closeSheetsAndTransientState,
    resetManualCreateState,
    selectDate,
    handleModeChange,
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
  } = useCalendarScreenController({
    isMountedRef,
    activeDate,
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
    setManualCreateType: handleManualCreateTypeChange,
    setDraggingEvent,
    setDraggingScope,
    deleteEvent: deleteEventMutation.mutate,
    moveEvent: moveEventMutation.mutate,
    createEvent: createEventMutation.mutate,
    getCanStartPlannedEvent,
  });

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
      <View onLayout={(event) => setCalendarChromeHeight(event.nativeEvent.layout.height)}>
        <AppHeader title="Calendar" />
        <CalendarHeader
          mode={mode}
          onModeChange={handleModeChange}
          onResetToDayPress={handleResetToDayPress}
          onQuickCreatePress={() => setSheetState("calendar-actions")}
        />
      </View>

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
            onVisibleDateChange={handleVisibleDayChange}
            onOpenEvent={handleOpenEventPreview}
            onQuickActionPress={handleQuickActionPress}
            onDragStart={handleStartDragFromEvent}
            onDropOnDate={(dateKey) => handleDropOnDate(dateKey, draggingEvent, draggingScope)}
          />
        ) : (
          <CalendarMonthList
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            activeDate={activeDate}
            todayKey={todayKey}
            eventsByDate={eventsByDate}
            onVisibleMonthChange={handleVisibleMonthChange}
            onSelectDay={(dateKey) => selectDate(dateKey, "day")}
          />
        )}
      </View>

      <CalendarActionsSheet
        visible={sheetState === "calendar-actions"}
        selectedDate={activeDate}
        onClose={() => setSheetState("closed")}
        onCreatePlanned={handleCreatePlanned}
        onCreateRaceTarget={() => initializeManualCreate("race_target")}
        onCreateCustom={() => initializeManualCreate("custom")}
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
        onSelectPlan={handlePlannedActivitySelected}
      />

      <CalendarManualCreateModal
        visible={showManualCreateModal}
        activeDate={activeDate}
        createType={manualCreateType}
        submitting={createEventMutation.isPending}
        errorMessage={createEventMutation.error?.message || null}
        onClose={resetManualCreateState}
        onSubmit={submitManualCreate}
      />

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
