import { invalidateGoalQueries } from "@repo/api/react";
import { buildGoalCreatePayload, createEmptyGoalDraft, type GoalEditorDraft } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useRef } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { GoalEditorForm, type GoalEditorFormHandle } from "@/components/goals";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function GoalCreateScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const formRef = useRef<GoalEditorFormHandle>(null);
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 gap-3 bg-background p-3"
      keyboardVerticalOffset={80}
      testID="goal-create-screen"
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              disabled={createGoalMutation.isPending}
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">
                {createGoalMutation.isPending ? "Creating..." : "Create"}
              </Text>
            </Button>
          ),
        }}
      />
      <View className="gap-0.5">
        <Text className="text-xl font-semibold text-foreground">Create Goal</Text>
        <Text className="text-xs text-muted-foreground">Pick a focus, date, and target.</Text>
      </View>
      <GoalEditorForm
        ref={formRef}
        initialValue={initialDraft}
        submitLabel="Create Goal"
        isSubmitting={createGoalMutation.isPending}
        showSubmitAction={false}
        onSubmit={handleSubmit}
      />
    </KeyboardAvoidingView>
  );
}
