/**
 * Zone A: Context Layer (Map/Route)
 *
 * Conditional rendering based on location and route:
 * - Outdoor + Route: GPS map + route overlay + breadcrumb
 * - Outdoor + No Route: GPS map + breadcrumb only
 * - Indoor + Route: Virtual route map
 * - Indoor + No Route: Unmount (hidden)
 *
 * Layout:
 * - Normal state: flex-1 (fills proportional share of available space)
 * - Focused state: absolute positioned overlay (no z-index needed)
 *
 * Focus Mode:
 * - Tap to expand map to fill screen (minus footer)
 * - Minimize button (X icon) in top-right corner when focused
 * - Operates independently of bottom sheet expansion
 * - Bottom sheet uses containerStyle.zIndex to stay on top
 */

import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Pressable, View, useWindowDimensions } from "react-native";
import React from "react";
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
  isFocused: boolean; // Whether this zone is currently focused
}

export function ZoneA({ service, location, hasRoute, isFocused }: ZoneAProps) {
  const { focusZoneA, clearFocus } = useFocusMode();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Handle tap to expand
  const handleTapToExpand = React.useCallback(() => {
    focusZoneA();
  }, [focusZoneA]);

  // Determine what to show based on location and route
  const isOutdoor = location === "outdoor";
  const shouldRender = isOutdoor || hasRoute;

  // Calculate focused height (full screen minus top inset and footer height)
  // Footer collapsed height is 90px
  const focusedHeight = screenHeight - insets.top - 90;

  // Don't render if indoor without route
  if (!shouldRender) {
    return null;
  }

  return (
    <View
      style={
        isFocused
          ? {
              // Focused: absolute positioning to overlay other zones
              position: "absolute",
              top: insets.top,
              left: 0,
              right: 0,
              height: focusedHeight,
            }
          : undefined
      }
      className={
        isFocused
          ? "bg-card rounded-lg border border-border overflow-hidden"
          : "flex-1 bg-card rounded-lg border border-border overflow-hidden"
      }
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
    </View>
  );
}
