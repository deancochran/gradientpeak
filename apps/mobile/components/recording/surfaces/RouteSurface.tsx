/**
 * Route Surface
 *
 * Shows live GPS navigation, breadcrumb context, or virtual route guidance for
 * sessions with an attached route.
 */

import type { RecordingRouteMode } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import type { LocationObject } from "expo-location";
import { Navigation } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { type Camera, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { GPSStatusOverlay } from "@/components/recording/GPSStatusOverlay";
import { VirtualRouteMap } from "@/components/recording/VirtualRouteMap";
import { useGpsTracking } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { SurfaceUnavailableCard } from "./SurfaceUnavailableCard";

export interface RouteSurfaceProps {
  service: ActivityRecorderService | null;
  gpsRecordingEnabled: boolean;
  hasRoute: boolean;
  routeMode: RecordingRouteMode;
}

export function RouteSurface({
  service,
  gpsRecordingEnabled,
  hasRoute,
  routeMode,
}: RouteSurfaceProps) {
  const { gpsEnabled } = useGpsTracking(service);
  const mapRef = useRef<MapView>(null);
  const isLiveNavigation = routeMode === "live_navigation";

  // GPS state
  const [currentLocation, setCurrentLocation] = useState<LocationObject | null>(null);
  const [breadcrumbTrail, setBreadcrumbTrail] = useState<
    Array<{ latitude: number; longitude: number }>
  >([]);
  const [isAutoCentered, setIsAutoCentered] = useState(true); // Track if map auto-follows user
  const [, setCurrentHeading] = useState<number>(0); // Track user's heading for rotation (GPS-based)
  const [magnetometerHeading, setMagnetometerHeading] = useState<number>(0); // Track magnetometer heading (works when stationary)
  const [userInteracting, setUserInteracting] = useState(false); // Track if user is actively panning/zooming

  // Route overlay (blue line)
  const routeCoordinates = React.useMemo(() => {
    if (!hasRoute || !service?.currentRoute?.coordinates) return [];

    // Convert route coordinates to map format
    return service.currentRoute.coordinates.map((coord: any) => ({
      latitude: coord.lat || coord.latitude,
      longitude: coord.lng || coord.longitude,
    }));
  }, [hasRoute, service?.currentRoute]);

  // Subscribe to GPS location updates
  useEffect(() => {
    if (!service || !isLiveNavigation) return;

    // Subscribe to location updates
    const handleLocationUpdate = (loc: LocationObject) => {
      setCurrentLocation(loc);

      // Update heading if available (may be null when stationary)
      if (loc.coords.heading !== null && loc.coords.heading !== undefined) {
        setCurrentHeading(loc.coords.heading);
      }

      // Auto-center map with heading rotation if enabled and recording
      if (isAutoCentered && mapRef.current && service.state === "recording") {
        const camera: Camera = {
          center: {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          },
          pitch: 0,
          heading: magnetometerHeading, // Use magnetometer heading (works when stationary)
          altitude: 1000,
          zoom: 16, // Good zoom level for navigation
        };

        mapRef.current.animateCamera(camera, { duration: 500 });
      }
    };

    service.locationManager.addCallback(handleLocationUpdate);

    return () => {
      service.locationManager.removeCallback(handleLocationUpdate);
    };
  }, [service, isAutoCentered, isLiveNavigation, magnetometerHeading]);

  // Subscribe to magnetometer heading updates
  useEffect(() => {
    if (!service || !isLiveNavigation) return;

    const handleHeadingUpdate = (headingObject: any) => {
      const newHeading = headingObject.magHeading ?? headingObject.trueHeading ?? 0;

      // Smooth interpolation to prevent jitter
      setMagnetometerHeading((prev) => {
        let delta = newHeading - prev;

        // Handle 0°/360° wrap-around (e.g., 359° -> 1° should rotate 2°, not -358°)
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        // Apply 30% interpolation factor for smooth transitions
        const interpolated = prev + delta * 0.3;

        // Normalize to 0-360 range
        return (interpolated + 360) % 360;
      });
    };

    service.locationManager.addHeadingCallback(handleHeadingUpdate);

    return () => {
      service.locationManager.removeHeadingCallback(handleHeadingUpdate);
    };
  }, [service, isLiveNavigation]);

  // Update breadcrumb trail from service's recorded GPS path
  useEffect(() => {
    if (!service || !isLiveNavigation) return;

    const updateTrail = () => {
      const path = service.recordedGpsPath;
      setBreadcrumbTrail(path);
    };

    // Update immediately
    updateTrail();

    // Update periodically (every 2 seconds)
    const interval = setInterval(updateTrail, 2000);

    return () => clearInterval(interval);
  }, [service, isLiveNavigation]);

  // Handle user interaction start (pan/zoom begins)
  const handleRegionChange = React.useCallback(() => {
    // Mark that user is actively interacting
    setUserInteracting(true);
  }, []);

  // Handle user manually panning/zooming the map
  const handleRegionChangeComplete = React.useCallback(() => {
    // User has manually panned the map, disable auto-center after interaction ends
    if (userInteracting && isAutoCentered) {
      setIsAutoCentered(false);
    }
    setUserInteracting(false);
  }, [isAutoCentered, userInteracting]);

  // Handle re-center button click
  const handleReCenter = React.useCallback(() => {
    if (currentLocation && mapRef.current) {
      // Animate to current location with heading-up orientation
      const camera: Camera = {
        center: {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        },
        pitch: 0,
        heading: magnetometerHeading, // Use magnetometer heading (works when stationary)
        altitude: 1000,
        zoom: 16,
      };

      mapRef.current.animateCamera(camera, { duration: 500 });

      // Re-enable auto-center
      setIsAutoCentered(true);
    }
  }, [currentLocation, magnetometerHeading]);

  if (!hasRoute || routeMode === "none") {
    return (
      <SurfaceUnavailableCard
        title="No route attached"
        description="Attach a route for navigation or virtual route guidance."
      />
    );
  }

  if (routeMode === "virtual" && service) {
    return (
      <View className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
        <VirtualRouteMap service={service} isFocused={true} />
      </View>
    );
  }

  const mapRegion = currentLocation
    ? {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : getRouteRegion(routeCoordinates);

  if (routeMode === "preview") {
    if (!mapRegion) {
      return (
        <SurfaceUnavailableCard
          title="Route preview unavailable"
          description="This route is attached, but no map geometry is available to preview."
        />
      );
    }

    return (
      <RoutePreviewMap
        mapRegion={routeCoordinates[0] ?? mapRegion}
        routeCoordinates={routeCoordinates}
      />
    );
  }

  if (!isLiveNavigation || !gpsRecordingEnabled || !gpsEnabled) {
    return (
      <SurfaceUnavailableCard
        title="Live route unavailable"
        description="Live navigation needs GPS access. You can still preview or use virtual route guidance when available."
      />
    );
  }

  if (!mapRegion) {
    return (
      <SurfaceUnavailableCard
        title="Live route unavailable"
        description="Live navigation is waiting for GPS or route geometry before rendering a map."
      />
    );
  }

  return (
    <View className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <View className="flex-1">
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={{ flex: 1 }}
          initialRegion={mapRegion}
          mapType="standard"
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={true}
          showsScale={true}
          toolbarEnabled={false}
          rotateEnabled={true}
          pitchEnabled={false}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#3b82f6"
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {breadcrumbTrail.length > 1 && (
            <Polyline
              coordinates={breadcrumbTrail}
              strokeColor="#ef4444"
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          )}
        </MapView>
      </View>

      {/* GPS Status Overlay (GPS ON only) */}
      {gpsRecordingEnabled && (
        <GPSStatusOverlay service={service} gpsRecordingEnabled={gpsRecordingEnabled} />
      )}

      {/* Re-center Button (shows when not auto-centered, in both normal and focused) */}
      {!isAutoCentered && currentLocation && gpsRecordingEnabled && (
        <View className="absolute bottom-4 right-4">
          <Button
            size="icon"
            variant="default"
            onPress={handleReCenter}
            className="h-12 w-12 rounded-full bg-primary shadow-lg"
            accessibilityLabel="Re-center map"
            accessibilityHint="Centers the map on your current location"
          >
            <Icon as={Navigation} size={20} className="text-primary-foreground" />
          </Button>
        </View>
      )}
    </View>
  );
}

function getRouteRegion(coordinates: Array<{ latitude: number; longitude: number }>) {
  if (coordinates.length === 0) return null;

  const first = coordinates[0]!;
  let minLat = first.latitude;
  let maxLat = first.latitude;
  let minLng = first.longitude;
  let maxLng = first.longitude;

  for (const coordinate of coordinates) {
    minLat = Math.min(minLat, coordinate.latitude);
    maxLat = Math.max(maxLat, coordinate.latitude);
    minLng = Math.min(minLng, coordinate.longitude);
    maxLng = Math.max(maxLng, coordinate.longitude);
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.4),
  };
}

function RoutePreviewMap({
  mapRegion,
  routeCoordinates,
}: {
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
}) {
  const initialRegion = {
    latitude: mapRegion.latitude,
    longitude: mapRegion.longitude,
    latitudeDelta: mapRegion.latitudeDelta ?? 0.02,
    longitudeDelta: mapRegion.longitudeDelta ?? 0.02,
  };

  return (
    <View className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
        toolbarEnabled={false}
        rotateEnabled={true}
        pitchEnabled={false}
      >
        {routeCoordinates.length > 1 ? (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#3b82f6"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
      </MapView>
      <View className="absolute left-4 right-4 top-4 rounded-xl border border-border bg-background/95 p-3">
        <Text className="text-sm font-semibold text-foreground">Route preview</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          Enable GPS access to use live navigation during recording.
        </Text>
      </View>
    </View>
  );
}
