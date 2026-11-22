import { createHash } from "node:crypto";
import type {
  ActivityArtifactSemantics,
  ActivityLength,
  ActivitySegment,
  ActivitySession,
  DecodedActivityArtifact,
  SwimTimingResult,
} from "@repo/core";
import { calculateSwimTiming } from "@repo/core";
import { decodedActivityArtifactSchema } from "@repo/core/activity-artifacts";
import {
  type CompletedActivitySegmentSet,
  completedActivitySegmentSetSchema,
} from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower, estimateVO2Max } from "@repo/core/calculations";
import {
  calculateIntervalWeightedMetric,
  deriveClippedIntervalMetricEvidence,
} from "@repo/core/recording-metrics";
import { profileMetrics } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lte } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { fetchActivityTemperature } from "../../utils/weather";
import type { GeneratedActivityLthrEvidence } from "../activities/reconcile-activity-evidence";
import { calculateActivityFileHeartRateEvidence } from "./heart-rate-evidence";
import {
  buildActivityFileDerivedSegmentSummary,
  calculateActivityFileStreamDerivedCalculations,
} from "./stream-derived-calculations";
import {
  type ActivityFileStreamMetadata,
  type ActivityFileStreamRecord,
  buildActivityGeometry,
  collectActivityFileStreamMetadata,
} from "./stream-metadata";

type DbClient = Pick<ReturnType<typeof getRequiredDb>, "select">;
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

export interface ParsedActivityFileForAnalysis {
  metadata: {
    startTime: Date;
    type: string;
  } & Record<string, unknown>;
  summary: {
    totalTime: number;
    totalDistance: number;
    calories?: number | undefined;
    totalAscent?: number | undefined;
    avgHeartRate?: number | undefined;
    maxHeartRate?: number | undefined;
    avgPower?: number | undefined;
    maxPower?: number | undefined;
    avgCadence?: number | undefined;
    maxCadence?: number | undefined;
    avgSpeed?: number | undefined;
    maxSpeed?: number | undefined;
  } & Record<string, unknown>;
  records: Array<ActivityFileStreamRecord & { sessionMessageIndex?: number }>;
  laps?: unknown[] | undefined;
  segments?: ActivitySegment[] | undefined;
  sessions?: ActivitySession[] | undefined;
  lengths?: ActivityLength[] | undefined;
  decodedArtifact?: DecodedActivityArtifact | undefined;
  semantics?: ActivityArtifactSemantics | undefined;
}

export class ActivityAnalysisValidationError extends Error {
  constructor(
    public readonly code:
      | "activity_analysis_initial_segments_invalid"
      | "activity_analysis_persisted_segments_invalid"
      | "activity_analysis_segments_invalid",
    cause: unknown,
  ) {
    super(code, { cause });
    this.name = "ActivityAnalysisValidationError";
  }
}

function parseAnalyzedSegmentSet(input: unknown, code: ActivityAnalysisValidationError["code"]) {
  try {
    return completedActivitySegmentSetSchema.parse(input);
  } catch (error) {
    throw new ActivityAnalysisValidationError(code, error);
  }
}

function recordsForCompletedSegment(
  records: ParsedActivityFileForAnalysis["records"],
  segment: CompletedActivitySegmentSet["segments"][number],
  parentStartedAt: Date,
  parentElapsedMs: number,
) {
  const sessionMessageIndex =
    segment.source?.kind === "artifact" ? segment.source.sessionMessageIndex : undefined;
  if (
    sessionMessageIndex !== undefined &&
    records.some((record) => record.sessionMessageIndex !== undefined)
  ) {
    return records.filter((record) => record.sessionMessageIndex === sessionMessageIndex);
  }
  const startMs = parentStartedAt.getTime() + segment.startOffsetMs;
  const endMs = parentStartedAt.getTime() + segment.endOffsetMs;
  return records.filter((record) => {
    const timestamp = record.timestamp?.getTime();
    return (
      timestamp !== undefined &&
      timestamp >= startMs &&
      (timestamp < endMs || (segment.endOffsetMs === parentElapsedMs && timestamp === endMs))
    );
  });
}

function inclusionTimelineForCompletedSegment(input: {
  timestampsSeconds: readonly number[];
  segment: CompletedActivitySegmentSet["segments"][number];
  semantics: ActivityArtifactSemantics | undefined;
  activityStartedAt: Date;
}): boolean[] | undefined {
  const semanticSegment = input.semantics?.segments[input.segment.ordinal];
  if (
    semanticSegment === undefined ||
    semanticSegment.role !== input.segment.role ||
    semanticSegment.startOffsetMs !== input.segment.startOffsetMs ||
    semanticSegment.endOffsetMs !== input.segment.endOffsetMs ||
    semanticSegment.pauseRanges === undefined ||
    semanticSegment.pauseRanges.length === 0
  ) {
    return undefined;
  }
  const originMs = input.activityStartedAt.getTime();
  const pauseRanges = semanticSegment.pauseRanges;
  let previousAcceptedOffsetMs: number | null = null;
  return input.timestampsSeconds.map((timestampSeconds) => {
    const offsetMs = timestampSeconds * 1_000 - originMs;
    if (previousAcceptedOffsetMs === null) {
      previousAcceptedOffsetMs = offsetMs;
      return true;
    }
    if (offsetMs <= previousAcceptedOffsetMs) return true;
    const intervalStartMs = previousAcceptedOffsetMs;
    previousAcceptedOffsetMs = offsetMs;
    return !pauseRanges.some(
      (pause) => offsetMs > pause.startOffsetMs && intervalStartMs < pause.endOffsetMs,
    );
  });
}

interface ActivitySegmentStreamEvidence {
  records: ParsedActivityFileForAnalysis["records"];
  metadata: ActivityFileStreamMetadata;
  includedTimeline?: boolean[];
}

function average(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length
    ? present.reduce((total, value) => total + value, 0) / present.length
    : undefined;
}

type ActiveInterval = { startSeconds: number; endSeconds: number };

function activeIntervalsForSegment(input: {
  startedAt: Date;
  segment: CompletedActivitySegmentSet["segments"][number];
  pauseRanges: readonly { startOffsetMs: number; endOffsetMs: number }[];
}): ActiveInterval[] {
  const originSeconds = input.startedAt.getTime() / 1_000;
  const startSeconds = originSeconds + input.segment.startOffsetMs / 1_000;
  const endSeconds = originSeconds + input.segment.endOffsetMs / 1_000;
  let cursor = startSeconds;
  const intervals: ActiveInterval[] = [];
  for (const pause of input.pauseRanges) {
    const pauseStart = Math.max(startSeconds, originSeconds + pause.startOffsetMs / 1_000);
    const pauseEnd = Math.min(endSeconds, originSeconds + pause.endOffsetMs / 1_000);
    if (pauseStart > cursor) intervals.push({ startSeconds: cursor, endSeconds: pauseStart });
    cursor = Math.max(cursor, pauseEnd);
  }
  if (cursor < endSeconds) intervals.push({ startSeconds: cursor, endSeconds });
  return intervals;
}

function intervalMetric(
  records: ParsedActivityFileForAnalysis["records"],
  activeIntervals: readonly ActiveInterval[],
  metric: "heartRate" | "power" | "cadence" | "speed",
) {
  return calculateIntervalWeightedMetric({
    samples: records.map((record) => ({
      timestampSeconds:
        record.timestamp?.getTime() === undefined ? Number.NaN : record.timestamp.getTime() / 1_000,
      value: record[metric],
    })),
    activeIntervals,
  });
}

function buildAcceptedRecordingSegmentCalculationTimeline(input: {
  records: ParsedActivityFileForAnalysis["records"];
  segment: CompletedActivitySegmentSet["segments"][number];
  startedAt: Date;
  activeIntervals: readonly ActiveInterval[];
}) {
  const source = (metric: "heartRate" | "power" | "cadence" | "speed") =>
    deriveClippedIntervalMetricEvidence({
      samples: input.records.map((record) => ({
        timestampSeconds:
          record.timestamp?.getTime() === undefined
            ? Number.NaN
            : record.timestamp.getTime() / 1_000,
        value: record[metric],
      })),
      activeIntervals: input.activeIntervals,
    });
  const heartRate = source("heartRate");
  const power = source("power");
  const cadence = source("cadence");
  const speed = source("speed");
  const startSeconds = input.startedAt.getTime() / 1_000 + input.segment.startOffsetMs / 1_000;
  const endSeconds = input.startedAt.getTime() / 1_000 + input.segment.endOffsetMs / 1_000;
  const boundaries = [
    startSeconds,
    endSeconds,
    ...input.activeIntervals.flatMap((interval) => [interval.startSeconds, interval.endSeconds]),
    ...[heartRate, power, cadence, speed].flatMap((evidence) =>
      evidence.flatMap((interval) => [interval.startSeconds, interval.endSeconds]),
    ),
  ]
    .filter((timestamp) => timestamp >= startSeconds && timestamp <= endSeconds)
    .sort((left, right) => left - right)
    .filter((timestamp, index, all) => index === 0 || timestamp !== all[index - 1]);
  const evidenceCursors = [heartRate, power, cadence, speed].map((evidence) => ({
    evidence,
    index: 0,
  }));
  let activeIntervalIndex = 0;
  const records = boundaries.map((timestampSeconds, index) => {
    const previous = boundaries[index - 1];
    let values: Array<number | undefined> = [];
    if (previous !== undefined) {
      values = evidenceCursors.map((cursor) => {
        while (true) {
          const current = cursor.evidence[cursor.index];
          if (current === undefined || current.endSeconds > previous) break;
          cursor.index += 1;
        }
        const interval = cursor.evidence[cursor.index];
        return interval !== undefined &&
          interval.startSeconds <= previous &&
          interval.endSeconds >= timestampSeconds
          ? interval.value
          : undefined;
      });
      while (true) {
        const current = input.activeIntervals[activeIntervalIndex];
        if (current === undefined || current.endSeconds > previous) break;
        activeIntervalIndex += 1;
      }
    }
    const activeInterval = input.activeIntervals[activeIntervalIndex];
    const included =
      previous !== undefined &&
      activeInterval !== undefined &&
      activeInterval.startSeconds <= previous &&
      activeInterval.endSeconds >= timestampSeconds;
    return {
      timestamp: new Date(timestampSeconds * 1_000),
      ...(previous === undefined
        ? {}
        : {
            ...(values[0] === undefined ? {} : { heartRate: values[0] }),
            ...(values[1] === undefined ? {} : { power: values[1] }),
            ...(values[2] === undefined ? {} : { cadence: values[2] }),
            ...(values[3] === undefined ? {} : { speed: values[3] }),
          }),
      included,
    };
  });
  const metadata = collectActivityFileStreamMetadata(records);
  return { metadata, includedTimeline: records.map((record) => record.included) };
}

/**
 * Applies the imported-artifact stream calculators to a recording-owned
 * execution timeline.  The caller supplies that timeline deliberately: an
 * artifact may describe only the sensors, never the user's execution ranges.
 * Raw altitude remains in the accepted artifact, but it is deliberately not
 * adapted into this interval timeline. Therefore grade-dependent calculations
 * are unavailable here rather than interpolating or claiming derived elevation.
 */
export function analyzeAcceptedRecordingArtifactStreams(input: {
  activityId: string;
  profileId: string;
  startedAt: Date;
  segmentSet: CompletedActivitySegmentSet;
  records: ParsedActivityFileForAnalysis["records"];
  artifactId?: string;
  pauseRangesBySegment?: ReadonlyMap<
    string,
    readonly { startOffsetMs: number; endOffsetMs: number }[]
  >;
}) {
  // A timing-only TCX is an accepted recording artifact, not evidence for
  // zero-valued measurements or stream-derived performance observations.
  if (input.records.length === 0) {
    return {
      segmentSet: input.segmentSet,
      efforts: [],
      detectedLTHR: null,
      summary: {
        avgHeartRate: null,
        maxHeartRate: null,
        avgPower: null,
        maxPower: null,
        avgCadence: null,
        maxCadence: null,
        avgSpeedMps: null,
        maxSpeedMps: null,
        normalizedSpeedMps: null,
      },
    };
  }
  const analyses = input.segmentSet.segments
    .filter((segment) => segment.role === "activity")
    .map((segment) => {
      const pauseRanges = input.pauseRangesBySegment?.get(segment.id) ?? [];
      const activeIntervals = activeIntervalsForSegment({
        startedAt: input.startedAt,
        segment,
        pauseRanges,
      });
      const { metadata, includedTimeline } = buildAcceptedRecordingSegmentCalculationTimeline({
        records: input.records,
        segment,
        startedAt: input.startedAt,
        activeIntervals,
      });
      const heartRate = intervalMetric(input.records, activeIntervals, "heartRate");
      const power = intervalMetric(input.records, activeIntervals, "power");
      const cadence = intervalMetric(input.records, activeIntervals, "cadence");
      const speed = intervalMetric(input.records, activeIntervals, "speed");
      const calculation = calculateActivityFileStreamDerivedCalculations({
        activityId: input.activityId,
        profileId: input.profileId,
        segmentId: segment.id,
        activityStartedAt: input.startedAt,
        segmentStartOffsetSeconds: segment.startOffsetMs / 1_000,
        segmentEndOffsetSeconds: segment.endOffsetMs / 1_000,
        ...(input.artifactId === undefined ? {} : { sourceArtifactId: input.artifactId }),
        activityCategory: segment.activity_category,
        // Execution-manifest distance may be explicitly manual. It is never
        // eligible as stream distance for normalized speed or load derivation.
        distance: 0,
        duration: (segment.endOffsetMs - segment.startOffsetMs) / 1_000,
        activeDuration:
          "activeMs" in segment.summary.timing
            ? (segment.summary.timing.activeMs ?? null) === null
              ? null
              : (segment.summary.timing.activeMs ?? 0) / 1_000
            : null,
        movingDuration:
          "movingMs" in segment.summary.timing
            ? (segment.summary.timing.movingMs ?? null) === null
              ? null
              : (segment.summary.timing.movingMs ?? 0) / 1_000
            : null,
        includedTimeline,
        bestEffortMaxGapSeconds: 5,
        streamMetadata: metadata,
      });
      return {
        segmentId: segment.id,
        calculation,
        summary: buildActivityFileDerivedSegmentSummary({
          summary: {
            ...segment.summary,
            ...(heartRate.average === null ? {} : { averageHeartRateBpm: heartRate.average }),
            ...(power.average === null ? {} : { averagePowerWatts: power.average }),
            ...(cadence.average === null ? {} : { averageCadenceRpm: cadence.average }),
            ...(speed.average === null ? {} : { averageSpeedMetersPerSecond: speed.average }),
          },
          metrics: calculation,
        }),
        activeIntervals,
      };
    });
  const activeIntervals = analyses.flatMap((analysis) => analysis.activeIntervals);
  const heartRate = intervalMetric(input.records, activeIntervals, "heartRate");
  const power = intervalMetric(input.records, activeIntervals, "power");
  const cadence = intervalMetric(input.records, activeIntervals, "cadence");
  const speed = intervalMetric(input.records, activeIntervals, "speed");
  return {
    segmentSet: completedActivitySegmentSetSchema.parse({
      ...input.segmentSet,
      segments: input.segmentSet.segments.map((segment) => {
        const analysis = analyses.find((candidate) => candidate.segmentId === segment.id);
        return analysis ? { ...segment, summary: analysis.summary } : segment;
      }),
    }),
    efforts: analyses.flatMap((analysis) => analysis.calculation.effortsToInsert),
    detectedLTHR:
      analyses.find((analysis) => analysis.calculation.detectedLTHR !== null)?.calculation
        .detectedLTHR ?? null,
    summary: {
      avgHeartRate: heartRate.average,
      maxHeartRate: heartRate.maximum,
      avgPower: power.average,
      maxPower: power.maximum,
      avgCadence: cadence.average,
      maxCadence: cadence.maximum,
      avgSpeedMps: speed.average,
      maxSpeedMps: speed.maximum,
      // No accepted recording distance stream is modeled here. Avoid turning a
      // manually supplied distance and elapsed/manual timer into a sensor speed.
      normalizedSpeedMps: null,
    },
  };
}

function positiveFiniteNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function validSwimSpeed(value: number | undefined): number | undefined {
  const speed = positiveFiniteNumber(value);
  return speed !== undefined && speed <= 100 ? speed : undefined;
}

function boundedInteger(value: number | undefined, minimum: number): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= minimum && value <= 1_000_000
    ? value
    : undefined;
}

function poolLengthMeters(session: ActivitySession | undefined): number | undefined {
  const metres = positiveFiniteNumber(session?.poolLengthMeters);
  return metres !== undefined && metres <= 200 ? metres : undefined;
}

function ownedSwimLengths(
  lengths: ActivityLength[] | undefined,
  sessionMessageIndex: number,
): ActivityLength[] {
  return lengths?.filter((length) => length.sessionMessageIndex === sessionMessageIndex) ?? [];
}

function ownedActiveLengths(
  lengths: ActivityLength[] | undefined,
  sessionMessageIndex: number,
): ActivityLength[] | undefined {
  const owned = ownedSwimLengths(lengths, sessionMessageIndex);
  if (owned.length === 0) return undefined;
  // FIT calls pool lengths "active" explicitly. Idle/rest messages are known
  // non-swimming boundaries; any other value leaves completeness unknowable.
  if (
    owned.some(
      (length) =>
        length.lengthType !== "active" &&
        length.lengthType !== "idle" &&
        length.lengthType !== "rest",
    )
  ) {
    return undefined;
  }
  return owned.filter((length) => length.lengthType === "active");
}

function swimTimingEvidence(input: {
  elapsedSeconds: number;
  lengths: ActivityLength[] | undefined;
  session: ActivitySession | undefined;
  sessionMessageIndex: number;
}): SwimTimingResult {
  return calculateSwimTiming({
    elapsedDurationSeconds: input.elapsedSeconds,
    lengths: ownedSwimLengths(input.lengths, input.sessionMessageIndex),
    ...(input.session?.numActiveLengths === undefined
      ? {}
      : { expectedActiveLengthCount: input.session.numActiveLengths }),
  });
}

function swimSummary(input: {
  session: ActivitySession | undefined;
  lengths: ActivityLength[] | undefined;
  sessionMessageIndex: number;
}) {
  const session = input.session;
  const activeLengthCount = boundedInteger(session?.numActiveLengths, 1);
  const activeLengths = ownedActiveLengths(input.lengths, input.sessionMessageIndex);
  const unambiguousActiveLengths =
    activeLengths && activeLengths.length > 0 && activeLengthCount === undefined
      ? activeLengths.length
      : undefined;
  const lengthCount = activeLengthCount ?? unambiguousActiveLengths;
  const sessionStrokeCount = boundedInteger(session?.totalStrokes, 0);
  const completeLengths =
    activeLengths && lengthCount !== undefined && activeLengths.length === lengthCount
      ? activeLengths
      : undefined;
  const lengthStrokeTotal = completeLengths
    ?.map((length) => boundedInteger(length.totalStrokes, 0))
    .every((strokes): strokes is number => strokes !== undefined)
    ? completeLengths.reduce((total, length) => total + (length.totalStrokes ?? 0), 0)
    : undefined;
  const swolfValues = completeLengths?.map((length) => {
    const seconds =
      positiveFiniteNumber(length.totalTimerTime) ?? positiveFiniteNumber(length.totalElapsedTime);
    const strokes = boundedInteger(length.totalStrokes, 0);
    return seconds === undefined || strokes === undefined ? undefined : seconds + strokes;
  });
  const averageSwolf = swolfValues?.every((value): value is number => value !== undefined)
    ? average(swolfValues)
    : undefined;
  const canonicalPoolLength = poolLengthMeters(session);
  const strokeCount = sessionStrokeCount ?? lengthStrokeTotal;
  const swim = {
    ...(canonicalPoolLength === undefined ? {} : { poolLengthMeters: canonicalPoolLength }),
    ...(lengthCount === undefined ? {} : { lengthCount }),
    ...(strokeCount === undefined ? {} : { strokeCount }),
    ...(averageSwolf === undefined || averageSwolf > 1_000 ? {} : { averageSwolf }),
  };
  return Object.keys(swim).length > 0 ? swim : undefined;
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export async function getLatestProfileMetricValue(
  db: DbClient,
  input: {
    profileId: string;
    metricType: "max_hr" | "resting_hr";
    recordedAtLte: Date;
  },
): Promise<number | null> {
  const row = await db
    .select({
      value: profileMetrics.value,
    })
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, input.profileId),
        eq(profileMetrics.metric_type, input.metricType),
        lte(profileMetrics.recorded_at, input.recordedAtLte),
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return row ? toNumberOrNull(row.value) : null;
}

function deterministicSegmentId(
  activityId: string,
  artifactId: string | undefined,
  sourceSessionIndex: number,
  role: string,
): string {
  const hash = createHash("sha256")
    .update(
      `segment:${activityId}:${artifactId ?? "native-manifest"}:${sourceSessionIndex}:${role}`,
    )
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

type SourceIdentity =
  | { role: "activity"; activity_category: "run" | "bike" | "swim" | "strength" }
  | { role: "transition" }
  | { role: "unknown" };

function sourceIdentity(rawSport: string | number | undefined): SourceIdentity {
  if (rawSport === 3 || rawSport === "transition") return { role: "transition" };
  if (rawSport === 1 || rawSport === "running")
    return { role: "activity", activity_category: "run" };
  if (rawSport === 2 || rawSport === "cycling")
    return { role: "activity", activity_category: "bike" };
  if (rawSport === 5 || rawSport === "swimming")
    return { role: "activity", activity_category: "swim" };
  if (rawSport === 10 || rawSport === "training")
    return { role: "activity", activity_category: "strength" };
  return { role: "unknown" };
}

function boundedTimingMilliseconds(seconds: number | undefined, elapsedMs: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const milliseconds = Math.round(seconds * 1000);
  return milliseconds <= elapsedMs ? milliseconds : undefined;
}

function timingSummary(
  session: ActivitySession | undefined,
  elapsedMs: number,
  providerActiveDurationSeconds?: number | null,
  swimTiming?: SwimTimingResult,
) {
  const activeMs = boundedTimingMilliseconds(session?.totalTimerTime, elapsedMs);
  const candidateMovingMs = boundedTimingMilliseconds(session?.totalMovingTime, elapsedMs);
  const movingMs =
    candidateMovingMs !== undefined && (activeMs === undefined || candidateMovingMs <= activeMs)
      ? candidateMovingMs
      : undefined;
  if (activeMs !== undefined && movingMs !== undefined) {
    return { timingCoverage: "complete" as const, activeMs, movingMs };
  }
  if (activeMs === undefined && movingMs === undefined && swimTiming?.status === "available") {
    const swimActiveMs = boundedTimingMilliseconds(swimTiming.activeDurationSeconds, elapsedMs);
    if (swimActiveMs !== undefined) {
      return {
        timingCoverage: "complete" as const,
        activeMs: swimActiveMs,
        movingMs: swimActiveMs,
      };
    }
  }
  const providerActiveMs =
    activeMs === undefined &&
    movingMs === undefined &&
    providerActiveDurationSeconds !== null &&
    providerActiveDurationSeconds !== undefined &&
    providerActiveDurationSeconds > 0
      ? boundedTimingMilliseconds(providerActiveDurationSeconds ?? undefined, elapsedMs)
      : undefined;
  if (activeMs !== undefined || providerActiveMs !== undefined || movingMs !== undefined) {
    return {
      timingCoverage: "partial" as const,
      ...(activeMs === undefined
        ? providerActiveMs === undefined
          ? {}
          : { activeMs: providerActiveMs }
        : { activeMs }),
      ...(movingMs === undefined ? {} : { movingMs }),
    };
  }
  if (swimTiming?.status === "partial" && swimTiming.activeDurationSeconds !== null) {
    const swimActiveMs = boundedTimingMilliseconds(swimTiming.activeDurationSeconds, elapsedMs);
    if (swimActiveMs !== undefined) {
      return {
        timingCoverage: "partial" as const,
        activeMs: swimActiveMs,
        movingMs: swimActiveMs,
      };
    }
  }
  return { timingCoverage: "unavailable" as const };
}

function buildCompletedSegmentSet(input: {
  activityId: string;
  artifactId?: string;
  parsedData: ParsedActivityFileForAnalysis;
  providerActiveDurationSeconds?: number | null;
  provider?: string;
}): CompletedActivitySegmentSet {
  const decoded = input.parsedData.decodedArtifact
    ? decodedActivityArtifactSchema.parse(input.parsedData.decodedArtifact)
    : undefined;
  const nativeSegments = input.parsedData.segments;
  let segments: ActivitySegment[];
  if (nativeSegments && nativeSegments.length > 0) {
    segments = nativeSegments;
  } else if (decoded?.sessions.length) {
    segments = decoded.sessions.map((session) => {
      if (session.startTimeMs === undefined || session.endTimeMs === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Decoded activity session ${session.messageIndex} is missing segment boundaries`,
        });
      }
      const identity = sourceIdentity(session.rawSport);
      return {
        sessionMessageIndex: session.messageIndex,
        ...identity,
        ...(session.rawSport === undefined ? {} : { rawSport: session.rawSport }),
        ...(session.rawSubSport === undefined ? {} : { rawSubSport: session.rawSubSport }),
        startTime: new Date(session.startTimeMs),
        endTime: new Date(session.endTimeMs),
      };
    });
  } else {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Decoded activity artifact has no ordered segment or session manifest",
    });
  }
  if (decoded) {
    const represented = new Set(segments.map((segment) => segment.sessionMessageIndex));
    const missing = decoded.sessions.find((session) => !represented.has(session.messageIndex));
    if (
      missing ||
      represented.size !== decoded.sessions.length ||
      segments.length !== decoded.sessions.length
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Decoded activity sessions do not match the ordered segment manifest${missing ? `; missing session ${missing.messageIndex}` : ""}`,
      });
    }
  }
  const startMs = input.parsedData.metadata.startTime.getTime();
  const summaryElapsedMs = Math.round(input.parsedData.summary.totalTime * 1000);
  const decodedElapsedMs =
    decoded?.activity.endTimeMs === undefined ? 0 : decoded.activity.endTimeMs - startMs;
  const elapsedMs = Math.max(
    Number.isFinite(summaryElapsedMs) ? summaryElapsedMs : 0,
    Number.isFinite(decodedElapsedMs) ? decodedElapsedMs : 0,
    ...segments.map((segment) => segment.endTime.getTime() - startMs),
  );
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Activity has zero duration and cannot be processed.",
    });
  }

  return completedActivitySegmentSetSchema.parse({
    version: 1,
    elapsedMs,
    segments: segments.map((segment, ordinal) => {
      const session = input.parsedData.decodedArtifact?.sessions.find(
        (candidate) => candidate.messageIndex === segment.sessionMessageIndex,
      );
      const nativeSession = input.parsedData.sessions?.find(
        (candidate) => candidate.messageIndex === segment.sessionMessageIndex,
      );
      const startOffsetMs = Math.max(0, segment.startTime.getTime() - startMs);
      const endOffsetMs = Math.min(elapsedMs, segment.endTime.getTime() - startMs);
      const source = input.artifactId
        ? {
            kind: "artifact" as const,
            artifactId: input.artifactId,
            source: decoded?.source ?? { standard: "provider" as const, format: "native" },
            sessionMessageIndex: segment.sessionMessageIndex,
            rawSport: segment.rawSport ?? session?.rawSport,
            rawSubSport: segment.rawSubSport ?? session?.rawSubSport,
          }
        : undefined;
      const identity = sourceIdentity(segment.rawSport ?? session?.rawSport);
      const unsupportedProviderCategory =
        input.provider !== undefined &&
        segment.role === "activity" &&
        segment.activity_category === "other" &&
        identity.role === "unknown";
      const role =
        segment.role === "activity" && (!segment.activity_category || unsupportedProviderCategory)
          ? identity.role
          : segment.role;
      const activityCategory =
        role === "activity"
          ? (segment.activity_category ??
            (identity.role === "activity" ? identity.activity_category : undefined))
          : undefined;
      const swimSessionAverageSpeed =
        activityCategory === "swim" ? validSwimSpeed(nativeSession?.avgSpeed) : undefined;
      const swimTiming =
        activityCategory === "swim"
          ? swimTimingEvidence({
              elapsedSeconds: (endOffsetMs - startOffsetMs) / 1_000,
              lengths: input.parsedData.lengths,
              session: nativeSession,
              sessionMessageIndex: segment.sessionMessageIndex,
            })
          : undefined;
      const summary = {
        version: 1 as const,
        normalizedPowerResult: unavailableNormalizedPowerResult,
        timing: timingSummary(
          nativeSession,
          endOffsetMs - startOffsetMs,
          segments.length === 1 && segment.role === "activity"
            ? input.providerActiveDurationSeconds
            : undefined,
          swimTiming,
        ),
        ...(nativeSession
          ? {
              distanceMeters: nativeSession.totalDistance,
              ...(swimSessionAverageSpeed === undefined
                ? {}
                : { averageSpeedMetersPerSecond: swimSessionAverageSpeed }),
            }
          : segments.length === 1
            ? {
                distanceMeters: input.parsedData.summary.totalDistance,
                ascentMeters: input.parsedData.summary.totalAscent,
                caloriesKcal: input.parsedData.summary.calories,
                averageHeartRateBpm: input.parsedData.summary.avgHeartRate,
                averagePowerWatts: input.parsedData.summary.avgPower,
                averageCadenceRpm: input.parsedData.summary.avgCadence,
                averageSpeedMetersPerSecond: input.parsedData.summary.avgSpeed,
              }
            : {}),
        ...(activityCategory !== "swim"
          ? {}
          : (() => {
              const swim = swimSummary({
                session: nativeSession,
                lengths: input.parsedData.lengths,
                sessionMessageIndex: segment.sessionMessageIndex,
              });
              return { swim: { ...(swim ?? {}), timingEvidence: swimTiming } };
            })()),
      };
      return {
        id: deterministicSegmentId(
          input.activityId,
          input.artifactId,
          segment.sessionMessageIndex,
          role,
        ),
        ordinal,
        role,
        ...(role === "activity"
          ? {
              activity_category: activityCategory,
            }
          : {}),
        startOffsetMs,
        endOffsetMs,
        summary,
        ...(source
          ? {
              source:
                role === "unknown" && source.rawSport === undefined
                  ? { ...source, rawType: "unknown-session" }
                  : source,
            }
          : role === "unknown"
            ? {
                source: {
                  kind: "raw" as const,
                  ...(segment.rawSport === undefined
                    ? { rawType: "unknown-session" }
                    : { rawSport: segment.rawSport }),
                },
              }
            : {}),
      };
    }),
  });
}

/**
 * Canonical analysis boundary for any parsed activity artifact.
 *
 * Raw effort observations are derived before profile context is loaded. Profile
 * metrics can influence optional evidence promotion, but never whether effort
 * observations are collected.
 */
export async function analyzeParsedActivityFile(
  db: DbClient,
  input: {
    profileId: string;
    activityId: string;
    parsedData: ParsedActivityFileForAnalysis;
    artifactId?: string;
    providerActiveDurationSeconds?: number | null;
    provider?: string;
    refreshWeather?: boolean;
  },
) {
  const { summary, records } = input.parsedData;
  const startTime = input.parsedData.metadata.startTime;
  let initialSegmentSet: ReturnType<typeof buildCompletedSegmentSet>;
  try {
    initialSegmentSet = buildCompletedSegmentSet(input);
  } catch (error) {
    throw new ActivityAnalysisValidationError("activity_analysis_initial_segments_invalid", error);
  }
  const duration = initialSegmentSet.elapsedMs / 1000;

  if (duration <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Activity has zero duration and cannot be processed.",
    });
  }

  const distance = summary.totalDistance || 0;
  const activityCompletedAt = new Date(startTime.getTime() + duration * 1000);
  const activityCompletedAtIso = activityCompletedAt.toISOString();
  const segmentStreamEvidence = new Map<string, ActivitySegmentStreamEvidence>();
  for (const segment of initialSegmentSet.segments) {
    if (segment.role !== "activity") continue;
    const segmentRecords = recordsForCompletedSegment(
      records,
      segment,
      startTime,
      initialSegmentSet.elapsedMs,
    );
    const metadata = collectActivityFileStreamMetadata(segmentRecords);
    const includedTimeline = inclusionTimelineForCompletedSegment({
      timestampsSeconds: metadata.samples.map((sample) => sample.timestampSeconds),
      segment,
      semantics: input.parsedData.semantics,
      activityStartedAt: startTime,
    });
    segmentStreamEvidence.set(segment.id, {
      records: segmentRecords,
      metadata,
      ...(includedTimeline === undefined ? {} : { includedTimeline }),
    });
  }
  const segmentSet = parseAnalyzedSegmentSet(
    {
      ...initialSegmentSet,
      segments: initialSegmentSet.segments.map((segment) => {
        if (segment.role !== "activity") return segment;
        const evidence = segmentStreamEvidence.get(segment.id);
        if (evidence === undefined) return segment;
        const segmentRecords = evidence.records;
        const heartRateDistribution = calculateActivityFileHeartRateEvidence({
          samples: evidence.metadata.samples,
          ...(evidence.includedTimeline === undefined
            ? {}
            : { includedTimeline: evidence.includedTimeline }),
        });
        const recordAverageSpeed = average(segmentRecords.map((record) => record.speed));
        const preservesSwimSessionAverage =
          segment.activity_category === "swim" &&
          validSwimSpeed(segment.summary.averageSpeedMetersPerSecond) !== undefined;
        return {
          ...segment,
          summary: {
            ...segment.summary,
            ...(heartRateDistribution.timeWeightedAverageBpm === null
              ? {}
              : { averageHeartRateBpm: heartRateDistribution.timeWeightedAverageBpm }),
            heartRateDistribution,
            ...(average(segmentRecords.map((record) => record.power)) === undefined
              ? {}
              : { averagePowerWatts: average(segmentRecords.map((record) => record.power)) }),
            ...(average(segmentRecords.map((record) => record.cadence)) === undefined
              ? {}
              : { averageCadenceRpm: average(segmentRecords.map((record) => record.cadence)) }),
            ...(recordAverageSpeed === undefined || preservesSwimSessionAverage
              ? {}
              : {
                  averageSpeedMetersPerSecond: recordAverageSpeed,
                }),
          },
        };
      }),
    },
    "activity_analysis_segments_invalid",
  );
  const completeTiming = segmentSet.segments.every(
    (segment) => segment.summary.timing.timingCoverage === "complete",
  );
  const unavailableTiming = segmentSet.segments.every(
    (segment) => segment.summary.timing.timingCoverage === "unavailable",
  );
  const activeMs = completeTiming
    ? segmentSet.segments.reduce(
        (total, segment) =>
          total +
          ("activeMs" in segment.summary.timing ? (segment.summary.timing.activeMs ?? 0) : 0),
        0,
      )
    : null;
  const movingMs = completeTiming
    ? segmentSet.segments.reduce(
        (total, segment) =>
          total +
          ("movingMs" in segment.summary.timing ? (segment.summary.timing.movingMs ?? 0) : 0),
        0,
      )
    : null;
  const streamMetadata = collectActivityFileStreamMetadata(records);
  const segmentAnalyses = segmentSet.segments
    .filter((segment) => segment.role === "activity")
    .map((segment) => {
      const evidence = segmentStreamEvidence.get(segment.id);
      if (evidence === undefined) {
        throw new Error("Activity segment stream evidence must be normalized exactly once");
      }
      const calculation = calculateActivityFileStreamDerivedCalculations({
        activityId: input.activityId,
        profileId: input.profileId,
        segmentId: segment.id,
        activityStartedAt: startTime,
        segmentStartOffsetSeconds: segment.startOffsetMs / 1_000,
        segmentEndOffsetSeconds: segment.endOffsetMs / 1_000,
        ...(input.artifactId === undefined ? {} : { sourceArtifactId: input.artifactId }),
        activityCategory: segment.activity_category,
        ...(segment.activity_category !== "swim"
          ? {}
          : segment.summary.swim?.poolLengthMeters !== undefined &&
              (segment.summary.swim.timingEvidence?.status === "available" ||
                segment.summary.swim.timingEvidence?.status === "partial")
            ? {
                swimmingEvidenceContext: {
                  environment: "pool" as const,
                  timingBasis: "pool_length_timing" as const,
                  poolLengthMeters: segment.summary.swim.poolLengthMeters,
                },
              }
            : evidence.metadata.coords.length > 0
              ? {
                  swimmingEvidenceContext: {
                    environment: "open_water" as const,
                    timingBasis: "open_water_continuous_timing" as const,
                    poolLengthMeters: null,
                  },
                }
              : {}),
        distance: segment.summary.distanceMeters ?? 0,
        duration: (segment.endOffsetMs - segment.startOffsetMs) / 1000,
        activeDuration:
          "activeMs" in segment.summary.timing
            ? (segment.summary.timing.activeMs ?? null) === null
              ? null
              : (segment.summary.timing.activeMs ?? 0) / 1000
            : null,
        movingDuration:
          "movingMs" in segment.summary.timing
            ? (segment.summary.timing.movingMs ?? null) === null
              ? null
              : (segment.summary.timing.movingMs ?? 0) / 1000
            : null,
        ...(evidence.includedTimeline === undefined
          ? {}
          : { includedTimeline: evidence.includedTimeline }),
        streamMetadata: evidence.metadata,
      });
      return {
        segment,
        calculation,
        efforts: calculation.effortsToInsert,
      };
    });
  const persistedSegmentSet = parseAnalyzedSegmentSet(
    {
      ...segmentSet,
      segments: segmentSet.segments.map((segment) => {
        const analysis = segmentAnalyses.find((candidate) => candidate.segment.id === segment.id);
        if (!analysis) return segment;
        return {
          ...segment,
          summary: buildActivityFileDerivedSegmentSummary({
            summary: segment.summary,
            metrics: analysis.calculation,
          }),
        };
      }),
    },
    "activity_analysis_persisted_segments_invalid",
  );
  const soleActivityAnalysis = segmentAnalyses.length === 1 ? segmentAnalyses[0] : undefined;
  const soleSwimSummary =
    soleActivityAnalysis?.segment.activity_category === "swim"
      ? soleActivityAnalysis.segment.summary.swim
      : undefined;
  const normalizedSpeed = soleActivityAnalysis?.calculation.normalizedSpeed ?? null;
  const effortsToInsert = segmentAnalyses.flatMap((analysis) => analysis.efforts);

  let resolvedAvgTemperature = streamMetadata.avgTemperature;
  const firstCoordinate = streamMetadata.coords[0];
  if (input.refreshWeather !== false && resolvedAvgTemperature === null && firstCoordinate) {
    resolvedAvgTemperature = await fetchActivityTemperature(
      firstCoordinate.latitude,
      firstCoordinate.longitude,
      startTime,
    );
  }

  const restingHR = await getLatestProfileMetricValue(db, {
    profileId: input.profileId,
    metricType: "resting_hr",
    recordedAtLte: activityCompletedAt,
  });

  const geometry = buildActivityGeometry(records);
  const detectedLTHR: GeneratedActivityLthrEvidence | null =
    soleActivityAnalysis?.calculation.detectedLTHR ?? null;
  if (summary.maxHeartRate && restingHR) void estimateVO2Max(summary.maxHeartRate, restingHR);

  return {
    activityCompletedAt,
    activityCompletedAtIso,
    detectedLTHR,
    effortsToInsert,
    geometry,
    summaryValues: {
      activity_id: input.activityId,
      profile_id: input.profileId,
      elapsed_ms: segmentSet.elapsedMs,
      active_ms: activeMs,
      moving_ms: movingMs,
      timing_coverage: unavailableTiming
        ? ("unavailable" as const)
        : completeTiming
          ? ("complete" as const)
          : ("partial" as const),
      distance_meters: Math.round(distance),
      elevation_gain_meters: summary.totalAscent ? Math.round(summary.totalAscent) : null,
      calories: summary.calories ? Math.round(summary.calories) : null,
      avg_heart_rate: summary.avgHeartRate ? Math.round(summary.avgHeartRate) : null,
      max_heart_rate: summary.maxHeartRate ? Math.round(summary.maxHeartRate) : null,
      avg_power: soleActivityAnalysis && summary.avgPower ? Math.round(summary.avgPower) : null,
      max_power: soleActivityAnalysis && summary.maxPower ? Math.round(summary.maxPower) : null,
      avg_cadence:
        soleActivityAnalysis && summary.avgCadence ? Math.round(summary.avgCadence) : null,
      max_cadence:
        soleActivityAnalysis && summary.maxCadence ? Math.round(summary.maxCadence) : null,
      avg_speed_mps: soleActivityAnalysis
        ? soleActivityAnalysis.segment.activity_category === "swim"
          ? (validSwimSpeed(soleActivityAnalysis.segment.summary.averageSpeedMetersPerSecond) ??
            null)
          : (summary.avgSpeed ?? (distance && duration ? distance / duration : null))
        : null,
      max_speed_mps: soleActivityAnalysis ? (summary.maxSpeed ?? null) : null,
      normalized_speed_mps: normalizedSpeed || null,
      avg_temperature: resolvedAvgTemperature ? Math.round(resolvedAvgTemperature) : null,
      pool_length_meters: soleSwimSummary?.poolLengthMeters ?? null,
      total_strokes: soleSwimSummary?.strokeCount ?? null,
      avg_swolf: soleSwimSummary?.averageSwolf ?? null,
      updated_at: new Date(),
    },
    segmentSet: persistedSegmentSet,
    startedAt: startTime,
  };
}

export type ParsedActivityFileAnalysis = Awaited<ReturnType<typeof analyzeParsedActivityFile>>;
