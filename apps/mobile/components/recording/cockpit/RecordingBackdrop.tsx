import type { RecordingSessionContract } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import type { LocationObject } from "expo-location";
import { Navigation } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import MapView, { type Camera, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  buildRecordingBackdropModel,
  getBackdropTint,
  type RecordingBackdropModel,
} from "./model/recordingBackdropModel";

export interface RecordingBackdropProps {
  recordingState: string;
  service: ActivityRecorderService | null;
  sessionContract: RecordingSessionContract | null;
  trackingControlBottomOffset: number;
  trackingControlHidden?: boolean;
}

export function RecordingBackdrop({
  recordingState,
  service,
  sessionContract,
  trackingControlBottomOffset,
  trackingControlHidden = false,
}: RecordingBackdropProps) {
  const mapRef = React.useRef<MapView>(null);
  const [currentLocation, setCurrentLocation] = React.useState<LocationObject | null>(null);
  const [currentHeading, setCurrentHeading] = React.useState(0);
  const [trackingEnabled, setTrackingEnabled] = React.useState(true);
  const [mapReady, setMapReady] = React.useState(false);
  const model = React.useMemo(
    () => buildRecordingBackdropModel({ currentLocation, service, sessionContract }),
    [currentLocation, service, sessionContract],
  );
  const showBackdropCopy = !["live_navigation", "route_preview", "gps_map"].includes(model.mode);
  const showMapPending = isMapPendingMode(model.mode) && !model.shouldRenderMap;

  React.useEffect(() => {
    setMapReady(false);
    setTrackingEnabled(true);
  }, [model.mapKey]);

  const followCurrentLocation = React.useCallback(
    (location: LocationObject, duration = 500) => {
      if (!mapRef.current) return;

      const heading = getLocationHeading(location, currentHeading);
      const camera: Camera = {
        center: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        heading,
        pitch: 0,
        zoom: 16,
      };

      mapRef.current.animateCamera(camera, { duration });
    },
    [currentHeading],
  );

  React.useEffect(() => {
    if (!service || (model.mode !== "live_navigation" && model.mode !== "gps_map")) return;

    let cancelled = false;

    const lastKnownLocationPromise = service.locationManager.getLastKnownLocation?.();
    lastKnownLocationPromise?.then((location) => {
      if (!cancelled && location) {
        setCurrentLocation((current) => current ?? location);
      }
    });

    const handleLocationUpdate = (location: LocationObject) => {
      setCurrentLocation(location);
      setCurrentHeading(getLocationHeading(location, currentHeading));

      if (trackingEnabled) {
        followCurrentLocation(location);
      }
    };

    service.locationManager.addCallback(handleLocationUpdate);

    return () => {
      cancelled = true;
      service.locationManager.removeCallback(handleLocationUpdate);
    };
  }, [currentHeading, followCurrentLocation, model.mode, service, trackingEnabled]);

  const handleMapGesture = React.useCallback(() => {
    setTrackingEnabled(false);
  }, []);

  const handleRegionChangeComplete = React.useCallback(
    (_region: unknown, details?: { isGesture?: boolean }) => {
      if (details?.isGesture) {
        handleMapGesture();
      }
    },
    [handleMapGesture],
  );

  const handleRestoreTracking = React.useCallback(() => {
    if (!currentLocation) return;

    setTrackingEnabled(true);
    followCurrentLocation(currentLocation, 350);
  }, [currentLocation, followCurrentLocation]);

  return (
    <View className="absolute inset-0 overflow-hidden bg-background" testID="recording-backdrop">
      {model.shouldRenderMap && model.mapRegion ? (
        <MapView
          ref={mapRef}
          key={model.mapKey}
          provider={PROVIDER_DEFAULT}
          style={{ flex: 1 }}
          initialRegion={model.mapRegion}
          mapType="standard"
          showsUserLocation={model.mode === "live_navigation" || model.mode === "gps_map"}
          showsMyLocationButton={false}
          showsCompass={true}
          showsScale={true}
          toolbarEnabled={false}
          rotateEnabled={model.mode === "live_navigation" || model.mode === "gps_map"}
          pitchEnabled={false}
          loadingEnabled={!mapReady}
          loadingBackgroundColor="transparent"
          loadingIndicatorColor="#94a3b8"
          onMapReady={() => setMapReady(true)}
          onPanDrag={handleMapGesture}
          onRegionChangeComplete={handleRegionChangeComplete}
          testID="recording-backdrop-map"
        >
          {model.routeCoordinates.length > 1 ? (
            <Polyline
              coordinates={model.routeCoordinates}
              strokeColor={model.mode === "route_preview" ? "#94a3b8" : "#22c55e"}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
        </MapView>
      ) : showMapPending ? (
        <MapPendingBackdrop mode={model.mode} />
      ) : (
        <AtmosphericBackdrop mode={model.mode} />
      )}

      {model.shouldRenderMap && !trackingEnabled && currentLocation && !trackingControlHidden ? (
        <View
          className="absolute right-4"
          pointerEvents="box-none"
          style={{ bottom: trackingControlBottomOffset }}
        >
          <Pressable
            accessibilityLabel="Return to tracking mode"
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-full border border-border bg-card/95 shadow-lg active:opacity-80"
            hitSlop={8}
            onPress={handleRestoreTracking}
            testID="recording-map-tracking-button"
          >
            <Icon as={Navigation} size={20} className="text-foreground" />
          </Pressable>
        </View>
      ) : null}

      {showBackdropCopy ? (
        <View className="absolute inset-x-0 top-0 px-6 pt-24">
          <Text className="text-xs font-semibold uppercase tracking-[3px] text-white/65">
            {formatServiceStateLabel(recordingState)} cockpit
          </Text>
          <Text className="mt-3 text-4xl font-black capitalize leading-tight text-white">
            {model.copy.label}
          </Text>
          <Text className="mt-3 max-w-[280px] text-base leading-6 text-white/75">
            {model.copy.description}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function getLocationHeading(location: LocationObject, fallback: number) {
  const heading = location.coords.heading;

  return typeof heading === "number" && Number.isFinite(heading) && heading >= 0
    ? heading
    : fallback;
}

function isMapPendingMode(mode: RecordingBackdropModel["mode"]) {
  return mode === "gps_map" || mode === "live_navigation";
}

function MapPendingBackdrop({ mode }: { mode: RecordingBackdropModel["mode"] }) {
  const isNavigation = mode === "live_navigation";

  return (
    <View
      className="absolute inset-0 items-center justify-center bg-background px-8"
      testID="recording-map-pending-backdrop"
    >
      <View className="w-full max-w-[320px] rounded-[32px] border border-border bg-card/95 px-6 py-7 shadow-sm">
        <Text className="text-xs font-semibold uppercase tracking-[2.5px] text-muted-foreground">
          {isNavigation ? "Route map" : "Location"}
        </Text>
        <Text className="mt-3 text-2xl font-black text-foreground">
          {isNavigation ? "Preparing map" : "Acquiring GPS"}
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted-foreground">
          {isNavigation
            ? "The route is attached. The map appears as soon as route geometry or a real location is available."
            : "The map appears as soon as a real location is available."}
        </Text>
      </View>
    </View>
  );
}

function AtmosphericBackdrop({ mode }: { mode: RecordingBackdropModel["mode"] }) {
  return (
    <>
      <View className={`absolute inset-0 ${getBackdropTint(mode)}`} />
      <View className="absolute -left-20 top-16 h-72 w-72 rounded-full bg-white/10" />
      <View className="absolute -right-24 top-44 h-80 w-80 rounded-full bg-white/5" />
      <View className="absolute bottom-28 left-8 right-8 h-32 rounded-[40px] border border-white/15 bg-white/5" />
    </>
  );
}

function formatServiceStateLabel(state: string) {
  if (state === "recording") return "Recording";
  if (state === "paused") return "Paused";
  if (state === "finishing") return "Finishing";
  return "Ready";
}
