import type { LatLngAlt } from "@repo/core";
import { DOMParser } from "@xmldom/xmldom";

export interface ParsedRoute {
  name?: string;
  coordinates: LatLngAlt[];
  metadata?: {
    author?: string;
    time?: string;
    bounds?: {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    };
  };
}

/**
 * Parse GPX file content and extract route data
 */
export function parseGPX(gpxContent: string): ParsedRoute {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxContent, "text/xml");

  // Check for parsing errors
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error("Invalid GPX file: XML parsing error");
  }

  const gpxElement = doc.documentElement;
  if (gpxElement.nodeName !== "gpx") {
    throw new Error("Invalid GPX file: root element must be <gpx>");
  }

  // Extract metadata
  const metadata = extractMetadata(doc);

  // Extract name (from metadata or first track/route name)
  const name = extractName(doc);

  // Extract coordinates from tracks or routes
  const coordinates = extractCoordinates(doc);

  if (coordinates.length === 0) {
    throw new Error("No valid coordinates found in GPX file");
  }

  return {
    name,
    coordinates,
    metadata,
  };
}

/**
 * Extract route name from GPX
 */
function extractName(doc: Document): string | undefined {
  // Try metadata name first
  const metadataName = doc.getElementsByTagName("name")[0];
  if (metadataName?.textContent) {
    return metadataName.textContent.trim();
  }

  // Try first track name
  const tracks = doc.getElementsByTagName("trk");
  if (tracks.length > 0 && tracks[0]) {
    const trkName = tracks[0].getElementsByTagName("name")[0];
    if (trkName?.textContent) {
      return trkName.textContent.trim();
    }
  }

  // Try first route name
  const routes = doc.getElementsByTagName("rte");
  if (routes.length > 0 && routes[0]) {
    const rteName = routes[0].getElementsByTagName("name")[0];
    if (rteName?.textContent) {
      return rteName.textContent.trim();
    }
  }

  return undefined;
}

/**
 * Extract metadata from GPX
 */
function extractMetadata(doc: Document): ParsedRoute["metadata"] {
  const metadata: ParsedRoute["metadata"] = {};

  const metadataElement = doc.getElementsByTagName("metadata")[0];
  if (metadataElement) {
    const authorElement = metadataElement.getElementsByTagName("author")[0];
    if (authorElement) {
      const nameElement = authorElement.getElementsByTagName("name")[0];
      if (nameElement?.textContent) {
        metadata.author = nameElement.textContent.trim();
      }
    }

    const timeElement = metadataElement.getElementsByTagName("time")[0];
    if (timeElement?.textContent) {
      metadata.time = timeElement.textContent.trim();
    }

    const boundsElement = metadataElement.getElementsByTagName("bounds")[0];
    if (boundsElement) {
      const minLat = parseFloat(boundsElement.getAttribute("minlat") || "0");
      const maxLat = parseFloat(boundsElement.getAttribute("maxlat") || "0");
      const minLng = parseFloat(boundsElement.getAttribute("minlon") || "0");
      const maxLng = parseFloat(boundsElement.getAttribute("maxlon") || "0");

      metadata.bounds = { minLat, maxLat, minLng, maxLng };
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Extract coordinates from GPX tracks and routes
 */
function extractCoordinates(doc: Document): LatLngAlt[] {
  const coordinates: LatLngAlt[] = [];

  // Extract from tracks (most common in GPX files)
  const tracks = doc.getElementsByTagName("trk");
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track) continue;
    const segments = track.getElementsByTagName("trkseg");

    for (let j = 0; j < segments.length; j++) {
      const segment = segments[j];
      if (!segment) continue;
      const trackPoints = segment.getElementsByTagName("trkpt");

      for (let k = 0; k < trackPoints.length; k++) {
        const trackPoint = trackPoints[k];
        if (!trackPoint) continue;
        const point = parseTrackPoint(trackPoint);
        if (point) {
          coordinates.push(point);
        }
      }
    }
  }

  // If no tracks found, try routes
  if (coordinates.length === 0) {
    const routes = doc.getElementsByTagName("rte");
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (!route) continue;
      const routePoints = route.getElementsByTagName("rtept");

      for (let j = 0; j < routePoints.length; j++) {
        const routePoint = routePoints[j];
        if (!routePoint) continue;
        const point = parseRoutePoint(routePoint);
        if (point) {
          coordinates.push(point);
        }
      }
    }
  }

  // If still no coordinates, try waypoints as a last resort
  if (coordinates.length === 0) {
    const waypoints = doc.getElementsByTagName("wpt");
    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      if (!waypoint) continue;
      const point = parseWaypoint(waypoint);
      if (point) {
        coordinates.push(point);
      }
    }
  }

  return coordinates;
}

/**
 * Parse a track point element
 */
function parseTrackPoint(element: Element): LatLngAlt | null {
  const lat = parseFloat(element.getAttribute("lat") || "");
  const lon = parseFloat(element.getAttribute("lon") || "");

  if (isNaN(lat) || isNaN(lon)) {
    return null;
  }

  const elevationElement = element.getElementsByTagName("ele")[0];
  const altitude = elevationElement?.textContent
    ? parseFloat(elevationElement.textContent)
    : undefined;

  return {
    latitude: lat,
    longitude: lon,
    altitude: altitude && !isNaN(altitude) ? altitude : undefined,
  };
}

/**
 * Parse a route point element
 */
function parseRoutePoint(element: Element): LatLngAlt | null {
  return parseTrackPoint(element); // Same structure as track points
}

/**
 * Parse a waypoint element
 */
function parseWaypoint(element: Element): LatLngAlt | null {
  return parseTrackPoint(element); // Same structure as track points
}

/**
 * Main route parser that handles different file types
 * Currently supports GPX, can be extended for TCX, FIT, etc.
 */
export function parseRoute(
  routeContent: string,
  fileType?: string,
): ParsedRoute {
  // Auto-detect file type from content if not provided
  const detectedType = fileType || detectFileType(routeContent);

  switch (detectedType.toLowerCase()) {
    case "gpx":
    case "application/gpx+xml":
    case "text/xml":
      return parseGPX(routeContent);

    default:
      throw new Error(`Unsupported route file type: ${detectedType}`);
  }
}

/**
 * Detect file type from content
 */
function detectFileType(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("<?xml") || trimmed.includes("<gpx")) {
    return "gpx";
  }

  throw new Error("Unable to detect route file type");
}

/**
 * Validate parsed route data
 */
export function validateRoute(route: ParsedRoute): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!route.coordinates || route.coordinates.length === 0) {
    errors.push("Route must have at least one coordinate");
  }

  if (route.coordinates && route.coordinates.length < 2) {
    errors.push("Route must have at least two coordinates");
  }

  // Check for invalid coordinates
  if (route.coordinates) {
    for (let i = 0; i < route.coordinates.length; i++) {
      const coord = route.coordinates[i];
      if (
        coord &&
        (coord.latitude < -90 ||
          coord.latitude > 90 ||
          coord.longitude < -180 ||
          coord.longitude > 180)
      ) {
        errors.push(
          `Invalid coordinate at index ${i}: lat=${coord.latitude}, lng=${coord.longitude}`,
        );
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
