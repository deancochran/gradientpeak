import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { ScrollView, View } from "react-native";
import type { TrainingPathChartSectionContext } from "@/components/plan/training-path/TrainingPathLoadChartSection";
import { BuilderScheduleEditor } from "@/components/training-plan/create/BuilderScheduleEditor";
import { BuilderStrategyComposer } from "@/components/training-plan/create/BuilderStrategyComposer";
import { useScheduleEditorController } from "@/components/training-plan/create/useScheduleEditorController";
import { useStrategyComposerController } from "@/components/training-plan/create/useStrategyComposerController";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

type TrainingPlanBuilderSurfacesProps = {
  controller: TrainingPlanBuilderController;
};

export function TrainingPlanBuilderSurfaces({ controller }: TrainingPlanBuilderSurfacesProps) {
  const scheduleEditor = useScheduleEditorController(controller);
  const strategyComposer = useStrategyComposerController(controller);
  const contextQueries = [
    controller.builder.queries.profile,
    controller.builder.queries.profileMetrics,
    controller.builder.queries.activityEfforts,
    controller.builder.currentTrainingStatusQuery,
  ];
  const hasContextError = contextQueries.some((query) => query.isError);
  const previewError = controller.builder.derived.backendPlanningPreview.error;
  const renderSelectedDayPanel = (context: TrainingPathChartSectionContext) => (
    <View className="mx-2">
      <BuilderScheduleEditor
        {...scheduleEditor}
        selectedDayPointOverride={context.selectedDayPoint}
        showChart={false}
      />
    </View>
  );

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-4 py-3 pb-10">
      <View className="gap-5">
        {hasContextError ? (
          <QueryNotice
            detail="Some athlete context could not be loaded. You can keep building with local inputs."
            label="Athlete context unavailable"
            onRetry={() => {
              for (const query of contextQueries) void query.refetch();
            }}
          />
        ) : null}
        {previewError ? (
          <QueryNotice
            detail="The advisory backend preview could not refresh. Local plan checks remain available and saving is not blocked."
            label="Preview unavailable"
            onRetry={() => void controller.builder.backendPlanningPreviewQuery.refetch()}
          />
        ) : null}
        <BuilderStrategyComposer {...strategyComposer} renderBelowChart={renderSelectedDayPanel} />
      </View>
    </ScrollView>
  );
}

function QueryNotice({
  detail,
  label,
  onRetry,
}: {
  detail: string;
  label: string;
  onRetry: () => void;
}) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3" accessibilityRole="alert">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Text className="text-xs leading-4 text-muted-foreground">{detail}</Text>
      <Button
        accessibilityLabel={`Retry ${label.toLowerCase()}`}
        className="min-h-11 self-start"
        size="sm"
        variant="outline"
        onPress={onRetry}
      >
        <Text>Retry</Text>
      </Button>
    </View>
  );
}
