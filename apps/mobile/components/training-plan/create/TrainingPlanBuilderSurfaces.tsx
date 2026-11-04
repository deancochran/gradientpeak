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
import { TrainingPlanBuilderEventEditor } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
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
          <TrainingPlanBuilderEventEditor
            activityPlan={
              session.activityPlan
                ? (controller.activityPicker.plansById[session.activityPlan.id] ?? null)
                : null
            }
            event={session}
            onChange={controller.builder.actions.updateSession}
            onDuplicate={(sessionId) => {
              const duplicate = controller.builder.actions.duplicateSession(sessionId);
              if (duplicate) controller.selection.setSessionId(duplicate.localId);
            }}
            onOpenActivityPicker={controller.actions.openActivityPicker}
            onRemove={controller.actions.confirmRemoveSession}
            onNumericDraftError={controller.numericDrafts.setError}
            rawDrafts={controller.sessionDrafts.rawDrafts}
            onRawDraftChange={controller.sessionDrafts.setRawDraft}
          />
        </ScrollView>
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
        <BuilderStrategyComposer {...strategyComposer} />
        {controller.numericDrafts.hasInvalid ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            Some activity or plan settings contain invalid values. Reopen the edited activity or
            settings to correct them before saving.
          </Text>
        ) : null}
        <BuilderScheduleEditor {...scheduleEditor} />
        <BuilderAuthoritativeProjectionCard
          onRetry={() => {
            void controller.builder.queries.publishedState.refetch();
            void controller.builder.backendPlanningPreviewQuery.refetch();
          }}
          projection={controller.builder.derived.authoritativeProjectionState}
        />
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
