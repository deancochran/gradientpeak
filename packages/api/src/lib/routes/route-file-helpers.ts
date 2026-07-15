import {
  calculateRouteStats,
  encodeElevationPolyline,
  encodePolyline,
  simplifyCoordinates,
} from "@repo/core";
import {
  getRouteFileExtension,
  MAX_ROUTE_FILE_SIZE_BYTES,
  MAX_ROUTE_POINT_COUNT,
  ROUTE_FILE_MIME_TYPES,
} from "@repo/core/route-files";
import { z } from "zod";

import {
  type ParsedRoute,
  parseRouteWithFormat,
  type RouteContentFormat,
  validateRoute,
} from "./route-parser";

export const ROUTES_BUCKET = "gpx-routes";

export const routeCoordinateSchema = z
  .object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    altitude: z.number().finite().optional(),
  })
  .strict();

export const parsedRouteSchema = z
  .object({
    name: z.string().optional(),
    coordinates: z.array(routeCoordinateSchema).max(MAX_ROUTE_POINT_COUNT),
    metadata: z
      .object({
        author: z.string().optional(),
        time: z.string().optional(),
        bounds: z
          .object({
            minLat: z.number().finite(),
            maxLat: z.number().finite(),
            minLng: z.number().finite(),
            maxLng: z.number().finite(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export interface RouteFileArtifacts {
  elevationPolyline: string | null;
  parsed: ParsedRoute;
  polyline: string;
  totalAscent: number;
  totalDescent: number;
  totalDistance: number;
  format: RouteContentFormat;
}

export interface RouteStorageFormat {
  extension: RouteContentFormat;
  mimeType: (typeof ROUTE_FILE_MIME_TYPES)[RouteContentFormat];
}

export function getRouteContentSizeBytes(fileContent: string): number {
  return new TextEncoder().encode(fileContent).byteLength;
}

export function assertRouteContentSize(fileContent: string): void {
  if (getRouteContentSizeBytes(fileContent) > MAX_ROUTE_FILE_SIZE_BYTES) {
    throw new Error("Route file exceeds the 10 MiB limit");
  }
}

export function resolveRouteContentFormat(
  fileName: string,
  fileContent: string,
): RouteContentFormat {
  const extension = getRouteFileExtension(fileName);
  if (!extension) {
    throw new Error("Unsupported route file extension");
  }

  return parseRouteWithFormat(fileContent, extension).format;
}

export function getCanonicalRouteStorageFormat(format: RouteContentFormat): RouteStorageFormat {
  return { extension: format, mimeType: ROUTE_FILE_MIME_TYPES[format] };
}

export function parseStoredRouteFile(fileContent: string, fileName?: string): ParsedRoute {
  assertRouteContentSize(fileContent);
  const extension = fileName ? getRouteFileExtension(fileName) : undefined;
  if (extension === null) throw new Error("Unsupported route file extension");
  const parsedResult = parseRouteWithFormat(fileContent, extension);
  const parsed = parsedRouteSchema.safeParse(parsedResult.route);
  if (!parsed.success) {
    throw new Error("Stored route file contained invalid route data");
  }

  const validation = validateRoute(parsed.data);
  if (!validation.valid) {
    throw new Error("Stored route file contained invalid route data");
  }

  return parsed.data;
}

export function buildRouteFileArtifacts(
  fileContent: string,
  fileName?: string,
): RouteFileArtifacts {
  assertRouteContentSize(fileContent);
  const extension = fileName ? getRouteFileExtension(fileName) : undefined;
  if (extension === null) throw new Error("Unsupported route file extension");
  const parsedResult = parseRouteWithFormat(fileContent, extension);
  const parsed = parsedRouteSchema.safeParse(parsedResult.route);
  if (!parsed.success) {
    throw new Error("Failed to process route file");
  }

  const validation = validateRoute(parsed.data);
  if (!validation.valid) {
    throw new Error(`Invalid route: ${validation.errors.join(", ")}`);
  }

  const stats = calculateRouteStats(parsed.data.coordinates);
  const tolerance = calculateSimplificationTolerance(parsed.data.coordinates.length);
  const simplified = simplifyCoordinates(parsed.data.coordinates, tolerance);
  const polyline = encodePolyline(simplified);

  let elevationPolyline: string | null = null;
  if (simplified.some((coord) => coord.altitude !== undefined)) {
    elevationPolyline = encodeElevationPolyline(simplified.map((coord) => coord.altitude || 0));
  }

  return {
    elevationPolyline,
    format: parsedResult.format,
    parsed: parsed.data,
    polyline,
    totalAscent: stats.totalAscent,
    totalDescent: stats.totalDescent,
    totalDistance: stats.totalDistance,
  };
}

export function inferRouteContentType(fileName: string): string {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".gpx")) {
    return "application/gpx+xml";
  }

  if (lowerName.endsWith(".tcx")) {
    return "application/vnd.garmin.tcx+xml";
  }

  if (lowerName.endsWith(".xml")) {
    return ROUTE_FILE_MIME_TYPES.xml;
  }

  return "application/octet-stream";
}

export function inferRouteFileExtension(fileName: string): string {
  return getRouteFileExtension(fileName) ?? "gpx";
}

function calculateSimplificationTolerance(pointCount: number): number {
  if (pointCount <= 200) return 0;
  if (pointCount <= 500) return 0.0001;
  if (pointCount <= 1000) return 0.0002;
  if (pointCount <= 2000) return 0.0003;
  return 0.0005;
}
