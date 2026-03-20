import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { CalendarPlannedActivityPickerModal } from "@/components/calendar/CalendarPlannedActivityPickerModal";
import { AppHeader, PlanCalendarSkeleton } from "@/components/shared";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import {
  buildEditEventRoute,
  buildOpenEventRoute,
} from "@/lib/calendar/eventRouting";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { CalendarDays, Clock3, Plus } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
    };

type DaySection = {
  title: string;
  dateKey: string;
  eventCount: number;
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

function CalendarScreen() {
  const router = useRouter();
  const guardNavigation = useNavigationActionGuard();
  const queryClient = useQueryClient();
  const sectionListRef = useRef<SectionList<DayRow, DaySection>>(null);
  const isMountedRef = useRef(true);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [rangeStart, setRangeStart] = useState<string>(
    addDaysToDateKey(todayKey, -PAST_DAYS_WINDOW),
  );
  const [rangeEnd, setRangeEnd] = useState<string>(
    addDaysToDateKey(todayKey, FUTURE_DAYS_WINDOW),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventScope, setEditingEventScope] =
    useState<EventMutationScope>("single");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
  const [showPlannedActivityPicker, setShowPlannedActivityPicker] =
    useState(false);
  const [schedulingActivityPlanId, setSchedulingActivityPlanId] = useState<
    string | null
  >(null);
  const [showManualCreateModal, setShowManualCreateModal] = useState(false);
  const [manualCreateType, setManualCreateType] =
    useState<ManualEventCreateType | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualStartsAt, setManualStartsAt] = useState(new Date());
  const [manualAllDay, setManualAllDay] = useState(false);
  const [showManualDatePicker, setShowManualDatePicker] = useState(false);
  const [showManualTimePicker, setShowManualTimePicker] = useState(false);
  const [movingEvent, setMovingEvent] = useState<PlanEvent | null>(null);
  const [moveDate, setMoveDate] = useState(new Date());
  const [showMoveDatePicker, setShowMoveDatePicker] = useState(false);
  const [moveEventScope, setMoveEventScope] = useState<
    EventMutationScope | undefined
  >();

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
      await Promise.all([
        refreshScheduleViews(queryClient),
        refetchActivities(),
      ]);
    },
  });

  const moveEventMutation = trpc.events.update.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) return;
      setMovingEvent(null);
      setMoveEventScope(undefined);
      setShowMoveDatePicker(false);
      await Promise.all([
        refreshScheduleViews(queryClient),
        refetchActivities(),
      ]);
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
    let dateKey = rangeStart;
    let guard = 0;

    while (dateKey <= rangeEnd && guard < 800) {
      const cursor = parseDateKey(dateKey);
      const dayEvents = eventsByDate.get(dateKey) ?? [];
      const data: DayRow[] =
        dayEvents.length > 0
          ? dayEvents.map((event: PlanEvent) => ({
              type: "event",
              key: `event-${event.id}`,
              event,
            }))
          : [{ type: "empty", key: `empty-${dateKey}` }];

      sections.push({
        title: format(cursor, "EEEE, MMM d"),
        dateKey,
        eventCount: dayEvents.length,
        data,
      });

      dateKey = addDaysToDateKey(dateKey, 1);
      guard += 1;
    }

    return sections;
  }, [eventsByDate, rangeEnd, rangeStart]);

  const selectedDateLabel = useMemo(
    () => format(parseDateKey(selectedDate), "EEEE, MMM d"),
    [selectedDate],
  );

  const scrollToDate = useCallback(
    (dateKey: string) => {
      const sectionIndex = daySections.findIndex(
        (section) => section.dateKey === dateKey,
      );
      if (sectionIndex < 0) return;

      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        animated: true,
        viewOffset: 8,
      });
      setSelectedDate(dateKey);
    },
    [daySections],
  );

  const extendFutureWindow = useCallback(() => {
    setRangeEnd((current) => addDaysToDateKey(current, EXTEND_DAYS_WINDOW));
  }, []);

  const extendPastWindow = useCallback(() => {
    setRangeStart((current) => addDaysToDateKey(current, -EXTEND_DAYS_WINDOW));
  }, []);

  const openEventDetail = (event: PlanEvent) => {
    setSelectedDate(event.scheduled_date || selectedDate);
    handleOpenEvent(event);
  };

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
    return !!(
      event.series_id ||
      event.recurrence_rule ||
      event.recurrence?.rule
    );
  };

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
      Alert.alert(
        "Delete Event",
        "Are you sure you want to delete this event?",
        [
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
        ],
      );
    };

    if (isRecurringEvent(event)) {
      getRecurringScopeOptions("delete", (scope) => confirmDelete(scope));
      return;
    }

    confirmDelete();
  };

  const openMovePicker = (event: PlanEvent, scope?: EventMutationScope) => {
    const initialDate = new Date(
      `${event.scheduled_date || selectedDate}T12:00:00.000Z`,
    );
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
      Alert.alert(
        "Read-only event",
        "Imported events are read-only and cannot be moved.",
      );
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
      Alert.alert(
        "Read-only event",
        "Imported events are read-only and cannot be moved.",
      );
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

      <View className="px-4 pt-3 pb-2 border-b border-border bg-background">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">
              Focus Day
            </Text>
            <Text className="text-base font-semibold text-foreground mt-0.5">
              {selectedDateLabel}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => scrollToDate(todayKey)}
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
      </View>

      <SectionList
        ref={sectionListRef}
        sections={daySections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        onEndReached={extendFutureWindow}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onViewableItemsChanged={({ viewableItems }) => {
          const firstVisible = viewableItems.find((item) => !!item.section);
          const sectionDateKey = firstVisible?.section?.dateKey;
          if (sectionDateKey) {
            setSelectedDate(sectionDateKey);
          }
        }}
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            onPress={() => setSelectedDate(section.dateKey)}
            className="px-4 py-2 bg-background border-b border-border/60"
            activeOpacity={0.8}
            testID={`day-header-${section.dateKey}`}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className={`text-sm font-semibold ${
                  section.dateKey === todayKey
                    ? "text-primary"
                    : "text-foreground"
                }`}
              >
                {section.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {section.eventCount}{" "}
                {section.eventCount === 1 ? "event" : "events"}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        renderItem={({ item, section }) => {
          if (item.type === "empty") {
            return (
              <View className="px-4 py-4">
                <TouchableOpacity
                  onPress={() => {
                    setSelectedDate(section.dateKey);
                    setShowCreateTypeModal(true);
                  }}
                  className="rounded-md border border-dashed border-border bg-card px-3 py-3 flex-row items-center"
                  activeOpacity={0.8}
                >
                  <Icon
                    as={CalendarDays}
                    size={14}
                    className="text-muted-foreground mr-2"
                  />
                  <Text className="text-sm text-muted-foreground">
                    No events. Tap to create one.
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }

          const event = item.event;
          return (
            <TouchableOpacity
              onPress={() => openEventDetail(event)}
              onLongPress={() => handleEventLongPress(event)}
              className="px-4 py-3 border-b border-border/40 bg-background"
              activeOpacity={0.85}
              testID={`schedule-event-${event.id}`}
            >
              <View className="flex-row items-start gap-3">
                <View className="w-16 pt-0.5">
                  <Text className="text-xs text-muted-foreground">
                    {event.all_day
                      ? "All day"
                      : event.starts_at
                        ? format(new Date(event.starts_at), "h:mm a")
                        : "Scheduled"}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">
                    {getEventTitle(event)}
                  </Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">
                    {getEventTypeLabel(event.event_type)}
                    {event.activity_plan?.activity_category
                      ? ` · ${event.activity_plan.activity_category}`
                      : ""}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListHeaderComponent={
          <View className="px-4 py-2 bg-background">
            <TouchableOpacity
              onPress={extendPastWindow}
              className="rounded-md border border-border bg-card px-3 py-2 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-xs text-muted-foreground">
                Load earlier days
              </Text>
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
                    <Text className="text-sm">
                      {format(manualStartsAt, "EEEE, MMM d, yyyy")}
                    </Text>
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
                      <Icon
                        as={Clock3}
                        size={14}
                        className="text-muted-foreground mr-2"
                      />
                      <Text className="text-sm">
                        {format(manualStartsAt, "h:mm a")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View>
                  <Text className="text-sm font-medium mb-2">
                    Notes (optional)
                  </Text>
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
                      {createEventMutation.error.message ||
                        "Failed to create event"}
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
                    {createEventMutation.isPending
                      ? "Creating..."
                      : "Create Event"}
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
