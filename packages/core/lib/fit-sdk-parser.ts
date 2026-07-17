/// <reference path="../types/garmin-fitsdk.d.ts" />
import { Decoder, Profile, Stream, Utils } from "@garmin/fitsdk";
import { Buffer } from "buffer";

import {
  activityArtifactSemanticsSchema,
  decodedActivityArtifactSchema,
  type ActivityArtifactSemantics,
  type DecodedActivityArtifact,
  type DecodedArtifactExtensions,
} from "../activity-artifacts";
import type {
  ActivityLap,
  ActivityRecord,
  ActivitySegment,
  ActivitySession,
  StandardActivity,
} from "../types/normalization";

const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;
const FIT_PARSER_VERSION = "garmin-fitsdk-21.188.0";
const INLINE_RECORD_LIMIT = 10_000;

type FitMessage = Record<string, unknown>;
type RawSourceValue = string | number;

export interface FitDecodeResult {
  messages: Record<string, FitMessage[]> | null;
  errors: { type: string; message: string }[];
}

const toCamelCase = (value: string): string =>
  value.replace(/([-_][a-z])/gi, (match) => match.toUpperCase().replaceAll("-", "").replaceAll("_", ""));

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [toCamelCase(key), normalizeKeys(child)]),
    );
  }
  return value;
}

/** Decodes with raw enum values intact so unknown and future FIT values are not erased. */
export function safeDecodeFitFile(buffer: Buffer): FitDecodeResult {
  const result: FitDecodeResult = { messages: null, errors: [] };
  try {
    const stream = Stream.fromBuffer(buffer);
    if (!Decoder.isFIT(stream)) {
      result.errors.push({ type: "format", message: "File is not in FIT format." });
      return result;
    }
    const decoder = new Decoder(stream);
    if (!decoder.checkIntegrity()) {
      result.errors.push({
        type: "integrity",
        message: "File integrity check failed. The file may be corrupt.",
      });
      return result;
    }
    const sourceOrders = new Map<string, number[]>();
    let sourceOrder = 0;
    const decoded = decoder.read({
      applyScaleAndOffset: true,
      convertDateTimesToDates: true,
      convertTypesToStrings: false,
      includeUnknownData: true,
      mergeHeartRates: true,
      mesgListener: (mesgNum: number) => {
        const messagesKey = Profile.messages?.[String(mesgNum)]?.messagesKey;
        if (messagesKey) {
          const orders = sourceOrders.get(messagesKey) ?? [];
          orders.push(sourceOrder);
          sourceOrders.set(messagesKey, orders);
        }
        sourceOrder++;
      },
    });
    for (const error of decoded.errors) {
      result.errors.push({
        type: "decode",
        message: `Error at offset ${String(error.offset)}: ${String(error.message)}`,
      });
    }
    const normalized = normalizeKeys(decoded.messages) as Record<string, FitMessage[]>;
    for (const [messagesKey, orders] of sourceOrders) {
      normalized[messagesKey]?.forEach((message, index) => {
        message.__sourceOrder = orders[index];
      });
    }
    result.messages = normalized;
  } catch (error) {
    result.errors.push({
      type: "system",
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return result;
}

function messagesOf(messages: Record<string, FitMessage[]>, key: string): FitMessage[] {
  return Array.isArray(messages[key]) ? messages[key] : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sourceOrder(message: FitMessage): number {
  return finiteNumber(message.__sourceOrder) ?? Number.MAX_SAFE_INTEGER;
}

function rawValue(value: unknown): RawSourceValue | undefined {
  return (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isInteger(value))
    ? value
    : undefined;
}

function profileLabel(type: string, value: RawSourceValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  const labels = Profile.types[type];
  if (!labels) return typeof value === "string" ? value : undefined;
  if (typeof value === "string") {
    return Object.values(labels).includes(value) ? value : undefined;
  }
  return labels[String(value)];
}

function dateMs(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  let timestamp: number;
  if (value instanceof Date) timestamp = value.getTime();
  else if (typeof value === "number" && Number.isFinite(value)) {
    timestamp = Utils.convertDateTimeToDate(value).getTime();
  } else if (typeof value === "string") timestamp = new Date(value).getTime();
  else throw new Error(`Invalid FIT ${field}.`);
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error(`Invalid FIT ${field}.`);
  return Math.round(timestamp);
}

function messageIndex(message: FitMessage, fallback: number, label: string): number {
  const index = finiteNumber(message.messageIndex) ?? fallback;
  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid FIT ${label} message index.`);
  return index;
}

function metricExtensions(
  message: FitMessage,
  fields: readonly string[],
): DecodedArtifactExtensions | undefined {
  const extensions: DecodedArtifactExtensions = {};
  for (const field of fields) {
    const value = message[field];
    if (typeof value === "number" && Number.isFinite(value)) extensions[`fit.${field}`] = value;
    else if (typeof value === "string" && value.length > 0) extensions[`fit.${field}`] = value;
  }
  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

function sessionBounds(message: FitMessage, index: number): { startTimeMs: number; endTimeMs: number } {
  const startTimeMs = dateMs(message.startTime, `session ${index} start_time`);
  let endTimeMs = dateMs(message.timestamp, `session ${index} timestamp`);
  const elapsedSeconds = finiteNumber(message.totalElapsedTime);
  const resolvedStart =
    startTimeMs ??
    (endTimeMs !== undefined && elapsedSeconds !== undefined
      ? endTimeMs - Math.round(elapsedSeconds * 1000)
      : undefined);
  if (endTimeMs === undefined && resolvedStart !== undefined && elapsedSeconds !== undefined) {
    endTimeMs = resolvedStart + Math.round(elapsedSeconds * 1000);
  }
  if (resolvedStart === undefined || endTimeMs === undefined || resolvedStart >= endTimeMs) {
    throw new Error(`FIT session ${index} has no deterministic positive time range.`);
  }
  return { startTimeMs: resolvedStart, endTimeMs };
}

type SessionEvidence = {
  source: FitMessage;
  messageIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  rawSport?: RawSourceValue;
  rawSubSport?: RawSourceValue;
};

function ownsTimestamp(session: SessionEvidence, timestampMs: number, isLast: boolean): boolean {
  return timestampMs >= session.startTimeMs && (timestampMs < session.endTimeMs || (isLast && timestampMs <= session.endTimeMs));
}

function timestampOwner(
  sessions: readonly SessionEvidence[],
  timestampMs: number | undefined,
): SessionEvidence | undefined {
  if (timestampMs === undefined) return sessions.length === 1 ? sessions[0] : undefined;
  return sessions.find((session, index) => ownsTimestamp(session, timestampMs, index === sessions.length - 1));
}

function eventOwner(
  sessions: readonly SessionEvidence[],
  timestampMs: number | undefined,
  rawEventType: RawSourceValue | undefined,
): SessionEvidence | undefined {
  if (timestampMs === undefined) return sessions.length === 1 ? sessions[0] : undefined;
  if (rawEventType === 0 || rawEventType === "start") {
    return [...sessions].reverse().find((session) => timestampMs >= session.startTimeMs && timestampMs < session.endTimeMs);
  }
  return sessions.find((session) => timestampMs > session.startTimeMs && timestampMs <= session.endTimeMs);
}

function lapOwner(
  sessions: readonly SessionEvidence[],
  lap: FitMessage,
  lapIndex: number,
): SessionEvidence | undefined {
  const indexed = sessions.find((session) => {
    const firstLapIndex = finiteNumber(session.source.firstLapIndex);
    const numLaps = finiteNumber(session.source.numLaps);
    return (
      firstLapIndex !== undefined &&
      numLaps !== undefined &&
      lapIndex >= firstLapIndex &&
      lapIndex < firstLapIndex + numLaps
    );
  });
  if (indexed) return indexed;
  return timestampOwner(sessions, dateMs(lap.startTime ?? lap.timestamp, `lap ${lapIndex} time`));
}

const SESSION_EXTENSION_FIELDS = [
  "totalElapsedTime",
  "totalTimerTime",
  "totalMovingTime",
  "totalDistance",
  "totalAscent",
  "totalDescent",
  "totalCalories",
  "avgSpeed",
  "maxSpeed",
  "avgHeartRate",
  "maxHeartRate",
  "avgCadence",
  "maxCadence",
  "avgPower",
  "maxPower",
  "firstLapIndex",
  "numLaps",
  "numLengths",
  "numActiveLengths",
  "poolLength",
  "poolLengthUnit",
  "totalStrokes",
  "avgStrokeDistance",
  "trigger",
] as const;

const LAP_EXTENSION_FIELDS = [
  "totalElapsedTime",
  "totalTimerTime",
  "totalMovingTime",
  "totalDistance",
  "avgSpeed",
  "avgHeartRate",
  "avgCadence",
  "avgPower",
  "firstLengthIndex",
  "numLengths",
  "numActiveLengths",
  "swimStroke",
] as const;

const RECORD_EXTENSION_FIELDS = [
  "positionLat",
  "positionLong",
  "distance",
  "enhancedAltitude",
  "altitude",
  "enhancedSpeed",
  "speed",
  "heartRate",
  "cadence",
  "power",
  "temperature",
] as const;

/** Builds the committed thin decoded-artifact contract from all FIT session/lap/event/record messages. */
export function decodeFitActivityArtifact(buffer: Buffer | Uint8Array): DecodedActivityArtifact {
  const decoded = safeDecodeFitFile(Buffer.from(buffer));
  if (!decoded.messages) {
    throw new Error(`Failed to decode FIT file: ${decoded.errors.map((error) => error.message).join("; ")}`);
  }
  if (decoded.errors.length > 0) {
    throw new Error(`FIT decoding failed: ${decoded.errors.map((error) => error.message).join("; ")}`);
  }

  const rawSessions = messagesOf(decoded.messages, "sessionMesgs");
  if (rawSessions.length === 0) throw new Error("No session message found in FIT file.");
  const sessions: SessionEvidence[] = rawSessions.map((source, index) => ({
    source,
    messageIndex: messageIndex(source, index, "session"),
    ...sessionBounds(source, index),
    rawSport: rawValue(source.sport),
    rawSubSport: rawValue(source.subSport),
  }));
  sessions.forEach((session, index) => {
    const previous = sessions[index - 1];
    if (previous && session.startTimeMs < previous.endTimeMs) {
      throw new Error("FIT session time ranges must be ordered and non-overlapping.");
    }
  });

  const lapMessages = messagesOf(decoded.messages, "lapMesgs");
  const lapOwners = new Map<number, SessionEvidence>();
  const laps = lapMessages.map((lap, index) => {
    const indexValue = messageIndex(lap, index, "lap");
    const owner = lapOwner(sessions, lap, indexValue);
    if (!owner) throw new Error(`Cannot determine FIT session ownership for lap ${indexValue}.`);
    lapOwners.set(indexValue, owner);
    const startTimeMs = dateMs(lap.startTime, `lap ${indexValue} start_time`);
    let endTimeMs = dateMs(lap.timestamp, `lap ${indexValue} timestamp`);
    if (endTimeMs === undefined && startTimeMs !== undefined) {
      const elapsed = finiteNumber(lap.totalElapsedTime);
      if (elapsed !== undefined) endTimeMs = startTimeMs + Math.round(elapsed * 1000);
    }
    return {
      messageIndex: indexValue,
      sessionMessageIndex: owner.messageIndex,
      ...(startTimeMs === undefined ? {} : { startTimeMs }),
      ...(endTimeMs === undefined ? {} : { endTimeMs }),
      ...(metricExtensions(lap, LAP_EXTENSION_FIELDS) === undefined
        ? {}
        : { extensions: metricExtensions(lap, LAP_EXTENSION_FIELDS) }),
    };
  });

  const eventMessages = messagesOf(decoded.messages, "eventMesgs");
  const events = eventMessages.map((event, index) => {
    const timestampMs = dateMs(event.timestamp, `event ${index} timestamp`);
    const rawEvent = rawValue(event.event);
    if (rawEvent === undefined) throw new Error(`FIT event ${index} has no event value.`);
    const rawEventType = rawValue(event.eventType);
    const owner = eventOwner(sessions, timestampMs, rawEventType);
    const ownedLap = laps.find(
      (lap) =>
        owner &&
        lap.sessionMessageIndex === owner.messageIndex &&
        timestampMs !== undefined &&
        lap.startTimeMs !== undefined &&
        lap.endTimeMs !== undefined &&
        timestampMs >= lap.startTimeMs &&
        timestampMs <= lap.endTimeMs,
    );
    return {
      messageIndex: index,
      ...(owner === undefined ? {} : { sessionMessageIndex: owner.messageIndex }),
      ...(ownedLap === undefined ? {} : { lapMessageIndex: ownedLap.messageIndex }),
      ...(timestampMs === undefined ? {} : { timestampMs }),
      rawEvent,
      ...(rawEventType === undefined ? {} : { rawEventType }),
      ...(metricExtensions(event, ["eventGroup", "data", "timerTrigger"]) === undefined
        ? {}
        : { extensions: metricExtensions(event, ["eventGroup", "data", "timerTrigger"]) }),
    };
  });

  const recordMessages = messagesOf(decoded.messages, "recordMesgs");
  const lengthAssociations = messagesOf(decoded.messages, "lengthMesgs").flatMap(
    (length, index) => {
      const startTimeMs = dateMs(length.startTime, `length ${index} start_time`);
      const timestampMs = dateMs(length.timestamp, `length ${index} timestamp`);
      const owner = timestampOwner(sessions, startTimeMs);
      return owner && timestampMs !== undefined
        ? [{ owner, timestampMs, sourceOrder: sourceOrder(length) }]
        : [];
    },
  );
  const records = recordMessages.map((record, index) => {
    const timestampMs = dateMs(record.timestamp, `record ${index} timestamp`);
    const associatedLength = lengthAssociations
      .filter(
        (length) =>
          length.timestampMs === timestampMs && length.sourceOrder + 1 === sourceOrder(record),
      )
      .sort((left, right) => right.sourceOrder - left.sourceOrder)[0];
    const owner = associatedLength?.owner ?? timestampOwner(sessions, timestampMs);
    if (!owner) throw new Error(`Cannot determine FIT session ownership for record ${index}.`);
    const ownedLap = laps.find(
      (lap) =>
        lap.sessionMessageIndex === owner.messageIndex &&
        timestampMs !== undefined &&
        lap.startTimeMs !== undefined &&
        lap.endTimeMs !== undefined &&
        timestampMs >= lap.startTimeMs &&
        timestampMs <= lap.endTimeMs,
    );
    const extensions = metricExtensions(record, RECORD_EXTENSION_FIELDS);
    return {
      messageIndex: index,
      sessionMessageIndex: owner.messageIndex,
      ...(ownedLap === undefined ? {} : { lapMessageIndex: ownedLap.messageIndex }),
      ...(timestampMs === undefined ? {} : { timestampMs }),
      ...(extensions === undefined ? {} : { extensions }),
    };
  });

  const activityMessage = messagesOf(decoded.messages, "activityMesgs")[0];
  const first = sessions[0];
  const last = sessions.at(-1);
  if (!first || !last) throw new Error("FIT session evidence disappeared during decoding.");
  const activityEndMs = dateMs(activityMessage?.timestamp, "activity timestamp") ?? last.endTimeMs;
  const fileId = messagesOf(decoded.messages, "fileIdMesgs")[0];
  const recordCollections = [];
  for (let offset = 0; offset < records.length; offset += INLINE_RECORD_LIMIT) {
    recordCollections.push({ storage: "inline" as const, version: 1 as const, records: records.slice(offset, offset + INLINE_RECORD_LIMIT) });
  }

  return decodedActivityArtifactSchema.parse({
    version: 1,
    parser: { name: "@garmin/fitsdk", version: FIT_PARSER_VERSION },
    source: { standard: "fit", format: "fit" },
    activity: {
      rawType: rawValue(activityMessage?.type),
      ...(sessions.length === 1 ? { rawSport: first.rawSport, rawSubSport: first.rawSubSport } : { rawSport: 18 }),
      startTimeMs: first.startTimeMs,
      endTimeMs: activityEndMs,
      extensions: metricExtensions(activityMessage ?? {}, ["totalTimerTime", "numSessions"]),
    },
    sessions: sessions.map((session) => ({
      messageIndex: session.messageIndex,
      rawSport: session.rawSport,
      rawSubSport: session.rawSubSport,
      startTimeMs: session.startTimeMs,
      endTimeMs: session.endTimeMs,
      extensions: metricExtensions(session.source, SESSION_EXTENSION_FIELDS),
    })),
    laps,
    events,
    recordCollections,
    extensions: metricExtensions(fileId ?? {}, ["manufacturer", "product", "serialNumber", "timeCreated"]),
  });
}

function extensionNumber(extensions: DecodedArtifactExtensions | undefined, field: string): number | undefined {
  return finiteNumber(extensions?.[`fit.${field}`]);
}

function segmentIdentity(rawSport: RawSourceValue | undefined):
  | { role: "activity"; category: "run" | "bike" | "swim" | "strength" | "other" }
  | { role: "transition" }
  | { role: "unknown" } {
  if (rawSport === 3 || rawSport === "transition") return { role: "transition" };
  if (rawSport === 1 || rawSport === "running") return { role: "activity", category: "run" };
  if (rawSport === 2 || rawSport === "cycling") return { role: "activity", category: "bike" };
  if (rawSport === 5 || rawSport === "swimming") return { role: "activity", category: "swim" };
  if (rawSport === 10 || rawSport === "training") return { role: "activity", category: "strength" };
  if (profileLabel("sport", rawSport) !== undefined) return { role: "activity", category: "other" };
  return { role: "unknown" };
}

function timerEvidence(
  artifact: DecodedActivityArtifact,
  sessionMessageIndex: number,
  startOffsetMs: number,
  endOffsetMs: number,
): Pick<ActivityArtifactSemantics["segments"][number], "pauseRanges" | "timerEvents"> {
  const source = artifact.events
    .filter(
      (event) =>
        event.sessionMessageIndex === sessionMessageIndex &&
        (event.rawEvent === 0 || event.rawEvent === "timer") &&
        event.timestampMs !== undefined,
    )
    .sort((left, right) => (left.timestampMs ?? 0) - (right.timestampMs ?? 0));
  const timerEvents: { type: "start" | "stop" | "pause" | "resume"; offsetMs: number }[] = [];
  let state: "stopped" | "running" | "paused" = "stopped";
  for (const [index, event] of source.entries()) {
    const offsetMs = (event.timestampMs ?? 0) - (artifact.activity.startTimeMs ?? 0);
    const starts = event.rawEventType === 0 || event.rawEventType === "start";
    const stops = [1, 4, 8, 9, "stop", "stopAll", "stopDisable", "stopDisableAll"].includes(
      event.rawEventType as never,
    );
    if (starts && state === "stopped") {
      timerEvents.push({ type: "start", offsetMs });
      state = "running";
    } else if (starts && state === "paused") {
      timerEvents.push({ type: "resume", offsetMs });
      state = "running";
    } else if (stops && state === "running") {
      const hasLaterStart = source.slice(index + 1).some((later) => later.rawEventType === 0 || later.rawEventType === "start");
      timerEvents.push({ type: hasLaterStart ? "pause" : "stop", offsetMs });
      state = hasLaterStart ? "paused" : "stopped";
    }
  }
  if (
    timerEvents[0]?.type !== "start" ||
    timerEvents.at(-1)?.type !== "stop" ||
    timerEvents.some((event) => event.offsetMs < startOffsetMs || event.offsetMs > endOffsetMs)
  ) {
    return {};
  }
  const pauseRanges: { startOffsetMs: number; endOffsetMs: number }[] = [];
  for (const [index, event] of timerEvents.entries()) {
    const nextEvent = timerEvents[index + 1];
    if (event.type === "pause" && nextEvent?.type === "resume") {
      pauseRanges.push({ startOffsetMs: event.offsetMs, endOffsetMs: nextEvent.offsetMs });
    }
  }
  return {
    timerEvents,
    ...(pauseRanges.length === 0 ? {} : { pauseRanges }),
  };
}

/** Projects decoded FIT evidence into the committed semantic comparator contract. */
export function projectFitArtifactSemantics(artifactInput: unknown): ActivityArtifactSemantics {
  const artifact = decodedActivityArtifactSchema.parse(artifactInput);
  const origin = artifact.activity.startTimeMs;
  if (origin === undefined || artifact.activity.endTimeMs === undefined) {
    throw new Error("FIT activity semantics require deterministic activity bounds.");
  }
  const segments = artifact.sessions.map((session) => {
    if (session.startTimeMs === undefined || session.endTimeMs === undefined) {
      throw new Error(`FIT session ${session.messageIndex} has no semantic time range.`);
    }
    const startOffsetMs = session.startTimeMs - origin;
    const endOffsetMs = session.endTimeMs - origin;
    const identity = segmentIdentity(session.rawSport);
    const activeSeconds = extensionNumber(session.extensions, "totalTimerTime");
    const movingSeconds = extensionNumber(session.extensions, "totalMovingTime");
    const distanceMeters = extensionNumber(session.extensions, "totalDistance");
    return {
      ...identity,
      rawSport: session.rawSport,
      rawSubSport: session.rawSubSport,
      startOffsetMs,
      endOffsetMs,
      ...(activeSeconds === undefined ? {} : { activeMs: Math.round(activeSeconds * 1000) }),
      ...(movingSeconds === undefined ? {} : { movingMs: Math.round(movingSeconds * 1000) }),
      ...(distanceMeters === undefined ? {} : { distanceMeters }),
      ...timerEvidence(artifact, session.messageIndex, startOffsetMs, endOffsetMs),
    };
  });
  const allActive = segments.every((segment) => segment.activeMs !== undefined);
  const allMoving = segments.every((segment) => segment.movingMs !== undefined);
  const distances = segments.map((segment) => segment.distanceMeters);
  return activityArtifactSemanticsSchema.parse({
    segments,
    totals: {
      elapsedMs: artifact.activity.endTimeMs - origin,
      ...(allActive ? { activeMs: segments.reduce((sum, segment) => sum + (segment.activeMs ?? 0), 0) } : {}),
      ...(allMoving ? { movingMs: segments.reduce((sum, segment) => sum + (segment.movingMs ?? 0), 0) } : {}),
      ...(distances.some((distance) => distance !== undefined)
        ? { distanceMeters: distances.reduce<number>((sum, distance) => sum + (distance ?? 0), 0) }
        : {}),
    },
  });
}

function normalizedRecord(record: {
  messageIndex: number;
  sessionMessageIndex: number;
  lapMessageIndex?: number;
  timestampMs?: number;
  extensions?: DecodedArtifactExtensions;
}): ActivityRecord {
  if (record.timestampMs === undefined) throw new Error(`FIT record ${record.messageIndex} has no timestamp.`);
  const positionLat = extensionNumber(record.extensions, "positionLat");
  const positionLong = extensionNumber(record.extensions, "positionLong");
  return {
    messageIndex: record.messageIndex,
    sessionMessageIndex: record.sessionMessageIndex,
    lapMessageIndex: record.lapMessageIndex,
    timestamp: new Date(record.timestampMs),
    positionLat: positionLat === undefined ? undefined : Math.abs(positionLat) > 180 ? positionLat * SEMICIRCLE_TO_DEGREES : positionLat,
    positionLong: positionLong === undefined ? undefined : Math.abs(positionLong) > 180 ? positionLong * SEMICIRCLE_TO_DEGREES : positionLong,
    distance: extensionNumber(record.extensions, "distance"),
    altitude: extensionNumber(record.extensions, "enhancedAltitude") ?? extensionNumber(record.extensions, "altitude"),
    speed: extensionNumber(record.extensions, "enhancedSpeed") ?? extensionNumber(record.extensions, "speed"),
    heartRate: extensionNumber(record.extensions, "heartRate"),
    cadence: extensionNumber(record.extensions, "cadence"),
    power: extensionNumber(record.extensions, "power"),
    temperature: extensionNumber(record.extensions, "temperature"),
  };
}

function sportLabel(rawSport: RawSourceValue | undefined): string {
  return profileLabel("sport", rawSport) ?? "unknown";
}

/** Decodes FIT while retaining legacy aggregate fields and adding ordered sessions/artifact semantics. */
export function parseFitFileWithSDK(buffer: Buffer | Uint8Array): StandardActivity {
  const artifact = decodeFitActivityArtifact(buffer);
  const semantics = projectFitArtifactSemantics(artifact);
  const decodedMessages = safeDecodeFitFile(Buffer.from(buffer)).messages;
  const allRecords = artifact.recordCollections.flatMap((collection) =>
    collection.storage === "inline" ? collection.records.map(normalizedRecord) : [],
  );
  const allLaps: ActivityLap[] = artifact.laps.map((lap) => ({
    messageIndex: lap.messageIndex,
    sessionMessageIndex: lap.sessionMessageIndex,
    startTime: new Date(lap.startTimeMs ?? 0),
    totalTime: extensionNumber(lap.extensions, "totalTimerTime") ?? 0,
    totalDistance: extensionNumber(lap.extensions, "totalDistance") ?? 0,
    avgSpeed: extensionNumber(lap.extensions, "avgSpeed"),
    avgHeartRate: extensionNumber(lap.extensions, "avgHeartRate"),
    avgCadence: extensionNumber(lap.extensions, "avgCadence"),
    avgPower: extensionNumber(lap.extensions, "avgPower"),
  }));
  const lengths = (decodedMessages ? messagesOf(decodedMessages, "lengthMesgs") : []).map(
    (length, index) => {
      const startTimeMs = dateMs(length.startTime, `length ${index} start_time`);
      dateMs(length.timestamp, `length ${index} timestamp`);
      const owner = artifact.sessions.find(
        (session, sessionIndex) =>
          startTimeMs !== undefined &&
          session.startTimeMs !== undefined &&
          session.endTimeMs !== undefined &&
          startTimeMs >= session.startTimeMs &&
          (startTimeMs < session.endTimeMs ||
            (sessionIndex === artifact.sessions.length - 1 && startTimeMs <= session.endTimeMs)),
      );
      const lap = artifact.laps.find(
        (item) =>
          owner &&
          item.sessionMessageIndex === owner.messageIndex &&
          startTimeMs !== undefined &&
          item.startTimeMs !== undefined &&
          item.endTimeMs !== undefined &&
          startTimeMs >= item.startTimeMs &&
          startTimeMs <= item.endTimeMs,
      );
      return {
        messageIndex: messageIndex(length, index, "length"),
        sessionMessageIndex: owner?.messageIndex,
        lapMessageIndex: lap?.messageIndex,
        startTime: startTimeMs === undefined ? undefined : new Date(startTimeMs),
        totalElapsedTime: finiteNumber(length.totalElapsedTime),
        totalTimerTime: finiteNumber(length.totalTimerTime),
        totalStrokes: finiteNumber(length.totalStrokes),
        avgSpeed: finiteNumber(length.avgSpeed),
        swimStroke:
          profileLabel("swimStroke", rawValue(length.swimStroke)) ??
          rawValue(length.swimStroke)?.toString(),
        avgSwimmingCadence: finiteNumber(length.avgSwimmingCadence),
        event: profileLabel("event", rawValue(length.event)) ?? rawValue(length.event)?.toString(),
        eventType:
          profileLabel("eventType", rawValue(length.eventType)) ??
          rawValue(length.eventType)?.toString(),
      };
    },
  );
  const sessions: ActivitySession[] = artifact.sessions.map((session) => {
    if (session.startTimeMs === undefined || session.endTimeMs === undefined) throw new Error("Decoded FIT session bounds are missing.");
    return {
      messageIndex: session.messageIndex,
      rawSport: session.rawSport,
      rawSubSport: session.rawSubSport,
      startTime: new Date(session.startTimeMs),
      endTime: new Date(session.endTimeMs),
      totalElapsedTime: extensionNumber(session.extensions, "totalElapsedTime") ?? (session.endTimeMs - session.startTimeMs) / 1000,
      totalTimerTime: extensionNumber(session.extensions, "totalTimerTime"),
      totalMovingTime: extensionNumber(session.extensions, "totalMovingTime"),
      totalDistance: extensionNumber(session.extensions, "totalDistance"),
      laps: allLaps.filter((lap) => lap.sessionMessageIndex === session.messageIndex),
      records: allRecords.filter((record) => record.sessionMessageIndex === session.messageIndex),
    };
  });
  const segments: ActivitySegment[] = semantics.segments.map((segment, index) => {
    const artifactSession = artifact.sessions[index];
    if (!artifactSession) {
      throw new Error(`Decoded FIT segment ${index} has no matching session.`);
    }
    return {
      sessionMessageIndex: artifactSession.messageIndex,
      role: segment.role,
      ...(segment.role === "activity" ? { category: segment.category } : {}),
      rawSport: segment.rawSport,
      rawSubSport: segment.rawSubSport,
      startTime: new Date((artifact.activity.startTimeMs ?? 0) + segment.startOffsetMs),
      endTime: new Date((artifact.activity.startTimeMs ?? 0) + segment.endOffsetMs),
    };
  });
  const firstSession = sessions[0];
  const firstArtifactSession = artifact.sessions[0];
  if (!firstSession || !firstArtifactSession) {
    throw new Error("Decoded FIT activity has no sessions.");
  }
  const activityExtensions = artifact.activity.extensions;
  const fileExtensions = artifact.extensions;
  const totalDistance = semantics.totals.distanceMeters ?? 0;
  return {
    metadata: {
      startTime: firstSession.startTime,
      type: sessions.length === 1 ? sportLabel(firstSession.rawSport) : "multisport",
      subType:
        profileLabel("subSport", firstArtifactSession.rawSubSport) ??
        (firstArtifactSession.rawSubSport === undefined
          ? undefined
          : String(firstArtifactSession.rawSubSport)),
      manufacturer:
        profileLabel("manufacturer", rawValue(fileExtensions?.["fit.manufacturer"])) ??
        (fileExtensions?.["fit.manufacturer"] === undefined
          ? undefined
          : String(fileExtensions["fit.manufacturer"])),
      product: fileExtensions?.["fit.product"] === undefined ? undefined : String(fileExtensions["fit.product"]),
    },
    summary: {
      totalTime: extensionNumber(activityExtensions, "totalTimerTime") ?? (semantics.totals.activeMs ?? semantics.totals.elapsedMs) / 1000,
      totalDistance,
      ...(sessions.length === 1
        ? {
            avgSpeed: extensionNumber(firstArtifactSession.extensions, "avgSpeed"),
            maxSpeed: extensionNumber(firstArtifactSession.extensions, "maxSpeed"),
            avgHeartRate: extensionNumber(firstArtifactSession.extensions, "avgHeartRate"),
            maxHeartRate: extensionNumber(firstArtifactSession.extensions, "maxHeartRate"),
            avgCadence: extensionNumber(firstArtifactSession.extensions, "avgCadence"),
            maxCadence: extensionNumber(firstArtifactSession.extensions, "maxCadence"),
            avgPower: extensionNumber(firstArtifactSession.extensions, "avgPower"),
            maxPower: extensionNumber(firstArtifactSession.extensions, "maxPower"),
          }
        : {}),
      totalAscent: sessions.reduce((sum, session) => sum + (extensionNumber(artifact.sessions.find((item) => item.messageIndex === session.messageIndex)?.extensions, "totalAscent") ?? 0), 0),
      totalDescent: sessions.reduce((sum, session) => sum + (extensionNumber(artifact.sessions.find((item) => item.messageIndex === session.messageIndex)?.extensions, "totalDescent") ?? 0), 0),
      calories: sessions.reduce((sum, session) => sum + (extensionNumber(artifact.sessions.find((item) => item.messageIndex === session.messageIndex)?.extensions, "totalCalories") ?? 0), 0),
      poolLength: extensionNumber(firstArtifactSession.extensions, "poolLength"),
      poolLengthUnit:
        profileLabel(
          "displayMeasure",
          rawValue(firstArtifactSession.extensions?.["fit.poolLengthUnit"]),
        ) ??
        (firstArtifactSession.extensions?.["fit.poolLengthUnit"] === undefined
          ? undefined
          : String(firstArtifactSession.extensions["fit.poolLengthUnit"])),
      totalStrokes: extensionNumber(firstArtifactSession.extensions, "totalStrokes"),
      avgStrokeDistance: extensionNumber(firstArtifactSession.extensions, "avgStrokeDistance"),
    },
    laps: allLaps,
    lengths,
    records: allRecords,
    sessions,
    segments,
    decodedArtifact: artifact,
    semantics,
  };
}

export function extractHeartRateZones(records: FitMessage[]): {
  zone1: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
  zone6: number;
} {
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0, zone6: 0 };
  const heartRates = records.map((record) => finiteNumber(record.heartRate)).filter((value): value is number => value !== undefined && value > 0);
  if (heartRates.length === 0) return zones;
  const maxHeartRate = Math.max(...heartRates);
  for (const heartRate of heartRates) {
    const percent = heartRate / maxHeartRate;
    if (percent < 0.5) zones.zone1++;
    else if (percent < 0.6) zones.zone2++;
    else if (percent < 0.7) zones.zone3++;
    else if (percent < 0.8) zones.zone4++;
    else if (percent < 0.9) zones.zone5++;
    else zones.zone6++;
  }
  return zones;
}

export function extractPowerZones(records: FitMessage[]): {
  zone1: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
  zone6: number;
} {
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0, zone6: 0 };
  const powers = records.map((record) => finiteNumber(record.power)).filter((value): value is number => value !== undefined && value > 0);
  if (powers.length === 0) return zones;
  const estimatedFtp = calculate20MinMaxPower(powers) * 0.95;
  for (const power of powers) {
    const percent = power / estimatedFtp;
    if (percent < 0.55) zones.zone1++;
    else if (percent < 0.75) zones.zone2++;
    else if (percent < 0.9) zones.zone3++;
    else if (percent < 1.05) zones.zone4++;
    else if (percent < 1.2) zones.zone5++;
    else zones.zone6++;
  }
  return zones;
}

function calculate20MinMaxPower(powers: number[]): number {
  const windowSize = 20 * 60;
  if (powers.length < windowSize) return Math.max(...powers);
  let maxAverage = 0;
  let sum = powers.slice(0, windowSize).reduce((total, power) => total + power, 0);
  maxAverage = sum / windowSize;
  for (let index = windowSize; index < powers.length; index++) {
    const enteringPower = powers[index];
    const leavingPower = powers[index - windowSize];
    if (enteringPower === undefined || leavingPower === undefined) {
      throw new Error("Power window indices are out of bounds.");
    }
    sum += enteringPower - leavingPower;
    maxAverage = Math.max(maxAverage, sum / windowSize);
  }
  return maxAverage;
}

export function validateFitFileWithSDK(data: ArrayBuffer): boolean {
  try {
    const stream = Stream.fromArrayBuffer(data);
    return Decoder.isFIT(stream) && new Decoder(stream).checkIntegrity();
  } catch {
    return false;
  }
}
