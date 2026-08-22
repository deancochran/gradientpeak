import type { RecordingSessionContract } from "@repo/core";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

export interface MapRegion {
  latitude: number;
  latitudeDelta: number;
  longitude: number;
  longitudeDelta: number;
}

export interface RecordingBackdropModel {
  copy: { description: string; label: string };
  mapRegion: MapRegion | null;
  mapKey: string;
  mode: RecordingSessionContract["ui"]["backdropMode"];
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  routeMode: RecordingSessionContract["guidance"]["routeMode"];
  shouldRenderMap: boolean;
}

export function buildRecordingBackdropModel(params: {
  service: ActivityRecorderService | null;
  sessionContract: RecordingSessionContract | null;
}): RecordingBackdropModel {
  const mode = params.sessionContract?.ui.backdropMode ?? "ambient";
  const routeMode = params.sessionContract?.guidance.routeMode ?? "none";
  const routeCoordinates = getRouteCoordinates(params.service);
  const mapRegion = getRouteRegion(routeCoordinates);
  return {
    copy: getBackdropCopy(mode),
    mapKey: buildMapKey(mode, routeCoordinates),
    mapRegion,
    mode,
    routeCoordinates,
    routeMode,
    shouldRenderMap: Boolean(mapRegion) && (mode === "virtual_route" || mode === "route_preview"),
  };
}

function buildMapKey(
  mode: RecordingBackdropModel["mode"],
  coordinates: Array<{ latitude: number; longitude: number }>,
) {
  const first = coordinates[0];
  const last = coordinates.at(-1);
  return first && last
    ? [
        mode,
        coordinates.length,
        first.latitude,
        first.longitude,
        last.latitude,
        last.longitude,
      ].join(":")
    : mode;
}

export function getMapBackdropDetail(mode: RecordingBackdropModel["mode"]) {
  if (mode === "virtual_route") return "Route geometry is shown without live location capture.";
  if (mode === "route_preview") return "The attached route is a static preview.";
  if (mode === "route_unavailable") return "The attached route has no map geometry.";
  return "The recorder is focused on time, plans, and connected sensors.";
}

export function getRouteModeLabel(routeMode: RecordingSessionContract["guidance"]["routeMode"]) {
  if (routeMode === "virtual") return "virtual";
  if (routeMode === "preview") return "preview";
  if (routeMode === "unavailable") return "route unavailable";
  return "no route";
}

function getBackdropCopy(mode: RecordingBackdropModel["mode"]) {
  if (mode === "virtual_route" || mode === "route_preview") {
    return {
      label: "Route preview",
      description: "The attached route is visible, but this recording does not capture location.",
    };
  }
  if (mode === "route_unavailable") {
    return {
      label: "Route unavailable",
      description: "The route is attached, but there is no map geometry to preview.",
    };
  }
  return {
    label: "Recording focus",
    description: "Track time, workout steps, and connected sensor metrics without location.",
  };
}

function getRouteCoordinates(service: ActivityRecorderService | null) {
  return (service?.currentRoute?.coordinates ?? [])
    .map((coordinate) => ({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    }))
    .filter(
      (coordinate) => Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude),
    );
}

function getRouteRegion(coordinates: Array<{ latitude: number; longitude: number }>) {
  const first = coordinates[0];
  if (!first) return null;
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
