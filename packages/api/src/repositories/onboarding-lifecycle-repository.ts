import { createHash } from "node:crypto";
import {
  type AthleteTrainingSettings,
  athleteTrainingSettingsSchema,
  defaultAthletePreferenceProfile,
  type ProfileGoalCreate,
  profileGoalRecordSchema,
} from "@repo/core";
import { profileGoals, profiles, profileTrainingSettings } from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../db";

type Db = ReturnType<typeof getRequiredDb>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class OnboardingProfileNotFoundForLockError extends Error {
  constructor() {
    super("Profile not found");
  }
}

export class OnboardingGoalContentConflictError extends Error {
  constructor() {
    super("The onboarding goal identity is already bound to different content");
    this.name = "OnboardingGoalContentConflictError";
  }
}

export async function readOnboardingProfileState(db: Db, profileId: string) {
  const [row] = await db
    .select({ id: profiles.id, onboarded: profiles.onboarded })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return row ?? null;
}

export async function lockOnboardingProfile(tx: Transaction, profileId: string) {
  const [row] = await tx
    .select({ id: profiles.id, onboarded: profiles.onboarded })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1)
    .for("update");

  if (!row) throw new OnboardingProfileNotFoundForLockError();
  return row;
}

/** RFC 4122 version-5 UUID derived from the lifecycle profile and a server-owned label. */
export function getOnboardingGoalId(profileId: string): string {
  const bytes = createHash("sha1")
    .update("gradientpeak:onboarding-goal:v1:")
    .update(profileId.toLowerCase())
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes.readUInt8(6) & 0x0f) | 0x50;
  bytes[8] = (bytes.readUInt8(8) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalGoalContent(goal: ProfileGoalCreate) {
  return canonicalJson({
    profile_id: goal.profile_id,
    target_date: goal.target_date,
    title: goal.title,
    priority: goal.priority,
    activity_category: goal.activity_category,
    target_payload: goal.target_payload,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export async function saveIdempotentOnboardingGoal(db: Db, goal: ProfileGoalCreate) {
  const id = getOnboardingGoalId(goal.profile_id);
  const now = new Date();

  await db
    .insert(profileGoals)
    .values({ id, ...goal, created_at: now, updated_at: now })
    .onConflictDoNothing({ target: profileGoals.id });

  const [storedRow] = await db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(eq(profileGoals.id, id))
    .limit(1);
  const stored = profileGoalRecordSchema.parse(storedRow);

  if (canonicalGoalContent(stored) !== canonicalGoalContent(goal)) {
    throw new OnboardingGoalContentConflictError();
  }

  return stored;
}

export async function saveChangedOnboardingSettings(input: {
  db: Db;
  profileId: string;
  patch: {
    preset?: "safer" | "balanced" | "push_harder";
    minSessionsPerWeek?: number;
    maxSessionsPerWeek?: number;
    maxSingleSessionMinutes?: number;
    maxWeeklyMinutes?: number;
  };
  onboardingIntents?: AthleteTrainingSettings["onboarding_intents"];
}): Promise<"saved" | "unchanged"> {
  return input.db.transaction(async (tx) => {
    const [currentRow] = await tx
      .select({ settings: profileTrainingSettings.settings })
      .from(profileTrainingSettings)
      .where(eq(profileTrainingSettings.profile_id, input.profileId))
      .limit(1)
      .for("update");
    const current = athleteTrainingSettingsSchema.parse(
      currentRow?.settings ?? defaultAthletePreferenceProfile,
    );
    const pace = input.patch.preset
      ? { safer: 0.25, balanced: 0.5, push_harder: 0.75 }[input.patch.preset]
      : current.training_style.progression_pace;
    const desired = athleteTrainingSettingsSchema.parse({
      ...current,
      dose_limits: {
        ...current.dose_limits,
        min_sessions_per_week:
          input.patch.minSessionsPerWeek ?? current.dose_limits.min_sessions_per_week,
        max_sessions_per_week:
          input.patch.maxSessionsPerWeek ?? current.dose_limits.max_sessions_per_week,
        max_single_session_duration_minutes:
          input.patch.maxSingleSessionMinutes ??
          current.dose_limits.max_single_session_duration_minutes,
        max_weekly_duration_minutes:
          input.patch.maxWeeklyMinutes ?? current.dose_limits.max_weekly_duration_minutes,
      },
      training_style: { ...current.training_style, progression_pace: pace },
      onboarding_intents: input.onboardingIntents,
    });

    if (currentRow && canonicalJson(current) === canonicalJson(desired)) return "unchanged";

    const now = new Date();
    await tx
      .insert(profileTrainingSettings)
      .values({ profile_id: input.profileId, settings: desired, updated_at: now })
      .onConflictDoUpdate({
        target: profileTrainingSettings.profile_id,
        set: { settings: desired, updated_at: now },
      });
    return "saved";
  });
}
