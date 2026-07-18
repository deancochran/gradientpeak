import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/stores/theme-store";
import { getNativeBottomSheetVisualTokens } from "@/lib/theme/native-bottom-sheet";

export const APP_BOTTOM_SHEET_CUSTOM_CONTENT_TOP_INSET = 88;
export const APP_BOTTOM_SHEET_SEARCH_HEADER_CONTENT_TOP_INSET = 96;
export const APP_BOTTOM_SHEET_ACTION_FOOTER_BOTTOM_INSET = 132;

type AppBottomSheetProps = {
  children: ReactNode;
  contentKey?: string;
  contentMode?: "scroll" | "custom";
  contentPaddingBottom?: number;
  description?: string;
  footer?: ReactNode;
  headerAction?: ReactNode;
  headerContent?: ReactNode;
  initialSnapIndex?: number;
  onBack?: () => void;
  onClose: () => void;
  showTitleHeader?: boolean;
  snapPoints?: string[];
  testID?: string;
  title: string;
  visible: boolean;
};

type AppBottomSheetContentProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  contentKey?: string;
  enableFooterMarginAdjustment?: boolean;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  paddingBottom?: number;
  paddingHorizontal?: number;
  paddingTop?: number;
  showsVerticalScrollIndicator?: boolean;
};

export function AppBottomSheetContent({
  children,
  contentContainerStyle,
  contentKey,
  enableFooterMarginAdjustment = false,
  keyboardShouldPersistTaps = "handled",
  paddingBottom = 120,
  paddingHorizontal = 16,
  paddingTop = 16,
  showsVerticalScrollIndicator = true,
}: AppBottomSheetContentProps) {
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();

  return (
    <BottomSheetScrollView
      key={contentKey}
      enableFooterMarginAdjustment={enableFooterMarginAdjustment}
      style={{ flex: 1 }}
      contentContainerStyle={[
        {
          paddingHorizontal,
          paddingTop,
          paddingBottom: paddingBottom + bottomSafeAreaInset,
          flexGrow: 1,
        },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      nestedScrollEnabled
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {children}
    </BottomSheetScrollView>
  );
}

export function AppBottomSheet({
  children,
  contentKey,
  contentMode = "scroll",
  contentPaddingBottom,
  description,
  footer,
  headerAction,
  headerContent,
  initialSnapIndex,
  onBack,
  onClose,
  showTitleHeader = true,
  snapPoints: snapPointProp,
  testID = "app-bottom-sheet",
  title,
  visible,
}: AppBottomSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();
  const defaultSnapPoints = useMemo(() => ["82%", "96%"], []);
  const snapPoints = snapPointProp ?? defaultSnapPoints;
  const resolvedInitialSnapIndex = Math.min(
    Math.max(initialSnapIndex ?? snapPoints.length - 1, 0),
    Math.max(snapPoints.length - 1, 0),
  );
  const { resolvedTheme } = useTheme();
  const nativeVisualTokens = getNativeBottomSheetVisualTokens(resolvedTheme);
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => {
      if (!footer) return null;
      return (
        <BottomSheetFooter {...props} bottomInset={bottomSafeAreaInset}>
          <View className="border-t border-border bg-background px-4 py-4">{footer}</View>
        </BottomSheetFooter>
      );
    },
    [bottomSafeAreaInset, footer],
  );

  if (!visible) {
    return null;
  }

  const hasFooter = Boolean(footer);
  const hasHeaderAction = Boolean(headerAction);
  const hasHeaderContent = Boolean(headerContent);
  const hasHeader = showTitleHeader || hasHeaderContent;
  const header = hasHeader ? (
    <View className="border-b border-border bg-background pb-3 pt-2">
      {showTitleHeader ? (
        <View className="flex-row items-start justify-between gap-3 px-4">
          <View className="flex-row flex-1 items-start gap-2">
            {onBack ? (
              <Button
                accessibilityLabel={`Back from ${title}`}
                accessibilityState={{ disabled: false }}
                onPress={onBack}
                role="button"
                size="icon"
                testId={`${testID}-back`}
                variant="ghost"
              >
                <ChevronLeft size={18} className="text-foreground" />
              </Button>
            ) : null}
            <View className="flex-1 gap-1">
              <Text className="text-lg font-semibold text-foreground">{title}</Text>
              {description ? (
                <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
              ) : null}
            </View>
          </View>
          {hasHeaderAction ? <View>{headerAction}</View> : null}
        </View>
      ) : null}
      {hasHeaderContent ? (
        <View className={showTitleHeader ? "pt-3" : "pt-1"}>{headerContent}</View>
      ) : null}
    </View>
  ) : null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={resolvedInitialSnapIndex}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      footerComponent={hasFooter ? renderFooter : undefined}
      onClose={onClose}
      handleIndicatorStyle={{
        width: 40,
        height: 4,
        borderRadius: 2,
        ...nativeVisualTokens.handleIndicatorStyle,
      }}
      backgroundStyle={nativeVisualTokens.backgroundStyle}
      style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
    >
      {contentMode === "custom" ? (
        <>
          {header ? (
            <BottomSheetView
              pointerEvents="box-none"
              style={{ left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 }}
              testID={testID}
            >
              {header}
            </BottomSheetView>
          ) : null}
          {children}
        </>
      ) : (
        <BottomSheetView style={{ flex: 1 }} testID={testID}>
          {header}
          <AppBottomSheetContent
            contentKey={contentKey}
            enableFooterMarginAdjustment={Boolean(footer)}
            paddingBottom={
              contentPaddingBottom ??
              (hasFooter ? APP_BOTTOM_SHEET_ACTION_FOOTER_BOTTOM_INSET : 120)
            }
          >
            {children}
          </AppBottomSheetContent>
        </BottomSheetView>
      )}
    </BottomSheet>
  );
}
