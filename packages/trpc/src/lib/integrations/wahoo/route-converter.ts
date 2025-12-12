/**
 * Wahoo Route Utilities
 * Handles route preparation for Wahoo API
 *
 * Note: Routes are stored as GPX files in Supabase Storage and sent directly to Wahoo.
 * Wahoo API accepts GPX, TCX, and FIT formats - we use GPX for simplicity.
 */

import type { ActivityType } from "./activity-type-utils";
import { supportsRoutes, toSportName } from "./activity-type-utils";

export interface RouteFileData {
  filePath: string;
  name: string;
  description?: string;
  activityType: ActivityType;
  totalDistance: number;
  totalAscent?: number;
  totalDescent?: number;
  startLat?: number;
  startLng?: number;
}

/**
 * Prepare GPX file content for Wahoo API
 * Simply base64 encodes the GPX file
 */
export function prepareGPXForWahoo(gpxContent: string): string {
  const base64 = Buffer.from(gpxContent).toString("base64");
  return base64;
}

/**
 * Parse GPX content to extract start coordinates
 * Returns the first trackpoint coordinates
 */
export function extractStartCoordinates(gpxContent: string): {
  latitude: number;
  longitude: number;
} | null {
  // Simple regex to find first trkpt element
  const trkptMatch = gpxContent.match(
    /<trkpt[^>]*lat="([^"]*)"[^>]*lon="([^"]*)"/,
  );

  if (trkptMatch && trkptMatch[1] && trkptMatch[2]) {
    return {
      latitude: parseFloat(trkptMatch[1]),
      longitude: parseFloat(trkptMatch[2]),
    };
  }

  return null;
}

/**
 * Validate that route is suitable for Wahoo sync
 */
export function validateRouteForWahoo(routeData: RouteFileData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check activity type supports routes
  if (!supportsRoutes(routeData.activityType)) {
    errors.push(
      `Activity type '${routeData.activityType}' does not support routes in Wahoo. Only outdoor_bike and outdoor_run support routes.`,
    );
  }

  // Check distance
  if (routeData.totalDistance < 100) {
    warnings.push("Route is very short (less than 100 meters)");
  }

  if (routeData.totalDistance > 500000) {
    warnings.push("Route is very long (more than 500km)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get workout type family ID for route
 */
export function getWorkoutTypeFamilyForRoute(
  activityType: ActivityType,
): number {
  const sport = toSportName(activityType);

  switch (sport) {
    case "cycling":
      return 0; // Biking
    case "running":
      return 1; // Running
    default:
      return 0;
  }
}
