import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import {
  CalendarActionsSheet,
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
  addMonthsToDateKey,
  getEndOfMonthKey,
  getMonthAnchor,
  getStartOfMonthKey,
  parseDateKey,
  toDateKey,
} from "@/lib/calendar/dateMath";
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
const MONTH_RANGE_EXTENSION = 2;

function CalendarScreen() {
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  const hasNormalizedInitialVisibleAnchorRef = useRef(false);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const hydrated = useCalendarStore((state) => state.hydrated);
  const persistedActiveDate = useCalendarStore((state) => state.activeDate);
  const persistedVisibleAnchor = useCalendarStore((state) => state.visibleAnchor);
  const sheetState = useCalendarStore((state) => state.sheetState);
  const setActiveDate = useCalendarStore((state) => state.setActiveDate);
  const setVisibleAnchor = useCalendarStore((state) => state.setVisibleAnchor);
  const setSelectedEventId = useCalendarStore((state) => state.setSelectedEventId);
  const setSheetState = useCalendarStore((state) => state.setSheetState);

  const activeDate = persistedActiveDate ?? todayKey;
  const visibleAnchor = persistedVisibleAnchor ?? getMonthAnchor(persistedActiveDate ?? todayKey);

  const initialWindow = useMemo(() => buildCalendarQueryWindow(activeDate), [activeDate]);
  const [rangeStart, setRangeStart] = useState(initialWindow.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialWindow.rangeEnd);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventScope, setEditingEventScope] = useState<EventMutationScope | undefined>();
  const [showPlannedActivityPicker, setShowPlannedActivityPicker] = useState(false);
  const [schedulingActivityPlanId, setSchedulingActivityPlanId] = useState<string | null>(null);
  const [showManualCreateModal, setShowManualCreateModal] = useState(false);
  const [manualCreateType, setManualCreateType] = useState<"race_target" | "custom" | null>(null);

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
      setVisibleAnchor(getMonthAnchor(todayKey));
    }
  }, [persistedActiveDate, persistedVisibleAnchor, setActiveDate, setVisibleAnchor, todayKey]);

  useEffect(() => {
    if (hasNormalizedInitialVisibleAnchorRef.current) {
      return;
    }

    hasNormalizedInitialVisibleAnchorRef.current = true;
    const activeMonthAnchor = getMonthAnchor(activeDate);
    if (visibleAnchor !== activeMonthAnchor) {
      setVisibleAnchor(activeMonthAnchor);
    }
  }, [activeDate, setVisibleAnchor, visibleAnchor]);

  useEffect(() => {
    const windowCoveringActiveDate = ensureCalendarQueryWindowCovers({
      rangeStart,
      rangeEnd,
      anchorDate: activeDate,
    });

    if (windowCoveringActiveDate.rangeStart !== rangeStart) {
      setRangeStart(windowCoveringActiveDate.rangeStart);
    }
    if (windowCoveringActiveDate.rangeEnd !== rangeEnd) {
      setRangeEnd(windowCoveringActiveDate.rangeEnd);
    }
  }, [activeDate, rangeEnd, rangeStart]);

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
    {
      ...scheduleAwareReadQueryOptions,
      placeholderData: keepPreviousData,
    },
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

  const events = useMemo(
    () => (activitiesData?.items ?? []) as CalendarEvent[],
    [activitiesData?.items],
  );
  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);
  const visibleMonthLabel = useMemo(
    () => format(parseDateKey(visibleAnchor), "MMMM yyyy"),
    [visibleAnchor],
  );

  const handleRefresh = useCallback(async () => {
    await refetchActivities();
  }, [refetchActivities]);

  const extendMonthRangeBackward = useCallback(() => {
    setRangeStart((current) =>
      getStartOfMonthKey(addMonthsToDateKey(getStartOfMonthKey(current), -MONTH_RANGE_EXTENSION)),
    );
  }, []);

  const extendMonthRangeForward = useCallback(() => {
    setRangeEnd((current) =>
      getEndOfMonthKey(addMonthsToDateKey(getStartOfMonthKey(current), MONTH_RANGE_EXTENSION)),
    );
  }, []);

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
    handleTodayPress,
    handleOpenDayAgenda,
    initializeManualCreate,
    handleStartPlannedEvent,
    handleVisibleMonthChange,
    handleCreatePlanned,
    handlePlannedActivitySelected,
    submitManualCreate,
  } = useCalendarScreenController({
    isMountedRef,
    activeDate,
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
    setManualCreateType: handleManualCreateTypeChange,
    deleteEvent: deleteEventMutation.mutate,
    createEvent: createEventMutation.mutate,
    getCanStartPlannedEvent,
  });

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
      <View>
        <AppHeader title="Calendar" />
        <CalendarHeader
          contextLabel={visibleMonthLabel}
          onTodayPress={handleTodayPress}
          onQuickCreatePress={() => setSheetState("calendar-actions")}
        />
      </View>

      <View className="flex-1" testID="calendar-screen-content-ready">
        <CalendarMonthList
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          activeDate={activeDate}
          visibleMonthAnchor={visibleAnchor}
          todayKey={todayKey}
          eventsByDate={eventsByDate}
          onVisibleMonthChange={handleVisibleMonthChange}
          onReachStart={extendMonthRangeBackward}
          onReachEnd={extendMonthRangeForward}
          onSelectDay={handleOpenDayAgenda}
        />
      </View>

      <CalendarActionsSheet
        visible={sheetState === "calendar-actions"}
        selectedDate={activeDate}
        onClose={() => setSheetState("closed")}
        onCreatePlanned={handleCreatePlanned}
        onCreateRaceTarget={() => initializeManualCreate("race_target")}
        onCreateCustom={() => initializeManualCreate("custom")}
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
            selectDate(activeDate);
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
