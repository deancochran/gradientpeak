import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import {
  buildGoalTrajectoryAnswer,
  type PlanGoalProgressResult,
} from "./planDashboardPresentation";

type Goal = NonNullable<
  inferRouterOutputs<AppRouter>["athleteIntelligence"]["getGoalPortfolio"]["selectedGoal"]
>;

function attentionStatement(status: PlanGoalProgressResult["status"] | undefined) {
  switch (status) {
    case "action_needed":
      return "Review recovery and planned intensity before adding more load.";
    case "watch":
      return "Keep the next quality session under review and reassess afterward.";
    case "insufficient":
      return "Complete a comparable assessment to establish a reliable trajectory.";
    case "unsupported":
      return "Open this goal to review the evidence that can support it.";
    case "achieved":
      return "Maintain the current progression while protecting recovery.";
    case "on_track":
      return "Continue the planned progression and reassess after key sessions.";
    default:
      return "Goal evidence is still being updated.";
  }
}

export function PlanGoalTrajectory({
  coherenceLabel,
  markersTruncated = false,
  onCreateGoal,
  onOpenGoal,
  onOpenGoals,
  portfolioError,
  portfolioLoading,
  progress,
  progressError,
  progressLoading,
  readinessLoading = false,
  readinessStatus,
  selectedGoal,
  totalGoalCount,
}: {
  coherenceLabel: string | null;
  markersTruncated?: boolean;
  onCreateGoal: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGoals: () => void;
  portfolioError: boolean;
  portfolioLoading: boolean;
  progress: PlanGoalProgressResult | null | undefined;
  progressError: boolean;
  progressLoading: boolean;
  readinessLoading?: boolean;
  readinessStatus?: "not_ready" | "ready" | "watch" | null;
  selectedGoal: Goal | null;
  totalGoalCount: number | null;
}) {
  const answer = buildGoalTrajectoryAnswer(progress);
  const trajectory = progressLoading
    ? "Checking trajectory"
    : progressError
      ? "Trajectory unavailable"
      : answer.headline;
  const readiness = readinessLoading
    ? "checking"
    : readinessStatus
      ? readinessStatus.replaceAll("_", " ")
      : "unavailable";
  const attention = attentionStatement(progress?.status);
  const emptyPortfolio = totalGoalCount === 0;
  const showCreate = !portfolioLoading && !portfolioError && emptyPortfolio;
  const emptyHeading = portfolioLoading
    ? "Finding your priority goal"
    : portfolioError
      ? "Goal portfolio unavailable"
      : emptyPortfolio
        ? "Set your next objective"
        : "No active goals";
  const emptySupportingText = portfolioLoading
    ? "Your goal trajectory will appear when the portfolio is ready."
    : portfolioError
      ? "Open Goals to review your saved objectives."
      : emptyPortfolio
        ? "Add a goal to connect training trends to a target and date."
        : "Your saved goals are past their target date. Open Goals to review them.";

  return (
    <View className="gap-3" testID="plan-goal-trajectory">
      {selectedGoal ? (
        <View className="gap-2">
          <View className="flex-row items-start gap-2">
            <TouchableOpacity
              accessibilityLabel={`Priority active goal ${selectedGoal.title}. Target date ${selectedGoal.targetDate}. ${trajectory}. Readiness ${readiness}. ${attention}. ${coherenceLabel ?? "Goal signal freshness unavailable."}`}
              accessibilityRole="button"
              className="min-w-0 flex-1 gap-2 rounded-2xl border border-border bg-card p-4"
              onPress={() => onOpenGoal(selectedGoal.id)}
              testID="plan-selected-goal"
            >
              <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
                Priority active goal
              </Text>
              <Text className="text-xl font-semibold text-foreground">{selectedGoal.title}</Text>
              <Text className="text-sm text-muted-foreground">
                Target date: {selectedGoal.targetDate}
              </Text>
              <View className="gap-1 border-t border-border pt-2">
                <Text className="text-sm font-semibold text-foreground">{trajectory}</Text>
                <Text className="text-sm text-muted-foreground">Readiness: {readiness}</Text>
                <Text className="text-sm text-muted-foreground">{attention}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Open all goals"
              accessibilityRole="button"
              className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
              onPress={onOpenGoals}
              testID="plan-view-goals"
            >
              <Text className="text-xs font-semibold text-primary">All</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-xs text-muted-foreground" testID="plan-goal-signal-freshness">
            {coherenceLabel ?? "Goal signal freshness unavailable"}
          </Text>
        </View>
      ) : (
        <View
          accessibilityLabel={
            portfolioLoading
              ? "Goal portfolio loading"
              : portfolioError
                ? "Goal portfolio unavailable"
                : emptyHeading
          }
          accessibilityRole={
            portfolioLoading ? "progressbar" : portfolioError ? "alert" : undefined
          }
          className="flex-row items-center gap-3"
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xl font-semibold text-foreground">{emptyHeading}</Text>
            <Text className="text-sm text-muted-foreground">{emptySupportingText}</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel={showCreate ? "Add a goal" : "Open all goals"}
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
            onPress={showCreate ? onCreateGoal : onOpenGoals}
            testID="plan-view-goals"
          >
            <Text className="text-sm font-semibold text-primary">{showCreate ? "Add" : "All"}</Text>
          </TouchableOpacity>
        </View>
      )}
      {markersTruncated ? (
        <Text className="text-xs text-muted-foreground" testID="plan-goal-marker-limit">
          More goals exist. Open Goals to view the full list.
        </Text>
      ) : null}
    </View>
  );
}
