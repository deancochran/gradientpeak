/**
 * Recording Zones Container
 *
 * Orchestrates the 3-zone vertical stack with conditional rendering.
 * Uses flexbox to distribute available space proportionally among visible zones.
 *
 * Zone Rendering Logic:
 * - Zone A: Outdoor (always) | Indoor + Route (conditional)
 * - Zone B: Has Plan (conditional)
 * - Zone C: Always visible
 *
 * Layout Strategy:
 * - All zones use flex-1 to proportionally fill available vertical space
 * - No hard-coded heights - responsive sizing via flexbox
 * - Gaps managed via Tailwind gap-4 utility
 * - When focused, zones overlay with absolute positioning
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

  return (
    /* Zone stack - flexbox layout distributes space proportionally */
    <View className="flex-1 px-4 pt-4 gap-4">
      {/* Zone A: Context Layer (Map/Route) */}
      {showZoneA && (
        <AnimatedZoneContainer show={showZoneA}>
          <RecordingErrorBoundary componentName="Zone A">
            <ZoneA
              service={service}
              location={location}
              hasRoute={hasRoute}
              isFocused={focusState === "zone-a"}
            />
          </RecordingErrorBoundary>
        </AnimatedZoneContainer>
      )}

      {/* Zone B: Guidance Layer (Plan/Intervals) */}
      {showZoneB && (
        <AnimatedZoneContainer show={showZoneB}>
          <RecordingErrorBoundary componentName="Zone B">
            <ZoneB
              service={service}
              hasPlan={hasPlan}
              isFocused={focusState === "zone-b"}
            />
          </RecordingErrorBoundary>
        </AnimatedZoneContainer>
      )}

      {/* Zone C: Data Layer (Metrics) - Always visible */}
      {showZoneC && (
        <AnimatedZoneContainer show={showZoneC}>
          <RecordingErrorBoundary componentName="Zone C">
            <ZoneC
              service={service}
              isFocused={focusState === "zone-c"}
            />
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
        <ZoneA
          service={service}
          location={location}
          hasRoute={hasRoute}
          isFocused={true}
        />
      </RecordingErrorBoundary>
    );
  } else if (focusState === "zone-b" && showZoneB) {
    zoneContent = (
      <RecordingErrorBoundary componentName="Zone B">
        <ZoneB service={service} hasPlan={hasPlan} isFocused={true} />
      </RecordingErrorBoundary>
    );
  } else if (focusState === "zone-c" && showZoneC) {
    zoneContent = (
      <RecordingErrorBoundary componentName="Zone C">
        <ZoneC service={service} isFocused={true} />
      </RecordingErrorBoundary>
    );
  }

  return zoneContent;
}

/**
 * Animated container for zone mount/unmount transitions
 * Animation: withTiming() 300ms ease-out
 * Uses flex-1 to allow zones to proportionally fill available space
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

  return (
    <Animated.View style={animatedStyle} className="flex-1">
      {children}
    </Animated.View>
  );
}
