import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  createEmptyGoalDraft,
  type GoalEditorDraft,
  parseProfileGoalRecord,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { GoalEditorForm } from "@/components/goals";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

export default function GoalEditScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const goalQuery = api.goals.getById.useQuery({ id: goalId }, { enabled: !!goalId });
  const goalRecord = useMemo(() => {
    if (!goalQuery.data) {
      return null;
    }

    try {
      return parseProfileGoalRecord(goalQuery.data);
    } catch {
      return null;
    }
  }, [goalQuery.data]);
  const updateGoalMutation = api.goals.update.useMutation({
    onSuccess: async () => {
      await invalidateGoalQueries(utils, { goalId });
      router.replace(ROUTES.GOALS.DETAIL(goalId) as never);
    },
  });

  const initialDraft = useMemo(() => {
    if (!goalRecord) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    return buildGoalDraftFromGoal({ goal: goalRecord });
  }, [goalRecord]);

  const handleSubmit = async (draft: GoalEditorDraft) => {
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

  if (goalQuery.isLoading) {
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

  return (
    <View className="flex-1 bg-background" testID="goal-edit-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-2xl font-semibold text-foreground">Edit Goal</Text>
          <Text className="text-sm text-muted-foreground">
            Update the target definition used for planning and readiness context.
          </Text>
        </View>
        <GoalEditorForm
          initialValue={initialDraft}
          submitLabel="Save Changes"
          isSubmitting={updateGoalMutation.isPending}
          onSubmit={handleSubmit}
        />
      </ScrollView>
    </View>
  );
}
