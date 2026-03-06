import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GhostCard } from "@/components/plan/GhostCard";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader, PlanCalendarSkeleton } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { ROUTES } from "@/lib/constants/routes";

import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { trpc } from "@/lib/trpc";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { ActivityPayload } from "@repo/core";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarDays, Clock3, Play, Plus } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
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
  PanResponder,
  PanResponderGestureState,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useColorScheme } from "nativewind";

// No longer need local transform function - ActivityPlanCard handles it internally

type CalendarView = "month" | "week" | "day";
type EventCreateType = "planned" | "rest_day" | "race_target" | "custom";
type ManualEventCreateType = Exclude<EventCreateType, "planned">;
type EventMutationScope = "single" | "future" | "series";

type PlanEvent = any;
type TimeBlockId = (typeof TIME_BLOCKS)[number]["id"];

type DayDragTarget = {
  dateString: string;
  blockId: TimeBlockId;
};

const TIME_BLOCKS = [
  { id: "morning", label: "Morning", timeLabel: "06:00-11:59" },
  { id: "afternoon", label: "Afternoon", timeLabel: "12:00-17:59" },
  { id: "evening", label: "Evening", timeLabel: "18:00-21:59" },
] as const;

const WEEK_DRAG_ROW_HEIGHT = 72;
const DAY_DRAG_BLOCK_HEIGHT = 56;
const DAY_DRAG_DATE_WIDTH = 140;

function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTimeBlockId(
  activityIndex: number,
): (typeof TIME_BLOCKS)[number]["id"] {
  return TIME_BLOCKS[activityIndex % TIME_BLOCKS.length]!.id;
}

function PlanScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]!,
  );
  const [currentMonth, setCurrentMonth] = useState<string>(
    new Date().toISOString().split("T")[0]!,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PlanEvent | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventScope, setEditingEventScope] =
    useState<EventMutationScope>("single");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
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
  const [draggingEvent, setDraggingEvent] = useState<PlanEvent | null>(null);
  const [weekDragTargetDate, setWeekDragTargetDate] = useState<string | null>(
    null,
  );
  const [dayDragTarget, setDayDragTarget] = useState<DayDragTarget | null>(
    null,
  );
  const [calendarSectionY, setCalendarSectionY] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const guardNavigation = useNavigationActionGuard();
  const utils = trpc.useUtils();
  const isMountedRef = useRef(true);

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
      setSelectedEvent(null);
      setShowCreateTypeModal(false);
      setShowMoveDatePicker(false);
      setMovingEvent(null);
      setMoveEventScope(undefined);
      resetManualCreateState();

      setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        guardNavigation(navigate);
      }, 0);
    },
    [guardNavigation, resetManualCreateState],
  );

  const setActiveDate = useCallback((dateString: string) => {
    setSelectedDate(dateString);
    setCurrentMonth(dateString);
  }, []);

  // Calculate calendar range based on current view
  const { startDate, endDate } = useMemo(() => {
    if (calendarView === "month") {
      const date = new Date(currentMonth);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return {
        startDate: start.toISOString().split("T")[0]!,
        endDate: end.toISOString().split("T")[0]!,
      };
    }

    if (calendarView === "week") {
      const anchor = new Date(selectedDate);
      const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });
      return {
        startDate: weekStart.toISOString().split("T")[0]!,
        endDate: weekEnd.toISOString().split("T")[0]!,
      };
    }

    const day = new Date(selectedDate);
    const dayString = day.toISOString().split("T")[0]!;
    return {
      startDate: dayString,
      endDate: dayString,
    };
  }, [calendarView, currentMonth, selectedDate]);

  const monthRange = useMemo(() => {
    const date = new Date(currentMonth);
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return {
      startDate: start.toISOString().split("T")[0]!,
      endDate: end.toISOString().split("T")[0]!,
    };
  }, [currentMonth]);

  const { data: rawActivePlan } = trpc.trainingPlans.getActivePlan.useQuery();
  const activePlan = rawActivePlan as any;

  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
  });

  const plan = activePlan;
  const status = snapshot.status;
  const refetchSnapshot = snapshot.refetch;
  const refetchSnapshotAll = snapshot.refetchAll;

  // Query for activities in the current month
  const {
    data: activitiesData,
    isLoading: loadingAllPlanned,
    refetch: refetchActivities,
  } = trpc.events.list.useQuery({
    date_from: startDate,
    date_to: endDate,
    training_plan_id: plan?.id,
    include_adhoc: true,
    limit: 100,
  });

  const allPlannedActivities = { items: activitiesData?.items || [] };

  const deleteEventMutation = trpc.events.delete.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) {
        return;
      }

      setSelectedEvent(null);
      await Promise.all([
        utils.events.invalidate(),
        utils.trainingPlans.invalidate(),
        refetchActivities(),
      ]);
    },
  });

  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) {
        return;
      }

      resetManualCreateState();
      await Promise.all([
        utils.events.invalidate(),
        utils.trainingPlans.invalidate(),
        refetchActivities(),
      ]);
    },
  });

  const moveEventMutation = trpc.events.update.useMutation({
    onSuccess: async () => {
      if (!isMountedRef.current) {
        return;
      }

      setSelectedEvent(null);
      setMovingEvent(null);
      setMoveEventScope(undefined);
      setShowMoveDatePicker(false);
      await Promise.all([
        utils.events.invalidate(),
        utils.trainingPlans.invalidate(),
        refetchActivities(),
      ]);
    },
  });

  const selectedDayActivities = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    return allPlannedActivities.items.filter((activity) => {
      return activity.scheduled_date === selectedDate;
    });
  }, [allPlannedActivities, selectedDate]);

  const selectedDayActivitiesByBlock = useMemo(() => {
    const grouped = {
      morning: [] as any[],
      afternoon: [] as any[],
      evening: [] as any[],
    };

    selectedDayActivities.forEach((activity, index) => {
      const blockId = getTimeBlockId(index);
      grouped[blockId].push(activity);
    });

    return grouped;
  }, [selectedDayActivities]);

  const selectedWeekDays = useMemo(() => {
    const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStart, index);
      return {
        date: day,
        dateString: day.toISOString().split("T")[0]!,
      };
    });
  }, [selectedDate]);

  const weeklyActivitiesByDay = useMemo(() => {
    return selectedWeekDays.map(({ dateString, date }) => {
      const dayActivities = allPlannedActivities.items.filter(
        (activity) => activity.scheduled_date === dateString,
      );
      const blockCounts = {
        morning: 0,
        afternoon: 0,
        evening: 0,
      };

      dayActivities.forEach((_, index) => {
        const blockId = getTimeBlockId(index);
        blockCounts[blockId] += 1;
      });

      return {
        date,
        dateString,
        dayActivities,
        blockCounts,
      };
    });
  }, [allPlannedActivities.items, selectedWeekDays]);

  // Get completed activities for the month
  const { data: completedActivities } = trpc.activities.list.useQuery(
    {
      date_from: startDate,
      date_to: endDate,
    },
    {
      enabled: !!startDate && !!endDate,
    },
  );

  // Build marked dates for calendar
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const activities = activitiesData?.items || [];

    // Theme colors for dots
    const primaryDotColor = isDark ? "#fafafa" : "#171717"; // primary color
    const mutedDotColor = isDark ? "#737373" : "#a3a3a3"; // muted color for ad-hoc
    const completedDotColor = "#22c55e"; // green-500 for completed

    // Mark planned activities
    activities.forEach((activity) => {
      const date = activity.scheduled_date;
      const isPlanActivity = !!(activity as any).training_plan_id;

      if (!marks[date]) {
        marks[date] = {
          marked: true,
          dots: [],
        };
      }

      marks[date].dots.push({
        color: isPlanActivity ? primaryDotColor : mutedDotColor,
        selectedDotColor: isPlanActivity ? primaryDotColor : mutedDotColor,
      });
    });

    // Mark completed activities with a different color
    if (completedActivities && Array.isArray(completedActivities)) {
      completedActivities.forEach((activity) => {
        const date = new Date(activity.started_at).toISOString().split("T")[0];
        if (!date) return;

        if (!marks[date]) {
          marks[date] = {
            marked: true,
            dots: [],
          };
        }

        // If already has a planned activity, mark it as completed
        if (marks[date].dots && marks[date].dots.length > 0) {
          marks[date].dots[0].color = completedDotColor;
          marks[date].dots[0].selectedDotColor = completedDotColor;
        }
      });
    }

    // Highlight selected date
    if (selectedDate) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: isDark ? "#fafafa" : "#171717",
      };
    }

    return marks;
  }, [activitiesData, completedActivities, selectedDate, isDark]);

  const weeklyExecutionSummary = useMemo(() => {
    if (!status?.weekProgress) {
      return "No weekly execution data yet";
    }

    const completed = status.weekProgress.completedActivities;
    const planned = status.weekProgress.totalPlannedActivities;
    return `${completed}/${planned} sessions completed this week`;
  }, [status]);

  // Get upcoming activities (next 3-4 days after today, excluding today)
  const upcomingActivities = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    const today = new Date().toISOString().split("T")[0]!;
    const futureDays: { date: string; activities: any[] }[] = [];

    // Get next 4 days
    for (let i = 1; i <= 4; i++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + i);
      const futureDateStr = futureDate.toISOString().split("T")[0]!;

      const activities = allPlannedActivities.items.filter((activity) => {
        return activity.scheduled_date === futureDateStr;
      });

      if (activities.length > 0) {
        futureDays.push({ date: futureDateStr, activities });
      }
    }

    return futureDays.slice(0, 3); // Limit to 3 days
  }, [allPlannedActivities, monthRange.endDate, monthRange.startDate]);

  // Calendar handlers
  const handleDayPress = (day: any) => {
    setActiveDate(day.dateString);
  };

  const handleMonthChange = (month: any) => {
    setCurrentMonth(month.dateString);
  };

  const handleSelectPlannedActivity = (id: string) => {
    dismissOverlaysBeforeNavigation(() => {
      router.push(ROUTES.PLAN.ACTIVITY_DETAIL(id) as any);
    });
  };

  const openEventDetail = (event: PlanEvent) => {
    setSelectedEvent(event);
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
    if (!event) {
      return false;
    }

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
      {
        text: "This event only",
        onPress: () => onSelect("single"),
      },
      {
        text: "This and future events",
        onPress: () => onSelect("future"),
      },
      {
        text: "Entire series",
        style: action === "delete" ? "destructive" : "default",
        onPress: () => onSelect("series"),
      },
    ]);
  };

  const isStartEligible = (event: PlanEvent) => {
    if (event.event_type !== "planned" || !event.activity_plan) {
      return false;
    }

    if (isActivityCompleted(event)) {
      return false;
    }

    return (
      new Date(event.scheduled_date) >= new Date(new Date().toDateString())
    );
  };

  const getEventDateTime = (event: PlanEvent) => {
    const baseDate =
      event.starts_at ||
      `${event.scheduled_date || selectedDate}T00:00:00.000Z`;
    const date = new Date(baseDate);

    return {
      date: format(date, "EEEE, MMM d, yyyy"),
      time: event.all_day ? "All day" : format(date, "h:mm a"),
    };
  };

  const handleOpenEvent = (event: PlanEvent) => {
    if (event.event_type === "planned") {
      handleSelectPlannedActivity(event.id);
      return;
    }

    Alert.alert(
      "Open Event",
      "A dedicated event detail screen for this type is coming soon.",
    );
  };

  const handleEditEvent = (event: PlanEvent) => {
    if (event.event_type === "planned") {
      const openEditorWithScope = (scope: EventMutationScope) => {
        setSelectedEvent(null);
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

    Alert.alert("Edit Event", "Editing for this event type is coming soon.");
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
      getRecurringScopeOptions("delete", (scope) => {
        confirmDelete(scope);
      });
      return;
    }

    confirmDelete();
  };

  const openMovePicker = (event: PlanEvent, scope?: EventMutationScope) => {
    const initialDate = new Date(
      `${event.scheduled_date || selectedDate}T12:00:00.000Z`,
    );
    setSelectedEvent(null);
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

      if (scope) {
        payload.scope = scope;
      }

      moveEventMutation.mutate(payload);
    },
    [moveEventMutation],
  );

  const resetDragState = useCallback(() => {
    setDraggingEvent(null);
    setWeekDragTargetDate(null);
    setDayDragTarget(null);
  }, []);

  const handleDropMove = useCallback(
    (event: PlanEvent, nextDate: string) => {
      const normalizedCurrent = event.scheduled_date
        ? format(new Date(event.scheduled_date), "yyyy-MM-dd")
        : null;

      if (normalizedCurrent === nextDate) {
        return;
      }

      if (isRecurringEvent(event)) {
        getRecurringScopeOptions("move", (scope) => {
          submitMoveUpdate(event.id, nextDate, scope);
        });
        return;
      }

      submitMoveUpdate(event.id, nextDate);
    },
    [submitMoveUpdate],
  );

  const buildWeekDragTargetDate = useCallback(
    (sourceDayIndex: number, gestureState: PanResponderGestureState) => {
      const dayOffset = Math.round(gestureState.dy / WEEK_DRAG_ROW_HEIGHT);
      const targetIndex = clampIndex(
        sourceDayIndex + dayOffset,
        0,
        selectedWeekDays.length - 1,
      );

      return selectedWeekDays[targetIndex]?.dateString ?? null;
    },
    [selectedWeekDays],
  );

  const buildDayDragTarget = useCallback(
    (
      sourceBlockIndex: number,
      gestureState: PanResponderGestureState,
    ): DayDragTarget => {
      const dayOffset = clampIndex(
        Math.round(gestureState.dx / DAY_DRAG_DATE_WIDTH),
        -1,
        1,
      );
      const nextDate = addDays(new Date(selectedDate), dayOffset)
        .toISOString()
        .split("T")[0]!;

      const blockOffset = Math.round(gestureState.dy / DAY_DRAG_BLOCK_HEIGHT);
      const targetBlockIndex = clampIndex(
        sourceBlockIndex + blockOffset,
        0,
        TIME_BLOCKS.length - 1,
      );
      const targetBlock = TIME_BLOCKS[targetBlockIndex] ?? TIME_BLOCKS[0]!;

      return {
        dateString: nextDate,
        blockId: targetBlock.id,
      };
    },
    [selectedDate],
  );

  const createWeekChipDragHandlers = (
    event: PlanEvent,
    sourceDayIndex: number,
  ) =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8,
      onPanResponderGrant: () => {
        setDraggingEvent(event);
        setWeekDragTargetDate(event.scheduled_date || selectedDate);
      },
      onPanResponderMove: (_, gestureState) => {
        const targetDate = buildWeekDragTargetDate(
          sourceDayIndex,
          gestureState,
        );
        setWeekDragTargetDate(targetDate);
      },
      onPanResponderRelease: (_, gestureState) => {
        const targetDate =
          buildWeekDragTargetDate(sourceDayIndex, gestureState) ||
          weekDragTargetDate;

        if (targetDate) {
          handleDropMove(event, targetDate);
        }

        resetDragState();
      },
      onPanResponderTerminate: () => {
        resetDragState();
      },
    }).panHandlers;

  const createDayChipDragHandlers = (
    event: PlanEvent,
    sourceBlockIndex: number,
  ) =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8,
      onPanResponderGrant: () => {
        const sourceBlock = TIME_BLOCKS[sourceBlockIndex] ?? TIME_BLOCKS[0]!;
        setDraggingEvent(event);
        setDayDragTarget({
          dateString: event.scheduled_date || selectedDate,
          blockId: sourceBlock.id,
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const target = buildDayDragTarget(sourceBlockIndex, gestureState);
        setDayDragTarget(target);
      },
      onPanResponderRelease: (_, gestureState) => {
        const target = buildDayDragTarget(sourceBlockIndex, gestureState);
        handleDropMove(event, target.dateString);
        setActiveDate(target.dateString);
        resetDragState();
      },
      onPanResponderTerminate: () => {
        resetDragState();
      },
    }).panHandlers;

  const handleMoveEvent = (event: PlanEvent) => {
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

  const handleStartActivity = (plannedActivity: any) => {
    if (!plannedActivity.activity_plan) {
      return;
    }

    const payload: ActivityPayload = {
      category: plannedActivity.activity_plan.activity_category,
      gpsRecordingEnabled: true,
      eventId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };
    activitySelectionStore.setSelection(payload);

    dismissOverlaysBeforeNavigation(() => {
      router.push(ROUTES.RECORD as any);
    });
  };

  const handleScheduleActivity = () => {
    // Open library to select a plan first
    guardNavigation(() => {
      router.replace(ROUTES.LIBRARY as any);
    });
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
      dismissOverlaysBeforeNavigation(() => {
        router.replace(ROUTES.LIBRARY as any);
      });
      return;
    }

    initializeManualCreate(type);
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
    if (!manualCreateType) {
      return;
    }

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

  const handleViewTrainingPlan = () => {
    router.push(ROUTES.PLAN.ACTIVE_PLAN as any);
  };

  const handleOpenCalendar = useCallback(() => {
    const todayStr = new Date().toISOString().split("T")[0]!;
    setCalendarView("month");
    setActiveDate(todayStr);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, calendarSectionY - 12),
        animated: true,
      });
    });
  }, [calendarSectionY, setActiveDate]);

  const renderEventCard = (
    event: PlanEvent,
    variant: "hero" | "default" | "compact" = "default",
  ) => {
    if (event.event_type === "planned" && event.activity_plan) {
      return (
        <ActivityPlanCard
          plannedActivity={event as any}
          onPress={() => openEventDetail(event)}
          variant={variant}
          showScheduleInfo={false}
        />
      );
    }

    return (
      <TouchableOpacity
        onPress={() => openEventDetail(event)}
        className="bg-card border border-border rounded-lg px-4 py-3"
        activeOpacity={0.8}
        testID={`event-card-${event.id}`}
      >
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-sm font-semibold">{getEventTitle(event)}</Text>
          <Text className="text-xs text-muted-foreground">
            {getEventTypeLabel(event.event_type)}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">
          {event.status || "scheduled"}
        </Text>
      </TouchableOpacity>
    );
  };

  // Calculate plan progress if we have a plan with target date
  // MUST be before any conditional returns to follow React Hooks rules
  const planProgress = useMemo(() => {
    if (!plan) return null;

    const structure = plan.structure as any;
    const periodization = structure?.periodization_template;

    // If we have periodization with a target date, calculate progress
    if (periodization?.target_date) {
      const targetDate = new Date(periodization.target_date);
      const startDate = new Date(plan.created_at);
      const today = new Date();

      const totalDays = Math.floor(
        (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const elapsedDays = Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const progress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
      const daysRemaining = Math.max(0, totalDays - elapsedDays);

      return {
        planName: plan.name,
        daysRemaining,
        progress: Math.min(100, Math.max(0, progress)),
        targetDate: periodization.target_date,
      };
    }

    // No periodization - show basic info
    return {
      planName: plan.name,
      weeksActive: Math.floor(
        (Date.now() - new Date(plan.created_at).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
      progress: 0,
      date: "Active",
    };
  }, [plan]);

  const progressSummary = useMemo(() => {
    if (!planProgress) {
      return "-";
    }

    if ("daysRemaining" in planProgress) {
      return `${planProgress.daysRemaining} days to target`;
    }

    if ("weeksActive" in planProgress) {
      return `${planProgress.weeksActive} weeks active`;
    }

    return "-";
  }, [planProgress]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchSnapshotAll(), refetchActivities()]);

    if (!isMountedRef.current) {
      return;
    }

    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      void Promise.all([refetchSnapshot(), refetchActivities()]);
    }, [refetchSnapshot, refetchActivities]),
  );

  useEffect(() => {
    if (!plan?.id) {
      return;
    }

    void Promise.all([refetchSnapshot(), refetchActivities()]);
  }, [plan?.id, refetchSnapshot, refetchActivities]);

  // Loading state
  if (snapshot.isLoadingSharedDependencies || loadingAllPlanned) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Plan" />
        <ScrollView className="flex-1 p-6">
          <PlanCalendarSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (snapshot.hasSharedDependencyError) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Plan" />
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-muted-foreground text-center">
            Unable to load training plan right now.
          </Text>
          <TouchableOpacity
            onPress={() => void refetchSnapshot()}
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
      <AppHeader title="Plan" />
      {/* Scrollable Content */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="px-4 py-4">
          {/* 1. Active Plan Summary or Placeholder */}
          <View
            className="mb-6"
            onLayout={(event) => {
              setCalendarSectionY(event.nativeEvent.layout.y);
            }}
          >
            {plan && planProgress ? (
              <View className="bg-card border border-border rounded-lg p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold">{plan.name}</Text>
                  <View
                    className={`px-2 py-1 rounded-full ${
                      plan.status === "active"
                        ? "bg-emerald-500/15"
                        : "bg-muted"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        plan.status === "active"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {plan.status === "active"
                        ? "Active"
                        : plan.status === "paused"
                          ? "Paused"
                          : "Completed"}
                    </Text>
                  </View>
                </View>

                <Text className="text-sm text-muted-foreground">
                  {progressSummary}
                </Text>

                {planProgress.progress > 0 && (
                  <View className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <View
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${planProgress.progress}%` }}
                    />
                  </View>
                )}

                <View className="bg-muted/50 rounded-md px-3 py-2">
                  <Text className="text-xs text-muted-foreground">
                    {weeklyExecutionSummary}
                  </Text>
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleViewTrainingPlan}
                    className="flex-1 bg-primary rounded-lg py-2.5 items-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm text-primary-foreground font-medium">
                      Open Full Plan
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleOpenCalendar}
                    className="flex-1 bg-muted rounded-lg py-2.5 items-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm text-muted-foreground font-medium">
                      Open Calendar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="bg-card border border-border rounded-lg overflow-hidden">
                <TouchableOpacity
                  onPress={() =>
                    guardNavigation(() =>
                      router.replace(
                        ROUTES.LIBRARY_WITH_RESOURCE("training_plans"),
                      ),
                    )
                  }
                  className="p-6"
                  activeOpacity={0.7}
                >
                  <View className="items-center">
                    <View className="bg-primary/10 rounded-full p-3 mb-3">
                      <Icon
                        as={CalendarDays}
                        size={32}
                        className="text-primary"
                      />
                    </View>
                    <Text className="font-semibold text-base mb-1">
                      No Training Plan
                    </Text>
                    <Text className="text-sm text-muted-foreground text-center mb-2">
                      Select an existing plan or create a new one
                    </Text>
                    <Text className="text-xs text-primary font-medium">
                      Tap to view plans
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Calendar View */}
          <View className="mb-6">
            <View className="bg-muted/40 rounded-lg p-1 flex-row mb-3">
              {(["month", "week", "day"] as CalendarView[]).map((view) => {
                const isActive = calendarView === view;
                return (
                  <TouchableOpacity
                    key={view}
                    onPress={() => setCalendarView(view)}
                    className={`flex-1 py-2 rounded-md items-center ${
                      isActive ? "bg-background border border-border" : ""
                    }`}
                    activeOpacity={0.8}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isActive ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {calendarView === "month" && (
              <Calendar
                current={currentMonth}
                onDayPress={handleDayPress}
                onMonthChange={handleMonthChange}
                markingType={"multi-dot"}
                markedDates={markedDates}
                theme={{
                  calendarBackground: isDark ? "#0a0a0a" : "#ffffff",
                  textSectionTitleColor: isDark ? "#a3a3a3" : "#737373",
                  selectedDayBackgroundColor: isDark ? "#fafafa" : "#171717",
                  selectedDayTextColor: isDark ? "#171717" : "#fafafa",
                  todayTextColor: isDark ? "#fafafa" : "#171717",
                  dayTextColor: isDark ? "#fafafa" : "#0a0a0a",
                  textDisabledColor: isDark ? "#404040" : "#e5e5e5",
                  dotColor: isDark ? "#fafafa" : "#171717",
                  selectedDotColor: isDark ? "#171717" : "#fafafa",
                  arrowColor: isDark ? "#fafafa" : "#171717",
                  monthTextColor: isDark ? "#fafafa" : "#0a0a0a",
                  indicatorColor: isDark ? "#fafafa" : "#171717",
                  textDayFontFamily: "System",
                  textMonthFontFamily: "System",
                  textDayHeaderFontFamily: "System",
                  textDayFontWeight: "400",
                  textMonthFontWeight: "600",
                  textDayHeaderFontWeight: "600",
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
              />
            )}

            {calendarView === "week" && (
              <View className="bg-card border border-border rounded-lg p-3 gap-2">
                <Text className="text-xs text-muted-foreground mb-1">
                  Week of {format(selectedWeekDays[0]!.date, "MMM d")}
                </Text>
                <View className="gap-2">
                  {weeklyActivitiesByDay.map((day, dayIndex) => {
                    const isSelected = day.dateString === selectedDate;
                    const isDropTarget =
                      draggingEvent?.id &&
                      weekDragTargetDate === day.dateString;
                    return (
                      <TouchableOpacity
                        key={day.dateString}
                        onPress={() => setActiveDate(day.dateString)}
                        className={`rounded-md border p-3 ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background"
                        } ${isDropTarget ? "border-primary bg-primary/10" : ""}`}
                        testID={`week-day-drop-target-${day.dateString}`}
                        accessibilityLabel={`week-day-drop-target-${day.dateString}`}
                        accessibilityState={{ selected: !!isDropTarget }}
                        activeOpacity={0.8}
                      >
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-sm font-medium">
                            {format(day.date, "EEE, MMM d")}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {day.dayActivities.length} planned
                          </Text>
                        </View>
                        <Text className="text-xs text-muted-foreground">
                          Morning {day.blockCounts.morning} | Afternoon{" "}
                          {day.blockCounts.afternoon} | Evening{" "}
                          {day.blockCounts.evening}
                        </Text>
                        {day.dayActivities.length > 0 && (
                          <View className="mt-2 gap-1">
                            {day.dayActivities
                              .slice(0, 2)
                              .map((event: PlanEvent) => (
                                <TouchableOpacity
                                  key={event.id}
                                  onPress={() => {
                                    setActiveDate(day.dateString);
                                    openEventDetail(event);
                                  }}
                                  onLongPress={() => {
                                    setActiveDate(day.dateString);
                                    handleMoveEvent(event);
                                  }}
                                  className="rounded-md border border-border bg-card px-2 py-1"
                                  activeOpacity={0.8}
                                  testID={`week-event-chip-${event.id}`}
                                  {...createWeekChipDragHandlers(
                                    event,
                                    dayIndex,
                                  )}
                                >
                                  <Text className="text-xs text-foreground">
                                    {getEventTitle(event)}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            {day.dayActivities.length > 2 && (
                              <Text className="text-xs text-muted-foreground">
                                +{day.dayActivities.length - 2} more
                              </Text>
                            )}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {calendarView === "day" && (
              <View className="bg-card border border-border rounded-lg p-3 gap-3">
                <Text className="text-sm font-medium">Day timeline</Text>
                <View className="flex-row items-center justify-between">
                  <TouchableOpacity
                    onPress={() => {
                      const previousDate = addDays(new Date(selectedDate), -1)
                        .toISOString()
                        .split("T")[0]!;
                      setActiveDate(previousDate);
                    }}
                    className="px-3 py-2 rounded-md bg-muted"
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm">Previous</Text>
                  </TouchableOpacity>
                  <Text className="text-sm font-semibold">
                    {format(new Date(selectedDate), "EEE, MMM d")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const nextDate = addDays(new Date(selectedDate), 1)
                        .toISOString()
                        .split("T")[0]!;
                      setActiveDate(nextDate);
                    }}
                    className="px-3 py-2 rounded-md bg-muted"
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm">Next</Text>
                  </TouchableOpacity>
                </View>
                <View className="gap-2">
                  {TIME_BLOCKS.map((block, blockIndex) => {
                    const blockEvents = selectedDayActivitiesByBlock[block.id];
                    const count = blockEvents.length;
                    const isBlockDropTarget =
                      !!draggingEvent?.id &&
                      dayDragTarget?.blockId === block.id;
                    return (
                      <View
                        key={block.id}
                        className={`border rounded-md px-3 py-2 ${
                          isBlockDropTarget
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                        testID={`day-time-block-target-${block.id}`}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-sm font-medium">
                            {block.label}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {count} planned
                          </Text>
                        </View>
                        <Text className="text-xs text-muted-foreground mt-1">
                          {block.timeLabel}
                        </Text>
                        {count > 0 && (
                          <View className="mt-2 gap-1">
                            {blockEvents.slice(0, 2).map((event: PlanEvent) => (
                              <TouchableOpacity
                                key={event.id}
                                onPress={() => openEventDetail(event)}
                                onLongPress={() => handleMoveEvent(event)}
                                className="rounded-md border border-border bg-card px-2 py-1"
                                activeOpacity={0.8}
                                testID={`day-event-chip-${event.id}`}
                                {...createDayChipDragHandlers(
                                  event,
                                  blockIndex,
                                )}
                              >
                                <Text className="text-xs text-foreground">
                                  {getEventTitle(event)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            {count > 2 && (
                              <Text className="text-xs text-muted-foreground">
                                +{count - 2} more
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
                {draggingEvent && dayDragTarget && (
                  <View className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
                    <Text className="text-xs text-foreground">
                      Drop target:{" "}
                      {format(new Date(dayDragTarget.dateString), "EEE, MMM d")}{" "}
                      ·{" "}
                      {
                        TIME_BLOCKS.find(
                          (block) => block.id === dayDragTarget.blockId,
                        )?.label
                      }
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Selected Day Activities */}
          <View className="mb-6">
            {/* Date Label */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-semibold">
                {format(new Date(selectedDate), "EEEE, MMM d")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateTypeModal(true)}
                className="rounded-md border border-border bg-card px-3 py-2 flex-row items-center"
                activeOpacity={0.8}
                testID="create-event-entry"
              >
                <Icon as={Plus} size={14} className="text-foreground mr-1" />
                <Text className="text-xs font-medium">Create Event</Text>
              </TouchableOpacity>
            </View>

            {/* Hero Content (Scenarios A, B, C, or D) */}
            {selectedDayActivities.length === 0 ? (
              // Scenario D: Empty/Casual - Simpler Ghost Card
              <GhostCard
                onPress={handleScheduleActivity}
                message="Nothing scheduled"
              />
            ) : selectedDayActivities.length === 1 ? (
              // Scenario A or B: Single Activity - Hero Card
              <View>
                {renderEventCard(selectedDayActivities[0], "hero")}
                {selectedDayActivities[0].event_type === "planned" &&
                  !isActivityCompleted(selectedDayActivities[0]) && (
                    <Button
                      onPress={() =>
                        handleStartActivity(selectedDayActivities[0])
                      }
                      size="lg"
                      className="w-full mt-3"
                    >
                      <Icon
                        as={Play}
                        size={20}
                        className="text-primary-foreground mr-2"
                      />
                      <Text className="text-primary-foreground font-semibold">
                        Start Activity
                      </Text>
                    </Button>
                  )}
              </View>
            ) : (
              // Scenario C: Multiple Activities - Stacked View
              <View className="gap-3">
                {selectedDayActivities.map((activity, index) => (
                  <View key={activity.id}>
                    {renderEventCard(
                      activity,
                      index === 0 ? "default" : "compact",
                    )}
                    {index === 0 &&
                      activity.event_type === "planned" &&
                      !isActivityCompleted(activity) && (
                        <Button
                          onPress={() => handleStartActivity(activity)}
                          size="lg"
                          className="w-full mt-2"
                        >
                          <Icon
                            as={Play}
                            size={20}
                            className="text-primary-foreground mr-2"
                          />
                          <Text className="text-primary-foreground font-semibold">
                            Start Activity
                          </Text>
                        </Button>
                      )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 6. THE HORIZON (Bottom 30% - Forecast) */}
          {upcomingActivities.length > 0 && (
            <View className="mb-6">
              <Text className="text-base font-semibold mb-3">Up Next</Text>
              <View className="gap-2">
                {upcomingActivities.map(({ date, activities }, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setActiveDate(date)}
                    className="bg-card border border-border rounded-lg p-3"
                    activeOpacity={0.7}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold mb-1">
                          {format(new Date(date), "EEE")}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {activities[0]?.activity_plan?.name ||
                            "Unnamed Activity"}
                          {activities.length > 1 &&
                            ` + ${activities.length - 1} more`}
                        </Text>
                      </View>
                      {activities[0]?.activity_plan?.estimated_duration && (
                        <Text className="text-sm text-muted-foreground">
                          {activities[0].activity_plan.estimated_duration} min
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Event Detail Modal */}
      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setSelectedEvent(null)}
          testID="event-detail-overlay"
        >
          <Pressable
            className="bg-background rounded-t-2xl px-4 pt-4 pb-6 gap-3"
            onPress={() => null}
            testID="event-detail-modal"
          >
            {selectedEvent && (
              <>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-lg font-semibold">
                      {getEventTitle(selectedEvent)}
                    </Text>
                    <Text className="text-sm text-muted-foreground mt-1">
                      {getEventTypeLabel(selectedEvent.event_type)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedEvent(null)}
                    className="px-3 py-2 rounded-md bg-muted"
                    activeOpacity={0.8}
                    testID="close-event-detail"
                  >
                    <Text className="text-xs">Close</Text>
                  </TouchableOpacity>
                </View>

                <View className="bg-card border border-border rounded-lg px-3 py-2">
                  <Text className="text-xs text-muted-foreground">Date</Text>
                  <Text className="text-sm font-medium">
                    {getEventDateTime(selectedEvent).date}
                  </Text>
                  {(selectedEvent.event_type === "custom" ||
                    selectedEvent.event_type === "race_target") && (
                    <Text className="text-xs text-muted-foreground mt-1">
                      {getEventDateTime(selectedEvent).time}
                    </Text>
                  )}
                </View>

                {selectedEvent.event_type === "planned" && (
                  <View className="bg-card border border-border rounded-lg px-3 py-2 gap-1">
                    <Text className="text-xs text-muted-foreground">Plan</Text>
                    <Text className="text-sm font-medium">
                      {selectedEvent.activity_plan?.name || "Planned activity"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Category:{" "}
                      {selectedEvent.activity_plan?.activity_category || "-"}
                    </Text>
                  </View>
                )}

                {selectedEvent.event_type === "rest_day" && (
                  <View className="bg-card border border-border rounded-lg px-3 py-2 gap-1">
                    <Text className="text-xs text-muted-foreground">
                      Status
                    </Text>
                    <Text className="text-sm font-medium capitalize">
                      {selectedEvent.status || "scheduled"}
                    </Text>
                    {selectedEvent.notes && (
                      <Text className="text-xs text-muted-foreground mt-1">
                        {selectedEvent.notes}
                      </Text>
                    )}
                  </View>
                )}

                {selectedEvent.event_type === "race_target" && (
                  <View className="bg-card border border-border rounded-lg px-3 py-2 gap-1">
                    <Text className="text-xs text-muted-foreground">
                      Race notes
                    </Text>
                    <Text className="text-sm text-foreground">
                      {selectedEvent.notes ||
                        selectedEvent.description ||
                        "No notes"}
                    </Text>
                  </View>
                )}

                {selectedEvent.event_type === "custom" && (
                  <View className="bg-card border border-border rounded-lg px-3 py-2 gap-1">
                    <Text className="text-xs text-muted-foreground">Notes</Text>
                    <Text className="text-sm text-foreground">
                      {selectedEvent.notes ||
                        selectedEvent.description ||
                        "No notes"}
                    </Text>
                  </View>
                )}

                {selectedEvent.event_type === "imported" && (
                  <View
                    className="bg-muted/40 border border-border rounded-lg px-3 py-2 gap-1"
                    testID="imported-read-only"
                  >
                    <Text className="text-xs text-muted-foreground">
                      Source
                    </Text>
                    <Text className="text-sm font-medium">
                      {selectedEvent.source_provider || "External calendar"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Read-only imported event
                    </Text>
                  </View>
                )}

                {selectedEvent.notes &&
                  selectedEvent.event_type !== "custom" &&
                  selectedEvent.event_type !== "race_target" &&
                  selectedEvent.event_type !== "rest_day" && (
                    <View className="bg-card border border-border rounded-lg px-3 py-2 gap-1">
                      <Text className="text-xs text-muted-foreground">
                        Notes
                      </Text>
                      <Text className="text-sm text-foreground">
                        {selectedEvent.notes}
                      </Text>
                    </View>
                  )}

                <View className="gap-2 pt-1">
                  {selectedEvent.event_type === "planned" &&
                    isStartEligible(selectedEvent) && (
                      <Button
                        onPress={() => handleStartActivity(selectedEvent)}
                        size="lg"
                      >
                        <Icon
                          as={Play}
                          size={20}
                          className="text-primary-foreground mr-2"
                        />
                        <Text className="text-primary-foreground font-semibold">
                          Start Activity
                        </Text>
                      </Button>
                    )}

                  {isEditableEvent(selectedEvent) ? (
                    <>
                      <Button
                        variant="outline"
                        onPress={() => handleOpenEvent(selectedEvent)}
                        testID="event-action-open"
                      >
                        <Text>Open</Text>
                      </Button>
                      <Button
                        variant="outline"
                        onPress={() => handleEditEvent(selectedEvent)}
                        testID="event-action-edit"
                      >
                        <Text>Edit</Text>
                      </Button>
                      <Button
                        variant="outline"
                        onPress={() => handleMoveEvent(selectedEvent)}
                        disabled={moveEventMutation.isPending}
                        testID="event-action-move"
                      >
                        <Text>
                          {moveEventMutation.isPending ? "Moving..." : "Move"}
                        </Text>
                      </Button>
                      <Button
                        variant="outline"
                        onPress={() => handleDeleteEvent(selectedEvent)}
                        disabled={deleteEventMutation.isPending}
                        testID="event-action-delete"
                      >
                        <Text className="text-destructive">
                          {deleteEventMutation.isPending
                            ? "Deleting..."
                            : "Delete"}
                        </Text>
                      </Button>
                    </>
                  ) : (
                    <Text className="text-xs text-muted-foreground">
                      Imported events are read-only and cannot be edited.
                    </Text>
                  )}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
            if (!isMountedRef.current) {
              return;
            }

            setEditingEventId(null);
            setEditingEventScope("single");
            void handleRefresh();
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
                  Pick from your library and schedule it.
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
                    <TouchableOpacity
                      onPress={() => setManualAllDay((current) => !current)}
                      className="rounded-md border border-border bg-card px-3 py-2"
                      activeOpacity={0.8}
                      testID="manual-create-all-day-toggle"
                    >
                      <Text className="text-xs">
                        {manualAllDay ? "Yes" : "No"}
                      </Text>
                    </TouchableOpacity>
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

export default function PlanScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanScreen />
    </ErrorBoundary>
  );
}
