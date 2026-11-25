import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { type ActivityPlanSummary, canonicalTrainingPlanStructureSchema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Text } from "@repo/ui/components/text";
import { useReadOnlyPreview } from "@repo/ui/hooks";
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { DetailOverflowMenu, type DetailOverflowMenuAction } from "@/components/shared/detail";
import { ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { useEntityCommentsSheet } from "@/components/social/EntityCommentsSheetProvider";
import { TrainingPlanDetailFocusBanner } from "@/components/training-plan/TrainingPlanDetailFocusBanner";
import { TrainingPlanDetailHeaderActionsSection } from "@/components/training-plan/TrainingPlanDetailHeaderActionsSection";
import { TrainingPlanNoPlanEmptyState } from "@/components/training-plan/TrainingPlanNoPlanEmptyState";
import { TrainingPlanStructureSection } from "@/components/training-plan/TrainingPlanStructureSection";
import { TrainingPlanTemplateSchedulingDialog } from "@/components/training-plan/TrainingPlanTemplateSchedulingDialog";
import { useTrainingPlanHeaderSocialActions } from "@/components/training-plan/useTrainingPlanHeaderSocialActions";
import { useTrainingPlanTemplateSchedulingController } from "@/components/training-plan/useTrainingPlanTemplateSchedulingController";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import {
  normalizeTrainingPlanNextStep,
  TPV_NEXT_STEP_INTENTS,
} from "@/lib/constants/trainingPlanIntents";
import { markEstimated } from "@/lib/estimatedMetrics";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";

type StructureSessionRow = {
  key: string;
  title: string;
  activityPlanId: string | null;
  dayOffset: number;
};

type ActivityPlanListItem = ActivityPlanSummary;

type ScheduledRemovalReview = {
  applicationId: string;
  affected: Array<unknown>;
  cutoffDate: string;
  operationId: string;
  previewFingerprint: string;
};

type GroupedMicrocycleSessions = {
  microcycle: number;
  days: Array<{
    dayOffset: number;
    sessions: StructureSessionRow[];
  }>;
};

type TrainingPlanDetail = inferRouterOutputs<AppRouter>["trainingPlans"]["get"];

function isTrainingPlanDetail(value: unknown): value is TrainingPlanDetail {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.structure_hash === "string" &&
    "structure" in record &&
    (typeof record.created_at === "string" || record.created_at instanceof Date)
  );
}

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function countSteps(structure: unknown): number {
  if (!structure || typeof structure !== "object") {
    return 0;
  }

  const intervals = (structure as Record<string, unknown>).intervals;
  if (!Array.isArray(intervals)) {
    return 0;
  }

  return intervals.reduce((total, interval) => {
    if (!interval || typeof interval !== "object") {
      return total;
    }

    const repetitions = readNumber((interval as Record<string, unknown>).repetitions) ?? 1;
    const steps = Array.isArray((interval as Record<string, unknown>).steps)
      ? ((interval as Record<string, unknown>).steps as unknown[]).length
      : 0;

    return total + Math.max(1, repetitions) * steps;
  }, 0);
}

function formatMinutesLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 min";
  }

  const rounded = Math.round(value);
  if (rounded < 60) {
    return `${rounded} min`;
  }

  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDateLabel(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function extractSessionRows(structure: unknown): StructureSessionRow[] {
  const parsed = canonicalTrainingPlanStructureSchema.safeParse(structure);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.sessions
    .map((session, index) => {
      const title = session.event_overrides?.title ?? `Session ${index + 1}`;
      return {
        key: `${session.offset_days}-${title}-${index}`,
        title,
        activityPlanId: session.activity_plan_id,
        dayOffset: session.offset_days,
      };
    })
    .sort((a, b) => a.dayOffset - b.dayOffset);
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
  const navigateTo = useAppNavigate();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const utils = api.useUtils();
  const { id, nextStep, activityId } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
    activityId?: string;
  }>();

  const isSystemTemplateId = !!id?.startsWith("00000000-0000-0000-0000-00000000");

  const {
    data: templatePlan,
    isLoading: isLoadingTemplate,
    error: templateError,
    refetch: refetchTemplate,
  } = api.trainingPlans.getTemplate.useQuery(isSystemTemplateId && id ? { id } : skipToken, {
    enabled: isSystemTemplateId && !!id,
  });

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const snapshot = useTrainingPlanSnapshot({
    ...(isSystemTemplateId || id === undefined ? {} : { planId: id }),
    includeStatus: false,
    includeWeeklySummaries: false,
  });

  const planCandidate = isSystemTemplateId ? templatePlan : snapshot.plan;
  const plan = isTrainingPlanDetail(planCandidate) ? planCandidate : undefined;
  const loadingPlan = isSystemTemplateId ? isLoadingTemplate : snapshot.isLoadingSharedDependencies;
  const isOwnedByUser = plan?.profile_id === profile?.id;
  const [refreshing, setRefreshing] = React.useState(false);
  const [activeMicrocycle, setActiveMicrocycle] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveScheduledConfirm, setShowRemoveScheduledConfirm] = useState(false);
  const [retainedRemoval, setRetainedRemoval] = useState<{
    context: string;
    review: ScheduledRemovalReview;
  } | null>(null);
  const removalMutationGuard = React.useRef(false);
  const [removalPending, setRemovalPending] = useState(false);
  const [statusModal, setStatusModal] = useState<null | {
    title: string;
    description: string;
    onClose?: () => void;
  }>(null);

  const handleOpenCalendar = useCallback(() => {
    router.navigate(ROUTES.CALENDAR);
  }, [router]);

  const scheduling = useTrainingPlanTemplateSchedulingController({
    handleOpenCalendar,
    ...(profile?.id ? { profileId: profile.id } : {}),
    sourceRevision: JSON.stringify([plan?.editor?.revision, plan?.structure_hash]),
    ...(id ? { routePlanId: id } : {}),
    ...(plan?.id === undefined ? {} : { planId: plan.id }),
    queryClient,
    router,
    utils,
  });
  const removalContext = JSON.stringify([profile?.id, id, plan?.id]);
  const removalContextRef = React.useRef(removalContext);
  removalContextRef.current = removalContext;
  const removalDispatchedContext = React.useRef(removalContext);
  const removalPreview = useReadOnlyPreview<ScheduledRemovalReview>(
    JSON.stringify([
      removalContext,
      plan?.editor?.revision,
      plan?.structure_hash,
      scheduling.selectedApplication,
      scheduling.templateAnchorDate,
      scheduling.scheduleAnchorMode,
      scheduling.scheduleApplicationMode,
    ]),
  );
  const scheduledRemovalReview =
    retainedRemoval?.context === removalContext ? retainedRemoval.review : removalPreview.data;
  const isScheduledPlan = Boolean(
    scheduling.selectedApplication || retainedRemoval?.context === removalContext,
  );
  const setScheduledRemovalReview = (_value: null) => {
    setRetainedRemoval(null);
    removalPreview.clear();
  };
  const canSchedulePlan = isOwnedByUser || plan?.is_system_template === true;
  const headerActions = useTrainingPlanHeaderSocialActions({
    plan: plan ?? null,
    router,
    utils,
  });
  const comments = useEntityCommentsController({
    ...(plan?.id === undefined ? {} : { entityId: plan.id }),
    entityType: "training_plan",
  });
  const entityCommentsSheet = useEntityCommentsSheet();

  const deletePlanMutation = useReliableMutation(api.trainingPlans.delete, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      setShowDeleteConfirm(false);
      setStatusModal({
        title: "Plan Deleted",
        description: "Your training plan has been deleted.",
        onClose: () => router.navigate(ROUTES.PLAN.INDEX),
      });
    },
    onError: async (error) => {
      if (error.data?.code === "CONFLICT") await snapshot.refetchAll();
      setStatusModal({
        title: "Delete Failed",
        description: error.message || "Failed to delete plan.",
      });
    },
  });
  const removeScheduledPlanMutation = api.trainingPlans.removeAppliedSchedule.useMutation({
    onSuccess: async () => {
      removalMutationGuard.current = false;
      setRemovalPending(false);
      if (removalDispatchedContext.current !== removalContextRef.current) return;
      const removedCount = scheduledRemovalReview?.affected.length;
      setScheduledRemovalReview(null);
      setShowRemoveScheduledConfirm(false);
      await Promise.allSettled([
        invalidateTrainingPlanQueries(utils),
        plan?.id
          ? utils.trainingPlans.getAppliedSchedule.invalidate({ training_plan_id: plan.id })
          : Promise.resolve(),
        snapshot.refetchAll(),
        refreshScheduleViews(queryClient, "trainingPlanSchedulingMutation"),
      ]);
      if (removalDispatchedContext.current !== removalContextRef.current) return;
      setStatusModal({
        title: "Scheduled sessions removed",
        description:
          removedCount === undefined
            ? "Scheduled sessions were removed. Completed sessions remain in history."
            : `Removed ${removedCount} scheduled session${removedCount === 1 ? "" : "s"}. Completed sessions remain in history.`,
      });
    },
    onError: (error) => {
      removalMutationGuard.current = false;
      setRemovalPending(false);
      if (removalDispatchedContext.current !== removalContextRef.current) return;
      if (error.data?.code === "NOT_FOUND") {
        setShowRemoveScheduledConfirm(false);
        setScheduledRemovalReview(null);
        setStatusModal({
          title: "Scheduled application unavailable",
          description: "This scheduled application no longer has future sessions to remove.",
        });
        return;
      }
      if (error.data?.code === "CONFLICT") {
        setShowRemoveScheduledConfirm(false);
        setScheduledRemovalReview(null);
        setStatusModal({
          title: "Removal review expired",
          description: "The schedule changed. Review the removal again before confirming.",
        });
        return;
      }
      setStatusModal({
        title: "Remove failed",
        description: error.message || "Could not remove the scheduled sessions.",
      });
    },
  });

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

  const {
    data: linkedActivityPlansData,
    isLoading: isLoadingLinkedPlans,
    error: linkedPlansError,
    refetch: refetchLinkedPlans,
  } = api.activityPlans.getManyByIds.useQuery(
    linkedActivityPlanIds.length > 0
      ? {
          ids: linkedActivityPlanIds,
        }
      : skipToken,
    {
      enabled: linkedActivityPlanIds.length > 0,
    },
  );

  const handleOpenActivity = useCallback(() => {
    if (typeof activityId !== "string") return;
    navigateTo(ROUTES.PLAN.ACTIVITY_DETAIL(activityId));
  }, [activityId, navigateTo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (isSystemTemplateId) await refetchTemplate();
      else await snapshot.refetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreatePlan = () => {
    navigateTo(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  };

  const handleEditStructure = useCallback(() => {
    if (!isOwnedByUser) {
      setStatusModal({
        title: "Template is read-only",
        description: "Only the template owner can edit structure.",
      });
      return;
    }
    navigateTo({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan?.id, initialTab: "plan" },
    });
  }, [isOwnedByUser, navigateTo, plan?.id]);

  const handleDeletePlan = useCallback(() => {
    if (!plan) return;
    setShowDeleteConfirm(true);
  }, [plan]);

  const handleRemoveScheduledSessions = useCallback(() => {
    if (retainedRemoval?.context === removalContext) {
      setShowRemoveScheduledConfirm(true);
      return;
    }
    const schedule = scheduling.selectedApplication;
    if (!schedule) {
      setStatusModal({
        title: "Removal unavailable",
        description: "Refresh the scheduled plan before removing its sessions.",
      });
      return;
    }

    setShowRemoveScheduledConfirm(true);
    void removalPreview.run(async () => {
      const preview = await utils.trainingPlans.previewRemoveAppliedSchedule.fetch({
        applicationId: schedule.application_id,
      });
      return {
        applicationId: preview.applicationId,
        affected: preview.affected,
        cutoffDate: preview.cutoffDate,
        operationId: randomUUID(),
        previewFingerprint: preview.previewFingerprint,
      };
    });
  }, [
    scheduling.selectedApplication,
    utils.trainingPlans.previewRemoveAppliedSchedule,
    removalPreview,
    retainedRemoval,
    removalContext,
  ]);

  const handleOpenLinkedActivityPlan = useCallback(
    (activityPlanId: string) => {
      navigateTo(ROUTES.PLAN.PLAN_DETAIL(activityPlanId));
    },
    [navigateTo],
  );

  const linkedActivityPlanItems = linkedActivityPlansData?.items ?? [];
  const linkedActivityPlanById = useMemo(
    () => new Map(linkedActivityPlanItems.map((item) => [item.id, item])),
    [linkedActivityPlanItems],
  );
  const activityPlanNameById = useMemo(() => {
    const map = new Map<string, string>();
    linkedActivityPlanItems.forEach((item) => {
      map.set(item.id, item.name);
    });
    return map;
  }, [linkedActivityPlanItems]);
  const groupedStructureSessions = useMemo(
    () => groupSessionsByMicrocycle(structureSessionRows),
    [structureSessionRows],
  );

  const weeklyLoadSummary = useMemo(
    () =>
      groupedStructureSessions.map((microcycle) => {
        let hasUnavailableLoad = false;
        const weeklyLoad = microcycle.days.reduce((weekTotal, day) => {
          const dayTotal = day.sessions.reduce((sessionTotal, session) => {
            if (!session.activityPlanId) {
              return sessionTotal;
            }

            const linkedPlan = linkedActivityPlanById.get(session.activityPlanId);
            const load = getActivityPlanQuantitySummary(linkedPlan).commonLoad;
            if (load === null) {
              hasUnavailableLoad = true;
              return sessionTotal;
            }
            return sessionTotal + load;
          }, 0);

          return weekTotal + dayTotal;
        }, 0);

        return {
          microcycle: microcycle.microcycle,
          weeklyLoad: hasUnavailableLoad ? null : weeklyLoad,
        };
      }),
    [groupedStructureSessions, linkedActivityPlanById],
  );

  const uniqueLinkedActivityPlans = useMemo(
    () =>
      linkedActivityPlanIds
        .map((linkedPlanId) => linkedActivityPlanById.get(linkedPlanId))
        .filter((planItem): planItem is ActivityPlanListItem => !!planItem),
    [linkedActivityPlanById, linkedActivityPlanIds],
  );
  const activityUsageCountById = useMemo(() => {
    const usage = new Map<string, number>();
    structureSessionRows.forEach((session) => {
      if (!session.activityPlanId) {
        return;
      }

      usage.set(session.activityPlanId, (usage.get(session.activityPlanId) ?? 0) + 1);
    });
    return usage;
  }, [structureSessionRows]);
  const linkedActivityCards = useMemo(
    () =>
      uniqueLinkedActivityPlans.map((linkedPlan) => ({
        ...linkedPlan,
        estimatedDurationMinutes: Math.round(
          readFiniteNumber(getActivityPlanQuantitySummary(linkedPlan).durationSeconds) / 60,
        ),
        usageCount: activityUsageCountById.get(linkedPlan.id) ?? 0,
        stepCount: countSteps(linkedPlan.structure),
        includesIntervals: hasIntervals(linkedPlan.structure),
      })),
    [activityUsageCountById, uniqueLinkedActivityPlans],
  );
  const totalPlannedLoad = useMemo(
    () =>
      weeklyLoadSummary.some((week) => week.weeklyLoad === null)
        ? null
        : weeklyLoadSummary.reduce((sum, week) => sum + (week.weeklyLoad ?? 0), 0),
    [weeklyLoadSummary],
  );
  const totalPlannedMinutes = useMemo(
    () =>
      structureSessionRows.reduce((sum, session) => {
        if (!session.activityPlanId) {
          return sum;
        }

        return (
          sum +
          readFiniteNumber(
            getActivityPlanQuantitySummary(linkedActivityPlanById.get(session.activityPlanId))
              .durationSeconds,
          ) /
            60
        );
      }, 0),
    [linkedActivityPlanById, structureSessionRows],
  );
  const planStructureRecord =
    plan?.structure && typeof plan.structure === "object"
      ? (plan.structure as Record<string, unknown>)
      : null;
  const periodizationTemplate =
    planStructureRecord?.periodization_template &&
    typeof planStructureRecord.periodization_template === "object"
      ? (planStructureRecord.periodization_template as Record<string, unknown>)
      : null;
  const periodizationTargetDate = formatDateLabel(
    typeof periodizationTemplate?.target_date === "string"
      ? periodizationTemplate.target_date
      : undefined,
  );

  React.useEffect(() => {
    if (groupedStructureSessions.length === 0) {
      setActiveMicrocycle(null);
      return;
    }

    if (
      activeMicrocycle === null ||
      !groupedStructureSessions.some((group) => group.microcycle === activeMicrocycle)
    ) {
      setActiveMicrocycle(groupedStructureSessions[0]?.microcycle ?? null);
    }
  }, [activeMicrocycle, groupedStructureSessions]);

  const selectedMicrocycleGroup = useMemo(
    () => groupedStructureSessions.find((group) => group.microcycle === activeMicrocycle) ?? null,
    [activeMicrocycle, groupedStructureSessions],
  );
  const activeMicrocycleValue = activeMicrocycle?.toString() ?? "";
  const selectedMicrocycleSessionCount = useMemo(
    () => selectedMicrocycleGroup?.days.reduce((count, day) => count + day.sessions.length, 0) ?? 0,
    [selectedMicrocycleGroup],
  );
  const selectedMicrocycleActivityPlanIds = useMemo(() => {
    const ids = new Set<string>();

    selectedMicrocycleGroup?.days.forEach((day) => {
      day.sessions.forEach((session) => {
        if (session.activityPlanId) {
          ids.add(session.activityPlanId);
        }
      });
    });

    return ids;
  }, [selectedMicrocycleGroup]);
  const selectedMicrocycleActivityCards = useMemo(
    () =>
      linkedActivityCards.filter((planItem) => selectedMicrocycleActivityPlanIds.has(planItem.id)),
    [linkedActivityCards, selectedMicrocycleActivityPlanIds],
  );
  const selectedMicrocycleActivityById = useMemo(
    () => new Map(selectedMicrocycleActivityCards.map((planItem) => [planItem.id, planItem])),
    [selectedMicrocycleActivityCards],
  );
  const selectedMicrocycleMinutes = useMemo(
    () =>
      selectedMicrocycleActivityCards.reduce(
        (sum, planItem) => sum + Math.max(0, planItem.estimatedDurationMinutes || 0),
        0,
      ),
    [selectedMicrocycleActivityCards],
  );
  const selectedMicrocycleLoad = useMemo(
    () =>
      weeklyLoadSummary.find((week) => week.microcycle === activeMicrocycle)?.weeklyLoad ?? null,
    [activeMicrocycle, weeklyLoadSummary],
  );

  const focusContext = useMemo(() => {
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REFINE && isOwnedByUser) {
      return {
        title: "Refine Plan",
        description:
          "Your plan is ready. Open edit to adjust constraints, targets, and plan details.",
        ctaLabel: "Edit plan",
        onPress: handleEditStructure,
      };
    }
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.EDIT && isOwnedByUser) {
      return {
        title: "Edit Plan Structure",
        description:
          "Tune weekly targets and constraints in edit mode before your next scheduling cycle.",
        ctaLabel: "Edit plan",
        onPress: handleEditStructure,
      };
    }
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.MANAGE && isOwnedByUser) {
      return {
        title: "Manage Plan",
        description:
          "Review status, activation, and defaults in edit so the execution tab stays focused.",
        ctaLabel: "Edit plan",
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
      router.replace(ROUTES.PLAN.TRAINING_PLAN.CREATE);
    }
  }, [id, loadingPlan, plan, router]);

  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <LoadingState message="Loading training plan..." />
      </View>
    );
  }

  if (isSystemTemplateId ? Boolean(templateError) : snapshot.hasSharedDependencyError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-3">
        <ErrorState
          description="Unable to load training plan right now."
          onAction={() => void (isSystemTemplateId ? refetchTemplate() : snapshot.refetch())}
          title="Training plan unavailable"
        />
      </View>
    );
  }

  if (!plan) {
    if (!id) {
      return (
        <View className="flex-1 bg-background items-center justify-center">
          <LoadingState message="Opening plan creation..." />
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

  const renderHeaderActions = () => {
    const actions: DetailOverflowMenuAction[] = [];

    if (isOwnedByUser) {
      actions.push({
        label: "Edit Plan",
        onPress: handleEditStructure,
        testID: "training-plan-options-edit",
      });
    }
    actions.push({
      disabled: headerActions.duplicatePending,
      label: headerActions.duplicatePending ? "Duplicating..." : "Duplicate training plan",
      onPress: headerActions.handleDuplicate,
      testID: "training-plan-options-duplicate",
    });
    if (canSchedulePlan) {
      actions.push({
        label: "Schedule training plan",
        onPress: () => scheduling.setShowApplyModal(true),
        testID: "training-plan-options-schedule",
      });
    }
    if (isScheduledPlan) {
      actions.push({
        label: "Remove Scheduled Sessions",
        onPress: handleRemoveScheduledSessions,
        testID: "training-plan-options-remove-scheduled",
        variant: "destructive",
      });
    }
    if (isOwnedByUser) {
      actions.push({
        label: "Delete Plan",
        onPress: handleDeletePlan,
        testID: "training-plan-options-delete",
        variant: "destructive",
      });
    }

    return (
      <DetailOverflowMenu
        accessibilityLabel="Open training plan actions"
        actions={actions}
        testID="training-plan-options-trigger"
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="flex-1 p-4 gap-4">
          {focusContext ? (
            <TrainingPlanDetailFocusBanner
              ctaLabel={focusContext.ctaLabel}
              description={focusContext.description}
              onPress={focusContext.onPress}
              title={focusContext.title}
            />
          ) : null}

          <TrainingPlanDetailHeaderActionsSection
            handleToggleLike={headerActions.handleToggleLike}
            handleShare={headerActions.handleShare}
            isScheduledPlan={isScheduledPlan}
            isLiked={headerActions.isLiked}
            likesCount={headerActions.likesCount}
            commentCount={comments.commentCount}
            onCommentsPress={() => {
              if (plan?.id) {
                entityCommentsSheet?.openEntityComments({
                  entityId: plan.id,
                  entityType: "training_plan",
                });
              }
            }}
            {...(totalPlannedLoad === null
              ? {}
              : {
                  overview: {
                    linkedActivities: linkedActivityCards.length,
                    microcycles: groupedStructureSessions.length || 0,
                    plannedTime: markEstimated(formatMinutesLabel(totalPlannedMinutes)) ?? "0 min",
                    plannedLoad: Math.round(totalPlannedLoad),
                    sessions: structureSessionRows.length,
                  },
                })}
            plan={plan}
          />

          <View className="gap-4">
            <Tabs
              accessibilityLabel="Training plan weeks"
              onValueChange={(value) => setActiveMicrocycle(Number(value))}
              value={activeMicrocycleValue}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="pr-2"
              >
                <TabsList className="mr-0 h-auto flex-row gap-2 bg-transparent p-0">
                  {groupedStructureSessions.map((group) => {
                    const isActive = group.microcycle === activeMicrocycle;

                    return (
                      <TabsTrigger
                        accessibilityState={{ selected: isActive }}
                        className={`h-auto border-b-2 px-1.5 py-2 ${isActive ? "border-primary" : "border-transparent"}`}
                        key={`training-plan-week-tab-${group.microcycle}`}
                        onPress={() => setActiveMicrocycle(group.microcycle)}
                        testId={`training-plan-detail-tab-week-${group.microcycle}`}
                        value={group.microcycle.toString()}
                      >
                        <Text
                          className={`text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                        >
                          Week {group.microcycle}
                        </Text>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </ScrollView>
            </Tabs>

            {selectedMicrocycleGroup ? (
              <View className="rounded-3xl border border-border bg-card p-4 gap-4">
                <View className="gap-1">
                  <Text className="text-base font-semibold text-foreground">
                    Week {selectedMicrocycleGroup.microcycle}
                  </Text>
                  {periodizationTargetDate ? (
                    <Text className="text-xs text-muted-foreground">
                      Building toward {periodizationTargetDate}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <SummaryMetricCard label="Sessions" value={`${selectedMicrocycleSessionCount}`} />
                  <SummaryMetricCard
                    label="Linked activities"
                    value={`${selectedMicrocycleActivityCards.length}`}
                  />
                  <SummaryMetricCard
                    label="Planned Load"
                    value={
                      selectedMicrocycleLoad === null
                        ? "—"
                        : (markEstimated(`${Math.round(selectedMicrocycleLoad)}`) ?? "—")
                    }
                  />
                  <SummaryMetricCard
                    label="Planned time"
                    value={
                      markEstimated(formatMinutesLabel(selectedMicrocycleMinutes * 60)) ?? "0 min"
                    }
                  />
                </View>
                <TrainingPlanStructureSection
                  activityPlanNameById={activityPlanNameById}
                  embedded
                  formatCompactDayLabel={formatCompactDayLabel}
                  groupedStructureSessions={[selectedMicrocycleGroup]}
                  hideMicrocycleHeaders
                  renderSessionActivityContent={(session) => {
                    if (!session.activityPlanId) {
                      return null;
                    }

                    const linkedPlan = selectedMicrocycleActivityById.get(session.activityPlanId);
                    if (!linkedPlan) {
                      return null;
                    }

                    return (
                      <View className="pt-1">
                        <TrainingPlanCompactActivityPlanCard
                          linkedPlan={linkedPlan}
                          onPress={() => handleOpenLinkedActivityPlan(linkedPlan.id)}
                        />
                      </View>
                    );
                  }}
                  title="Sessions"
                />
                {isLoadingLinkedPlans ? (
                  <Text className="text-sm text-muted-foreground">
                    Loading linked activity plans...
                  </Text>
                ) : null}
                {linkedPlansError ? (
                  <View accessibilityRole="alert">
                    <Text>{linkedPlansError.message}</Text>
                    <Button onPress={() => void refetchLinkedPlans()}>
                      <Text>Retry linked activities</Text>
                    </Button>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="rounded-3xl border border-border bg-card p-4">
                <Text className="text-sm text-muted-foreground">
                  No structured weeks found in this template yet.
                </Text>
              </View>
            )}
          </View>

          <TrainingPlanTemplateSchedulingDialog
            applyPending={scheduling.applyPending}
            inputsLocked={scheduling.inputsLocked}
            previewPending={scheduling.previewPending}
            scheduleError={scheduling.scheduleError}
            applicationsLoading={scheduling.appliedSchedulesQuery.isLoading}
            applicationsError={scheduling.appliedSchedulesQuery.error?.message ?? null}
            onRetryApplications={() => void scheduling.appliedSchedulesQuery.refetch()}
            onApply={scheduling.handleApplyTemplate}
            onScheduleModalOpenChange={(open) => {
              if (open) scheduling.setShowApplyModal(true);
              else scheduling.handleCloseScheduleFlow();
            }}
            onSelectScheduleApplicationMode={scheduling.handleSelectScheduleApplicationMode}
            onSelectScheduleAnchorMode={scheduling.handleSelectScheduleAnchorMode}
            scheduleApplicationMode={scheduling.scheduleApplicationMode}
            scheduleAnchorContent={scheduling.scheduleAnchorContent}
            scheduleAnchorMode={scheduling.scheduleAnchorMode}
            scheduleReview={scheduling.scheduleReview}
            scheduledApplications={scheduling.appliedSchedules?.items ?? []}
            selectedApplicationId={scheduling.selectedApplicationId}
            onSelectApplication={scheduling.setSelectedApplicationId}
            setTemplateAnchorDate={scheduling.setTemplateAnchorDate}
            showScheduleModal={scheduling.showApplyModal}
            templateAnchorDate={scheduling.templateAnchorDate}
          />
        </View>
      </ScrollView>

      {showDeleteConfirm && plan ? (
        <AppConfirmModal
          description="This action cannot be undone. All planned activities associated with this training plan will also be deleted."
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: deletePlanMutation.isPending ? "Deleting..." : "Delete Training Plan",
            onPress: () => {
              void deletePlanMutation.mutateAsync({ id: plan.id });
            },
            testID: "training-plan-delete-confirm",
            variant: "destructive",
            disabled: deletePlanMutation.isPending,
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="training-plan-delete-modal"
          title="Delete Training Plan?"
        />
      ) : null}

      {removalPreview.isPending ? (
        <Text accessibilityLiveRegion="polite">Preparing removal review...</Text>
      ) : null}
      {removalPreview.error ? (
        <View accessibilityRole="alert">
          <Text>{removalPreview.error}</Text>
          <Button onPress={handleRemoveScheduledSessions}>
            <Text>Retry removal review</Text>
          </Button>
        </View>
      ) : null}
      {showRemoveScheduledConfirm && scheduledRemovalReview && plan ? (
        <AppConfirmModal
          description={`This removes ${scheduledRemovalReview?.affected.length ?? 0} future scheduled session${scheduledRemovalReview?.affected.length === 1 ? "" : "s"} after ${scheduledRemovalReview?.cutoffDate ?? "today"}. Today and completed history are kept.`}
          onClose={() => {
            if (removalPending) return;
            setShowRemoveScheduledConfirm(false);
            removalPreview.clear();
          }}
          primaryAction={{
            label: removeScheduledPlanMutation.isPending
              ? "Removing..."
              : "Remove Scheduled Sessions",
            onPress: () => {
              if (scheduledRemovalReview && !removalMutationGuard.current) {
                removalMutationGuard.current = true;
                setRemovalPending(true);
                removalDispatchedContext.current = removalContext;
                setRetainedRemoval({ context: removalContext, review: scheduledRemovalReview });
                removeScheduledPlanMutation.mutate({
                  applicationId: scheduledRemovalReview.applicationId,
                  operationId: scheduledRemovalReview.operationId,
                  previewFingerprint: scheduledRemovalReview.previewFingerprint,
                });
              }
            },
            testID: "training-plan-remove-scheduled-confirm",
            variant: "destructive",
            disabled: removalPending || !scheduledRemovalReview,
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => {
              if (removalPending) return;
              setShowRemoveScheduledConfirm(false);
              removalPreview.clear();
            },
            disabled: removalPending,
            variant: "outline",
          }}
          testID="training-plan-remove-scheduled-modal"
          title="Remove scheduled sessions?"
        />
      ) : null}

      {statusModal ? (
        <AppConfirmModal
          description={statusModal.description}
          onClose={() => {
            const next = statusModal.onClose;
            setStatusModal(null);
            next?.();
          }}
          primaryAction={{
            label: "OK",
            onPress: () => {
              const next = statusModal.onClose;
              setStatusModal(null);
              next?.();
            },
            testID: "training-plan-status-confirm",
          }}
          testID="training-plan-status-modal"
          title={statusModal.title}
        />
      ) : null}
    </>
  );
}

function SummaryMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-lg font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function TrainingPlanCompactActivityPlanCard({
  linkedPlan,
  onPress,
}: {
  linkedPlan: ActivityPlanListItem;
  onPress: () => void;
}) {
  return (
    <View testID={`training-plan-linked-activity-${linkedPlan.id}`}>
      <ActivityPlanCard plan={linkedPlan} onPress={onPress} variant="default" />
    </View>
  );
}
