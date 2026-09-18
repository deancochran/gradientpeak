import {
  activityPlanDurationSchema,
  activityPlanMetricListSchema,
  activityPlanStructureSchema,
  activityPlanTargetSchema,
  canonicalActivityCategorySchema,
  trainingPlanSchema,
} from "@repo/core";
import { compileActivityPlan } from "@repo/core/activity-plan";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityPlans,
  activityRoutes,
  activitySegments,
  likes,
  profiles,
  trainingPlans,
} from "@repo/db";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import { createActivityPlanProjectionMetrics } from "../application/activity-plans/read-projections";
import { getRequiredDb } from "../db";
import { createTRPCRouter, publicProcedure } from "../trpc";

const uuidInputSchema = z.object({ id: z.string().uuid() }).strict();

const profileSummarySchema = z.strictObject({
  name: z.string().nullable(),
  username: z.string().nullable(),
});

const publicActivityPlanDisplayStepSchema = z.strictObject({
  name: z.string(),
  description: z.string().optional(),
  notes: z.string().optional(),
  duration: activityPlanDurationSchema,
  targets: z.array(activityPlanTargetSchema),
});

const publicActivityPlanDisplaySegmentSchema = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("activity"),
    name: z.string(),
    notes: z.string().optional(),
    intervals: z.array(
      z.strictObject({
        name: z.string(),
        notes: z.string().optional(),
        repetitions: z.number().int().positive(),
        steps: z.array(publicActivityPlanDisplayStepSchema),
      }),
    ),
  }),
  z.strictObject({
    role: z.literal("rest"),
    name: z.string(),
    notes: z.string().optional(),
    duration: activityPlanDurationSchema,
  }),
]);

export const publicActivityPlanDisplayStructureSchema = z.strictObject({
  version: z.literal(3),
  activity_category: canonicalActivityCategorySchema,
  segments: z.array(publicActivityPlanDisplaySegmentSchema),
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
  activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
  structure_version: z.number().int().positive(),
  structure_summary: z.string(),
  structure: publicActivityPlanDisplayStructureSchema,
  metrics: activityPlanMetricListSchema,
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

export const publicRouteShareSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  totalDistanceMeters: z.number().int().nonnegative(),
  totalAscentMeters: z.number().int().nonnegative().nullable(),
  totalDescentMeters: z.number().int().nonnegative().nullable(),
  isSystemTemplate: z.boolean(),
  owner: profileSummarySchema,
});

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

function toPublicActivityPlanDisplayStructure(structure: unknown) {
  const parsed = activityPlanStructureSchema.parse(structure);
  return publicActivityPlanDisplayStructureSchema.parse({
    version: parsed.version,
    activity_category: parsed.activity_category,
    segments: parsed.segments.map((segment) =>
      segment.role === "rest"
        ? {
            role: segment.role,
            name: segment.name,
            ...(segment.notes ? { notes: segment.notes } : {}),
            duration: segment.duration,
          }
        : {
            role: segment.role,
            name: segment.name,
            ...(segment.notes ? { notes: segment.notes } : {}),
            intervals: segment.intervals.map((interval) => ({
              name: interval.name,
              ...(interval.notes ? { notes: interval.notes } : {}),
              repetitions: interval.repetitions,
              steps: interval.steps.map((step) => ({
                name: step.name,
                ...(step.description ? { description: step.description } : {}),
                ...(step.notes ? { notes: step.notes } : {}),
                duration: step.duration,
                targets: step.targets,
              })),
            })),
          },
    ),
  });
}

export const publicShareRouter = createTRPCRouter({
  activity: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivityShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const [row] = await db
        .select({
          id: activities.id,
          notes: activities.notes,
          started_at: activities.started_at,
          elapsed_ms: activities.elapsed_ms,
          moving_ms: activities.moving_ms,
          timing_coverage: activities.timing_coverage,
          distance_meters: activities.distance_meters,
          elevation_gain_meters: activities.elevation_gain_meters,
          calories: activities.calories,
          avg_heart_rate: activities.avg_heart_rate,
          max_heart_rate: activities.max_heart_rate,
          avg_power: activities.avg_power,
          max_power: activities.max_power,
          owner_name: profiles.full_name,
          owner_username: profiles.username,
        })
        .from(activities)
        .leftJoin(profiles, eq(profiles.id, activities.profile_id))
        .where(and(eq(activities.id, input.id), eq(activities.content_visibility, "public")))
        .limit(1);
      if (!row || !row.started_at) return null;
      const [categoryRows, artifactRow, likeCount] = await Promise.all([
        db
          .select({ category: activitySegments.activity_category })
          .from(activitySegments)
          .where(
            and(eq(activitySegments.activity_id, row.id), eq(activitySegments.role, "activity")),
          )
          .orderBy(asc(activitySegments.ordinal)),
        db
          .select({
            format: activityArtifacts.format,
            original_name: activityArtifacts.original_name,
          })
          .from(activityArtifactLinks)
          .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
          .where(
            and(
              eq(activityArtifactLinks.activity_id, row.id),
              eq(activityArtifactLinks.role, "source"),
              eq(activityArtifactLinks.is_current, true),
              eq(activityArtifacts.availability, "accepted"),
            ),
          )
          .orderBy(asc(activityArtifactLinks.ordinal))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({ value: count() })
          .from(likes)
          .where(and(eq(likes.entity_type, "activity"), eq(likes.entity_id, row.id)))
          .then((rows) => rows[0]?.value ?? 0),
      ]);
      const categories = z
        .array(z.enum(["run", "bike", "swim", "strength", "other"]))
        .parse(categoryRows.flatMap(({ category }) => (category ? [category] : [])));
      const artifact = artifactRow ? publicActivityArtifactRowSchema.parse(artifactRow) : null;
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
        likes: Number(likeCount),
        sourceArtifact: artifact
          ? { format: artifact.format, originalName: artifact.original_name }
          : null,
      });
    }),

  activityPlan: publicProcedure
    .input(uuidInputSchema)
    .output(publicActivityPlanShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const [row] = await getRequiredDb(ctx)
        .select({
          id: activityPlans.id,
          name: activityPlans.name,
          description: activityPlans.description,
          structure: activityPlans.structure,
          updated_at: activityPlans.updated_at,
          is_system_template: activityPlans.is_system_template,
          owner_name: profiles.full_name,
          owner_username: profiles.username,
        })
        .from(activityPlans)
        .leftJoin(profiles, eq(profiles.id, activityPlans.profile_id))
        .where(and(eq(activityPlans.id, input.id), eq(activityPlans.content_visibility, "public")))
        .limit(1);
      if (!row) return null;
      const structure = activityPlanStructureSchema.parse(row.structure);
      const compiled = compileActivityPlan(structure);
      return publicActivityPlanShareSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        activity_category: compiled.activity_category,
        structure_version: compiled.structureVersion,
        structure_summary: "Structured plan details",
        structure: toPublicActivityPlanDisplayStructure(structure),
        metrics: createActivityPlanProjectionMetrics({
          id: row.id,
          structure,
          updatedAt: row.updated_at,
        }),
        is_system_template: row.is_system_template,
        owner: ownerFromRow(row),
      });
    }),

  trainingPlan: publicProcedure
    .input(uuidInputSchema)
    .output(publicTrainingPlanShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const [row] = await getRequiredDb(ctx)
        .select({
          id: trainingPlans.id,
          name: trainingPlans.name,
          description: trainingPlans.description,
          structure: trainingPlans.structure,
          sessions_per_week_target: trainingPlans.sessions_per_week_target,
          duration_hours: trainingPlans.duration_hours,
          is_system_template: trainingPlans.is_system_template,
          owner_name: profiles.full_name,
          owner_username: profiles.username,
        })
        .from(trainingPlans)
        .leftJoin(profiles, eq(profiles.id, trainingPlans.profile_id))
        .where(and(eq(trainingPlans.id, input.id), eq(trainingPlans.content_visibility, "public")))
        .limit(1);
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

  route: publicProcedure
    .input(uuidInputSchema)
    .output(publicRouteShareSchema.nullable())
    .query(async ({ ctx, input }) => {
      const [row] = await getRequiredDb(ctx)
        .select({
          id: activityRoutes.id,
          name: activityRoutes.name,
          description: activityRoutes.description,
          total_distance: activityRoutes.total_distance,
          total_ascent: activityRoutes.total_ascent,
          total_descent: activityRoutes.total_descent,
          is_system_template: activityRoutes.is_system_template,
          owner_name: profiles.full_name,
          owner_username: profiles.username,
        })
        .from(activityRoutes)
        .leftJoin(profiles, eq(profiles.id, activityRoutes.profile_id))
        .where(
          and(
            eq(activityRoutes.id, input.id),
            eq(activityRoutes.is_public, true),
            eq(activityRoutes.storage_state, "ready"),
          ),
        )
        .limit(1);
      if (!row) return null;
      return publicRouteShareSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        totalDistanceMeters: Number(row.total_distance),
        totalAscentMeters: toNumberOrNull(row.total_ascent),
        totalDescentMeters: toNumberOrNull(row.total_descent),
        isSystemTemplate: row.is_system_template,
        owner: ownerFromRow(row),
      });
    }),
});
