import {
  getActivityEffortThresholdEvidence,
  resolveCanonicalThresholds,
  type ThresholdMetricSource,
} from "@repo/core/athlete-inputs";
import { formatDateOfBirth } from "@repo/core/profile";
import { preferredUnitSystemSchema } from "@repo/core/units";
import { activityEfforts, type PublicProfilesRow, profileMetrics, profiles } from "@repo/db";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import {
  filterObservationsAfterLatestTombstone,
  filterSupersededProfileOverrides,
  isActiveManualFtpOverride,
  isClearedProfileOverride,
  isProfileOverrideObservation,
  PROFILE_UPDATE_OVERRIDE_METHOD,
} from "../../utils/profile-override-observations";
import {
  redactPrivateProfileDetailFields,
  redactProfileListFields,
} from "../../utils/profile-privacy";

const FTP_FRESHNESS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const uuidSchema = z.string().uuid();
const nullableAvatarUrlSchema = z.string().nullable();
const nullableCoverUrlSchema = z.string().nullable();
const nullableUsernameSchema = z.string().nullable();
const nullableBioSchema = z.string().nullable();
const nullableGenderSchema = z.string().nullable();
const nullablePreferredUnitsSchema = preferredUnitSystemSchema.nullable();
const nullableLanguageSchema = z.string().nullable();
const nullableFollowStatusSchema = z.enum(["pending", "accepted"]).nullable();

const publicProfileSchema = z
  .object({
    id: uuidSchema,
    username: nullableUsernameSchema,
    avatar_url: nullableAvatarUrlSchema,
    cover_url: nullableCoverUrlSchema,
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
    cover_url: nullableCoverUrlSchema,
    bio: nullableBioSchema,
    gender: nullableGenderSchema,
    preferred_units: nullablePreferredUnitsSchema,
    language: nullableLanguageSchema,
    is_public: z.boolean().nullable(),
  })
  .strict();

const profileBaseSelect = {
  id: profiles.id,
  created_at: profiles.created_at,
  updated_at: profiles.updated_at,
  email: profiles.email,
  full_name: profiles.full_name,
  avatar_url: profiles.avatar_url,
  cover_url: profiles.cover_url,
  bio: profiles.bio,
  dob: profiles.dob,
  gender: profiles.gender,
  onboarded: profiles.onboarded,
  is_public: profiles.is_public,
  username: profiles.username,
  preferred_units: profiles.preferred_units,
  planning_timezone: profiles.planning_timezone,
  language: profiles.language,
} as const;

type DbClient = ReturnType<typeof getRequiredDb>;

export type SessionUser = {
  id: string;
  email: string;
};

type ProfileBaseRow = Pick<
  PublicProfilesRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "email"
  | "full_name"
  | "avatar_url"
  | "cover_url"
  | "bio"
  | "dob"
  | "gender"
  | "onboarded"
  | "is_public"
  | "username"
  | "preferred_units"
  | "planning_timezone"
  | "language"
>;

export type ProfileListFilters = {
  username?: string;
  limit: number;
  cursor?: string;
};

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function thresholdMetricSource(source: string | null, provenance: unknown): ThresholdMetricSource {
  const provenanceSource =
    provenance && typeof provenance === "object" && "source" in provenance
      ? (provenance as { source?: unknown }).source
      : null;
  const candidate = source ?? provenanceSource;

  if (candidate === "manual") return "manual";
  if (candidate === "estimated") return "estimated";
  if (candidate === "derived" || candidate === "modeled") return "modeled";
  return "provider";
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
    dob: profile.dob ? formatDateOfBirth(profile.dob) : null,
    ftp: performance?.ftp ?? null,
    threshold_hr: performance?.threshold_hr ?? null,
    weight_kg: performance?.weight_kg ?? null,
  };
}

function serializeProfileListItem(profile: ProfileBaseRow) {
  const serialized = serializeProfile(profile);

  return redactProfileListFields(serialized);
}

async function getProfileBaseById(db: DbClient, profileId: string) {
  const [profile] = await db
    .select(profileBaseSelect)
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  return (profile ?? null) as ProfileBaseRow | null;
}

export async function getProfilePerformanceSnapshot(db: DbClient, profileId: string) {
  const now = new Date();
  const ftpCutoffDate = new Date(now.getTime() - FTP_FRESHNESS_WINDOW_MS);

  const [weightMetric, lthrMetric, ftpMetrics, manualFtpEffort, best20mEfforts] = await Promise.all(
    [
      db
        .select({
          value: profileMetrics.value,
          method: profileMetrics.method,
          provenance: profileMetrics.provenance,
        })
        .from(profileMetrics)
        .where(
          and(
            eq(profileMetrics.profile_id, profileId),
            eq(profileMetrics.metric_type, "weight_kg"),
          ),
        )
        .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.idx))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          value: profileMetrics.value,
          method: profileMetrics.method,
          provenance: profileMetrics.provenance,
        })
        .from(profileMetrics)
        .where(
          and(eq(profileMetrics.profile_id, profileId), eq(profileMetrics.metric_type, "lthr")),
        )
        .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.idx))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          value: profileMetrics.value,
          recorded_at: profileMetrics.recorded_at,
          source: profileMetrics.source,
          method: profileMetrics.method,
          provenance: profileMetrics.provenance,
        })
        .from(profileMetrics)
        .where(and(eq(profileMetrics.profile_id, profileId), eq(profileMetrics.metric_type, "ftp")))
        .orderBy(desc(profileMetrics.recorded_at)),
      db
        .select({
          value: activityEfforts.value,
          unit: activityEfforts.unit,
          recorded_at: activityEfforts.recorded_at,
          method: activityEfforts.method,
          provenance: activityEfforts.provenance,
          source: activityEfforts.source,
        })
        .from(activityEfforts)
        .where(
          and(
            eq(activityEfforts.profile_id, profileId),
            eq(activityEfforts.activity_category, "bike"),
            eq(activityEfforts.effort_type, "power"),
            eq(activityEfforts.duration_seconds, 1200),
            isNull(activityEfforts.activity_id),
            eq(activityEfforts.method, PROFILE_UPDATE_OVERRIDE_METHOD),
          ),
        )
        .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.created_at))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          value: activityEfforts.value,
          recorded_at: activityEfforts.recorded_at,
          activity_id: activityEfforts.activity_id,
          source: activityEfforts.source,
          id: activityEfforts.id,
          unit: activityEfforts.unit,
          method: activityEfforts.method,
          provenance: activityEfforts.provenance,
        })
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
        .orderBy(desc(activityEfforts.recorded_at)),
    ],
  );

  const cyclingFtp = resolveCanonicalThresholds({
    now: now.toISOString(),
    freshnessWindowMs: FTP_FRESHNESS_WINDOW_MS,
    directMetrics: [
      ...filterObservationsAfterLatestTombstone(ftpMetrics, () => "ftp").map((metric) => ({
        threshold: "cycling_ftp" as const,
        value: Number(metric.value),
        observedAt: metric.recorded_at.toISOString(),
        source: thresholdMetricSource(metric.source, metric.provenance),
      })),
      ...(manualFtpEffort &&
      (!isProfileOverrideObservation(manualFtpEffort) ||
        isActiveManualFtpOverride({
          ...manualFtpEffort,
          activity_id: null,
          activity_category: "bike",
          duration_seconds: 1200,
          effort_type: "power",
          unit: manualFtpEffort.unit,
        }))
        ? [
            {
              threshold: "cycling_ftp" as const,
              value: Number(manualFtpEffort.value) * 0.95,
              observedAt: manualFtpEffort.recorded_at.toISOString(),
              source: "manual" as const,
              locked: true,
            },
          ]
        : []),
    ],
    activityEfforts: filterSupersededProfileOverrides(
      best20mEfforts,
      (effort) => `bike:power:1200:${effort.unit}`,
    ).flatMap((effort) =>
      isActiveManualFtpOverride({
        ...effort,
        activity_category: "bike",
        duration_seconds: 1200,
        effort_type: "power",
      })
        ? []
        : [
            {
              sport: "bike" as const,
              metric: "power" as const,
              value: Number(effort.value),
              durationSeconds: 1200,
              observedAt: effort.recorded_at.toISOString(),
              observationKind:
                effort.activity_id !== null &&
                effort.source !== "derived" &&
                effort.source !== "estimated"
                  ? ("actual" as const)
                  : ("derived" as const),
              evidence:
                getActivityEffortThresholdEvidence({
                  activityCategory: "bike",
                  activityId: effort.activity_id,
                  durationSeconds: 1200,
                  effortType: "power",
                  method: effort.method,
                  provenance: effort.provenance,
                  source: effort.source,
                  unit: effort.unit,
                  value: Number(effort.value),
                }) ?? undefined,
            },
          ],
    ),
  }).cycling_ftp;

  return {
    ftp: cyclingFtp.value === null ? null : Math.round(cyclingFtp.value),
    threshold_hr:
      lthrMetric && !isClearedProfileOverride(lthrMetric)
        ? toNullableNumber(lthrMetric.value)
        : null,
    weight_kg:
      weightMetric && !isClearedProfileOverride(weightMetric)
        ? toNullableNumber(weightMetric.value)
        : null,
  };
}

export async function getSerializedProfile(db: DbClient, profileId: string) {
  const [profile, performance] = await Promise.all([
    getProfileBaseById(db, profileId),
    getProfilePerformanceSnapshot(db, profileId),
  ]);

  if (!profile) {
    return null;
  }

  return serializeProfile(profile, performance);
}

export async function ensureProfileExists(db: DbClient, user: SessionUser) {
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
    cover_url: null,
    bio: null,
    dob: null,
    gender: null,
    language: null,
    preferred_units: null,
    planning_timezone: null,
    onboarded: false,
    is_public: true,
  });

  return getProfileBaseById(db, user.id);
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

export async function getPublicProfileById(
  db: DbClient,
  input: { viewerProfileId: string; profileId: string },
) {
  const [profile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      avatar_url: profiles.avatar_url,
      cover_url: profiles.cover_url,
      bio: profiles.bio,
      gender: profiles.gender,
      preferred_units: profiles.preferred_units,
      language: profiles.language,
      is_public: profiles.is_public,
    })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);

  if (!profile) {
    return null;
  }

  const parsedProfile = publicProfileRowSchema.parse({
    id: profile.id,
    username: profile.username,
    avatar_url: profile.avatar_url,
    cover_url: profile.cover_url,
    bio: profile.bio,
    gender: profile.gender,
    preferred_units: profile.preferred_units,
    language: profile.language,
    is_public: profile.is_public,
  });

  const [follow_status, followersCount, followingCount] = await Promise.all([
    getFollowStatus(db, input.viewerProfileId, input.profileId),
    getFollowersCount(db, input.profileId),
    getFollowingCount(db, input.profileId),
  ]);

  const isSelf = input.viewerProfileId === input.profileId;
  const isPrivate = parsedProfile.is_public === false;
  const isAcceptedFollower = follow_status === "accepted";

  const resultProfile: z.input<typeof publicProfileSchema> = {
    ...parsedProfile,
    follow_status,
    followers_count: followersCount,
    following_count: followingCount,
  };

  return publicProfileSchema.parse(
    !isSelf && isPrivate && !isAcceptedFollower
      ? redactPrivateProfileDetailFields(resultProfile)
      : resultProfile,
  );
}

export async function listProfiles(db: DbClient, input: ProfileListFilters) {
  const offset = parseIndexCursor(input.cursor);
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
    items: rows.map((profile) => serializeProfileListItem(profile)),
    total,
    ...buildIndexPageInfo({ offset, limit: input.limit, total }),
  };
}
