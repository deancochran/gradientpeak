import type { RecordingSessionContract } from "@repo/core";
import type { LocationObject } from "expo-location";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

export interface RecordingBackdropModel {
  copy: { description: string; label: string };
  mapRegion: MapRegion | null;
  mapKey: string;
  mode: NonNullable<RecordingSessionContract["ui"]>["backdropMode"];
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  routeMode: RecordingSessionContract["guidance"]["routeMode"];
  shouldRenderMap: boolean;
}

export interface MapRegion {
  latitude: number;
  latitudeDelta: number;
  longitude: number;
  longitudeDelta: number;
}

export function buildRecordingBackdropModel(params: {
  currentLocation: LocationObject | null;
  service: ActivityRecorderService | null;
  sessionContract: RecordingSessionContract | null;
}): RecordingBackdropModel {
  const mode = params.sessionContract?.ui.backdropMode ?? "ambient";
  const routeMode = params.sessionContract?.guidance.routeMode ?? "none";
  const routeCoordinates = getRouteCoordinates(params.service);
  const mapRegion = params.currentLocation
    ? {
        latitude: params.currentLocation.coords.latitude,
        longitude: params.currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : getRouteRegion(routeCoordinates);
  const shouldRenderMap =
    Boolean(mapRegion) &&
    (mode === "live_navigation" || mode === "route_preview" || mode === "gps_map");

  return {
    copy: getBackdropCopy(mode),
    mapKey: buildMapKey({ mode, routeCoordinates }),
    mapRegion,
    mode,
    routeCoordinates,
    routeMode,
    shouldRenderMap,
  };
}

function buildMapKey(params: {
  mode: RecordingBackdropModel["mode"];
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
}) {
  const first = params.routeCoordinates[0];
  const last = params.routeCoordinates[params.routeCoordinates.length - 1];

  if (!first || !last) return params.mode;

  return [
    params.mode,
    params.routeCoordinates.length,
    first.latitude.toFixed(5),
    first.longitude.toFixed(5),
    last.latitude.toFixed(5),
    last.longitude.toFixed(5),
  ].join(":");
}

export function getBackdropTint(mode: RecordingBackdropModel["mode"]) {
  switch (mode) {
    case "live_navigation":
      return "bg-emerald-950";
    case "virtual_route":
      return "bg-indigo-950";
    case "route_preview":
      return "bg-slate-900";
    case "route_unavailable":
      return "bg-amber-950";
    case "gps_map":
      return "bg-sky-950";
    case "gps_unavailable":
      return "bg-slate-950";
    case "ambient":
    default:
      return "bg-zinc-950";
  }
}

export function getMapBackdropDetail(mode: RecordingBackdropModel["mode"]) {
  if (mode === "live_navigation") return "Live GPS and route geometry are driving the map layer.";
  if (mode === "virtual_route")
    return "Route geometry anchors the session while progress is virtual.";
  if (mode === "route_preview") return "Route geometry is visible without pretending GPS is live.";
  if (mode === "route_unavailable")
    return "The route is attached, but no map geometry is available.";
  if (mode === "gps_map") return "Live GPS is available, so location is the spatial context.";
  if (mode === "gps_unavailable") return "GPS was requested, but live location is unavailable.";
  return "Ambient focus mode is active.";
}

export function getRouteModeLabel(routeMode: RecordingSessionContract["guidance"]["routeMode"]) {
  if (routeMode === "live_navigation") return "navigation";
  if (routeMode === "virtual") return "virtual";
  if (routeMode === "preview") return "preview";
  if (routeMode === "unavailable") return "route unavailable";
  return "no route";
}

function getBackdropCopy(mode: RecordingBackdropModel["mode"]) {
  switch (mode) {
    case "live_navigation":
      return {
        label: "Live route",
        description: "Route and GPS are active, so navigation can lead the ride.",
      };
    case "virtual_route":
      return {
        label: "Indoor route",
        description: "Distance drives your position across the route profile without using GPS.",
      };
    case "route_preview":
      return {
        label: "Route preview",
        description: "The route is attached, but live navigation is waiting on GPS.",
      };
    case "route_unavailable":
      return {
        label: "Route unavailable",
        description: "The route is attached, but there is no map geometry to preview.",
      };
    case "gps_map":
      return {
        label: "GPS map",
        description: "Live location is the spatial layer for this free session.",
      };
    case "gps_unavailable":
      return {
        label: "GPS unavailable",
        description: "GPS capture is requested, but location is not available yet.",
      };
    case "ambient":
    default:
      return {
        label: "Indoor focus",
        description: "No route or GPS map is needed, so metrics and workout cues take the lead.",
      };
  }
}

function getRouteCoordinates(service: ActivityRecorderService | null) {
  const coordinates = service?.currentRoute?.coordinates ?? [];

  return coordinates
    .map((coord: any) => ({
      latitude: coord.latitude ?? coord.lat,
      longitude: coord.longitude ?? coord.lng,
    }))
    .filter(
      (coord: { latitude?: number; longitude?: number }) =>
        typeof coord.latitude === "number" && typeof coord.longitude === "number",
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
