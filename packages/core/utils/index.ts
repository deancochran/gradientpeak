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

// Export temporal metrics utilities
export * from "./temporal-metrics";

// NOTE: streamDecompression is NOT exported from core package index
// - Server-side code (tRPC) should import directly: import { decompressStream } from "@repo/core/utils/streamDecompression"
// - Mobile code should use: apps/mobile/lib/utils/streamDecompression.ts (React Native compatible)
// This prevents accidental imports of Node.js built-ins (node:zlib, node:buffer) in React Native
