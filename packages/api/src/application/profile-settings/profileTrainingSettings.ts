import type { athleteTrainingSettingsSchema } from "@repo/core";
import { type ProfileTrainingSettingsRow, profileTrainingSettings } from "@repo/db";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;

type ProfileTrainingSettingsSqlRow = Pick<
  ProfileTrainingSettingsRow,
  "profile_id" | "settings" | "updated_at"
>;

export function normalizeProfileTrainingSettingsRow(row: ProfileTrainingSettingsSqlRow) {
  return {
    profile_id: row.profile_id,
    settings: row.settings,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : typeof row.updated_at === "string"
          ? row.updated_at
          : undefined,
  };
}

export async function readProfileTrainingSettings(db: DbClient, profileId: string) {
  const [row] = await db
    .select({
      profile_id: profileTrainingSettings.profile_id,
      settings: profileTrainingSettings.settings,
      updated_at: profileTrainingSettings.updated_at,
    })
    .from(profileTrainingSettings)
    .where(eq(profileTrainingSettings.profile_id, profileId))
    .limit(1);

  return (row as ProfileTrainingSettingsSqlRow | undefined) ?? null;
}

export async function upsertProfileTrainingSettings(
  db: DbClient,
  input: { profile_id: string; settings: z.infer<typeof athleteTrainingSettingsSchema> },
) {
  const [row] = await db
    .insert(profileTrainingSettings)
    .values({
      profile_id: input.profile_id,
      settings: input.settings,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: profileTrainingSettings.profile_id,
      set: {
        settings: input.settings,
        updated_at: new Date(),
      },
    })
    .returning({
      profile_id: profileTrainingSettings.profile_id,
      settings: profileTrainingSettings.settings,
      updated_at: profileTrainingSettings.updated_at,
    });

  return (row as ProfileTrainingSettingsSqlRow | undefined) ?? null;
}
