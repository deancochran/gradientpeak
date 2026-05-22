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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { GoalEditorForm, type GoalEditorFormHandle } from "@/components/goals";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

export default function GoalEditScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const formRef = useRef<GoalEditorFormHandle>(null);
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 gap-3 bg-background p-3"
      keyboardVerticalOffset={80}
      testID="goal-edit-screen"
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              disabled={updateGoalMutation.isPending}
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">
                {updateGoalMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Button>
          ),
        }}
      />
      <View className="gap-0.5">
        <Text className="text-xl font-semibold text-foreground">Edit Goal</Text>
        <Text className="text-xs text-muted-foreground">Tune the focus, date, and target.</Text>
      </View>
      <GoalEditorForm
        ref={formRef}
        initialValue={initialDraft}
        submitLabel="Save Changes"
        isSubmitting={updateGoalMutation.isPending}
        showSubmitAction={false}
        onSubmit={handleSubmit}
      />
    </KeyboardAvoidingView>
  );
}
