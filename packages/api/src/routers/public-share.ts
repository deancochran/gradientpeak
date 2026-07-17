import {
  activityPlanStructureSchemaV3,
  completedActivitySegmentSchemaV1,
  trainingPlanSchema,
} from "@repo/core";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getRequiredDb } from "../db";
import { createTRPCRouter, publicProcedure } from "../trpc";

const uuidInputSchema = z.object({ id: z.string().uuid() }).strict();
const publicJsonSchema = z.json();

const profileSummarySchema = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().nullable(),
    username: z.string().nullable(),
    avatar_url: z.string().nullable(),
  })
  .strict();

const currentArtifactSchema = z
  .object({
    id: z.string().uuid(),
    digest_algorithm: z.literal("sha256"),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    byte_size: z.number().int().positive(),
    media_type: z.string(),
    format: z.string(),
    original_name: z.string().nullable(),
    availability: z.literal("accepted"),
    first_accepted_at: z.string().datetime({ offset: true }),
  })
  .strict();

const publicActivitySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    notes: z.string().nullable(),
    started_at: z.string().datetime({ offset: true }),
    finished_at: z.string().datetime({ offset: true }),
    elapsed_ms: z.number().int().positive(),
    active_ms: z.number().int().nonnegative().nullable(),
    moving_ms: z.number().int().nonnegative().nullable(),
    timing_coverage: z.enum(["complete", "partial", "unavailable"]),
    distance_meters: z.number().int().nonnegative(),
    elevation_gain_meters: z.number().nullable(),
    calories: z.number().int().nullable(),
    avg_heart_rate: z.number().int().nullable(),
    max_heart_rate: z.number().int().nullable(),
    avg_power: z.number().int().nullable(),
    max_power: z.number().int().nullable(),
    avg_speed_mps: z.number().nullable(),
    max_speed_mps: z.number().nullable(),
    segments: z.array(completedActivitySegmentSchemaV1),
    current_artifact: currentArtifactSchema.nullable(),
    likes_count: z.number().int().nonnegative(),
    owner: profileSummarySchema,
  })
  .strict();

const publicActivityPlanSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    structure: activityPlanStructureSchemaV3,
    structure_hash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
    gps_recording_enabled: z.boolean(),
    template_visibility: z.enum(["private", "followers", "public"]),
    is_system_template: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    owner: profileSummarySchema,
  })
  .strict();

const publicTrainingPlanSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    structure: trainingPlanSchema,
    structure_hash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
    template_visibility: z.enum(["private", "followers", "public"]),
    sessions_per_week_target: z.number().int().nullable(),
    duration_hours: z.number().nullable(),
    is_system_template: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    owner: profileSummarySchema,
  })
  .strict();

type SqlResult = { rows?: unknown[] } | unknown[];
function getRows<T>(result: SqlResult): T[] {
  return (Array.isArray(result) ? result : (result.rows ?? [])) as T[];
}
function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function toNumberOrNull(value: number | string | null) {
  return value === null ? null : Number(value);
}
function ownerFromRow(row: {
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
}) {
  return {
    id: row.owner_id,
    name: row.owner_name,
    username: row.owner_username,
    avatar_url: row.owner_avatar_url,
  };
}

type PublicActivityRow = {
  id: string;
  name: string;
  notes: string | null;
  started_at: Date | string;
  finished_at: Date | string;
  elapsed_ms: number | string;
  active_ms: number | string | null;
  moving_ms: number | string | null;
  timing_coverage: "complete" | "partial" | "unavailable";
  distance_meters: number;
  elevation_gain_meters: number | string | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_power: number | null;
  max_power: number | null;
  avg_speed_mps: number | string | null;
  max_speed_mps: number | string | null;
  segments: unknown;
  current_artifact: unknown;
  likes_count: number | string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
};

type PublicPlanRow = {
  id: string;
  name: string;
  description: string | null;
  notes?: string | null;
  structure: unknown;
  structure_hash: string;
  gps_recording_enabled?: boolean;
  template_visibility: "private" | "followers" | "public";
  sessions_per_week_target?: number | null;
  duration_hours?: number | string | null;
  is_system_template: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
};

export const publicShareRouter = createTRPCRouter({
  activity: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivitySchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicActivityRow>`
        select
          a.id, a.name, a.notes, a.started_at, a.finished_at,
          a.elapsed_ms, a.active_ms, a.moving_ms, a.timing_coverage,
          a.distance_meters, a.elevation_gain_meters, a.calories,
          a.avg_heart_rate, a.max_heart_rate, a.avg_power, a.max_power,
          a.avg_speed_mps, a.max_speed_mps,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'ordinal', s.ordinal, 'role', s.role, 'category', s.category,
              'startOffsetMs', s.start_offset_ms, 'endOffsetMs', s.end_offset_ms,
              'summary', s.summary,
              'source', case when s.source_artifact_id is not null then jsonb_strip_nulls(jsonb_build_object(
                'kind', 'artifact', 'artifactId', s.source_artifact_id,
                'source', jsonb_build_object('standard', ar.format, 'format', ar.format),
                'sessionMessageIndex', s.source_session_index, 'messageIndex', s.source_message_index,
                'rawType', coalesce(s.raw_type_string, s.raw_type_integer::text),
                'rawSport', coalesce(s.raw_sport_string, s.raw_sport_integer::text)
              )) else null end
            ) order by s.ordinal)
            from activity_segments s
            left join activity_artifacts ar on ar.id = s.source_artifact_id
            where s.activity_id = a.id
          ), '[]'::jsonb) as segments,
          (
            select jsonb_build_object(
              'id', ar.id, 'digest_algorithm', ar.digest_algorithm, 'digest', ar.digest,
              'byte_size', ar.byte_size, 'media_type', ar.media_type, 'format', ar.format,
              'original_name', ar.original_name, 'availability', ar.availability,
              'first_accepted_at', ar.first_accepted_at
            )
            from activity_artifact_links aal
            join activity_artifacts ar on ar.id = aal.artifact_id and ar.availability = 'accepted'
            where aal.activity_id = a.id and aal.role = 'source' and aal.is_current = true
            limit 1
          ) as current_artifact,
          (select count(*) from likes l where l.entity_type = 'activity' and l.entity_id = a.id) as likes_count,
          p.id as owner_id, p.full_name as owner_name, p.username as owner_username,
          p.avatar_url as owner_avatar_url
        from activities a
        left join profiles p on p.id = a.profile_id
        where a.id = ${input.id}::uuid and a.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicActivityRow>(result)[0];
      if (!row) return null;
      const artifact = row.current_artifact
        ? (() => {
            const current = row.current_artifact as Record<string, unknown>;
            return {
              id: current.id,
              digest_algorithm: current.digest_algorithm,
              digest: current.digest,
              byte_size: Number(current.byte_size),
              media_type: current.media_type,
              format: current.format,
              original_name: current.original_name,
              availability: current.availability,
              first_accepted_at: toIsoString(
                (row.current_artifact as { first_accepted_at: Date | string }).first_accepted_at,
              ),
            };
          })()
        : null;
      return publicActivitySchema.parse({
        id: row.id,
        name: row.name,
        notes: row.notes,
        started_at: toIsoString(row.started_at),
        finished_at: toIsoString(row.finished_at),
        elapsed_ms: Number(row.elapsed_ms),
        active_ms: toNumberOrNull(row.active_ms),
        moving_ms: toNumberOrNull(row.moving_ms),
        timing_coverage: row.timing_coverage,
        distance_meters: row.distance_meters,
        elevation_gain_meters: toNumberOrNull(row.elevation_gain_meters),
        calories: row.calories,
        avg_heart_rate: row.avg_heart_rate,
        max_heart_rate: row.max_heart_rate,
        avg_power: row.avg_power,
        max_power: row.max_power,
        avg_speed_mps: toNumberOrNull(row.avg_speed_mps),
        max_speed_mps: toNumberOrNull(row.max_speed_mps),
        segments: row.segments,
        current_artifact: artifact,
        likes_count: Number(row.likes_count ?? 0),
        owner: ownerFromRow(row),
      });
    }),

  workout: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivityPlanSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicPlanRow>`
        select ap.id, ap.name, ap.description, ap.notes, ap.structure, ap.structure_hash,
          ap.gps_recording_enabled, ap.template_visibility, ap.is_system_template,
          ap.created_at, ap.updated_at,
          p.id as owner_id, p.full_name as owner_name, p.username as owner_username,
          p.avatar_url as owner_avatar_url
        from activity_plans ap
        left join profiles p on p.id = ap.profile_id
        where ap.id = ${input.id}::uuid and ap.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicPlanRow>(result)[0];
      if (!row) return null;
      return publicActivityPlanSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        notes: row.notes ?? null,
        structure: publicJsonSchema.parse(row.structure),
        structure_hash: row.structure_hash,
        gps_recording_enabled: row.gps_recording_enabled,
        template_visibility: row.template_visibility,
        is_system_template: row.is_system_template,
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        owner: ownerFromRow(row),
      });
    }),

  trainingPlan: publicProcedure
    .input(uuidInputSchema)
    .output(publicTrainingPlanSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicPlanRow>`
        select tp.id, tp.name, tp.description, tp.structure, tp.structure_hash,
          tp.template_visibility, tp.sessions_per_week_target, tp.duration_hours,
          tp.is_system_template, tp.created_at, tp.updated_at,
          p.id as owner_id, p.full_name as owner_name, p.username as owner_username,
          p.avatar_url as owner_avatar_url
        from training_plans tp
        left join profiles p on p.id = tp.profile_id
        where tp.id = ${input.id}::uuid and tp.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicPlanRow>(result)[0];
      if (!row) return null;
      return publicTrainingPlanSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        structure: publicJsonSchema.parse(row.structure),
        structure_hash: row.structure_hash,
        template_visibility: row.template_visibility,
        sessions_per_week_target: row.sessions_per_week_target ?? null,
        is_system_template: row.is_system_template,
        duration_hours: toNumberOrNull(row.duration_hours ?? null),
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        owner: ownerFromRow(row),
      });
    }),
});
