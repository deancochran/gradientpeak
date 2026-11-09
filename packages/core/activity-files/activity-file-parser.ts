import { DOMParser } from "@xmldom/xmldom";
import { parseFitFileWithSDK } from "../lib/fit-sdk-parser";
import type { ActivityRecord, StandardActivity } from "../types/normalization";
import { calculateRouteStats } from "../utils/polyline";
import { ActivityFileParseError } from "./activity-file-errors";
import {
  type ActivityFileParseLimits,
  type ResolvedActivityFileParseLimits,
  resolveActivityFileParseLimits,
} from "./activity-file-limits";

export type ActivityFileType = "fit" | "gpx" | "tcx";
export { ActivityFileParseError } from "./activity-file-errors";
export {
  type ActivityFileParseLimits,
  DEFAULT_ACTIVITY_FILE_PARSE_MAX_MESSAGES,
  DEFAULT_ACTIVITY_FILE_PARSE_MAX_RECORDS,
} from "./activity-file-limits";

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

  throw new ActivityFileParseError("unsupported_format");
}

export function parseActivityFile(input: {
  data: Uint8Array | string;
  fileName?: string;
  fileType?: ActivityFileType;
  limits?: ActivityFileParseLimits;
}): StandardActivity {
  const textData = typeof input.data === "string" ? input.data : undefined;
  const fileType = input.fileType ?? inferActivityFileType(input.fileName, textData);
  const limits = resolveActivityFileParseLimits(input.limits);

  if (fileType === "fit") {
    if (typeof input.data === "string") {
      throw new ActivityFileParseError("unsupported_format");
    }
    return parseFitFileWithSDK(input.data, limits);
  }

  const xml = typeof input.data === "string" ? input.data : new TextDecoder().decode(input.data);
  return fileType === "gpx" ? parseGpxActivity(xml, limits) : parseTcxActivity(xml, limits);
}

function parseGpxActivity(
  gpxContent: string,
  limits: ResolvedActivityFileParseLimits,
): StandardActivity {
  assertXmlPreflight(gpxContent, limits);
  const doc = parseXml(gpxContent, "GPX");
  if (xmlElementLocalName(doc.documentElement) !== "gpx") {
    throw new ActivityFileParseError("corrupt_artifact");
  }
  const tracks = descendantElementsByLocalName(doc, "trk", 2);
  if (tracks.length !== 1 || !tracks[0]) {
    throw new ActivityFileParseError("corrupt_artifact");
  }
  const track = tracks[0];

  const records = collectGpxRecords(track, limits.maxRecords);
  if (records.length === 0) {
    throw new ActivityFileParseError("corrupt_artifact");
  }

  const name = extractFirstText(track, "name");
  return buildXmlActivity({
    ...(name === undefined ? {} : { name }),
    records,
    type: extractFirstText(track, "type")?.toLowerCase() || "generic",
  });
}

function parseTcxActivity(
  tcxContent: string,
  limits: ResolvedActivityFileParseLimits,
): StandardActivity {
  assertXmlPreflight(tcxContent, limits);
  const doc = parseXml(tcxContent, "TCX");
  if (xmlElementLocalName(doc.documentElement) !== "trainingcenterdatabase") {
    throw new ActivityFileParseError("corrupt_artifact");
  }

  const activities = descendantElementsByLocalName(doc, "activity", 2);
  if (activities.length !== 1 || !activities[0]) {
    throw new ActivityFileParseError("corrupt_artifact");
  }
  const activity = activities[0];
  const records = collectTcxRecords(activity, limits.maxRecords);
  if (records.length === 0) {
    throw new ActivityFileParseError("corrupt_artifact");
  }

  const type =
    (
      activity?.getAttribute("Sport") ?? activity?.getAttribute("ActivityCategory")
    )?.toLowerCase() || "generic";

  const calories = parseNumberText(activity, "Calories");
  const name = extractFirstText(activity, "Id");
  return buildXmlActivity({
    ...(calories === undefined ? {} : { calories }),
    ...(name === undefined ? {} : { name }),
    records,
    type,
  });
}

function parseXml(content: string, _label: string): Document {
  const doc = new DOMParser().parseFromString(content, "text/xml");
  if (doc.getElementsByTagName("parsererror")[0]) {
    throw new ActivityFileParseError("corrupt_artifact");
  }
  return doc;
}

function recordLimitError(): ActivityFileParseError {
  return new ActivityFileParseError("corrupt_artifact", new Error("record_limit_exceeded"));
}

function xmlPreflightError(
  reason: "xml_declaration_not_supported" | "xml_node_limit_exceeded" | "xml_size_limit_exceeded",
) {
  return new ActivityFileParseError("corrupt_artifact", new Error(reason));
}

const MAX_XML_SOURCE_CODE_UNITS = 50 * 1024 * 1024;
const MAX_XML_CODE_UNITS_PER_NODE_BUDGET = 16 * 1024;

/**
 * Performs a single constant-space lexical pass before DOM construction.
 * It counts trackpoints by namespace-local name, and bounds elements,
 * attributes, text, comments, CDATA, declarations, and processing instructions.
 */
function assertXmlPreflight(content: string, limits: ResolvedActivityFileParseLimits): void {
  const maxSourceCodeUnits = Math.min(
    MAX_XML_SOURCE_CODE_UNITS,
    limits.maxMessages * MAX_XML_CODE_UNITS_PER_NODE_BUDGET,
  );
  if (content.length > maxSourceCodeUnits) {
    throw xmlPreflightError("xml_size_limit_exceeded");
  }

  let nodeCount = 0;
  let recordCount = 0;
  let offset = 0;
  const addNode = () => {
    nodeCount += 1;
    if (nodeCount > limits.maxMessages) {
      throw xmlPreflightError("xml_node_limit_exceeded");
    }
  };

  while (offset < content.length) {
    const open = content.indexOf("<", offset);
    if (open === -1) {
      if (offset < content.length) addNode();
      return;
    }
    if (open > offset) addNode();

    if (content.startsWith("<!--", open)) {
      addNode();
      offset = offsetAfter(content, "-->", open + 4);
      continue;
    }
    if (content.startsWith("<![CDATA[", open)) {
      addNode();
      offset = offsetAfter(content, "]]>", open + 9);
      continue;
    }

    const marker = content.charCodeAt(open + 1);
    if (marker === 33) {
      // GPX and TCX do not require DTDs. Rejecting declarations also prevents
      // entity expansion from creating nodes that were not present in source.
      throw xmlPreflightError("xml_declaration_not_supported");
    }
    if (marker === 63) {
      addNode();
      offset = offsetAfter(content, "?>", open + 2);
      continue;
    }
    if (marker === 47) {
      offset = scanTagEnd(content, open + 2);
      continue;
    }
    if (!Number.isFinite(marker) || marker === 62 || isXmlWhitespace(marker)) {
      offset = open + 1;
      continue;
    }

    const nameStart = open + 1;
    let nameEnd = nameStart;
    while (nameEnd < content.length && !isXmlNameTerminator(content.charCodeAt(nameEnd))) {
      nameEnd += 1;
    }
    if (nameEnd === nameStart) {
      offset = open + 1;
      continue;
    }

    addNode();
    if (
      xmlQualifiedNameHasLocalName(content, nameStart, nameEnd, "trkpt") ||
      xmlQualifiedNameHasLocalName(content, nameStart, nameEnd, "trackpoint")
    ) {
      recordCount += 1;
      if (recordCount > limits.maxRecords) throw recordLimitError();
    }
    offset = scanStartTagEnd(content, nameEnd, addNode);
  }
}

function offsetAfter(content: string, token: string, from: number): number {
  const end = content.indexOf(token, from);
  return end === -1 ? content.length : end + token.length;
}

function isXmlWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

function isXmlNameTerminator(code: number): boolean {
  return (
    !Number.isFinite(code) || isXmlWhitespace(code) || code === 47 || code === 61 || code === 62
  );
}

function xmlQualifiedNameHasLocalName(
  content: string,
  nameStart: number,
  nameEnd: number,
  expected: string,
): boolean {
  let localStart = nameStart;
  for (let index = nameStart; index < nameEnd; index += 1) {
    if (content.charCodeAt(index) === 58) localStart = index + 1;
  }
  if (nameEnd - localStart !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const sourceCode = content.charCodeAt(localStart + index);
    const lowerSourceCode = sourceCode >= 65 && sourceCode <= 90 ? sourceCode + 32 : sourceCode;
    if (lowerSourceCode !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function scanStartTagEnd(content: string, from: number, addAttributeNode: () => void): number {
  let offset = from;
  while (offset < content.length) {
    while (isXmlWhitespace(content.charCodeAt(offset))) offset += 1;
    const marker = content.charCodeAt(offset);
    if (!Number.isFinite(marker)) return content.length;
    if (marker === 62) return offset + 1;
    if (marker === 47 && content.charCodeAt(offset + 1) === 62) return offset + 2;
    if (marker === 47 || marker === 61) {
      offset += 1;
      continue;
    }

    const attributeStart = offset;
    while (offset < content.length && !isXmlNameTerminator(content.charCodeAt(offset))) {
      offset += 1;
    }
    if (offset === attributeStart) {
      offset += 1;
      continue;
    }
    addAttributeNode();

    while (isXmlWhitespace(content.charCodeAt(offset))) offset += 1;
    if (content.charCodeAt(offset) !== 61) continue;
    offset += 1;
    while (isXmlWhitespace(content.charCodeAt(offset))) offset += 1;
    const quote = content.charCodeAt(offset);
    if (quote === 34 || quote === 39) {
      offset += 1;
      while (offset < content.length && content.charCodeAt(offset) !== quote) offset += 1;
      if (offset < content.length) offset += 1;
      continue;
    }
    while (
      offset < content.length &&
      !isXmlWhitespace(content.charCodeAt(offset)) &&
      content.charCodeAt(offset) !== 62
    ) {
      offset += 1;
    }
  }
  return content.length;
}

function scanTagEnd(content: string, from: number): number {
  const end = content.indexOf(">", from);
  return end === -1 ? content.length : end + 1;
}

function collectGpxRecords(track: Element, maxRecords: number): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const trackPoints = descendantElementsByLocalName(track, "trkpt", maxRecords + 1);
  if (trackPoints.length > maxRecords) throw recordLimitError();

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

  const altitude = parseNumberText(element, "ele");
  const heartRate = parseNumberText(element, "gpxtpx:hr") ?? parseNumberText(element, "hr");
  const cadence = parseNumberText(element, "gpxtpx:cad") ?? parseNumberText(element, "cad");
  const power = parseNumberText(element, "power");
  return {
    timestamp: parseDateText(element, "time") ?? new Date(0),
    positionLat: latitude,
    positionLong: longitude,
    ...(altitude === undefined ? {} : { altitude }),
    ...(heartRate === undefined ? {} : { heartRate }),
    ...(cadence === undefined ? {} : { cadence }),
    ...(power === undefined ? {} : { power }),
  };
}

function collectTcxRecords(activity: Element, maxRecords: number): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const trackpoints = descendantElementsByLocalName(activity, "trackpoint", maxRecords + 1);
  if (trackpoints.length > maxRecords) throw recordLimitError();

  for (let index = 0; index < trackpoints.length; index += 1) {
    const point = trackpoints[index];
    if (!point) continue;
    const record = parseTcxTrackpoint(point);
    if (record) records.push(record);
  }

  return records;
}

function parseTcxTrackpoint(element: Element): ActivityRecord | null {
  const position = firstDescendantElementByLocalName(element, "position");
  const latitude = position ? parseNumberText(position, "LatitudeDegrees") : undefined;
  const longitude = position ? parseNumberText(position, "LongitudeDegrees") : undefined;
  const extensions = firstDescendantElementByLocalName(element, "extensions");
  const tpx = extensions ? firstDescendantElementByLocalName(extensions, "tpx") : undefined;
  const speedText = tpx ? extractFirstText(tpx, "Speed") : undefined;
  const speed =
    speedText !== undefined && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(speedText)
      ? Number(speedText)
      : NaN;

  const distance = parseNumberText(element, "DistanceMeters");
  const altitude = parseNumberText(element, "AltitudeMeters");
  const heartRate = parseNumberText(element, "Value");
  const cadence = parseNumberText(element, "Cadence");
  const power = parseNumberText(element, "Watts");
  const validSpeed = Number.isFinite(speed) && speed >= 0 ? speed : undefined;
  return {
    timestamp: parseDateText(element, "Time") ?? new Date(0),
    ...(latitude === undefined ? {} : { positionLat: latitude }),
    ...(longitude === undefined ? {} : { positionLong: longitude }),
    ...(distance === undefined ? {} : { distance }),
    ...(altitude === undefined ? {} : { altitude }),
    ...(heartRate === undefined ? {} : { heartRate }),
    ...(cadence === undefined ? {} : { cadence }),
    ...(power === undefined ? {} : { power }),
    ...(validSpeed === undefined ? {} : { speed: validSpeed }),
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
  const endTime = lastTimed?.timestamp ?? startTime;
  const rawSport = normalizeXmlSport(input.type);
  const records = input.records.map((record, messageIndex) => ({
    ...record,
    messageIndex,
    sessionMessageIndex: 0,
  }));
  const stats = calculateRouteStats(
    records.filter(hasPosition).map((record) => ({
      latitude: record.positionLat,
      longitude: record.positionLong,
      ...(record.altitude === undefined ? {} : { altitude: record.altitude }),
    })),
  );
  const avgCadence = average(records.map((record) => record.cadence));
  const avgHeartRate = average(records.map((record) => record.heartRate));
  const avgPower = average(records.map((record) => record.power));
  const maxCadence = maximum(records.map((record) => record.cadence));
  const maxHeartRate = maximum(records.map((record) => record.heartRate));
  const maxPower = maximum(records.map((record) => record.power));

  return {
    metadata: {
      ...(input.name === undefined ? {} : { name: input.name }),
      startTime,
      type: input.type,
    },
    summary: {
      ...(avgCadence === undefined ? {} : { avgCadence }),
      ...(avgHeartRate === undefined ? {} : { avgHeartRate }),
      ...(avgPower === undefined ? {} : { avgPower }),
      ...(input.calories === undefined ? {} : { calories: input.calories }),
      ...(maxCadence === undefined ? {} : { maxCadence }),
      ...(maxHeartRate === undefined ? {} : { maxHeartRate }),
      ...(maxPower === undefined ? {} : { maxPower }),
      totalAscent: stats.totalAscent,
      totalDescent: stats.totalDescent,
      totalDistance,
      totalTime,
    },
    segments: [
      {
        sessionMessageIndex: 0,
        role: "activity",
        rawSport,
        startTime,
        endTime,
      },
    ],
    records,
  };
}

function hasPosition<T extends { positionLat?: number; positionLong?: number }>(
  record: T,
): record is T & { positionLat: number; positionLong: number } {
  return record.positionLat !== undefined && record.positionLong !== undefined;
}

function normalizeXmlSport(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === "run" || normalized === "running") return "running";
  if (normalized === "bike" || normalized === "biking" || normalized === "cycling") {
    return "cycling";
  }
  if (normalized === "swim" || normalized === "swimming") return "swimming";
  if (normalized === "strength" || normalized === "strength_training") return "training";
  return normalized || "generic";
}

function resolveTotalDistance(records: ActivityRecord[]): number {
  const lastDistance = [...records]
    .reverse()
    .find((record) => record.distance !== undefined && Number.isFinite(record.distance))?.distance;
  if (lastDistance !== undefined) return lastDistance;

  const coords = records.filter(hasPosition).map((record) => ({
    latitude: record.positionLat,
    longitude: record.positionLong,
    ...(record.altitude === undefined ? {} : { altitude: record.altitude }),
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
  const localName = tagName.slice(tagName.lastIndexOf(":") + 1).toLowerCase();
  return firstDescendantElementByLocalName(element, localName)?.textContent?.trim() || undefined;
}

function xmlElementLocalName(element: Element): string {
  const qualifiedName = element.localName || element.nodeName;
  return qualifiedName.slice(qualifiedName.lastIndexOf(":") + 1).toLowerCase();
}

function descendantElementsByLocalName(
  element: Document | Element,
  localName: string,
  maxMatches = Number.POSITIVE_INFINITY,
): Element[] {
  const matches: Element[] = [];
  const descendants = element.getElementsByTagName("*");
  for (let index = 0; index < descendants.length; index += 1) {
    const descendant = descendants[index];
    if (!descendant || xmlElementLocalName(descendant) !== localName) continue;
    matches.push(descendant);
    if (matches.length >= maxMatches) break;
  }
  return matches;
}

function firstDescendantElementByLocalName(
  element: Document | Element,
  localName: string,
): Element | undefined {
  return descendantElementsByLocalName(element, localName, 1)[0];
}
