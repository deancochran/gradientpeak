/**
 * Recording Footer
 *
 * Simplified bottom sheet with permanent content layout.
 * Uses @gorhom/bottom-sheet with 2 snap points: [120, '60%']
 *
 * States:
 * - Collapsed (120px): Shows top portion of content (controls)
 * - Expanded (60% screen): Shows full content (controls + configuration)
 *
 * No transitions or component switching - content is always rendered,
 * dragging just reveals more or less of it.
 */

import { useFocusMode } from "@/lib/contexts/FocusModeContext";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import BottomSheet, { BottomSheetBackdrop, SNAP_POINT_TYPE } from "@gorhom/bottom-sheet";
import type {
  RecordingState
} from "@repo/core";
import type {
  PublicActivityCategory,
  PublicActivityLocation
} from "@repo/supabase";
import React, { useCallback, useMemo, useRef } from "react";
import { View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FooterExpandedContent } from "./FooterExpandedContent";

export interface RecordingFooterProps {
  service: ActivityRecorderService | null;
  recordingState: RecordingState;
  category: PublicActivityCategory;
  location: PublicActivityLocation;
  hasPlan: boolean;
  hasRoute: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
}

// Theme-aware colors for bottom sheet
const THEME_COLORS = {
  light: {
    background: "#ffffff", // white
    handleIndicator: "#888888",
  },
  dark: {
    background: "#18181b", // zinc-900
    handleIndicator: "#888888",
  },
} as const;

// Bottom sheet styling constants (non-color styles)
const BOTTOM_SHEET_BASE_STYLES = {
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
} as const;

export function RecordingFooter({
  service,
  recordingState,
  category,
  location,
  hasPlan,
  hasRoute,
  onStart,
  onPause,
  onResume,
  onLap,
  onFinish,
}: RecordingFooterProps) {
  const { focusState, focusFooter, clearFocus, isAnyZoneFocused } = useFocusMode();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  // Get theme-aware colors
  const themeColors = THEME_COLORS[colorScheme === "dark" ? "dark" : "light"];

  // Construct theme-aware styles
  const bottomSheetStyles = useMemo(() => ({
    handleIndicator: {
      ...BOTTOM_SHEET_BASE_STYLES.handleIndicator,
      backgroundColor: themeColors.handleIndicator,
    },
    background: {
      backgroundColor: themeColors.background,
    },
    container: BOTTOM_SHEET_BASE_STYLES.container,
  }), [themeColors]);

  // Snap points: collapsed (120px) and expanded (60% screen)
  // Mixed fixed/percentage snap points are fully supported and recommended
  const snapPoints = useMemo(() => [120, "60%"], []);

  // Simplified backdrop - the component handles appearance animations internally
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        opacity={0.5}
        pressBehavior="collapse"
      />
    ),
    [],
  );

  // Handle snap point changes for focus mode
  // Only react to provided snap points to avoid constant updates during drag
  const handleSheetChanges = useCallback(
    (index: number, position: number, type: SNAP_POINT_TYPE) => {
      if (type === SNAP_POINT_TYPE.PROVIDED) {
        if (index === 1) {
          if (!isAnyZoneFocused()) {
            focusFooter();
          }
        } else if (index === 0 && focusState === "footer") {
          clearFocus();
        }
      }
    },
    [focusFooter, clearFocus, focusState, isAnyZoneFocused],
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose={false}
      backdropComponent={renderBackdrop}
      enableDynamicSizing={false}
      bottomInset={insets.bottom}
      handleIndicatorStyle={bottomSheetStyles.handleIndicator}
      backgroundStyle={bottomSheetStyles.background}
      style={bottomSheetStyles.container}
    >
      {/* Single permanent content - no transitions */}
      <FooterExpandedContent
        service={service}
        recordingState={recordingState}
        category={category}
        location={location}
        hasPlan={hasPlan}
        hasRoute={hasRoute}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onLap={onLap}
        onFinish={onFinish}
      />
    </BottomSheet>
  );
}
