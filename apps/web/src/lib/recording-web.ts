import type { RecordingActivityCategory } from "@repo/core";

export type RecordingGpsMode = "on" | "off";

export type RecordingLauncherSearch = {
  category: RecordingActivityCategory;
  gps: RecordingGpsMode;
  eventId?: string;
  routeId?: string;
};

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type ProjectedRoutePreview = {
  points: string;
  start: { x: number; y: number };
  finish: { x: number; y: number };
  width: number;
  height: number;
};

export const recordingActivityOptions: Array<{
  value: RecordingActivityCategory;
  label: string;
  description: string;
}> = [
  { value: "run", label: "Run", description: "GPS-friendly outdoor session" },
  { value: "bike", label: "Bike", description: "Road, trainer, or commute ride" },
  { value: "swim", label: "Swim", description: "Import only on web right now" },
  { value: "strength", label: "Strength", description: "Manual planning and import" },
  { value: "other", label: "Other", description: "Fallback for unsupported sports" },
];

export const recordingGpsOptions: Array<{
  value: RecordingGpsMode;
  label: string;
  description: string;
}> = [
  { value: "on", label: "GPS On", description: "Use browser geolocation when available" },
  { value: "off", label: "GPS Off", description: "Indoor or browser-limited session" },
];

export function isRecordingActivityCategory(value: unknown): value is RecordingActivityCategory {
  return recordingActivityOptions.some((option) => option.value === value);
}

export function defaultGpsModeForCategory(category: RecordingActivityCategory): RecordingGpsMode {
  return category === "run" || category === "bike" ? "on" : "off";
}

export function normalizeRecordingActivityCategory(
  value: unknown,
  fallback: RecordingActivityCategory = "run",
): RecordingActivityCategory {
  return isRecordingActivityCategory(value) ? value : fallback;
}

export function validateRecordingSearch(search: Record<string, unknown>): RecordingLauncherSearch {
  const category = normalizeRecordingActivityCategory(search.category, "run");
  const gps =
    search.gps === "on" || search.gps === "off" ? search.gps : defaultGpsModeForCategory(category);

  return {
    category,
    gps,
    eventId:
      typeof search.eventId === "string" && search.eventId.length > 0 ? search.eventId : undefined,
    routeId:
      typeof search.routeId === "string" && search.routeId.length > 0 ? search.routeId : undefined,
  };
}

export function getBrowserRecordingCapabilities() {
  if (typeof window === "undefined") {
    return {
      geolocation: false,
      bluetooth: false,
      secureContext: false,
    };
  }

  return {
    geolocation: "geolocation" in navigator,
    bluetooth: "bluetooth" in navigator,
    secureContext: window.isSecureContext,
  };
}

export function formatDistance(meters: number | null | undefined) {
  if (!meters || meters <= 0) {
    return "-";
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatScheduledTime(dateLike: string | Date | null | undefined) {
  if (!dateLike) {
    return "Any time";
  }

  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return "Any time";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildManualHistoricalImportProvenance(fileName: string) {
  return {
    import_source: "manual_historical" as const,
    import_file_type: "fit" as const,
    import_original_file_name: fileName,
  };
}

export async function uploadFitFileToSignedUrl(file: File, signedUrl: string) {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`FIT upload failed with status ${response.status}`);
  }
}

export function projectRoutePreview(
  coordinates: RouteCoordinate[],
  options?: { width?: number; height?: number; padding?: number },
): ProjectedRoutePreview | null {
  if (coordinates.length < 2) {
    return null;
  }

  const width = options?.width ?? 640;
  const height = options?.height ?? 240;
  const padding = options?.padding ?? 16;
  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = Math.max(maxLat - minLat, 0.00001);
  const lngRange = Math.max(maxLng - minLng, 0.00001);
  const scale = Math.min((width - padding * 2) / lngRange, (height - padding * 2) / latRange);
  const renderedWidth = lngRange * scale;
  const renderedHeight = latRange * scale;
  const offsetX = padding + (width - padding * 2 - renderedWidth) / 2;
  const offsetY = padding + (height - padding * 2 - renderedHeight) / 2;

  const projectedPoints = coordinates.map((coordinate) => ({
    x: offsetX + (coordinate.longitude - minLng) * scale,
    y: height - (offsetY + (coordinate.latitude - minLat) * scale),
  }));

  const start = projectedPoints[0];
  const finish = projectedPoints[projectedPoints.length - 1];

  if (!start || !finish) {
    return null;
  }

  return {
    points: projectedPoints.map((point) => `${point.x},${point.y}`).join(" "),
    start,
    finish,
    width,
    height,
  };
}
