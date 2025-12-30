import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useActivityStatus,
  useCurrentReadings,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { Minus, Plus } from "lucide-react-native";
import React, { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { CARD_STYLES } from "../constants";

interface MapCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

interface VirtualLocation {
  latitude: number;
  longitude: number;
  heading: number;
}

// Helper to calculate new position based on bearing, distance, and starting point
function calculateNewPosition(
  lat: number,
  lng: number,
  bearing: number,
  distanceMeters: number,
): { latitude: number; longitude: number } {
  const R = 6378137; // Earth's radius in meters
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const bearingRad = (bearing * Math.PI) / 180;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distanceMeters / R) +
      Math.cos(latRad) * Math.sin(distanceMeters / R) * Math.cos(bearingRad),
  );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distanceMeters / R) * Math.cos(latRad),
      Math.cos(distanceMeters / R) - Math.sin(latRad) * Math.sin(newLatRad),
    );

  return {
    latitude: (newLatRad * 180) / Math.PI,
    longitude: (newLngRad * 180) / Math.PI,
  };
}

export const MapCard = memo(({ service, screenWidth }: MapCardProps) => {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);

  // Get activity status to determine indoor/outdoor
  const { activityLocation } = useActivityStatus(service);
  const isIndoor = activityLocation === "indoor";
  const state = useRecordingState(service);

  // Get real GPS coordinates for outdoor activities
  const current = useCurrentReadings(service);

  // For outdoor: use real GPS
  const realLatitude = current.position?.lat;
  const realLongitude = current.position?.lng;
  const realAltitude = current.position?.altitude;
  const realHeading = current.position?.heading;

  const hasRealLocation =
    realLatitude !== undefined &&
    realLongitude !== undefined &&
    !isNaN(realLatitude) &&
    !isNaN(realLongitude) &&
    realLatitude !== 0 &&
    realLongitude !== 0;

  // Debug: Log GPS coordinates
  useEffect(() => {
    if (!isIndoor) {
      console.log("[MapCard] GPS Update:", {
        hasRealLocation,
        lat: realLatitude,
        lng: realLongitude,
        heading: realHeading,
        altitude: realAltitude,
      });
    }
  }, [
    realLatitude,
    realLongitude,
    hasRealLocation,
    isIndoor,
    realHeading,
    realAltitude,
  ]);

  // For indoor: simulate location based on speed/time (only if route exists)
  // Initialize to null and set when we have valid data
  const [virtualLocation, setVirtualLocation] =
    useState<VirtualLocation | null>(null);

  // Initialize virtual location when we have valid data
  useEffect(() => {
    if (virtualLocation) return; // Already initialized

    if (hasRealLocation) {
      setVirtualLocation({
        latitude: realLatitude,
        longitude: realLongitude,
        heading: realHeading || 0,
      });
    } else if (route?.coordinates && route.coordinates.length > 0) {
      setVirtualLocation({
        latitude: route.coordinates[0].lat,
        longitude: route.coordinates[0].lng,
        heading: 0,
      });
    }
  }, [
    hasRealLocation,
    realLatitude,
    realLongitude,
    realHeading,
    route,
    virtualLocation,
  ]);

  const lastUpdateTime = useRef<number>(Date.now());

  // Get route data from service (if available)
  const route = service?.currentRoute;
  const hasRoute = service?.hasRoute || false;
  const routeProgress = service?.routeProgress || 0;

  // Get recorded GPS path (user's actual traveled path)
  const recordedPath = service?.recordedGpsPath || [];

  // Update virtual location for indoor activities (only if route exists)
  useEffect(() => {
    if (!isIndoor || !service || !hasRoute || !virtualLocation) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateTime.current) / 1000; // seconds
      lastUpdateTime.current = now;

      // Get current speed (m/s)
      const speedKmh = current.speed || 0;
      const speedMs = (speedKmh * 1000) / 3600;

      // Calculate distance traveled since last update
      const distanceTraveled = speedMs * deltaTime;

      if (distanceTraveled > 0) {
        // Update heading based on route or random if no route
        const newHeading = virtualLocation.heading + (Math.random() - 0.5) * 10; // Slight variation

        // Calculate new position
        const newPosition = calculateNewPosition(
          virtualLocation.latitude,
          virtualLocation.longitude,
          newHeading,
          distanceTraveled,
        );

        setVirtualLocation({
          ...newPosition,
          heading: newHeading,
        });
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [isIndoor, current.speed, service, virtualLocation, hasRoute]);

  // Determine which location to display
  // For outdoor: ALWAYS use real GPS (or wait for it), fallback to default location
  // For indoor: use virtual location only if it's initialized
  const DEFAULT_LAT = 37.7749; // San Francisco as fallback
  const DEFAULT_LNG = -122.4194;

  const displayLatitude = isIndoor
    ? virtualLocation?.latitude || DEFAULT_LAT
    : realLatitude || DEFAULT_LAT;
  const displayLongitude = isIndoor
    ? virtualLocation?.longitude || DEFAULT_LNG
    : realLongitude || DEFAULT_LNG;
  const displayHeading = isIndoor
    ? virtualLocation?.heading || 0
    : realHeading || 0;
  const displayAltitude = isIndoor ? undefined : realAltitude;

  // Check if we have a valid display location (not the default fallback and recording started)
  const hasValidDisplayLocation =
    hasRealLocation ||
    (virtualLocation !== null &&
      virtualLocation.latitude !== DEFAULT_LAT &&
      virtualLocation.longitude !== DEFAULT_LNG);

  // Zoom control handlers - properly calculate deltas for zoom levels
  const handleZoomIn = async () => {
    if (!mapRef.current || !hasValidDisplayLocation) return;

    try {
      const camera = await mapRef.current.getCamera();
      const currentDelta = camera.zoom ? 0.05 / Math.pow(2, camera.zoom) : 0.01;

      // Decrease delta = zoom in
      const newDelta = currentDelta / 2;

      mapRef.current.animateToRegion(
        {
          latitude: displayLatitude,
          longitude: displayLongitude,
          latitudeDelta: newDelta,
          longitudeDelta: newDelta,
        },
        500,
      );
    } catch (error) {
      console.error("[MapCard] Zoom in error:", error);
    }
  };

  const handleZoomOut = async () => {
    if (!mapRef.current || !hasValidDisplayLocation) return;

    try {
      const camera = await mapRef.current.getCamera();
      const currentDelta = camera.zoom ? 0.05 / Math.pow(2, camera.zoom) : 0.01;

      // Increase delta = zoom out
      const newDelta = currentDelta * 2;

      mapRef.current.animateToRegion(
        {
          latitude: displayLatitude,
          longitude: displayLongitude,
          latitudeDelta: newDelta,
          longitudeDelta: newDelta,
        },
        500,
      );
    } catch (error) {
      console.error("[MapCard] Zoom out error:", error);
    }
  };

  // Center map on user location with heading-based rotation
  useEffect(() => {
    if (mapReady && mapRef.current && hasValidDisplayLocation) {
      try {
        mapRef.current.animateToRegion(
          {
            latitude: displayLatitude,
            longitude: displayLongitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          1000,
        );
      } catch (error) {
        console.error("[MapCard] Error animating camera:", error);
      }
    }
  }, [
    displayLatitude,
    displayLongitude,
    displayHeading,
    mapReady,
    hasValidDisplayLocation,
  ]);

  // Get current environmental data
  const grade = current.grade || 0;
  const temperature = current.temperature; // May be undefined
  // Weather would come from an API or service property

  // Show skeleton message for indoor activities without a route
  if (isIndoor && !hasRoute) {
    return (
      <View
        style={{ width: screenWidth }}
        className={CARD_STYLES.outerContainer}
      >
        <Card className="flex-1 py-0">
          <CardContent className={CARD_STYLES.content}>
            <View className="flex-1 items-center justify-center">
              <Text className="text-lg font-semibold text-muted-foreground mb-2">
                No Route Available
              </Text>
              <Text className="text-sm text-muted-foreground text-center px-4">
                GPS navigation requires a route. Load a route or switch to
                outdoor mode to use the map.
              </Text>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <View style={{ width: screenWidth }} className={CARD_STYLES.outerContainer}>
      <Card className="flex-1 py-0">
        <CardContent className="p-0 flex-1 overflow-hidden">
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
              latitude: displayLatitude,
              longitude: displayLongitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            rotateEnabled={false}
            pitchEnabled={false}
            scrollEnabled={false}
            zoomEnabled={false}
            onMapReady={() => setMapReady(true)}
          >
            {/* GPS Loading Overlay - Only show for outdoor when not yet acquired GPS */}
            {!isIndoor && !hasRealLocation && state !== "pending" && (
              <View
                style={StyleSheet.absoluteFillObject}
                className="items-center justify-center bg-background/80"
              >
                <View className="bg-card p-6 rounded-lg border border-border shadow-lg mx-4">
                  <Text className="text-lg font-semibold text-center mb-2">
                    Acquiring GPS Signal...
                  </Text>
                  <Text className="text-sm text-muted-foreground text-center">
                    Make sure you're outdoors with a clear view of the sky.
                  </Text>
                </View>
              </View>
            )}
            {/* Recorded GPS path (user's actual traveled path) - Red */}
            {recordedPath.length > 1 && (
              <Polyline
                coordinates={recordedPath}
                strokeColor="#ef4444"
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            )}

            {/* Route polyline (planned route) - Blue, behind recorded path */}
            {hasRoute && route?.coordinates && (
              <Polyline
                coordinates={route.coordinates.map((coord: any) => ({
                  latitude: coord.lat,
                  longitude: coord.lng,
                }))}
                strokeColor="#3b82f6"
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
                zIndex={1}
              />
            )}

            {/* User position marker */}
            <Marker
              coordinate={{
                latitude: displayLatitude,
                longitude: displayLongitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              rotation={displayHeading}
              flat={true}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: isIndoor ? "#f59e0b" : "#ef4444", // Orange for indoor, red for outdoor
                  borderWidth: 3,
                  borderColor: "#ffffff",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 3,
                  elevation: 5,
                }}
              />
            </Marker>
          </MapView>

          {/* Zoom Controls - Bottom-Right */}
          <View className="absolute bottom-20 right-3 flex-col gap-2">
            <Button
              size="icon"
              variant="outline"
              onPress={handleZoomIn}
              className="w-12 h-12 rounded-full bg-background/90 backdrop-blur-sm shadow-lg"
            >
              <Icon as={Plus} size={24} />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onPress={handleZoomOut}
              className="w-12 h-12 rounded-full bg-background/90 backdrop-blur-sm shadow-lg"
            >
              <Icon as={Minus} size={24} />
            </Button>
          </View>

          {/* Top-Left Overlay: Grade */}
          <View className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border">
            <Text className="text-xs text-muted-foreground mb-0.5">Grade</Text>
            <Text className="text-lg font-bold">{grade.toFixed(1)}%</Text>
          </View>

          {/* Top-Right Overlay: Temperature (if available) */}
          {temperature !== undefined && (
            <View className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border">
              <Text className="text-xs text-muted-foreground mb-0.5">Temp</Text>
              <Text className="text-lg font-bold">
                {Math.round(temperature)}°
              </Text>
            </View>
          )}

          {/* Bottom-Right Overlay: Route Progress (if route available) */}
          {hasRoute && (
            <View className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border">
              <Text className="text-xs text-muted-foreground mb-0.5">
                Route
              </Text>
              <Text className="text-lg font-bold">
                {routeProgress.toFixed(0)}%
              </Text>
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
});

MapCard.displayName = "MapCard";
