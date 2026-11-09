import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { type ReactNode, useEffect, useRef } from "react";
import { View } from "react-native";
import { AppBottomSheet } from "@/components/shared/AppBottomSheet";
import type { BuilderSheet } from "@/components/training-plan/create/BuilderSheetTypes";
import type { TrainingPlanBuilderSheetState } from "@/components/training-plan/create/TrainingPlanBuilderSheetContent";
import { omitUndefined } from "@/lib/omitUndefined";

type TrainingPlanBuilderSheetFrameProps = {
  sheetState: TrainingPlanBuilderSheetState;
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
  isPending?: boolean;
};

export function TrainingPlanBuilderSheetFrame({
  sheetState: sheetDrafts,
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
  isPending = false,
}: TrainingPlanBuilderSheetFrameProps) {
  const identity = useRef({ sheet: activeSheet });
  if (identity.current.sheet !== activeSheet) identity.current = { sheet: activeSheet };
  const renderedIdentity = identity.current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const cancelSheet = () => {
    if (!mounted.current || renderedIdentity !== identity.current) return;
    identity.current = { sheet: null };
    sheetDrafts.cancelDraftForSheet(activeSheet);
    closeSheet();
  };

  const cancelNestedSheet = () => {
    if (!mounted.current || renderedIdentity !== identity.current) return;
    identity.current = { sheet: null };
    sheetDrafts.cancelDraftForSheet(activeSheet);
    goBackSheet();
  };

  const saveSheet = () => {
    if (!mounted.current || isPending || renderedIdentity !== identity.current) return;
    if (activeSheet === "activityFilters") {
      sheetDrafts.applyActivityFiltersDraft();
      goBackSheet();
      return;
    }

    if (activeSheet === "preferences") {
      if (sheetDrafts.applyPlanningPreferencesDraft()) closeSheet();
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

  if (activeSheet === null) return null;
  return (
    <AppBottomSheet
      {...omitUndefined({
        contentMode,
        customHeaderInLayout,
        description,
        footer,
        headerContent,
        initialSnapIndex,
        isPending,
        onBack: canGoBack ? cancelNestedSheet : undefined,
        showCloseAction,
        showTitleHeader,
        snapPoints,
      })}
      visible={activeSheet !== null}
      contentKey={contentKey}
      title={title}
      onClose={cancelSheet}
      headerAction={
        hasSaveAction ? (
          <Button
            disabled={
              isPending ||
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
      headerContent={
        headerContent !== null && headerContent !== undefined && headerContent !== false ? (
          <View
            pointerEvents={isPending ? "none" : "auto"}
            accessibilityElementsHidden={isPending}
            importantForAccessibility={isPending ? "no-hide-descendants" : "auto"}
          >
            {headerContent}
          </View>
        ) : (
          headerContent
        )
      }
      footer={
        footer !== null && footer !== undefined && footer !== false ? (
          <View
            pointerEvents={isPending ? "none" : "auto"}
            accessibilityElementsHidden={isPending}
            importantForAccessibility={isPending ? "no-hide-descendants" : "auto"}
          >
            {footer}
          </View>
        ) : (
          footer
        )
      }
      testID="training-plan-builder-sheet"
    >
      <View
        pointerEvents={isPending ? "none" : "auto"}
        accessibilityElementsHidden={isPending}
        importantForAccessibility={isPending ? "no-hide-descendants" : "auto"}
        style={contentMode === "custom" ? { flex: 1 } : undefined}
      >
        {children}
      </View>
    </AppBottomSheet>
  );
}
