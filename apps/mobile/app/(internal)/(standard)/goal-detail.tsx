import {
  GoalEditorModal,
  type GoalEditorDraft,
} from "@/components/goals/GoalEditorModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";

function buildGoalDraft(goal: any): GoalEditorDraft {
  const storedDistanceMeters =
    typeof goal?.metadata?.distance_m === "number" &&
    Number.isFinite(goal.metadata.distance_m)
      ? goal.metadata.distance_m
      : null;

  return {
    title: goal?.title ?? "",
    targetDate: goal?.target_date ?? "",
    importance: typeof goal?.importance === "number" ? goal.importance : 5,
    goalType: goal?.goal_type ?? "general",
    targetMetric: goal?.target_metric ?? null,
    targetValue: goal?.target_value ?? null,
    raceDistanceKm:
      storedDistanceMeters !== null
        ? Math.round((storedDistanceMeters / 1000) * 10) / 10
        : null,
  };
}

function formatGoalType(goalType: string | null | undefined) {
  return String(goalType || "general").replace(/_/g, " ");
}

export default function GoalDetailScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const [showEditor, setShowEditor] = useState(false);

  const {
    data: goal,
    isLoading,
    refetch,
  } = trpc.goals.getById.useQuery({ id: goalId }, { enabled: !!goalId });
  const goalRecord = goal as any;

  const updateGoalMutation = trpc.goals.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.goals.list.invalidate(),
        utils.goals.getById.invalidate({ id: goalId }),
        refetch(),
      ]);
      setShowEditor(false);
    },
  });

  const deleteGoalMutation = trpc.goals.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.goals.list.invalidate()]);
      router.back();
    },
  });

  const initialDraft = useMemo(() => buildGoalDraft(goalRecord), [goalRecord]);

  const handleDeleteGoal = () => {
    if (!goalRecord) {
      return;
    }

    Alert.alert("Delete Goal", "Are you sure you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteGoalMutation.mutate({ id: goalRecord.id }),
      },
    ]);
  };

  const handleSubmitGoal = (draft: GoalEditorDraft) => {
    if (!goalRecord) {
      return;
    }

    updateGoalMutation.mutate({
      id: goalRecord.id,
      data: {
        title: draft.title.trim(),
        goal_type: draft.goalType,
        target_date: draft.targetDate,
        target_metric: draft.targetMetric?.trim() || null,
        target_value:
          typeof draft.targetValue === "number" &&
          Number.isFinite(draft.targetValue)
            ? draft.targetValue
            : null,
        importance: Math.max(0, Math.min(10, draft.importance)),
        metadata:
          draft.goalType === "race_performance" &&
          typeof draft.raceDistanceKm === "number" &&
          Number.isFinite(draft.raceDistanceKm) &&
          draft.raceDistanceKm > 0
            ? { distance_m: Math.round(draft.raceDistanceKm * 1000) }
            : undefined,
      },
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-3">
          Loading goal...
        </Text>
      </View>
    );
  }

  if (!goalRecord) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <Text className="text-lg font-semibold text-foreground">
          Goal not found
        </Text>
        <Text className="text-sm text-muted-foreground text-center mt-2">
          This goal may have been removed.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        <Card>
          <CardContent className="p-4 gap-4">
            <View className="gap-1">
              <CardTitle>{goalRecord.title}</CardTitle>
              <Text className="text-sm text-muted-foreground">
                {formatGoalType(goalRecord.goal_type)} goal
                {goalRecord.target_date
                  ? ` · target ${goalRecord.target_date}`
                  : ""}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium text-foreground">
                  Importance {goalRecord.importance}/10
                </Text>
              </View>
              {typeof goalRecord?.metadata?.distance_m === "number" ? (
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    {Math.round((goalRecord.metadata.distance_m / 1000) * 10) /
                      10}
                    km
                  </Text>
                </View>
              ) : null}
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium text-foreground capitalize">
                  {formatGoalType(goalRecord.goal_type)}
                </Text>
              </View>
            </View>

            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">
                  Target date
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {goalRecord.target_date || "Not set"}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">
                  Target metric
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {goalRecord.target_metric || "Not set"}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">
                  Target value
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {typeof goalRecord.target_value === "number"
                    ? goalRecord.target_value
                    : "Not set"}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">
                  Race distance
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {typeof goalRecord?.metadata?.distance_m === "number"
                    ? `${Math.round((goalRecord.metadata.distance_m / 1000) * 10) / 10} km`
                    : "Not set"}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      <View className="px-4 py-4 border-t border-border bg-background">
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => setShowEditor(true)}
          >
            <Text>Edit Goal</Text>
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onPress={handleDeleteGoal}
            disabled={deleteGoalMutation.isPending}
          >
            <Text className="text-destructive">
              {deleteGoalMutation.isPending ? "Deleting..." : "Delete"}
            </Text>
          </Button>
        </View>
      </View>

      <GoalEditorModal
        visible={showEditor}
        initialValue={initialDraft}
        title="Edit Goal"
        submitLabel="Save Changes"
        isSubmitting={updateGoalMutation.isPending}
        onClose={() => setShowEditor(false)}
        onSubmit={handleSubmitGoal}
      />
    </View>
  );
}
