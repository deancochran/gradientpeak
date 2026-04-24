import { randomUUID } from "node:crypto";
import { profileQuickUpdateSchema } from "@repo/core";
import {
  activities,
  activityEfforts,
  type PublicProfilesRow,
  profileMetrics,
  profiles,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildIndexPageInfo, indexCursorSchema, parseIndexCursor } from "../utils/index-cursor";
import { bumpProfileEstimationState } from "../utils/profile-estimation-state";

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
const nullableAvatarUrlSchema = z.string().nullable();
const nullableUsernameSchema = z.string().nullable();
const nullableBioSchema = z.string().nullable();
const nullableGenderSchema = z.string().nullable();
const nullablePreferredUnitsSchema = z.enum(["metric", "imperial"]).nullable();
const nullableLanguageSchema = z.string().nullable();
const nullableFollowStatusSchema = z.enum(["pending", "accepted"]).nullable();

const publicProfileSchema = z
  .object({
    id: uuidSchema,
    username: nullableUsernameSchema,
    avatar_url: nullableAvatarUrlSchema,
    bio: nullableBioSchema,
    gender: nullableGenderSchema,
    preferred_units: nullablePreferredUnitsSchema,
    language: nullableLanguageSchema,
    is_public: z.boolean().nullable(),
    follow_status: nullableFollowStatusSchema.optional(),
    followers_count: z.number().nullable().optional(),
    following_count: z.number().nullable().optional(),
  })
  .strict();

const publicProfileRowSchema = z
  .object({
    id: uuidSchema,
    username: nullableUsernameSchema,
    avatar_url: nullableAvatarUrlSchema,
    bio: nullableBioSchema,
    gender: nullableGenderSchema,
    preferred_units: nullablePreferredUnitsSchema,
    language: nullableLanguageSchema,
    is_public: z.boolean().nullable(),
  })
  .strict();

const profileUpdateInputSchema = profileQuickUpdateSchema
  .partial()
  .extend({
    avatar_url: z.string().nullable().optional(),
    bio: z.string().max(500).nullable().optional(),
    dob: z.string().nullable().optional(),
    preferred_units: z.enum(["metric", "imperial"]).nullable().optional(),
    language: z.string().max(10).nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .strict();

const MANUAL_FTP_UNIT = "ftp_manual";

const profileBaseSelect = {
  id: profiles.id,
  idx: profiles.idx,
  created_at: profiles.created_at,
  updated_at: profiles.updated_at,
  email: profiles.email,
  full_name: profiles.full_name,
  avatar_url: profiles.avatar_url,
  bio: profiles.bio,
  dob: profiles.dob,
  gender: profiles.gender,
  onboarded: profiles.onboarded,
  is_public: profiles.is_public,
  username: profiles.username,
  preferred_units: profiles.preferred_units,
  language: profiles.language,
} as const;

type DbClient = ReturnType<typeof getRequiredDb>;

type SessionUser = {
  id: string;
  email: string;
};

type ProfileBaseRow = Pick<
  PublicProfilesRow,
  | "id"
  | "idx"
  | "created_at"
  | "updated_at"
  | "email"
  | "full_name"
  | "avatar_url"
  | "bio"
  | "dob"
  | "gender"
  | "onboarded"
  | "is_public"
  | "username"
  | "preferred_units"
  | "language"
>;

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function serializeProfile(
  profile: ProfileBaseRow,
  performance?: {
    weight_kg: number | null;
    threshold_hr: number | null;
    ftp: number | null;
  },
) {
  return {
    ...profile,
    created_at: profile.created_at.toISOString(),
    updated_at: profile.updated_at.toISOString(),
    dob: profile.dob?.toISOString() ?? null,
    ftp: performance?.ftp ?? null,
    threshold_hr: performance?.threshold_hr ?? null,
    weight_kg: performance?.weight_kg ?? null,
  };
}

async function getProfileBaseById(db: DbClient, profileId: string) {
  const [profile] = await db
    .select(profileBaseSelect)
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  return (profile ?? null) as ProfileBaseRow | null;
}

async function getProfilePerformanceSnapshot(db: DbClient, profileId: string) {
  const ftpCutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [weightMetric, lthrMetric, manualFtpEffort, best20mEffort] = await Promise.all([
    db
      .select({ value: profileMetrics.value })
      .from(profileMetrics)
      .where(
        and(eq(profileMetrics.profile_id, profileId), eq(profileMetrics.metric_type, "weight_kg")),
      )
      .orderBy(desc(profileMetrics.recorded_at))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ value: profileMetrics.value })
      .from(profileMetrics)
      .where(and(eq(profileMetrics.profile_id, profileId), eq(profileMetrics.metric_type, "lthr")))
      .orderBy(desc(profileMetrics.recorded_at))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ value: activityEfforts.value })
      .from(activityEfforts)
      .where(
        and(
          eq(activityEfforts.profile_id, profileId),
          eq(activityEfforts.activity_category, "bike"),
          eq(activityEfforts.effort_type, "power"),
          eq(activityEfforts.duration_seconds, 1200),
          eq(activityEfforts.unit, MANUAL_FTP_UNIT),
          isNull(activityEfforts.activity_id),
        ),
      )
      .orderBy(desc(activityEfforts.recorded_at))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ value: activityEfforts.value })
      .from(activityEfforts)
      .where(
        and(
          eq(activityEfforts.profile_id, profileId),
          eq(activityEfforts.activity_category, "bike"),
          eq(activityEfforts.effort_type, "power"),
          eq(activityEfforts.duration_seconds, 1200),
          gte(activityEfforts.recorded_at, ftpCutoffDate),
        ),
      )
      .orderBy(desc(activityEfforts.value))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const ftpSource = manualFtpEffort ?? best20mEffort;

  return {
    ftp: ftpSource?.value ? Math.round(Number(ftpSource.value) * 0.95) : null,
    threshold_hr: toNullableNumber(lthrMetric?.value),
    weight_kg: toNullableNumber(weightMetric?.value),
  };
}

async function getSerializedProfile(db: DbClient, profileId: string) {
  const [profile, performance] = await Promise.all([
    getProfileBaseById(db, profileId),
    getProfilePerformanceSnapshot(db, profileId),
  ]);

  if (!profile) {
    return null;
  }

  return serializeProfile(profile, performance);
}

async function ensureProfileExists(db: DbClient, user: SessionUser) {
  const existingProfile = await getProfileBaseById(db, user.id);

  if (existingProfile) {
    return existingProfile;
  }

  const now = new Date();

  await db.insert(profiles).values({
    id: user.id,
    created_at: now,
    updated_at: now,
    email: user.email,
    full_name: null,
    username: null,
    avatar_url: null,
    bio: null,
    dob: null,
    gender: null,
    language: null,
    preferred_units: null,
    onboarded: false,
    is_public: true,
  });

  return getProfileBaseById(db, user.id);
}

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

    await bumpProfileEstimationState(db as any, input.profileId, ["metrics"]);

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

  await bumpProfileEstimationState(db as any, input.profileId, ["metrics"]);
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

  await bumpProfileEstimationState(db as any, input.profileId, ["performance"]);

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

  await bumpProfileEstimationState(db as any, input.profileId, ["performance"]);
}

async function getFollowStatus(db: DbClient, followerId: string, followingId: string) {
  const result = await db.execute(sql<{ status: string | null }>`
    select status
    from follows
    where follower_id = ${followerId}
      and following_id = ${followingId}
    limit 1
  `);

  return nullableFollowStatusSchema.parse(result.rows[0]?.status ?? null);
}

async function getFollowersCount(db: DbClient, profileId: string) {
  const result = await db.execute(sql<{ value: number | string }>`
    select count(*)::int as value
    from follows
    where following_id = ${profileId}
      and status = 'accepted'
  `);

  return Number(result.rows[0]?.value ?? 0);
}

async function getFollowingCount(db: DbClient, profileId: string) {
  const result = await db.execute(sql<{ value: number | string }>`
    select count(*)::int as value
    from follows
    where follower_id = ${profileId}
      and status = 'accepted'
  `);

  return Number(result.rows[0]?.value ?? 0);
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
        const [profile] = await db
          .select({
            id: profiles.id,
            username: profiles.username,
            avatar_url: profiles.avatar_url,
            bio: profiles.bio,
            gender: profiles.gender,
            preferred_units: profiles.preferred_units,
            language: profiles.language,
            is_public: profiles.is_public,
          })
          .from(profiles)
          .where(eq(profiles.id, input.id))
          .limit(1);

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }

        const parsedProfile = publicProfileRowSchema.parse({
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          gender: profile.gender,
          preferred_units: profile.preferred_units,
          language: profile.language,
          is_public: profile.is_public,
        });

        const [follow_status, followersCount, followingCount] = await Promise.all([
          getFollowStatus(db, ctx.session.user.id, input.id),
          getFollowersCount(db, input.id),
          getFollowingCount(db, input.id),
        ]);

        const isSelf = ctx.session.user.id === input.id;
        const isPrivate = parsedProfile.is_public === false;
        const isAcceptedFollower = follow_status === "accepted";

        const resultProfile: z.input<typeof publicProfileSchema> = {
          ...parsedProfile,
          follow_status,
          followers_count: followersCount,
          following_count: followingCount,
        };

        if (!isSelf && isPrivate && !isAcceptedFollower) {
          resultProfile.bio = null;
          resultProfile.preferred_units = null;
          resultProfile.language = null;
        }

        return publicProfileSchema.parse(resultProfile);
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
    void ctx;
    const offset = parseIndexCursor(input.cursor);

    try {
      const whereClause = input.username
        ? sql`"profiles"."username" ilike ${`%${input.username}%`}`
        : undefined;
      const rows: ProfileBaseRow[] = whereClause
        ? await db
            .select(profileBaseSelect)
            .from(profiles)
            .where(whereClause)
            .limit(input.limit)
            .offset(offset)
        : await db.select(profileBaseSelect).from(profiles).limit(input.limit).offset(offset);
      const totalRows = whereClause
        ? await db.select({ total: sql<number>`count(*)::int` }).from(profiles).where(whereClause)
        : await db.select({ total: sql<number>`count(*)::int` }).from(profiles);
      const total = Number(totalRows[0]?.total ?? 0);

      return {
        items: rows.map((profile) => serializeProfile(profile)),
        total,
        ...buildIndexPageInfo({ offset, limit: input.limit, total }),
      };
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
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - input.period);

      const activityRows = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.profile_id, ctx.session.user.id),
            gte(activities.started_at, startDate),
            lte(activities.started_at, endDate),
          ),
        );

      const derivedMap = await buildActivityDerivedSummaryMap({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: activityRows,
      });

      const totalActivities = activityRows.length;
      const totalDuration = activityRows.reduce((sum, activity) => {
        return sum + (activity.duration_seconds || 0);
      }, 0);
      const totalDistance = activityRows.reduce((sum, activity) => {
        return sum + (activity.distance_meters || 0);
      }, 0);
      const totalTSS = activityRows.reduce((sum, activity) => {
        return sum + (derivedMap.get(activity.id)?.tss || 0);
      }, 0);

      return {
        totalActivities,
        totalDuration,
        totalDistance,
        totalTSS,
        avgDuration: totalActivities > 0 ? totalDuration / totalActivities : 0,
        period: input.period,
      };
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

      const [performance, bestPace] = await Promise.all([
        getProfilePerformanceSnapshot(db, ctx.session.user.id),
        db
          .select({ value: activityEfforts.value })
          .from(activityEfforts)
          .where(
            and(
              eq(activityEfforts.profile_id, ctx.session.user.id),
              eq(activityEfforts.activity_category, "run"),
              eq(activityEfforts.effort_type, "speed"),
              gte(activityEfforts.recorded_at, cutoffDate),
            ),
          )
          .orderBy(desc(activityEfforts.value))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ]);

      const threshold_hr = performance.threshold_hr ?? undefined;
      const weight_kg = performance.weight_kg ?? undefined;
      const ftp = performance.ftp ?? undefined;
      const threshold_pace = bestPace?.value
        ? Math.round(1000 / (Number(bestPace.value) * 0.9))
        : undefined;

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
