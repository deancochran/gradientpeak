import type { RecordingSessionContract } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import type { LocationObject } from "expo-location";
import React from "react";
import { View } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  buildRecordingBackdropModel,
  getBackdropTint,
  type RecordingBackdropModel,
} from "./model/recordingBackdropModel";
import { RouteElevationBackdrop } from "./RouteElevationBackdrop";

export interface RecordingBackdropProps {
  recordingState: string;
  service: ActivityRecorderService | null;
  sessionContract: RecordingSessionContract | null;
}

export function RecordingBackdrop({
  recordingState,
  service,
  sessionContract,
}: RecordingBackdropProps) {
  const [currentLocation, setCurrentLocation] = React.useState<LocationObject | null>(null);
  const [mapReady, setMapReady] = React.useState(false);
  const model = React.useMemo(
    () => buildRecordingBackdropModel({ currentLocation, service, sessionContract }),
    [currentLocation, service, sessionContract],
  );
  const showBackdropCopy = ![
    "live_navigation",
    "route_preview",
    "virtual_route",
    "gps_map",
  ].includes(model.mode);
  const showMapPending = isMapPendingMode(model.mode) && !model.shouldRenderMap;

  React.useEffect(() => {
    setMapReady(false);
  }, [model.mapKey]);

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
    };

    service.locationManager.addCallback(handleLocationUpdate);

    return () => {
      cancelled = true;
      service.locationManager.removeCallback(handleLocationUpdate);
    };
  }, [model.mode, service]);

  return (
    <View className="absolute inset-0 overflow-hidden bg-background" testID="recording-backdrop">
      {model.mode === "virtual_route" ? (
        <RouteElevationBackdrop service={service} />
      ) : model.shouldRenderMap && model.mapRegion ? (
        <MapView
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
          rotateEnabled={model.mode === "live_navigation"}
          pitchEnabled={false}
          loadingEnabled={!mapReady}
          loadingBackgroundColor="transparent"
          loadingIndicatorColor="#94a3b8"
          onMapReady={() => setMapReady(true)}
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
