import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  createEmptyGoalDraft,
  formatGoalTypeLabel,
  type GoalEditorDraft,
  getGoalDistanceBadge,
  getGoalMetricSummary,
  getGoalObjectiveSummary,
  parseProfileGoalRecord,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ellipsis, Target } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { GoalEditorModal } from "@/components/goals/GoalEditorModal";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";

export default function GoalDetailScreen() {
  const router = useRouter();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const utils = api.useUtils();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const [showEditor, setShowEditor] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    data: goal,
    isLoading,
    refetch,
  } = api.goals.getById.useQuery({ id: goalId }, { enabled: !!goalId });
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

  const updateGoalMutation = api.goals.update.useMutation({
    onSuccess: async () => {
      await Promise.all([invalidateGoalQueries(utils, { goalId }), refetch()]);
      setShowEditor(false);
    },
  });
  const deleteGoalMutation = api.goals.delete.useMutation({
    onSuccess: async () => {
      await invalidateGoalQueries(utils, { includeGoalDetail: false });
      router.back();
    },
  });

  const initialDraft = useMemo(() => {
    if (!goalRecord) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    return buildGoalDraftFromGoal({ goal: goalRecord });
  }, [goalRecord]);
  const metricSummary = goalRecord ? getGoalMetricSummary(goalRecord) : null;
  const distanceBadge = goalRecord ? getGoalDistanceBadge(goalRecord) : null;
  const objectiveSummary = goalRecord ? getGoalObjectiveSummary(goalRecord) : null;
  const targetDate = goalRecord?.target_date ?? null;
  const formattedTargetDate = targetDate
    ? new Date(`${targetDate}T12:00:00.000Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleDeleteGoal = () => {
    if (!goalRecord) {
      return;
    }

    setShowDeleteConfirm(true);
  };

  const handleSubmitGoal = async (draft: GoalEditorDraft) => {
    if (!goalRecord) {
      return;
    }

    try {
      await updateGoalMutation.mutateAsync({
        id: goalRecord.id,
        data: buildGoalUpdatePayload({ draft }),
      });
    } catch (error) {
      Alert.alert(
        "Unable to save goal",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-sm text-muted-foreground">Loading goal...</Text>
      </View>
    );
  }

  if (!goalRecord) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Goal not found</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          This goal may have been removed.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  const renderHeaderActions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger testID="goal-detail-options-trigger">
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem onPress={() => setShowEditor(true)} testID="goal-detail-options-edit">
          <Text>Edit Goal</Text>
        </DropdownMenuItem>
        <DropdownMenuItem
          onPress={handleDeleteGoal}
          variant="destructive"
          testID="goal-detail-options-delete"
        >
          <Text>Delete Goal</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerRight: renderHeaderActions }} />
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-4 p-4">
            <View className="flex-row items-start gap-3">
              <View className="rounded-full bg-muted/30 p-2.5">
                <Icon as={Target} size={18} className="text-foreground" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-2xl font-semibold text-foreground">{goalRecord.title}</Text>
                <Text className="text-sm text-muted-foreground">
                  {formatGoalTypeLabel(goalRecord)} goal
                </Text>
                {objectiveSummary ? (
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {objectiveSummary}
                  </Text>
                ) : null}
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium text-foreground">
                  Importance {goalRecord.priority}/10
                </Text>
              </View>
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium capitalize text-foreground">
                  {goalRecord.activity_category}
                </Text>
              </View>
              {distanceBadge ? (
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">{distanceBadge}</Text>
                </View>
              ) : null}
            </View>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-4 p-4">
            <View className="gap-1">
              <Text className="text-sm font-semibold text-foreground">Progress snapshot</Text>
              <Text className="text-xs text-muted-foreground">
                Key goal targets and timing at a glance.
              </Text>
            </View>

            <View className="gap-3 rounded-2xl border border-border bg-muted/10 px-4 py-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">Target date</Text>
                <Text className="text-sm font-medium text-foreground">
                  {formattedTargetDate || "Not set"}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">Goal type</Text>
                <Text className="text-sm font-medium text-foreground">
                  {formatGoalTypeLabel(goalRecord)}
                </Text>
              </View>
              {metricSummary ? (
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">{metricSummary.label}</Text>
                  <Text className="text-sm font-medium text-foreground">{metricSummary.value}</Text>
                </View>
              ) : null}
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">Importance</Text>
                <Text className="text-sm font-medium text-foreground">
                  {goalRecord.priority}/10
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-4 p-4">
            <View className="gap-1">
              <Text className="text-sm font-semibold text-foreground">Goal details</Text>
              <Text className="text-xs text-muted-foreground">
                The objective and target definition for this goal.
              </Text>
            </View>

            {objectiveSummary ? (
              <View className="rounded-2xl border border-border bg-muted/10 px-4 py-3">
                <Text className="text-sm text-foreground">{objectiveSummary}</Text>
              </View>
            ) : null}
          </CardContent>
        </Card>
      </ScrollView>

      <GoalEditorModal
        visible={showEditor}
        initialValue={initialDraft}
        title="Edit Goal"
        submitLabel="Save Changes"
        isSubmitting={updateGoalMutation.isPending}
        onClose={() => setShowEditor(false)}
        onSubmit={(draft) => {
          void handleSubmitGoal(draft);
        }}
      />
      {showDeleteConfirm ? (
        <AppConfirmModal
          description="Are you sure you want to delete this goal?"
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: deleteGoalMutation.isPending ? "Deleting..." : "Delete Goal",
            onPress: () => {
              if (!goalRecord) {
                setShowDeleteConfirm(false);
                return;
              }
              deleteGoalMutation.mutate({ id: goalRecord.id });
            },
            testID: "goal-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="goal-detail-delete-modal"
          title="Delete Goal"
        />
      ) : null}
    </View>
  );
}
