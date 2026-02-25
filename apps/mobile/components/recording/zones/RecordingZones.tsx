/**
 * Recording Zones Container
 *
 * Orchestrates the 3-zone vertical stack with conditional rendering.
 * Uses flexbox to distribute available space equally among visible zones.
 *
 * Zone Rendering Logic:
 * - Zone A: Outdoor (always) | Indoor + Route (conditional)
 * - Zone B: Has Plan (conditional)
 * - Zone C: Always visible
 *
 * Layout Strategy:
 * - All zones use flex: 1 for equal height distribution
 * - 3 zones visible: 33.33% each
 * - 2 zones visible: 50% each
 * - 1 zone visible: 100%
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
  PublicActivityLocation
} from "@repo/supabase";
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

  // Hide regular zones when any zone is focused
  const isAnyZoneFocused = focusState === "zone-a" || focusState === "zone-b" || focusState === "zone-c";

  return (
    /* Zone stack - flexbox layout with gap, no padding */
    <View className="flex-1 gap-4" style={{ opacity: isAnyZoneFocused ? 0 : 1 }}>
      {/* Zone A: Context Layer (Map/Route) */}
      {showZoneA && (
        <AnimatedZoneContainer show={showZoneA} useFlex={true}>
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
        <AnimatedZoneContainer show={showZoneB} useFlex={true}>
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
        <AnimatedZoneContainer show={showZoneC} useFlex={true}>
          <RecordingErrorBoundary componentName="Zone C">
            <ZoneC
              service={service}
              isFocused={focusState === "zone-c"}
            />
          </RecordingErrorBoundary>
        </AnimatedZoneContainer>
      )}

      {/* Footer spacer - prevents content from being overlaid by footer */}
      <View style={{ height: 120 }} />
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
 * Uses flex-1 to allow zones to proportionally fill available space (optional)
 */
interface AnimatedZoneContainerProps {
  show: boolean;
  children: React.ReactNode;
  useFlex?: boolean; // If true, uses flex: 1; if false, sizes based on content
}

function AnimatedZoneContainer({
  show,
  children,
  useFlex = true,
}: AnimatedZoneContainerProps) {
  // Initialize shared values - start from hidden state for mount animation
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);
  const height = useSharedValue(0);

  // Animate opacity, scale, and height when visibility changes
  React.useEffect(() => {
    if (show) {
      // Animate to visible
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withTiming(1, { duration: 300 });
      height.value = withTiming(1, { duration: 300 });
    } else {
      // Animate to hidden
      opacity.value = withTiming(0, { duration: 300 });
      scale.value = withTiming(0.95, { duration: 300 });
      height.value = withTiming(0, { duration: 300 });
    }
    // Note: Shared values (opacity, scale, height) should NOT be in dependency array
    // They don't trigger re-renders and including them can cause unnecessary effect runs
  }, [show]);

  const animatedStyle = useAnimatedStyle(() => {
    if (useFlex) {
      return {
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
        flex: height.value, // Animate flex value from 0 to 1
        overflow: 'hidden',
      };
    } else {
      // Content-based sizing: don't use flex, just scale opacity
      return {
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
        overflow: 'hidden',
      };
    }
  });

  // Don't render at all when hidden (after animation completes)
  if (!show && opacity.value === 0) {
    return null;
  }

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
