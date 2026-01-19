/**
 * GPSStatusOverlay - GPS Signal Loss Indicator
 *
 * Displays an overlay when GPS signal is lost or weak during outdoor activities.
 * This component monitors location updates and shows a "GPS Searching..." message
 * when signal quality is poor or unavailable.
 *
 * Features:
 * - Non-blocking overlay (recording continues)
 * - Auto-hides when GPS signal restored
 * - Animated fade in/out
 * - Shows last known position status
 */

import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

export interface GPSStatusOverlayProps {
  service: ActivityRecorderService | null;
  isOutdoor: boolean;
}

/**
 * Determines if GPS signal is currently available/strong
 * Based on recent location updates from the service
 */
function useGPSStatus(service: ActivityRecorderService | null, isOutdoor: boolean): {
  hasSignal: boolean;
  lastUpdateTime: number | null;
  lastAccuracy: number | null;
} {
  const [hasSignal, setHasSignal] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  useEffect(() => {
    if (!service || !isOutdoor) {
      setHasSignal(true);
      return;
    }

    // Initialize with current time - assume GPS active on mount
    setLastUpdateTime(Date.now());
    setHasSignal(true);

    // Subscribe to location updates from service
    const handleLocationUpdate = (location: any) => {
      setLastUpdateTime(Date.now());
      setLastAccuracy(location?.coords?.accuracy ?? null);

      // Signal is good if accuracy is reasonable
      const isAccurate = location?.coords?.accuracy !== undefined &&
                         location?.coords?.accuracy !== null &&
                         location.coords.accuracy <= 20;

      setHasSignal(isAccurate);
    };

    service.locationManager.addCallback(handleLocationUpdate);

    // Check for stale GPS data or poor accuracy periodically
    const checkInterval = setInterval(() => {
      try {
        const now = Date.now();
        setLastUpdateTime((prevTime) => {
          setLastAccuracy((prevAccuracy) => {
            if (!prevTime) return prevAccuracy;

            const timeSinceUpdate = now - prevTime;

            // GPS signal is lost if EITHER:
            // 1. No update in last 5 seconds (staleness)
            // 2. Accuracy > 20 meters or accuracy is null (poor signal)
            const isStale = timeSinceUpdate > 5000;
            const isInaccurate = prevAccuracy === null || prevAccuracy > 20;

            if (isStale || isInaccurate) {
              setHasSignal(false);
            } else {
              setHasSignal(true);
            }

            return prevAccuracy;
          });
          return prevTime; // Don't update time in the check interval
        });
      } catch (error) {
        console.error("[GPSStatusOverlay] Error checking GPS status:", error);
      }
    }, 2000); // Check every 2 seconds

    return () => {
      clearInterval(checkInterval);
      service.locationManager.removeCallback(handleLocationUpdate);
    };
    // IMPORTANT: Do not include lastUpdateTime in deps to prevent infinite loop
    // The interval checks status periodically without re-creating itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, isOutdoor]);

  return { hasSignal, lastUpdateTime, lastAccuracy };
}

export function GPSStatusOverlay({ service, isOutdoor }: GPSStatusOverlayProps) {
  const { hasSignal, lastUpdateTime, lastAccuracy } = useGPSStatus(service, isOutdoor);

  // Only show overlay for outdoor activities when GPS signal is lost
  if (!isOutdoor || hasSignal) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      className="absolute inset-0 items-center justify-center bg-background/80 backdrop-blur-sm z-30"
      pointerEvents="none"
    >
      <View className="bg-card p-6 rounded-lg shadow-lg border border-border items-center">
        <ActivityIndicator size="large" className="mb-4" />
        <Text className="text-lg font-semibold mb-2">GPS Searching...</Text>
        <Text className="text-sm text-muted-foreground text-center max-w-xs">
          Your recording is still active. GPS signal will reconnect automatically.
        </Text>
        {lastUpdateTime && (
          <Text className="text-xs text-muted-foreground mt-3">
            Last update: {Math.round((Date.now() - lastUpdateTime) / 1000)}s ago
          </Text>
        )}
        {lastAccuracy !== null && lastAccuracy > 20 && (
          <Text className="text-xs text-muted-foreground mt-1">
            Poor accuracy: ±{Math.round(lastAccuracy)}m
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
