import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  downsampleGPSRoute,
  downsampleStream,
} from "@/lib/utils/streamSampling";
import React, { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface ActivityRouteMapProps {
  coordinates: Coordinate[];
  timestamps?: number[];
  colorBy?: "speed" | "power" | "heartrate" | "elevation" | "none";
  colorData?: number[]; // Metric values corresponding to each coordinate
  title?: string;
  compact?: boolean;
  height?: number;
  showMarkers?: boolean;
}

/**
 * Get color for a value in a gradient from blue (low) to red (high)
 */
function getGradientColor(value: number, min: number, max: number): string {
  if (max === min) return "#3b82f6"; // Default blue if no variation

  const normalized = (value - min) / (max - min);
  // HSL: blue (240) to red (0)
  const hue = 240 - normalized * 240;
  return `hsl(${hue}, 100%, 50%)`;
}

/**
 * Split polyline into colored segments based on metric values
 */
function getColoredSegments(
  coordinates: Coordinate[],
  colorData: number[],
): Array<{ coordinates: Coordinate[]; color: string }> {
  if (colorData.length === 0 || colorData.length !== coordinates.length) {
    return [{ coordinates, color: "#3b82f6" }]; // Single blue line
  }

  const min = Math.min(...colorData);
  const max = Math.max(...colorData);
  const segments: Array<{ coordinates: Coordinate[]; color: string }> = [];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentCoords = [coordinates[i], coordinates[i + 1]];
    const avgValue = (colorData[i] + colorData[i + 1]) / 2;
    const color = getGradientColor(avgValue, min, max);

    segments.push({ coordinates: segmentCoords, color });
  }

  return segments;
}

export function ActivityRouteMap({
  coordinates,
  timestamps = [],
  colorBy = "none",
  colorData = [],
  title = "Route",
  compact = false,
  height = 300,
  showMarkers = true,
}: ActivityRouteMapProps) {
  const mapRef = useRef<MapView>(null);

  // Downsample coordinates for performance
  const { processedCoordinates, segments } = useMemo(() => {
    if (coordinates.length === 0) {
      return { processedCoordinates: [], segments: [] };
    }

    // Downsample GPS route with timestamps
    const coordPairs = coordinates.map((c) => [c.latitude, c.longitude]) as [
      number,
      number,
    ][];

    const timestampsToUse =
      timestamps.length > 0 ? timestamps : coordPairs.map((_, i) => i);

    const { coordinates: sampledCoords, timestamps: sampledTimestamps } =
      downsampleGPSRoute(coordPairs, timestampsToUse, 500);

    const sampledCoordinates = sampledCoords.map(([lat, lng]) => ({
      latitude: lat,
      longitude: lng,
    }));

    // Downsample color data to match coordinates if provided
    let sampledColorData: number[] = [];
    if (colorBy !== "none" && colorData.length > 0) {
      // Only downsample if colorData matches original coordinates length
      if (colorData.length === coordinates.length) {
        const { values: downsampled } = downsampleStream(
          colorData,
          timestampsToUse,
          500,
          "avg",
        );
        sampledColorData = downsampled;
      } else {
        // If already downsampled or misaligned, use as is
        sampledColorData = colorData.slice(0, sampledCoordinates.length);
      }
    }

    // Create colored segments if color data provided
    const colorSegments =
      colorBy !== "none" && sampledColorData.length > 0
        ? getColoredSegments(sampledCoordinates, sampledColorData)
        : [{ coordinates: sampledCoordinates, color: "#3b82f6" }];

    return {
      processedCoordinates: sampledCoordinates,
      segments: colorSegments,
    };
  }, [coordinates, timestamps, colorBy, colorData]);

  // Fit map to route on mount
  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (processedCoordinates.length > 0 && mapRef.current) {
      timeoutId = setTimeout(() => {
        if (isMounted && mapRef.current) {
          mapRef.current?.fitToCoordinates(processedCoordinates, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: false,
          });
        }
      }, 100);
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [processedCoordinates]);

  if (processedCoordinates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <View
            style={{ height }}
            className="items-center justify-center bg-muted rounded-lg"
          >
            <Text className="text-muted-foreground">No GPS data available</Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  const startCoord = processedCoordinates[0];
  const endCoord = processedCoordinates[processedCoordinates.length - 1];

  return (
    <Card>
      {!compact && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {colorBy !== "none" && (
            <View className="flex-row items-center gap-2 mt-1">
              <Text className="text-xs text-muted-foreground">
                Color by: {colorBy}
              </Text>
              <View className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full bg-[hsl(240,100%,50%)]" />
                <Text className="text-xs text-muted-foreground">Low</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full bg-[hsl(0,100%,50%)]" />
                <Text className="text-xs text-muted-foreground">High</Text>
              </View>
            </View>
          )}
        </CardHeader>
      )}
      <CardContent className={compact ? "p-2" : undefined}>
        <View
          style={{ height }}
          className="rounded-lg overflow-hidden border border-border"
        >
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: startCoord.latitude,
              longitude: startCoord.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={!compact}
            showsScale={!compact}
            toolbarEnabled={false}
          >
            {/* Colored route segments */}
            {segments.map((segment, index) => (
              <Polyline
                key={index}
                coordinates={segment.coordinates}
                strokeColor={segment.color}
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
              />
            ))}

            {/* Start marker */}
            {showMarkers && (
              <Marker
                coordinate={startCoord}
                anchor={{ x: 0.5, y: 0.5 }}
                title="Start"
              >
                <View className="w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
              </Marker>
            )}

            {/* End marker */}
            {showMarkers && (
              <Marker
                coordinate={endCoord}
                anchor={{ x: 0.5, y: 0.5 }}
                title="Finish"
              >
                <View className="w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
              </Marker>
            )}
          </MapView>
        </View>
      </CardContent>
    </Card>
  );
}
