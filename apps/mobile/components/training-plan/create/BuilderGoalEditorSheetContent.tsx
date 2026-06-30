import { buildGoalCreatePayload, createEmptyGoalDraft, type GoalEditorDraft } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Plus, X } from "lucide-react-native";
import { useMemo } from "react";
import { Alert, Pressable, View } from "react-native";
import { GoalEditorForm } from "@/components/goals";
import { GoalListItem } from "@/components/plan/GoalListItem";
import { PlanningGoalCard } from "@/components/training-plan/PlanningGoalCard";
import { diffDateOnlyDays } from "@/lib/training-plan-creation/date-utils";
import type {
  TrainingPlanBuilderGoalBlueprint,
  TrainingPlanBuilderGoalContext,
} from "@/lib/training-plan-creation/types";

export interface BuilderGoalProfileGoal {
  id: string;
  title: string;
  target_date?: string | null;
  priority?: number | null;
  activity_category?: "run" | "bike" | "swim" | "other" | null;
  objective?: TrainingPlanBuilderGoalBlueprint["objective"];
}

type BuilderGoalEditorContentProps = {
  goalContext: TrainingPlanBuilderGoalContext;
  profileGoals: BuilderGoalProfileGoal[];
  isLoadingProfileGoals?: boolean;
  onCreateLocalGoal: () => void;
  onCreateProfileGoal?: () => void;
  onRemoveLocalGoal: (goalId: string) => void;
  onRemoveSelectedGoal: (sourceProfileGoalId: string) => void;
  onToggleSelectedGoal: (goal: BuilderGoalProfileGoal) => void;
};

function NewGoalListItem({
  goal,
  onRemove,
}: {
  goal: TrainingPlanBuilderGoalBlueprint;
  onRemove: () => void;
}) {
  return (
    <PlanningGoalCard
      goal={goal}
      onRemove={onRemove}
      testID={`builder-local-goal-${goal.localId}`}
      variant="compact"
    />
  );
}

export function BuilderGoalEditorContent({
  goalContext,
  profileGoals,
  isLoadingProfileGoals = false,
  onCreateLocalGoal,
  onCreateProfileGoal,
  onRemoveLocalGoal,
  onRemoveSelectedGoal,
  onToggleSelectedGoal,
}: BuilderGoalEditorContentProps) {
  const selectedGoalIds = new Set(
    goalContext.selectedGoals.flatMap((goal) =>
      goal.sourceProfileGoalId ? [goal.sourceProfileGoalId] : [],
    ),
  );
  const localGoals = goalContext.selectedGoals.filter((goal) => !goal.sourceProfileGoalId);

  return (
    <View className="gap-4" testID="builder-goal-editor-modal">
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-foreground">This plan</Text>
          <Button size="sm" onPress={onCreateLocalGoal} testID="builder-create-plan-goal">
            <Plus size={14} className="text-primary-foreground" />
            <Text>Goal</Text>
          </Button>
        </View>

        {localGoals.length > 0 ? (
          <View className="gap-2">
            {localGoals.map((goal) => (
              <NewGoalListItem
                key={goal.localId}
                goal={goal}
                onRemove={() => onRemoveLocalGoal(goal.localId)}
              />
            ))}
          </View>
        ) : (
          <Text className="text-xs leading-4 text-muted-foreground">No plan-only goals.</Text>
        )}
      </View>

      <View className="gap-3 border-t border-border pt-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-foreground">From profile</Text>
          {onCreateProfileGoal ? (
            <Button size="sm" variant="ghost" onPress={onCreateProfileGoal}>
              <Plus size={14} className="text-foreground" />
              <Text className="text-foreground">New profile goal</Text>
            </Button>
          ) : null}
        </View>

        {isLoadingProfileGoals ? (
          <Text className="text-sm text-muted-foreground">Loading goals...</Text>
        ) : profileGoals.length > 0 ? (
          <View className="gap-2">
            {profileGoals.map((goal) => {
              const isSelected = selectedGoalIds.has(goal.id);
              return (
                <View key={goal.id} className="relative">
                  <GoalListItem
                    goal={goal}
                    label={isSelected ? "Selected" : "Profile goal"}
                    onPress={() => onToggleSelectedGoal(goal)}
                    testID={`builder-goal-select-${goal.id}`}
                  />
                  {isSelected ? (
                    <View className="absolute right-2 top-2">
                      <Button
                        accessibilityLabel="Remove goal from plan"
                        className="h-8 w-8 p-0"
                        size="sm"
                        variant="ghost"
                        onPress={() => onRemoveSelectedGoal(goal.id)}
                      >
                        <X size={14} className="text-muted-foreground" />
                      </Button>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View className="gap-2 rounded-xl border border-dashed border-border bg-background p-3">
            <Text className="text-sm font-medium text-foreground">No profile goals yet</Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              Add one to reuse across plans.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function BuilderLocalGoalCreateContent({
  onSave,
  planStartDate,
}: {
  onSave: (goal: Omit<TrainingPlanBuilderGoalBlueprint, "localId">) => void;
  planStartDate: string;
}) {
  const initialDraft = useMemo(
    () => ({
      ...createEmptyGoalDraft(),
      targetDate: planStartDate,
    }),
    [planStartDate],
  );

  const save = (draft: GoalEditorDraft) => {
    try {
      const payload = buildGoalCreatePayload({
        draft,
        profileId: "00000000-0000-0000-0000-000000000000",
      });
      onSave({
        title: payload.title,
        targetDate: payload.target_date,
        targetOffsetDays: Math.max(0, diffDateOnlyDays(planStartDate, payload.target_date)),
        priority: payload.priority,
        activityCategory: payload.activity_category,
        objective: payload.target_payload,
      });
    } catch (error) {
      Alert.alert(
        "Unable to add goal",
        error instanceof Error ? error.message : "Please check the goal details and try again.",
      );
    }
  };

  return (
    <View className="gap-4" testID="builder-local-goal-create-form">
      <GoalEditorForm initialValue={initialDraft} submitLabel="Add to plan" onSubmit={save} />
    </View>
  );
}
