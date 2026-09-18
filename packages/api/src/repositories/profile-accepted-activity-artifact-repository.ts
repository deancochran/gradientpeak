import { activities, activityArtifactLinks, activityArtifacts, activitySegments } from "@repo/db";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../db";

const artifactFormatSchema = z.enum(["fit", "gpx", "tcx"]);
const artifactSchema = z
  .object({
    artifactId: z.string().uuid(),
    bucket: z.string().min(1),
    byteSize: z.coerce.number().int().positive(),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    format: artifactFormatSchema,
    mediaType: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();

const pageRowSchema = z
  .object({
    activityId: z.string().uuid(),
    artifacts: z.array(artifactSchema),
    finishedAt: z.coerce.date(),
    segmentsRevision: z.coerce.number().int().positive(),
    startedAt: z.coerce.date(),
  })
  .strict();

const sourceSegmentSchema = z
  .object({
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]).nullable(),
    endOffsetMs: z.coerce.number().int().positive(),
    id: z.string().uuid(),
    ordinal: z.coerce.number().int().nonnegative(),
    rawSportInteger: z.coerce.number().int().nullable(),
    rawSportString: z.string().nullable(),
    rawSubSportInteger: z.coerce.number().int().nullable(),
    rawSubSportString: z.string().nullable(),
    rawTypeInteger: z.coerce.number().int().nullable(),
    rawTypeString: z.string().nullable(),
    role: z.enum(["activity", "transition", "rest", "unknown"]),
    segmentRevision: z.coerce.number().int().positive(),
    sourceArtifactId: z.string().uuid().nullable(),
    sourceMessageIndex: z.coerce.number().int().nonnegative().nullable(),
    sourceSessionIndex: z.coerce.number().int().nonnegative().nullable(),
    startOffsetMs: z.coerce.number().int().nonnegative(),
  })
  .strict();

const currentSourceRowSchema = z
  .object({
    finishedAt: z.coerce.date(),
    segments: z.array(sourceSegmentSchema),
    segmentsRevision: z.coerce.number().int().positive(),
    startedAt: z.coerce.date(),
  })
  .strict();

export interface AcceptedActivityArtifactCursor {
  activityId: string;
  startedAt: Date;
}

export interface ProfileAcceptedActivityArtifact {
  activityId: string;
  artifactId: string;
  bucket: string;
  byteSize: number;
  digest: string;
  finishedAt: Date;
  format: z.infer<typeof artifactFormatSchema>;
  mediaType: string;
  path: string;
  segmentsRevision: number;
  startedAt: Date;
}

/** Reads unique activities through their profile-owned, current, accepted source artifact. */
export async function listProfileCurrentAcceptedActivityArtifacts(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    limit: number;
    cursor?: AcceptedActivityArtifactCursor;
  },
): Promise<ProfileAcceptedActivityArtifact[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new Error("Accepted activity artifact page size must be between 1 and 100");
  }
  const cursorCondition = input.cursor
    ? or(
        gt(activities.started_at, input.cursor.startedAt),
        and(
          eq(activities.started_at, input.cursor.startedAt),
          gt(activities.id, input.cursor.activityId),
        ),
      )
    : undefined;
  const rows = await db
    .select({
      activityId: activities.id,
      startedAt: activities.started_at,
      finishedAt: activities.finished_at,
      segmentsRevision: activities.segments_revision,
      artifacts: sql`
        jsonb_agg(
        jsonb_build_object(
          'artifactId', ${activityArtifacts.id},
          'bucket', ${activityArtifacts.bucket},
          'byteSize', ${activityArtifacts.byte_size},
          'digest', ${activityArtifacts.digest},
          'format', ${activityArtifacts.format},
          'mediaType', ${activityArtifacts.media_type},
          'path', ${activityArtifacts.path}
        ) order by ${activityArtifactLinks.ordinal}, ${activityArtifactLinks.id}
      )`.as("artifacts"),
    })
    .from(activities)
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, activities.id),
        eq(activityArtifactLinks.profile_id, activities.profile_id),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activities.profile_id),
      ),
    )
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        eq(activityArtifactLinks.profile_id, input.profileId),
        eq(activityArtifacts.profile_id, input.profileId),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
        eq(activityArtifacts.availability, "accepted"),
        isNull(activityArtifacts.deletion_requested_at),
        isNull(activityArtifacts.deleted_at),
        cursorCondition,
      ),
    )
    .groupBy(
      activities.id,
      activities.started_at,
      activities.finished_at,
      activities.segments_revision,
    )
    .orderBy(asc(activities.started_at), asc(activities.id))
    .limit(input.limit);

  return rows.map((raw) => {
    const row = pageRowSchema.parse(raw);
    if (row.artifacts.length !== 1) {
      throw new Error("Activity must have exactly one current accepted source artifact");
    }
    const artifact = row.artifacts[0];
    if (!artifact) throw new Error("Current accepted source artifact was omitted");
    const { artifacts: _artifacts, ...activity } = row;
    return { ...activity, ...artifact };
  });
}

export interface CurrentAcceptedActivitySourceState {
  finishedAt: Date;
  segments: z.infer<typeof sourceSegmentSchema>[];
  segmentsRevision: number;
  startedAt: Date;
}

/** Revalidates the exact accepted source and its immutable current segment identities. */
export async function readCurrentAcceptedActivitySourceState(
  db: DrizzleQueryExecutor,
  input: { profileId: string; activityId: string; artifactId: string },
): Promise<CurrentAcceptedActivitySourceState | null> {
  const rows = await db
    .select({
      startedAt: activities.started_at,
      finishedAt: activities.finished_at,
      segmentsRevision: activities.segments_revision,
      segments: sql`
        coalesce(
        jsonb_agg(
          jsonb_build_object(
            'activityCategory', ${activitySegments.activity_category},
            'endOffsetMs', ${activitySegments.end_offset_ms},
            'id', ${activitySegments.id},
            'ordinal', ${activitySegments.ordinal},
            'rawSportInteger', ${activitySegments.raw_sport_integer},
            'rawSportString', ${activitySegments.raw_sport_string},
            'rawSubSportInteger', ${activitySegments.raw_sub_sport_integer},
            'rawSubSportString', ${activitySegments.raw_sub_sport_string},
            'rawTypeInteger', ${activitySegments.raw_type_integer},
            'rawTypeString', ${activitySegments.raw_type_string},
            'role', ${activitySegments.role},
            'segmentRevision', ${activitySegments.segment_revision},
            'sourceArtifactId', ${activitySegments.source_artifact_id},
            'sourceMessageIndex', ${activitySegments.source_message_index},
            'sourceSessionIndex', ${activitySegments.source_session_index},
            'startOffsetMs', ${activitySegments.start_offset_ms}
          ) order by ${activitySegments.ordinal}
        ) filter (where ${activitySegments.id} is not null),
        '[]'::jsonb
      )`.as("segments"),
    })
    .from(activities)
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, activities.id),
        eq(activityArtifactLinks.profile_id, activities.profile_id),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activities.profile_id),
      ),
    )
    .leftJoin(
      activitySegments,
      and(
        eq(activitySegments.activity_id, activities.id),
        eq(activitySegments.profile_id, activities.profile_id),
      ),
    )
    .where(
      and(
        eq(activities.id, input.activityId),
        eq(activities.profile_id, input.profileId),
        eq(activityArtifactLinks.activity_id, input.activityId),
        eq(activityArtifactLinks.artifact_id, input.artifactId),
        eq(activityArtifactLinks.profile_id, input.profileId),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
        eq(activityArtifacts.id, input.artifactId),
        eq(activityArtifacts.profile_id, input.profileId),
        eq(activityArtifacts.availability, "accepted"),
        isNull(activityArtifacts.deletion_requested_at),
        isNull(activityArtifacts.deleted_at),
      ),
    )
    .groupBy(
      activities.id,
      activities.started_at,
      activities.finished_at,
      activities.segments_revision,
    );
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error("Accepted activity source state was ambiguous");
  return currentSourceRowSchema.parse(rows[0]);
}
