import {
  ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS,
  type ActivityCardEffortLevel,
  type ActivityCardEffortProfile,
  type ActivityCardEffortSample,
  activityCardEffortProfileSchema,
  canonicalActivityCategorySchema,
} from "@repo/core";
import { parseActivityFile } from "@repo/core/server/activity-files";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySegments,
  follows,
} from "@repo/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import type { ActivityArtifactStorage } from "../activity-file-ingestion/artifact-storage";
import { toActivityCardEffortProfile } from "./activity-display";
import { canViewActivityVisibility } from "./activity-reads";

const ACTIVITY_FILE_BUCKET = "activity-files";
export const PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS = 100_000;
export const PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_SEGMENTS = 64;

const publicEffortRecordSchema = z
  .object({
    timestamp: z.date().optional(),
    power: z.number().finite().nonnegative().optional(),
    heartRate: z.number().finite().positive().optional(),
    speed: z.number().finite().nonnegative().optional(),
    sessionMessageIndex: z.number().int().nonnegative().optional(),
  })
  .strip();

const parsedEffortSourceEnvelopeSchema = z
  .object({
    records: z.unknown(),
  })
  .passthrough();

const maximumOffsetMs = ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS * 1_000;
const publicEffortSegmentSchema = z.strictObject({
  activityCategory: canonicalActivityCategorySchema,
  startOffsetMs: z.number().int().nonnegative().max(maximumOffsetMs),
  endOffsetMs: z.number().int().positive().max(maximumOffsetMs),
  sourceSessionIndex: z.number().int().nonnegative().nullable(),
});
const publicEffortSegmentsSchema = z
  .array(publicEffortSegmentSchema)
  .min(1)
  .max(PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_SEGMENTS)
  .superRefine((segments, context) => {
    const sourceSessionIndexes = new Set<number>();
    for (let index = 0; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      if (!current) continue;
      if (current.endOffsetMs <= current.startOffsetMs) {
        context.addIssue({
          code: "custom",
          path: [index, "endOffsetMs"],
          message: "Activity effort segments must have a positive duration",
        });
      }
      if (previous && current.startOffsetMs < previous.endOffsetMs) {
        context.addIssue({
          code: "custom",
          path: [index, "startOffsetMs"],
          message: "Activity effort segments must be ordered and non-overlapping",
        });
      }
      if (current.sourceSessionIndex !== null) {
        if (sourceSessionIndexes.has(current.sourceSessionIndex)) {
          context.addIssue({
            code: "custom",
            path: [index, "sourceSessionIndex"],
            message: "Activity effort source-session indexes must be unique",
          });
        }
        sourceSessionIndexes.add(current.sourceSessionIndex);
      }
    }
  });

type PublicEffortRecord = z.infer<typeof publicEffortRecordSchema>;
type PublicEffortSegment = z.infer<typeof publicEffortSegmentSchema>;
type SignalKind = "power" | "speed" | "heart_rate";
type TimedEffortRecord = PublicEffortRecord & { elapsedSeconds: number };

function parseBoundedRecords(value: unknown): PublicEffortRecord[] | null {
  const envelope = parsedEffortSourceEnvelopeSchema.safeParse(value);
  if (!envelope.success || !Array.isArray(envelope.data.records)) return null;
  if (
    envelope.data.records.length < 2 ||
    envelope.data.records.length > PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS
  ) {
    return null;
  }
  const parsed = z.array(publicEffortRecordSchema).safeParse(envelope.data.records);
  return parsed.success ? parsed.data : null;
}

function signalValue(record: PublicEffortRecord, kind: SignalKind): number | undefined {
  if (kind === "power") return record.power;
  if (kind === "speed") return record.speed;
  return record.heartRate;
}

function signalPreference(segment: PublicEffortSegment): readonly SignalKind[] {
  if (segment.activityCategory === "bike") return ["power", "heart_rate"];
  if (segment.activityCategory === "run" || segment.activityCategory === "swim") {
    return ["speed", "heart_rate"];
  }
  return ["heart_rate"];
}

function hasComparableSignal(records: readonly TimedEffortRecord[], kind: SignalKind): boolean {
  let count = 0;
  for (const record of records) {
    if (signalValue(record, kind) !== undefined) count += 1;
  }
  return count >= 2;
}

/**
 * Selects one signal that is meaningful and present in every segment. A mixed
 * activity therefore uses a shared signal such as heart rate or has no profile;
 * power in one segment is never ranked against speed in another.
 */
function selectActivityWideSignal(
  segmentRecords: readonly (readonly TimedEffortRecord[])[],
  segments: readonly PublicEffortSegment[],
): SignalKind | null {
  const firstSegment = segments[0];
  if (!firstSegment || segmentRecords.length !== segments.length) return null;
  const preferences = segments.every(
    (segment) => segment.activityCategory === firstSegment.activityCategory,
  )
    ? signalPreference(firstSegment)
    : (["heart_rate"] as const);
  for (const kind of preferences) {
    if (
      segments.every(
        (segment, index) =>
          signalPreference(segment).includes(kind) &&
          hasComparableSignal(segmentRecords[index] ?? [], kind),
      )
    ) {
      return kind;
    }
  }
  return null;
}

function ordinalEffortLevel(
  value: number,
  minimum: number,
  maximum: number,
): ActivityCardEffortLevel {
  if (maximum === minimum) return "steady";
  const relativePosition = (value - minimum) / (maximum - minimum);
  if (relativePosition < 0.25) return "lowest";
  if (relativePosition < 0.5) return "lower";
  if (relativePosition < 0.75) return "higher";
  return "highest";
}

function segmentForElapsedTime(
  segments: readonly PublicEffortSegment[],
  elapsedMs: number,
  startingIndex: number,
): { index: number; nextStartingIndex: number } | null {
  let index = startingIndex;
  while (index < segments.length - 1 && elapsedMs >= (segments[index]?.endOffsetMs ?? 0)) {
    index += 1;
  }
  const segment = segments[index];
  if (!segment) return null;
  const includeEnd = index === segments.length - 1;
  const belongs =
    elapsedMs >= segment.startOffsetMs &&
    (includeEnd ? elapsedMs <= segment.endOffsetMs : elapsedMs < segment.endOffsetMs);
  return belongs ? { index, nextStartingIndex: index } : null;
}

/**
 * Converts bounded activity records into threshold-free ordinal levels using one
 * signal and one scale across the entire activity. Records are assigned to segments
 * in one pass; no athlete thresholds or target context are inputs. If every segment
 * cannot be compared using the same signal, no profile is returned.
 */
export function derivePublicActivityEffortProfile(input: {
  activityStartedAt: Date;
  records: readonly PublicEffortRecord[];
  segments: readonly PublicEffortSegment[];
}): ActivityCardEffortProfile | null {
  if (
    input.records.length < 2 ||
    input.records.length > PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS
  ) {
    return null;
  }
  const parsedSegments = publicEffortSegmentsSchema.safeParse(input.segments);
  if (!parsedSegments.success) return null;
  const activityStartedAtMs = input.activityStartedAt.getTime();
  if (!Number.isFinite(activityStartedAtMs)) return null;

  const segmentRecords = parsedSegments.data.map(() => [] as TimedEffortRecord[]);
  const segmentIndexBySourceSession = new Map<number, number>();
  for (const [index, segment] of parsedSegments.data.entries()) {
    if (segment.sourceSessionIndex !== null) {
      segmentIndexBySourceSession.set(segment.sourceSessionIndex, index);
    }
  }

  let previousTimestampMs = Number.NEGATIVE_INFINITY;
  let elapsedSegmentCursor = 0;
  for (const record of input.records) {
    const timestampMs = record.timestamp?.getTime();
    if (timestampMs === undefined || !Number.isFinite(timestampMs)) continue;
    if (timestampMs < previousTimestampMs) return null;
    previousTimestampMs = timestampMs;
    const elapsedMs = timestampMs - activityStartedAtMs;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > maximumOffsetMs) continue;

    const sourceSessionIndex = record.sessionMessageIndex;
    const indexedSegment =
      sourceSessionIndex === undefined
        ? undefined
        : segmentIndexBySourceSession.get(sourceSessionIndex);
    const elapsedMatch =
      indexedSegment === undefined
        ? segmentForElapsedTime(parsedSegments.data, elapsedMs, elapsedSegmentCursor)
        : null;
    const segmentIndex = indexedSegment ?? elapsedMatch?.index;
    if (elapsedMatch) elapsedSegmentCursor = elapsedMatch.nextStartingIndex;
    if (segmentIndex === undefined) continue;
    segmentRecords[segmentIndex]?.push({
      ...record,
      elapsedSeconds: elapsedMs / 1_000,
    });
  }

  const signal = selectActivityWideSignal(segmentRecords, parsedSegments.data);
  if (!signal) return null;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const records of segmentRecords) {
    for (const record of records) {
      const value = signalValue(record, signal);
      if (value === undefined) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;

  const samples: ActivityCardEffortSample[] = [];
  for (const records of segmentRecords) {
    for (const record of records) {
      const value = signalValue(record, signal);
      if (value === undefined) continue;
      const previous = samples.at(-1);
      if (previous && record.elapsedSeconds <= previous.elapsedSeconds) return null;
      samples.push({
        elapsedSeconds: record.elapsedSeconds,
        effortLevel: ordinalEffortLevel(value, minimum, maximum),
      });
    }
  }
  return toActivityCardEffortProfile(samples);
}

export const publicActivityEffortProfileResponseSchema = activityCardEffortProfileSchema.nullable();

type CacheLookup = { hit: true; value: ActivityCardEffortProfile | null } | { hit: false };

export type PublicActivityEffortProfileCache = {
  get(key: string): CacheLookup;
  set(key: string, value: ActivityCardEffortProfile | null): void;
};

/** Stores only the strict public projection, never parsed records or raw measurements. */
export function createPublicActivityEffortProfileCache(options?: {
  maximumEntries?: number;
  ttlMs?: number;
  now?: () => number;
}): PublicActivityEffortProfileCache {
  const maximumEntries = options?.maximumEntries ?? 256;
  const ttlMs = options?.ttlMs ?? 5 * 60_000;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, { expiresAt: number; value: ActivityCardEffortProfile | null }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return { hit: false };
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return { hit: false };
      }
      entries.delete(key);
      entries.set(key, entry);
      return { hit: true, value: entry.value };
    },
    set(key, value) {
      if (maximumEntries <= 0 || ttlMs <= 0) return;
      const safeValue = publicActivityEffortProfileResponseSchema.parse(value);
      entries.delete(key);
      entries.set(key, { expiresAt: now() + ttlMs, value: safeValue });
      while (entries.size > maximumEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== "string") break;
        entries.delete(oldestKey);
      }
    },
  };
}

const sharedPublicEffortProfileCache = createPublicActivityEffortProfileCache();

/**
 * Re-checks access on every call, then caches only a viewer-partitioned,
 * threshold-free projection. Raw streams never enter the cache.
 */
export async function getPublicActivityEffortProfile(input: {
  activityId: string;
  viewerId: string;
  db: ReturnType<typeof getRequiredDb>;
  artifactStorage: ActivityArtifactStorage;
  cache?: PublicActivityEffortProfileCache;
}): Promise<ActivityCardEffortProfile | null> {
  const [activity] = await input.db
    .select({
      id: activities.id,
      profileId: activities.profile_id,
      contentVisibility: activities.content_visibility,
      startedAt: activities.started_at,
      segmentsRevision: activities.segments_revision,
    })
    .from(activities)
    .where(eq(activities.id, input.activityId))
    .limit(1);
  if (!activity) return null;
  if (activity.startedAt === null) return null;

  const isAcceptedFollower =
    activity.contentVisibility === "followers" && activity.profileId !== input.viewerId
      ? Boolean(
          (
            await input.db
              .select({ followerId: follows.follower_id })
              .from(follows)
              .where(
                and(
                  eq(follows.follower_id, input.viewerId),
                  eq(follows.following_id, activity.profileId),
                  eq(follows.status, "accepted"),
                ),
              )
              .limit(1)
          )[0],
        )
      : false;
  if (
    !canViewActivityVisibility({
      ownerId: activity.profileId,
      viewerId: input.viewerId,
      visibility: activity.contentVisibility,
      isAcceptedFollower,
    })
  ) {
    return null;
  }

  const [artifactRows, segmentRows] = await Promise.all([
    input.db
      .select({
        id: activityArtifacts.id,
        bucket: activityArtifacts.bucket,
        path: activityArtifacts.path,
        format: activityArtifacts.format,
        byteSize: activityArtifacts.byte_size,
      })
      .from(activityArtifactLinks)
      .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
      .where(
        and(
          eq(activityArtifactLinks.activity_id, activity.id),
          eq(activityArtifactLinks.role, "source"),
          eq(activityArtifactLinks.is_current, true),
          eq(activityArtifacts.availability, "accepted"),
        ),
      )
      .limit(1),
    input.db
      .select({
        activityCategory: activitySegments.activity_category,
        startOffsetMs: activitySegments.start_offset_ms,
        endOffsetMs: activitySegments.end_offset_ms,
        sourceSessionIndex: activitySegments.source_session_index,
      })
      .from(activitySegments)
      .where(
        and(
          eq(activitySegments.activity_id, activity.id),
          eq(activitySegments.profile_id, activity.profileId),
          eq(activitySegments.segment_revision, activity.segmentsRevision),
          eq(activitySegments.role, "activity"),
        ),
      )
      .orderBy(asc(activitySegments.ordinal))
      .limit(PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_SEGMENTS + 1),
  ]);
  const artifact = artifactRows[0];
  if (!artifact || segmentRows.length === 0) return null;

  const cache = input.cache ?? sharedPublicEffortProfileCache;
  const cacheKey = [
    input.viewerId,
    activity.id,
    String(activity.segmentsRevision),
    artifact.id,
    String(artifact.byteSize),
  ].join(":");
  const cached = cache.get(cacheKey);
  if (cached.hit) return cached.value;
  const cacheResult = (value: ActivityCardEffortProfile | null) => {
    cache.set(cacheKey, value);
    return value;
  };

  if (
    artifact.bucket !== ACTIVITY_FILE_BUCKET ||
    !Number.isSafeInteger(artifact.byteSize) ||
    artifact.byteSize <= 0 ||
    artifact.byteSize > PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_FILE_BYTES ||
    segmentRows.length > PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_SEGMENTS
  ) {
    return cacheResult(null);
  }
  const fileType = z.enum(["fit", "gpx", "tcx"]).safeParse(artifact.format);
  const segments = publicEffortSegmentsSchema.safeParse(segmentRows);
  if (!fileType.success || !segments.success) return cacheResult(null);

  try {
    const object = await input.artifactStorage.readObjectBounded({
      bucket: ACTIVITY_FILE_BUCKET,
      path: artifact.path,
      maxBytes: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_FILE_BYTES,
    });
    if (object.data.byteLength !== artifact.byteSize) return cacheResult(null);
    const records = parseBoundedRecords(
      parseActivityFile({
        data: object.data,
        fileName: artifact.path,
        fileType: fileType.data,
        limits: { maxRecords: PUBLIC_ACTIVITY_EFFORT_PROFILE_MAX_RECORDS },
      }),
    );
    if (!records) return cacheResult(null);
    return cacheResult(
      publicActivityEffortProfileResponseSchema.parse(
        derivePublicActivityEffortProfile({
          activityStartedAt: activity.startedAt,
          records,
          segments: segments.data,
        }),
      ),
    );
  } catch {
    return cacheResult(null);
  }
}
