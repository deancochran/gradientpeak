/**
 * Zone A: Context Layer (Map/Route)
 *
 * Conditional rendering based on location and route:
 * - Outdoor + Route: GPS map + route overlay + breadcrumb
 * - Outdoor + No Route: GPS map + breadcrumb only
 * - Indoor + Route: Virtual route map
 * - Indoor + No Route: Unmount (hidden)
 *
 * Focus Mode:
 * - Tap to expand map to fill screen (except footer)
 * - Spring animation ~400ms (damping: 0.8, stiffness: 100)
 * - Minimize button (X icon) in top-right corner when focused
 * - Mutually exclusive with other zones and footer expansion
 */

import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Pressable, View, useWindowDimensions } from "react-native";
import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { X } from "lucide-react-native";
import { useFocusMode } from "@/lib/contexts/FocusModeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PublicActivityLocation } from "@repo/core";
import { VirtualRouteMap } from "@/components/recording/VirtualRouteMap";
import { GPSStatusOverlay } from "@/components/recording/GPSStatusOverlay";

export interface ZoneAProps {
  service: ActivityRecorderService | null;
  location: PublicActivityLocation;
  hasRoute: boolean;
}

/**
 * Spring animation config for focus mode
 * ~400ms duration with natural spring feel
 */
const SPRING_CONFIG = {
  damping: 0.8 * 100, // Convert 0.8 to scale (80)
  stiffness: 100,
  mass: 1,
};

/**
 * Normal height when not focused (in pixels)
 */
const NORMAL_HEIGHT = 256; // h-64 = 16rem = 256px

export function ZoneA({ service, location, hasRoute }: ZoneAProps) {
  const { focusState, focusZoneA, clearFocus } = useFocusMode();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Handle tap with coordination (collapse footer first if needed)
  const handleTapToExpand = React.useCallback(async () => {
    if (focusState === "footer") {
      // Footer is expanded, clear it first
      clearFocus();
      // Wait 200ms for footer to collapse
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    // Now focus this zone
    focusZoneA();
  }, [focusState, clearFocus, focusZoneA]);

  // Determine what to show based on location and route
  const isOutdoor = location === "outdoor";
  const shouldRender = isOutdoor || hasRoute;

  // Calculate focused height (full screen minus top inset and footer height)
  // Footer collapsed height is 120px, so focused zone should be: screenHeight - topInset - 120
  const focusedHeight = screenHeight - insets.top - 120;

  // Animated height value
  const height = useSharedValue(NORMAL_HEIGHT);

  // Update height when focus state changes
  useEffect(() => {
    if (focusState === "zone-a") {
      // Expand to focused height
      height.value = withSpring(focusedHeight, SPRING_CONFIG);
    } else {
      // Collapse to normal height
      height.value = withSpring(NORMAL_HEIGHT, SPRING_CONFIG);
    }
    // IMPORTANT: SharedValues (height) don't need to be in deps
    // focusedHeight changes would cause unnecessary re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusState]);

  // Animated style for height transition
  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: height.value,
    };
  });

  // Don't render if indoor without route
  if (!shouldRender) {
    return null;
  }

  const isFocused = focusState === "zone-a";

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          // Use absolute positioning when focused to overlay other zones
          ...(isFocused && {
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            zIndex: 20, // Above zones (z-1) and footer (z-10)
          }),
        },
      ]}
      className="bg-card rounded-lg border border-border overflow-hidden"
    >
      {/* Tap to expand (only when not focused) */}
      {!isFocused && (
        <Pressable
          onPress={handleTapToExpand}
          className="flex-1"
          accessibilityLabel="Tap to expand map"
          accessibilityHint="Expands the map to fill the screen"
        >
          {/* Map Content */}
          {!isOutdoor && hasRoute && service ? (
            <VirtualRouteMap service={service} isFocused={false} />
          ) : (
            <View className="flex-1 bg-muted items-center justify-center">
              {/* TODO: Replace with actual GPS MapView component for outdoor activities */}
              <Text className="text-muted-foreground">
                {isOutdoor
                  ? hasRoute
                    ? "Map + Route"
                    : "Map"
                  : "Virtual Route Map"}
              </Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Focused state with minimize button */}
      {isFocused && (
        <>
          {/* Map Content (non-pressable when focused) */}
          {!isOutdoor && hasRoute && service ? (
            <VirtualRouteMap service={service} isFocused={true} />
          ) : (
            <View className="flex-1 bg-muted items-center justify-center">
              {/* TODO: Replace with actual GPS MapView component for outdoor activities */}
              <Text className="text-muted-foreground text-xl">
                {isOutdoor
                  ? hasRoute
                    ? "Map + Route (Focused)"
                    : "Map (Focused)"
                  : "Virtual Route Map (Focused)"}
              </Text>
            </View>
          )}

          {/* Minimize Button (top-right) */}
          <View className="absolute top-4 right-4">
            <Button
              size="icon"
              variant="outline"
              onPress={clearFocus}
              className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
              accessibilityLabel="Minimize map"
              accessibilityHint="Returns the map to normal size"
            >
              <Icon as={X} size={20} />
            </Button>
          </View>
        </>
      )}

      {/* GPS Status Overlay (outdoor only) */}
      {isOutdoor && <GPSStatusOverlay service={service} isOutdoor={isOutdoor} />}
    </Animated.View>
  );
}
