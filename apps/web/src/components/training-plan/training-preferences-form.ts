import {
  type AthleteTrainingSettings,
  athleteTrainingSettingsSchema,
  validateTrainingDoseLimitsConsistency,
} from "@repo/core";

export function hydrateTrainingPreferences(settings: unknown): AthleteTrainingSettings {
  return structuredClone(athleteTrainingSettingsSchema.parse(settings));
}

export function validateTrainingPreferences(
  settings: unknown,
): { success: true; data: AthleteTrainingSettings } | { success: false; message: string } {
  const parsed = athleteTrainingSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid preferences" };
  }

  const doseLimits = parsed.data.dose_limits;
  const doseIssues = validateTrainingDoseLimitsConsistency({
    ...(doseLimits.min_sessions_per_week !== undefined
      ? { min_sessions_per_week: doseLimits.min_sessions_per_week }
      : {}),
    ...(doseLimits.max_sessions_per_week !== undefined
      ? { max_sessions_per_week: doseLimits.max_sessions_per_week }
      : {}),
    ...(doseLimits.max_single_session_duration_minutes !== undefined
      ? { max_single_session_duration_minutes: doseLimits.max_single_session_duration_minutes }
      : {}),
    ...(doseLimits.max_weekly_duration_minutes !== undefined
      ? { max_weekly_duration_minutes: doseLimits.max_weekly_duration_minutes }
      : {}),
  });
  if (doseIssues.length > 0) {
    return { success: false, message: doseIssues.map((issue) => issue.message).join(" ") };
  }

  return { success: true, data: parsed.data };
}
