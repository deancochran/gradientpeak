import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { ChevronLeft, Pencil, X } from "lucide-react-native";
import type { ComponentRef, ReactNode, Ref } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { omitUndefined } from "@/lib/omitUndefined";
import { useTheme } from "@/lib/stores/theme-store";
import { getNativeBottomSheetVisualTokens } from "@/lib/theme/native-bottom-sheet";

export const APP_BOTTOM_SHEET_CUSTOM_CONTENT_TOP_INSET = 88;
export const APP_BOTTOM_SHEET_SEARCH_HEADER_CONTENT_TOP_INSET = 96;
export const APP_BOTTOM_SHEET_ACTION_FOOTER_BOTTOM_INSET = 132;
export const APP_BOTTOM_SHEET_PRESENTATIONS = {
  filter: { initialSnapIndex: 0, snapPoints: ["78%"] },
  inspector: { initialSnapIndex: 0, snapPoints: ["82%", "96%"] },
  browser: { initialSnapIndex: 1, snapPoints: ["88%", "96%"] },
};

type AppBottomSheetProps = {
  scrollRef?: Ref<ComponentRef<typeof BottomSheetScrollView>>;
  children: ReactNode;
  contentKey?: string;
  contentMode?: "scroll" | "custom";
  contentPanningGestureEnabled?: boolean;
  customHeaderInLayout?: boolean;
  contentPaddingBottom?: number;
  description?: string;
  footer?: ReactNode;
  headerAction?: ReactNode;
  /** Gives sheet headers an equivalent non-gesture action. */
  headerAccessibilityActions?: { name: string; label: string }[];
  /** Replaces the compact back affordance for nested editor levels. */
  backLabel?: string;
  /** Overrides the compact back affordance's accessible name when its action is contextual. */
  backAccessibilityLabel?: string;
  /** Opt in for compact editors that need a centered title between back and Done/Add. */
  headerLayout?: "default" | "centered";
  headerContent?: ReactNode;
  /** Opt in to an accessible equivalent for an otherwise gesture-only handle. */
  handleAccessibilityLabel?: string;
  onHandlePress?: () => void;
  /** Lets compact inspectors derive a snap from the actual header, not a percentage. */
  onHeaderLayout?: (event: LayoutChangeEvent) => void;
  /** Optional title edit affordance for transactional inspector headers. */
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
  initialSnapIndex?: number;
  /** Reports native snap changes so one sheet can change its content hierarchy. */
  onChange?: (index: number) => void;
  /** Reports native snap animations before their settled onChange callback. */
  onAnimate?: (fromIndex: number, toIndex: number) => void;
  /** Imperatively restores an inline inspector without changing its presentation props. */
  snapRequest?: { index: number; nonce: number };
  onHeaderAccessibilityAction?: (actionName: string) => void;
  /** Called when a guarded inline sheet is dragged toward native dismissal. */
  onAttemptClose?: () => void;
  /**
   * Inspectors intentionally use the inline Gorhom host: unlike a modal it has
   * no native modal scrim, so a compact peek leaves the authored list usable.
   */
  presentation?: "modal" | "inspector";
  onBack?: () => void;
  onClose: () => void;
  /** Route close requests through the owner before dismissing a transactional draft. */
  guardedClose?: boolean;
  /** Opt in to a guarded modal's downward dismissal gesture. */
  guardedPanDownToClose?: boolean;
  showCloseAction?: boolean;
  showTitleHeader?: boolean;
  snapPoints?: Array<number | string>;
  stackBehavior?: "push" | "replace" | "switch";
  testID?: string;
  title: string;
  visible: boolean;
};

type AppBottomSheetContentProps = {
  scrollRef?: Ref<ComponentRef<typeof BottomSheetScrollView>>;
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
  scrollRef,
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
      {...(scrollRef === undefined ? {} : { ref: scrollRef })}
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
  scrollRef,
  children,
  contentKey,
  contentMode = "scroll",
  contentPanningGestureEnabled = true,
  customHeaderInLayout = false,
  contentPaddingBottom,
  description,
  footer,
  headerAction,
  headerAccessibilityActions,
  backLabel,
  backAccessibilityLabel,
  headerLayout = "default",
  headerContent,
  handleAccessibilityLabel,
  onHandlePress,
  onHeaderLayout,
  onTitlePress,
  titleAccessibilityLabel,
  initialSnapIndex,
  onChange,
  onAnimate,
  snapRequest,
  onHeaderAccessibilityAction,
  onAttemptClose,
  presentation = "modal",
  onBack,
  onClose,
  guardedClose = false,
  guardedPanDownToClose = false,
  showCloseAction = false,
  showTitleHeader = true,
  snapPoints: snapPointProp,
  stackBehavior = "replace",
  testID = "app-bottom-sheet",
  title,
  visible,
}: AppBottomSheetProps) {
  const modalSheetRef = useRef<BottomSheetModal>(null);
  const inlineSheetRef = useRef<BottomSheet>(null);
  const wasVisibleRef = useRef(visible);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Gorhom may emit more than one animation callback while a pan is settling.
  // A guarded inspector must turn one downward pan into one owner decision.
  const closeAttemptInFlightRef = useRef(false);
  // Gorhom can emit -1 after we intercept a guarded inspector close. Do not
  // leak that synthetic dismissal to the owner as a real peek settlement.
  const interceptedDismissalsRef = useRef(0);
  const handledSnapRequestRef = useRef<number | null>(null);
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();
  const defaultSnapPoints = APP_BOTTOM_SHEET_PRESENTATIONS.inspector.snapPoints;
  const snapPoints = snapPointProp ?? defaultSnapPoints;
  const resolvedInitialSnapIndex = Math.min(
    Math.max(initialSnapIndex ?? snapPoints.length - 1, 0),
    Math.max(snapPoints.length - 1, 0),
  );
  const { resolvedTheme } = useTheme();
  const nativeVisualTokens = getNativeBottomSheetVisualTokens(resolvedTheme);
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => {
      const backdrop = (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior={guardedClose ? "none" : "close"}
        />
      );
      // Gorhom ignores onPress when pressBehavior is none; own this guarded target.
      return guardedClose ? (
        <View style={StyleSheet.absoluteFill}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {backdrop}
          </View>
          <Pressable
            accessibilityLabel="Dismiss sheet"
            accessibilityRole="button"
            onPress={() => {
              if (mountedRef.current && visibleRef.current) (onAttemptClose ?? onClose)();
            }}
            style={StyleSheet.absoluteFill}
            testID="guarded-sheet-backdrop"
          />
        </View>
      ) : (
        backdrop
      );
    },
    [guardedClose, onAttemptClose, onClose],
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

  useEffect(() => {
    if (presentation === "inspector") return;
    if (visible) {
      modalSheetRef.current?.present();
    } else if (wasVisibleRef.current) {
      modalSheetRef.current?.dismiss();
    }

    wasVisibleRef.current = visible;
  }, [presentation, visible]);

  useEffect(() => {
    if (
      presentation !== "inspector" ||
      !snapRequest ||
      handledSnapRequestRef.current === snapRequest.nonce
    )
      return;
    handledSnapRequestRef.current = snapRequest.nonce;
    inlineSheetRef.current?.snapToIndex(snapRequest.index);
  }, [presentation, snapRequest]);

  const hasFooter = Boolean(footer);
  const hasHeaderAction = Boolean(headerAction);
  const hasHeaderContent = Boolean(headerContent);
  const hasHeader = showTitleHeader || hasHeaderContent;
  const accessibleHandle = handleAccessibilityLabel ? (
    <View className="items-center py-3">
      <Pressable
        accessibilityLabel={handleAccessibilityLabel}
        accessibilityRole="button"
        className="h-4 w-12 items-center justify-center"
        onPress={onHandlePress}
      >
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            ...nativeVisualTokens.handleIndicatorStyle,
          }}
        />
      </Pressable>
    </View>
  ) : null;
  const header = hasHeader ? (
    <View
      className="border-b border-border bg-background pb-3 pt-2"
      onLayout={onHeaderLayout}
      {...(headerAccessibilityActions
        ? {
            accessibilityActions: headerAccessibilityActions,
            onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) =>
              onHeaderAccessibilityAction?.(event.nativeEvent.actionName),
          }
        : {})}
    >
      {showTitleHeader ? (
        <View
          className={
            headerLayout === "centered"
              ? "flex-row items-center gap-3 px-4"
              : "flex-row items-start justify-between gap-3 px-4"
          }
        >
          <View
            className={
              headerLayout === "centered"
                ? "flex-row flex-1 items-center gap-2"
                : "flex-row flex-1 items-start gap-2"
            }
          >
            {onBack ? (
              <Button
                accessibilityLabel={
                  backAccessibilityLabel ??
                  (backLabel === "Cancel" ? "Cancel editor" : (backLabel ?? `Back from ${title}`))
                }
                accessibilityState={{ disabled: false }}
                className="min-h-11 min-w-11"
                onPress={onBack}
                role="button"
                size={backLabel ? "sm" : "icon"}
                testId={`${testID}-back`}
                variant="ghost"
              >
                {backLabel ? (
                  <Text className="text-sm font-medium text-foreground">{backLabel}</Text>
                ) : (
                  <ChevronLeft size={18} className="text-foreground" />
                )}
              </Button>
            ) : null}
            <View className="flex-1 gap-1">
              {onTitlePress ? (
                <Pressable
                  accessibilityLabel={titleAccessibilityLabel ?? `Rename ${title}`}
                  accessibilityRole="button"
                  className="min-h-11 flex-row items-center justify-center gap-1"
                  onPress={onTitlePress}
                >
                  <Text
                    accessibilityRole="header"
                    className={
                      headerLayout === "centered"
                        ? "text-center text-lg font-semibold text-foreground"
                        : "text-lg font-semibold text-foreground"
                    }
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Pencil size={15} className="text-muted-foreground" />
                </Pressable>
              ) : (
                <Text
                  accessibilityRole="header"
                  className={
                    headerLayout === "centered"
                      ? "text-center text-lg font-semibold text-foreground"
                      : "text-lg font-semibold text-foreground"
                  }
                  numberOfLines={1}
                >
                  {title}
                </Text>
              )}
              {description ? (
                <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
              ) : null}
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            {hasHeaderAction ? <View>{headerAction}</View> : null}
            {showCloseAction ? (
              <Button
                accessibilityLabel={`Close ${title}`}
                className="min-h-11 min-w-11"
                onPress={onClose}
                role="button"
                testId={`${testID}-close`}
                variant="ghost"
              >
                <X size={18} className="text-foreground" />
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}
      {hasHeaderContent ? (
        <View className={showTitleHeader ? "pt-3" : "pt-1"}>{headerContent}</View>
      ) : null}
    </View>
  ) : null;

  const sheetContent = (
    <>
      {contentMode === "custom" ? (
        <>
          {header && !customHeaderInLayout ? (
            <BottomSheetView
              pointerEvents="box-none"
              style={{
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
                zIndex: 10,
              }}
              testID={testID}
            >
              {header}
            </BottomSheetView>
          ) : null}
          {customHeaderInLayout ? (
            <BottomSheetView style={{ flex: 1 }} testID={testID}>
              {header}
              {children}
            </BottomSheetView>
          ) : (
            children
          )}
        </>
      ) : (
        <BottomSheetView style={{ flex: 1 }} testID={testID}>
          {header}
          <AppBottomSheetContent
            {...omitUndefined({ contentKey })}
            {...(scrollRef === undefined ? {} : { scrollRef })}
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
    </>
  );

  const commonProps = {
    index: resolvedInitialSnapIndex,
    onChange: (index: number) => {
      if (!mountedRef.current || !visibleRef.current) return;
      if (presentation === "modal" && guardedClose && index === -1) {
        modalSheetRef.current?.snapToIndex(0);
        return;
      }
      if (presentation === "inspector" && index === -1 && interceptedDismissalsRef.current > 0) {
        interceptedDismissalsRef.current -= 1;
        return;
      }
      // A snap back after a declined close (or the next settled position) makes
      // the sheet eligible for a later, distinct gesture.
      if (index >= 0) closeAttemptInFlightRef.current = false;
      onChange?.(index);
    },
    snapPoints,
    enableDynamicSizing: false,
    enableContentPanningGesture: contentPanningGestureEnabled,
    // Inline inspectors must receive the downward gesture so their transaction
    // owner can decide whether to accept or discard; snap it back rather than
    // allowing Gorhom to unmount it before that decision.
    enablePanDownToClose:
      presentation === "inspector" ? true : guardedClose ? guardedPanDownToClose : true,
    onAnimate: (fromIndex: number, toIndex: number) => {
      if (!mountedRef.current || !visibleRef.current) return;
      if (guardedClose && toIndex === -1) {
        if (closeAttemptInFlightRef.current) return;
        closeAttemptInFlightRef.current = true;
        if (presentation === "inspector") interceptedDismissalsRef.current += 1;
        (onAttemptClose ?? onClose)();
        const restoreIndex = Math.max(fromIndex, 0);
        if (presentation === "inspector") inlineSheetRef.current?.snapToIndex(restoreIndex);
        else modalSheetRef.current?.snapToIndex(restoreIndex);
      }
      onAnimate?.(fromIndex, toIndex);
    },
    keyboardBehavior: "interactive" as const,
    keyboardBlurBehavior: "restore" as const,
    android_keyboardInputMode: "adjustResize" as const,
    ...omitUndefined({ footerComponent: hasFooter ? renderFooter : undefined }),
    handleIndicatorStyle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      ...nativeVisualTokens.handleIndicatorStyle,
    },
    backgroundStyle: nativeVisualTokens.backgroundStyle,
    style: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    ...(accessibleHandle ? { handleComponent: () => accessibleHandle } : {}),
  };

  if (presentation === "inspector") {
    // This must be mounted alongside the screen root, not inside its scroll
    // view. BottomSheet is deliberately non-modal and therefore permits taps
    // on the uncovered list while its peek is visible.
    return visible ? (
      <BottomSheet ref={inlineSheetRef} {...commonProps}>
        {sheetContent}
      </BottomSheet>
    ) : null;
  }

  return (
    <BottomSheetModal
      ref={modalSheetRef}
      stackBehavior={stackBehavior}
      backdropComponent={renderBackdrop}
      {...(guardedClose ? { enableDismissOnClose: false } : {})}
      {...omitUndefined({ onDismiss: guardedClose ? undefined : onClose })}
      {...commonProps}
    >
      {sheetContent}
    </BottomSheetModal>
  );
}
