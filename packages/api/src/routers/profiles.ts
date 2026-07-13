import { randomUUID } from "node:crypto";
import { profileQuickUpdateSchema } from "@repo/core";
import {
  resolveCanonicalThresholds,
  type ThresholdActivityEffortObservation,
} from "@repo/core/athlete-inputs";
import { activityEfforts, profileMetrics, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getProfileStats } from "../application/profiles/getProfileStats";
import {
  ensureProfileExists,
  getProfilePerformanceSnapshot,
  getPublicProfileById,
  getSerializedProfile,
  listProfiles,
} from "../application/profiles/readProfiles";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";

const profileListFiltersSchema = z
  .object({
    username: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const profileStatsSchema = z
  .object({
    period: z.number().min(1).max(365).default(30),
  })
  .strict();

const trainingZonesUpdateSchema = z
  .object({
    threshold_hr: z.number().int().positive().optional(),
    ftp: z.number().int().positive().optional(),
  })
  .strict();

const uuidSchema = z.string().uuid();

const profileUpdateInputSchema = profileQuickUpdateSchema
  .partial()
  .extend({
    avatar_url: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    bio: z.string().max(500).nullable().optional(),
    dob: z.string().nullable().optional(),
    preferred_units: z.enum(["metric", "imperial"]).nullable().optional(),
    language: z.string().max(10).nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .strict();

const MANUAL_FTP_UNIT = "ftp_manual";

type DbClient = ReturnType<typeof getRequiredDb>;

async function syncProfileMetric(
  db: DbClient,
  input: {
    profileId: string;
    metricType: "lthr" | "weight_kg";
    value: number | null | undefined;
  },
) {
  if (input.value === undefined) {
    return;
  }

  if (input.value === null) {
    await db
      .delete(profileMetrics)
      .where(
        and(
          eq(profileMetrics.profile_id, input.profileId),
          eq(profileMetrics.metric_type, input.metricType),
          isNull(profileMetrics.reference_activity_id),
        ),
      );

    return;
  }

  await db.insert(profileMetrics).values({
    id: randomUUID(),
    created_at: new Date(),
    profile_id: input.profileId,
    metric_type: input.metricType,
    recorded_at: new Date(),
    unit: input.metricType === "weight_kg" ? "kg" : "bpm",
    notes: null,
    reference_activity_id: null,
    value: input.value,
  });
}

async function syncManualFtp(
  db: DbClient,
  input: { profileId: string; value: number | null | undefined },
) {
  if (input.value === undefined) {
    return;
  }

  await db
    .delete(activityEfforts)
    .where(
      and(
        eq(activityEfforts.profile_id, input.profileId),
        eq(activityEfforts.activity_category, "bike"),
        eq(activityEfforts.effort_type, "power"),
        eq(activityEfforts.duration_seconds, 1200),
        eq(activityEfforts.unit, MANUAL_FTP_UNIT),
        isNull(activityEfforts.activity_id),
      ),
    );

  if (input.value === null) {
    return;
  }

  await db.insert(activityEfforts).values({
    id: randomUUID(),
    created_at: new Date(),
    updated_at: new Date(),
    profile_id: input.profileId,
    activity_id: null,
    recorded_at: new Date(),
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: 1200,
    start_offset: null,
    unit: MANUAL_FTP_UNIT,
    value: Number((input.value / 0.95).toFixed(2)),
  });
}

export const profilesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      await ensureProfileExists(db, {
        id: ctx.session.user.id,
        email: ctx.session.user.email,
      });

      const profile = await getSerializedProfile(db, ctx.session.user.id);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
        });
      }

      return profile;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch profile",
      });
    }
  }),

  getPublicById: protectedProcedure
    .input(z.object({ id: uuidSchema }).strict())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const profile = await getPublicProfileById(db, {
          viewerProfileId: ctx.session.user.id,
          profileId: input.id,
        });

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }

        return profile;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch public profile",
        });
      }
    }),

  update: protectedProcedure.input(profileUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      const profileUpdate = {
        avatar_url: input.avatar_url,
        cover_url: input.cover_url,
        bio: input.bio,
        dob: input.dob === undefined ? undefined : input.dob === null ? null : new Date(input.dob),
        is_public: input.is_public,
        updated_at: new Date(),
      };

      if (Object.values(profileUpdate).some((value) => value !== undefined)) {
        await db.update(profiles).set(profileUpdate).where(eq(profiles.id, ctx.session.user.id));
      }

      const legacySetClauses = [] as ReturnType<typeof sql>[];

      if (input.username !== undefined) {
        legacySetClauses.push(sql`"username" = ${input.username}`);
      }
      if (input.language !== undefined) {
        legacySetClauses.push(sql`"language" = ${input.language}`);
      }
      if (input.preferred_units !== undefined) {
        legacySetClauses.push(sql`"preferred_units" = ${input.preferred_units}`);
      }

      if (legacySetClauses.length > 0) {
        await db.execute(sql`
            update "profiles"
            set ${sql.join([...legacySetClauses, sql`"updated_at" = now()`], sql`, `)}
            where "id" = ${ctx.session.user.id}
          `);
      }

      await Promise.all([
        syncProfileMetric(db, {
          profileId: ctx.session.user.id,
          metricType: "weight_kg",
          value: input.weight_kg,
        }),
        syncProfileMetric(db, {
          profileId: ctx.session.user.id,
          metricType: "lthr",
          value: input.threshold_hr,
        }),
        syncManualFtp(db, {
          profileId: ctx.session.user.id,
          value: input.ftp,
        }),
      ]);

      const profile = await getSerializedProfile(db, ctx.session.user.id);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
        });
      }

      return profile;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update profile",
      });
    }
  }),

  list: protectedProcedure.input(profileListFiltersSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      return await listProfiles(db, input);
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch profiles",
      });
    }
  }),

  getStats: protectedProcedure.input(profileStatsSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      return await getProfileStats(db, {
        profileId: ctx.session.user.id,
        period: input.period,
      });
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get profile stats",
      });
    }
  }),

  getZones: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const [performance, thresholdEfforts] = await Promise.all([
        getProfilePerformanceSnapshot(db, ctx.session.user.id),
        db
          .select({
            activity_category: activityEfforts.activity_category,
            duration_seconds: activityEfforts.duration_seconds,
            effort_type: activityEfforts.effort_type,
            recorded_at: activityEfforts.recorded_at,
            unit: activityEfforts.unit,
            value: activityEfforts.value,
          })
          .from(activityEfforts)
          .where(
            and(
              eq(activityEfforts.profile_id, ctx.session.user.id),
              gte(activityEfforts.recorded_at, cutoffDate),
            ),
          )
          .orderBy(desc(activityEfforts.recorded_at))
          .limit(100),
      ]);

      const threshold_hr = performance.threshold_hr ?? undefined;
      const weight_kg = performance.weight_kg ?? undefined;
      const thresholds = resolveCanonicalThresholds({
        now: new Date().toISOString(),
        freshnessWindowMs: 90 * 24 * 60 * 60 * 1000,
        directMetrics:
          performance.ftp === null
            ? []
            : [
                {
                  threshold: "cycling_ftp" as const,
                  value: performance.ftp,
                  observedAt: new Date().toISOString(),
                  source: "provider" as const,
                },
              ],
        activityEfforts: thresholdEfforts.flatMap(
          (effort): ThresholdActivityEffortObservation[] => {
            if (effort.duration_seconds !== 1200) return [];
            const observedAt = effort.recorded_at.toISOString();
            if (effort.activity_category === "bike" && effort.effort_type === "power") {
              return [
                {
                  sport: "bike" as const,
                  metric: "power" as const,
                  value: Number(effort.value),
                  durationSeconds: 1200,
                  observedAt,
                  observationKind: "actual" as const,
                },
              ];
            }
            if (effort.activity_category === "run" && effort.effort_type === "speed") {
              const speed =
                effort.unit === "km_per_hour"
                  ? Number(effort.value) / 3.6
                  : effort.unit === "meters_per_second" || effort.unit === "m/s"
                    ? Number(effort.value)
                    : null;
              if (speed === null) return [];
              return [
                {
                  sport: "run" as const,
                  metric: "speed" as const,
                  value: speed,
                  durationSeconds: 1200,
                  observedAt,
                  observationKind: "actual" as const,
                },
              ];
            }
            return [];
          },
        ),
      });
      const ftp =
        thresholds.cycling_ftp.value === null
          ? undefined
          : Math.round(thresholds.cycling_ftp.value);
      const threshold_pace =
        thresholds.running_threshold_pace.value === null
          ? undefined
          : Math.round(thresholds.running_threshold_pace.value);

      const heartRateZones = threshold_hr
        ? {
            maxHR: Math.round(threshold_hr / 0.87),
            zone1: {
              min: Math.round(threshold_hr * 0.55),
              max: Math.round(threshold_hr * 0.75),
            },
            zone2: {
              min: Math.round(threshold_hr * 0.75),
              max: Math.round(threshold_hr * 0.87),
            },
            zone3: {
              min: Math.round(threshold_hr * 0.87),
              max: Math.round(threshold_hr * 0.98),
            },
            zone4: {
              min: Math.round(threshold_hr * 0.98),
              max: Math.round(threshold_hr * 1.06),
            },
            zone5: {
              min: Math.round(threshold_hr * 1.06),
              max: Math.round(threshold_hr / 0.87),
            },
          }
        : null;

      const powerZones = ftp
        ? {
            zone1: { min: 0, max: Math.round(ftp * 0.55) },
            zone2: {
              min: Math.round(ftp * 0.55),
              max: Math.round(ftp * 0.75),
            },
            zone3: {
              min: Math.round(ftp * 0.75),
              max: Math.round(ftp * 0.9),
            },
            zone4: {
              min: Math.round(ftp * 0.9),
              max: Math.round(ftp * 1.05),
            },
            zone5: {
              min: Math.round(ftp * 1.05),
              max: Math.round(ftp * 1.2),
            },
            zone6: {
              min: Math.round(ftp * 1.2),
              max: Math.round(ftp * 1.5),
            },
            zone7: { min: Math.round(ftp * 1.5), max: null },
          }
        : null;

      return {
        heartRateZones,
        powerZones,
        profile: {
          threshold_hr,
          ftp,
          weight_kg,
          threshold_pace,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get training zones",
      });
    }
  }),

  updateZones: protectedProcedure
    .input(trainingZonesUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        await Promise.all([
          input.threshold_hr === undefined
            ? Promise.resolve()
            : syncProfileMetric(db, {
                profileId: ctx.session.user.id,
                metricType: "lthr",
                value: input.threshold_hr,
              }),
          input.ftp === undefined
            ? Promise.resolve()
            : syncManualFtp(db, {
                profileId: ctx.session.user.id,
                value: input.ftp,
              }),
        ]);

        const profile = await getSerializedProfile(db, ctx.session.user.id);

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }

        return profile;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update training zones",
        });
      }
    }),
});
