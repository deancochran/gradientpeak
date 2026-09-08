import { activities, activityArtifactLinks, activityArtifacts, activitySegments } from "@repo/db";
import { sql } from "drizzle-orm";
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

function rowsFrom(result: unknown): unknown[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows;
  }
  throw new Error("Accepted activity artifact query returned an invalid result");
}

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
  db: Pick<DrizzleQueryExecutor, "execute">,
  input: {
    profileId: string;
    limit: number;
    cursor?: AcceptedActivityArtifactCursor;
  },
): Promise<ProfileAcceptedActivityArtifact[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new Error("Accepted activity artifact page size must be between 1 and 100");
  }
  const result = await db.execute(sql`
    select
      ${activities.id} as "activityId",
      ${activities.started_at} as "startedAt",
      ${activities.finished_at} as "finishedAt",
      ${activities.segments_revision} as "segmentsRevision",
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
      ) as artifacts
    from ${activities}
    inner join ${activityArtifactLinks}
      on ${activityArtifactLinks.activity_id} = ${activities.id}
      and ${activityArtifactLinks.profile_id} = ${activities.profile_id}
    inner join ${activityArtifacts}
      on ${activityArtifacts.id} = ${activityArtifactLinks.artifact_id}
      and ${activityArtifacts.profile_id} = ${activities.profile_id}
    where ${activities.profile_id} = ${input.profileId}
      and ${activityArtifactLinks.profile_id} = ${input.profileId}
      and ${activityArtifacts.profile_id} = ${input.profileId}
      and ${activityArtifactLinks.role} = 'source'
      and ${activityArtifactLinks.is_current} = true
      and ${activityArtifacts.availability} = 'accepted'
      and ${activityArtifacts.deletion_requested_at} is null
      and ${activityArtifacts.deleted_at} is null
      and (
        ${input.cursor === undefined}
        or ${activities.started_at} > ${input.cursor?.startedAt ?? new Date(0)}
        or (
          ${activities.started_at} = ${input.cursor?.startedAt ?? new Date(0)}
          and ${activities.id} > ${input.cursor?.activityId ?? "00000000-0000-0000-0000-000000000000"}
        )
      )
    group by ${activities.id}, ${activities.started_at}, ${activities.finished_at}, ${activities.segments_revision}
    order by ${activities.started_at}, ${activities.id}
    limit ${input.limit}
  `);

  return rowsFrom(result).map((raw) => {
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
  db: Pick<DrizzleQueryExecutor, "execute">,
  input: { profileId: string; activityId: string; artifactId: string },
): Promise<CurrentAcceptedActivitySourceState | null> {
  const result = await db.execute(sql`
    select
      ${activities.started_at} as "startedAt",
      ${activities.finished_at} as "finishedAt",
      ${activities.segments_revision} as "segmentsRevision",
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
      ) as segments
    from ${activities}
    inner join ${activityArtifactLinks}
      on ${activityArtifactLinks.activity_id} = ${activities.id}
      and ${activityArtifactLinks.profile_id} = ${activities.profile_id}
    inner join ${activityArtifacts}
      on ${activityArtifacts.id} = ${activityArtifactLinks.artifact_id}
      and ${activityArtifacts.profile_id} = ${activities.profile_id}
    left join ${activitySegments}
      on ${activitySegments.activity_id} = ${activities.id}
      and ${activitySegments.profile_id} = ${activities.profile_id}
    where ${activities.id} = ${input.activityId}
      and ${activities.profile_id} = ${input.profileId}
      and ${activityArtifactLinks.activity_id} = ${input.activityId}
      and ${activityArtifactLinks.artifact_id} = ${input.artifactId}
      and ${activityArtifactLinks.profile_id} = ${input.profileId}
      and ${activityArtifactLinks.role} = 'source'
      and ${activityArtifactLinks.is_current} = true
      and ${activityArtifacts.id} = ${input.artifactId}
      and ${activityArtifacts.profile_id} = ${input.profileId}
      and ${activityArtifacts.availability} = 'accepted'
      and ${activityArtifacts.deletion_requested_at} is null
      and ${activityArtifacts.deleted_at} is null
    group by ${activities.id}, ${activities.started_at}, ${activities.finished_at}, ${activities.segments_revision}
  `);
  const rows = rowsFrom(result);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error("Accepted activity source state was ambiguous");
  return currentSourceRowSchema.parse(rows[0]);
}
