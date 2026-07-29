import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { AppBottomSheet } from "@/components/shared/AppBottomSheet";
import type { BuilderSheet } from "@/components/training-plan/create/BuilderSheetTypes";
import { useTrainingPlanBuilderSheetDrafts } from "@/components/training-plan/create/TrainingPlanBuilderSheetContent";

type TrainingPlanBuilderSheetFrameProps = {
  activeSheet: BuilderSheet | null;
  canGoBack: boolean;
  children: ReactNode;
  closeSheet: () => void;
  contentKey: string;
  contentMode?: "scroll" | "custom";
  customHeaderInLayout?: boolean;
  description?: string;
  footer: ReactNode;
  goBackSheet: () => void;
  hasSaveAction: boolean;
  headerActionLabel: string;
  headerContent?: ReactNode;
  showTitleHeader?: boolean;
  showCloseAction?: boolean;
  initialSnapIndex?: number;
  snapPoints?: string[];
  title: string;
};

export function TrainingPlanBuilderSheetFrame({
  activeSheet,
  canGoBack,
  children,
  closeSheet,
  contentKey,
  contentMode,
  customHeaderInLayout,
  description,
  footer,
  goBackSheet,
  hasSaveAction,
  headerActionLabel,
  headerContent,
  initialSnapIndex,
  showTitleHeader,
  showCloseAction,
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

    if (activeSheet === "preferences") {
      sheetDrafts.applyPlanningPreferencesDraft();
      closeSheet();
      return;
    }

    if (activeSheet === "metadata") {
      if (sheetDrafts.applyMetadataDraft()) {
        closeSheet();
      }
      return;
    }

    closeSheet();
  };

  return (
    <AppBottomSheet
      visible={activeSheet !== null}
      contentKey={contentKey}
      contentMode={contentMode}
      customHeaderInLayout={customHeaderInLayout}
      title={title}
      description={description}
      onBack={canGoBack ? cancelNestedSheet : undefined}
      onClose={cancelSheet}
      headerAction={
        hasSaveAction ? (
          <Button
            disabled={
              (activeSheet === "preferences" &&
                (!sheetDrafts.canResetPlanningPreferences ||
                  !sheetDrafts.canSavePlanningPreferences)) ||
              (activeSheet === "metadata" && !sheetDrafts.canSaveMetadata)
            }
            className="min-h-11 px-3"
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
      showCloseAction={showCloseAction}
      snapPoints={snapPoints}
      footer={footer}
      testID="training-plan-builder-sheet"
    >
      {children}
    </AppBottomSheet>
  );
}
