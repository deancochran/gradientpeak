/**
 * Recording Footer
 *
 * Main bottom sheet component that orchestrates the footer UI.
 * Uses @gorhom/bottom-sheet with 2 snap points: [120, '60%']
 *
 * States:
 * - Collapsed (120px): Recording controls visible
 * - Expanded (60% screen): Full configuration grid
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
  onDiscard: () => void;
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
  onDiscard,
}: RecordingFooterProps) {
  // Focus mode context for coordination with zones
  const { focusState, focusFooter, clearFocus, isAnyZoneFocused } =
    useFocusMode();

  // Bottom sheet ref
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Snap points: collapsed (120px) and expanded (60% screen)
  const snapPoints = useMemo(() => [120, "60%"], []);

  // Track current snap index for conditional rendering
  const [currentSnapIndex, setCurrentSnapIndex] = React.useState(0);

  // Track if we're in the middle of a coordinated animation
  const [isCoordinating, setIsCoordinating] = React.useState(false);

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

  // Listen for zone focus changes - collapse footer if a zone is focused
  useEffect(() => {
    if (
      isAnyZoneFocused() &&
      currentSnapIndex === 1 &&
      !isCoordinating
    ) {
      // A zone was focused while footer is expanded
      // Collapse the footer
      setIsCoordinating(true);
      bottomSheetRef.current?.snapToIndex(0);
      // Reset coordinating flag after animation
      setTimeout(() => setIsCoordinating(false), 300);
    }
    // IMPORTANT: Do not include isCoordinating in deps to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusState, currentSnapIndex, isAnyZoneFocused]);

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
      style={{ zIndex: 10 }}
    >
      <View className="flex-1 bg-background">
        {currentSnapIndex === 0 ? (
          <FooterCollapsed
            service={service}
            recordingState={recordingState}
            category={category}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onLap={onLap}
            onFinish={onFinish}
            onDiscard={onDiscard}
          />
        ) : (
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
        )}
      </View>
    </BottomSheet>
  );
}
