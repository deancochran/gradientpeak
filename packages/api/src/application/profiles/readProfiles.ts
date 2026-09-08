import { formatDateOfBirth } from "@repo/core/profile";
import { preferredUnitSystemSchema } from "@repo/core/units";
import { type PublicProfilesRow, profileMetrics, profiles } from "@repo/db";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import {
  redactPrivateProfileDetailFields,
  redactProfileListFields,
} from "../../utils/profile-privacy";

const uuidSchema = z.string().uuid();
const nullableAvatarUrlSchema = z.string().nullable();
const nullableCoverUrlSchema = z.string().nullable();
const nullableUsernameSchema = z.string().nullable();
const nullableFullNameSchema = z.string().nullable();
const nullableBioSchema = z.string().nullable();
const nullableGenderSchema = z.string().nullable();
const nullablePreferredUnitsSchema = preferredUnitSystemSchema.nullable();
const nullableLanguageSchema = z.string().nullable();
const nullableFollowStatusSchema = z.enum(["pending", "accepted"]).nullable();

const publicProfileSchema = z
  .object({
    id: uuidSchema,
    full_name: nullableFullNameSchema,
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
    full_name: nullableFullNameSchema,
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
  onboarding_status: profiles.onboarding_status,
  is_public: profiles.is_public,
  username: profiles.username,
  preferred_units: profiles.preferred_units,
  planning_timezone: profiles.planning_timezone,
  language: profiles.language,
  default_content_visibility: profiles.default_content_visibility,
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
  | "onboarding_status"
  | "is_public"
  | "username"
  | "preferred_units"
  | "planning_timezone"
  | "language"
  | "default_content_visibility"
>;

export type ProfileListFilters = {
  username?: string;
  limit: number;
  cursor?: string;
};

function serializeProfile(
  profile: ProfileBaseRow,
  performance?: {
    weight_kg: number | null;
  },
) {
  return {
    ...profile,
    created_at: profile.created_at.toISOString(),
    updated_at: profile.updated_at.toISOString(),
    dob: profile.dob ? formatDateOfBirth(profile.dob) : null,
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

export async function getProfileWeightKgAsOf(
  db: DbClient,
  profileId: string,
  asOf = new Date(),
): Promise<number | null> {
  const [row] = await db
    .select({
      value: profileMetrics.value,
      unit: profileMetrics.unit,
    })
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, profileId),
        eq(profileMetrics.metric_type, "weight_kg"),
        lte(profileMetrics.recorded_at, asOf),
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
    .limit(1);
  return row && row.unit === "kg" && Number.isFinite(row.value) && row.value > 0 ? row.value : null;
}

export async function getSerializedProfile(db: DbClient, profileId: string) {
  const [profile, performance] = await Promise.all([
    getProfileBaseById(db, profileId),
    getProfileWeightKgAsOf(db, profileId),
  ]);

  if (!profile) {
    return null;
  }

  return serializeProfile(profile, { weight_kg: performance });
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
    onboarding_status: "provider_selection",
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
      full_name: profiles.full_name,
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
    full_name: profile.full_name,
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
