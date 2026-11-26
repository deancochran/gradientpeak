import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { APP_BOTTOM_SHEET_PRESENTATIONS } from "@/components/shared/AppBottomSheet";
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
  type TrainingPlanBuilderSheetState,
  useTrainingPlanBuilderSheetState,
} from "@/components/training-plan/create/TrainingPlanBuilderSheetContent";
import { TrainingPlanBuilderSheetFrame } from "@/components/training-plan/create/TrainingPlanBuilderSheetFrame";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import { omitUndefined } from "@/lib/omitUndefined";

type TrainingPlanBuilderSheetsProps = {
  controller: TrainingPlanBuilderController;
};

export function getBuilderSheetPresentation(activeSheet: BuilderSheet | null) {
  if (activeSheet === "activityFilters") {
    return APP_BOTTOM_SHEET_PRESENTATIONS.filter;
  }

  if (activeSheet === "activityAssignment") {
    return APP_BOTTOM_SHEET_PRESENTATIONS.browser;
  }

  return APP_BOTTOM_SHEET_PRESENTATIONS.inspector;
}

function ActivityFiltersFooter({
  sheetState: sheetDrafts,
}: {
  sheetState: TrainingPlanBuilderSheetState;
}) {
  return (
    <View className="flex-row gap-3">
      <Button
        className="min-h-11 flex-1"
        disabled={!sheetDrafts.canResetActivityFilters}
        onPress={sheetDrafts.resetActivityFiltersDraft}
        variant="outline"
      >
        <Text>Clear filters</Text>
      </Button>
    </View>
  );
}

function PlanningPreferencesFooter({
  sheetState: sheetDrafts,
}: {
  sheetState: TrainingPlanBuilderSheetState;
}) {
  return (
    <View className="flex-row gap-3">
      <Button
        className="min-h-11 flex-1"
        disabled={!sheetDrafts.canResetPlanningPreferences}
        onPress={() => sheetDrafts.cancelDraftForSheet("preferences")}
        variant="outline"
      >
        <Text>Revert changes</Text>
      </Button>
    </View>
  );
}

export function TrainingPlanBuilderSheets({ controller }: TrainingPlanBuilderSheetsProps) {
  // Closing the stack ends the editing lifetime, including raw invalid inputs.
  if (controller.sheetStack.activeSheet === null) return null;
  return <OpenTrainingPlanBuilderSheets controller={controller} />;
}

function OpenTrainingPlanBuilderSheets({ controller }: TrainingPlanBuilderSheetsProps) {
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
  const errorKeys = useRef(new Set<string>());
  const setError = controller.numericDrafts.setError;
  const reportError = useCallback(
    (key: string, message: string | null) => {
      if (message === null) errorKeys.current.delete(key);
      else errorKeys.current.add(key);
      setError(key, message);
    },
    [setError],
  );
  useEffect(
    () => () => {
      for (const key of errorKeys.current) setError(key, null);
      errorKeys.current.clear();
    },
    [setError],
  );
  const sheetState = useTrainingPlanBuilderSheetState({
    activeSheet,
    activityPlanCategoryFilter: activityPicker.categoryFilter,
    activityPlanSort: activityPicker.sort,
    planPreferences: sheets.planPreferences,
    planMetadata: builder.state.details,
    onApplyActivityFilters: activityPicker.applyFiltersDraft,
    onApplyPlanningPreferences: builder.actions.updatePlanningPreferences,
    onApplyMetadata: builder.actions.updateDetails,
    onNumericDraftError: reportError,
  });

  return (
    <TrainingPlanBuilderSheetFrame
      {...omitUndefined({ description: sheetDescription })}
      sheetState={sheetState}
      isPending={builder.derived.savePlan.isLocked}
      activeSheet={activeSheet}
      canGoBack={canGoBack}
      closeSheet={closeBuilderSheet}
      contentKey={activeSheet ?? "closed"}
      contentMode={
        activeSheet === "activityAssignment" || activeSheet === "session" ? "custom" : "scroll"
      }
      customHeaderInLayout={activeSheet === "activityAssignment" || activeSheet === "session"}
      footer={
        activeSheet === "activityFilters" ? (
          <ActivityFiltersFooter sheetState={sheetState} />
        ) : activeSheet === "preferences" ? (
          <PlanningPreferencesFooter sheetState={sheetState} />
        ) : null
      }
      goBackSheet={goBackSheet}
      headerActionLabel={sheetActionLabel}
      hasSaveAction={sheetHasSaveAction}
      {...(activeSheet === "activityAssignment"
        ? {
            headerContent: (
              <BuilderActivityAssignmentSheetHeader
                activityPlanSort={activityPicker.sort}
                categoryFilter={activityPicker.categoryFilter}
                onClearSearch={() => activityPicker.setSearchQuery("")}
                onOpenFilters={() => pushSheet("activityFilters")}
                onSearchChange={activityPicker.setSearchQuery}
                searchQuery={activityPicker.searchQuery}
              />
            ),
          }
        : {})}
      showTitleHeader
      showCloseAction
      initialSnapIndex={sheetPresentation.initialSnapIndex}
      snapPoints={sheetPresentation.snapPoints}
      title={sheetTitle}
    >
      <TrainingPlanBuilderSheetContent
        sheetState={sheetState}
        activeSheet={activeSheet}
        activityPlanCategoryFilter={activityPicker.categoryFilter}
        activityPlanEstimateById={activityPicker.estimateById}
        activityPlanSearchQuery={activityPicker.searchQuery}
        activityPlanSort={activityPicker.sort}
        activityPlansById={activityPicker.plansById}
        builder={builder}
        goBackSheet={goBackSheet}
        onSelectActivityPlan={activityPicker.selectPlan}
        onRemoveSession={controller.actions.confirmRemoveSession}
        onNumericDraftError={reportError}
        pushSheet={pushSheet}
        selectedSessionId={selection.sessionId}
        setActivityPlanSearchQuery={activityPicker.setSearchQuery}
        setSelectedSessionId={selection.setSessionId}
      />
    </TrainingPlanBuilderSheetFrame>
  );
}
