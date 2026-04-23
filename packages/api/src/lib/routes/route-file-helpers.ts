import { createHash } from "node:crypto";

import {
  calculateRouteStats,
  encodeElevationPolyline,
  encodePolyline,
  simplifyCoordinates,
} from "@repo/core";
import { z } from "zod";

import { type ParsedRoute, parseRoute, validateRoute } from "./route-parser";

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
    coordinates: z.array(routeCoordinateSchema),
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
  checksumSha256: string;
  elevationPolyline: string | null;
  parsed: ParsedRoute;
  polyline: string;
  totalAscent: number;
  totalDescent: number;
  totalDistance: number;
}

export function parseStoredRouteFile(fileContent: string): ParsedRoute {
  const parsed = parsedRouteSchema.safeParse(parseRoute(fileContent, "gpx"));
  if (!parsed.success) {
    throw new Error("Stored route file contained invalid route data");
  }

  return parsed.data;
}

export function buildRouteFileArtifacts(fileContent: string): RouteFileArtifacts {
  const parsed = parsedRouteSchema.safeParse(parseRoute(fileContent, "gpx"));
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
  const checksumSha256 = createHash("sha256").update(fileContent).digest("hex");

  let elevationPolyline: string | null = null;
  if (simplified.some((coord) => coord.altitude !== undefined)) {
    elevationPolyline = encodeElevationPolyline(simplified.map((coord) => coord.altitude || 0));
  }

  return {
    checksumSha256,
    elevationPolyline,
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

  return "application/octet-stream";
}

export function inferRouteFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();
  return extension && extension.length > 0 ? extension : "gpx";
}

function calculateSimplificationTolerance(pointCount: number): number {
  if (pointCount <= 200) return 0;
  if (pointCount <= 500) return 0.0001;
  if (pointCount <= 1000) return 0.0002;
  if (pointCount <= 2000) return 0.0003;
  return 0.0005;
}
