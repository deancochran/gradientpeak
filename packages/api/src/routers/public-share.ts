import { sql } from "drizzle-orm";
import { z } from "zod";

import { getRequiredDb } from "../db";
import { createTRPCRouter, publicProcedure } from "../trpc";

const uuidInputSchema = z.object({ id: z.string().uuid() }).strict();

const profileSummarySchema = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().nullable(),
    username: z.string().nullable(),
    avatar_url: z.string().nullable(),
  })
  .strict();

const publicActivitySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    notes: z.string().nullable(),
    started_at: z.string(),
    finished_at: z.string(),
    duration_seconds: z.number().int().nonnegative(),
    moving_seconds: z.number().int().nonnegative(),
    distance_meters: z.number().int().nonnegative(),
    elevation_gain_meters: z.number().nullable(),
    calories: z.number().int().nullable(),
    avg_heart_rate: z.number().int().nullable(),
    max_heart_rate: z.number().int().nullable(),
    avg_power: z.number().int().nullable(),
    max_power: z.number().int().nullable(),
    avg_speed_mps: z.number().nullable(),
    max_speed_mps: z.number().nullable(),
    likes_count: z.number().int().nonnegative(),
    owner: profileSummarySchema,
  })
  .strict();

const publicJsonSchema = z.json();

const publicActivityPlanSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    activity_category: z.string(),
    structure: publicJsonSchema,
    version: z.string(),
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
    structure: publicJsonSchema,
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
  if (value === null) return null;
  return Number(value);
}

function toPublicJson(value: unknown) {
  return publicJsonSchema.parse(value);
}

type PublicActivityRow = {
  id: string;
  name: string;
  type: string;
  notes: string | null;
  started_at: Date | string;
  finished_at: Date | string;
  duration_seconds: number;
  moving_seconds: number;
  distance_meters: number;
  elevation_gain_meters: number | string | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_power: number | null;
  max_power: number | null;
  avg_speed_mps: number | string | null;
  max_speed_mps: number | string | null;
  likes_count: number | string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
};

type PublicActivityPlanRow = {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  activity_category: string;
  structure: unknown;
  version: string;
  is_system_template: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
};

type PublicTrainingPlanRow = {
  id: string;
  name: string;
  description: string | null;
  structure: unknown;
  sessions_per_week_target: number | null;
  duration_hours: number | string | null;
  is_system_template: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  owner_id: string | null;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
};

function ownerFromRow(
  row: Pick<PublicActivityRow, "owner_id" | "owner_name" | "owner_username" | "owner_avatar_url">,
) {
  return {
    id: row.owner_id,
    name: row.owner_name,
    username: row.owner_username,
    avatar_url: row.owner_avatar_url,
  };
}

export const publicShareRouter = createTRPCRouter({
  activity: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivitySchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicActivityRow>`
        select
          a.id,
          a.name,
          a.type,
          a.notes,
          a.started_at,
          a.finished_at,
          a.duration_seconds,
          a.moving_seconds,
          a.distance_meters,
          a.elevation_gain_meters,
          a.calories,
          a.avg_heart_rate,
          a.max_heart_rate,
          a.avg_power,
          a.max_power,
          a.avg_speed_mps,
          a.max_speed_mps,
          (select count(*) from likes l where l.entity_type = 'activity' and l.entity_id = a.id) as likes_count,
          p.id as owner_id,
          p.full_name as owner_name,
          p.username as owner_username,
          p.avatar_url as owner_avatar_url
        from activities a
        left join profiles p on p.id = a.profile_id
        where a.id = ${input.id}::uuid
          and a.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicActivityRow>(result)[0];
      if (!row) return null;

      return publicActivitySchema.parse({
        id: row.id,
        name: row.name,
        type: row.type,
        notes: row.notes,
        started_at: toIsoString(row.started_at),
        finished_at: toIsoString(row.finished_at),
        duration_seconds: row.duration_seconds,
        moving_seconds: row.moving_seconds,
        distance_meters: row.distance_meters,
        elevation_gain_meters: toNumberOrNull(row.elevation_gain_meters),
        calories: row.calories,
        avg_heart_rate: row.avg_heart_rate,
        max_heart_rate: row.max_heart_rate,
        avg_power: row.avg_power,
        max_power: row.max_power,
        avg_speed_mps: toNumberOrNull(row.avg_speed_mps),
        max_speed_mps: toNumberOrNull(row.max_speed_mps),
        likes_count: Number(row.likes_count ?? 0),
        owner: ownerFromRow(row),
      });
    }),

  workout: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivityPlanSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicActivityPlanRow>`
        select
          ap.id,
          ap.name,
          ap.description,
          ap.notes,
          ap.activity_category,
          ap.structure,
          ap.version,
          ap.is_system_template,
          ap.created_at,
          ap.updated_at,
          p.id as owner_id,
          p.full_name as owner_name,
          p.username as owner_username,
          p.avatar_url as owner_avatar_url
        from activity_plans ap
        left join profiles p on p.id = ap.profile_id
        where ap.id = ${input.id}::uuid
          and ap.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicActivityPlanRow>(result)[0];
      if (!row) return null;

      return publicActivityPlanSchema.parse({
        ...row,
        structure: toPublicJson(row.structure),
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        owner: ownerFromRow(row),
      });
    }),

  trainingPlan: publicProcedure
    .input(uuidInputSchema)
    .output(publicTrainingPlanSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicTrainingPlanRow>`
        select
          tp.id,
          tp.name,
          tp.description,
          tp.structure,
          tp.sessions_per_week_target,
          tp.duration_hours,
          tp.is_system_template,
          tp.created_at,
          tp.updated_at,
          p.id as owner_id,
          p.full_name as owner_name,
          p.username as owner_username,
          p.avatar_url as owner_avatar_url
        from training_plans tp
        left join profiles p on p.id = tp.profile_id
        where tp.id = ${input.id}::uuid
          and tp.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicTrainingPlanRow>(result)[0];
      if (!row) return null;

      return publicTrainingPlanSchema.parse({
        ...row,
        structure: toPublicJson(row.structure),
        duration_hours: toNumberOrNull(row.duration_hours),
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        owner: ownerFromRow(row),
      });
    }),
});
