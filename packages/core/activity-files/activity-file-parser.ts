import { DOMParser } from "@xmldom/xmldom";
import { parseFitFileWithSDK } from "../lib/fit-sdk-parser";
import type { ActivityRecord, StandardActivity } from "../types/normalization";
import { calculateRouteStats } from "../utils/polyline";

export type ActivityFileType = "fit" | "gpx" | "tcx";

export function inferActivityFileType(fileName?: string, content?: string): ActivityFileType {
  const extension = fileName?.split(".").pop()?.trim().toLowerCase();

  if (extension === "fit" || extension === "gpx" || extension === "tcx") {
    return extension;
  }

  const trimmed = content?.trim();
  if (trimmed) {
    if (trimmed.includes("<TrainingCenterDatabase")) return "tcx";
    if (trimmed.startsWith("<?xml") || trimmed.includes("<gpx")) return "gpx";
  }

  throw new Error("Unsupported activity file type");
}

export function parseActivityFile(input: {
  data: Buffer | Uint8Array | string;
  fileName?: string;
  fileType?: ActivityFileType;
}): StandardActivity {
  const textData = typeof input.data === "string" ? input.data : undefined;
  const fileType = input.fileType ?? inferActivityFileType(input.fileName, textData);

  if (fileType === "fit") {
    if (typeof input.data === "string") {
      throw new Error("FIT activity files must be parsed from binary data");
    }
    return parseFitFileWithSDK(input.data);
  }

  const xml =
    typeof input.data === "string" ? input.data : Buffer.from(input.data).toString("utf8");
  return fileType === "gpx" ? parseGpxActivity(xml) : parseTcxActivity(xml);
}

function parseGpxActivity(gpxContent: string): StandardActivity {
  const doc = parseXml(gpxContent, "GPX");
  if (doc.documentElement.nodeName !== "gpx") {
    throw new Error("Invalid GPX activity file: root element must be <gpx>");
  }

  const records = collectGpxRecords(doc);
  if (records.length === 0) {
    throw new Error("No valid activity records found in GPX file");
  }

  return buildXmlActivity({
    name: extractFirstText(doc, "name"),
    records,
    type: "generic",
  });
}

function parseTcxActivity(tcxContent: string): StandardActivity {
  const doc = parseXml(tcxContent, "TCX");
  if (!doc.documentElement.nodeName.toLowerCase().endsWith("trainingcenterdatabase")) {
    throw new Error("Invalid TCX activity file: root element must be <TrainingCenterDatabase>");
  }

  const records = collectTcxRecords(doc);
  if (records.length === 0) {
    throw new Error("No valid activity records found in TCX file");
  }

  const activity = doc.getElementsByTagName("Activity")[0];
  const type = activity?.getAttribute("Sport")?.toLowerCase() || "generic";

  return buildXmlActivity({
    calories: parseNumberText(doc, "Calories"),
    name: extractFirstText(doc, "Id"),
    records,
    type,
  });
}

function parseXml(content: string, label: string): Document {
  const doc = new DOMParser().parseFromString(content, "text/xml");
  if (doc.getElementsByTagName("parsererror")[0]) {
    throw new Error(`Invalid ${label} activity file: XML parsing error`);
  }
  return doc;
}

function collectGpxRecords(doc: Document): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const trackPoints = doc.getElementsByTagName("trkpt");

  for (let index = 0; index < trackPoints.length; index += 1) {
    const point = trackPoints[index];
    if (!point) continue;
    const record = parseGpxPoint(point);
    if (record) records.push(record);
  }

  return records;
}

function parseGpxPoint(element: Element): ActivityRecord | null {
  const latitude = parseAttributeNumber(element, "lat");
  const longitude = parseAttributeNumber(element, "lon");
  if (latitude === undefined || longitude === undefined) return null;

  return {
    timestamp: parseDateText(element, "time") ?? new Date(0),
    positionLat: latitude,
    positionLong: longitude,
    altitude: parseNumberText(element, "ele"),
    heartRate: parseNumberText(element, "gpxtpx:hr") ?? parseNumberText(element, "hr"),
    cadence: parseNumberText(element, "gpxtpx:cad") ?? parseNumberText(element, "cad"),
    power: parseNumberText(element, "power"),
  };
}

function collectTcxRecords(doc: Document): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const trackpoints = doc.getElementsByTagName("Trackpoint");

  for (let index = 0; index < trackpoints.length; index += 1) {
    const point = trackpoints[index];
    if (!point) continue;
    const record = parseTcxTrackpoint(point);
    if (record) records.push(record);
  }

  return records;
}

function parseTcxTrackpoint(element: Element): ActivityRecord | null {
  const position = element.getElementsByTagName("Position")[0];
  const latitude = position ? parseNumberText(position, "LatitudeDegrees") : undefined;
  const longitude = position ? parseNumberText(position, "LongitudeDegrees") : undefined;

  return {
    timestamp: parseDateText(element, "Time") ?? new Date(0),
    positionLat: latitude,
    positionLong: longitude,
    distance: parseNumberText(element, "DistanceMeters"),
    altitude: parseNumberText(element, "AltitudeMeters"),
    heartRate: parseNumberText(element, "Value"),
    cadence: parseNumberText(element, "Cadence"),
    power: parseNumberText(element, "Watts"),
  };
}

function buildXmlActivity(input: {
  calories?: number;
  name?: string;
  records: ActivityRecord[];
  type: string;
}): StandardActivity {
  const timedRecords = input.records.filter((record) => record.timestamp.getTime() > 0);
  const firstTimed = timedRecords[0];
  const lastTimed = timedRecords[timedRecords.length - 1];
  const startTime = firstTimed?.timestamp ?? input.records[0]?.timestamp ?? new Date();
  const totalTime =
    firstTimed && lastTimed
      ? Math.max(0, (lastTimed.timestamp.getTime() - firstTimed.timestamp.getTime()) / 1000)
      : 0;
  const totalDistance = resolveTotalDistance(input.records);
  const stats = calculateRouteStats(
    input.records
      .filter((record) => record.positionLat !== undefined && record.positionLong !== undefined)
      .map((record) => ({
        latitude: record.positionLat!,
        longitude: record.positionLong!,
        altitude: record.altitude,
      })),
  );

  return {
    metadata: {
      name: input.name,
      startTime,
      type: input.type,
    },
    summary: {
      avgCadence: average(input.records.map((record) => record.cadence)),
      avgHeartRate: average(input.records.map((record) => record.heartRate)),
      avgPower: average(input.records.map((record) => record.power)),
      calories: input.calories,
      maxCadence: maximum(input.records.map((record) => record.cadence)),
      maxHeartRate: maximum(input.records.map((record) => record.heartRate)),
      maxPower: maximum(input.records.map((record) => record.power)),
      totalAscent: stats.totalAscent,
      totalDescent: stats.totalDescent,
      totalDistance,
      totalTime,
    },
    records: input.records,
  };
}

function resolveTotalDistance(records: ActivityRecord[]): number {
  const lastDistance = [...records]
    .reverse()
    .find((record) => record.distance !== undefined && Number.isFinite(record.distance))?.distance;
  if (lastDistance !== undefined) return lastDistance;

  const coords = records
    .filter((record) => record.positionLat !== undefined && record.positionLong !== undefined)
    .map((record) => ({
      latitude: record.positionLat!,
      longitude: record.positionLong!,
      altitude: record.altitude,
    }));

  return calculateRouteStats(coords).totalDistance;
}

function average(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  if (numbers.length === 0) return undefined;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function maximum(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}

function parseAttributeNumber(element: Element, attributeName: string): number | undefined {
  const value = Number.parseFloat(element.getAttribute(attributeName) || "");
  return Number.isFinite(value) ? value : undefined;
}

function parseNumberText(element: Document | Element, tagName: string): number | undefined {
  const text = extractFirstText(element, tagName);
  if (!text) return undefined;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

function parseDateText(element: Document | Element, tagName: string): Date | undefined {
  const text = extractFirstText(element, tagName);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function extractFirstText(element: Document | Element, tagName: string): string | undefined {
  return element.getElementsByTagName(tagName)[0]?.textContent?.trim() || undefined;
}
