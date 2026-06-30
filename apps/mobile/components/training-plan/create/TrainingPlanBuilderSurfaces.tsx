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
        <BuilderStrategyComposer {...strategyComposer} renderBelowChart={renderSelectedDayPanel} />
      </View>
    </ScrollView>
  );
}
