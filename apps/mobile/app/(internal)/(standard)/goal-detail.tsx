import { GoalEditorModal } from "@/components/goals/GoalEditorModal";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import {
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  buildMilestoneEventCreateInput,
  buildMilestoneEventUpdatePatch,
  createEmptyGoalDraft,
  formatGoalTypeLabel,
  getGoalDistanceBadge,
  getGoalMetricSummary,
  getGoalObjectiveSummary,
  type GoalEditorDraft,
} from "@/lib/goals/goalDraft";
import { trpc } from "@/lib/trpc";
import { parseProfileGoalRecord } from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";

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
  const milestoneEventQuery = trpc.events.getById.useQuery(
    { id: goalRecord?.milestone_event_id ?? "" },
    { enabled: !!goalRecord?.milestone_event_id },
  );

  const updateGoalMutation = trpc.goals.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.goals.list.invalidate(),
        utils.goals.getById.invalidate({ id: goalId }),
        utils.events.list.invalidate(),
        utils.events.getById.invalidate(),
        refetch(),
      ]);
      setShowEditor(false);
    },
  });
  const createMilestoneEventMutation = trpc.events.create.useMutation();
  const updateMilestoneEventMutation = trpc.events.update.useMutation();
  const deleteMilestoneEventMutation = trpc.events.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.goals.list.invalidate(),
        utils.events.list.invalidate(),
      ]);
      router.back();
    },
  });
  const deleteGoalMutation = trpc.goals.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.goals.list.invalidate()]);
      router.back();
    },
  });

  const targetDate = milestoneEventQuery.data?.starts_at?.slice(0, 10) ?? null;
  const initialDraft = useMemo(() => {
    if (!goalRecord) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    return buildGoalDraftFromGoal({ goal: goalRecord, targetDate });
  }, [goalRecord, targetDate]);
  const metricSummary = goalRecord ? getGoalMetricSummary(goalRecord) : null;
  const distanceBadge = goalRecord ? getGoalDistanceBadge(goalRecord) : null;
  const objectiveSummary = goalRecord
    ? getGoalObjectiveSummary(goalRecord)
    : null;

  const handleDeleteGoal = () => {
    if (!goalRecord) {
      return;
    }

    Alert.alert("Delete Goal", "Are you sure you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (goalRecord.milestone_event_id) {
            deleteMilestoneEventMutation.mutate({
              id: goalRecord.milestone_event_id,
            });
            return;
          }

          deleteGoalMutation.mutate({ id: goalRecord.id });
        },
      },
    ]);
  };

  const handleSubmitGoal = async (draft: GoalEditorDraft) => {
    if (!goalRecord) {
      return;
    }

    try {
      const milestoneEventId = goalRecord.milestone_event_id
        ? goalRecord.milestone_event_id
        : (
            await createMilestoneEventMutation.mutateAsync(
              buildMilestoneEventCreateInput({ draft }),
            )
          ).id;

      if (goalRecord.milestone_event_id) {
        await updateMilestoneEventMutation.mutateAsync({
          id: goalRecord.milestone_event_id,
          patch: buildMilestoneEventUpdatePatch({ draft }),
        });
      }

      await updateGoalMutation.mutateAsync({
        id: goalRecord.id,
        data: buildGoalUpdatePayload({
          draft,
          milestoneEventId,
        }),
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
        <Text className="mt-3 text-sm text-muted-foreground">
          Loading goal...
        </Text>
      </View>
    );
  }

  if (!goalRecord) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">
          Goal not found
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
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
          <CardContent className="gap-4 p-4">
            <View className="gap-1">
              <CardTitle>{goalRecord.title}</CardTitle>
              <Text className="text-sm text-muted-foreground">
                {formatGoalTypeLabel(goalRecord)} goal
                {targetDate ? ` · target ${targetDate}` : ""}
              </Text>
              {objectiveSummary ? (
                <Text className="text-sm text-foreground">
                  {objectiveSummary}
                </Text>
              ) : null}
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
                  <Text className="text-xs font-medium text-foreground">
                    {distanceBadge}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">
                  Target date
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {targetDate || "Not set"}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">Goal type</Text>
                <Text className="text-sm font-medium text-foreground">
                  {formatGoalTypeLabel(goalRecord)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">
                  {metricSummary?.label}
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {metricSummary?.value}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      <View className="border-t border-border bg-background px-4 py-4">
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
            disabled={
              deleteGoalMutation.isPending ||
              deleteMilestoneEventMutation.isPending
            }
          >
            <Text className="text-destructive">
              {deleteGoalMutation.isPending ||
              deleteMilestoneEventMutation.isPending
                ? "Deleting..."
                : "Delete"}
            </Text>
          </Button>
        </View>
      </View>

      <GoalEditorModal
        visible={showEditor}
        initialValue={initialDraft}
        title="Edit Goal"
        submitLabel="Save Changes"
        isSubmitting={
          updateGoalMutation.isPending ||
          createMilestoneEventMutation.isPending ||
          updateMilestoneEventMutation.isPending
        }
        onClose={() => setShowEditor(false)}
        onSubmit={(draft) => {
          void handleSubmitGoal(draft);
        }}
      />
    </View>
  );
}
