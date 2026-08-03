import { randomUUID } from "node:crypto";
import { profileMetrics, profiles } from "@repo/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { getRequiredDb } from "../db";
import {
  isClearedProfileOverride,
  PROFILE_UPDATE_OVERRIDE_METHOD,
  PROFILE_UPDATE_OVERRIDE_VERSION,
  profileOverrideProvenance,
} from "../utils/profile-override-observations";

type DbClient = ReturnType<typeof getRequiredDb>;
export type ProfileUpdateTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

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

/** Append changed observations and explicit clear markers without destroying metric history. */
export async function syncAppendOnlyProfileMetric(
  tx: ProfileUpdateTransaction,
  input: {
    profileId: string;
    metricType: "lthr" | "weight_kg";
    value: number | null | undefined;
    now: Date;
  },
) {
  if (input.value === undefined) return;

  const overrideScope = and(
    eq(profileMetrics.profile_id, input.profileId),
    eq(profileMetrics.metric_type, input.metricType),
    isNull(profileMetrics.reference_activity_id),
    eq(profileMetrics.source, "manual"),
    eq(profileMetrics.method, PROFILE_UPDATE_OVERRIDE_METHOD),
  );

  const [latest] = await tx
    .select({
      value: profileMetrics.value,
      recorded_at: profileMetrics.recorded_at,
      method: profileMetrics.method,
      provenance: profileMetrics.provenance,
    })
    .from(profileMetrics)
    .where(overrideScope)
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
    .limit(1);

  if (input.value === null && latest && isClearedProfileOverride(latest)) return;
  if (
    input.value !== null &&
    latest &&
    !isClearedProfileOverride(latest) &&
    Number(latest.value) === input.value
  )
    return;

  const state = input.value === null ? "cleared" : "active";
  const recordedAt =
    latest && latest.recorded_at >= input.now
      ? new Date(latest.recorded_at.getTime() + 1)
      : input.now;

  await tx.insert(profileMetrics).values({
    id: randomUUID(),
    created_at: input.now,
    updated_at: input.now,
    profile_id: input.profileId,
    metric_type: input.metricType,
    recorded_at: recordedAt,
    unit: input.metricType === "weight_kg" ? "kg" : "bpm",
    notes: null,
    reference_activity_id: null,
    value: input.value ?? 0,
    source: "manual",
    method: PROFILE_UPDATE_OVERRIDE_METHOD,
    calculation_version: PROFILE_UPDATE_OVERRIDE_VERSION,
    provenance: profileOverrideProvenance(state),
  });
}
