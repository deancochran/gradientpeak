import type { RecordingActivityCategory } from "@repo/core";
import {
  formatDistance as formatPreferredDistance,
  type PreferredUnitSystem,
} from "./units/presentation";
export type RecordingGpsMode = "on" | "off";

export type RecordingLauncherSearch = {
  activity_category: RecordingActivityCategory;
  gps: RecordingGpsMode;
  eventId?: string;
  activityPlanId?: string;
  /** Immutable calendar session selected for recording. */
  plannedSessionId?: string;
  /** Calendar date used to retrieve the selected planned-session projection. */
  plannedSessionDate?: string;
  /** Selected route to retain through the recording launcher. */
  routeId?: string;
};

/** Legacy route-preview component compatibility; not used by web recording. */
export type RouteCoordinate = { latitude: number; longitude: number };
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
  { value: "run", label: "Run", description: "Indoor timer session" },
  { value: "bike", label: "Bike", description: "Indoor timer session" },
  { value: "swim", label: "Swim", description: "Indoor timer session" },
  { value: "strength", label: "Strength", description: "Indoor timer session" },
  { value: "other", label: "Other", description: "Indoor timer session" },
];

export function isRecordingActivityCategory(value: unknown): value is RecordingActivityCategory {
  return recordingActivityOptions.some((option) => option.value === value);
}

export function normalizeRecordingActivityCategory(
  value: unknown,
  fallback: RecordingActivityCategory = "run",
): RecordingActivityCategory {
  return isRecordingActivityCategory(value) ? value : fallback;
}

export function validateRecordingSearch(search: Record<string, unknown>): RecordingLauncherSearch {
  const activityCategory = normalizeRecordingActivityCategory(search.activity_category, "run");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return {
    activity_category: activityCategory,
    // Web recording remains indoor only; the selected route is retained as activity context.
    gps: "off",
    eventId:
      typeof search.eventId === "string" && uuidPattern.test(search.eventId)
        ? search.eventId
        : undefined,
    activityPlanId:
      typeof search.activityPlanId === "string" && uuidPattern.test(search.activityPlanId)
        ? search.activityPlanId
        : undefined,
    plannedSessionId:
      typeof search.plannedSessionId === "string" && uuidPattern.test(search.plannedSessionId)
        ? search.plannedSessionId
        : undefined,
    plannedSessionDate:
      typeof search.plannedSessionDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(search.plannedSessionDate)
        ? search.plannedSessionDate
        : undefined,
    routeId:
      typeof search.routeId === "string" && uuidPattern.test(search.routeId)
        ? search.routeId
        : undefined,
  };
}

export function formatScheduledTime(dateLike: string | Date | null | undefined) {
  if (!dateLike) {
    return "Any time";
  }

  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    return "Scheduled today";
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

/** Retained for the standalone route component; web recording no longer calls this. */
export function formatDistance(
  meters: number | null | undefined,
  unitSystem: PreferredUnitSystem = "metric",
) {
  return !meters || meters <= 0 ? "-" : formatPreferredDistance(meters, unitSystem);
}

/** Retained for the standalone route component; web recording no longer calls this. */
export function projectRoutePreview(coordinates: RouteCoordinate[]): ProjectedRoutePreview | null {
  if (coordinates.length < 2) return null;
  const width = 640;
  const height = 240;
  const padding = 16;
  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxLng - minLng, 0.00001),
    (height - padding * 2) / Math.max(maxLat - minLat, 0.00001),
  );
  const points = coordinates.map((coordinate) => ({
    x: padding + (coordinate.longitude - minLng) * scale,
    y: height - padding - (coordinate.latitude - minLat) * scale,
  }));
  const start = points[0];
  const finish = points.at(-1);
  if (!start || !finish) return null;
  return {
    points: points.map((point) => `${point.x},${point.y}`).join(" "),
    start,
    finish,
    width,
    height,
  };
}
