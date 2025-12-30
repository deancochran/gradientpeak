/**
 * Utils module - Pure utility functions and helpers
 *
 * @module utils
 */

// Export all activity defaults
export * from "./activity-defaults";

// Export from plan-view-logic (exclude ActivityType, canHaveRoute, isOutdoorActivity - in schemas)
export { isIndoorActivity } from "./plan-view-logic";

// Export from polyline (exclude calculateDistance - in calculations)
export {
  calculateBounds,
  calculateRouteStats,
  decodeElevationPolyline,
  decodePolyline,
  encodeElevationPolyline,
  encodePolyline,
  simplifyCoordinates,
} from "./polyline";
export type { LatLng, LatLngAlt, RouteStats } from "./polyline";

// Export all recording config utilities
export * from "./recording-config-resolver";

// Export date utilities
export * from "./dates";

// Export date grouping utilities
export * from "./date-grouping";
