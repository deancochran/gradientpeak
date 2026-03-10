import { TrainingPlanSummaryHeader } from "@/components/training-plan/TrainingPlanSummaryHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { DateField } from "@/components/training-plan/create/inputs/DateField";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import {
  TPV_NEXT_STEP_INTENTS,
  normalizeTrainingPlanNextStep,
} from "@/lib/constants/trainingPlanIntents";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";
import { skipToken } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Library,
  Trash2,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
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
    const sessionOffset =
      readNumber(session.offset_days) ?? readNumber(session.day_offset);
    if (sessionOffset === undefined) {
      return;
    }

    const dayOffset = inheritedOffsetDays + sessionOffset;
    const title =
      readText(session.title) ??
      readText(session.name) ??
      inheritedTitle ??
      `Session ${index + 1}`;

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

    const blocks = Array.isArray(node.blocks)
      ? (node.blocks as Record<string, unknown>[])
      : [];

    blocks.forEach((block, blockIndex) => {
      const blockOffset =
        readNumber(block.offset_days) ?? readNumber(block.day_offset) ?? 0;
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

  return current && typeof current === "object"
    ? (current as Record<string, unknown>)
    : null;
}

function groupSessionsByMicrocycle(
  sessions: StructureSessionRow[],
): GroupedMicrocycleSessions[] {
  const byMicrocycle = new Map<number, Map<number, StructureSessionRow[]>>();

  sessions.forEach((session) => {
    const microcycle = Math.floor(session.dayOffset / 7) + 1;
    const byDay =
      byMicrocycle.get(microcycle) ?? new Map<number, StructureSessionRow[]>();
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
  const { profile } = useAuth();
  const utils = trpc.useUtils();
  const { id, nextStep, activityId } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
    activityId?: string;
  }>();

  const isSystemTemplateId = id?.startsWith("00000000-0000-0000-0000-00000000")
    ? true
    : false;

  const { data: templatePlan, isLoading: isLoadingTemplate } =
    trpc.trainingPlans.getTemplate.useQuery(
      isSystemTemplateId && id ? { id } : skipToken,
      {
        enabled: isSystemTemplateId && !!id,
      },
    );

  const { data: rawActivePlan } = trpc.trainingPlans.getActivePlan.useQuery();
  const activePlan = rawActivePlan as any;

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const snapshot = useTrainingPlanSnapshot({
    planId: isSystemTemplateId ? undefined : id,
    includeWeeklySummaries: false,
  });

  const plan = (isSystemTemplateId ? templatePlan : snapshot.plan) as any;
  const loadingPlan = isSystemTemplateId
    ? isLoadingTemplate
    : snapshot.isLoadingSharedDependencies;
  const isOwnedByUser = plan?.profile_id === profile?.id;

  const [refreshing, setRefreshing] = React.useState(false);
  const [templateStartDate, setTemplateStartDate] = React.useState("");
  const [templateGoalDate, setTemplateGoalDate] = React.useState("");
  const [showApplyModal, setShowApplyModal] = React.useState(false);
  const [showConcurrencyWarning, setShowConcurrencyWarning] =
    React.useState(false);
  const [pendingApplyDates, setPendingApplyDates] = React.useState<{
    startDate: string;
    goalDate: string;
  } | null>(null);
  const [showActivityPicker, setShowActivityPicker] = React.useState(false);
  const [selectedSessionRow, setSelectedSessionRow] =
    React.useState<StructureSessionRow | null>(null);

  const saveToLibraryMutation = trpc.library.add.useMutation({
    onSuccess: async () => {
      await utils.library.listTrainingPlans.invalidate();
      Alert.alert("Saved", "Training plan added to your library.");
    },
    onError: (error) => {
      Alert.alert("Save failed", error.message || "Could not save to library");
    },
  });

  const applyTemplateMutation = trpc.trainingPlans.applyTemplate.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.trainingPlans.invalidate(),
        utils.events.invalidate(),
        utils.library.listTrainingPlans.invalidate(),
      ]);
      Alert.alert(
        "Template Applied",
        `Created ${result.created_event_count} scheduled session${result.created_event_count === 1 ? "" : "s"}.`,
        [
          {
            text: "OK",
            onPress: () => router.replace(ROUTES.PLAN.INDEX),
          },
        ],
      );
    },
    onError: (error) => {
      Alert.alert(
        "Apply failed",
        error.message || "Could not apply this training plan template",
      );
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

  const [isPublic, setIsPublic] = useState(
    plan?.template_visibility === "public",
  );

  const updateVisibilityMutation = trpc.trainingPlans.update.useMutation({
    onSuccess: () => {
      utils.trainingPlans.invalidate();
    },
    onError: (error) => {
      setIsPublic(plan?.template_visibility === "public");
      Alert.alert(
        "Update Failed",
        error.message || "Failed to update visibility",
      );
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
    trpc.activityPlans.list.useQuery(
      linkedActivityPlanIds.length > 0
        ? {
            ownerScope: "all",
            limit: 100,
          }
        : skipToken,
      {
        enabled: linkedActivityPlanIds.length > 0,
      },
    );

  const updatePlanStructureMutation = trpc.trainingPlans.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.trainingPlans.invalidate(),
        snapshot.refetchAll(),
      ]);
      Alert.alert("Session updated", "Training plan structure was saved.");
      setShowActivityPicker(false);
      setSelectedSessionRow(null);
    },
    onError: (error) => {
      Alert.alert(
        "Update failed",
        error.message || "Could not update this session assignment.",
      );
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
      Alert.alert(
        "Template is read-only",
        "Only the template owner can edit structure.",
      );
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

  const handleSaveToLibrary = useCallback(() => {
    if (!plan?.id) {
      Alert.alert("Save failed", "No plan ID was found.");
      return;
    }
    saveToLibraryMutation.mutate({
      item_type: "training_plan",
      item_id: plan.id,
    });
  }, [plan?.id, saveToLibraryMutation]);

  const executeApplyTemplate = (
    normalizedStartDate: string,
    normalizedGoalDate: string,
  ) => {
    applyTemplateMutation.mutate({
      template_type: "training_plan",
      template_id: plan!.id,
      start_date: normalizedStartDate || undefined,
      target_date: normalizedGoalDate || undefined,
    });
  };

  const handleApplyTemplate = useCallback(() => {
    if (!plan?.id) {
      Alert.alert("Apply failed", "No plan ID was found.");
      return;
    }

    const normalizedStartDate = templateStartDate.trim();
    const normalizedGoalDate = templateGoalDate.trim();

    if (
      normalizedStartDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(normalizedStartDate)
    ) {
      Alert.alert("Invalid start date", "Use YYYY-MM-DD format.");
      return;
    }

    if (normalizedGoalDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedGoalDate)) {
      Alert.alert("Invalid goal date", "Use YYYY-MM-DD format.");
      return;
    }

    if (activePlan && (activePlan as any).id !== plan.id) {
      setPendingApplyDates({
        startDate: normalizedStartDate,
        goalDate: normalizedGoalDate,
      });
      setShowConcurrencyWarning(true);
    } else {
      executeApplyTemplate(normalizedStartDate, normalizedGoalDate);
      setShowApplyModal(false);
    }
  }, [
    activePlan,
    applyTemplateMutation,
    plan,
    templateGoalDate,
    templateStartDate,
  ]);

  const handleConfirmConcurrencyWarning = () => {
    if (pendingApplyDates) {
      executeApplyTemplate(
        pendingApplyDates.startDate,
        pendingApplyDates.goalDate,
      );
    }
    setShowConcurrencyWarning(false);
    setShowApplyModal(false);
    setPendingApplyDates(null);
  };

  const activityPlanItems =
    ((activityPlansData?.items ?? []) as ActivityPlanListItem[]) ?? [];
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

            const linkedPlan = linkedActivityPlanById.get(
              session.activityPlanId,
            );
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

      const targetSession = readSessionFromPath(
        nextStructure,
        sessionRow.sourcePath,
      );
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

  const handleOpenActivityPickerForSession = useCallback(
    (sessionRow: StructureSessionRow) => {
      setSelectedSessionRow(sessionRow);
      setShowActivityPicker(true);
    },
    [],
  );

  const handleSelectActivityForSession = useCallback(
    async (activityPlan: ActivityPlanListItem) => {
      if (!selectedSessionRow) {
        return;
      }

      await commitSessionActivityPlan(
        selectedSessionRow,
        activityPlan.id,
        activityPlan.name,
      );
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
    if (
      normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REFINE &&
      isOwnedByUser
    ) {
      return {
        title: "Refine Plan",
        description:
          "Your plan is ready. Open edit to adjust constraints, targets, and plan details.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }
    if (
      normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.EDIT &&
      isOwnedByUser
    ) {
      return {
        title: "Edit Plan Structure",
        description:
          "Tune weekly targets and constraints in edit mode before your next scheduling cycle.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }
    if (
      normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.MANAGE &&
      isOwnedByUser
    ) {
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
        description:
          "Open the linked activity to inspect details and make focused adjustments.",
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
        <Text className="text-muted-foreground mt-4">
          Loading training plan...
        </Text>
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
          <Text className="text-muted-foreground mt-4">
            Opening plan creation...
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="flex-1 p-6 gap-6">
          <Card className="mt-8">
            <CardContent className="p-8">
              <View className="items-center">
                <View className="bg-primary/10 rounded-full p-6 mb-6">
                  <Icon as={Activity} size={64} className="text-primary" />
                </View>
                <Text className="text-2xl font-bold mb-3 text-center">
                  No Training Plan
                </Text>
                <Text className="text-base text-muted-foreground text-center mb-6">
                  A training plan helps you build fitness systematically, track
                  your progress, and prevent overtraining through structured
                  activities and recovery.
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
            <Text className="text-lg font-semibold">
              Benefits of a Training Plan:
            </Text>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={TrendingUp} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Track Your Fitness</Text>
                <Text className="text-sm text-muted-foreground">
                  Monitor CTL, ATL, and TSB to understand your fitness trends
                  and form.
                </Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Calendar} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">
                  Structured Scheduling
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Weekly TSS targets and constraint validation ensure balanced
                  training.
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
                  Recovery rules and intensity distribution keep you healthy and
                  improving.
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
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View className="flex-1 p-4 gap-4">
        <View className="mb-4">
          {focusContext && (
            <Card className="border-primary/40 bg-primary/5 mb-4">
              <CardContent className="p-3">
                <Text className="text-sm text-primary font-semibold">
                  {focusContext.title}
                </Text>
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
                    className={
                      isLiked ? "text-red-500 fill-red-500" : "text-primary"
                    }
                  />
                  {likesCount > 0 && (
                    <Text className="text-sm font-medium text-primary">
                      {likesCount}
                    </Text>
                  )}
                </Pressable>
                {isOwnedByUser && (
                  <TouchableOpacity
                    onPress={handleEditStructure}
                    className="ml-1"
                  >
                    <View className="bg-primary/10 rounded-full p-2">
                      <Icon
                        as={ChevronRight}
                        size={24}
                        className="text-primary"
                      />
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
                  Keep the main actions close: edit if you own it, or apply it
                  to your schedule.
                </Text>
                {!isOwnedByUser ? (
                  <Text className="text-xs text-muted-foreground">
                    Shared templates stay read-only. Applying this plan only
                    schedules your events.
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
                      <Text className="text-sm font-medium">
                        {isPublic ? "Public" : "Private"}
                      </Text>
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
                  <Button
                    variant="outline"
                    onPress={handleEditStructure}
                    className="flex-1"
                  >
                    <Text>Edit Structure</Text>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onPress={handleSaveToLibrary}
                    disabled={saveToLibraryMutation.isPending}
                    className="flex-1"
                  >
                    <Icon
                      as={Library}
                      size={16}
                      className="text-foreground mr-2"
                    />
                    <Text className="text-foreground font-medium">
                      {saveToLibraryMutation.isPending ? "Saving..." : "Save"}
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
                    <Text className="text-primary-foreground font-semibold">
                      Apply Template
                    </Text>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Apply Training Plan</DialogTitle>
                    <DialogDescription>
                      Configure when you want to start this plan and set an
                      optional target date.
                    </DialogDescription>
                  </DialogHeader>
                  <View className="gap-4 py-4">
                    <View className="gap-2">
                      <Text className="text-sm font-medium">Start Date</Text>
                      <DateField
                        id="apply-template-start-date"
                        label="Start Date"
                        value={templateStartDate || undefined}
                        onChange={(nextDate) =>
                          setTemplateStartDate(nextDate ?? "")
                        }
                        placeholder="Select start date"
                        clearable
                      />
                    </View>
                    <View className="gap-2">
                      <DateField
                        id="apply-template-target-date"
                        label="Target Date (Optional)"
                        value={templateGoalDate || undefined}
                        onChange={(nextDate) =>
                          setTemplateGoalDate(nextDate ?? "")
                        }
                        placeholder="Select target date"
                        clearable
                      />
                    </View>
                  </View>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">
                        <Text className="text-foreground font-medium">
                          Cancel
                        </Text>
                      </Button>
                    </DialogClose>
                    <Button
                      onPress={handleApplyTemplate}
                      disabled={applyTemplateMutation.isPending}
                    >
                      <Text className="text-primary-foreground font-semibold">
                        {applyTemplateMutation.isPending
                          ? "Applying..."
                          : "Apply"}
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
                        {(plan.structure as any).target_weekly_tss_max} weekly
                        TSS
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).target_activities_per_week}{" "}
                        sessions/week
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).max_consecutive_days} max
                        consecutive days
                      </Text>
                    </View>
                    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {(plan.structure as any).min_rest_days_per_week} rest
                        days/week
                      </Text>
                    </View>
                  </View>
                  {(plan.structure as any).periodization_template && (
                    <>
                      <View className="h-px bg-border" />
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">
                          Periodization
                        </Text>
                        <Text className="font-semibold">
                          {
                            (plan.structure as any).periodization_template
                              .starting_ctl
                          }{" "}
                          →{" "}
                          {
                            (plan.structure as any).periodization_template
                              .target_ctl
                          }{" "}
                          CTL
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">
                          Target Date
                        </Text>
                        <Text className="font-semibold">
                          {new Date(
                            (plan.structure as any).periodization_template
                              .target_date,
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
                      <TouchableOpacity
                        onPress={handleEditStructure}
                        className="pt-1"
                      >
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
                <Text className="text-sm font-semibold">
                  Microcycle weekly load (estimated)
                </Text>
                {weeklyLoadSummary.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">
                    Add linked activity plans to see estimated weekly TSS.
                  </Text>
                ) : (
                  <View className="gap-2">
                    {weeklyLoadSummary.map((week) => {
                      const widthPercent = Math.max(
                        6,
                        (week.estimatedTss / maxWeeklyLoad) * 100,
                      );

                      return (
                        <View
                          key={`week-load-${week.microcycle}`}
                          className="gap-1"
                        >
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
                <Text className="text-sm font-semibold">
                  Linked activity plan structures
                </Text>
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
                          {(
                            linkedPlan.activity_category ?? "other"
                          ).toUpperCase()}{" "}
                          ·{" "}
                          {Math.round(
                            readFiniteNumber(linkedPlan.estimated_tss),
                          )}{" "}
                          TSS ·{" "}
                          {Math.round(
                            readFiniteNumber(linkedPlan.estimated_duration),
                          )}{" "}
                          min
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
                <Text className="text-sm font-semibold">
                  Sessions by microcycle and day
                </Text>
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
                          {microcycle.days.reduce(
                            (count, day) => count + day.sessions.length,
                            0,
                          )}{" "}
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
                                        ? (activityPlanNameById.get(
                                            session.activityPlanId,
                                          ) ?? "Linked activity plan")
                                        : "No linked activity plan"}
                                    </Text>
                                  </View>
                                  {isOwnedByUser ? (
                                    <TouchableOpacity
                                      onPress={() =>
                                        handleOpenActivityPickerForSession(
                                          session,
                                        )
                                      }
                                      disabled={
                                        updatePlanStructureMutation.isPending
                                      }
                                      className="rounded-full border border-border px-2 py-1"
                                      activeOpacity={0.8}
                                    >
                                      <Text className="text-[11px] font-medium text-primary">
                                        {session.activityPlanId
                                          ? "Change"
                                          : "Add"}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                                {isOwnedByUser ? (
                                  <View className="mt-2 flex-row items-center gap-2">
                                    {session.activityPlanId ? (
                                      <TouchableOpacity
                                        onPress={() =>
                                          handleRemoveActivityFromSession(
                                            session,
                                          )
                                        }
                                        disabled={
                                          updatePlanStructureMutation.isPending
                                        }
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
                  Deleting this training plan will permanently remove its
                  structure and all associated planned activities.
                </Text>
                <Button
                  variant="destructive"
                  onPress={handleDeletePlan}
                  disabled={deletePlanMutation.isPending}
                >
                  <Icon as={Trash2} size={18} className="text-white mr-2" />
                  <Text className="text-white font-semibold">
                    {deletePlanMutation.isPending
                      ? "Deleting..."
                      : "Delete Training Plan"}
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
                <Text className="text-xs text-muted-foreground">
                  Loading activity plans...
                </Text>
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
                      <Text className="text-[11px] text-muted-foreground">
                        {activityPlan.id}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={updatePlanStructureMutation.isPending}
              >
                <Text className="text-foreground font-medium">Close</Text>
              </Button>
            </DialogClose>
            <Button
              variant="outline"
              disabled={
                isLoadingActivityPlans || updatePlanStructureMutation.isPending
              }
              onPress={() => {
                void refetchActivityPlans();
              }}
            >
              <Text className="text-foreground font-medium">Refresh</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showConcurrencyWarning}
        onOpenChange={setShowConcurrencyWarning}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Active Plan Exists</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            You already have an active training plan. Applying this plan will
            set it as your new active plan and pause the current one.
          </DialogDescription>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button
                variant="outline"
                onPress={() => setPendingApplyDates(null)}
              >
                <Text className="text-foreground font-medium">Cancel</Text>
              </Button>
            </DialogClose>
            <Button
              onPress={handleConfirmConcurrencyWarning}
              disabled={applyTemplateMutation.isPending}
            >
              <Text className="text-primary-foreground font-semibold">
                {applyTemplateMutation.isPending ? "Applying..." : "Apply"}
              </Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollView>
  );
}
