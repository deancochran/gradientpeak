import { completeOnboardingSchema } from "@repo/core/schemas/onboarding";
import { z } from "zod";

const uuidListSchema = z.array(z.string().uuid()).max(10);
const sourceSchema = completeOnboardingSchema.shape.baseline_field_sources.unwrap();
const settingsPatchSchema = z
  .object({
    preset: z.enum(["safer", "balanced", "push_harder"]).optional(),
    minSessionsPerWeek: z.number().int().min(0).max(21).optional(),
    maxSessionsPerWeek: z.number().int().min(0).max(21).optional(),
    maxSingleSessionMinutes: z.number().int().min(20).max(600).optional(),
    maxWeeklyMinutes: z.number().int().min(30).max(10080).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minSessionsPerWeek === undefined ||
      value.maxSessionsPerWeek === undefined ||
      value.minSessionsPerWeek <= value.maxSessionsPerWeek,
    { message: "Minimum sessions per week cannot exceed maximum sessions" },
  );
const goalSchema = z
  .object({
    activity_category: z.enum(["bike", "run", "swim", "strength", "other"]),
    priority: z.number().int().min(0).max(10),
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    target_payload: z
      .object({
        type: z.literal("consistency"),
        target_sessions_per_week: z.number().int().min(1).max(21),
        target_weeks: z.number().int().min(1).max(260),
      })
      .strict(),
    title: z.string().trim().min(1).max(100),
  })
  .strict();

function optionalString(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(data: FormData, name: string) {
  const value = optionalString(data, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function stringList(data: FormData, name: string) {
  return data
    .getAll(name)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

const baselineFields = [
  "dob",
  "gender",
  "weight_kg",
  "max_hr",
  "resting_hr",
  "ftp",
  "threshold_pace_seconds_per_km",
  "css_seconds_per_hundred_meters",
] as const;

export type ParsedOnboardingFormData = ReturnType<typeof parseOnboardingFormData>;

export function parseOnboardingFormData(data: FormData) {
  const rawProfile = {
    full_name: optionalString(data, "full_name"),
    username: optionalString(data, "username"),
    experience_level: optionalString(data, "experience_level"),
    intents: stringList(data, "intents"),
    dob: optionalString(data, "dob"),
    gender: optionalString(data, "gender"),
    planning_timezone: optionalString(data, "planning_timezone"),
    weight_kg: optionalNumber(data, "weight_kg"),
    max_hr: optionalNumber(data, "max_hr"),
    resting_hr: optionalNumber(data, "resting_hr"),
    ftp: optionalNumber(data, "ftp"),
    threshold_pace_seconds_per_km: optionalNumber(data, "threshold_pace_seconds_per_km"),
    css_seconds_per_hundred_meters: optionalNumber(data, "css_seconds_per_hundred_meters"),
  };
  const sources = Object.fromEntries(
    baselineFields.flatMap((field) => {
      if (rawProfile[field] === undefined) return [];
      const source = optionalString(data, `${field}_source`);
      return source ? [[field, source]] : [];
    }),
  );
  const parsedSources = Object.keys(sources).length > 0 ? sourceSchema.parse(sources) : undefined;
  const profile = completeOnboardingSchema.parse({
    ...rawProfile,
    ...(parsedSources ? { baseline_field_sources: parsedSources } : null),
  });

  let settings_patch: z.infer<typeof settingsPatchSchema> | undefined;
  if (data.get("save_preferences") === "on") {
    settings_patch = settingsPatchSchema.parse({
      preset: optionalString(data, "preference_preset"),
      minSessionsPerWeek: optionalNumber(data, "min_sessions_per_week"),
      maxSessionsPerWeek: optionalNumber(data, "max_sessions_per_week"),
      maxSingleSessionMinutes: optionalNumber(data, "max_single_session_minutes"),
      maxWeeklyMinutes: optionalNumber(data, "max_weekly_minutes"),
    });
  }

  const goalTitle = optionalString(data, "goal_title");
  const goal = goalTitle
    ? goalSchema.parse({
        activity_category: optionalString(data, "goal_activity_category"),
        priority: optionalNumber(data, "goal_priority") ?? 5,
        target_date: optionalString(data, "goal_target_date"),
        target_payload: {
          type: "consistency",
          target_sessions_per_week: optionalNumber(data, "goal_target_sessions_per_week"),
          target_weeks: optionalNumber(data, "goal_target_weeks"),
        },
        title: goalTitle,
      })
    : undefined;

  return {
    profile,
    ...(settings_patch ? { settings_patch } : null),
    ...(goal ? { goal } : null),
    social: {
      invitationIds: uuidListSchema.parse(stringList(data, "invitation_ids")),
      groupIds: uuidListSchema.parse(stringList(data, "group_ids")),
      followProfileIds: uuidListSchema.parse(stringList(data, "follow_profile_ids")),
    },
    redirect: optionalString(data, "redirect") ?? "/",
  };
}
