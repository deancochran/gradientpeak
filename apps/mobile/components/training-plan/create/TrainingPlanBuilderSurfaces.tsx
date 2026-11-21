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
import { TrainingPlanSessionPage } from "@/components/training-plan/create/TrainingPlanSessionPage";
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
  const previewStatus = controller.builder.derived.savePlan.previewLifecycle.status;
  if (controller.sheetStack.activeSheet === "activityAssignment") {
    const { activityPicker } = controller;
    const { activityPlansQuery, activityPlanItems } = controller.builder;
    return (
      <View className="flex-1 bg-background" testID="builder-activity-picker-screen">
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
          metricsById={activityPicker.metricsById}
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
          presentation="screen"
        />
      </View>
    );
  }

  if (controller.sheetStack.activeSheet === "activityFilters") {
    const { activityPicker } = controller;
    return (
      <View className="flex-1 bg-background" testID="builder-activity-filter-screen">
        <ScrollView contentContainerClassName="gap-6 px-4 py-4 pb-10">
          <View className="gap-3">
            <Text className="text-sm font-semibold text-foreground">Sort</Text>
            {[
              ["newest", "Newest"],
              ["oldest", "Oldest"],
              ["name", "Name"],
            ].map(([value, label]) => (
              <Button
                key={value}
                onPress={() => activityPicker.setSort(value as typeof activityPicker.sort)}
                testID={`training-plan-builder-activity-sort-${value}`}
                variant={activityPicker.sort === value ? "default" : "outline"}
              >
                <Text>{label}</Text>
              </Button>
            ))}
          </View>
          <View className="gap-3">
            <Text className="text-sm font-semibold text-foreground">Activity category</Text>
            {["run", "bike", "swim", "strength", "other"].map((category) => (
              <Button
                key={category}
                onPress={() =>
                  activityPicker.setCategoryFilter(
                    activityPicker.categoryFilter === category
                      ? null
                      : (category as NonNullable<typeof activityPicker.categoryFilter>),
                  )
                }
                testID={`training-plan-builder-activity-filter-activity_category-${category}`}
                variant={activityPicker.categoryFilter === category ? "default" : "outline"}
              >
                <Text>{category}</Text>
              </Button>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (controller.sheetStack.activeSheet === "session" && controller.selection.session) {
    const session = controller.selection.session;
    return (
      <View className="flex-1 bg-background" testID="builder-session-screen">
        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 py-4 pb-10">
          <TrainingPlanSessionPage
            key={session.localId}
            activityPlan={
              session.activityPlan
                ? (controller.activityPicker.plansById[session.activityPlan.id] ?? null)
                : null
            }
            session={session}
            projectionMetrics={controller.creationChart.sessionMetricsById.get(session.localId)}
            forecastExplanation={
              controller.creationChart.forecastIssues?.find((issue) => issue.id === session.id)
                ?.detail
            }
            onChange={controller.builder.actions.updateSession}
            onChangeActivity={controller.actions.openActivityPicker}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-4 py-3 pb-10">
      <View className="gap-5">
        <BuilderStrategyComposer {...strategyComposer} />
        {hasContextError ? (
          <QueryNotice
            detail="Your training history couldn’t load. You can keep editing."
            label="Training history unavailable"
            onRetry={() => {
              for (const query of contextQueries) void query.refetch();
            }}
          />
        ) : null}
        {previewError ? (
          <QueryNotice
            detail="Your draft is still here. Keep editing, then retry before creating the plan."
            label="Couldn’t check this plan"
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
        {controller.numericDrafts.hasInvalid ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            Some activity or plan settings contain invalid values. Reopen the edited activity or
            settings to correct them before saving.
          </Text>
        ) : null}
        <BuilderScheduleEditor {...scheduleEditor} scheduleOnly={controller.mode === "create"} />
        {controller.mode === "create" && previewStatus === "backend_preview_pending" ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
            Checking plan before creating…
          </Text>
        ) : null}
        {controller.mode === "create" && previewStatus === "backend_input_unavailable" ? (
          <Text className="text-sm text-muted-foreground">
            Add an activity to preview your plan. A plan name is required before creating.
          </Text>
        ) : null}
        {controller.mode === "create" && previewStatus === "backend_preview_unavailable" ? (
          <QueryNotice
            label="Plan check unavailable"
            detail="We couldn’t check this plan against your training history. Your draft is unchanged; try again before creating."
            onRetry={() => void controller.builder.backendPlanningPreviewQuery.refetch()}
          />
        ) : null}
        {controller.mode === "edit" ? (
          <BuilderAuthoritativeProjectionCard
            onRetry={() => {
              void controller.builder.queries.publishedState.refetch();
              void controller.builder.backendPlanningPreviewQuery.refetch();
            }}
            projection={controller.builder.derived.authoritativeProjectionState}
          />
        ) : null}
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
