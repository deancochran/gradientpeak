import { Button } from "@repo/ui/components/button";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { AppBottomSheet } from "@/components/shared/AppBottomSheet";

type TrainingPreferencesBottomSheetProps = {
  children: ReactNode;
  description?: string;
  isResetDisabled?: boolean;
  isSaveDisabled?: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveLoadingLabel?: string;
  title?: string;
  visible: boolean;
};

export function TrainingPreferencesBottomSheet({
  children,
  description = "Tune how GradientPeak plans your training. Reset restores the values from when this sheet opened.",
  isResetDisabled = false,
  isSaveDisabled = false,
  isSaving = false,
  onClose,
  onReset,
  onSave,
  saveLabel = "Save",
  saveLoadingLabel = "Saving...",
  title = "Training preferences",
  visible,
}: TrainingPreferencesBottomSheetProps) {
  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      description={description}
      onClose={onClose}
      contentKey={visible ? "training-preferences-open" : "training-preferences-closed"}
      snapPoints={["88%", "96%"]}
      footer={
        <View className="flex-row gap-3">
          <Button
            className="flex-1"
            disabled={isResetDisabled || isSaving}
            onPress={onReset}
            testID="training-preferences-reset-button"
            variant="outline"
          >
            <Text className="text-sm font-medium text-foreground">Reset</Text>
          </Button>
          <LoadingButton
            className="flex-1"
            disabled={isSaveDisabled}
            loading={isSaving}
            loadingLabel={saveLoadingLabel}
            onPress={onSave}
            testID="training-preferences-save-button"
          >
            <Text className="text-sm font-semibold text-primary-foreground">{saveLabel}</Text>
          </LoadingButton>
        </View>
      }
      testID="training-preferences-bottom-sheet"
    >
      {children}
    </AppBottomSheet>
  );
}
