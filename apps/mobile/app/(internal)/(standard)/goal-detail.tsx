import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildCenteredPlanAnalysisWindow,
  formatGoalTypeLabel,
  getGoalObjectiveSummary,
  parseProfileGoalRecord,
} from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import type React from "react";
import { useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { GoalIntelligenceCard } from "@/components/goals/GoalIntelligenceCard";
import { PlanProgressInsight } from "@/components/plan/insights/PlanProgressInsight";
import {
  buildComparableThresholdTrend,
  buildGoalTrajectoryAnswer,
  mergeGoalProgressThresholdEvidence,
} from "@/components/plan/training-path/planDashboardPresentation";
import { getTrainingPathTodayKey } from "@/components/plan/training-path/trainingPathPlanningTime";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  DetailScaffold,
} from "@/components/shared/detail";
import { GoalCard } from "@/components/shared/GoalCard";
import { ErrorState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";

function SectionCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <Card className="rounded-3xl border border-border bg-card" testID={testID}>
      <CardContent className="gap-4 p-4">{children}</CardContent>
    </Card>
  );
}

export default function GoalDetailScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { profile } = useAuth();

  const goalQuery = api.goals.getById.useQuery({ id: goalId }, { enabled: !!goalId });
  const { data: goal, isLoading } = goalQuery;
  const assessmentQuery = api.athleteIntelligence.getGoalAssessment.useQuery(
    { goalId },
    { enabled: !!goalId },
  );
  const progressQuery = api.athleteIntelligence.getGoalProgress.useQuery(
    { goalId },
    { enabled: !!goalId },
  );
  const thresholdQuery = api.athleteIntelligence.getThresholdOverview.useQuery(
    { historyLimit: 100 },
    { enabled: !!goalId },
  );
  const todayKey = useMemo(
    () => getTrainingPathTodayKey(new Date(), profile?.planning_timezone ?? "UTC") ?? "",
    [profile?.planning_timezone],
  );
  const goalRecord = useMemo(() => {
    if (!goal) {
      return null;
    }

    try {
      return parseProfileGoalRecord(goal);
    } catch {
      return null;
    }
  }, [goal]);

  const deleteGoalMutation = api.goals.delete.useMutation({
    onSuccess: async () => {
      await invalidateGoalQueries(utils, { includeGoalDetail: false });
      router.back();
    },
  });

  const objectiveSummary = goalRecord ? getGoalObjectiveSummary(goalRecord) : null;
  const targetDate = goalRecord?.target_date ?? null;
  const analysisWindow = useMemo(
    () => buildCenteredPlanAnalysisWindow({ anchorDate: todayKey, period: "6m" }),
    [todayKey],
  );
  const goalProgress = progressQuery.data?.result;
  const progressIdentity =
    goalProgress && goalProgress.status !== "unsupported" ? goalProgress.target : null;
  const thresholdTrend = buildComparableThresholdTrend(
    mergeGoalProgressThresholdEvidence(
      thresholdQuery.data?.history.items ?? [],
      progressQuery.data?.provenance,
    ),
    progressIdentity?.activityCategory ?? null,
    progressIdentity ? { metric: progressIdentity.metric, unit: progressIdentity.unit } : null,
  );
  const trajectoryAnswer = buildGoalTrajectoryAnswer(goalProgress);
  const intelligenceRevisions = [
    assessmentQuery.data?.stateRevision,
    progressQuery.data?.publication?.publishedRevision,
    thresholdQuery.data?.publication.publishedRevision,
  ];
  const intelligenceAvailable =
    intelligenceRevisions.every((value): value is number => typeof value === "number") &&
    assessmentQuery.data?.freshness === "fresh" &&
    progressQuery.data?.publication?.status === "available" &&
    thresholdQuery.data?.publication.status === "available";
  const intelligenceAligned =
    intelligenceAvailable &&
    intelligenceRevisions.every((revision) => revision === intelligenceRevisions[0]);
  const intelligenceComputedAt = [
    assessmentQuery.data?.computedAt,
    progressQuery.data?.publication?.computedAt,
    thresholdQuery.data?.publication.computedAt,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const refreshGoal = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        goalQuery.refetch(),
        assessmentQuery.refetch(),
        progressQuery.refetch(),
        thresholdQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const handleDeleteGoal = () => {
    if (!goalRecord) {
      return;
    }

    setShowDeleteConfirm(true);
  };

  const renderHeaderActions = () => (
    <DetailOverflowMenu
      actions={
        goalRecord
          ? [
              {
                label: "Edit Goal",
                onPress: () => router.navigate(ROUTES.GOALS.EDIT(goalRecord.id) as never),
                testID: "goal-detail-options-edit",
              },
              {
                label: "Delete Goal",
                onPress: handleDeleteGoal,
                testID: "goal-detail-options-delete",
                variant: "destructive",
              },
            ]
          : []
      }
      testID="goal-detail-options-trigger"
    />
  );

  if (goalQuery.isError) {
    return (
      <DetailScaffold headerRight={renderHeaderActions}>
        <ErrorState
          description="Check your connection and try again."
          onAction={() => void goalQuery.refetch()}
          title="Goal could not be loaded"
        />
      </DetailScaffold>
    );
  }

  if (isLoading || !goalRecord) {
    return (
      <DetailScaffold
        headerRight={renderHeaderActions}
        isLoading={isLoading}
        loadingLabel="Loading goal..."
        notFound={!goalRecord}
        notFoundDescription="This goal may have been removed."
        notFoundOnActionPress={() => router.back()}
        notFoundTitle="Goal not found"
      >
        {null}
      </DetailScaffold>
    );
  }

  return (
    <DetailScaffold
      headerRight={renderHeaderActions}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refreshGoal()} />
      }
      modals={
        showDeleteConfirm && goalRecord ? (
          <DetailDeleteConfirmModal
            entityLabel="Goal"
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => {
              deleteGoalMutation.mutate({ id: goalRecord.id });
            }}
            pending={deleteGoalMutation.isPending}
            testIDPrefix="goal-detail"
          />
        ) : null
      }
    >
      <GoalCard
        goal={{
          id: goalRecord.id,
          objectiveSummary,
          targetDate,
          title: goalRecord.title,
          typeLabel: formatGoalTypeLabel(goalRecord),
        }}
        testID="goal-detail-card"
      />

      <GoalIntelligenceCard
        assessment={assessmentQuery.data}
        isError={assessmentQuery.isError}
        isLoading={assessmentQuery.isLoading}
        onRetry={() => void assessmentQuery.refetch()}
      />
      <SectionCard testID="goal-detail-progress">
        <View className="flex-row items-center justify-between gap-3">
          <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
            Trajectory and threshold progress
          </Text>
          <Text className="text-xs text-muted-foreground">6 months</Text>
        </View>
        <View className="gap-1" testID="goal-detail-trajectory-answer">
          <Text className="font-semibold text-foreground">{trajectoryAnswer.headline}</Text>
          <Text className="text-sm leading-5 text-muted-foreground">{trajectoryAnswer.body}</Text>
        </View>
        <Text className="text-xs text-muted-foreground" testID="goal-detail-evidence-freshness">
          {assessmentQuery.isLoading || progressQuery.isLoading || thresholdQuery.isLoading
            ? "Updating signals"
            : assessmentQuery.isError || progressQuery.isError || thresholdQuery.isError
              ? "Some signals are unavailable"
              : intelligenceAligned
                ? `Signals aligned at revision ${intelligenceRevisions[0]}`
                : intelligenceAvailable
                  ? "Signals updated separately"
                  : "Some signals are stale or unavailable"}
          {intelligenceComputedAt
            ? ` · calculated ${new Date(intelligenceComputedAt).toLocaleString()}`
            : " · calculation time unavailable"}
        </Text>
        {progressQuery.isLoading || thresholdQuery.isLoading ? (
          <Text className="text-sm text-muted-foreground">Loading threshold evidence…</Text>
        ) : progressQuery.isError || thresholdQuery.isError ? (
          <Text className="text-sm text-muted-foreground">
            Threshold progress is unavailable. Retry from the goal when data is available.
          </Text>
        ) : (
          <PlanProgressInsight
            deadlineDate={
              goalProgress && goalProgress.status !== "unsupported"
                ? goalProgress.deadlineAt.slice(0, 10)
                : targetDate
            }
            onOpenSourceActivity={(activityId) =>
              router.navigate(ROUTES.ACTIVITIES.DETAIL(activityId) as never)
            }
            progress={goalProgress}
            todayKey={todayKey}
            trend={thresholdTrend}
            window={{ end: analysisWindow.endDate, start: analysisWindow.startDate }}
          />
        )}
        <Text
          accessibilityRole="button"
          className="self-start text-sm font-semibold text-primary"
          onPress={() =>
            router.navigate(
              ROUTES.PLAN.ANALYSIS({
                anchorDate: todayKey,
                goalId: goalRecord.id,
                metric: "threshold",
                range: "6m",
                view: "progress",
              }) as never,
            )
          }
          testID="goal-detail-analyze"
        >
          Analyze
        </Text>
      </SectionCard>
    </DetailScaffold>
  );
}
