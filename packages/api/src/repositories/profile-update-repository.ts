import { randomUUID } from "node:crypto";
import { profileMetrics, profiles } from "@repo/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { getRequiredDb } from "../db";

type DbClient = ReturnType<typeof getRequiredDb>;
export type ProfileUpdateTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

const PROFILE_WEIGHT_SETTING_METHOD = "profile_weight_setting";
const PROFILE_WEIGHT_SETTING_PROVENANCE = {
  input: "profile_update",
  observation_type: "observed",
  trusted: true,
  entered_by: "athlete",
} as const;

export type ProfileFields = Partial<
  Pick<
    typeof profiles.$inferInsert,
    | "avatar_url"
    | "bio"
    | "cover_url"
    | "default_content_visibility"
    | "dob"
    | "full_name"
    | "is_public"
    | "language"
    | "planning_timezone"
    | "preferred_units"
    | "username"
  >
>;

export type ProfileMediaField = "avatar_url" | "cover_url";

export async function compareAndSwapOwnedProfileMedia(
  db: DbClient,
  input: {
    profileId: string;
    field: ProfileMediaField;
    expected: string | null;
    next: string | null;
    now: Date;
  },
) {
  const column = profiles[input.field];
  const [updated] = await db
    .update(profiles)
    .set({ [input.field]: input.next, updated_at: input.now })
    .where(
      and(eq(profiles.id, input.profileId), sql`${column} IS NOT DISTINCT FROM ${input.expected}`),
    )
    .returning({ id: profiles.id });

  return Boolean(updated);
}

export async function updateOwnedProfileFields(
  tx: ProfileUpdateTransaction,
  input: { profileId: string; fields: ProfileFields; now: Date },
) {
  const [updated] = await tx
    .update(profiles)
    .set({ ...input.fields, updated_at: input.now })
    .where(eq(profiles.id, input.profileId))
    .returning({ id: profiles.id });

  return Boolean(updated);
}

/** Synchronize the profile form's weight observations without sentinel measurements. */
export async function syncProfileWeightSetting(
  tx: ProfileUpdateTransaction,
  input: {
    profileId: string;
    value: number | null | undefined;
    now: Date;
  },
) {
  if (input.value === undefined) return;

  const settingScope = and(
    eq(profileMetrics.profile_id, input.profileId),
    eq(profileMetrics.metric_type, "weight_kg"),
    isNull(profileMetrics.reference_activity_id),
    eq(profileMetrics.source, "manual"),
    eq(profileMetrics.method, PROFILE_WEIGHT_SETTING_METHOD),
  );

  if (input.value === null) {
    await tx.delete(profileMetrics).where(settingScope);
    return;
  }

  const [latest] = await tx
    .select({
      value: profileMetrics.value,
      recorded_at: profileMetrics.recorded_at,
    })
    .from(profileMetrics)
    .where(settingScope)
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
    .limit(1);

  if (latest && Number(latest.value) === input.value) return;

  const recordedAt =
    latest && latest.recorded_at >= input.now
      ? new Date(latest.recorded_at.getTime() + 1)
      : input.now;

  await tx.insert(profileMetrics).values({
    id: randomUUID(),
    created_at: input.now,
    updated_at: input.now,
    profile_id: input.profileId,
    metric_type: "weight_kg",
    recorded_at: recordedAt,
    unit: "kg",
    notes: null,
    reference_activity_id: null,
    value: input.value,
    source: "manual",
    method: PROFILE_WEIGHT_SETTING_METHOD,
    calculation_version: null,
    provenance: PROFILE_WEIGHT_SETTING_PROVENANCE,
  });
}
