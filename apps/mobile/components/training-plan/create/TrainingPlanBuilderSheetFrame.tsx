import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { AppBottomSheet } from "@/components/shared/AppBottomSheet";
import type { BuilderSheet } from "@/components/training-plan/create/BuilderSheetTypes";
import { useTrainingPlanBuilderSheetDrafts } from "@/components/training-plan/create/TrainingPlanBuilderSheetContent";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";

type TrainingPlanBuilderService = ReturnType<typeof useTrainingPlanCreationService>;

type TrainingPlanBuilderSheetFrameProps = {
  activeSheet: BuilderSheet | null;
  builder: TrainingPlanBuilderService;
  canGoBack: boolean;
  children: ReactNode;
  closeSheet: () => void;
  contentKey: string;
  contentMode?: "scroll" | "custom";
  description?: string;
  footer: ReactNode;
  goBackSheet: () => void;
  hasSaveAction: boolean;
  headerActionLabel: string;
  headerContent?: ReactNode;
  showTitleHeader?: boolean;
  initialSnapIndex?: number;
  snapPoints?: string[];
  title: string;
};

export function TrainingPlanBuilderSheetFrame({
  activeSheet,
  builder,
  canGoBack,
  children,
  closeSheet,
  contentKey,
  contentMode,
  description,
  footer,
  goBackSheet,
  hasSaveAction,
  headerActionLabel,
  headerContent,
  initialSnapIndex,
  showTitleHeader,
  snapPoints,
  title,
}: TrainingPlanBuilderSheetFrameProps) {
  const sheetDrafts = useTrainingPlanBuilderSheetDrafts();

  const cancelSheet = () => {
    sheetDrafts.cancelSheetDrafts();
    closeSheet();
  };

  const cancelNestedSheet = () => {
    sheetDrafts.cancelDraftForSheet(activeSheet);
    goBackSheet();
  };

  const saveSheet = () => {
    if (activeSheet === "activityFilters") {
      sheetDrafts.applyActivityFiltersDraft();
      goBackSheet();
      return;
    }

    if (activeSheet === "profileGoalCreate") {
      if (sheetDrafts.saveProfileGoalDraft(builder.actions.addLocalGoal)) {
        goBackSheet();
      }
      return;
    }

    if (activeSheet === "preferences") {
      sheetDrafts.applyPlanningPreferencesDraft();
      closeSheet();
      return;
    }

    closeSheet();
  };

  return (
    <AppBottomSheet
      visible={activeSheet !== null}
      contentKey={contentKey}
      contentMode={contentMode}
      title={title}
      description={description}
      onBack={canGoBack ? cancelNestedSheet : undefined}
      onClose={cancelSheet}
      headerAction={
        hasSaveAction ? (
          <Button
            disabled={activeSheet === "profileGoalCreate" && !sheetDrafts.canSaveProfileGoal}
            size="sm"
            variant="ghost"
            onPress={saveSheet}
            testID="training-plan-builder-sheet-save"
          >
            <Text className="text-foreground">{headerActionLabel}</Text>
          </Button>
        ) : undefined
      }
      headerContent={headerContent}
      initialSnapIndex={initialSnapIndex}
      showTitleHeader={showTitleHeader}
      snapPoints={snapPoints}
      footer={footer}
      testID="training-plan-builder-sheet"
    >
      {children}
    </AppBottomSheet>
  );
}
