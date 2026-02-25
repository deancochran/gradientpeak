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

import { GPSStatusOverlay } from "@/components/recording/GPSStatusOverlay";
import { VirtualRouteMap } from "@/components/recording/VirtualRouteMap";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useFocusMode } from "@/lib/contexts/FocusModeContext";
import { useGpsTracking } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type {
  PublicActivityLocation
} from "@repo/supabase";
import type { LocationObject } from "expo-location";
import { Minimize2, Navigation } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import MapView, { Camera, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ZoneAProps {
  service: ActivityRecorderService | null;
  location: PublicActivityLocation;
  hasRoute: boolean;
  isFocused: boolean; // Whether this zone is currently focused
}

export function ZoneA({ service, location, hasRoute, isFocused }: ZoneAProps) {
  const { focusZoneA, clearFocus } = useFocusMode();
  const { gpsEnabled } = useGpsTracking(service);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);

  // GPS state
  const [currentLocation, setCurrentLocation] = useState<LocationObject | null>(
    null,
  );
  const [breadcrumbTrail, setBreadcrumbTrail] = useState<
    Array<{ latitude: number; longitude: number }>
  >([]);
  const [isAutoCentered, setIsAutoCentered] = useState(true); // Track if map auto-follows user
  const [currentHeading, setCurrentHeading] = useState<number>(0); // Track user's heading for rotation (GPS-based)
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
    if (!service || !location) return;

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
  }, [service, location, isAutoCentered, magnetometerHeading]);

  // Subscribe to magnetometer heading updates
  useEffect(() => {
    if (!service) return;

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
  }, [service]);

  // Update breadcrumb trail from service's recorded GPS path
  useEffect(() => {
    if (!service) return;

    const updateTrail = () => {
      const path = service.recordedGpsPath;
      setBreadcrumbTrail(path);
    };

    // Update immediately
    updateTrail();

    // Update periodically (every 2 seconds)
    const interval = setInterval(updateTrail, 2000);

    return () => clearInterval(interval);
  }, [service]);

  // Handle tap to expand
  const handleTapToExpand = React.useCallback(() => {
    focusZoneA();
  }, [focusZoneA]);

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

  // Determine what to show based on location, GPS state, and route
  const isOutdoor = location === "outdoor";
  const shouldRender = (isOutdoor && gpsEnabled) || hasRoute;

  // Calculate focused height
  // Parent container has paddingTop: insets.top already applied
  // We need to fill: screenHeight - insets.top (parent container) - 120 (footer)
  const focusedHeight = screenHeight - insets.top - 120;

  // Don't render if indoor without route
  if (!shouldRender) {
    return null;
  }

  // Default region (San Francisco) if no GPS yet
  const defaultRegion = {
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  // Use current location or default
  const mapRegion = currentLocation
    ? {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : defaultRegion;

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
          : {
              // Normal: flex for equal height distribution
              flex: 1,
            }
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
          className="flex-1"
          accessibilityLabel="Tap to expand map"
          accessibilityHint="Expands the map to fill the screen"
        >
          {/* Map Content */}
          {!isOutdoor && hasRoute && service ? (
            <VirtualRouteMap service={service} isFocused={false} />
          ) : (
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
                showsScale={false}
                toolbarEnabled={false}
                rotateEnabled={true}
                pitchEnabled={false}
                onRegionChange={handleRegionChange}
                onRegionChangeComplete={handleRegionChangeComplete}
              >
                {/* Route overlay (blue polyline) - render first so it's below breadcrumb */}
                {hasRoute && routeCoordinates.length > 1 && (
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor="#3b82f6" // blue-500
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}

                {/* Breadcrumb trail (red polyline) - render second so it's on top */}
                {breadcrumbTrail.length > 1 && (
                  <Polyline
                    coordinates={breadcrumbTrail}
                    strokeColor="#ef4444" // red-500
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
              </MapView>
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
                {/* Route overlay (blue polyline) - render first so it's below breadcrumb */}
                {hasRoute && routeCoordinates.length > 1 && (
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor="#3b82f6" // blue-500
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}

                {/* Breadcrumb trail (red polyline) - render second so it's on top */}
                {breadcrumbTrail.length > 1 && (
                  <Polyline
                    coordinates={breadcrumbTrail}
                    strokeColor="#ef4444" // red-500
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
              </MapView>
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
              <Icon as={Minimize2} size={20} />
            </Button>
          </View>
        </>
      )}

      {/* GPS Status Overlay (outdoor only) */}
      {isOutdoor && (
        <GPSStatusOverlay service={service} isOutdoor={isOutdoor} />
      )}

      {/* Re-center Button (shows when not auto-centered, in both normal and focused) */}
      {!isAutoCentered && currentLocation && isOutdoor && (
        <View className="absolute bottom-4 right-4">
          <Button
            size="icon"
            variant="default"
            onPress={handleReCenter}
            className="h-12 w-12 rounded-full bg-primary shadow-lg"
            accessibilityLabel="Re-center map"
            accessibilityHint="Centers the map on your current location"
          >
            <Icon
              as={Navigation}
              size={20}
              className="text-primary-foreground"
            />
          </Button>
        </View>
      )}
    </View>
  );
}
