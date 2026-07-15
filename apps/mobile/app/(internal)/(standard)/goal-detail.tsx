import { invalidateGoalQueries } from "@repo/api/react";
import {
  formatGoalTypeLabel,
  getGoalObjectiveSummary,
  getProfileGoalLifecycleStatus,
  parseProfileGoalRecord,
} from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, Bike, CalendarDays, Dumbbell, Footprints, Waves } from "lucide-react-native";
import type React from "react";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { GoalIntelligenceCard } from "@/components/goals/GoalIntelligenceCard";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  DetailScaffold,
} from "@/components/shared/detail";
import { ErrorState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { toDateKey } from "@/lib/calendar/dateMath";
import { ROUTES } from "@/lib/constants/routes";

function SectionCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <Card className="rounded-3xl border border-border bg-card" testID={testID}>
      <CardContent className="gap-4 p-4">{children}</CardContent>
    </Card>
  );
}

function formatActivityCategory(value: string | null | undefined) {
  if (!value) return "Activity";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getActivityCategoryIcon(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("run")) return Footprints;
  if (normalized.includes("bike") || normalized.includes("cycling")) return Bike;
  if (normalized.includes("swim")) return Waves;
  if (normalized.includes("strength")) return Dumbbell;
  return Activity;
}

function todayDateKey() {
  return toDateKey(new Date());
}

function formatDateShort(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDaysUntilGoal(targetDate: string | null, today: string) {
  if (!targetDate) {
    return "No target date";
  }

  const target = new Date(`${targetDate}T12:00:00.000Z`);
  const reference = new Date(`${today}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(reference.getTime())) {
    return "Target date set";
  }

  const dayCount = Math.ceil((target.getTime() - reference.getTime()) / 86_400_000);
  if (dayCount < 0) {
    return "Past target date";
  }
  if (dayCount === 0) {
    return "Today";
  }
  return `${dayCount} day${dayCount === 1 ? "" : "s"} out`;
}

function resolveDeviceTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    if (!timezone) return null;
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
    return timezone;
  } catch {
    return null;
  }
}

export default function GoalDetailScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deviceTimezone = useMemo(() => resolveDeviceTimezone(), []);
  const [planningTimezone, setPlanningTimezone] = useState<string | null>(null);

  const goalQuery = api.goals.getById.useQuery({ id: goalId }, { enabled: !!goalId });
  const { data: goal, isLoading } = goalQuery;
  const intelligenceQuery = api.athleteIntelligence.evaluate.useQuery(
    { goalId },
    { enabled: !!goalId },
  );
  const todayKey = useMemo(() => todayDateKey(), []);
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
  const lifecycleStatus = goalRecord ? getProfileGoalLifecycleStatus({ goal: goalRecord }) : null;
  const targetDate = goalRecord?.target_date ?? null;
  const formattedTargetDate = formatDateShort(targetDate);
  const daysUntilGoal = formatDaysUntilGoal(targetDate, todayKey);
  const ActivityIcon = getActivityCategoryIcon(goalRecord?.activity_category);
  const activityCategoryLabel = formatActivityCategory(goalRecord?.activity_category);
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
      <SectionCard>
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Icon as={ActivityIcon} size={20} className="text-muted-foreground" />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {activityCategoryLabel} · {formatGoalTypeLabel(goalRecord)}
            </Text>
            <Text className="text-xl font-semibold text-foreground" numberOfLines={2}>
              {goalRecord.title}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {formattedTargetDate || "Target date not set"} · {lifecycleStatus?.label ?? "Goal"}
            </Text>
          </View>
        </View>

        {objectiveSummary ? (
          <Text className="text-sm leading-5 text-muted-foreground">{objectiveSummary}</Text>
        ) : null}

        <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
          <View className="flex-row items-center gap-2">
            <Icon as={CalendarDays} size={15} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-foreground">{daysUntilGoal}</Text>
          </View>
          <Text className="text-xs font-medium text-muted-foreground">
            Priority {goalRecord.priority}/10
          </Text>
        </View>
      </SectionCard>

      <GoalIntelligenceCard
        deviceTimezone={deviceTimezone}
        intelligence={intelligenceQuery.data}
        isError={intelligenceQuery.isError}
        isLoading={intelligenceQuery.isLoading}
        onRetry={() => void intelligenceQuery.refetch()}
        onUseDeviceTimezone={() => setPlanningTimezone(deviceTimezone)}
        planningTimezone={planningTimezone}
      />
    </DetailScaffold>
  );
}
