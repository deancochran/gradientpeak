import type * as Location from "expo-location";

export const LOCATION_BUFFER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type StoredLocationBuffer = {
  locations: Location.LocationObject[];
  storedAt: number;
};

export function serializeLocationBuffer(
  locations: Location.LocationObject[],
  now = Date.now(),
): string {
  return JSON.stringify({
    locations,
    storedAt: now,
  } satisfies StoredLocationBuffer);
}

export function parseFreshLocationBuffer(raw: string | null, now = Date.now()) {
  if (!raw) {
    return { locations: [], isStale: false };
  }

  const parsed = JSON.parse(raw) as Location.LocationObject[] | StoredLocationBuffer;
  const storedAt = Array.isArray(parsed) ? 0 : parsed.storedAt;
  const locations = Array.isArray(parsed) ? parsed : parsed.locations;

  if (!Array.isArray(locations)) {
    return { locations: [], isStale: true };
  }

  if (!storedAt || now - storedAt > LOCATION_BUFFER_MAX_AGE_MS) {
    return { locations: [], isStale: true };
  }

  return { locations, isStale: false };
}
