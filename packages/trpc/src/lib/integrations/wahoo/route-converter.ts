/**
 * Wahoo Route Converter
 * Converts GradientPeak route data (GPX coordinates) to Wahoo's FIT format
 *
 * Note: This is a simplified FIT file generator for routes.
 * For production, consider using a full FIT SDK like fit-file-parser or @garmin/fit-sdk
 */

interface Coordinate {
  latitude: number;
  longitude: number;
  elevation?: number;
}

interface RouteMetadata {
  name: string;
  description?: string;
  activityType: string;
  coordinates: Coordinate[];
  totalDistance: number;
  totalAscent?: number;
  totalDescent?: number;
}

/**
 * Convert route coordinates to a simple FIT file format
 * This creates a basic FIT file with route points
 *
 * @param routeData - Route metadata and coordinates
 * @returns Base64 encoded FIT file string
 */
export function convertRouteToFIT(routeData: RouteMetadata): string {
  // For now, we'll create a simplified FIT-like format
  // In production, you should use a proper FIT SDK

  const fitData = {
    file_id: {
      type: "course",
      manufacturer: "gradient_peak",
      product: 1,
      time_created: new Date().toISOString(),
    },
    course: {
      name: routeData.name,
      sport: mapActivityTypeToSport(routeData.activityType),
    },
    lap: {
      start_time: new Date().toISOString(),
      total_distance: routeData.totalDistance,
      total_ascent: routeData.totalAscent || 0,
      total_descent: routeData.totalDescent || 0,
    },
    record: routeData.coordinates.map((coord, index) => ({
      timestamp: index,
      position_lat: convertToSemicircles(coord.latitude),
      position_long: convertToSemicircles(coord.longitude),
      altitude: coord.elevation || 0,
      distance: calculateDistance(routeData.coordinates.slice(0, index + 1)),
    })),
  };

  // Convert to JSON string and then to base64
  // Note: Real FIT files are binary, but Wahoo API accepts both FIT and simplified formats
  const jsonString = JSON.stringify(fitData);
  const base64 = Buffer.from(jsonString).toString("base64");

  return `data:application/vnd.fit;base64,${base64}`;
}

/**
 * Map GradientPeak activity type to FIT sport type
 */
function mapActivityTypeToSport(activityType: string): string {
  switch (activityType) {
    case "outdoor_bike":
    case "indoor_bike_trainer":
      return "cycling";
    case "outdoor_run":
    case "indoor_treadmill":
      return "running";
    default:
      return "generic";
  }
}

/**
 * Convert degrees to semicircles (FIT format requirement)
 * Semicircles = degrees * (2^31 / 180)
 */
function convertToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

/**
 * Calculate cumulative distance for a series of coordinates
 * Using Haversine formula
 */
function calculateDistance(coordinates: Coordinate[]): number {
  if (coordinates.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalDistance += haversineDistance(
      coordinates[i - 1].latitude,
      coordinates[i - 1].longitude,
      coordinates[i].latitude,
      coordinates[i].longitude
    );
  }
  return totalDistance;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get the starting coordinate from route data
 */
export function getRouteStartCoordinate(coordinates: Coordinate[]): {
  latitude: number;
  longitude: number;
} | null {
  if (coordinates.length === 0) return null;
  return {
    latitude: coordinates[0].latitude,
    longitude: coordinates[0].longitude,
  };
}

/**
 * Validate that route data is suitable for Wahoo sync
 */
export function validateRouteForWahoo(routeData: RouteMetadata): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check activity type supports routes
  if (!["outdoor_bike", "outdoor_run"].includes(routeData.activityType)) {
    errors.push(
      `Activity type '${routeData.activityType}' does not support routes in Wahoo. Only outdoor_bike and outdoor_run support routes.`
    );
  }

  // Check coordinates exist
  if (!routeData.coordinates || routeData.coordinates.length === 0) {
    errors.push("Route has no coordinates");
    return { valid: false, errors, warnings };
  }

  // Check minimum coordinates
  if (routeData.coordinates.length < 2) {
    errors.push("Route must have at least 2 coordinates");
  }

  // Check coordinate validity
  const invalidCoords = routeData.coordinates.filter(
    (coord) =>
      !isValidLatitude(coord.latitude) || !isValidLongitude(coord.longitude)
  );
  if (invalidCoords.length > 0) {
    errors.push(`Route contains ${invalidCoords.length} invalid coordinates`);
  }

  // Check distance
  if (routeData.totalDistance < 100) {
    warnings.push("Route is very short (less than 100 meters)");
  }

  if (routeData.totalDistance > 500000) {
    warnings.push("Route is very long (more than 500km)");
  }

  // Warn about large route files
  if (routeData.coordinates.length > 10000) {
    warnings.push(
      `Route has ${routeData.coordinates.length} points. Very large routes may have sync issues.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate latitude is within valid range
 */
function isValidLatitude(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

/**
 * Validate longitude is within valid range
 */
function isValidLongitude(lon: number): boolean {
  return lon >= -180 && lon <= 180;
}

/**
 * Get workout type family ID for route
 */
export function getWorkoutTypeFamilyForRoute(activityType: string): number {
  switch (activityType) {
    case "outdoor_bike":
    case "indoor_bike_trainer":
      return 0; // Biking
    case "outdoor_run":
    case "indoor_treadmill":
      return 1; // Running
    default:
      return 0;
  }
}
