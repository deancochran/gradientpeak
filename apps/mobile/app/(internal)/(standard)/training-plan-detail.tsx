import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Calendar, Trash2, TrendingUp } from "lucide-react-native";
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
import { TrainingPlanDangerZoneCard } from "@/components/training-plan/TrainingPlanDangerZoneCard";
import { TrainingPlanDetailFocusBanner } from "@/components/training-plan/TrainingPlanDetailFocusBanner";
import { TrainingPlanDetailHeaderActionsSection } from "@/components/training-plan/TrainingPlanDetailHeaderActionsSection";
import { TrainingPlanNoPlanEmptyState } from "@/components/training-plan/TrainingPlanNoPlanEmptyState";
import { TrainingPlanStructureSection } from "@/components/training-plan/TrainingPlanStructureSection";
import { useTrainingPlanHeaderSocialActions } from "@/components/training-plan/useTrainingPlanHeaderSocialActions";
import { useTrainingPlanTemplateSchedulingController } from "@/components/training-plan/useTrainingPlanTemplateSchedulingController";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import {
  normalizeTrainingPlanNextStep,
  TPV_NEXT_STEP_INTENTS,
} from "@/lib/constants/trainingPlanIntents";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";

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
  const utils = api.useUtils();
  const { id, nextStep, activityId } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
    activityId?: string;
  }>();

  const isSystemTemplateId = id?.startsWith("00000000-0000-0000-0000-00000000") ? true : false;

  const { data: templatePlan, isLoading: isLoadingTemplate } =
    api.trainingPlans.getTemplate.useQuery(isSystemTemplateId && id ? { id } : skipToken, {
      enabled: isSystemTemplateId && !!id,
    });

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const snapshot = useTrainingPlanSnapshot({
    planId: isSystemTemplateId ? undefined : id,
    includeWeeklySummaries: false,
  });

  const plan = (isSystemTemplateId ? templatePlan : snapshot.plan) as any;
  const loadingPlan = isSystemTemplateId ? isLoadingTemplate : snapshot.isLoadingSharedDependencies;
  const isOwnedByUser = plan?.profile_id === profile?.id;

  const [refreshing, setRefreshing] = React.useState(false);
  const [showActivityPicker, setShowActivityPicker] = React.useState(false);
  const [selectedSessionRow, setSelectedSessionRow] = React.useState<StructureSessionRow | null>(
    null,
  );

  const handleOpenCalendar = useCallback(() => {
    router.replace(ROUTES.CALENDAR as any);
  }, [router]);

  const scheduling = useTrainingPlanTemplateSchedulingController({
    handleOpenCalendar,
    planId: plan?.id,
    queryClient,
    router,
    utils,
  });
  const headerActions = useTrainingPlanHeaderSocialActions({
    plan,
    router,
    utils,
  });

  const deletePlanMutation = useReliableMutation(api.trainingPlans.delete, {
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

  const {
    data: activityPlansData,
    isLoading: isLoadingActivityPlans,
    refetch: refetchActivityPlans,
  } = api.activityPlans.list.useQuery(
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
    api.activityPlans.getManyByIds.useQuery(
      linkedActivityPlanIds.length > 0
        ? {
            ids: linkedActivityPlanIds,
          }
        : skipToken,
      {
        enabled: linkedActivityPlanIds.length > 0,
      },
    );

  const updatePlanStructureMutation = api.trainingPlans.update.useMutation({
    onSuccess: async () => {
      await Promise.all([invalidateTrainingPlanQueries(utils), snapshot.refetchAll()]);
      Alert.alert("Session updated", "Training plan structure was saved.");
      setShowActivityPicker(false);
      setSelectedSessionRow(null);
    },
    onError: (error) => {
      Alert.alert("Update failed", error.message || "Could not update this session assignment.");
    },
  });

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
      <TrainingPlanNoPlanEmptyState
        onCreatePlan={handleCreatePlan}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
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
            <TrainingPlanDetailFocusBanner
              ctaLabel={focusContext.ctaLabel}
              description={focusContext.description}
              onPress={focusContext.onPress}
              title={focusContext.title}
            />
          )}

          <TrainingPlanDetailHeaderActionsSection
            duplicatePending={headerActions.duplicatePending}
            handleDuplicate={headerActions.handleDuplicate}
            handleEditStructure={handleEditStructure}
            handleToggleLike={headerActions.handleToggleLike}
            handleTogglePrivacy={headerActions.handleTogglePrivacy}
            isLiked={headerActions.isLiked}
            isOwnedByUser={isOwnedByUser}
            isPublic={headerActions.isPublic}
            likesCount={headerActions.likesCount}
            onOpenCalendar={() => router.push(ROUTES.CALENDAR as any)}
            plan={plan}
            schedulingDialogProps={{
              applyPending: scheduling.applyTemplateMutation.isPending,
              onApply: scheduling.handleApplyTemplate,
              onConcurrencyOpenChange: scheduling.setShowConcurrencyWarning,
              onOpenActivePlan: scheduling.handleOpenActivePlan,
              onScheduleModalOpenChange: scheduling.setShowApplyModal,
              onSelectScheduleAnchorMode: scheduling.handleSelectScheduleAnchorMode,
              scheduleAnchorContent: scheduling.scheduleAnchorContent,
              scheduleAnchorMode: scheduling.scheduleAnchorMode,
              setTemplateAnchorDate: scheduling.setTemplateAnchorDate,
              showConcurrencyWarning: scheduling.showConcurrencyWarning,
              showScheduleModal: scheduling.showApplyModal,
              templateAnchorDate: scheduling.templateAnchorDate,
            }}
            visibilityPending={headerActions.visibilityPending}
          />
        </View>

        <TrainingPlanStructureSection
          activityPlanItems={activityPlanItems}
          activityPlanNameById={activityPlanNameById}
          formatCompactDayLabel={formatCompactDayLabel}
          groupedStructureSessions={groupedStructureSessions}
          hasIntervals={hasIntervals}
          isLoadingActivityPlans={isLoadingActivityPlans}
          isLoadingLinkedPlans={isLoadingLinkedPlans}
          isOwnedByUser={isOwnedByUser}
          linkedActivityPlanItems={linkedActivityPlanItems}
          maxWeeklyLoad={maxWeeklyLoad}
          onActivityPickerOpenChange={(open) => {
            setShowActivityPicker(open);
            if (!open) {
              setSelectedSessionRow(null);
            }
          }}
          onEditStructure={handleEditStructure}
          onOpenActivityPickerForSession={handleOpenActivityPickerForSession}
          onRefreshActivityPlans={() => {
            void refetchActivityPlans();
          }}
          onRemoveActivityFromSession={handleRemoveActivityFromSession}
          onSelectActivityForSession={(activityPlan) => {
            void handleSelectActivityForSession(activityPlan);
          }}
          planStructure={plan.structure as any}
          selectedSessionRow={selectedSessionRow}
          showActivityPicker={showActivityPicker}
          uniqueLinkedActivityPlans={uniqueLinkedActivityPlans}
          updatePlanStructurePending={updatePlanStructureMutation.isPending}
          weeklyLoadSummary={weeklyLoadSummary}
        />

        {isOwnedByUser && (
          <TrainingPlanDangerZoneCard
            deletePending={deletePlanMutation.isPending}
            onDelete={handleDeletePlan}
          />
        )}
      </View>
    </ScrollView>
  );
}
