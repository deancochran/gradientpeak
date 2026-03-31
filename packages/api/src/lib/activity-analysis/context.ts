import type { ActivityAnalysisContext } from "@repo/core";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type ResolveActivityContextAsOfInput = {
  supabase: SupabaseClient<Database>;
  profileId: string;
  activityTimestamp: string;
};

export async function resolveActivityContextAsOf(
  input: ResolveActivityContextAsOfInput,
): Promise<ActivityAnalysisContext> {
  const { supabase, profileId, activityTimestamp } = input;

  const [{ data: profile }, { data: metrics }, { data: efforts }] = await Promise.all([
    supabase.from("profiles").select("dob, gender").eq("id", profileId).maybeSingle(),
    supabase
      .from("profile_metrics")
      .select("metric_type, value, recorded_at")
      .eq("profile_id", profileId)
      .lte("recorded_at", activityTimestamp)
      .in("metric_type", ["weight_kg", "resting_hr", "max_hr", "lthr"])
      .order("recorded_at", { ascending: false }),
    supabase
      .from("activity_efforts")
      .select("recorded_at, effort_type, duration_seconds, value, activity_category")
      .eq("profile_id", profileId)
      .lte("recorded_at", activityTimestamp)
      .in("effort_type", ["power", "speed"])
      .order("recorded_at", { ascending: false })
      .limit(50),
  ]);

  const profileMetrics: ActivityAnalysisContext["profileMetrics"] = {};

  for (const metric of metrics ?? []) {
    if (metric.metric_type === "weight_kg" && profileMetrics.weight_kg == null) {
      profileMetrics.weight_kg = metric.value;
      continue;
    }

    if (metric.metric_type === "resting_hr" && profileMetrics.resting_hr == null) {
      profileMetrics.resting_hr = metric.value;
      continue;
    }

    if (metric.metric_type === "max_hr" && profileMetrics.max_hr == null) {
      profileMetrics.max_hr = metric.value;
      continue;
    }

    if (metric.metric_type === "lthr" && profileMetrics.lthr == null) {
      profileMetrics.lthr = metric.value;
    }
  }

  const bikePower20mEffort = (efforts ?? []).find(
    (effort) =>
      effort.effort_type === "power" &&
      effort.activity_category === "bike" &&
      effort.duration_seconds === 1200,
  );

  profileMetrics.ftp = bikePower20mEffort ? Math.round(bikePower20mEffort.value * 0.95) : null;

  return {
    profileMetrics,
    recentEfforts: (efforts ?? []).map((effort) => ({
      recorded_at: effort.recorded_at,
      effort_type: effort.effort_type,
      duration_seconds: effort.duration_seconds,
      value: effort.value,
      activity_category: effort.activity_category,
    })),
    profile: {
      dob: profile?.dob ?? null,
      gender: normalizeGender(profile?.gender ?? null),
    },
  };
}

function normalizeGender(
  value: ProfileRow["gender"] | null,
): ActivityAnalysisContext["profile"]["gender"] {
  if (value === "male" || value === "female" || value === "other") {
    return value;
  }

  return null;
}
