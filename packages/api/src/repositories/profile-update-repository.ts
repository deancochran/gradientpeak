import { randomUUID } from "node:crypto";
import { activityEfforts, profileMetrics, profiles } from "@repo/db";
import { and, desc, eq, isNull } from "drizzle-orm";
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
    | "dob"
    | "is_public"
    | "language"
    | "preferred_units"
    | "username"
  >
>;

const MANUAL_FTP_UNIT = "ftp_manual";

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
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.idx))
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

/** FTP uses latest-row replacement semantics while retaining every prior observation. */
export async function replaceManualFtp(
  tx: ProfileUpdateTransaction,
  input: { profileId: string; value: number | null | undefined; now: Date },
) {
  if (input.value === undefined) return;

  const overrideScope = and(
    eq(activityEfforts.profile_id, input.profileId),
    eq(activityEfforts.activity_category, "bike"),
    eq(activityEfforts.effort_type, "power"),
    eq(activityEfforts.duration_seconds, 1200),
    eq(activityEfforts.unit, MANUAL_FTP_UNIT),
    isNull(activityEfforts.activity_id),
    eq(activityEfforts.source, "manual"),
    eq(activityEfforts.method, PROFILE_UPDATE_OVERRIDE_METHOD),
  );
  const [latest] = await tx
    .select({
      value: activityEfforts.value,
      unit: activityEfforts.unit,
      recorded_at: activityEfforts.recorded_at,
      method: activityEfforts.method,
      provenance: activityEfforts.provenance,
    })
    .from(activityEfforts)
    .where(overrideScope)
    .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.created_at))
    .limit(1);
  const effortValue = input.value === null ? 0 : Number((input.value / 0.95).toFixed(2));

  if (input.value === null && latest && isClearedProfileOverride(latest)) return;
  if (
    input.value !== null &&
    latest &&
    !isClearedProfileOverride(latest) &&
    latest.unit === MANUAL_FTP_UNIT &&
    Number(latest.value) === effortValue
  )
    return;

  const state = input.value === null ? "cleared" : "active";
  const recordedAt =
    latest && latest.recorded_at >= input.now
      ? new Date(latest.recorded_at.getTime() + 1)
      : input.now;

  await tx.insert(activityEfforts).values({
    id: randomUUID(),
    created_at: input.now,
    updated_at: input.now,
    profile_id: input.profileId,
    activity_id: null,
    recorded_at: recordedAt,
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: 1200,
    start_offset: null,
    unit: MANUAL_FTP_UNIT,
    value: effortValue,
    source: "manual",
    method: PROFILE_UPDATE_OVERRIDE_METHOD,
    calculation_version: PROFILE_UPDATE_OVERRIDE_VERSION,
    provenance: profileOverrideProvenance(state),
  });
}
