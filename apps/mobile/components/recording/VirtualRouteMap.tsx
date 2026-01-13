/**
 * VirtualRouteMap Component
 *
 * Displays an indoor virtual route with:
 * - Route polyline (full route path)
 * - Virtual position marker (current position based on distance traveled)
 * - Progress overlay (% complete, current grade, distance remaining)
 *
 * This component is used for indoor activities with attached routes.
 * Distance is tracked via speed sensors, not GPS.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { decodePolyline } from "@repo/core";

export interface VirtualRouteMapProps {
  service: ActivityRecorderService;
  isFocused?: boolean;
}

interface VirtualPosition {
  latitude: number;
  longitude: number;
  elevation?: number;
}

/**
 * Map cumulative distance to lat/lng coordinates on route
 * Uses linear interpolation between route points
 */
function mapDistanceToPosition(
  distance: number,
  coordinates: Array<{ latitude: number; longitude: number; elevation?: number }>
): VirtualPosition | null {
  if (coordinates.length === 0) return null;
  if (distance <= 0) return coordinates[0] || null;

  // Calculate cumulative distance for each point
  let cumulativeDistance = 0;
  const coordinatesWithDistance: Array<VirtualPosition & { distance: number }> = [
    { ...coordinates[0]!, distance: 0 },
  ];

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1]!;
    const curr = coordinates[i]!;
    // Calculate distance using Haversine formula
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (prev.latitude * Math.PI) / 180;
    const φ2 = (curr.latitude * Math.PI) / 180;
    const Δφ = ((curr.latitude - prev.latitude) * Math.PI) / 180;
    const Δλ = ((curr.longitude - prev.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const segmentDistance = R * c;
    cumulativeDistance += segmentDistance;
    coordinatesWithDistance.push({
      ...curr,
      distance: cumulativeDistance,
    });
  }

  // Find the segment containing the target distance
  for (let i = 0; i < coordinatesWithDistance.length - 1; i++) {
    const start = coordinatesWithDistance[i]!;
    const end = coordinatesWithDistance[i + 1]!;

    if (distance >= start.distance && distance <= end.distance) {
      // Linear interpolation within segment
      const segmentLength = end.distance - start.distance;
      if (segmentLength === 0) return start;

      const ratio = (distance - start.distance) / segmentLength;

      return {
        latitude: start.latitude + ratio * (end.latitude - start.latitude),
        longitude: start.longitude + ratio * (end.longitude - start.longitude),
        elevation:
          start.elevation !== undefined && end.elevation !== undefined
            ? start.elevation + ratio * (end.elevation - start.elevation)
            : undefined,
      };
    }
  }

  // If distance exceeds route length, return last point
  return coordinatesWithDistance[coordinatesWithDistance.length - 1] || null;
}

export function VirtualRouteMap({ service, isFocused = false }: VirtualRouteMapProps) {
  const [currentRouteDistance, setCurrentRouteDistance] = useState(0);
  const [routeProgress, setRouteProgress] = useState(0);
  const [currentGrade, setCurrentGrade] = useState(0);

  // Get route data from service
  const route = service?.currentRoute;
  const routeDistance = service?.routeDistance || 0;

  // Decode route polyline to coordinates
  const coordinates = useMemo(() => {
    if (!route?.polyline) return [];
    try {
      return decodePolyline(route.polyline);
    } catch (error) {
      console.error("[VirtualRouteMap] Failed to decode polyline:", error);
      return [];
    }
  }, [route?.polyline]);

  // Calculate virtual position based on distance traveled
  const virtualPosition = useMemo(() => {
    return mapDistanceToPosition(currentRouteDistance, coordinates);
  }, [currentRouteDistance, coordinates]);

  // Update metrics from service (every second)
  useEffect(() => {
    if (!service) return;

    const interval = setInterval(() => {
      setCurrentRouteDistance(service.currentRouteDistance || 0);
      setRouteProgress(service.routeProgress || 0);
      // Get current grade using the getter
      // Note: getCurrentGrade is a getter, not a method
      try {
        const grade = (service as any).getCurrentGrade || 0;
        setCurrentGrade(typeof grade === 'number' ? grade : 0);
      } catch {
        setCurrentGrade(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [service]);

  // Calculate bounds for map viewport
  const bounds = useMemo(() => {
    if (coordinates.length === 0) {
      return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
    }

    const firstCoord = coordinates[0]!;
    let minLat = firstCoord.latitude;
    let maxLat = firstCoord.latitude;
    let minLng = firstCoord.longitude;
    let maxLng = firstCoord.longitude;

    for (const coord of coordinates) {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLng = Math.min(minLng, coord.longitude);
      maxLng = Math.max(maxLng, coord.longitude);
    }

    return { minLat, maxLat, minLng, maxLng };
  }, [coordinates]);

  if (!route || coordinates.length === 0) {
    return (
      <View style={styles.container}>
        <Text className="text-muted-foreground text-center">
          No route data available
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map Placeholder - Will be replaced with actual MapView component */}
      <View style={styles.mapPlaceholder}>
        <Text className="text-muted-foreground text-xs mb-2">
          Virtual Route Map
        </Text>
        <Text className="text-xs text-muted-foreground">
          Route: {route.name || "Unnamed Route"}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Points: {coordinates.length}
        </Text>
        {virtualPosition && (
          <Text className="text-xs text-primary mt-2">
            Position: {virtualPosition.latitude.toFixed(5)}, {virtualPosition.longitude.toFixed(5)}
          </Text>
        )}
      </View>

      {/* Progress Overlay */}
      <View style={[styles.overlay, isFocused && styles.overlayFocused]}>
        {/* Progress Percentage */}
        <View style={styles.progressCard}>
          <Text className="text-xs text-muted-foreground">Progress</Text>
          <Text className="text-2xl font-bold">{routeProgress.toFixed(1)}%</Text>
        </View>

        {/* Current Grade */}
        {currentGrade !== 0 && (
          <View style={styles.gradeCard}>
            <Text className="text-xs text-muted-foreground">Grade</Text>
            <Text className={`text-xl font-bold ${currentGrade > 0 ? "text-orange-500" : "text-blue-500"}`}>
              {currentGrade > 0 ? "+" : ""}{currentGrade.toFixed(1)}%
            </Text>
          </View>
        )}

        {/* Distance Remaining */}
        <View style={styles.distanceCard}>
          <Text className="text-xs text-muted-foreground">Remaining</Text>
          <Text className="text-lg font-semibold">
            {((routeDistance - currentRouteDistance) / 1000).toFixed(2)} km
          </Text>
        </View>
      </View>

      {/* Virtual Position Marker Indicator */}
      {virtualPosition && (
        <View style={styles.markerIndicator}>
          <View style={styles.markerDot} />
          <Text className="text-xs text-primary ml-2">
            Your position on route
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  overlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  overlayFocused: {
    top: 20,
    left: 20,
    right: 20,
  },
  progressCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 80,
  },
  gradeCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 80,
  },
  distanceCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flex: 1,
  },
  markerIndicator: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3b82f6",
  },
});
