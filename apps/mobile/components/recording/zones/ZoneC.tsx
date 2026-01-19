/**
 * Zone C: Data Layer (Metrics)
 *
 * Always visible. Shows live metrics during recording.
 *
 * Metric Display Logic:
 * - Lap Timer: Always visible (persistent), displays 00:00 when inactive
 * - All other metrics: Always shown, display "--" for unavailable sensor data
 *
 * Layout:
 * - Normal state: flex-1 (fills proportional share of available space)
 * - Focused state: absolute positioned overlay (no z-index needed)
 *
 * Focus Mode:
 * - Tap to expand metrics to fill screen (minus footer)
 * - Minimize button (X icon) in top-right corner when focused
 * - Operates independently of bottom sheet expansion
 * - Bottom sheet uses containerStyle.zIndex to stay on top
 * - Enlarged metrics for better visibility when focused
 */

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useFocusMode } from "@/lib/contexts/FocusModeContext";
import {
  useCurrentReadings,
  useLapTime,
  useMovingTime,
  usePlan,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { IntensityTargetV2 } from "@repo/core";
import { Minimize2 } from "lucide-react-native";
import React from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ZoneCProps {
  service: ActivityRecorderService | null;
  isFocused: boolean; // Whether this zone is currently focused
}

/**
 * Metric type definition
 */
type MetricType =
  | "Time"
  | "Lap Time"
  | "Distance"
  | "Pace"
  | "Heart Rate"
  | "Power"
  | "Cadence"
  | "Calories";

/**
 * Get metric priority based on plan step targets
 * Returns array of metric names ordered by priority (targeted metrics first)
 */
function getMetricPriority(targets?: IntensityTargetV2[]): MetricType[] {
  const defaultOrder: MetricType[] = [
    "Time",
    "Lap Time",
    "Distance",
    "Calories",
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

/**
 * Format pace as MM:SS per km (time signature format)
 * Converts decimal minutes to minutes:seconds
 * @param minPerKm - Pace in decimal minutes per kilometer (e.g., 5.5)
 * @returns Formatted pace (e.g., "5:30")
 */
function formatPace(minPerKm: number): string {
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);

  // Handle edge case where rounding gives 60 seconds
  if (seconds === 60) {
    return `${minutes + 1}:00`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get target value for a metric from current step
 */
function getMetricTarget(
  metric: MetricType,
  targets?: IntensityTargetV2[],
  profile?: any,
): string | null {
  if (!targets || targets.length === 0) return null;

  for (const target of targets) {
    switch (metric) {
      case "Power":
        if (target.type === "%FTP") {
          const ftp = profile?.ftp || 200;
          return `${Math.round((target.intensity / 100) * ftp)}W`;
        }
        if (target.type === "watts") {
          return `${Math.round(target.intensity)}W`;
        }
        break;
      case "Heart Rate":
        if (target.type === "%MaxHR") {
          const maxHR = profile?.max_heart_rate || 180;
          return `${Math.round((target.intensity / 100) * maxHR)} bpm`;
        }
        if (target.type === "%ThresholdHR") {
          const thresholdHR = profile?.threshold_heart_rate || 160;
          return `${Math.round((target.intensity / 100) * thresholdHR)} bpm`;
        }
        if (target.type === "bpm") {
          return `${Math.round(target.intensity)} bpm`;
        }
        break;
      case "Cadence":
        if (target.type === "cadence") {
          return `${Math.round(target.intensity)} rpm`;
        }
        break;
    }
  }
  return null;
}

/**
 * Calculate if current value is on target
 * Returns: "low" | "target" | "high" | null
 */
function getTargetStatus(
  currentValue: number,
  targetValue: number,
  tolerance: number = 0.1, // 10% tolerance
): "low" | "target" | "high" {
  const lowerBound = targetValue * (1 - tolerance);
  const upperBound = targetValue * (1 + tolerance);

  if (currentValue < lowerBound) return "low";
  if (currentValue > upperBound) return "high";
  return "target";
}

export function ZoneC({ service, isFocused }: ZoneCProps) {
  const { focusZoneC, clearFocus } = useFocusMode();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const plan = usePlan(service);

  // Get live sensor data and session stats
  const currentReadings = useCurrentReadings(service);
  const sessionStats = useSessionStats(service);
  const movingTime = useMovingTime(service);
  const lapTime = useLapTime(service);

  // Get user profile for target resolution
  const profile = service?.recordingMetadata?.profile || null;

  // Get current step targets for metric prioritization
  const currentTargets = plan.hasPlan ? plan.currentStep?.targets : undefined;
  const metricOrder = React.useMemo(() => {
    // All metrics are always shown (including Lap Time which persists even when inactive)
    // Metrics display "--" when data is unavailable
    return getMetricPriority(currentTargets);
  }, [currentTargets]);

  // Helper to get raw numeric value for a metric (for target comparison)
  const getMetricNumericValue = React.useCallback(
    (metric: MetricType): number | null => {
      switch (metric) {
        case "Power":
          return currentReadings.power || null;
        case "Heart Rate":
          return currentReadings.heartRate || null;
        case "Cadence":
          return currentReadings.cadence || null;
        default:
          return null;
      }
    },
    [currentReadings],
  );

  // Helper to get metric value from sensor data
  const getMetricValue = React.useCallback(
    (metric: MetricType): string => {
      switch (metric) {
        case "Time":
          return formatTime(movingTime);
        case "Lap Time":
          return formatTime(lapTime);
        case "Distance":
          return sessionStats.distance
            ? `${(sessionStats.distance / 1000).toFixed(2)} km`
            : "0.00 km";
        case "Calories":
          return sessionStats.calories
            ? `${Math.round(sessionStats.calories)} cal`
            : "0 cal";
        case "Pace":
          // Show current pace if available, otherwise average
          if (currentReadings.speed && currentReadings.speed > 0) {
            const paceMinPerKm = 1000 / 60 / currentReadings.speed; // speed is in m/s
            return `${formatPace(paceMinPerKm)} min/km`;
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
    [currentReadings, sessionStats, movingTime, lapTime],
  );

  // Helper to get target value and status for a metric
  const getMetricTargetInfo = React.useCallback(
    (
      metric: MetricType,
    ): { target: string | null; status: "low" | "target" | "high" | null } => {
      const target = getMetricTarget(metric, currentTargets, profile);
      if (!target) return { target: null, status: null };

      const currentValue = getMetricNumericValue(metric);
      if (currentValue === null) return { target, status: null };

      // Extract numeric value from target string
      const targetNumeric = parseFloat(target);
      if (isNaN(targetNumeric)) return { target, status: null };

      const status = getTargetStatus(currentValue, targetNumeric);
      return { target, status };
    },
    [currentTargets, profile, getMetricNumericValue],
  );

  // Handle tap to expand
  const handleTapToExpand = React.useCallback(() => {
    focusZoneC();
  }, [focusZoneC]);

  // Calculate focused height
  // Parent container has paddingTop: insets.top already applied
  // We need to fill: screenHeight - insets.top (parent container) - 120 (footer)
  const focusedHeight = screenHeight - insets.top - 120;

  return (
    <View
      style={
        isFocused
          ? {
              // Focused: absolute positioning to overlay other zones
              // Account for safe area at top, leave space for footer at bottom
              position: "absolute",
              top: insets.top,
              bottom: 120, // Height of footer
              left: 0,
              right: 0,
            }
          : { flex: 1 }
      }
      className={
        isFocused
          ? "bg-card rounded-t-lg border-t border-x border-border overflow-hidden"
          : "bg-card rounded-lg border border-border overflow-hidden"
      }
    >
      {/* Tap to expand (only when not focused) */}
      {!isFocused && (
        <Pressable
          onPress={handleTapToExpand}
          className="p-4"
          accessibilityLabel="Tap to expand metrics"
          accessibilityHint="Expands the metrics to fill the screen"
        >
          {/* Metrics Grid - Always 2 columns (47% width per item + 6% gap = 100%) */}
          <View className="flex-row flex-wrap gap-4">
            {metricOrder.map((metric) => {
              const targetInfo = getMetricTargetInfo(metric);
              return (
                <MetricItem
                  key={metric}
                  label={metric}
                  value={getMetricValue(metric)}
                  target={targetInfo.target}
                  status={targetInfo.status}
                />
              );
            })}
          </View>
        </Pressable>
      )}

      {/* Focused state with minimize button */}
      {isFocused && (
        <>
          {/* Metrics Content (non-pressable when focused) - Enlarged */}
          <View className="flex-1 p-6">
            {/* Metrics Grid - Always 2 columns (47% width per item + 6% gap = 100%) */}
            <View className="flex-row flex-wrap gap-6">
              {metricOrder.map((metric) => {
                const targetInfo = getMetricTargetInfo(metric);
                return (
                  <MetricItemFocused
                    key={metric}
                    label={metric}
                    value={getMetricValue(metric)}
                    target={targetInfo.target}
                    status={targetInfo.status}
                  />
                );
              })}
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
              <Icon as={Minimize2} size={20} />
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

interface MetricItemProps {
  label: string;
  value: string;
  target?: string | null;
  status?: "low" | "target" | "high" | null;
}

/**
 * Get color based on target status
 */
function getStatusColor(status?: "low" | "target" | "high" | null): string {
  switch (status) {
    case "low":
      return "text-yellow-500"; // Below target
    case "target":
      return "text-green-500"; // On target
    case "high":
      return "text-red-500"; // Above target
    default:
      return "text-foreground"; // No target
  }
}

/**
 * Split value and unit from formatted string
 * e.g., "123 bpm" -> { value: "123", unit: "bpm" }
 */
function splitValueAndUnit(formattedValue: string): {
  value: string;
  unit: string;
} {
  const trimmed = formattedValue.trim();

  // Handle special cases
  if (trimmed === "--") {
    return { value: "--", unit: "" };
  }

  // Handle time format (HH:MM:SS or MM:SS) - no unit
  if (/^\d+:\d{2}(:\d{2})?$/.test(trimmed)) {
    return { value: trimmed, unit: "" };
  }

  // Split by last space to separate value from unit
  const lastSpaceIndex = trimmed.lastIndexOf(" ");
  if (lastSpaceIndex === -1) {
    return { value: trimmed, unit: "" };
  }

  return {
    value: trimmed.substring(0, lastSpaceIndex),
    unit: trimmed.substring(lastSpaceIndex + 1),
  };
}

/**
 * Normal metric item for compact view
 * Fixed 47% width ensures exactly 2 columns per row with proper spacing
 * Dynamic text sizing adjusts to fit content
 */
function MetricItem({ label, value, target, status }: MetricItemProps) {
  const statusColor = getStatusColor(status);
  const { value: numericValue, unit } = splitValueAndUnit(value);

  // Dynamic font size based on value length
  const getValueFontSize = () => {
    const length = numericValue.length;
    if (length <= 2) return 'text-3xl'; // Short values (e.g., "12")
    if (length <= 4) return 'text-2xl'; // Medium values (e.g., "1234")
    return 'text-xl'; // Long values
  };

  return (
    <View className="w-[47%]" style={{ maxWidth: '50%' }}>
      {/* Top: Metric Title */}
      <Text
        className="text-xs text-muted-foreground mb-1"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>

      {/* Middle: Content Row - Value (left) and Unit (right) */}
      <View className="flex-row items-baseline justify-between mb-0.5">
        <Text
          className={`${getValueFontSize()} font-semibold ${statusColor}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ flexShrink: 1, flexBasis: '70%' }}
        >
          {numericValue}
        </Text>
        {unit && (
          <Text
            className={`text-xs font-medium ${statusColor}`}
            numberOfLines={1}
            style={{ flexShrink: 0, marginLeft: 4 }}
          >
            {unit}
          </Text>
        )}
      </View>

      {/* Bottom: Target (conditional) */}
      {target && (
        <Text
          className="text-xs text-muted-foreground mt-0.5"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          Target: {target}
        </Text>
      )}
    </View>
  );
}

/**
 * Enlarged metric item for focused view
 * Fixed 47% width ensures exactly 2 columns per row with proper spacing
 * Dynamic text sizing adjusts to fit content
 */
function MetricItemFocused({ label, value, target, status }: MetricItemProps) {
  const statusColor = getStatusColor(status);
  const { value: numericValue, unit } = splitValueAndUnit(value);

  // Dynamic font size based on value length
  const getValueFontSize = () => {
    const length = numericValue.length;
    if (length <= 2) return 'text-5xl'; // Short values (e.g., "12")
    if (length <= 4) return 'text-4xl'; // Medium values (e.g., "1234")
    return 'text-3xl'; // Long values
  };

  return (
    <View className="w-[47%]" style={{ maxWidth: '50%' }}>
      {/* Top: Metric Title */}
      <Text
        className="text-sm text-muted-foreground mb-2"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>

      {/* Middle: Content Row - Value (left) and Unit (right) */}
      <View className="flex-row items-baseline justify-between mb-1">
        <Text
          className={`${getValueFontSize()} font-bold ${statusColor}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{ flexShrink: 1, flexBasis: '70%' }}
        >
          {numericValue}
        </Text>
        {unit && (
          <Text
            className={`text-sm font-semibold ${statusColor}`}
            numberOfLines={1}
            style={{ flexShrink: 0, marginLeft: 6 }}
          >
            {unit}
          </Text>
        )}
      </View>

      {/* Bottom: Target (conditional) */}
      {target && (
        <Text
          className="text-sm text-muted-foreground mt-2"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          Target: {target}
        </Text>
      )}
    </View>
  );
}
