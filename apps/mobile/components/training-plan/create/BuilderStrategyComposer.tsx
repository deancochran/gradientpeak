import { Text } from "@repo/ui/components/text";
import {
  Activity,
  type Dumbbell,
  Flag,
  Settings,
  SlidersHorizontal,
  User,
} from "lucide-react-native";
import { type ComponentProps, memo } from "react";
import { Pressable, View } from "react-native";
import { BuilderProjectionOverview } from "@/components/training-plan/create/BuilderProjectionOverview";
import type { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import type { TrainingPlanBuilderState } from "@/lib/training-plan-creation/types";
import type { BuilderViewModelTarget } from "@/lib/training-plan-creation/view-model";

type BuilderStrategyComposerProps = {
  state: TrainingPlanBuilderState;
  chartReview: TrainingPlanBuilderController["chartReview"];
  savePlan: TrainingPlanBuilderController["builder"]["derived"]["savePlan"];
  modules: TrainingPlanBuilderController["builder"]["derived"]["modules"];
  planChecks: TrainingPlanBuilderController["builder"]["derived"]["builderViewModel"]["planCheckRows"];
  timelineWeeks: TrainingPlanBuilderController["builder"]["derived"]["builderViewModel"]["timelineWeeks"];
  onEditMetadata?: () => void;
  onOpenAthleteContext?: () => void;
  onOpenGoals?: () => void;
  onOpenPlanningConstraints?: () => void;
  onOpenTarget: (target: BuilderViewModelTarget) => void;
  renderBelowChart?: ComponentProps<typeof BuilderTrainingPathReviewSection>["renderBelowChart"];
};

export const BuilderStrategyComposer = memo(function BuilderStrategyComposer({
  chartReview,
  onEditMetadata,
  onOpenAthleteContext,
  onOpenGoals,
  onOpenPlanningConstraints,
  onOpenTarget,
  modules,
  planChecks,
  renderBelowChart,
  savePlan,
  state,
  timelineWeeks,
}: BuilderStrategyComposerProps) {
  const moduleActions = {
    athleteContext: onOpenAthleteContext,
    goals: onOpenGoals,
    preferences: onOpenPlanningConstraints,
    metadata: onEditMetadata,
  };
  const phases = timelineWeeks.filter(
    (week, index) => index === 0 || week.phaseLabel !== timelineWeeks[index - 1]?.phaseLabel,
  );
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
        <View className="flex-row flex-wrap gap-2 pt-1" testID="builder-adaptive-modules">
          {modules.map((module) => (
            <PlanningChip
              key={module.id}
              icon={MODULE_ICONS[module.iconKey]}
              label={module.title}
              status={module.status}
              onPress={module.action ? moduleActions[module.action] : undefined}
            />
          ))}
        </View>
      </View>

      <SaveRouteStatus
        detail={savePlan.readiness.detail}
        label={savePlan.readiness.label}
        status={savePlan.readiness.status}
      />

      {phases.length > 0 ? (
        <View className="gap-2" testID="builder-derived-periodization">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Derived periodization
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {phases.map((week) => (
              <Pressable
                key={`${week.phaseLabel}-${week.weekIndex}`}
                accessibilityLabel={`${week.phaseLabel} phase, starts week ${week.weekIndex + 1}`}
                accessibilityRole="button"
                className="min-h-11 justify-center rounded-full border border-border bg-card px-3"
                onPress={() => onOpenTarget({ type: "week", weekIndex: week.weekIndex })}
              >
                <Text className="text-xs font-medium text-foreground">
                  {week.phaseLabel} · W{week.weekIndex + 1}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {planChecks.length > 0 ? (
        <View className="gap-2" testID="builder-plan-checks">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">Plan checks</Text>
          {planChecks.map((check) => (
            <Pressable
              key={check.key}
              accessibilityLabel={`Review plan check: ${check.message}`}
              accessibilityRole={check.target ? "button" : undefined}
              accessibilityState={{ disabled: !check.target }}
              disabled={!check.target}
              className="min-h-11 justify-center rounded-xl border border-border bg-card px-3 py-2"
              onPress={() => {
                if (check.target) onOpenTarget(check.target);
              }}
            >
              <Text className="text-xs leading-4 text-foreground">{check.message}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <BuilderProjectionOverview chartReview={chartReview} renderBelowChart={renderBelowChart} />
    </View>
  );
});

function SaveRouteStatus({
  detail,
  label,
  status,
}: {
  detail: string;
  label: string;
  status: "blocked" | "pending" | "ready" | "review";
}) {
  const labelClass =
    status === "ready"
      ? "text-xs font-semibold text-success"
      : status === "pending"
        ? "text-xs font-semibold text-muted-foreground"
        : status === "review"
          ? "text-xs font-semibold text-foreground"
          : "text-xs font-semibold text-destructive";

  return (
    <View
      className="gap-1 rounded-2xl border border-border bg-card px-3 py-2.5"
      testID="builder-save-route-status"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          Plan readiness
        </Text>
        <Text className={labelClass}>{label}</Text>
      </View>
      <Text className="text-xs leading-4 text-muted-foreground">{detail}</Text>
    </View>
  );
}

const PlanningChip = memo(function PlanningChip({
  icon: Icon,
  label,
  onPress,
  status,
}: {
  icon: typeof Dumbbell;
  label: string;
  onPress?: () => void;
  status: "empty" | "started" | "ready";
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}, ${status}`}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      className="min-h-11 max-w-full flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2"
    >
      <Icon size={12} className="text-muted-foreground" />
      <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

const MODULE_ICONS = {
  activity: Activity,
  flag: Flag,
  settings: Settings,
  sliders: SlidersHorizontal,
  user: User,
} as const;
