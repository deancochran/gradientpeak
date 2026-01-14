/**
 * Recording Footer
 *
 * Main bottom sheet component that orchestrates the footer UI.
 * Uses @gorhom/bottom-sheet with 2 snap points: [90, '60%']
 *
 * States:
 * - Collapsed (90px): Recording controls only (minimal, clean)
 * - Expanded (60% screen): Full configuration grid
 *
 * Layering Strategy:
 * - Uses containerStyle with very high zIndex (999999) to ensure always on top
 * - Focused zones have no z-index, so they stay below bottom sheet naturally
 *
 * Independent Operation:
 * - Zones and bottom sheet can be focused/expanded independently
 * - No coordination - they don't minimize each other
 *
 * Animation: damping: 80, stiffness: 500, mass: 0.3
 * Swipe-down disabled: enablePanDownToClose={false}
 * Tap-outside collapses to snap point 0
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type {
  PublicActivityCategory,
  PublicActivityLocation,
  RecordingState,
} from "@repo/core";
import { useFocusMode } from "@/lib/contexts/FocusModeContext";

import { FooterCollapsed } from "./FooterCollapsed";
import { FooterExpanded } from "./FooterExpanded";

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
  // Focus mode context
  const { focusState, focusFooter, clearFocus } = useFocusMode();

  // Bottom sheet ref
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Snap points: collapsed (90px - just controls) and expanded (60% screen)
  const snapPoints = useMemo(() => [90, "60%"], []);

  // Track current snap index for conditional rendering
  const [currentSnapIndex, setCurrentSnapIndex] = React.useState(0);

  // Backdrop component for tap-outside-to-collapse
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={0}
        appearsOnIndex={1}
        opacity={0.3}
        pressBehavior="collapse"
      />
    ),
    [],
  );

  // Handle snap point changes
  const handleSheetChanges = useCallback(
    (index: number) => {
      setCurrentSnapIndex(index);

      // Update focus mode state based on snap index
      if (index === 1) {
        // Footer expanded - update focus state
        focusFooter();
      } else if (index === 0 && focusState === "footer") {
        // Footer collapsed - clear focus if it was focused
        clearFocus();
      }
    },
    [focusFooter, clearFocus, focusState],
  );

  // Debug logging
  React.useEffect(() => {
    console.log("[RecordingFooter] Mounted with state:", recordingState);
    console.log("[RecordingFooter] Snap points:", snapPoints);
    console.log("[RecordingFooter] Current snap index:", currentSnapIndex);
  }, [recordingState, snapPoints, currentSnapIndex]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose={false}
      backdropComponent={renderBackdrop}
      animationConfigs={{
        damping: 80,
        stiffness: 500,
        mass: 0.3,
      }}
      enableDynamicSizing={false}
      handleIndicatorStyle={{ backgroundColor: "#888" }}
      containerStyle={{
        zIndex: 999999,
      }}
    >
      <View className="flex-1 bg-background">
        {/* Always render both states to avoid render lag, use display style to show/hide */}
        <View style={{ display: currentSnapIndex === 0 ? "flex" : "none" }}>
          <FooterCollapsed
            service={service}
            recordingState={recordingState}
            category={category}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onLap={onLap}
            onFinish={onFinish}
          />
        </View>

        <View style={{ display: currentSnapIndex === 1 ? "flex" : "none", flex: 1 }}>
          <FooterExpanded
            service={service}
            recordingState={recordingState}
            category={category}
            location={location}
            hasPlan={hasPlan}
            hasRoute={hasRoute}
            onPause={onPause}
            onResume={onResume}
            onLap={onLap}
            onFinish={onFinish}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
