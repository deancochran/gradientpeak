import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Text } from "@repo/ui/components/text";
import React, { useCallback, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";

const THEME_COLORS = {
  light: { background: "#ffffff", handleIndicator: "#888888" },
  dark: { background: "#18181b", handleIndicator: "#888888" },
} as const;

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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["78%"], []);
  const { resolvedTheme } = useTheme();
  const themeColors = THEME_COLORS[resolvedTheme === "dark" ? "dark" : "light"];
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  if (!visible) {
    return null;
  }

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      onClose={onClose}
      handleIndicatorStyle={{
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: themeColors.handleIndicator,
      }}
      backgroundStyle={{ backgroundColor: themeColors.background }}
      style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
    >
      <BottomSheetView className="flex-1" testID={testID}>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1 border-b border-border pb-3">
            <Text className="text-lg font-semibold text-foreground">{title}</Text>
            <Text className="text-sm text-muted-foreground">{description}</Text>
          </View>
          <View className="mt-4 gap-3">{children}</View>
        </BottomSheetScrollView>
        <View className="border-t border-border bg-background px-4 pb-8 pt-3">
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
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
