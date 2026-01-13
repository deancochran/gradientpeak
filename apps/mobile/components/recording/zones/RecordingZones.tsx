/**
 * Recording Zones Container
 *
 * Orchestrates the 3-zone vertical stack with conditional rendering.
 * Handles zone mount/unmount animations.
 *
 * Zone Rendering Logic:
 * - Zone A: Outdoor (always) | Indoor + Route (conditional)
 * - Zone B: Has Plan (conditional)
 * - Zone C: Always visible
 */

import { View } from "react-native";
import React, { useMemo } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type {
  PublicActivityCategory,
  PublicActivityLocation,
} from "@repo/core";
import { useFocusMode } from "@/lib/contexts/FocusModeContext";

import { ZoneA } from "./ZoneA";
import { ZoneB } from "./ZoneB";
import { ZoneC } from "./ZoneC";
import { RecordingErrorBoundary } from "../RecordingErrorBoundary";

/**
 * Normal height when zones are not focused (in pixels)
 * Must match NORMAL_HEIGHT in individual zone components
 */
const NORMAL_HEIGHT = 256; // h-64 = 16rem = 256px

export interface RecordingZonesProps {
  service: ActivityRecorderService | null;
  category: PublicActivityCategory;
  location: PublicActivityLocation;
  hasPlan: boolean;
  hasRoute: boolean;
}

/**
 * Props for zone overlay component
 */
export interface ZoneFocusOverlayProps {
  service: ActivityRecorderService | null;
  category: PublicActivityCategory;
  location: PublicActivityLocation;
  hasPlan: boolean;
  hasRoute: boolean;
}

export function RecordingZones({
  service,
  category,
  location,
  hasPlan,
  hasRoute,
}: RecordingZonesProps) {
  const { focusState } = useFocusMode();

  // Determine zone visibility based on configuration
  const { showZoneA, showZoneB, showZoneC } = useMemo(() => {
    const isOutdoor = location === "outdoor";
    const isIndoor = location === "indoor";

    // Zone A visibility logic
    const showZoneA =
      isOutdoor || // Always show for outdoor
      (isIndoor && hasRoute); // Show for indoor only if has route

    // Zone B visibility logic
    const showZoneB = hasPlan; // Only show if plan exists

    // Zone C always visible
    const showZoneC = true;

    return { showZoneA, showZoneB, showZoneC };
  }, [location, hasPlan, hasRoute]);

  // Render zones in normal flow (minimized or when no focus)
  const renderZoneInFlow = (
    zoneId: "zone-a" | "zone-b" | "zone-c",
    content: React.ReactNode,
  ) => {
    const isFocused = focusState === zoneId;

    // When focused, render placeholder to maintain space
    // When not focused, render normally
    return (
      <ZoneWrapper isZoneFocused={isFocused}>
        {!isFocused && content}
      </ZoneWrapper>
    );
  };

  // Render focused zone in overlay (outside normal flow)
  const renderFocusedZoneOverlay = () => {
    if (focusState === "none" || focusState === "footer") return null;

    let zoneContent = null;

    if (focusState === "zone-a" && showZoneA) {
      zoneContent = (
        <RecordingErrorBoundary componentName="Zone A">
          <ZoneA service={service} location={location} hasRoute={hasRoute} />
        </RecordingErrorBoundary>
      );
    } else if (focusState === "zone-b" && showZoneB) {
      zoneContent = (
        <RecordingErrorBoundary componentName="Zone B">
          <ZoneB service={service} hasPlan={hasPlan} />
        </RecordingErrorBoundary>
      );
    } else if (focusState === "zone-c" && showZoneC) {
      zoneContent = (
        <RecordingErrorBoundary componentName="Zone C">
          <ZoneC service={service} />
        </RecordingErrorBoundary>
      );
    }

    return zoneContent;
  };

  return (
    /* Normal zone stack - zones render here when not focused */
    <View className="flex-1 px-4 pt-4 gap-4">
      {/* Zone A: Context Layer (Map/Route) */}
      {showZoneA && renderZoneInFlow(
        "zone-a",
        <AnimatedZoneContainer show={showZoneA}>
          <RecordingErrorBoundary componentName="Zone A">
            <ZoneA service={service} location={location} hasRoute={hasRoute} />
          </RecordingErrorBoundary>
        </AnimatedZoneContainer>
      )}

      {/* Zone B: Guidance Layer (Plan/Intervals) */}
      {showZoneB && renderZoneInFlow(
        "zone-b",
        <AnimatedZoneContainer show={showZoneB}>
          <RecordingErrorBoundary componentName="Zone B">
            <ZoneB service={service} hasPlan={hasPlan} />
          </RecordingErrorBoundary>
        </AnimatedZoneContainer>
      )}

      {/* Zone C: Data Layer (Metrics) - Always visible */}
      {showZoneC && renderZoneInFlow(
        "zone-c",
        <AnimatedZoneContainer show={showZoneC}>
          <RecordingErrorBoundary componentName="Zone C">
            <ZoneC service={service} />
          </RecordingErrorBoundary>
        </AnimatedZoneContainer>
      )}
    </View>
  );
}

/**
 * Zone Focus Overlay
 * Renders the currently focused zone as an overlay outside the normal flow
 * This component should be rendered at the root level, outside any ScrollViews
 */
export function ZoneFocusOverlay({
  service,
  category,
  location,
  hasPlan,
  hasRoute,
}: ZoneFocusOverlayProps) {
  const { focusState } = useFocusMode();

  // Determine zone visibility based on configuration
  const { showZoneA, showZoneB, showZoneC } = useMemo(() => {
    const isOutdoor = location === "outdoor";
    const isIndoor = location === "indoor";

    const showZoneA = isOutdoor || (isIndoor && hasRoute);
    const showZoneB = hasPlan;
    const showZoneC = true;

    return { showZoneA, showZoneB, showZoneC };
  }, [location, hasPlan, hasRoute]);

  if (focusState === "none" || focusState === "footer") return null;

  let zoneContent = null;

  if (focusState === "zone-a" && showZoneA) {
    zoneContent = (
      <RecordingErrorBoundary componentName="Zone A">
        <ZoneA service={service} location={location} hasRoute={hasRoute} />
      </RecordingErrorBoundary>
    );
  } else if (focusState === "zone-b" && showZoneB) {
    zoneContent = (
      <RecordingErrorBoundary componentName="Zone B">
        <ZoneB service={service} hasPlan={hasPlan} />
      </RecordingErrorBoundary>
    );
  } else if (focusState === "zone-c" && showZoneC) {
    zoneContent = (
      <RecordingErrorBoundary componentName="Zone C">
        <ZoneC service={service} />
      </RecordingErrorBoundary>
    );
  }

  return zoneContent;
}

/**
 * Zone Wrapper
 * Maintains space in the layout when a zone becomes absolutely positioned during focus
 */
interface ZoneWrapperProps {
  isZoneFocused: boolean;
  children: React.ReactNode;
}

function ZoneWrapper({ isZoneFocused, children }: ZoneWrapperProps) {
  // When zone is focused (absolute positioned), maintain minimum height to prevent layout collapse
  // When not focused, allow natural height
  return (
    <View style={{ minHeight: isZoneFocused ? NORMAL_HEIGHT : undefined }}>
      {children}
    </View>
  );
}

/**
 * Animated container for zone mount/unmount transitions
 * Animation: withTiming() 300ms ease-out
 */
interface AnimatedZoneContainerProps {
  show: boolean;
  children: React.ReactNode;
}

function AnimatedZoneContainer({
  show,
  children,
}: AnimatedZoneContainerProps) {
  // Initialize shared values - start from hidden state for mount animation
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  // Animate opacity and scale when visibility changes
  React.useEffect(() => {
    if (show) {
      // Animate to visible
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withTiming(1, { duration: 300 });
    } else {
      // Animate to hidden
      opacity.value = withTiming(0, { duration: 300 });
      scale.value = withTiming(0.95, { duration: 300 });
    }
  }, [show, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
