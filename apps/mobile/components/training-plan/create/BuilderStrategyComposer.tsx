import { Text } from "@repo/ui/components/text";
import { type Dumbbell, Flag, SlidersHorizontal, User } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import type { TrainingPlanBuilderState } from "@/lib/training-plan-creation/types";

type BuilderStrategyComposerProps = {
  state: TrainingPlanBuilderState;
  chartReview: TrainingPlanBuilderController["chartReview"];
  onEditMetadata?: () => void;
  onOpenAthleteContext?: () => void;
  onOpenGoals?: () => void;
  onOpenPlanningConstraints?: () => void;
};

export const BuilderStrategyComposer = memo(function BuilderStrategyComposer({
  chartReview,
  onEditMetadata,
  onOpenAthleteContext,
  onOpenGoals,
  onOpenPlanningConstraints,
  state,
}: BuilderStrategyComposerProps) {
  return (
    <View className="flex-1 gap-4" testID="builder-strategy-composer">
      <View className="gap-2">
        <Pressable
          accessibilityRole={onEditMetadata ? "button" : undefined}
          className="rounded-2xl bg-card px-3 py-3"
          disabled={!onEditMetadata}
          onPress={onEditMetadata}
        >
          <View className="min-w-0 flex-1 gap-1.5">
            <Text className="text-2xl font-semibold leading-8 text-foreground" numberOfLines={2}>
              {state.details.name || "Name your plan"}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
              {state.details.description || "Add a description"}
            </Text>
          </View>
        </Pressable>
        <View className="flex-row flex-wrap gap-2 pt-1">
          <PlanningChip icon={Flag} label="Goals" onPress={onOpenGoals} />
          <PlanningChip icon={User} label="Athlete" onPress={onOpenAthleteContext} />
          <PlanningChip
            icon={SlidersHorizontal}
            label="Preferences"
            onPress={onOpenPlanningConstraints}
          />
        </View>
      </View>

      <View className="-mx-2">
        <BuilderTrainingPathReviewSection chartReview={chartReview} />
      </View>
    </View>
  );
});

const PlanningChip = memo(function PlanningChip({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Dumbbell;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      className="max-w-full flex-row items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5"
    >
      <Icon size={12} className="text-muted-foreground" />
      <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});
