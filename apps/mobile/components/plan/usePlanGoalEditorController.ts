import { invalidateGoalQueries } from "@repo/api/react";
import {
  buildGoalCreatePayload,
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  createEmptyGoalDraft,
  type GoalEditorDraft,
} from "@repo/core";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { type useProfileGoals } from "@/lib/hooks/useProfileGoals";

type PlanGoalEditorGoals = Pick<
  ReturnType<typeof useProfileGoals>,
  "goals" | "profileId" | "refetch"
>;

type UsePlanGoalEditorControllerParams = {
  activePlanId: string | null | undefined;
  goals: PlanGoalEditorGoals;
};

export function usePlanGoalEditorController({
  activePlanId,
  goals,
}: UsePlanGoalEditorControllerParams) {
  const utils = api.useUtils();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [isGoalModalVisible, setIsGoalModalVisible] = useState(false);

  const createGoalMutation = api.goals.create.useMutation();
  const updateGoalMutation = api.goals.update.useMutation();

  const closeGoalEditor = useCallback(() => {
    setIsGoalModalVisible(false);
    setEditingGoalId(null);
  }, []);

  const openCreateGoalEditor = useCallback(() => {
    setEditingGoalId(null);
    setIsGoalModalVisible(true);
  }, []);

  const openEditGoalEditor = useCallback((goalId: string) => {
    setEditingGoalId(goalId);
    setIsGoalModalVisible(true);
  }, []);

  const goalEditorInitialValue = useMemo(() => {
    if (!editingGoalId) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    const goal = goals.goals.find((item) => item.id === editingGoalId);
    if (!goal) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    return buildGoalDraftFromGoal({ goal });
  }, [editingGoalId, goals.goals]);

  const isGoalSaving = createGoalMutation.isPending || updateGoalMutation.isPending;

  const submitGoal = useCallback(
    async (draft: GoalEditorDraft) => {
      if (!goals.profileId) {
        return;
      }

      try {
        if (editingGoalId) {
          await updateGoalMutation.mutateAsync({
            id: editingGoalId,
            data: {
              ...buildGoalUpdatePayload({ draft }),
              training_plan_id: activePlanId ?? undefined,
            },
          });

          await Promise.all([
            invalidateGoalQueries(utils, {
              goalId: editingGoalId,
              includeEventDetail: true,
            }),
            goals.refetch(),
          ]);
          closeGoalEditor();
          return;
        }

        await createGoalMutation.mutateAsync({
          ...buildGoalCreatePayload({
            draft,
            profileId: goals.profileId,
          }),
          training_plan_id: activePlanId ?? undefined,
        });

        await Promise.all([invalidateGoalQueries(utils), goals.refetch()]);
        closeGoalEditor();
      } catch (error) {
        Alert.alert(
          "Unable to save goal",
          error instanceof Error ? error.message : "Please try again.",
        );
      }
    },
    [
      activePlanId,
      closeGoalEditor,
      createGoalMutation,
      editingGoalId,
      goals,
      updateGoalMutation,
      utils,
    ],
  );

  return {
    goalEditorInitialValue,
    goalEditorSubmitLabel: editingGoalId ? "Save Changes" : "Create Goal",
    goalEditorTitle: editingGoalId ? "Edit Goal" : "Add Goal",
    isGoalModalVisible,
    isGoalSaving,
    closeGoalEditor,
    openCreateGoalEditor,
    openEditGoalEditor,
    submitGoal,
  };
}
