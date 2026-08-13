import { activityPlanStructureSchema, trainingPlanSchema } from "@repo/core";
import { compileActivityPlan } from "@repo/core/activity-plan";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getRequiredDb } from "../db";
import { createTRPCRouter, publicProcedure } from "../trpc";

const uuidInputSchema = z.object({ id: z.string().uuid() }).strict();

const profileSummarySchema = z.strictObject({
  name: z.string().nullable(),
  username: z.string().nullable(),
});

const publicActivityArtifactRowSchema = z.looseObject({
  format: z.string(),
  original_name: z.string().nullable(),
});

export const publicActivityShareSchema = z.strictObject({
  id: z.string().uuid(),
  notes: z.string().nullable(),
  owner: profileSummarySchema,
  startedAt: z.iso.datetime({ offset: true }),
  activityComposition: z.strictObject({
    categories: z.array(z.enum(["run", "bike", "swim", "strength", "other"])),
  }),
  performance: z.strictObject({
    timingCoverage: z.enum(["complete", "partial", "unavailable"]),
    elapsedSeconds: z.number().finite().nonnegative(),
    movingSeconds: z.number().finite().nonnegative().nullable(),
    distanceMeters: z.number().finite().nonnegative(),
    elevationGainMeters: z.number().finite().nullable(),
    calories: z.number().finite().nullable(),
    averageHeartRate: z.number().finite().nullable(),
    maximumHeartRate: z.number().finite().nullable(),
    averagePower: z.number().finite().nullable(),
    maximumPower: z.number().finite().nullable(),
  }),
  likes: z.number().int().nonnegative(),
  sourceArtifact: z
    .strictObject({
      format: z.string().trim().min(1).max(64),
      originalName: z.string().max(512).nullable(),
    })
    .nullable(),
});

export const publicActivityPlanShareSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
  structure_version: z.number().int().positive(),
  structure_summary: z.string(),
  is_system_template: z.boolean(),
  owner: profileSummarySchema,
});

export const publicTrainingPlanShareSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  structure_summary: z.string(),
  sessions_per_week_target: z.number().int().nullable(),
  duration_hours: z.number().nullable(),
  is_system_template: z.boolean(),
  owner: profileSummarySchema,
});

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
function ownerFromRow(row: { owner_name: string | null; owner_username: string | null }) {
  return {
    name: row.owner_name,
    username: row.owner_username,
  };
}

type PublicActivityRow = {
  id: string;
  notes: string | null;
  started_at: Date | string;
  elapsed_ms: number | string;
  moving_ms: number | string | null;
  timing_coverage: "complete" | "partial" | "unavailable";
  distance_meters: number;
  elevation_gain_meters: number | string | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_power: number | null;
  max_power: number | null;
  activity_categories: unknown;
  current_artifact: unknown;
  likes_count: number | string | null;
  owner_name: string | null;
  owner_username: string | null;
};

type PublicActivityPlanRow = {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  structure: unknown;
  is_system_template: boolean;
  owner_name: string | null;
  owner_username: string | null;
};

type PublicTrainingPlanRow = {
  id: string;
  name: string;
  description: string | null;
  structure: unknown;
  sessions_per_week_target: number | null;
  duration_hours: number | string | null;
  is_system_template: boolean;
  owner_name: string | null;
  owner_username: string | null;
};

export const publicShareRouter = createTRPCRouter({
  activity: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivityShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicActivityRow>`
        select
          a.id, a.notes, a.started_at,
          a.elapsed_ms, a.moving_ms, a.timing_coverage,
          a.distance_meters, a.elevation_gain_meters, a.calories,
          a.avg_heart_rate, a.max_heart_rate, a.avg_power, a.max_power,
          coalesce((
            select jsonb_agg(s.activity_category order by s.ordinal)
            from activity_segments s
            where s.activity_id = a.id and s.role = 'activity' and s.activity_category is not null
          ), '[]'::jsonb) as activity_categories,
          (
            select jsonb_build_object(
              'format', ar.format, 'original_name', ar.original_name
            )
            from activity_artifact_links aal
            join activity_artifacts ar on ar.id = aal.artifact_id and ar.availability = 'accepted'
            where aal.activity_id = a.id and aal.role = 'source' and aal.is_current = true
            limit 1
          ) as current_artifact,
          (select count(*) from likes l where l.entity_type = 'activity' and l.entity_id = a.id) as likes_count,
          p.full_name as owner_name, p.username as owner_username
        from activities a
        left join profiles p on p.id = a.profile_id
        where a.id = ${input.id}::uuid and a.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicActivityRow>(result)[0];
      if (!row) return null;
      const categories = z
        .array(z.enum(["run", "bike", "swim", "strength", "other"]))
        .parse(row.activity_categories);
      const artifact = row.current_artifact
        ? publicActivityArtifactRowSchema.parse(row.current_artifact)
        : null;
      return publicActivityShareSchema.parse({
        id: row.id,
        notes: row.notes,
        owner: {
          name: row.owner_name,
          username: row.owner_username,
        },
        startedAt: toIsoString(row.started_at),
        activityComposition: {
          categories,
        },
        performance: {
          timingCoverage: row.timing_coverage,
          elapsedSeconds: Number(row.elapsed_ms) / 1_000,
          movingSeconds: row.moving_ms === null ? null : Number(row.moving_ms) / 1_000,
          distanceMeters: row.distance_meters,
          elevationGainMeters: toNumberOrNull(row.elevation_gain_meters),
          calories: row.calories,
          averageHeartRate: row.avg_heart_rate,
          maximumHeartRate: row.max_heart_rate,
          averagePower: row.avg_power,
          maximumPower: row.max_power,
        },
        likes: Number(row.likes_count ?? 0),
        sourceArtifact: artifact
          ? { format: artifact.format, originalName: artifact.original_name }
          : null,
      });
    }),

  activityPlan: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivityPlanShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicActivityPlanRow>`
        select ap.id, ap.name, ap.description, ap.notes, ap.structure, ap.is_system_template,
          p.full_name as owner_name, p.username as owner_username
        from activity_plans ap
        left join profiles p on p.id = ap.profile_id
        where ap.id = ${input.id}::uuid and ap.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicActivityPlanRow>(result)[0];
      if (!row) return null;
      const structure = activityPlanStructureSchema.parse(row.structure);
      const compiled = compileActivityPlan(structure);
      return publicActivityPlanShareSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        notes: row.notes,
        activity_category: compiled.activity_category,
        structure_version: compiled.structureVersion,
        structure_summary: "Structured plan details",
        is_system_template: row.is_system_template,
        owner: ownerFromRow(row),
      });
    }),

  trainingPlan: publicProcedure
    .input(uuidInputSchema)
    .output(publicTrainingPlanShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await getRequiredDb(ctx).execute(sql<PublicTrainingPlanRow>`
        select tp.id, tp.name, tp.description, tp.structure,
          tp.sessions_per_week_target, tp.duration_hours, tp.is_system_template,
          p.full_name as owner_name, p.username as owner_username
        from training_plans tp
        left join profiles p on p.id = tp.profile_id
        where tp.id = ${input.id}::uuid and tp.content_visibility = 'public'
        limit 1
      `);
      const row = getRows<PublicTrainingPlanRow>(result)[0];
      if (!row) return null;
      // Parsing before projection rejects malformed persistence data. Returning
      // only the render projection makes builder snapshots, goal objectives,
      // session IDs, and activity-plan IDs impossible to cross public tRPC.
      trainingPlanSchema.parse(row.structure);
      return publicTrainingPlanShareSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        structure_summary: "Structured plan details",
        sessions_per_week_target: row.sessions_per_week_target ?? null,
        is_system_template: row.is_system_template,
        duration_hours: toNumberOrNull(row.duration_hours ?? null),
        owner: ownerFromRow(row),
      });
    }),
});
