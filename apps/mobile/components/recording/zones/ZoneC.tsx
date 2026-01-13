/**
 * Zone C: Data Layer (Metrics)
 *
 * Always visible. Shows live metrics during recording.
 * Displays "--" for unavailable sensor data.
 *
 * Focus Mode:
 * - Tap to expand metrics to fill screen (except footer)
 * - Spring animation ~400ms (damping: 0.8, stiffness: 100)
 * - Minimize button (X icon) in top-right corner when focused
 * - Mutually exclusive with other zones and footer expansion
 * - Enlarged metrics for better visibility when focused
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
import {
  usePlan,
  useCurrentReadings,
  useSessionStats,
  useMovingTime,
} from "@/lib/hooks/useActivityRecorder";
import type { IntensityTargetV2 } from "@repo/core";

export interface ZoneCProps {
  service: ActivityRecorderService | null;
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
const NORMAL_HEIGHT = 200; // Metrics grid needs a bit more space

/**
 * Metric type definition
 */
type MetricType =
  | "Time"
  | "Distance"
  | "Pace"
  | "Heart Rate"
  | "Power"
  | "Cadence";

/**
 * Get metric priority based on plan step targets
 * Returns array of metric names ordered by priority (targeted metrics first)
 */
function getMetricPriority(targets?: IntensityTargetV2[]): MetricType[] {
  const defaultOrder: MetricType[] = [
    "Time",
    "Distance",
    "Pace",
    "Heart Rate",
    "Power",
    "Cadence",
  ];

  if (!targets || targets.length === 0) {
    return defaultOrder;
  }

  // Map target types to metric names
  const targetMetrics = new Set<MetricType>();
  for (const target of targets) {
    switch (target.type) {
      case "%FTP":
      case "watts":
        targetMetrics.add("Power");
        break;
      case "%MaxHR":
      case "%ThresholdHR":
      case "bpm":
        targetMetrics.add("Heart Rate");
        break;
      case "speed":
        targetMetrics.add("Pace");
        break;
      case "cadence":
        targetMetrics.add("Cadence");
        break;
      // RPE doesn't map to a specific metric
      default:
        break;
    }
  }

  // Reorder: targeted metrics first, then always-show metrics (Time/Distance), then others
  const prioritized: MetricType[] = [];
  const alwaysShow: MetricType[] = ["Time", "Distance"];
  const remaining: MetricType[] = [];

  for (const metric of defaultOrder) {
    if (targetMetrics.has(metric)) {
      prioritized.push(metric);
    } else if (alwaysShow.includes(metric)) {
      // Skip for now, will add after targeted
    } else {
      remaining.push(metric);
    }
  }

  // Order: targeted metrics, then Time/Distance, then others
  return [...prioritized, ...alwaysShow, ...remaining];
}

/**
 * Format time in HH:MM:SS or MM:SS format
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function ZoneC({ service }: ZoneCProps) {
  const { focusState, focusZoneC, clearFocus } = useFocusMode();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const plan = usePlan(service);

  // Get live sensor data and session stats
  const currentReadings = useCurrentReadings(service);
  const sessionStats = useSessionStats(service);
  const movingTime = useMovingTime(service);

  // Get current step targets for metric prioritization
  const currentTargets = plan.hasPlan ? plan.currentStep?.targets : undefined;
  const metricOrder = React.useMemo(
    () => getMetricPriority(currentTargets),
    [currentTargets],
  );

  // Helper to get metric value from sensor data
  const getMetricValue = React.useCallback(
    (metric: MetricType): string => {
      switch (metric) {
        case "Time":
          return formatTime(movingTime);
        case "Distance":
          return sessionStats.distance
            ? `${(sessionStats.distance / 1000).toFixed(2)} km`
            : "0.00 km";
        case "Pace":
          // Show current pace if available, otherwise average
          if (currentReadings.speed && currentReadings.speed > 0) {
            const paceMinPerKm = 1000 / 60 / currentReadings.speed; // speed is in m/s
            return `${paceMinPerKm.toFixed(1)} min/km`;
          }
          return "--";
        case "Heart Rate":
          return currentReadings.heartRate
            ? `${Math.round(currentReadings.heartRate)} bpm`
            : "-- bpm";
        case "Power":
          return currentReadings.power
            ? `${Math.round(currentReadings.power)} W`
            : "-- W";
        case "Cadence":
          return currentReadings.cadence
            ? `${Math.round(currentReadings.cadence)} rpm`
            : "-- rpm";
        default:
          return "--";
      }
    },
    [currentReadings, sessionStats, movingTime],
  );

  // Handle tap with coordination (collapse footer first if needed)
  const handleTapToExpand = React.useCallback(async () => {
    if (focusState === "footer") {
      // Footer is expanded, clear it first
      clearFocus();
      // Wait 200ms for footer to collapse
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    // Now focus this zone
    focusZoneC();
  }, [focusState, clearFocus, focusZoneC]);

  // Calculate focused height (full screen minus top inset and footer height)
  // Footer collapsed height is 120px, so focused zone should be: screenHeight - topInset - 120
  const focusedHeight = screenHeight - insets.top - 120;

  // Animated height value
  const height = useSharedValue(NORMAL_HEIGHT);

  // Update height when focus state changes
  useEffect(() => {
    if (focusState === "zone-c") {
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

  const isFocused = focusState === "zone-c";

  // TODO: Connect to live metrics from service
  // For now, show placeholder metrics grid

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
          accessibilityLabel="Tap to expand metrics"
          accessibilityHint="Expands the metrics to fill the screen"
        >
          <Text className="text-sm font-medium text-muted-foreground mb-3">
            Metrics
          </Text>

          {/* Metrics Grid - 2 columns */}
          <View className="flex-row flex-wrap gap-4">
            {metricOrder.map((metric) => (
              <MetricItem
                key={metric}
                label={metric}
                value={getMetricValue(metric)}
              />
            ))}
          </View>
        </Pressable>
      )}

      {/* Focused state with minimize button */}
      {isFocused && (
        <>
          {/* Metrics Content (non-pressable when focused) - Enlarged */}
          <View className="flex-1 p-6">
            <Text className="text-xl font-medium text-foreground mb-6">
              Metrics
            </Text>

            {/* Metrics Grid - Enlarged for focused view */}
            <View className="flex-row flex-wrap gap-6">
              {metricOrder.map((metric) => (
                <MetricItemFocused
                  key={metric}
                  label={metric}
                  value={getMetricValue(metric)}
                />
              ))}
            </View>
          </View>

          {/* Minimize Button (top-right) */}
          <View className="absolute top-4 right-4">
            <Button
              size="icon"
              variant="outline"
              onPress={clearFocus}
              className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
              accessibilityLabel="Minimize metrics"
              accessibilityHint="Returns the metrics to normal size"
            >
              <Icon as={X} size={20} />
            </Button>
          </View>
        </>
      )}
    </Animated.View>
  );
}

interface MetricItemProps {
  label: string;
  value: string;
}

/**
 * Normal metric item for compact view
 */
function MetricItem({ label, value }: MetricItemProps) {
  return (
    <View className="flex-1 min-w-[120px]">
      <Text className="text-xs text-muted-foreground mb-1">{label}</Text>
      <Text className="text-2xl font-semibold">{value}</Text>
    </View>
  );
}

/**
 * Enlarged metric item for focused view
 */
function MetricItemFocused({ label, value }: MetricItemProps) {
  return (
    <View className="flex-1 min-w-[160px]">
      <Text className="text-sm text-muted-foreground mb-2">{label}</Text>
      <Text className="text-4xl font-bold">{value}</Text>
    </View>
  );
}
