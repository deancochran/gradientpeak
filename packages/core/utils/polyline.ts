import polyline from '@mapbox/polyline';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface LatLngAlt extends LatLng {
  altitude?: number;
}

export interface RouteStats {
  totalDistance: number;
  totalAscent: number;
  totalDescent: number;
}

/**
 * Encode coordinates to polyline string using Mapbox polyline encoding
 */
export function encodePolyline(coordinates: LatLng[]): string {
  const coords: [number, number][] = coordinates.map((coord) => [
    coord.latitude,
    coord.longitude,
  ]);
  return polyline.encode(coords);
}

/**
 * Decode polyline string to coordinates
 */
export function decodePolyline(encoded: string): LatLng[] {
  const coords = polyline.decode(encoded);
  return coords.map(([latitude, longitude]) => ({
    latitude,
    longitude,
  }));
}

/**
 * Simplify coordinates using Douglas-Peucker algorithm
 * @param coords - Array of coordinates with altitude
 * @param tolerance - Tolerance in degrees (default 0.0001 ≈ 11 meters)
 * @returns Simplified array of coordinates
 */
export function simplifyCoordinates(
  coords: LatLngAlt[],
  tolerance: number = 0.0001,
): LatLngAlt[] {
  if (coords.length <= 2) return coords;

  const simplified = douglasPeucker(coords, tolerance);
  return simplified;
}

/**
 * Douglas-Peucker algorithm for coordinate simplification
 */
function douglasPeucker(
  points: LatLngAlt[],
  tolerance: number,
): LatLngAlt[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  // Find the point with maximum distance from the line
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Combine results (remove duplicate point at junction)
    return [...left.slice(0, -1), ...right];
  }

  // If max distance is less than tolerance, return endpoints
  return [first, last];
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng,
): number {
  const { latitude: x, longitude: y } = point;
  const { latitude: x1, longitude: y1 } = lineStart;
  const { latitude: x2, longitude: y2 } = lineEnd;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx: number, yy: number;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in meters
 */
export function calculateDistance(coord1: LatLng, coord2: LatLng): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1.latitude * Math.PI) / 180;
  const φ2 = (coord2.latitude * Math.PI) / 180;
  const Δφ = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const Δλ = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate total distance, ascent, and descent from coordinates
 */
export function calculateRouteStats(coords: LatLngAlt[]): RouteStats {
  let totalDistance = 0;
  let totalAscent = 0;
  let totalDescent = 0;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];

    // Calculate distance
    totalDistance += calculateDistance(prev, curr);

    // Calculate elevation changes
    if (prev.altitude !== undefined && curr.altitude !== undefined) {
      const elevationChange = curr.altitude - prev.altitude;
      if (elevationChange > 0) {
        totalAscent += elevationChange;
      } else {
        totalDescent += Math.abs(elevationChange);
      }
    }
  }

  return {
    totalDistance: Math.round(totalDistance),
    totalAscent: Math.round(totalAscent),
    totalDescent: Math.round(totalDescent),
  };
}

/**
 * Encode elevation data to polyline (6-digit precision)
 */
export function encodeElevationPolyline(elevations: number[]): string {
  const coords: [number, number][] = elevations.map((elevation, index) => [
    index,
    Math.round(elevation * 10), // Scale to preserve decimal precision
  ]);
  return polyline.encode(coords, 6);
}

/**
 * Decode elevation polyline
 */
export function decodeElevationPolyline(encoded: string): number[] {
  const coords = polyline.decode(encoded, 6);
  return coords.map(([_, elevation]) => elevation / 10); // Unscale
}

/**
 * Calculate bounds from coordinates
 */
export function calculateBounds(coords: LatLng[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  if (coords.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;

  for (const coord of coords) {
    minLat = Math.min(minLat, coord.latitude);
    maxLat = Math.max(maxLat, coord.latitude);
    minLng = Math.min(minLng, coord.longitude);
    maxLng = Math.max(maxLng, coord.longitude);
  }

  return { minLat, maxLat, minLng, maxLng };
}
