import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import type { ActivityPayload } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { useRouter } from "expo-router";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Lock,
  MoonStar,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  TouchableOpacity,
  View,
} from "react-native";
import { CalendarPlannedActivityPickerModal } from "@/components/calendar/CalendarPlannedActivityPickerModal";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader } from "@/components/shared";
import { buildEditEventRoute, buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import { ROUTES } from "@/lib/constants/routes";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { getActivityColor } from "@/lib/utils/plan/colors";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

type EventCreateType = "planned" | "rest_day" | "race_target" | "custom";
type ManualEventCreateType = Exclude<EventCreateType, "planned">;
type EventMutationScope = "single" | "future" | "series";
type PlanEvent = any;

type DayRow =
  | {
      type: "event";
      key: string;
      event: PlanEvent;
    }
  | {
      type: "empty";
      key: string;
      dateKey: string;
    }
  | {
      type: "gap";
      key: string;
      startDateKey: string;
      endDateKey: string;
      emptyDayCount: number;
      previousEventDateKey: string | null;
      nextEventDateKey: string | null;
    };

type DaySection = {
  kind: "day" | "gap";
  title: string;
  dateKey: string;
  eventCount: number;
  rangeStart: string;
  rangeEnd: string;
  data: DayRow[];
};

const FUTURE_DAYS_WINDOW = 365;
const PAST_DAYS_WINDOW = 14;
const EXTEND_DAYS_WINDOW = 60;
const CALENDAR_EVENT_QUERY_LIMIT = 500;

function toDateKey(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const utcMs = Date.parse(`${dateKey}T00:00:00.000Z`);
  return toDateKey(new Date(utcMs + days * 24 * 60 * 60 * 1000));
}

function getWeekDateKeys(dateKey: string): string[] {
  const weekStart = startOfWeek(parseDateKey(dateKey), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(weekStart, index)));
}

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatEstimatedDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function countDaysInRange(startDateKey: string, endDateKey: string): number {
  const startMs = Date.parse(`${startDateKey}T00:00:00.000Z`);
  const endMs = Date.parse(`${endDateKey}T00:00:00.000Z`);
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function CalendarScreen() {
  const router = useRouter();
  const guardNavigation = useNavigationActionGuard();
  const queryClient = useQueryClient();
  const sectionListRef = useRef<SectionList<DayRow, DaySection>>(null);
  const isMountedRef = useRef(true);
  const pendingScrollDateRef = useRef<string | null>(null);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [rangeStart, setRangeStart] = useState<string>(
    addDaysToDateKey(todayKey, -PAST_DAYS_WINDOW),
  );
  const [rangeEnd, setRangeEnd] = useState<string>(addDaysToDateKey(todayKey, FUTURE_DAYS_WINDOW));
  const [refreshing, setRefreshing] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventScope, setEditingEventScope] = useState<EventMutationScope>("single");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
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
  const [movingEvent, setMovingEvent] = useState<PlanEvent | null>(null);
  const [moveDate, setMoveDate] = useState(new Date());
  const [showMoveDatePicker, setShowMoveDatePicker] = useState(false);
  const [moveEventScope, setMoveEventScope] = useState<EventMutationScope | undefined>();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resetManualCreateState = useCallback(() => {
    setShowManualCreateModal(false);
    setManualCreateType(null);
    setManualTitle("");
    setManualNotes("");
    setShowManualDatePicker(false);
    setShowManualTimePicker(false);
  }, []);

  const dismissOverlaysBeforeNavigation = useCallback(
    (navigate: () => void) => {
      setShowCreateTypeModal(false);
      setShowPlannedActivityPicker(false);
      setSchedulingActivityPlanId(null);
      setShowMoveDatePicker(false);
      setMovingEvent(null);
      setMoveEventScope(undefined);
      resetManualCreateState();

      setTimeout(() => {
        if (!isMountedRef.current) return;
        guardNavigation(navigate);
      }, 0);
    },
    [guardNavigation, resetManualCreateState],
  );

  const {
    data: activitiesData,
    isLoading: loadingEvents,
    refetch: refetchActivities,
  } = trpc.events.list.useQuery({
    date_from: rangeStart,
    date_to: rangeEnd,
    include_adhoc: true,
    limit: CALENDAR_EVENT_QUERY_LIMIT,
  });

  const deleteEventMutation = trpc.events.delete.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      await Promise.all([
        refreshScheduleViews(queryClient, "eventDeletionMutation"),
        refetchActivities(),
      ]);
    },
  });

  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      resetManualCreateState();
      await Promise.all([refreshScheduleViews(queryClient), refetchActivities()]);
    },
  });

  const moveEventMutation = trpc.events.update.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      setMovingEvent(null);
      setMoveEventScope(undefined);
      setShowMoveDatePicker(false);
      await Promise.all([refreshScheduleViews(queryClient), refetchActivities()]);
    },
  });

  const events = activitiesData?.items ?? [];

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PlanEvent[]>();

    for (const event of events) {
      const key = event.scheduled_date;
      if (!key) continue;
      const current = map.get(key) ?? [];
      current.push(event);
      map.set(key, current);
    }

    for (const [key, dayEvents] of map.entries()) {
      dayEvents.sort((a, b) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0;
        const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0;
        return aTime - bTime;
      });
      map.set(key, dayEvents);
    }

    return map;
  }, [events]);

  const daySections = useMemo<DaySection[]>(() => {
    const sections: DaySection[] = [];
    const eventDateKeys = Array.from(eventsByDate.keys())
      .filter((dateKey) => dateKey >= rangeStart && dateKey <= rangeEnd)
      .sort();
    const anchorDateKeys = Array.from(
      new Set(
        [selectedDate, todayKey, ...eventDateKeys].filter(
          (dateKey) => dateKey >= rangeStart && dateKey <= rangeEnd,
        ),
      ),
    ).sort();

    let cursor = rangeStart;
    let previousEventDateKey: string | null = null;

    for (const anchorDateKey of anchorDateKeys) {
      if (cursor < anchorDateKey) {
        const gapEnd = addDaysToDateKey(anchorDateKey, -1);
        const nextEventDateKey = eventDateKeys.find((dateKey) => dateKey >= anchorDateKey) ?? null;

        sections.push({
          kind: "gap",
          title: "Open stretch",
          dateKey: cursor,
          eventCount: 0,
          rangeStart: cursor,
          rangeEnd: gapEnd,
          data: [
            {
              type: "gap",
              key: `gap-${cursor}-${gapEnd}`,
              startDateKey: cursor,
              endDateKey: gapEnd,
              emptyDayCount: countDaysInRange(cursor, gapEnd),
              previousEventDateKey,
              nextEventDateKey,
            },
          ],
        });
      }

      const cursorDate = parseDateKey(anchorDateKey);
      const dayEvents = eventsByDate.get(anchorDateKey) ?? [];
      const data: DayRow[] =
        dayEvents.length > 0
          ? dayEvents.map((event: PlanEvent) => ({
              type: "event",
              key: `event-${event.id}`,
              event,
            }))
          : [{ type: "empty", key: `empty-${anchorDateKey}`, dateKey: anchorDateKey }];

      sections.push({
        kind: "day",
        title: format(cursorDate, "EEEE, MMM d"),
        dateKey: anchorDateKey,
        eventCount: dayEvents.length,
        rangeStart: anchorDateKey,
        rangeEnd: anchorDateKey,
        data,
      });

      if (dayEvents.length > 0) {
        previousEventDateKey = anchorDateKey;
      }

      cursor = addDaysToDateKey(anchorDateKey, 1);
    }

    if (cursor <= rangeEnd) {
      sections.push({
        kind: "gap",
        title: "Open stretch",
        dateKey: cursor,
        eventCount: 0,
        rangeStart: cursor,
        rangeEnd: rangeEnd,
        data: [
          {
            type: "gap",
            key: `gap-${cursor}-${rangeEnd}`,
            startDateKey: cursor,
            endDateKey: rangeEnd,
            emptyDayCount: countDaysInRange(cursor, rangeEnd),
            previousEventDateKey,
            nextEventDateKey: null,
          },
        ],
      });
    }

    return sections;
  }, [eventsByDate, rangeEnd, rangeStart, selectedDate, todayKey]);

  const selectedDateLabel = useMemo(
    () => format(parseDateKey(selectedDate), "EEEE, MMM d"),
    [selectedDate],
  );

  const selectedMonthLabel = useMemo(
    () => format(parseDateKey(selectedDate), "MMMM yyyy"),
    [selectedDate],
  );

  const weekDateKeys = useMemo(() => getWeekDateKeys(selectedDate), [selectedDate]);

  const selectedEventCount = eventsByDate.get(selectedDate)?.length ?? 0;

  const weekStripDays = useMemo(
    () =>
      weekDateKeys.map((dateKey) => ({
        dateKey,
        date: parseDateKey(dateKey),
        eventCount: eventsByDate.get(dateKey)?.length ?? 0,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
      })),
    [eventsByDate, selectedDate, todayKey, weekDateKeys],
  );

  const scrollToDate = useCallback(
    (dateKey: string) => {
      const sectionIndex = daySections.findIndex((section) => {
        if (section.kind === "day") {
          return section.dateKey === dateKey;
        }

        return section.rangeStart <= dateKey && dateKey <= section.rangeEnd;
      });
      if (sectionIndex < 0) return false;

      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        animated: true,
        viewOffset: 8,
      });
      return true;
    },
    [daySections],
  );

  useEffect(() => {
    const pendingDateKey = pendingScrollDateRef.current;
    if (!pendingDateKey) return;

    if (scrollToDate(pendingDateKey)) {
      pendingScrollDateRef.current = null;
    }
  }, [daySections, scrollToDate]);

  const selectDate = useCallback(
    (dateKey: string) => {
      if (dateKey < rangeStart) {
        setRangeStart(dateKey);
      }

      if (dateKey > rangeEnd) {
        setRangeEnd(dateKey);
      }

      setSelectedDate(dateKey);
      pendingScrollDateRef.current = dateKey;
    },
    [rangeEnd, rangeStart],
  );

  const shiftSelectedWeek = useCallback(
    (direction: -1 | 1) => {
      selectDate(addDaysToDateKey(selectedDate, direction * 7));
    },
    [selectDate, selectedDate],
  );

  const extendFutureWindow = useCallback(() => {
    setRangeEnd((current) => addDaysToDateKey(current, EXTEND_DAYS_WINDOW));
  }, []);

  const extendPastWindow = useCallback(() => {
    setRangeStart((current) => addDaysToDateKey(current, -EXTEND_DAYS_WINDOW));
  }, []);

  const openEventDetail = (event: PlanEvent) => {
    setSelectedDate(event.scheduled_date || selectedDate);
    pendingScrollDateRef.current = event.scheduled_date || selectedDate;
    handleOpenEvent(event);
  };

  const openCreateForDate = useCallback(
    (dateKey: string) => {
      selectDate(dateKey);
      setTimeout(() => {
        if (!isMountedRef.current) return;
        setShowCreateTypeModal(true);
      }, 0);
    },
    [selectDate],
  );

  const getEventTypeLabel = (eventType: string | undefined) => {
    switch (eventType) {
      case "planned":
        return "Planned";
      case "rest_day":
        return "Rest Day";
      case "race_target":
        return "Race Target";
      case "custom":
        return "Custom";
      case "imported":
        return "Imported";
      default:
        return "Event";
    }
  };

  const getEventTitle = (event: PlanEvent) => {
    if (event.event_type === "planned") {
      return event.activity_plan?.name || event.title || "Planned activity";
    }
    if (event.event_type === "rest_day") {
      return event.title || "Rest day";
    }
    if (event.event_type === "race_target") {
      return event.title || "Race target";
    }
    if (event.event_type === "custom") {
      return event.title || "Custom event";
    }
    if (event.event_type === "imported") {
      return event.title || "Imported event";
    }
    return event.title || "Scheduled event";
  };

  const isEditableEvent = (event: PlanEvent) => event.event_type !== "imported";

  const isRecurringEvent = (event: PlanEvent) => {
    if (!event) return false;
    return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
  };

  const handleStartPlannedEvent = useCallback(
    (event: PlanEvent) => {
      const activityPlan = event.activity_plan;
      if (!activityPlan) {
        openEventDetail(event);
        return;
      }

      const payload: ActivityPayload = {
        category: activityPlan.activity_category as any,
        gpsRecordingEnabled: true,
        eventId: event.id,
        plan: activityPlan,
      };

      activitySelectionStore.setSelection(payload);
      dismissOverlaysBeforeNavigation(() => {
        router.push(ROUTES.RECORD);
      });
    },
    [dismissOverlaysBeforeNavigation, router],
  );

  const getRecurringScopeOptions = (
    action: "edit" | "delete" | "move",
    onSelect: (scope: EventMutationScope) => void,
  ) => {
    const title =
      action === "edit"
        ? "Edit Recurring Event"
        : action === "delete"
          ? "Delete Recurring Event"
          : "Move Recurring Event";
    const message =
      action === "edit"
        ? "Choose how much of this series to edit."
        : action === "delete"
          ? "Choose how much of this series to delete."
          : "Choose how much of this series to move.";

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "This event only", onPress: () => onSelect("single") },
      { text: "This and future events", onPress: () => onSelect("future") },
      {
        text: "Entire series",
        style: action === "delete" ? "destructive" : "default",
        onPress: () => onSelect("series"),
      },
    ]);
  };

  const handleOpenEvent = (event: PlanEvent) => {
    const route = buildOpenEventRoute(event);
    if (!route) {
      Alert.alert("Open Event", "This event type is read-only.");
      return;
    }

    dismissOverlaysBeforeNavigation(() => {
      router.push(route as any);
    });
  };

  const handleEditEvent = (event: PlanEvent) => {
    if (event.event_type === "planned") {
      const openEditorWithScope = (scope: EventMutationScope) => {
        setEditingEventScope(scope);
        setEditingEventId(event.id);
      };

      if (isRecurringEvent(event)) {
        getRecurringScopeOptions("edit", openEditorWithScope);
        return;
      }

      openEditorWithScope("single");
      return;
    }

    const route = buildEditEventRoute(event);
    if (!route) {
      Alert.alert("Edit Event", "This event cannot be edited.");
      return;
    }

    dismissOverlaysBeforeNavigation(() => {
      router.push(route as any);
    });
  };

  const handleDeleteEvent = (event: PlanEvent) => {
    const confirmDelete = (scope?: EventMutationScope) => {
      Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (scope) {
              deleteEventMutation.mutate({ id: event.id, scope });
              return;
            }

            deleteEventMutation.mutate({ id: event.id });
          },
        },
      ]);
    };

    if (isRecurringEvent(event)) {
      getRecurringScopeOptions("delete", (scope) => confirmDelete(scope));
      return;
    }

    confirmDelete();
  };

  const openMovePicker = (event: PlanEvent, scope?: EventMutationScope) => {
    const initialDate = new Date(`${event.scheduled_date || selectedDate}T12:00:00.000Z`);
    setMovingEvent(event);
    setMoveEventScope(scope);
    setMoveDate(initialDate);
    setShowMoveDatePicker(true);
  };

  const submitMoveUpdate = useCallback(
    (eventId: string, nextDate: string, scope?: EventMutationScope) => {
      const payload: {
        id: string;
        scheduled_date: string;
        scope?: EventMutationScope;
      } = {
        id: eventId,
        scheduled_date: nextDate,
      };

      if (scope) payload.scope = scope;

      moveEventMutation.mutate(payload);
    },
    [moveEventMutation],
  );

  const handleMoveEvent = (event: PlanEvent) => {
    if (!isEditableEvent(event)) {
      Alert.alert("Read-only event", "Imported events are read-only and cannot be moved.");
      return;
    }

    if (isRecurringEvent(event)) {
      getRecurringScopeOptions("move", (scope) => {
        openMovePicker(event, scope);
      });
      return;
    }

    openMovePicker(event);
  };

  const handleMoveDateChange = (_: any, date?: Date) => {
    setShowMoveDatePicker(false);
    if (!date || !movingEvent) {
      setMovingEvent(null);
      setMoveEventScope(undefined);
      return;
    }

    const nextDate = format(date, "yyyy-MM-dd");
    setMoveDate(date);
    submitMoveUpdate(movingEvent.id, nextDate, moveEventScope);
  };

  const handleEventLongPress = (event: PlanEvent) => {
    if (!isEditableEvent(event)) {
      Alert.alert("Read-only event", "Imported events are read-only and cannot be moved.");
      return;
    }

    Alert.alert("Quick actions", "Edit, move, or delete this event.", [
      { text: "Cancel", style: "cancel" },
      { text: "Edit", onPress: () => handleEditEvent(event) },
      { text: "Move", onPress: () => handleMoveEvent(event) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleDeleteEvent(event),
      },
    ]);
  };

  const initializeManualCreate = (type: ManualEventCreateType) => {
    const baseDate = new Date(`${selectedDate}T09:00:00.000Z`);
    setManualCreateType(type);
    setManualStartsAt(baseDate);
    setManualTitle("");
    setManualNotes("");
    setManualAllDay(type === "rest_day");
    setShowManualCreateModal(true);
  };

  const handleSelectEventCreateType = (type: EventCreateType) => {
    setShowCreateTypeModal(false);

    if (type === "planned") {
      setShowPlannedActivityPicker(true);
      return;
    }

    initializeManualCreate(type as ManualEventCreateType);
  };

  const handleManualDateChange = (_: any, date?: Date) => {
    setShowManualDatePicker(false);
    if (!date) return;
    const nextDate = new Date(manualStartsAt);
    nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setManualStartsAt(nextDate);
  };

  const handleManualTimeChange = (_: any, date?: Date) => {
    setShowManualTimePicker(false);
    if (!date) return;
    const nextDate = new Date(manualStartsAt);
    nextDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setManualStartsAt(nextDate);
  };

  const submitManualCreate = () => {
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
  };

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchActivities();
    if (!isMountedRef.current) return;
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      void refetchActivities();
    }, [refetchActivities]),
  );

  if (loadingEvents) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Calendar" />
        <ScrollView className="flex-1 p-6">
          <PlanCalendarSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (!activitiesData) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Calendar" />
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-muted-foreground text-center">
            Unable to load calendar events right now.
          </Text>
          <TouchableOpacity
            onPress={() => void refetchActivities()}
            className="px-4 py-2 rounded-full border border-border bg-card"
            activeOpacity={0.8}
          >
            <Text className="text-sm text-foreground">Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Calendar" />

      <View className="border-b border-border bg-background px-4 pt-3 pb-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-lg font-semibold text-foreground">{selectedMonthLabel}</Text>
            <Text className="text-sm text-muted-foreground">
              {selectedDateLabel} · {selectedEventCount}{" "}
              {selectedEventCount === 1 ? "event" : "events"}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => selectDate(todayKey)}
              className="rounded-md border border-border bg-card px-3 py-2"
              activeOpacity={0.8}
            >
              <Text className="text-xs font-medium">Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowCreateTypeModal(true)}
              className="rounded-md border border-border bg-card px-3 py-2 flex-row items-center"
              activeOpacity={0.8}
              testID="create-event-entry"
            >
              <Icon as={Plus} size={14} className="text-foreground mr-1" />
              <Text className="text-xs font-medium">Create</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 rounded-2xl border border-border bg-card px-2 py-3">
          <View className="flex-row items-center justify-between px-1 pb-3">
            <TouchableOpacity
              onPress={() => shiftSelectedWeek(-1)}
              className="h-9 w-9 items-center justify-center rounded-full bg-background"
              activeOpacity={0.8}
              testID="calendar-week-prev"
            >
              <Icon as={ChevronLeft} size={18} className="text-foreground" />
            </TouchableOpacity>

            <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Week Of {format(weekStripDays[0]?.date ?? parseDateKey(selectedDate), "MMM d")}
            </Text>

            <TouchableOpacity
              onPress={() => shiftSelectedWeek(1)}
              className="h-9 w-9 items-center justify-center rounded-full bg-background"
              activeOpacity={0.8}
              testID="calendar-week-next"
            >
              <Icon as={ChevronRight} size={18} className="text-foreground" />
            </TouchableOpacity>
          </View>

          <View className="flex-row items-start justify-between gap-1">
            {weekStripDays.map((day) => (
              <TouchableOpacity
                key={day.dateKey}
                onPress={() => selectDate(day.dateKey)}
                className="flex-1 items-center"
                activeOpacity={0.8}
                testID={`calendar-week-day-${day.dateKey}`}
              >
                <Text
                  className={`text-[11px] uppercase ${
                    day.isSelected ? "font-semibold text-primary" : "text-muted-foreground"
                  }`}
                >
                  {format(day.date, "EEEEE")}
                </Text>
                <View
                  className={`mt-1 h-10 w-10 items-center justify-center rounded-full ${
                    day.isSelected
                      ? "bg-primary"
                      : day.isToday
                        ? "border border-primary bg-primary/5"
                        : "bg-background"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      day.isSelected
                        ? "text-primary-foreground"
                        : day.isToday
                          ? "text-primary"
                          : "text-foreground"
                    }`}
                  >
                    {format(day.date, "d")}
                  </Text>
                </View>
                <View className="mt-2 min-h-4 items-center justify-center">
                  {day.eventCount > 0 ? (
                    <View className="min-w-4 rounded-full bg-primary/10 px-1.5 py-0.5">
                      <Text className="text-[10px] font-medium text-primary">{day.eventCount}</Text>
                    </View>
                  ) : day.isToday ? (
                    <View className="h-2 w-2 rounded-full bg-primary/40" />
                  ) : (
                    <View className="h-2 w-2 rounded-full border border-border/80" />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <SectionList
        ref={sectionListRef}
        sections={daySections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        onEndReached={extendFutureWindow}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onViewableItemsChanged={({ viewableItems }) => {
          const firstVisible = viewableItems.find((item) => !!item.section);
          const sectionDateKey = firstVisible?.section?.dateKey;
          if (sectionDateKey) {
            setSelectedDate(sectionDateKey);
          }
        }}
        renderSectionHeader={({ section }) =>
          section.kind === "day" ? (
            <TouchableOpacity
              onPress={() => selectDate(section.dateKey)}
              className="px-4 py-2 bg-background border-b border-border/60"
              activeOpacity={0.8}
              testID={`day-header-${section.dateKey}`}
            >
              <View className="flex-row items-center justify-between">
                <Text
                  className={`text-sm font-semibold ${
                    section.dateKey === todayKey ? "text-primary" : "text-foreground"
                  }`}
                >
                  {section.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {section.eventCount} {section.eventCount === 1 ? "event" : "events"}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View className="px-4 pt-4 pb-2 bg-background" testID={`day-gap-${section.rangeStart}`}>
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quiet stretch
              </Text>
            </View>
          )
        }
        renderItem={({ item, section }) => {
          if (item.type === "empty") {
            const isSelectedDay = item.dateKey === selectedDate;
            const isToday = item.dateKey === todayKey;

            return (
              <View className="px-4 py-4">
                <View
                  className="rounded-2xl border border-dashed border-border bg-card px-4 py-4"
                  testID={`calendar-empty-day-${item.dateKey}`}
                >
                  <View className="flex-row items-start gap-3">
                    <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                      <Icon as={CalendarDays} size={18} className="text-primary" />
                    </View>
                    <View className="flex-1 gap-2">
                      <View className="gap-1">
                        <Text className="text-sm font-semibold text-foreground">
                          {isToday
                            ? "Nothing is scheduled today"
                            : isSelectedDay
                              ? `Nothing is scheduled for ${format(parseDateKey(item.dateKey), "EEEE, MMM d")}`
                              : "No events scheduled"}
                        </Text>
                        <Text className="text-sm text-muted-foreground">
                          Create an event here or jump to another day without scrolling through
                          empty sections.
                        </Text>
                      </View>

                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => openCreateForDate(item.dateKey)}
                          className="rounded-full bg-primary px-3 py-2"
                          activeOpacity={0.85}
                          testID={`calendar-empty-create-${item.dateKey}`}
                        >
                          <Text className="text-xs font-semibold text-primary-foreground">
                            Create event
                          </Text>
                        </TouchableOpacity>
                        {!isToday ? (
                          <TouchableOpacity
                            onPress={() => selectDate(todayKey)}
                            className="rounded-full border border-border bg-background px-3 py-2"
                            activeOpacity={0.85}
                          >
                            <Text className="text-xs font-semibold text-foreground">
                              Go to today
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          }

          if (item.type === "gap") {
            const gapLabel =
              item.emptyDayCount === 1
                ? `No events on ${format(parseDateKey(item.startDateKey), "EEEE, MMM d")}`
                : `No events from ${format(parseDateKey(item.startDateKey), "MMM d")} to ${format(parseDateKey(item.endDateKey), "MMM d")}`;
            const helperLabel =
              item.nextEventDateKey !== null
                ? `Your next scheduled event is ${format(parseDateKey(item.nextEventDateKey), "EEEE, MMM d")}.`
                : "This stretch is completely open right now.";

            return (
              <View
                className="px-4 pb-4"
                testID={`calendar-gap-${item.startDateKey}-${item.endDateKey}`}
              >
                <View className="rounded-2xl border border-border bg-card/70 px-4 py-4">
                  <View className="flex-row items-start gap-3">
                    <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Icon as={CalendarDays} size={18} className="text-muted-foreground" />
                    </View>
                    <View className="flex-1 gap-2">
                      <View className="gap-1">
                        <Text className="text-sm font-semibold text-foreground">{gapLabel}</Text>
                        <Text className="text-sm text-muted-foreground">
                          {helperLabel} Add something to the first open day or skip ahead.
                        </Text>
                      </View>

                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => openCreateForDate(item.startDateKey)}
                          className="rounded-full border border-border bg-background px-3 py-2"
                          activeOpacity={0.85}
                          testID={`calendar-gap-create-${item.startDateKey}`}
                        >
                          <Text className="text-xs font-semibold text-foreground">
                            Create on {format(parseDateKey(item.startDateKey), "MMM d")}
                          </Text>
                        </TouchableOpacity>
                        {item.nextEventDateKey ? (
                          <TouchableOpacity
                            onPress={() => selectDate(item.nextEventDateKey as string)}
                            className="rounded-full bg-primary px-3 py-2"
                            activeOpacity={0.85}
                            testID={`calendar-gap-next-${item.startDateKey}`}
                          >
                            <Text className="text-xs font-semibold text-primary-foreground">
                              Next event
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          }

          const event = item.event;
          const isPlannedEvent = event.event_type === "planned";
          const isImportedEvent = event.event_type === "imported";
          const isCompleted = isPlannedEvent ? isActivityCompleted(event) : false;
          const isPastScheduledEvent =
            isPlannedEvent &&
            typeof event.scheduled_date === "string" &&
            event.scheduled_date < todayKey;
          const canStartPlanned = isPlannedEvent && !isCompleted && !isPastScheduledEvent;
          const activityType = event.activity_plan?.activity_category;
          const activityColor = getActivityColor(activityType);
          const estimatedDuration = formatEstimatedDuration(
            readMetric(event.activity_plan?.estimated_duration),
          );
          const estimatedTss = readMetric(event.activity_plan?.estimated_tss);
          const metadataItems = isPlannedEvent
            ? [
                activityType ? activityColor.name : null,
                estimatedDuration,
                typeof estimatedTss === "number" ? `${Math.round(estimatedTss)} TSS` : null,
              ].filter(Boolean)
            : [
                event.notes?.trim()?.slice(0, 56) || null,
                isRecurringEvent(event) ? "Repeats" : null,
                isImportedEvent ? "Read-only" : null,
              ].filter(Boolean);
          const badges = [
            isCompleted ? "Completed" : null,
            isPastScheduledEvent ? "Missed" : null,
            isRecurringEvent(event) ? "Recurring" : null,
            isImportedEvent ? "Read-only" : null,
            isPlannedEvent && event.activity_plan?.id ? "From Plan" : null,
          ].filter(Boolean) as string[];
          const leadingIcon =
            event.event_type === "planned"
              ? Zap
              : event.event_type === "rest_day"
                ? MoonStar
                : event.event_type === "race_target"
                  ? Flag
                  : event.event_type === "imported"
                    ? Lock
                    : CalendarDays;
          const leadingTone =
            event.event_type === "planned"
              ? "bg-primary/12"
              : event.event_type === "rest_day"
                ? "bg-emerald-500/12"
                : event.event_type === "race_target"
                  ? "bg-amber-500/12"
                  : event.event_type === "imported"
                    ? "bg-muted"
                    : "bg-sky-500/12";
          const leadingIconClass =
            event.event_type === "planned"
              ? activityColor.text
              : event.event_type === "rest_day"
                ? "text-emerald-600"
                : event.event_type === "race_target"
                  ? "text-amber-600"
                  : event.event_type === "imported"
                    ? "text-muted-foreground"
                    : "text-sky-600";
          const quickActionLabel = canStartPlanned ? "Start" : isImportedEvent ? "View" : "Edit";
          const quickActionIcon = canStartPlanned ? Play : isImportedEvent ? ArrowUpRight : Pencil;
          const quickActionHandler = canStartPlanned
            ? () => handleStartPlannedEvent(event)
            : isImportedEvent
              ? () => openEventDetail(event)
              : () => handleEditEvent(event);

          return (
            <View className="px-4 py-3 border-b border-border/30 bg-background">
              <View className="rounded-2xl border border-border bg-card/95 px-3 py-3">
                <View className="flex-row items-start gap-3">
                  <View className="w-[68px] items-start pt-1">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {event.all_day
                        ? "All day"
                        : event.starts_at
                          ? format(new Date(event.starts_at), "h:mm a")
                          : "Scheduled"}
                    </Text>
                    <View className="mt-3 h-9 w-1 rounded-full bg-border" />
                  </View>

                  <TouchableOpacity
                    onPress={() => openEventDetail(event)}
                    onLongPress={() => handleEventLongPress(event)}
                    className="flex-1"
                    activeOpacity={0.85}
                    testID={`schedule-event-${event.id}`}
                  >
                    <View className="flex-row items-start gap-3">
                      <View
                        className={`mt-0.5 h-10 w-10 items-center justify-center rounded-2xl ${leadingTone}`}
                      >
                        <Icon as={leadingIcon} size={18} className={leadingIconClass} />
                      </View>

                      <View className="flex-1 gap-2">
                        <View className="gap-0.5 pr-2">
                          <Text className="text-sm font-semibold text-foreground">
                            {getEventTitle(event)}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {getEventTypeLabel(event.event_type)}
                          </Text>
                        </View>

                        {metadataItems.length > 0 ? (
                          <Text className="text-xs text-muted-foreground">
                            {metadataItems.join(" • ")}
                          </Text>
                        ) : null}

                        {badges.length > 0 ? (
                          <View className="flex-row flex-wrap gap-2">
                            {badges.map((badge) => {
                              const badgeClassName =
                                badge === "Completed"
                                  ? "border-emerald-500/30 bg-emerald-500/10"
                                  : badge === "Missed"
                                    ? "border-amber-500/30 bg-amber-500/10"
                                    : badge === "Read-only"
                                      ? "border-border bg-muted"
                                      : "border-border bg-background";
                              const badgeTextClassName =
                                badge === "Completed"
                                  ? "text-emerald-700"
                                  : badge === "Missed"
                                    ? "text-amber-700"
                                    : "text-muted-foreground";
                              const badgeIcon =
                                badge === "Completed"
                                  ? CheckCircle2
                                  : badge === "Recurring"
                                    ? Repeat2
                                    : badge === "Read-only"
                                      ? Lock
                                      : badge === "From Plan"
                                        ? Zap
                                        : null;

                              return (
                                <View
                                  key={`${event.id}-${badge}`}
                                  className={`flex-row items-center gap-1 rounded-full border px-2 py-1 ${badgeClassName}`}
                                >
                                  {badgeIcon ? (
                                    <Icon as={badgeIcon} size={10} className={badgeTextClassName} />
                                  ) : null}
                                  <Text className={`text-[10px] font-medium ${badgeTextClassName}`}>
                                    {badge}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={quickActionHandler}
                    className="rounded-full border border-border bg-background px-3 py-2"
                    activeOpacity={0.85}
                    testID={`schedule-event-action-${event.id}`}
                  >
                    <View className="flex-row items-center gap-1">
                      <Icon as={quickActionIcon} size={12} className="text-foreground" />
                      <Text className="text-[11px] font-semibold text-foreground">
                        {quickActionLabel}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
        ListHeaderComponent={
          <View className="px-4 py-2 bg-background">
            <TouchableOpacity
              onPress={extendPastWindow}
              className="rounded-md border border-border bg-card px-3 py-2 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-xs text-muted-foreground">Load earlier days</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {editingEventId && (
        <ScheduleActivityModal
          visible
          onClose={() => {
            setEditingEventId(null);
            setEditingEventScope("single");
          }}
          eventId={editingEventId}
          editScope={editingEventScope}
          onSuccess={() => {
            if (!isMountedRef.current) return;
            setEditingEventId(null);
            setEditingEventScope("single");
            void handleRefresh();
          }}
        />
      )}

      {schedulingActivityPlanId && (
        <ScheduleActivityModal
          visible
          onClose={() => setSchedulingActivityPlanId(null)}
          activityPlanId={schedulingActivityPlanId}
          preselectedDate={selectedDate}
          onSuccess={() => {
            if (!isMountedRef.current) return;
            setSchedulingActivityPlanId(null);
            void handleRefresh();
            scrollToDate(selectedDate);
          }}
        />
      )}

      {showMoveDatePicker && movingEvent && (
        <DateTimePicker
          value={moveDate}
          mode="date"
          display="default"
          onChange={handleMoveDateChange}
          testID="move-date-picker"
        />
      )}

      {showCreateTypeModal && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setShowCreateTypeModal(false)}
        >
          <Pressable
            className="flex-1 bg-black/40 justify-end"
            onPress={() => setShowCreateTypeModal(false)}
            testID="create-event-type-overlay"
          >
            <Pressable
              className="bg-background rounded-t-2xl px-4 pt-4 pb-6 gap-2"
              onPress={() => null}
              testID="create-event-type-selector"
            >
              <Text className="text-lg font-semibold">Create Event</Text>
              <Text className="text-sm text-muted-foreground mb-2">
                Start by choosing an event type for {selectedDate}.
              </Text>
              <TouchableOpacity
                className="rounded-md border border-border bg-card px-3 py-3"
                onPress={() => handleSelectEventCreateType("planned")}
                activeOpacity={0.8}
                testID="create-type-planned"
              >
                <Text className="text-sm font-medium">Planned activity</Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  Pick one of your activity plans and schedule it.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-md border border-border bg-card px-3 py-3"
                onPress={() => handleSelectEventCreateType("rest_day")}
                activeOpacity={0.8}
                testID="create-type-rest-day"
              >
                <Text className="text-sm font-medium">Rest day</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-md border border-border bg-card px-3 py-3"
                onPress={() => handleSelectEventCreateType("race_target")}
                activeOpacity={0.8}
                testID="create-type-race-target"
              >
                <Text className="text-sm font-medium">Race target</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-md border border-border bg-card px-3 py-3"
                onPress={() => handleSelectEventCreateType("custom")}
                activeOpacity={0.8}
                testID="create-type-custom"
              >
                <Text className="text-sm font-medium">Custom event</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <CalendarPlannedActivityPickerModal
        visible={showPlannedActivityPicker}
        selectedDate={selectedDate}
        onClose={() => setShowPlannedActivityPicker(false)}
        onSelectPlan={(activityPlanId) => {
          setShowPlannedActivityPicker(false);
          setSchedulingActivityPlanId(activityPlanId);
        }}
      />

      {showManualCreateModal && manualCreateType && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={resetManualCreateState}
        >
          <View className="flex-1 bg-background">
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
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
              <View className="px-4 py-4 gap-4" testID="manual-create-modal">
                <View>
                  <Text className="text-sm font-medium mb-2">
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
                  <Text className="text-sm font-medium mb-2">Date</Text>
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
                  {!manualAllDay && (
                    <TouchableOpacity
                      onPress={() => setShowManualTimePicker(true)}
                      className="rounded-md border border-border bg-card px-3 py-3 flex-row items-center"
                      activeOpacity={0.8}
                      testID="manual-create-time-button"
                    >
                      <Icon as={Clock3} size={14} className="text-muted-foreground mr-2" />
                      <Text className="text-sm">{format(manualStartsAt, "h:mm a")}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View>
                  <Text className="text-sm font-medium mb-2">Notes (optional)</Text>
                  <Textarea
                    value={manualNotes}
                    onChangeText={setManualNotes}
                    placeholder="Add notes"
                    editable={!createEventMutation.isPending}
                    testID="manual-create-notes-input"
                  />
                </View>

                {createEventMutation.error && (
                  <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <Text className="text-xs text-destructive">
                      {createEventMutation.error.message || "Failed to create event"}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <View className="px-4 py-4 border-t border-border">
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

            {showManualDatePicker && (
              <DateTimePicker
                value={manualStartsAt}
                mode="date"
                display="default"
                onChange={handleManualDateChange}
              />
            )}
            {showManualTimePicker && (
              <DateTimePicker
                value={manualStartsAt}
                mode="time"
                display="default"
                onChange={handleManualTimeChange}
              />
            )}
          </View>
        </Modal>
      )}
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
