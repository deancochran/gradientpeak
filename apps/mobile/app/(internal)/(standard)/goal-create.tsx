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
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { GoalEditorForm, type GoalEditorFormHandle } from "@/components/goals";
import { FormScreen } from "@/components/shared/FormScreen";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";
import { useAuthStore } from "@/lib/stores/auth-store";
import { publishTrainingPlanGoalCreation } from "@/lib/training-plan-creation/goalCreationHandoff";

export default function GoalCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnToTrainingPlanCreate?: string }>();
  const utils = api.useUtils();
  const formRef = useRef<GoalEditorFormHandle>(null);
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const draftOwnerId = useAuthStore((state) => state.user?.id ?? state.profile?.id ?? "loading");
  const currentProfileId = useRef(profileId);
  currentProfileId.current = profileId;
  const initialDraft = useMemo(() => createEmptyGoalDraft(), []);
  const [isDirty, setIsDirty] = useState(false);
  const createGoalMutation = api.goals.create.useMutation({
    onSuccess: async (goal, variables) => {
      if (variables.profile_id !== currentProfileId.current) return;
      await Promise.allSettled([
        Promise.resolve().then(() => invalidateGoalQueries(utils, { goalId: goal.id })),
      ]);
      if (variables.profile_id !== currentProfileId.current) return;
      allowNavigationAfterSuccess();
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
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty,
    isPending: createGoalMutation.isPending,
  });

  const handleSubmit = async (draft: GoalEditorDraft) => {
    if (!profileId) {
      throw new Error("Your profile is still loading. Please try again.");
    }

    await createGoalMutation.mutateAsync(buildGoalCreatePayload({ draft, profileId }));
  };

  return (
    <FormScreen testID="goal-create-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <LoadingButton
              className="min-h-11"
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
      <View testID="goal-create-scroll">
        <View className="gap-0.5">
          <Text className="text-xl font-semibold text-foreground">Create Goal</Text>
          <Text className="text-xs text-muted-foreground">Pick a focus, date, and target.</Text>
        </View>
        <GoalEditorForm
          key={draftOwnerId}
          ref={formRef}
          contentSizing="intrinsic"
          initialValue={initialDraft}
          submitLabel="Create Goal"
          isSubmitting={createGoalMutation.isPending}
          onDirtyChange={setIsDirty}
          showSubmitAction={false}
          onSubmit={handleSubmit}
        />
      </View>
    </FormScreen>
  );
}
