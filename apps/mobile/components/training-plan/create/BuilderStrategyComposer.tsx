import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { type ComponentProps, memo } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { BuilderProjectionOverview } from "@/components/training-plan/create/BuilderProjectionOverview";
import type { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";
import { shouldUseAccessibleBuilderLayout } from "@/components/training-plan/create/responsiveLayout";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import type { BuilderPlanningBriefRowViewModel } from "@/lib/training-plan-creation/builder-presentation";
import type { TrainingPlanBuilderState } from "@/lib/training-plan-creation/types";

type BuilderStrategyComposerProps = {
  state: TrainingPlanBuilderState;
  chartReview: TrainingPlanBuilderController["chartReview"];
  saveReadiness: TrainingPlanBuilderController["builder"]["derived"]["savePlan"]["readiness"];
  planningBriefRows: BuilderPlanningBriefRowViewModel[];
  onAddActivity: () => void;
  onEditMetadata?: () => void;
  onOpenAthleteContext?: () => void;
  onOpenGoals?: () => void;
  onOpenPlanningConstraints?: () => void;
  renderBelowChart?: ComponentProps<typeof BuilderTrainingPathReviewSection>["renderBelowChart"];
};

const CONFIG_ACTIONS = {
  athleteContext: "onOpenAthleteContext",
  goals: "onOpenGoals",
  planningConstraints: "onOpenPlanningConstraints",
} as const;

export const BuilderStrategyComposer = memo(function BuilderStrategyComposer({
  chartReview,
  onAddActivity,
  onEditMetadata,
  onOpenAthleteContext,
  onOpenGoals,
  onOpenPlanningConstraints,
  planningBriefRows,
  renderBelowChart,
  saveReadiness,
  state,
}: BuilderStrategyComposerProps) {
  const actions = { onOpenAthleteContext, onOpenGoals, onOpenPlanningConstraints };
  const scheduleStatus = getScheduleStatus(state);
  const { fontScale, width } = useWindowDimensions();
  const useVerticalLayout = shouldUseAccessibleBuilderLayout({ fontScale, width });
  const planName = state.details.name || "Name your plan";
  const planDescription = state.details.description || "Add a description";
  const accessiblePlanName = state.details.name.trim() || "No name set";
  const accessiblePlanDescription = state.details.description.trim() || "No description set";
  const configurationRows = useVerticalLayout
    ? planningBriefRows.map((row) => [row])
    : [planningBriefRows.slice(0, 2), planningBriefRows.slice(2, 4)];
  return (
    <View className="flex-1 gap-4" testID="builder-strategy-composer">
      <Pressable
        accessibilityLabel={`Edit plan name and description. Current name: ${accessiblePlanName}. Current description: ${accessiblePlanDescription}.`}
        accessibilityRole={onEditMetadata ? "button" : undefined}
        className="min-h-11 gap-0.5"
        disabled={!onEditMetadata}
        onPress={onEditMetadata}
        testID="builder-edit-plan"
      >
        <Text
          className="text-xl font-semibold leading-7 text-foreground"
          numberOfLines={useVerticalLayout ? undefined : 1}
        >
          {planName}
        </Text>
        <Text
          className="text-sm leading-5 text-muted-foreground"
          numberOfLines={useVerticalLayout ? undefined : 1}
        >
          {planDescription}
        </Text>
      </Pressable>
      <View className="gap-2" testID="builder-configuration-grid">
        {configurationRows.map((rows, rowIndex) => (
          <View
            className="flex-row gap-2"
            key={rows.map((row) => row.key).join("-")}
            testID={`builder-configuration-grid-row-${rowIndex + 1}`}
          >
            {rows.map((row) => (
              <ConfigurationTile
                allowWrapping={useVerticalLayout}
                key={row.key}
                row={row}
                scheduleStatus={scheduleStatus}
                onPress={
                  row.key === "schedulePreview" ? undefined : actions[CONFIG_ACTIONS[row.key]]
                }
              />
            ))}
          </View>
        ))}
      </View>
      <View
        className={
          useVerticalLayout
            ? "min-h-11 gap-1"
            : "min-h-11 flex-row items-center justify-between gap-3"
        }
        testID="builder-readiness"
      >
        <Text className="text-sm text-muted-foreground">Plan readiness</Text>
        <Text
          className="text-sm font-semibold text-foreground"
          numberOfLines={useVerticalLayout ? undefined : 1}
        >
          {saveReadiness.label}
        </Text>
      </View>
      <View
        className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}
        testID="builder-schedule-actions"
      >
        <Button className="min-h-11 w-full" onPress={onAddActivity} testID="builder-add-activity">
          <Text>Add activity</Text>
        </Button>
      </View>
      <BuilderProjectionOverview chartReview={chartReview} renderBelowChart={renderBelowChart} />
    </View>
  );
});

function ConfigurationTile({
  allowWrapping,
  onPress,
  row,
  scheduleStatus,
}: {
  allowWrapping: boolean;
  onPress?: () => void;
  row: BuilderPlanningBriefRowViewModel;
  scheduleStatus: ConfigurationStatus;
}) {
  const status = row.key === "schedulePreview" ? scheduleStatus : getConfigurationStatus(row);
  const statusClass =
    status.tone === "ready"
      ? "bg-success"
      : status.tone === "needs-attention"
        ? "bg-destructive"
        : "bg-muted-foreground";
  return (
    <Pressable
      accessibilityLabel={`${row.label}: ${row.value}. ${status.label}`}
      accessibilityRole={onPress ? "button" : undefined}
      className="min-h-11 min-w-0 flex-1 justify-center gap-0.5 rounded-xl border border-border px-2 py-1.5"
      disabled={!onPress}
      onPress={onPress}
      testID={`builder-configuration-${row.key}`}
    >
      <View
        className={
          allowWrapping
            ? "flex-row flex-wrap items-center gap-x-1.5 gap-y-1"
            : "flex-row items-center gap-1.5"
        }
      >
        <View
          className={`h-2.5 w-2.5 rounded-full ${statusClass}`}
          testID={`builder-status-${row.key}`}
        />
        <Text
          className="min-w-0 flex-1 text-sm font-medium text-foreground"
          numberOfLines={allowWrapping ? undefined : 1}
        >
          {shortLabel(row.key)}
        </Text>
        <Text
          className="text-xs font-medium text-muted-foreground"
          numberOfLines={allowWrapping ? undefined : 1}
        >
          {status.label}
        </Text>
      </View>
      <Text className="text-xs text-muted-foreground" numberOfLines={allowWrapping ? undefined : 1}>
        {row.value}
      </Text>
    </Pressable>
  );
}

function shortLabel(key: BuilderPlanningBriefRowViewModel["key"]) {
  if (key === "athleteContext") return "Athlete";
  if (key === "planningConstraints") return "Preferences";
  if (key === "schedulePreview") return "Schedule";
  return "Goals";
}

type ConfigurationStatus = {
  label: "Default" | "Needs assignment" | "Needs setup" | "Optional" | "Ready";
  tone: "needs-attention" | "optional" | "ready";
};
function getConfigurationStatus(row: BuilderPlanningBriefRowViewModel): ConfigurationStatus {
  if (row.key === "goals" && row.value === "No goals selected")
    return { label: "Optional", tone: "optional" };
  if (row.key === "planningConstraints" && row.value === "No constraints selected")
    return { label: "Optional", tone: "optional" };
  if (row.key === "athleteContext" && row.value === "Using current profile defaults")
    return { label: "Default", tone: "ready" };
  return { label: "Ready", tone: "ready" };
}
function getScheduleStatus(state: TrainingPlanBuilderState): ConfigurationStatus {
  if (state.structure.sessions.length === 0)
    return { label: "Needs setup", tone: "needs-attention" };
  if (state.structure.sessions.some((session) => session.activityPlan === null))
    return { label: "Needs assignment", tone: "needs-attention" };
  return { label: "Ready", tone: "ready" };
}
