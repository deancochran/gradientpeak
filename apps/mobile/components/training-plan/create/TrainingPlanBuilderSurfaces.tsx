import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { ScrollView, View } from "react-native";
import {
  BuilderActivityAssignmentSheetContent,
  BuilderActivityAssignmentSheetHeader,
} from "@/components/training-plan/create/BuilderActivityAssignmentSheetContent";
import { BuilderAuthoritativeProjectionCard } from "@/components/training-plan/create/BuilderAuthoritativeProjectionCard";
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
  const contextQueries = [controller.builder.queries.creationContext];
  const hasContextError = contextQueries.some((query) => query.isError);
  const previewError = controller.builder.derived.backendPlanningPreview.error;
  if (controller.sheetStack.activeSheet === "activityAssignment") {
    const { activityPicker } = controller;
    const { activityPlansQuery, activityPlanItems } = controller.builder;
    return (
      <View className="flex-1 bg-background" testID="builder-activity-picker-screen">
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Button
            accessibilityLabel="Close activity picker"
            onPress={() => {
              controller.actions.cancelPendingSessionDraft();
              controller.sheetStack.closeSheet();
            }}
            size="sm"
            variant="ghost"
          >
            <Text>Back</Text>
          </Button>
          <Text className="flex-1 text-lg font-semibold text-foreground">Choose activity</Text>
        </View>
        <View className="px-4 pt-3">
          <BuilderActivityAssignmentSheetHeader
            activityPlanSort={activityPicker.sort}
            categoryFilter={activityPicker.categoryFilter}
            onClearSearch={() => activityPicker.setSearchQuery("")}
            onOpenFilters={() => controller.sheetStack.pushSheet("activityFilters")}
            onSearchChange={activityPicker.setSearchQuery}
            searchQuery={activityPicker.searchQuery}
          />
        </View>
        <BuilderActivityAssignmentSheetContent
          activityPlanEstimateById={activityPicker.estimateById}
          activityPlanItems={activityPlanItems}
          activityPlanSort={activityPicker.sort}
          categoryFilter={activityPicker.categoryFilter}
          hasNextPage={activityPlansQuery.hasNextPage}
          isFetchingNextPage={activityPlansQuery.isFetchingNextPage}
          isLoading={activityPlansQuery.isLoading}
          onClearSearch={() => activityPicker.setSearchQuery("")}
          onFetchNextPage={() => void activityPlansQuery.fetchNextPage()}
          onOpenFilters={() => controller.sheetStack.pushSheet("activityFilters")}
          onSearchChange={activityPicker.setSearchQuery}
          onSelectActivityPlan={activityPicker.selectPlan}
          searchQuery={activityPicker.searchQuery}
        />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-4 py-3 pb-10">
      <View className="gap-5">
        {hasContextError ? (
          <QueryNotice
            detail="Some athlete context could not be loaded. You can keep editing the plan."
            label="Athlete context unavailable"
            onRetry={() => {
              for (const query of contextQueries) void query.refetch();
            }}
          />
        ) : null}
        {previewError ? (
          <QueryNotice
            detail="The authoritative server preview could not refresh. Saving waits for a current server projection."
            label="Preview unavailable"
            onRetry={() => void controller.builder.backendPlanningPreviewQuery.refetch()}
          />
        ) : null}
        {controller.builder.derived.projectionConflict ? (
          <QueryNotice
            detail={controller.builder.derived.projectionConflict}
            label="Plan validation conflict"
            onRetry={() => void controller.actions.handleSave()}
          />
        ) : null}
        <BuilderAuthoritativeProjectionCard
          onRetry={() => {
            void controller.builder.queries.publishedState.refetch();
            void controller.builder.backendPlanningPreviewQuery.refetch();
          }}
          projection={controller.builder.derived.authoritativeProjectionState}
        />
        <BuilderStrategyComposer {...strategyComposer} />
        <BuilderScheduleEditor {...scheduleEditor} />
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
