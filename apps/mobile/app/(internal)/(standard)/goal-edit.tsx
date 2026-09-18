import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  createEmptyGoalDraft,
  type GoalEditorDraft,
  parseProfileGoalRecord,
} from "@repo/core";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { GoalEditorForm, type GoalEditorFormHandle } from "@/components/goals";
import { FormScreen } from "@/components/shared/FormScreen";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

export default function GoalEditScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const formRef = useRef<GoalEditorFormHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof id === "string" ? id : "";
  const [isSaving, setIsSaving] = useState(false);
  const saveGuard = useRef(false);
  const goalQuery = api.goals.getById.useQuery({ id: goalId }, { enabled: !!goalId });
  const goalRecord = useMemo(() => {
    if (!goalQuery.data) {
      return null;
    }

    try {
      const record = parseProfileGoalRecord(goalQuery.data);
      return record.id === goalId ? record : null;
    } catch {
      return null;
    }
  }, [goalQuery.data, goalId]);
  const goalContext = JSON.stringify([goalId, goalRecord?.profile_id]);
  const currentGoalContext = useRef(goalContext);
  currentGoalContext.current = goalContext;
  const updateGoalMutation = api.goals.update.useMutation();
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty,
    isPending: isSaving || updateGoalMutation.isPending,
  });

  const initialDraft = useMemo(() => {
    if (!goalRecord) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    return buildGoalDraftFromGoal({ goal: goalRecord });
  }, [goalRecord]);

  const handleSubmit = async (draft: GoalEditorDraft) => {
    if (!goalRecord || saveGuard.current) {
      return;
    }

    saveGuard.current = true;
    setIsSaving(true);
    try {
      await updateGoalMutation.mutateAsync({
        id: goalRecord.id,
        data: buildGoalUpdatePayload({ draft }),
      });
      if (currentGoalContext.current !== goalContext) return;
      await Promise.allSettled([
        Promise.resolve().then(() => invalidateGoalQueries(utils, { goalId })),
      ]);
      if (currentGoalContext.current !== goalContext) return;
      allowNavigationAfterSuccess();
      router.replace(ROUTES.GOALS.DETAIL(goalId) as never);
    } finally {
      saveGuard.current = false;
      setIsSaving(false);
    }
  };

  if (goalQuery.isLoading || (goalQuery.data && goalQuery.data.id !== goalId)) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message="Loading goal..." />
      </View>
    );
  }

  if (goalQuery.isError && !goalRecord && goalQuery.error?.data?.code !== "NOT_FOUND") {
    return (
      <View className="flex-1 bg-background px-6">
        <ErrorState title="Unable to load goal" onAction={() => void goalQuery.refetch()} />
      </View>
    );
  }

  if (!goalRecord) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <EmptyState
          actionLabel="Go back"
          description="This goal may have been removed."
          onAction={() => router.back()}
          title="Goal not found"
        />
      </View>
    );
  }

  return (
    <FormScreen testID="goal-edit-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <LoadingButton
              testID="goal-edit-submit"
              disabled={isSaving || updateGoalMutation.isPending}
              loading={isSaving || updateGoalMutation.isPending}
              loadingLabel="Saving..."
              loadingTextClassName="text-primary"
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">Save</Text>
            </LoadingButton>
          ),
        }}
      />
      <View className="gap-0.5">
        <Text className="text-xl font-semibold text-foreground">Edit Goal</Text>
        <Text className="text-xs text-muted-foreground">Tune the focus, date, and target.</Text>
      </View>
      <GoalEditorForm
        key={`${goalRecord.profile_id}:${goalId}`}
        ref={formRef}
        initialValue={initialDraft}
        submitLabel="Save Changes"
        isSubmitting={isSaving || updateGoalMutation.isPending}
        onDirtyChange={setIsDirty}
        showSubmitAction={false}
        onSubmit={handleSubmit}
      />
    </FormScreen>
  );
}
