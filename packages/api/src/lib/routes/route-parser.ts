import type { LatLngAlt } from "@repo/core";
import { MAX_ROUTE_POINT_COUNT } from "@repo/core/route-files";
import { DOMParser } from "@xmldom/xmldom";

export type RouteContentFormat = "gpx" | "tcx";

const unsafeXmlDeclarationPattern = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

function assertSafeXml(content: string) {
  if (unsafeXmlDeclarationPattern.test(content)) {
    throw new Error("Route XML declarations are not allowed");
  }
}

function parseXmlDocument(content: string): Document {
  assertSafeXml(content);
  let hasParseError = false;
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {
        hasParseError = true;
      },
      error: () => {
        hasParseError = true;
      },
      fatalError: () => {
        hasParseError = true;
      },
    },
  });
  const document = parser.parseFromString(content, "text/xml");

  if (hasParseError || elementsByLocalName(document, "parsererror").length > 0) {
    throw new Error("Invalid route file: XML parsing error");
  }

  return document;
}

function getDocumentFormat(document: Document): RouteContentFormat {
  const rootLocalName = document.documentElement?.localName;
  if (rootLocalName === "gpx") return "gpx";
  if (rootLocalName === "TrainingCenterDatabase") return "tcx";
  throw new Error("Unsupported route file root element");
}

function getExpectedFormat(fileType?: string): RouteContentFormat | undefined {
  switch (fileType?.toLowerCase()) {
    case undefined:
    case "xml":
    case "application/xml":
    case "text/xml":
      return undefined;
    case "gpx":
    case "application/gpx+xml":
      return "gpx";
    case "tcx":
    case "application/vnd.garmin.tcx+xml":
      return "tcx";
    default:
      throw new Error(`Unsupported route file type: ${fileType}`);
  }
}

function elementsByLocalName(
  parent: Document | Element,
  localName: string,
): HTMLCollectionOf<Element> {
  return parent.getElementsByTagNameNS("*", localName);
}

function appendCoordinate(coordinates: LatLngAlt[], coordinate: LatLngAlt) {
  if (coordinates.length >= MAX_ROUTE_POINT_COUNT) {
    throw new Error(`Route exceeds the ${MAX_ROUTE_POINT_COUNT} point limit`);
  }
  coordinates.push(coordinate);
}

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
  return parseRouteWithFormat(gpxContent, "gpx").route;
}

function parseGPXDocument(doc: Document): ParsedRoute {
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
 * Parse TCX course/activity content and extract route data.
 */
export function parseTCX(tcxContent: string): ParsedRoute {
  return parseRouteWithFormat(tcxContent, "tcx").route;
}

function parseTCXDocument(doc: Document): ParsedRoute {
  const name = extractFirstText(doc, "Name") ?? extractFirstText(doc, "Id");
  const time = extractFirstText(doc, "Id");
  const coordinates = extractTCXCoordinates(doc);

  if (coordinates.length === 0) {
    throw new Error("No valid coordinates found in TCX file");
  }

  return {
    name,
    coordinates,
    metadata: time ? { time } : undefined,
  };
}

/**
 * Extract route name from GPX
 */
function extractName(doc: Document): string | undefined {
  // Try metadata name first
  const metadataName = elementsByLocalName(doc, "name")[0];
  if (metadataName?.textContent) {
    return metadataName.textContent.trim();
  }

  // Try first track name
  const tracks = elementsByLocalName(doc, "trk");
  if (tracks.length > 0 && tracks[0]) {
    const trkName = elementsByLocalName(tracks[0], "name")[0];
    if (trkName?.textContent) {
      return trkName.textContent.trim();
    }
  }

  // Try first route name
  const routes = elementsByLocalName(doc, "rte");
  if (routes.length > 0 && routes[0]) {
    const rteName = elementsByLocalName(routes[0], "name")[0];
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

  const metadataElement = elementsByLocalName(doc, "metadata")[0];
  if (metadataElement) {
    const authorElement = elementsByLocalName(metadataElement, "author")[0];
    if (authorElement) {
      const nameElement = elementsByLocalName(authorElement, "name")[0];
      if (nameElement?.textContent) {
        metadata.author = nameElement.textContent.trim();
      }
    }

    const timeElement = elementsByLocalName(metadataElement, "time")[0];
    if (timeElement?.textContent) {
      metadata.time = timeElement.textContent.trim();
    }

    const boundsElement = elementsByLocalName(metadataElement, "bounds")[0];
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
  const tracks = elementsByLocalName(doc, "trk");
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track) continue;
    const segments = elementsByLocalName(track, "trkseg");

    for (let j = 0; j < segments.length; j++) {
      const segment = segments[j];
      if (!segment) continue;
      const trackPoints = elementsByLocalName(segment, "trkpt");

      for (let k = 0; k < trackPoints.length; k++) {
        const trackPoint = trackPoints[k];
        if (!trackPoint) continue;
        const point = parseTrackPoint(trackPoint);
        if (point) {
          appendCoordinate(coordinates, point);
        }
      }
    }
  }

  // If no tracks found, try routes
  if (coordinates.length === 0) {
    const routes = elementsByLocalName(doc, "rte");
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (!route) continue;
      const routePoints = elementsByLocalName(route, "rtept");

      for (let j = 0; j < routePoints.length; j++) {
        const routePoint = routePoints[j];
        if (!routePoint) continue;
        const point = parseRoutePoint(routePoint);
        if (point) {
          appendCoordinate(coordinates, point);
        }
      }
    }
  }

  // If still no coordinates, try waypoints as a last resort
  if (coordinates.length === 0) {
    const waypoints = elementsByLocalName(doc, "wpt");
    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      if (!waypoint) continue;
      const point = parseWaypoint(waypoint);
      if (point) {
        appendCoordinate(coordinates, point);
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

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  const elevationElement = elementsByLocalName(element, "ele")[0];
  const altitude = elevationElement?.textContent
    ? parseFloat(elevationElement.textContent)
    : undefined;

  return {
    latitude: lat,
    longitude: lon,
    altitude: typeof altitude === "number" && !Number.isNaN(altitude) ? altitude : undefined,
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
export function parseRouteWithFormat(
  routeContent: string,
  fileType?: string,
): { format: RouteContentFormat; route: ParsedRoute } {
  const expectedFormat = getExpectedFormat(fileType);
  const document = parseXmlDocument(routeContent);
  const format = getDocumentFormat(document);

  if (expectedFormat && expectedFormat !== format) {
    throw new Error("Route file extension does not match its content");
  }

  return {
    format,
    route: format === "gpx" ? parseGPXDocument(document) : parseTCXDocument(document),
  };
}

export function parseRoute(routeContent: string, fileType?: string): ParsedRoute {
  return parseRouteWithFormat(routeContent, fileType).route;
}

/**
 * Detect file type from content
 */
export function detectRouteContentFormat(content: string): RouteContentFormat {
  return getDocumentFormat(parseXmlDocument(content));
}

function extractTCXCoordinates(doc: Document): LatLngAlt[] {
  const coordinates: LatLngAlt[] = [];
  const trackpoints = elementsByLocalName(doc, "Trackpoint");

  for (let index = 0; index < trackpoints.length; index += 1) {
    const point = parseTCXTrackpoint(trackpoints[index]);
    if (point) appendCoordinate(coordinates, point);
  }

  return coordinates;
}

function parseTCXTrackpoint(element: Element | undefined): LatLngAlt | null {
  if (!element) return null;

  const position = elementsByLocalName(element, "Position")[0];
  if (!position) return null;

  const latitude = parseNumberText(position, "LatitudeDegrees");
  const longitude = parseNumberText(position, "LongitudeDegrees");
  if (latitude === undefined || longitude === undefined) return null;

  return {
    latitude,
    longitude,
    altitude: parseNumberText(element, "AltitudeMeters"),
  };
}

function parseNumberText(element: Element, tagName: string) {
  const text = extractFirstText(element, tagName);
  if (!text) return undefined;

  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

function extractFirstText(element: Document | Element, tagName: string) {
  return elementsByLocalName(element, tagName)[0]?.textContent?.trim() || undefined;
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

  if (route.coordinates && route.coordinates.length > MAX_ROUTE_POINT_COUNT) {
    errors.push(`Route must contain at most ${MAX_ROUTE_POINT_COUNT} coordinates`);
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
