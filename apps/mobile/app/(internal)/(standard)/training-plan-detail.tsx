import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Icon } from "@repo/ui/components/icon";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Heart,
  Trash2,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { DateField } from "@/components/training-plan/create/inputs/DateField";
import { TrainingPlanSummaryHeader } from "@/components/training-plan/TrainingPlanSummaryHeader";
import { ROUTES } from "@/lib/constants/routes";
import {
  normalizeTrainingPlanNextStep,
  TPV_NEXT_STEP_INTENTS,
} from "@/lib/constants/trainingPlanIntents";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { trpc } from "@/lib/trpc";
import { scheduleAwareReadQueryOptions } from "@/lib/trpc/scheduleQueryOptions";

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

type StructureSessionRow = {
  key: string;
  title: string;
  activityPlanId: string | null;
  dayOffset: number;
  sourcePath: Array<string | number>;
};

type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: number | null;
  structure?: unknown;
};

type GroupedMicrocycleSessions = {
  microcycle: number;
  days: Array<{
    dayOffset: number;
    sessions: StructureSessionRow[];
  }>;
};

type ScheduleAnchorMode = "start" | "finish";

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function hasIntervals(structure: unknown): boolean {
  if (!structure || typeof structure !== "object") {
    return false;
  }

  const intervals = (structure as Record<string, unknown>).intervals;
  return Array.isArray(intervals) && intervals.length > 0;
}

function extractSessionRows(structure: unknown): StructureSessionRow[] {
  if (!structure || typeof structure !== "object") {
    return [];
  }

  const rows: StructureSessionRow[] = [];
  const root = structure as Record<string, unknown>;

  const pushSession = (
    session: Record<string, unknown>,
    index: number,
    sourcePath: Array<string | number>,
    inheritedTitle?: string,
    inheritedOffsetDays = 0,
  ) => {
    const sessionOffset = readNumber(session.offset_days) ?? readNumber(session.day_offset);
    if (sessionOffset === undefined) {
      return;
    }

    const dayOffset = inheritedOffsetDays + sessionOffset;
    const title =
      readText(session.title) ?? readText(session.name) ?? inheritedTitle ?? `Session ${index + 1}`;

    rows.push({
      key: `${dayOffset}-${title}-${index}`,
      title,
      activityPlanId: readText(session.activity_plan_id) ?? null,
      dayOffset,
      sourcePath,
    });
  };

  const traverse = (
    node: Record<string, unknown>,
    basePath: Array<string | number>,
    inheritedTitle?: string,
    inheritedOffsetDays = 0,
  ) => {
    const sessions = Array.isArray(node.sessions)
      ? (node.sessions as Record<string, unknown>[])
      : [];
    sessions.forEach((session, sessionIndex) => {
      pushSession(
        session,
        sessionIndex,
        [...basePath, "sessions", sessionIndex],
        inheritedTitle,
        inheritedOffsetDays,
      );
    });

    const blocks = Array.isArray(node.blocks) ? (node.blocks as Record<string, unknown>[]) : [];

    blocks.forEach((block, blockIndex) => {
      const blockOffset = readNumber(block.offset_days) ?? readNumber(block.day_offset) ?? 0;
      const blockTitle = readText(block.name) ?? inheritedTitle;
      traverse(
        block,
        [...basePath, "blocks", blockIndex],
        blockTitle,
        inheritedOffsetDays + blockOffset,
      );
    });
  };

  traverse(root, []);

  return rows.sort((a, b) => a.dayOffset - b.dayOffset);
}

function cloneStructure(structure: unknown): Record<string, unknown> | null {
  if (!structure || typeof structure !== "object") {
    return null;
  }

  return JSON.parse(JSON.stringify(structure)) as Record<string, unknown>;
}

function readSessionFromPath(
  structure: Record<string, unknown>,
  sourcePath: Array<string | number>,
): Record<string, unknown> | null {
  let current: unknown = structure;

  for (const segment of sourcePath) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || !current[segment]) {
        return null;
      }
      current = current[segment];
      continue;
    }

    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current && typeof current === "object" ? (current as Record<string, unknown>) : null;
}

function groupSessionsByMicrocycle(sessions: StructureSessionRow[]): GroupedMicrocycleSessions[] {
  const byMicrocycle = new Map<number, Map<number, StructureSessionRow[]>>();

  sessions.forEach((session) => {
    const microcycle = Math.floor(session.dayOffset / 7) + 1;
    const byDay = byMicrocycle.get(microcycle) ?? new Map<number, StructureSessionRow[]>();
    const dayRows = byDay.get(session.dayOffset) ?? [];
    dayRows.push(session);
    byDay.set(session.dayOffset, dayRows);
    byMicrocycle.set(microcycle, byDay);
  });

  return [...byMicrocycle.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([microcycle, byDay]) => ({
      microcycle,
      days: [...byDay.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([dayOffset, daySessions]) => ({
          dayOffset,
          sessions: daySessions,
        })),
    }));
}

function formatCompactDayLabel(dayOffset: number) {
  const weekdayLabel = weekDayLabels[((dayOffset % 7) + 7) % 7] ?? "Day";
  return `${weekdayLabel} · Day ${dayOffset + 1}`;
}

export default function TrainingPlanOverview() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const utils = trpc.useUtils();
  const { id, nextStep, activityId } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
    activityId?: string;
  }>();

  const isSystemTemplateId = id?.startsWith("00000000-0000-0000-0000-00000000") ? true : false;

  const { data: templatePlan, isLoading: isLoadingTemplate } =
    trpc.trainingPlans.getTemplate.useQuery(isSystemTemplateId && id ? { id } : skipToken, {
      enabled: isSystemTemplateId && !!id,
    });

  const { data: rawActivePlan } = trpc.trainingPlans.getActivePlan.useQuery(
    undefined,
    scheduleAwareReadQueryOptions,
  );
  const activePlan = rawActivePlan as any;

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const snapshot = useTrainingPlanSnapshot({
    planId: isSystemTemplateId ? undefined : id,
    includeWeeklySummaries: false,
  });

  const plan = (isSystemTemplateId ? templatePlan : snapshot.plan) as any;
  const loadingPlan = isSystemTemplateId ? isLoadingTemplate : snapshot.isLoadingSharedDependencies;
  const isOwnedByUser = plan?.profile_id === profile?.id;

  const [refreshing, setRefreshing] = React.useState(false);
  const [scheduleAnchorMode, setScheduleAnchorMode] = React.useState<ScheduleAnchorMode>("start");
  const [templateAnchorDate, setTemplateAnchorDate] = React.useState("");
  const [showApplyModal, setShowApplyModal] = React.useState(false);
  const [showConcurrencyWarning, setShowConcurrencyWarning] = React.useState(false);
  const [showActivityPicker, setShowActivityPicker] = React.useState(false);
  const [selectedSessionRow, setSelectedSessionRow] = React.useState<StructureSessionRow | null>(
    null,
  );

  const handleOpenCalendar = useCallback(() => {
    router.replace(ROUTES.CALENDAR as any);
  }, [router]);

  const handleOpenActivePlan = useCallback(() => {
    if (typeof activePlan?.id === "string") {
      router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(activePlan.id) as any);
      return;
    }

    router.replace(ROUTES.PLAN.INDEX as any);
  }, [activePlan?.id, router]);

  const duplicatePlanMutation = trpc.trainingPlans.duplicate.useMutation({
    onSuccess: async (result: { id: string }) => {
      await utils.trainingPlans.invalidate();
      Alert.alert("Duplicated", "Training plan added to your plans.", [
        {
          text: "Open",
          onPress: () => router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.id) as any),
        },
      ]);
    },
    onError: (error: { message?: string }) => {
      Alert.alert("Duplicate failed", error.message || "Could not duplicate this training plan");
    },
  });

  const applyTemplateMutation = trpc.trainingPlans.applyTemplate.useMutation({
    onSuccess: async (result) => {
      await refreshScheduleViews(queryClient, "trainingPlanSchedulingMutation");
      const successActions = [] as Array<{
        text: string;
        onPress: () => void;
      }>;

      if (typeof result.applied_plan_id === "string") {
        successActions.push({
          text: "Open Scheduled Plan",
          onPress: () =>
            router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.applied_plan_id) as any),
        });
      }

      successActions.push({
        text: "View Calendar",
        onPress: handleOpenCalendar,
      });

      Alert.alert(
        "Plan scheduled",
        `Scheduled ${result.created_event_count} session${result.created_event_count === 1 ? "" : "s"} on your calendar.`,
        successActions,
      );
      setShowApplyModal(false);
    },
    onError: (error) => {
      if (error.message?.includes("active training plan")) {
        Alert.alert(
          "Finish your current plan first",
          "You already have scheduled sessions from a training plan. Finish or abandon that plan before scheduling another one.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Current Plan",
              onPress: handleOpenActivePlan,
            },
          ],
        );
        return;
      }

      Alert.alert("Schedule failed", error.message || "Could not schedule this training plan");
    },
  });

  const deletePlanMutation = useReliableMutation(trpc.trainingPlans.delete, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Plan Deleted", "Your training plan has been deleted", [
        {
          text: "OK",
          onPress: () => router.replace(ROUTES.PLAN.INDEX),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Delete Failed", error.message || "Failed to delete plan");
    },
  });

  const [isPublic, setIsPublic] = useState(plan?.template_visibility === "public");
  useEffect(() => {
    setIsPublic(plan?.template_visibility === "public");
  }, [plan?.template_visibility]);

  const updateVisibilityMutation = trpc.trainingPlans.update.useMutation({
    onSuccess: () => {
      utils.trainingPlans.invalidate();
    },
    onError: (error) => {
      setIsPublic(plan?.template_visibility === "public");
      Alert.alert("Update Failed", error.message || "Failed to update visibility");
    },
  });

  const handleTogglePrivacy = useCallback(() => {
    if (!plan) return;
    const newVisibility = !isPublic;
    setIsPublic(newVisibility);
    updateVisibilityMutation.mutate({
      id: plan.id,
      template_visibility: newVisibility ? "public" : "private",
    });
  }, [isPublic, plan, updateVisibilityMutation]);

  const [isLiked, setIsLiked] = useState(plan?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(plan?.likes_count ?? 0);
  useEffect(() => {
    setIsLiked(plan?.has_liked ?? false);
    setLikesCount(plan?.likes_count ?? 0);
  }, [plan?.has_liked, plan?.likes_count]);

  const {
    data: activityPlansData,
    isLoading: isLoadingActivityPlans,
    refetch: refetchActivityPlans,
  } = trpc.activityPlans.list.useQuery(
    {
      ownerScope: "own",
      limit: 100,
    },
    {
      enabled: !!plan?.id && !!isOwnedByUser,
    },
  );

  const structureSessionRows = useMemo(
    () => extractSessionRows(plan?.structure),
    [plan?.structure],
  );
  const linkedActivityPlanIds = useMemo(
    () =>
      Array.from(
        new Set(
          structureSessionRows
            .map((session) => session.activityPlanId)
            .filter((id): id is string => !!id),
        ),
      ),
    [structureSessionRows],
  );

  const { data: linkedActivityPlansData, isLoading: isLoadingLinkedPlans } =
    trpc.activityPlans.getManyByIds.useQuery(
      linkedActivityPlanIds.length > 0
        ? {
            ids: linkedActivityPlanIds,
          }
        : skipToken,
      {
        enabled: linkedActivityPlanIds.length > 0,
      },
    );

  const updatePlanStructureMutation = trpc.trainingPlans.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.trainingPlans.invalidate(), snapshot.refetchAll()]);
      Alert.alert("Session updated", "Training plan structure was saved.");
      setShowActivityPicker(false);
      setSelectedSessionRow(null);
    },
    onError: (error) => {
      Alert.alert("Update failed", error.message || "Could not update this session assignment.");
    },
  });

  const toggleLikeMutation = trpc.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
    },
  });

  const handleToggleLike = useCallback(() => {
    if (!plan?.id) return;
    if (!isValidUuid(plan.id)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: plan.id,
      entity_type: "training_plan",
    });
  }, [plan?.id, isLiked, toggleLikeMutation]);

  const handleOpenActivity = useCallback(() => {
    if (typeof activityId !== "string") return;
    router.push(ROUTES.PLAN.ACTIVITY_DETAIL(activityId) as any);
  }, [activityId, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await snapshot.refetchAll();
    setRefreshing(false);
  };

  const handleCreatePlan = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  };

  const handleEditStructure = useCallback(() => {
    if (!isOwnedByUser) {
      Alert.alert("Template is read-only", "Only the template owner can edit structure.");
      return;
    }
    router.push({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan?.id, initialTab: "plan" },
    });
  }, [isOwnedByUser, plan?.id, router]);

  const handleDeletePlan = useCallback(() => {
    if (!plan) return;
    Alert.alert(
      "Delete Training Plan?",
      "This action cannot be undone. All planned activities associated with this training plan will also be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePlanMutation.mutateAsync({ id: plan.id });
          },
        },
      ],
    );
  }, [deletePlanMutation, plan]);

  const handleDuplicate = useCallback(() => {
    if (!plan?.id) {
      Alert.alert("Duplicate failed", "No plan ID was found.");
      return;
    }
    duplicatePlanMutation.mutate({
      id: plan.id,
      newName: `${plan.name} (Copy)`,
    });
  }, [duplicatePlanMutation, plan?.id, plan?.name]);

  const scheduleAnchorContent = useMemo(() => {
    if (scheduleAnchorMode === "finish") {
      return {
        fieldLabel: "Finish By",
        fieldPlaceholder: "Select finish date",
        helperText:
          templateAnchorDate.length > 0
            ? "We'll back-schedule the earlier sessions so the final session lands by this date."
            : "Choose the date your final session should land. We'll place the earlier sessions automatically.",
        emptyDateTitle: "Choose a finish date",
        emptyDateMessage: "Pick the date you want this plan to finish, or switch back to Start On.",
        invalidDateTitle: "Invalid finish date",
      };
    }

    return {
      fieldLabel: "Start On",
      fieldPlaceholder: "Select start date",
      helperText:
        templateAnchorDate.length > 0
          ? "Week 1 will begin on this date and the rest of the plan will follow from there."
          : "Leave blank to start from today, or pick the day you want week 1 to begin.",
      emptyDateTitle: null,
      emptyDateMessage: null,
      invalidDateTitle: "Invalid start date",
    };
  }, [scheduleAnchorMode, templateAnchorDate]);

  const handleSelectScheduleAnchorMode = useCallback((mode: ScheduleAnchorMode) => {
    setScheduleAnchorMode(mode);
    setTemplateAnchorDate("");
  }, []);

  const executeApplyTemplate = (normalizedAnchorDate: string, anchorMode: ScheduleAnchorMode) => {
    applyTemplateMutation.mutate({
      template_type: "training_plan",
      template_id: plan!.id,
      start_date: anchorMode === "start" && normalizedAnchorDate ? normalizedAnchorDate : undefined,
      target_date:
        anchorMode === "finish" && normalizedAnchorDate ? normalizedAnchorDate : undefined,
    });
  };

  const handleApplyTemplate = useCallback(() => {
    if (!plan?.id) {
      Alert.alert("Schedule failed", "No plan ID was found.");
      return;
    }

    const normalizedAnchorDate = templateAnchorDate.trim();

    if (scheduleAnchorMode === "finish" && !normalizedAnchorDate) {
      Alert.alert(
        scheduleAnchorContent.emptyDateTitle ?? "Choose a finish date",
        scheduleAnchorContent.emptyDateMessage ?? "Pick the date you want this plan to finish.",
      );
      return;
    }

    if (normalizedAnchorDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedAnchorDate)) {
      Alert.alert(scheduleAnchorContent.invalidDateTitle, "Use YYYY-MM-DD format.");
      return;
    }

    if (activePlan) {
      setShowApplyModal(false);
      setShowConcurrencyWarning(true);
    } else {
      executeApplyTemplate(normalizedAnchorDate, scheduleAnchorMode);
    }
  }, [
    activePlan,
    applyTemplateMutation,
    scheduleAnchorContent.emptyDateMessage,
    scheduleAnchorContent.emptyDateTitle,
    scheduleAnchorContent.invalidDateTitle,
    scheduleAnchorMode,
    plan,
    templateAnchorDate,
  ]);

  const activityPlanItems = ((activityPlansData?.items ?? []) as ActivityPlanListItem[]) ?? [];
  const linkedActivityPlanItems =
    ((linkedActivityPlansData?.items ?? []) as ActivityPlanListItem[]) ?? [];
  const linkedActivityPlanById = useMemo(
    () => new Map(linkedActivityPlanItems.map((item) => [item.id, item])),
    [linkedActivityPlanItems],
  );
  const activityPlanNameById = useMemo(() => {
    const map = new Map<string, string>();
    linkedActivityPlanItems.forEach((item) => {
      map.set(item.id, item.name);
    });
    activityPlanItems.forEach((item) => {
      map.set(item.id, item.name);
    });
    return map;
  }, [activityPlanItems, linkedActivityPlanItems]);
  const groupedStructureSessions = useMemo(
    () => groupSessionsByMicrocycle(structureSessionRows),
    [structureSessionRows],
  );

  const weeklyLoadSummary = useMemo(
    () =>
      groupedStructureSessions.map((microcycle) => {
        const estimatedTss = microcycle.days.reduce((weekTotal, day) => {
          const dayTotal = day.sessions.reduce((sessionTotal, session) => {
            if (!session.activityPlanId) {
              return sessionTotal;
            }

            const linkedPlan = linkedActivityPlanById.get(session.activityPlanId);
            return sessionTotal + readFiniteNumber(linkedPlan?.estimated_tss);
          }, 0);

          return weekTotal + dayTotal;
        }, 0);

        return {
          microcycle: microcycle.microcycle,
          estimatedTss,
        };
      }),
    [groupedStructureSessions, linkedActivityPlanById],
  );

  const maxWeeklyLoad = useMemo(
    () => Math.max(1, ...weeklyLoadSummary.map((week) => week.estimatedTss)),
    [weeklyLoadSummary],
  );

  const uniqueLinkedActivityPlans = useMemo(
    () =>
      linkedActivityPlanIds
        .map((linkedPlanId) => linkedActivityPlanById.get(linkedPlanId))
        .filter((planItem): planItem is ActivityPlanListItem => !!planItem),
    [linkedActivityPlanById, linkedActivityPlanIds],
  );

  const commitSessionActivityPlan = useCallback(
    async (
      sessionRow: StructureSessionRow,
      nextActivityPlanId: string | null,
      fallbackSessionTitle?: string,
    ) => {
      if (!plan?.id || !plan?.structure) {
        Alert.alert("Update failed", "Training plan structure is unavailable.");
        return;
      }

      const nextStructure = cloneStructure(plan.structure);
      if (!nextStructure) {
        Alert.alert("Update failed", "Training plan structure is invalid.");
        return;
      }

      const targetSession = readSessionFromPath(nextStructure, sessionRow.sourcePath);
      if (!targetSession) {
        Alert.alert("Update failed", "Could not locate the selected session.");
        return;
      }

      targetSession.activity_plan_id = nextActivityPlanId;
      if (!readText(targetSession.title) && fallbackSessionTitle) {
        targetSession.title = fallbackSessionTitle;
      }

      await updatePlanStructureMutation.mutateAsync({
        id: plan.id,
        structure: nextStructure as any,
      });
    },
    [plan?.id, plan?.structure, updatePlanStructureMutation],
  );

  const handleOpenActivityPickerForSession = useCallback((sessionRow: StructureSessionRow) => {
    setSelectedSessionRow(sessionRow);
    setShowActivityPicker(true);
  }, []);

  const handleSelectActivityForSession = useCallback(
    async (activityPlan: ActivityPlanListItem) => {
      if (!selectedSessionRow) {
        return;
      }

      await commitSessionActivityPlan(selectedSessionRow, activityPlan.id, activityPlan.name);
    },
    [commitSessionActivityPlan, selectedSessionRow],
  );

  const handleRemoveActivityFromSession = useCallback(
    (sessionRow: StructureSessionRow) => {
      Alert.alert(
        "Remove linked activity?",
        "This session will no longer reference an activity plan.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              void commitSessionActivityPlan(sessionRow, null);
            },
          },
        ],
      );
    },
    [commitSessionActivityPlan],
  );

  const focusContext = useMemo(() => {
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REFINE && isOwnedByUser) {
      return {
        title: "Refine Plan",
        description:
          "Your plan is ready. Open edit to adjust constraints, targets, and plan details.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.EDIT && isOwnedByUser) {
      return {
        title: "Edit Plan Structure",
        description:
          "Tune weekly targets and constraints in edit mode before your next scheduling cycle.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.MANAGE && isOwnedByUser) {
      return {
        title: "Manage Plan",
        description:
          "Review status, activation, and defaults in edit so the execution tab stays focused.",
        ctaLabel: "Manage Plan",
        onPress: handleEditStructure,
      };
    }
    if (
      normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REVIEW_ACTIVITY &&
      typeof activityId === "string"
    ) {
      return {
        title: "Review Planned Activity",
        description: "Open the linked activity to inspect details and make focused adjustments.",
        ctaLabel: "Open Activity",
        onPress: handleOpenActivity,
      };
    }
    return null;
  }, [
    activityId,
    handleEditStructure,
    handleOpenActivity,
    isOwnedByUser,
    normalizedNextStepIntent,
  ]);

  React.useEffect(() => {
    if (!loadingPlan && !plan && !id) {
      router.replace(ROUTES.PLAN.TRAINING_PLAN.CREATE as any);
    }
  }, [id, loadingPlan, plan, router]);

  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading training plan...</Text>
      </View>
    );
  }

  if (snapshot.hasSharedDependencyError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-3">
        <Text className="text-muted-foreground text-center">
          Unable to load training plan right now.
        </Text>
        <TouchableOpacity
          onPress={() => void snapshot.refetch()}
          className="px-4 py-2 rounded-full border border-border bg-card"
          activeOpacity={0.8}
        >
          <Text className="text-foreground">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!plan) {
    if (!id) {
      return (
        <View className="flex-1 bg-background items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">Opening plan creation...</Text>
        </View>
      );
    }

    return (
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="flex-1 p-6 gap-6">
          <Card className="mt-8">
            <CardContent className="p-8">
              <View className="items-center">
                <View className="bg-primary/10 rounded-full p-6 mb-6">
                  <Icon as={Activity} size={64} className="text-primary" />
                </View>
                <Text className="text-2xl font-bold mb-3 text-center">No Training Plan</Text>
                <Text className="text-base text-muted-foreground text-center mb-6">
                  A training plan helps you build fitness systematically, track your progress, and
                  prevent overtraining through structured activities and recovery.
                </Text>
                <View className="w-full gap-3">
                  <Button size="lg" onPress={handleCreatePlan}>
                    <Text className="text-primary-foreground font-semibold">
                      Create Training Plan
                    </Text>
                  </Button>
                </View>
              </View>
            </CardContent>
          </Card>

          <View className="gap-4 mt-4">
            <Text className="text-lg font-semibold">Benefits of a Training Plan:</Text>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={TrendingUp} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Track Your Fitness</Text>
                <Text className="text-sm text-muted-foreground">
                  Monitor CTL, ATL, and TSB to understand your fitness trends and form.
                </Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Calendar} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Structured Scheduling</Text>
                <Text className="text-sm text-muted-foreground">
                  Weekly TSS targets and constraint validation ensure balanced training.
                </Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Activity} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Prevent Overtraining</Text>
                <Text className="text-sm text-muted-foreground">
                  Recovery rules and intensity distribution keep you healthy and improving.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View className="flex-1 p-4 gap-4">
        <View className="mb-4">
          {focusContext && (
            <Card className="border-primary/40 bg-primary/5 mb-4">
              <CardContent className="p-3">
                <Text className="text-sm text-primary font-semibold">{focusContext.title}</Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  {focusContext.description}
                </Text>
                <TouchableOpacity
                  onPress={focusContext.onPress}
                  className="self-start mt-2 px-3 py-1.5 rounded-full bg-primary"
                  activeOpacity={0.8}
                >
                  <Text className="text-xs font-semibold text-primary-foreground">
                    {focusContext.ctaLabel}
                  </Text>
                </TouchableOpacity>
              </CardContent>
            </Card>
          )}

          <TrainingPlanSummaryHeader
            title={plan.name}
            description={plan.description || undefined}
            isActive={false}
            inactiveLabel="Template"
            createdAt={plan.created_at}
            showStatusDot={false}
            formatStartedDate={(date) =>
              date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }
            rightAccessory={
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={handleToggleLike}
                  className="flex-row items-center bg-primary/10 rounded-full px-3 py-2 gap-1"
                >
                  <Icon
                    as={Heart}
                    size={18}
                    className={isLiked ? "text-red-500 fill-red-500" : "text-primary"}
                  />
                  {likesCount > 0 && (
                    <Text className="text-sm font-medium text-primary">{likesCount}</Text>
                  )}
                </Pressable>
                {isOwnedByUser && (
                  <TouchableOpacity onPress={handleEditStructure} className="ml-1">
                    <View className="bg-primary/10 rounded-full p-2">
                      <Icon as={ChevronRight} size={24} className="text-primary" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            }
          />

          <Card className="mt-3">
            <CardContent className="p-3 gap-3">
              <View className="gap-1">
                <Text className="text-sm font-semibold">Plan Actions</Text>
                <Text className="text-xs text-muted-foreground">
                  Get this plan onto your calendar first, then use editing only when you need to
                  customize it.
                </Text>
                {!isOwnedByUser ? (
                  <Text className="text-xs text-muted-foreground">
                    Shared plans stay read-only here. Make an editable copy if you want to customize
                    the structure first.
                  </Text>
                ) : null}
              </View>

              {isOwnedByUser && (
                <View className="flex-row items-center justify-between bg-muted/30 rounded-lg p-3">
                  <View className="flex-row items-center gap-2">
                    <Icon
                      as={isPublic ? Eye : EyeOff}
                      size={18}
                      className="text-muted-foreground"
                    />
                    <View>
                      <Text className="text-sm font-medium">{isPublic ? "Public" : "Private"}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {isPublic
                          ? "Anyone can find and use this template"
                          : "Only you can see this template"}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={handleTogglePrivacy}
                    disabled={updateVisibilityMutation.isPending}
                  />
                </View>
              )}

              <View className="flex-row gap-2">
                {isOwnedByUser ? (
                  <Button variant="outline" onPress={handleEditStructure} className="flex-1">
                    <Text>Edit Plan</Text>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onPress={handleDuplicate}
                    disabled={duplicatePlanMutation.isPending}
                    className="flex-1"
                  >
                    <Icon as={Copy} size={16} className="text-foreground mr-2" />
                    <Text className="text-foreground font-medium">
                      {duplicatePlanMutation.isPending ? "Duplicating..." : "Make Editable Copy"}
                    </Text>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onPress={() => router.push(ROUTES.CALENDAR as any)}
                  className="flex-1"
                >
                  <Text>Calendar</Text>
                </Button>
              </View>

              <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
                <DialogTrigger asChild>
                  <Button className="w-full">
                    <Text className="text-primary-foreground font-semibold">Schedule Sessions</Text>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Schedule this plan</DialogTitle>
                    <DialogDescription>
                      Choose one anchor for this schedule. You can either place week 1 on a date or
                      finish the whole plan by a date.
                    </DialogDescription>
                  </DialogHeader>
                  <View className="gap-4 py-4">
                    <View className="gap-2">
                      <Text className="text-sm font-medium">How should this schedule line up?</Text>
                      <RadioGroup
                        value={scheduleAnchorMode}
                        onValueChange={(nextValue) => {
                          if (nextValue === "start" || nextValue === "finish") {
                            handleSelectScheduleAnchorMode(nextValue);
                          }
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => handleSelectScheduleAnchorMode("start")}
                          className={`rounded-lg border px-3 py-3 ${scheduleAnchorMode === "start" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                          activeOpacity={0.8}
                        >
                          <View className="flex-row items-start gap-3">
                            <RadioGroupItem value="start" />
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-foreground">
                                Start On
                              </Text>
                              <Text className="mt-1 text-xs text-muted-foreground">
                                Put week 1 on a specific date.
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSelectScheduleAnchorMode("finish")}
                          className={`rounded-lg border px-3 py-3 ${scheduleAnchorMode === "finish" ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                          activeOpacity={0.8}
                        >
                          <View className="flex-row items-start gap-3">
                            <RadioGroupItem value="finish" />
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-foreground">
                                Finish By
                              </Text>
                              <Text className="mt-1 text-xs text-muted-foreground">
                                Back-schedule the plan so the final session lands by a specific
                                date.
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </RadioGroup>
                    </View>
                    <View className="gap-2">
                      <DateField
                        id="apply-template-anchor-date"
                        label={scheduleAnchorContent.fieldLabel}
                        value={templateAnchorDate || undefined}
                        onChange={(nextDate) => setTemplateAnchorDate(nextDate ?? "")}
                        placeholder={scheduleAnchorContent.fieldPlaceholder}
                        helperText={scheduleAnchorContent.helperText}
                        clearable
                        pickerPresentation="modal"
                      />
                    </View>
                  </View>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">
                        <Text className="text-foreground font-medium">Cancel</Text>
                      </Button>
                    </DialogClose>
                    <Button
                      onPress={handleApplyTemplate}
                      disabled={applyTemplateMutation.isPending}
                    >
                      <Text className="text-primary-foreground font-semibold">
                        {applyTemplateMutation.isPending ? "Scheduling..." : "Schedule Sessions"}
                      </Text>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </View>

        <Card>
          <CardHeader>
            <CardTitle>Training Plan Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              {plan.structure && (
                <>
                  <View className="flex-row flex-wrap gap-2">
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).target_weekly_tss_min} -{" "}
                        {(plan.structure as any).target_weekly_tss_max} weekly TSS
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).target_activities_per_week} sessions/week
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).max_consecutive_days} max consecutive days
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).min_rest_days_per_week} rest days/week
                      </Text>
                    </View>
                  </View>
                  {(plan.structure as any).periodization_template && (
                    <>
                      <View className="h-px bg-border" />
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">Periodization</Text>
                        <Text className="font-semibold">
                          {(plan.structure as any).periodization_template.starting_ctl} →{" "}
                          {(plan.structure as any).periodization_template.target_ctl} CTL
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">Target Date</Text>
                        <Text className="font-semibold">
                          {new Date(
                            (plan.structure as any).periodization_template.target_date,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                      </View>
                    </>
                  )}
                  {isOwnedByUser && (
                    <>
                      <View className="h-px bg-border" />
                      <TouchableOpacity onPress={handleEditStructure} className="pt-1">
                        <Text className="text-sm font-semibold text-primary">
                          Edit structure in composer
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              <View className="h-px bg-border" />
              <View className="gap-2">
                <Text className="text-sm font-semibold">Microcycle weekly load (estimated)</Text>
                {weeklyLoadSummary.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">
                    Add linked activity plans to see estimated weekly TSS.
                  </Text>
                ) : (
                  <View className="gap-2">
                    {weeklyLoadSummary.map((week) => {
                      const widthPercent = Math.max(6, (week.estimatedTss / maxWeeklyLoad) * 100);

                      return (
                        <View key={`week-load-${week.microcycle}`} className="gap-1">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-xs font-medium text-foreground">
                              Week {week.microcycle}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {Math.round(week.estimatedTss)} TSS
                            </Text>
                          </View>
                          <View className="h-2 rounded-full bg-muted/60 overflow-hidden">
                            <View
                              className="h-2 rounded-full bg-primary"
                              style={{ width: `${widthPercent}%` }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View className="h-px bg-border" />
              <View className="gap-2">
                <Text className="text-sm font-semibold">Linked activity plan structures</Text>
                {isLoadingLinkedPlans ? (
                  <Text className="text-xs text-muted-foreground">
                    Loading linked activity plans...
                  </Text>
                ) : uniqueLinkedActivityPlans.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">
                    No linked activity plans in this template yet.
                  </Text>
                ) : (
                  <View className="gap-2">
                    {uniqueLinkedActivityPlans.map((linkedPlan) => (
                      <View
                        key={`linked-plan-${linkedPlan.id}`}
                        className="rounded-md border border-border/60 bg-background px-2 py-2 gap-1"
                      >
                        <Text className="text-xs font-semibold text-foreground">
                          {linkedPlan.name}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {(linkedPlan.activity_category ?? "other").toUpperCase()} ·{" "}
                          {Math.round(readFiniteNumber(linkedPlan.estimated_tss))} TSS ·{" "}
                          {Math.round(readFiniteNumber(linkedPlan.estimated_duration))} min
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {hasIntervals(linkedPlan.structure)
                            ? "Includes interval structure"
                            : "No interval structure available"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View className="h-px bg-border" />
              <View className="gap-2">
                <Text className="text-sm font-semibold">Sessions by microcycle and day</Text>
                {groupedStructureSessions.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">
                    No structured sessions found in this template yet.
                  </Text>
                ) : (
                  groupedStructureSessions.map((microcycle) => (
                    <View
                      key={`microcycle-${microcycle.microcycle}`}
                      className="gap-2 rounded-md border border-border bg-muted/20 p-2"
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-sm font-semibold text-foreground">
                          Week {microcycle.microcycle}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {microcycle.days.reduce((count, day) => count + day.sessions.length, 0)}{" "}
                          session
                          {microcycle.days.reduce(
                            (count, day) => count + day.sessions.length,
                            0,
                          ) === 1
                            ? ""
                            : "s"}
                        </Text>
                      </View>
                      {microcycle.days.map((day) => {
                        return (
                          <View
                            key={`day-${day.dayOffset}`}
                            className="gap-1 rounded-md border border-border/50 bg-background/70 p-2"
                          >
                            <View className="flex-row items-center justify-between gap-2">
                              <Text className="text-xs font-medium text-muted-foreground">
                                {formatCompactDayLabel(day.dayOffset)}
                              </Text>
                              <Text className="text-[11px] text-muted-foreground">
                                {day.sessions.length} item
                                {day.sessions.length === 1 ? "" : "s"}
                              </Text>
                            </View>
                            {day.sessions.map((session) => (
                              <View
                                key={session.key}
                                className="rounded-md border border-border/60 bg-background px-2 py-2"
                              >
                                <View className="flex-row items-start justify-between gap-3">
                                  <View className="flex-1 gap-1">
                                    <Text className="text-xs font-medium text-foreground">
                                      {session.title}
                                    </Text>
                                    <Text className="text-[11px] text-muted-foreground">
                                      {session.activityPlanId
                                        ? (activityPlanNameById.get(session.activityPlanId) ??
                                          "Linked activity plan")
                                        : "No linked activity plan"}
                                    </Text>
                                  </View>
                                  {isOwnedByUser ? (
                                    <TouchableOpacity
                                      onPress={() => handleOpenActivityPickerForSession(session)}
                                      disabled={updatePlanStructureMutation.isPending}
                                      className="rounded-full border border-border px-2 py-1"
                                      activeOpacity={0.8}
                                    >
                                      <Text className="text-[11px] font-medium text-primary">
                                        {session.activityPlanId ? "Change" : "Add"}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                                {isOwnedByUser ? (
                                  <View className="mt-2 flex-row items-center gap-2">
                                    {session.activityPlanId ? (
                                      <TouchableOpacity
                                        onPress={() => handleRemoveActivityFromSession(session)}
                                        disabled={updatePlanStructureMutation.isPending}
                                        className="flex-row items-center gap-1 rounded-full border border-destructive/30 px-2 py-1"
                                        activeOpacity={0.8}
                                      >
                                        <Text className="text-[11px] font-medium text-destructive">
                                          Remove
                                        </Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  ))
                )}
              </View>
            </View>
          </CardContent>
        </Card>

        {isOwnedByUser && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground">
                  Deleting this training plan will permanently remove its structure and all
                  associated planned activities.
                </Text>
                <Button
                  variant="destructive"
                  onPress={handleDeletePlan}
                  disabled={deletePlanMutation.isPending}
                >
                  <Icon as={Trash2} size={18} className="text-white mr-2" />
                  <Text className="text-white font-semibold">
                    {deletePlanMutation.isPending ? "Deleting..." : "Delete Training Plan"}
                  </Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}
      </View>

      <Dialog
        open={showActivityPicker}
        onOpenChange={(open) => {
          setShowActivityPicker(open);
          if (!open) {
            setSelectedSessionRow(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedSessionRow?.activityPlanId
                ? "Replace activity plan"
                : "Assign activity plan"}
            </DialogTitle>
            <DialogDescription>
              {selectedSessionRow
                ? `Select an activity plan for ${selectedSessionRow.title}.`
                : "Select an activity plan for this session."}
            </DialogDescription>
          </DialogHeader>

          <View className="max-h-80">
            {isLoadingActivityPlans ? (
              <View className="py-6 items-center gap-2">
                <ActivityIndicator size="small" />
                <Text className="text-xs text-muted-foreground">Loading activity plans...</Text>
              </View>
            ) : activityPlanItems.length === 0 ? (
              <View className="py-6 items-center gap-2">
                <Text className="text-sm text-muted-foreground text-center">
                  You do not have any activity plans yet.
                </Text>
              </View>
            ) : (
              <ScrollView>
                <View className="gap-2 py-1">
                  {activityPlanItems.map((activityPlan) => (
                    <TouchableOpacity
                      key={activityPlan.id}
                      className="rounded-md border border-border px-3 py-2"
                      activeOpacity={0.8}
                      disabled={updatePlanStructureMutation.isPending}
                      onPress={() => {
                        void handleSelectActivityForSession(activityPlan);
                      }}
                    >
                      <Text className="text-sm font-medium text-foreground">
                        {activityPlan.name}
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">{activityPlan.id}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={updatePlanStructureMutation.isPending}>
                <Text className="text-foreground font-medium">Close</Text>
              </Button>
            </DialogClose>
            <Button
              variant="outline"
              disabled={isLoadingActivityPlans || updatePlanStructureMutation.isPending}
              onPress={() => {
                void refetchActivityPlans();
              }}
            >
              <Text className="text-foreground font-medium">Refresh</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConcurrencyWarning} onOpenChange={setShowConcurrencyWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Current plan already scheduled</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            You already have scheduled sessions from a training plan. Finish or abandon that plan
            before scheduling another one.
          </DialogDescription>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline">
                <Text className="text-foreground font-medium">Cancel</Text>
              </Button>
            </DialogClose>
            <Button onPress={handleOpenActivePlan}>
              <Text className="text-primary-foreground font-semibold">Open Current Plan</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollView>
  );
}
