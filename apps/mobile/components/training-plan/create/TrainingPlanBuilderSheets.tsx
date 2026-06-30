import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { BuilderActivityAssignmentSheetHeader } from "@/components/training-plan/create/BuilderActivityAssignmentSheetContent";
import {
  builderSheetHasSaveAction,
  getBuilderSheetActionLabel,
  getBuilderSheetDescription,
  getBuilderSheetTitle,
} from "@/components/training-plan/create/BuilderSheetConfig";
import type { BuilderSheet } from "@/components/training-plan/create/BuilderSheetTypes";
import {
  TrainingPlanBuilderSheetContent,
  TrainingPlanBuilderSheetDraftsProvider,
  useTrainingPlanBuilderSheetDrafts,
} from "@/components/training-plan/create/TrainingPlanBuilderSheetContent";
import { TrainingPlanBuilderSheetFrame } from "@/components/training-plan/create/TrainingPlanBuilderSheetFrame";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

type TrainingPlanBuilderSheetsProps = {
  controller: TrainingPlanBuilderController;
};

function getBuilderSheetPresentation(activeSheet: BuilderSheet | null) {
  if (activeSheet === "activityFilters") {
    return { initialSnapIndex: 0, snapPoints: ["48%", "72%"] };
  }

  if (activeSheet === "activityAssignment" || activeSheet === "session") {
    return { initialSnapIndex: 1, snapPoints: ["88%", "96%"] };
  }

  if (activeSheet === "profileGoalCreate" || activeSheet === "localGoalCreate") {
    return { initialSnapIndex: 0, snapPoints: ["56%", "82%"] };
  }

  return { initialSnapIndex: 0, snapPoints: ["72%", "96%"] };
}

function ActivityFiltersFooter() {
  const sheetDrafts = useTrainingPlanBuilderSheetDrafts();

  return (
    <View className="flex-row gap-3">
      <Button
        className="flex-1"
        disabled={!sheetDrafts.canResetActivityFilters}
        onPress={sheetDrafts.resetActivityFiltersDraft}
        variant="outline"
      >
        <Text>Reset</Text>
      </Button>
    </View>
  );
}

export function TrainingPlanBuilderSheets({ controller }: TrainingPlanBuilderSheetsProps) {
  const { builder } = controller;
  const { activityPicker, selection } = controller;
  const { sheets } = builder.derived.viewModel;
  const { activeSheet, canGoBack, closeSheet, goBackSheet, pushSheet } = controller.sheetStack;
  const sheetTitle = getBuilderSheetTitle({ activeSheet, selectedSession: selection.session });
  const sheetPresentation = getBuilderSheetPresentation(activeSheet);
  const sheetDescription = getBuilderSheetDescription({
    activeSheet,
    selectedSession: selection.session,
  });
  const sheetHasSaveAction = builderSheetHasSaveAction(activeSheet);
  const sheetActionLabel = getBuilderSheetActionLabel(activeSheet);
  const closeBuilderSheet = () => {
    controller.actions.cancelPendingSessionDraft();
    closeSheet();
  };

  if (!activeSheet) {
    return null;
  }

  return (
    <TrainingPlanBuilderSheetDraftsProvider
      activeSheet={activeSheet}
      activityPlanCategoryFilter={activityPicker.categoryFilter}
      activityPlanSort={activityPicker.sort}
      planningConstraintFields={sheets.planningConstraintFields}
      planPreferences={sheets.planPreferences}
      onApplyActivityFilters={activityPicker.applyFiltersDraft}
      onApplyPlanningPreferences={builder.actions.updatePlanningPreferences}
    >
      <TrainingPlanBuilderSheetFrame
        activeSheet={activeSheet}
        builder={builder}
        canGoBack={canGoBack}
        closeSheet={closeBuilderSheet}
        contentKey={activeSheet ?? "closed"}
        contentMode={
          activeSheet === "activityAssignment" || activeSheet === "session" ? "custom" : "scroll"
        }
        description={sheetDescription}
        footer={activeSheet === "activityFilters" ? <ActivityFiltersFooter /> : null}
        goBackSheet={goBackSheet}
        headerActionLabel={sheetActionLabel}
        hasSaveAction={sheetHasSaveAction}
        headerContent={
          activeSheet === "activityAssignment" ? (
            <BuilderActivityAssignmentSheetHeader
              activityPlanSort={activityPicker.sort}
              categoryFilter={activityPicker.categoryFilter}
              onClearSearch={() => activityPicker.setSearchQuery("")}
              onOpenFilters={() => pushSheet("activityFilters")}
              onSearchChange={activityPicker.setSearchQuery}
              searchQuery={activityPicker.searchQuery}
            />
          ) : undefined
        }
        showTitleHeader={activeSheet !== "activityAssignment" && activeSheet !== "session"}
        initialSnapIndex={sheetPresentation.initialSnapIndex}
        snapPoints={sheetPresentation.snapPoints}
        title={sheetTitle}
      >
        <TrainingPlanBuilderSheetContent
          activeSheet={activeSheet}
          activityPlanCategoryFilter={activityPicker.categoryFilter}
          activityPlanEstimateById={activityPicker.estimateById}
          activityPlanSearchQuery={activityPicker.searchQuery}
          activityPlanSort={activityPicker.sort}
          activityPlansById={activityPicker.plansById}
          builder={builder}
          goBackSheet={goBackSheet}
          onSelectActivityPlan={activityPicker.selectPlan}
          pushSheet={pushSheet}
          selectedSessionId={selection.sessionId}
          setActivityPlanSearchQuery={activityPicker.setSearchQuery}
          setSelectedSessionId={selection.setSessionId}
        />
      </TrainingPlanBuilderSheetFrame>
    </TrainingPlanBuilderSheetDraftsProvider>
  );
}
