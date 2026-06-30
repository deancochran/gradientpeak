import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildGoalCreatePayload,
  canonicalGoalObjectiveSchema,
  createEmptyGoalDraft,
  type GoalEditorDraft,
} from "@repo/core";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { GoalEditorForm, type GoalEditorFormHandle } from "@/components/goals";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuthStore } from "@/lib/stores/auth-store";
import { publishTrainingPlanGoalCreation } from "@/lib/training-plan-creation/goalCreationHandoff";

export default function GoalCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnToTrainingPlanCreate?: string }>();
  const utils = api.useUtils();
  const formRef = useRef<GoalEditorFormHandle>(null);
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const initialDraft = useMemo(() => createEmptyGoalDraft(), []);
  const createGoalMutation = api.goals.create.useMutation({
    onSuccess: async (goal) => {
      await invalidateGoalQueries(utils, { goalId: goal.id });
      if (params.returnToTrainingPlanCreate === "1") {
        const parsedObjective = canonicalGoalObjectiveSchema.safeParse(goal.target_payload);
        publishTrainingPlanGoalCreation({
          id: goal.id,
          title: goal.title,
          target_date: goal.target_date,
          priority: goal.priority,
          activity_category: goal.activity_category,
          objective: parsedObjective.success ? parsedObjective.data : null,
        });
        router.back();
        return;
      }
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
            <LoadingButton
              disabled={createGoalMutation.isPending}
              loading={createGoalMutation.isPending}
              loadingLabel="Creating..."
              loadingTextClassName="text-primary"
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">Create</Text>
            </LoadingButton>
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
