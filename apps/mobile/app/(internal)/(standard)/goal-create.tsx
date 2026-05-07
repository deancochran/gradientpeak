import { invalidateGoalQueries } from "@repo/api/react";
import { buildGoalCreatePayload, createEmptyGoalDraft, type GoalEditorDraft } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { GoalEditorForm } from "@/components/goals";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function GoalCreateScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const initialDraft = useMemo(() => createEmptyGoalDraft(), []);
  const createGoalMutation = api.goals.create.useMutation({
    onSuccess: async (goal) => {
      await invalidateGoalQueries(utils, { goalId: goal.id });
      router.replace(ROUTES.GOALS.DETAIL(goal.id) as never);
    },
  });

  const handleSubmit = async (draft: GoalEditorDraft) => {
    if (!profileId) {
      Alert.alert("Unable to create goal", "Your profile is still loading. Please try again.");
      return;
    }

    try {
      await createGoalMutation.mutateAsync(buildGoalCreatePayload({ draft, profileId }));
    } catch (error) {
      Alert.alert(
        "Unable to create goal",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <View className="flex-1 bg-background" testID="goal-create-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-2xl font-semibold text-foreground">Create Goal</Text>
          <Text className="text-sm text-muted-foreground">
            Define the outcome the plan and calendar should organize around.
          </Text>
        </View>
        <GoalEditorForm
          initialValue={initialDraft}
          submitLabel="Create Goal"
          isSubmitting={createGoalMutation.isPending}
          onSubmit={handleSubmit}
        />
      </ScrollView>
    </View>
  );
}
