import { decodePolyline } from "@repo/core";

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
  altitude?: number;
};

type ActivityLikeRecord = {
  positionLat?: number;
  positionLong?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
};

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDistance(meters: number | null | undefined) {
  if (!meters || meters <= 0) {
    return "0.00 km";
  }

  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatElevation(meters: number | null | undefined) {
  if (meters == null) {
    return "-";
  }

  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "0m";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

export function formatCompactDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "0:00";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatPower(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return `${Math.round(value)} W`;
}

export function formatHeartRate(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return `${Math.round(value)} bpm`;
}

export function formatSpeed(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return `${(value * 3.6).toFixed(1)} km/h`;
}

export function formatPace(value: number | null | undefined) {
  if (!value || value <= 0) {
    return "-";
  }

  const secondsPerKm = 1000 / value;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}

export function getActivityBadgeLabel(activityType: string) {
  switch (activityType) {
    case "run":
      return "Run";
    case "bike":
      return "Ride";
    case "swim":
      return "Swim";
    case "strength":
      return "Strength";
    default:
      return "Other";
  }
}

export function getActivityEmoji(activityType: string) {
  switch (activityType) {
    case "run":
      return "🏃";
    case "bike":
      return "🚴";
    case "swim":
      return "🏊";
    case "strength":
      return "💪";
    default:
      return "🎯";
  }
}

export function getActivityCoordinates(
  polyline: string | null | undefined,
  records: ActivityLikeRecord[] | null | undefined,
) {
  if (polyline) {
    try {
      return decodePolyline(polyline).map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      }));
    } catch {
      // Fall through to record-based coordinates when stored polyline data is invalid.
    }
  }

  if (!records?.length) {
    return [] as RouteCoordinate[];
  }

  const coordinates: RouteCoordinate[] = [];

  for (const record of records) {
    const latitude =
      typeof record.positionLat === "number"
        ? record.positionLat
        : typeof record.latitude === "number"
          ? record.latitude
          : null;
    const longitude =
      typeof record.positionLong === "number"
        ? record.positionLong
        : typeof record.longitude === "number"
          ? record.longitude
          : null;

    if (
      latitude !== null &&
      longitude !== null &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      !(latitude === 0 && longitude === 0)
    ) {
      coordinates.push({
        latitude,
        longitude,
        altitude: typeof record.altitude === "number" ? record.altitude : undefined,
      });
    }
  }

  return coordinates;
}

export function buildMapPolylinePoints(coordinates: RouteCoordinate[]) {
  if (coordinates.length < 2) {
    return "";
  }

  const latitudes = coordinates.map((point) => point.latitude);
  const longitudes = coordinates.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);

  return coordinates
    .map((point) => {
      const x = ((point.longitude - minLng) / lngSpan) * 100;
      const y = 100 - ((point.latitude - minLat) / latSpan) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function calculateDistanceMeters(left: RouteCoordinate, right: RouteCoordinate) {
  const earthRadiusMeters = 6371e3;
  const lat1 = (left.latitude * Math.PI) / 180;
  const lat2 = (right.latitude * Math.PI) / 180;
  const deltaLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const deltaLng = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function buildElevationPolylinePoints(coordinates: RouteCoordinate[]) {
  const elevatedPoints = coordinates.filter((point) => typeof point.altitude === "number");

  if (elevatedPoints.length < 2) {
    return "";
  }

  const altitudeValues = elevatedPoints.map((point) => point.altitude as number);
  const minAltitude = Math.min(...altitudeValues);
  const maxAltitude = Math.max(...altitudeValues);
  const altitudeSpan = Math.max(maxAltitude - minAltitude, 1);

  let totalDistance = 0;
  const cumulativeDistances = elevatedPoints.map((point, index) => {
    if (index > 0) {
      totalDistance += calculateDistanceMeters(elevatedPoints[index - 1] as RouteCoordinate, point);
    }

    return totalDistance;
  });
  const distanceSpan = Math.max(totalDistance, 1);

  return elevatedPoints
    .map((point, index) => {
      const x = ((cumulativeDistances[index] ?? 0) / distanceSpan) * 100;
      const y = 100 - (((point.altitude as number) - minAltitude) / altitudeSpan) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function summarizeActivityStreams(records: ActivityLikeRecord[] | null | undefined) {
  if (!records?.length) {
    return [] as Array<{ label: string; value: string }>;
  }

  const numeric = {
    HeartRate: records.map((record) => record.heartRate).filter(isFiniteNumber),
    Power: records.map((record) => record.power).filter(isFiniteNumber),
    Cadence: records.map((record) => record.cadence).filter(isFiniteNumber),
    Speed: records.map((record) => record.speed).filter(isFiniteNumber),
    Elevation: records.map((record) => record.altitude).filter(isFiniteNumber),
  };

  const summaries: Array<{ label: string; value: string }> = [];

  if (numeric.HeartRate.length > 0) {
    summaries.push({
      label: "Heart rate range",
      value: `${Math.round(Math.min(...numeric.HeartRate))}-${Math.round(Math.max(...numeric.HeartRate))} bpm`,
    });
  }

  if (numeric.Power.length > 0) {
    summaries.push({ label: "Power peak", value: `${Math.round(Math.max(...numeric.Power))} W` });
  }

  if (numeric.Cadence.length > 0) {
    summaries.push({
      label: "Cadence peak",
      value: `${Math.round(Math.max(...numeric.Cadence))} rpm`,
    });
  }

  if (numeric.Speed.length > 0) {
    summaries.push({
      label: "Speed peak",
      value: `${(Math.max(...numeric.Speed) * 3.6).toFixed(1)} km/h`,
    });
  }

  if (numeric.Elevation.length > 0) {
    summaries.push({
      label: "Elevation range",
      value: `${Math.round(Math.min(...numeric.Elevation))}-${Math.round(Math.max(...numeric.Elevation))} m`,
    });
  }

  return summaries;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
