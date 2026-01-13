/**
 * Zone B: Guidance Layer (Plan/Intervals)
 *
 * Conditional rendering based on plan:
 * - Has Plan: Interval card showing current step and progression
 * - No Plan: Unmount (hidden)
 *
 * Focus Mode:
 * - Tap to expand plan to fill screen (except footer)
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

export interface ZoneBProps {
  service: ActivityRecorderService | null;
  hasPlan: boolean;
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
const NORMAL_HEIGHT = 180; // Smaller than Zone A since plan card is more compact

export function ZoneB({ service, hasPlan }: ZoneBProps) {
  const { focusState, focusZoneB, clearFocus } = useFocusMode();
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
    focusZoneB();
  }, [focusState, clearFocus, focusZoneB]);

  // Don't render if no plan (handled by parent)
  if (!hasPlan) {
    return null;
  }

  // Calculate focused height (full screen minus top inset and footer height)
  // Footer collapsed height is 120px, so focused zone should be: screenHeight - topInset - 120
  const focusedHeight = screenHeight - insets.top - 120;

  // Animated height value
  const height = useSharedValue(NORMAL_HEIGHT);

  // Update height when focus state changes
  useEffect(() => {
    if (focusState === "zone-b") {
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

  const isFocused = focusState === "zone-b";

  // TODO: Get current step from service
  // TODO: Show interval progression chart
  // TODO: Display step targets (power/pace/HR zones)

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
          className="flex-1 p-4"
          accessibilityLabel="Tap to expand workout plan"
          accessibilityHint="Expands the workout plan to fill the screen"
        >
          <Text className="text-sm font-medium text-muted-foreground mb-3">
            Workout Plan
          </Text>

          {/* Current Step */}
          <View className="mb-4">
            <Text className="text-xs text-muted-foreground mb-1">
              Current Step
            </Text>
            <Text className="text-lg font-semibold">Warmup - 5:00</Text>
            <Text className="text-sm text-muted-foreground mt-1">
              Target: 150W (65% FTP)
            </Text>
          </View>

          {/* Progress Bar */}
          <View className="h-2 bg-muted rounded-full overflow-hidden">
            <View className="h-full bg-primary" style={{ width: "30%" }} />
          </View>

          {/* Next Step Preview */}
          <Text className="text-xs text-muted-foreground mt-3">
            Next: Work Interval - 200W
          </Text>
        </Pressable>
      )}

      {/* Focused state with minimize button */}
      {isFocused && (
        <>
          {/* Plan Content (non-pressable when focused) */}
          <View className="flex-1 p-6">
            <Text className="text-lg font-medium text-foreground mb-4">
              Workout Plan
            </Text>

            {/* Current Step - Enlarged for focused view */}
            <View className="mb-6">
              <Text className="text-sm text-muted-foreground mb-2">
                Current Step
              </Text>
              <Text className="text-3xl font-bold">Warmup - 5:00</Text>
              <Text className="text-lg text-muted-foreground mt-2">
                Target: 150W (65% FTP)
              </Text>
            </View>

            {/* Progress Bar - Larger in focused view */}
            <View className="h-4 bg-muted rounded-full overflow-hidden mb-6">
              <View className="h-full bg-primary" style={{ width: "30%" }} />
            </View>

            {/* Next Step Preview - Enlarged */}
            <View className="bg-muted/50 p-4 rounded-lg">
              <Text className="text-sm text-muted-foreground mb-1">
                Up Next
              </Text>
              <Text className="text-xl font-semibold">
                Work Interval - 200W
              </Text>
            </View>

            {/* TODO: Add interval progression chart when focused */}
            {/* TODO: Add complete workout overview with all steps */}
          </View>

          {/* Minimize Button (top-right) */}
          <View className="absolute top-4 right-4">
            <Button
              size="icon"
              variant="outline"
              onPress={clearFocus}
              className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
              accessibilityLabel="Minimize workout plan"
              accessibilityHint="Returns the workout plan to normal size"
            >
              <Icon as={X} size={20} />
            </Button>
          </View>
        </>
      )}
    </Animated.View>
  );
}
