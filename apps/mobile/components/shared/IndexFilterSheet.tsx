import { Text } from "@repo/ui/components/text";
import type React from "react";
import { TouchableOpacity, View } from "react-native";
import { AppBottomSheet } from "./AppBottomSheet";

interface IndexFilterSheetProps {
  visible: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  isResetDisabled?: boolean;
  isApplyDisabled?: boolean;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
  testID: string;
}

const INDEX_FILTER_SHEET_SNAP_POINTS = ["78%"];

export function IndexFilterSheet({
  visible,
  title,
  description,
  children,
  isResetDisabled = false,
  isApplyDisabled = false,
  onReset,
  onApply,
  onClose,
  testID,
}: IndexFilterSheetProps) {
  const footer = (
    <View className="flex-row gap-3">
      <TouchableOpacity
        onPress={onReset}
        activeOpacity={0.85}
        disabled={isResetDisabled}
        testID={`${testID}-reset`}
        className={`flex-1 items-center justify-center rounded-2xl border px-4 py-3 ${
          isResetDisabled ? "border-border bg-muted/40" : "border-border bg-background"
        }`}
      >
        <Text className="text-sm font-medium text-foreground">Reset</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onApply}
        activeOpacity={0.85}
        disabled={isApplyDisabled}
        testID={`${testID}-apply`}
        className={`flex-1 items-center justify-center rounded-2xl px-4 py-3 ${
          isApplyDisabled ? "bg-muted" : "bg-primary"
        }`}
      >
        <Text
          className={`text-sm font-semibold ${
            isApplyDisabled ? "text-muted-foreground" : "text-primary-foreground"
          }`}
        >
          Apply
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppBottomSheet
      description={description}
      footer={footer}
      onClose={onClose}
      snapPoints={INDEX_FILTER_SHEET_SNAP_POINTS}
      testID={testID}
      title={title}
      visible={visible}
    >
      <View className="gap-3">{children}</View>
    </AppBottomSheet>
  );
}
