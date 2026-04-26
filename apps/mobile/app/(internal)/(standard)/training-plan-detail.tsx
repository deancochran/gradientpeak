import { invalidateTrainingPlanQueries } from "@repo/api/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ellipsis } from "lucide-react-native";
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
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { TrainingPlanDetailFocusBanner } from "@/components/training-plan/TrainingPlanDetailFocusBanner";
import { TrainingPlanDetailHeaderActionsSection } from "@/components/training-plan/TrainingPlanDetailHeaderActionsSection";
import { TrainingPlanNoPlanEmptyState } from "@/components/training-plan/TrainingPlanNoPlanEmptyState";
import { TrainingPlanStructureSection } from "@/components/training-plan/TrainingPlanStructureSection";
import { TrainingPlanTemplateSchedulingDialog } from "@/components/training-plan/TrainingPlanTemplateSchedulingDialog";
import { useTrainingPlanHeaderSocialActions } from "@/components/training-plan/useTrainingPlanHeaderSocialActions";
import { useTrainingPlanTemplateSchedulingController } from "@/components/training-plan/useTrainingPlanTemplateSchedulingController";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import {
  normalizeTrainingPlanNextStep,
  TPV_NEXT_STEP_INTENTS,
} from "@/lib/constants/trainingPlanIntents";
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
  sourcePath: Array<string | number>;
};

type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  route_id?: string | null;
  authoritative_metrics?: {
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_duration?: number | null;
  } | null;
  route?: {
    distance?: number | null;
    ascent?: number | null;
    descent?: number | null;
  } | null;
  description?: string | null;
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

function hasRouteAttached(activityPlan: ActivityPlanListItem): boolean {
  if (activityPlan.route_id) {
    return true;
  }

  if (activityPlan.route) {
    return true;
  }

  if (!activityPlan.structure || typeof activityPlan.structure !== "object") {
    return false;
  }

  const routeId = (activityPlan.structure as Record<string, unknown>).route_id;
  const route = (activityPlan.structure as Record<string, unknown>).route;
  return typeof routeId === "string" || (!!route && typeof route === "object");
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
    const activityPlanId = readText(session.activity_plan_id) ?? null;
    const overrideTitle = readText(session.event_title_override);
    const legacyTitle = readText(session.title) ?? readText(session.name);
    const title =
      activityPlanId === null
        ? (overrideTitle ?? legacyTitle ?? inheritedTitle ?? `Session ${index + 1}`)
        : (overrideTitle ?? inheritedTitle ?? legacyTitle ?? `Session ${index + 1}`);

    rows.push({
      key: `${dayOffset}-${title}-${index}`,
      title,
      activityPlanId,
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

  const isSystemTemplateId = id?.startsWith("00000000-0000-0000-0000-00000000") ? true : false;

  const { data: templatePlan, isLoading: isLoadingTemplate } =
    api.trainingPlans.getTemplate.useQuery(isSystemTemplateId && id ? { id } : skipToken, {
      enabled: isSystemTemplateId && !!id,
    });

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const snapshot = useTrainingPlanSnapshot({
    planId: isSystemTemplateId ? undefined : id,
    includeStatus: false,
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
  const [activeMicrocycle, setActiveMicrocycle] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveScheduledConfirm, setShowRemoveScheduledConfirm] = useState(false);
  const [pendingActivityRemovalSession, setPendingActivityRemovalSession] =
    useState<StructureSessionRow | null>(null);
  const [statusModal, setStatusModal] = useState<null | {
    title: string;
    description: string;
    onClose?: () => void;
  }>(null);

  const handleOpenCalendar = useCallback(() => {
    router.navigate(ROUTES.CALENDAR as any);
  }, [router]);

  const scheduling = useTrainingPlanTemplateSchedulingController({
    handleOpenCalendar,
    planId: plan?.id,
    queryClient,
    router,
    utils,
  });
  const isCurrentScheduledPlan = !!plan?.id && scheduling.activePlan?.id === plan.id;
  const headerActions = useTrainingPlanHeaderSocialActions({
    plan,
    router,
    utils,
  });
  const comments = useEntityCommentsController({ entityId: plan?.id, entityType: "training_plan" });

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
    onError: (error) => {
      setStatusModal({
        title: "Delete Failed",
        description: error.message || "Failed to delete plan.",
      });
    },
  });
  const removeScheduledPlanMutation = api.trainingPlans.updateActivePlanStatus.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        invalidateTrainingPlanQueries(utils),
        snapshot.refetchAll(),
        refreshScheduleViews(queryClient, "trainingPlanSchedulingMutation"),
      ]);
      setShowRemoveScheduledConfirm(false);
      setStatusModal({
        title: "Scheduled sessions removed",
        description: `Removed ${result.scheduled_sessions_removed} scheduled session${result.scheduled_sessions_removed === 1 ? "" : "s"}. Completed sessions remain in history.`,
      });
    },
    onError: (error) => {
      setStatusModal({
        title: "Remove failed",
        description: error.message || "Could not remove the scheduled sessions.",
      });
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
      setStatusModal({
        title: "Session updated",
        description: "Training plan structure was saved.",
      });
      setShowActivityPicker(false);
      setSelectedSessionRow(null);
    },
    onError: (error) => {
      setStatusModal({
        title: "Update failed",
        description: error.message || "Could not update this session assignment.",
      });
    },
  });

  const handleOpenActivity = useCallback(() => {
    if (typeof activityId !== "string") return;
    navigateTo(ROUTES.PLAN.ACTIVITY_DETAIL(activityId) as any);
  }, [activityId, navigateTo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await snapshot.refetchAll();
    setRefreshing(false);
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
    } as any);
  }, [isOwnedByUser, navigateTo, plan?.id]);

  const handleDeletePlan = useCallback(() => {
    if (!plan) return;
    setShowDeleteConfirm(true);
  }, [deletePlanMutation, plan]);

  const handleRemoveScheduledSessions = useCallback(() => {
    if (!plan?.id) {
      return;
    }

    setShowRemoveScheduledConfirm(true);
  }, [plan?.id, removeScheduledPlanMutation]);

  const handleOpenLinkedActivityPlan = useCallback(
    (activityPlanId: string) => {
      navigateTo(ROUTES.PLAN.PLAN_DETAIL(activityPlanId) as any);
    },
    [navigateTo],
  );

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
            return (
              sessionTotal +
              readFiniteNumber(getAuthoritativeActivityPlanMetrics(linkedPlan).estimated_tss)
            );
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
  const linkedWorkoutCards = useMemo(
    () =>
      uniqueLinkedActivityPlans.map((linkedPlan) => ({
        ...linkedPlan,
        estimatedTss: Math.round(
          readFiniteNumber(getAuthoritativeActivityPlanMetrics(linkedPlan).estimated_tss),
        ),
        intensityFactor:
          readNumber(getAuthoritativeActivityPlanMetrics(linkedPlan).intensity_factor) ?? null,
        estimatedDurationMinutes: Math.round(
          readFiniteNumber(getAuthoritativeActivityPlanMetrics(linkedPlan).estimated_duration) / 60,
        ),
        usageCount: activityUsageCountById.get(linkedPlan.id) ?? 0,
        stepCount: countSteps(linkedPlan.structure),
        hasRoute: hasRouteAttached(linkedPlan),
        includesIntervals: hasIntervals(linkedPlan.structure),
      })),
    [activityUsageCountById, uniqueLinkedActivityPlans],
  );
  const totalPlannedTss = useMemo(
    () => weeklyLoadSummary.reduce((sum, week) => sum + week.estimatedTss, 0),
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
            getAuthoritativeActivityPlanMetrics(linkedActivityPlanById.get(session.activityPlanId))
              .estimated_duration,
          )
        );
      }, 0),
    [linkedActivityPlanById, structureSessionRows],
  );
  const routeBackedWorkoutCards = useMemo(
    () => linkedWorkoutCards.filter((planItem) => planItem.hasRoute),
    [linkedWorkoutCards],
  );
  const periodizationTargetDate = formatDateLabel(
    plan?.structure?.periodization_template?.target_date,
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
  const selectedMicrocycleWorkoutCards = useMemo(
    () =>
      linkedWorkoutCards.filter((planItem) => selectedMicrocycleActivityPlanIds.has(planItem.id)),
    [linkedWorkoutCards, selectedMicrocycleActivityPlanIds],
  );
  const selectedMicrocycleWorkoutById = useMemo(
    () => new Map(selectedMicrocycleWorkoutCards.map((planItem) => [planItem.id, planItem])),
    [selectedMicrocycleWorkoutCards],
  );
  const selectedMicrocycleMinutes = useMemo(
    () =>
      selectedMicrocycleWorkoutCards.reduce(
        (sum, planItem) => sum + Math.max(0, planItem.estimatedDurationMinutes || 0),
        0,
      ),
    [selectedMicrocycleWorkoutCards],
  );
  const selectedMicrocycleRouteCount = useMemo(
    () => selectedMicrocycleWorkoutCards.filter((planItem) => planItem.hasRoute).length,
    [selectedMicrocycleWorkoutCards],
  );
  const selectedMicrocycleLoad = useMemo(
    () => weeklyLoadSummary.find((week) => week.microcycle === activeMicrocycle)?.estimatedTss ?? 0,
    [activeMicrocycle, weeklyLoadSummary],
  );

  const commitSessionActivityPlan = useCallback(
    async (
      sessionRow: StructureSessionRow,
      nextActivityPlanId: string | null,
      fallbackSessionTitle?: string,
    ) => {
      if (!plan?.id || !plan?.structure) {
        setStatusModal({
          title: "Update failed",
          description: "Training plan structure is unavailable.",
        });
        return;
      }

      const nextStructure = cloneStructure(plan.structure);
      if (!nextStructure) {
        setStatusModal({
          title: "Update failed",
          description: "Training plan structure is invalid.",
        });
        return;
      }

      const targetSession = readSessionFromPath(nextStructure, sessionRow.sourcePath);
      if (!targetSession) {
        setStatusModal({
          title: "Update failed",
          description: "Could not locate the selected session.",
        });
        return;
      }

      targetSession.activity_plan_id = nextActivityPlanId;
      if (nextActivityPlanId) {
        delete targetSession.event_title_override;
        delete targetSession.title;
        delete targetSession.name;
      } else if (!readText(targetSession.title) && fallbackSessionTitle) {
        targetSession.title = fallbackSessionTitle;
      }

      if (
        typeof targetSession.day_offset === "number" &&
        typeof targetSession.offset_days !== "number"
      ) {
        targetSession.offset_days = targetSession.day_offset;
      }
      delete targetSession.day_offset;

      if (
        typeof targetSession.week_offset === "number" &&
        typeof targetSession.offset_weeks !== "number"
      ) {
        targetSession.offset_weeks = targetSession.week_offset;
      }
      delete targetSession.week_offset;

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

  const handleRemoveActivityFromSession = useCallback((sessionRow: StructureSessionRow) => {
    setPendingActivityRemovalSession(sessionRow);
  }, []);

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

  const renderHeaderActions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger testID="training-plan-options-trigger">
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {isOwnedByUser ? (
          <DropdownMenuItem onPress={handleEditStructure} testID="training-plan-options-edit">
            <Text>Edit Plan</Text>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onPress={headerActions.handleDuplicate}
            disabled={headerActions.duplicatePending}
            testID="training-plan-options-duplicate"
          >
            <Text>{headerActions.duplicatePending ? "Duplicating..." : "Duplicate"}</Text>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onPress={() => scheduling.setShowApplyModal(true)}
          testID="training-plan-options-schedule"
        >
          <Text>Schedule</Text>
        </DropdownMenuItem>
        {isCurrentScheduledPlan ? (
          <DropdownMenuItem
            onPress={handleRemoveScheduledSessions}
            variant="destructive"
            testID="training-plan-options-remove-scheduled"
          >
            <Text>Remove Scheduled Sessions</Text>
          </DropdownMenuItem>
        ) : null}
        {isOwnedByUser ? (
          <DropdownMenuItem
            onPress={handleDeletePlan}
            variant="destructive"
            testID="training-plan-options-delete"
          >
            <Text>Delete Plan</Text>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
            isCurrentScheduledPlan={isCurrentScheduledPlan}
            isLiked={headerActions.isLiked}
            likesCount={headerActions.likesCount}
            overview={{
              linkedWorkouts: linkedWorkoutCards.length,
              microcycles: groupedStructureSessions.length || 0,
              plannedTime: formatMinutesLabel(totalPlannedMinutes),
              plannedTss: Math.round(totalPlannedTss),
              routeBacked: routeBackedWorkoutCards.length,
              sessions: structureSessionRows.length,
            }}
            plan={plan}
          />

          <View className="gap-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 pr-2"
              accessibilityRole="tablist"
              accessibilityLabel="Training plan weeks"
            >
              {groupedStructureSessions.map((group) => {
                const isActive = group.microcycle === activeMicrocycle;

                return (
                  <Pressable
                    key={`training-plan-week-tab-${group.microcycle}`}
                    onPress={() => setActiveMicrocycle(group.microcycle)}
                    testID={`training-plan-detail-tab-week-${group.microcycle}`}
                    className={`border-b-2 px-1.5 py-2 ${isActive ? "border-primary" : "border-transparent"}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      className={`text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                    >
                      Week {group.microcycle}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {selectedMicrocycleGroup ? (
              <>
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
                    <SummaryMetricCard
                      label="Sessions"
                      value={`${selectedMicrocycleSessionCount}`}
                    />
                    <SummaryMetricCard
                      label="Linked workouts"
                      value={`${selectedMicrocycleWorkoutCards.length}`}
                    />
                    <SummaryMetricCard
                      label="Route-backed"
                      value={`${selectedMicrocycleRouteCount}`}
                    />
                    <SummaryMetricCard
                      label="Planned TSS"
                      value={`${Math.round(selectedMicrocycleLoad)}`}
                    />
                    <SummaryMetricCard
                      label="Planned time"
                      value={formatMinutesLabel(selectedMicrocycleMinutes * 60)}
                    />
                  </View>
                  <TrainingPlanStructureSection
                    activityPlanItems={activityPlanItems}
                    activityPlanNameById={activityPlanNameById}
                    description="Session placement stays visible here so the full microcycle remains easy to scan."
                    embedded
                    formatCompactDayLabel={formatCompactDayLabel}
                    groupedStructureSessions={[selectedMicrocycleGroup]}
                    hideMicrocycleHeaders
                    isLoadingActivityPlans={isLoadingActivityPlans}
                    isOwnedByUser={isOwnedByUser}
                    onActivityPickerOpenChange={(open) => {
                      setShowActivityPicker(open);
                      if (!open) {
                        setSelectedSessionRow(null);
                      }
                    }}
                    onOpenActivityPickerForSession={handleOpenActivityPickerForSession}
                    onRefreshActivityPlans={() => {
                      void refetchActivityPlans();
                    }}
                    onRemoveActivityFromSession={handleRemoveActivityFromSession}
                    renderSessionActivityContent={(session) => {
                      if (!session.activityPlanId) {
                        return null;
                      }

                      const linkedPlan = selectedMicrocycleWorkoutById.get(session.activityPlanId);
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
                    onSelectActivityForSession={(activityPlan) => {
                      void handleSelectActivityForSession(activityPlan);
                    }}
                    selectedSessionRow={selectedSessionRow}
                    showActivityPicker={showActivityPicker}
                    title="Sessions"
                    updatePlanStructurePending={updatePlanStructureMutation.isPending}
                  />
                  {isLoadingLinkedPlans ? (
                    <Text className="text-sm text-muted-foreground">
                      Loading linked activity plans...
                    </Text>
                  ) : null}
                </View>
              </>
            ) : (
              <View className="rounded-3xl border border-border bg-card p-4">
                <Text className="text-sm text-muted-foreground">
                  No structured weeks found in this template yet.
                </Text>
              </View>
            )}
          </View>

          <TrainingPlanTemplateSchedulingDialog
            applyPending={scheduling.applyTemplateMutation.isPending}
            onApply={scheduling.handleApplyTemplate}
            onConcurrencyOpenChange={scheduling.setShowConcurrencyWarning}
            onOpenActivePlan={scheduling.handleOpenActivePlan}
            onReplaceScheduledPlan={scheduling.handleReplaceScheduledPlan}
            onScheduleModalOpenChange={scheduling.setShowApplyModal}
            onSelectScheduleAnchorMode={scheduling.handleSelectScheduleAnchorMode}
            scheduleAnchorContent={scheduling.scheduleAnchorContent}
            scheduleAnchorMode={scheduling.scheduleAnchorMode}
            setTemplateAnchorDate={scheduling.setTemplateAnchorDate}
            showConcurrencyWarning={scheduling.showConcurrencyWarning}
            showScheduleModal={scheduling.showApplyModal}
            templateAnchorDate={scheduling.templateAnchorDate}
          />

          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
            helperText="Discuss the template before duplicating or scheduling it."
            hasMoreComments={comments.hasMoreComments}
            isLoadingMoreComments={comments.isLoadingMoreComments}
            newComment={comments.newComment}
            onAddComment={comments.handleAddComment}
            onChangeNewComment={comments.setNewComment}
            onLoadMoreComments={comments.loadMoreComments}
            testIDPrefix="training-plan"
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

      {showRemoveScheduledConfirm && plan ? (
        <AppConfirmModal
          description="This removes the current scheduled set for this plan while keeping completed history."
          onClose={() => setShowRemoveScheduledConfirm(false)}
          primaryAction={{
            label: removeScheduledPlanMutation.isPending
              ? "Removing..."
              : "Remove Scheduled Sessions",
            onPress: () => {
              removeScheduledPlanMutation.mutate({
                id: plan.id,
                status: "abandoned",
              });
            },
            testID: "training-plan-remove-scheduled-confirm",
            variant: "destructive",
            disabled: removeScheduledPlanMutation.isPending,
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowRemoveScheduledConfirm(false),
            variant: "outline",
          }}
          testID="training-plan-remove-scheduled-modal"
          title="Remove scheduled sessions?"
        />
      ) : null}

      {pendingActivityRemovalSession ? (
        <AppConfirmModal
          description="This session will no longer reference an activity plan."
          onClose={() => setPendingActivityRemovalSession(null)}
          primaryAction={{
            label: updatePlanStructureMutation.isPending ? "Removing..." : "Remove Linked Activity",
            onPress: () => {
              void commitSessionActivityPlan(
                pendingActivityRemovalSession,
                null,
                pendingActivityRemovalSession.title,
              );
              setPendingActivityRemovalSession(null);
            },
            testID: "training-plan-remove-linked-activity-confirm",
            variant: "destructive",
            disabled: updatePlanStructureMutation.isPending,
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setPendingActivityRemovalSession(null),
            variant: "outline",
          }}
          testID="training-plan-remove-linked-activity-modal"
          title="Remove linked activity?"
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
  linkedPlan: any;
  onPress: () => void;
}) {
  return (
    <View testID={`training-plan-linked-activity-${linkedPlan.id}`}>
      <ActivityPlanCard activityPlan={linkedPlan} onPress={onPress} variant="default" />
    </View>
  );
}
