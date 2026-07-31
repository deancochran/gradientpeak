import { createHash } from "node:crypto";
import {
  type ActivityLength,
  type ActivitySegment,
  type ActivitySession,
  type CanonicalActivityCategory,
  canonicalActivityCategorySchema,
  type DecodedActivityArtifact,
} from "@repo/core";
import { decodedActivityArtifactSchema } from "@repo/core/activity-artifacts";
import {
  type CompletedActivitySegmentSet,
  completedActivitySegmentSetSchema,
} from "@repo/core/activity-segments";
import { detectLTHR, estimateVO2Max } from "@repo/core/calculations";
import { activitySegments, profileMetrics } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lte, ne, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { isClearedProfileOverride } from "../../utils/profile-override-observations";
import { fetchActivityTemperature } from "../../utils/weather";
import { calculateActivityFileStreamDerivedCalculations } from "./stream-derived-calculations";
import {
  type ActivityFileStreamRecord,
  buildActivityGeometry,
  collectActivityFileStreamMetadata,
} from "./stream-metadata";

type DbClient = Pick<ReturnType<typeof getRequiredDb>, "select">;

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

function average(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length
    ? present.reduce((total, value) => total + value, 0) / present.length
    : undefined;
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

function ownedActiveLengths(
  lengths: ActivityLength[] | undefined,
  sessionMessageIndex: number,
): ActivityLength[] | undefined {
  if (!lengths) return undefined;
  const owned = lengths.filter((length) => length.sessionMessageIndex === sessionMessageIndex);
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

function buildHeartRateDistribution(
  records: Array<{ timestamp?: Date; heartRate?: number }>,
): { coverageSeconds: number; buckets: Array<{ bpm: number; seconds: number }> } | undefined {
  const secondsByBpm = new Map<number, number>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (
      !record?.timestamp ||
      !record.heartRate ||
      record.heartRate < 30 ||
      record.heartRate > 250
    ) {
      continue;
    }
    const nextTimestamp = records[index + 1]?.timestamp;
    if (!nextTimestamp) continue;
    const observedSeconds = (nextTimestamp.getTime() - record.timestamp.getTime()) / 1000;
    if (!Number.isFinite(observedSeconds) || observedSeconds <= 0) continue;
    const seconds = Math.min(10, Math.round(observedSeconds));
    if (seconds <= 0) continue;
    const bpm = Math.round(record.heartRate);
    secondsByBpm.set(bpm, (secondsByBpm.get(bpm) ?? 0) + seconds);
  }
  const buckets = [...secondsByBpm.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bpm, seconds]) => ({ bpm, seconds }));
  if (buckets.length === 0) return undefined;
  return {
    coverageSeconds: buckets.reduce((sum, bucket) => sum + bucket.seconds, 0),
    buckets,
  };
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
    metricType: "lthr" | "max_hr" | "resting_hr";
    recordedAtLte: Date;
  },
): Promise<number | null> {
  const row = await db
    .select({
      value: profileMetrics.value,
      method: profileMetrics.method,
      provenance: profileMetrics.provenance,
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

  return row && !isClearedProfileOverride(row) ? toNumberOrNull(row.value) : null;
}

export async function getLatestActivityCategoryLthrValue(
  db: DbClient,
  input: {
    profileId: string;
    activityCategory: CanonicalActivityCategory;
    recordedAtLte: Date;
    excludeActivityId?: string;
  },
): Promise<number | null> {
  const row = await db
    .select({
      referenceActivityId: profileMetrics.reference_activity_id,
      value: profileMetrics.value,
      source: profileMetrics.source,
      method: profileMetrics.method,
      provenance: profileMetrics.provenance,
    })
    .from(profileMetrics)
    .innerJoin(
      activitySegments,
      eq(activitySegments.activity_id, profileMetrics.reference_activity_id),
    )
    .where(
      and(
        eq(profileMetrics.profile_id, input.profileId),
        eq(profileMetrics.metric_type, "lthr"),
        eq(profileMetrics.source, "derived"),
        eq(profileMetrics.method, "activity_file_lthr_detection"),
        sql`${profileMetrics.provenance} ->> 'activity_id' = cast(${profileMetrics.reference_activity_id} as text)`,
        sql`${profileMetrics.provenance} ->> 'derived_from' = 'activity_file_stream'`,
        eq(activitySegments.activity_category, input.activityCategory),
        lte(profileMetrics.recorded_at, input.recordedAtLte),
        input.excludeActivityId
          ? ne(profileMetrics.reference_activity_id, input.excludeActivityId)
          : undefined,
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const provenance =
    row?.provenance && typeof row.provenance === "object" && !Array.isArray(row.provenance)
      ? (row.provenance as Record<string, unknown>)
      : null;

  return row &&
    row.source === "derived" &&
    row.method === "activity_file_lthr_detection" &&
    provenance?.activity_id === row.referenceActivityId &&
    provenance.derived_from === "activity_file_stream" &&
    row.referenceActivityId !== input.excludeActivityId &&
    !isClearedProfileOverride(row)
    ? toNumberOrNull(row.value)
    : null;
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

function sourceIdentity(rawSport: string | number | undefined) {
  if (rawSport === 3 || rawSport === "transition") return { role: "transition" as const };
  if (rawSport === 1 || rawSport === "running")
    return { role: "activity" as const, activity_category: "run" as const };
  if (rawSport === 2 || rawSport === "cycling")
    return { role: "activity" as const, activity_category: "bike" as const };
  if (rawSport === 5 || rawSport === "swimming")
    return { role: "activity" as const, activity_category: "swim" as const };
  if (rawSport === 10 || rawSport === "training")
    return { role: "activity" as const, activity_category: "strength" as const };
  if (
    (typeof rawSport === "number" && rawSport >= 0 && rawSport <= 43) ||
    (typeof rawSport === "string" && rawSport.length > 0 && rawSport !== "unknown")
  ) {
    return { role: "activity" as const, activity_category: "other" as const };
  }
  return { role: "unknown" as const };
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
  return { timingCoverage: "unavailable" as const };
}

function buildCompletedSegmentSet(input: {
  activityId: string;
  artifactId?: string;
  parsedData: ParsedActivityFileForAnalysis;
  providerActiveDurationSeconds?: number | null;
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
        rawSport: session.rawSport,
        rawSubSport: session.rawSubSport,
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
      const role =
        segment.role === "activity" && !segment.activity_category ? identity.role : segment.role;
      const activityCategory =
        role === "activity"
          ? (segment.activity_category ??
            (identity.role === "activity" ? identity.activity_category : "other"))
          : undefined;
      const swimSessionAverageSpeed =
        activityCategory === "swim" ? validSwimSpeed(nativeSession?.avgSpeed) : undefined;
      const summary = {
        version: 1 as const,
        timing: timingSummary(
          nativeSession,
          endOffsetMs - startOffsetMs,
          segments.length === 1 && segment.role === "activity"
            ? input.providerActiveDurationSeconds
            : undefined,
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
              return swim ? { swim } : {};
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
    refreshWeather?: boolean;
  },
) {
  const { summary, records } = input.parsedData;
  const startTime = input.parsedData.metadata.startTime;
  const initialSegmentSet = buildCompletedSegmentSet(input);
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
  const segmentSet = completedActivitySegmentSetSchema.parse({
    ...initialSegmentSet,
    segments: initialSegmentSet.segments.map((segment) => {
      if (segment.role !== "activity") return segment;
      const segmentRecords = recordsForCompletedSegment(
        records,
        segment,
        startTime,
        initialSegmentSet.elapsedMs,
      );
      const heartRateDistribution = buildHeartRateDistribution(segmentRecords);
      const recordAverageSpeed = average(segmentRecords.map((record) => record.speed));
      const preservesSwimSessionAverage =
        segment.activity_category === "swim" &&
        validSwimSpeed(segment.summary.averageSpeedMetersPerSecond) !== undefined;
      return {
        ...segment,
        summary: {
          ...segment.summary,
          ...(average(segmentRecords.map((record) => record.heartRate)) === undefined
            ? {}
            : { averageHeartRateBpm: average(segmentRecords.map((record) => record.heartRate)) }),
          ...(heartRateDistribution ? { heartRateDistribution } : {}),
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
  });
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
      const segmentRecords = recordsForCompletedSegment(
        records,
        segment,
        startTime,
        segmentSet.elapsedMs,
      );
      const segmentMetadata = collectActivityFileStreamMetadata(segmentRecords);
      const calculation = calculateActivityFileStreamDerivedCalculations({
        activityId: input.activityId,
        profileId: input.profileId,
        activityCategory: segment.activity_category,
        distance: segment.summary.distanceMeters ?? 0,
        duration: (segment.endOffsetMs - segment.startOffsetMs) / 1000,
        avgHeartRate: segment.summary.averageHeartRateBpm,
        recordedAt: new Date(startTime.getTime() + segment.endOffsetMs),
        streamMetadata: segmentMetadata,
      });
      return {
        segment,
        segmentMetadata,
        calculation,
        efforts: calculation.effortsToInsert.map((effort) => {
          const segmentOffsetSeconds = segment.startOffsetMs / 1000;
          const provenance =
            effort.provenance &&
            typeof effort.provenance === "object" &&
            !Array.isArray(effort.provenance)
              ? (effort.provenance as Record<string, unknown>)
              : {};
          const exactStart = provenance.exact_window_start_seconds;
          const exactEnd = provenance.exact_window_end_seconds;
          return {
            ...effort,
            segment_id: segment.id,
            start_offset: (effort.start_offset ?? 0) + segmentOffsetSeconds,
            provenance: {
              ...provenance,
              ...(typeof exactStart === "number" && Number.isFinite(exactStart)
                ? { exact_window_start_seconds: exactStart + segmentOffsetSeconds }
                : {}),
              ...(typeof exactEnd === "number" && Number.isFinite(exactEnd)
                ? { exact_window_end_seconds: exactEnd + segmentOffsetSeconds }
                : {}),
            },
          };
        }),
      };
    });
  const persistedSegmentSet = completedActivitySegmentSetSchema.parse({
    ...segmentSet,
    segments: segmentSet.segments.map((segment) => {
      const analysis = segmentAnalyses.find((candidate) => candidate.segment.id === segment.id);
      if (!analysis) return segment;
      const { normalizedPower, normalizedSpeed, normalizedGradedSpeed } = analysis.calculation;
      return {
        ...segment,
        summary: {
          ...segment.summary,
          ...(normalizedPower ? { normalizedPowerWatts: normalizedPower } : {}),
          ...(normalizedSpeed ? { normalizedSpeedMetersPerSecond: normalizedSpeed } : {}),
          ...(normalizedGradedSpeed
            ? { normalizedGradedSpeedMetersPerSecond: normalizedGradedSpeed }
            : {}),
        },
      };
    }),
  });
  const soleActivityAnalysis = segmentAnalyses.length === 1 ? segmentAnalyses[0] : undefined;
  const soleSwimSummary =
    soleActivityAnalysis?.segment.activity_category === "swim"
      ? soleActivityAnalysis.segment.summary.swim
      : undefined;
  const normalizedSpeed = soleActivityAnalysis?.calculation.normalizedSpeed ?? null;
  const normalizedGradedSpeed = soleActivityAnalysis?.calculation.normalizedGradedSpeed ?? null;
  const efficiencyFactor = soleActivityAnalysis?.calculation.efficiencyFactor ?? null;
  const aerobicDecoupling = soleActivityAnalysis?.calculation.aerobicDecoupling ?? null;
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

  const canonicalActivityCategoryResult = canonicalActivityCategorySchema.safeParse(
    soleActivityAnalysis?.segment.activity_category,
  );
  const [currentActivityCategoryLthr, restingHR] = await Promise.all([
    canonicalActivityCategoryResult.success
      ? getLatestActivityCategoryLthrValue(db, {
          profileId: input.profileId,
          activityCategory: canonicalActivityCategoryResult.data,
          recordedAtLte: activityCompletedAt,
          excludeActivityId: input.activityId,
        })
      : Promise.resolve(null),
    getLatestProfileMetricValue(db, {
      profileId: input.profileId,
      metricType: "resting_hr",
      recordedAtLte: activityCompletedAt,
    }),
  ]);

  const geometry = buildActivityGeometry(records);
  const detectedLTHR =
    soleActivityAnalysis && soleActivityAnalysis.segmentMetadata.hrStream.length > 0
      ? detectLTHR(
          soleActivityAnalysis.segmentMetadata.hrStream,
          soleActivityAnalysis.segmentMetadata.hrTimestamps ??
            soleActivityAnalysis.segmentMetadata.timestamps,
        )
      : null;
  if (summary.maxHeartRate && restingHR) void estimateVO2Max(summary.maxHeartRate, restingHR);

  return {
    activityCompletedAt,
    activityCompletedAtIso,
    detectedLTHR:
      detectedLTHR &&
      (currentActivityCategoryLthr === null || detectedLTHR > currentActivityCategoryLthr)
        ? detectedLTHR
        : null,
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
      normalized_graded_speed_mps: normalizedGradedSpeed || null,
      efficiency_factor: efficiencyFactor || null,
      aerobic_decoupling: aerobicDecoupling || null,
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
