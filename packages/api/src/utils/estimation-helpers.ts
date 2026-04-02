/**
 * Helper functions for integrating TSS estimation into tRPC endpoints
 */

import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import type { PublicActivityPlansRow, PublicActivityRoutesRow } from "@repo/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventReadRepository } from "../repositories";

type EstimationReadStore = {
  getEstimationInputs: EventReadRepository["getEstimationInputs"];
};

async function getEstimationProfileInputsFromStore(store: EstimationReadStore, userId: string) {
  const data = await store.getEstimationInputs({
    effortCutoffIso: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    profileId: userId,
    routeIds: [],
  });

  let weightKg: number | null = null;
  let restingHr: number | null = null;
  let maxHr: number | null = null;
  let lthr: number | null = null;

  const bikePower20mEffort = data.efforts
    .filter(
      (effort) =>
        effort.effort_type === "power" &&
        effort.activity_category === "bike" &&
        effort.duration_seconds === 1200,
    )
    .sort((a, b) => b.value - a.value)[0];

  const runSpeed20mEffort = data.efforts
    .filter(
      (effort) =>
        effort.effort_type === "speed" &&
        effort.activity_category === "run" &&
        effort.duration_seconds === 1200,
    )
    .sort((a, b) => b.value - a.value)[0];

  const ftp = bikePower20mEffort ? Math.round(bikePower20mEffort.value * 0.95) : null;

  let thresholdPaceSecondsPerKm: number | null = null;
  if (runSpeed20mEffort && runSpeed20mEffort.value > 0) {
    if (runSpeed20mEffort.unit === "meters_per_second") {
      thresholdPaceSecondsPerKm = Math.round(1000 / runSpeed20mEffort.value);
    } else if (runSpeed20mEffort.unit === "km_per_hour") {
      thresholdPaceSecondsPerKm = Math.round(3600 / runSpeed20mEffort.value);
    }
  }

  for (const metric of data.metrics) {
    if (metric.metric_type === "weight_kg" && weightKg === null) {
      weightKg = Number(metric.value);
      continue;
    }
    if (metric.metric_type === "resting_hr" && restingHr === null) {
      restingHr = Number(metric.value);
      continue;
    }
    if (metric.metric_type === "max_hr" && maxHr === null) {
      maxHr = Number(metric.value);
      continue;
    }
    if (metric.metric_type === "lthr" && lthr === null) {
      lthr = Number(metric.value);
      continue;
    }
  }

  return {
    ftp,
    dob: data.profile?.dob ?? null,
    max_hr: maxHr,
    threshold_hr: lthr,
    resting_hr: restingHr,
    weight_kg: weightKg,
    threshold_pace_seconds_per_km: thresholdPaceSecondsPerKm,
  };
}

async function getRoutesMapFromStore(
  store: EstimationReadStore,
  userId: string,
  routeIds: string[],
) {
  const data = await store.getEstimationInputs({
    effortCutoffIso: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    profileId: userId,
    routeIds,
  });
  return new Map(data.routes.map((route) => [route.id, route]));
}

async function getEstimationProfileInputs(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  ftp?: number | null;
  dob?: string | null;
  max_hr?: number | null;
  threshold_hr?: number | null;
  resting_hr?: number | null;
  weight_kg?: number | null;
  threshold_pace_seconds_per_km?: number | null;
}> {
  const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profile } = await supabase.from("profiles").select("dob").eq("id", userId).single();

  const { data: efforts } = await supabase
    .from("activity_efforts")
    .select("effort_type, duration_seconds, value, unit, activity_category")
    .eq("profile_id", userId)
    .gte("recorded_at", ninetyDaysAgoIso)
    .in("effort_type", ["power", "speed"])
    .order("recorded_at", { ascending: false })
    .limit(300);

  const { data: metrics } = await supabase
    .from("profile_metrics")
    .select("metric_type, value, recorded_at")
    .eq("profile_id", userId)
    .in("metric_type", ["weight_kg", "resting_hr", "max_hr", "lthr"])
    .order("recorded_at", { ascending: false });

  let weightKg: number | null = null;
  let restingHr: number | null = null;
  let maxHr: number | null = null;
  let lthr: number | null = null;

  const bikePower20mEffort = (efforts || [])
    .filter(
      (effort) =>
        effort.effort_type === "power" &&
        effort.activity_category === "bike" &&
        effort.duration_seconds === 1200,
    )
    .sort((a, b) => b.value - a.value)[0];

  const runSpeed20mEffort = (efforts || [])
    .filter(
      (effort) =>
        effort.effort_type === "speed" &&
        effort.activity_category === "run" &&
        effort.duration_seconds === 1200,
    )
    .sort((a, b) => b.value - a.value)[0];

  const ftp = bikePower20mEffort ? Math.round(bikePower20mEffort.value * 0.95) : null;

  let thresholdPaceSecondsPerKm: number | null = null;
  if (runSpeed20mEffort && runSpeed20mEffort.value > 0) {
    if (runSpeed20mEffort.unit === "meters_per_second") {
      thresholdPaceSecondsPerKm = Math.round(1000 / runSpeed20mEffort.value);
    } else if (runSpeed20mEffort.unit === "km_per_hour") {
      thresholdPaceSecondsPerKm = Math.round(3600 / runSpeed20mEffort.value);
    }
  }

  for (const metric of metrics || []) {
    if (metric.metric_type === "weight_kg" && weightKg === null) {
      weightKg = metric.value;
      continue;
    }
    if (metric.metric_type === "resting_hr" && restingHr === null) {
      restingHr = metric.value;
      continue;
    }
    if (metric.metric_type === "max_hr" && maxHr === null) {
      maxHr = metric.value;
      continue;
    }
    if (metric.metric_type === "lthr" && lthr === null) {
      lthr = metric.value;
      continue;
    }
  }

  return {
    ftp,
    dob: profile?.dob ?? null,
    max_hr: maxHr,
    threshold_hr: lthr,
    resting_hr: restingHr,
    weight_kg: weightKg,
    threshold_pace_seconds_per_km: thresholdPaceSecondsPerKm,
  };
}

/**
 * Activity plan with estimation added
 */
export interface ActivityPlanWithEstimation {
  // Base fields from activity plan
  id: string;
  profile_id: string | null;
  name: string;
  description: string | null;
  activity_category: string;
  // Add all other fields we need
  [key: string]: unknown;
  // Dynamically calculated fields
  estimated_tss: number;
  estimated_duration: number;
  estimated_calories?: number;
  estimated_distance?: number;
  estimated_zones?: string[];
  intensity_factor: number;
  confidence: string;
  confidence_score: number;
}

/**
 * Calculate TSS and metrics for a single activity plan
 */
export async function addEstimationToPlan(
  plan: PublicActivityPlansRow,
  input: SupabaseClient | EstimationReadStore,
  userId: string,
): Promise<ActivityPlanWithEstimation> {
  const profile =
    "from" in input
      ? await getEstimationProfileInputs(input, userId)
      : await getEstimationProfileInputsFromStore(input, userId);

  // Fetch route if referenced
  let route: any = undefined;
  if (plan.route_id) {
    if ("from" in input) {
      const { data: routeData } = await input
        .from("activity_routes")
        .select("distance_meters:total_distance, total_ascent, total_descent")
        .eq("id", plan.route_id)
        .single();
      route = routeData;
    } else {
      route = (await getRoutesMapFromStore(input, userId, [plan.route_id])).get(plan.route_id);
    }
  }

  // Build estimation context
  const context = buildEstimationContext({
    userProfile: profile || {},
    activityPlan: {
      activity_category: plan.activity_category,
      structure: plan.structure,
      route_id: plan.route_id ?? undefined,
    },
    route,
  });

  // Calculate estimation
  const estimation = estimateActivity(context);
  const metrics = estimateMetrics(estimation, context);

  const zones: string[] = [];
  if (estimation.estimatedPowerZones) {
    estimation.estimatedPowerZones.forEach((secs, idx) => {
      if (secs > 60) zones.push(`Z${idx + 1}`);
    });
  } else if (estimation.estimatedHRZones) {
    estimation.estimatedHRZones.forEach((secs, idx) => {
      if (secs > 60) zones.push(`Z${idx + 1}`);
    });
  }

  return {
    ...plan,
    estimated_tss: estimation.tss,
    estimated_duration: estimation.duration,
    estimated_calories: metrics.calories,
    estimated_distance: metrics.distance,
    estimated_zones: [...new Set(zones)],
    intensity_factor: estimation.intensityFactor,
    confidence: estimation.confidence,
    confidence_score: estimation.confidenceScore,
  };
}

/**
 * Compute metrics for a plan before saving to database
 */
export async function computePlanMetrics(
  planInput: {
    activity_category: string;
    structure: any;
    route_id?: string | null;
  },
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  estimated_tss: number;
  estimated_duration_seconds: number;
  intensity_factor: number;
  estimated_distance_meters: number;
}> {
  const profile = await getEstimationProfileInputs(supabase, userId);

  // Fetch route if referenced
  let route: any = undefined;
  if (planInput.route_id) {
    const { data: routeData } = await supabase
      .from("activity_routes") // Ensure correct table name
      .select("*")
      .eq("id", planInput.route_id)
      .single();

    if (routeData) {
      route = {
        distance_meters: routeData.total_distance,
        total_ascent: routeData.total_ascent,
        total_descent: routeData.total_descent,
        average_grade: (routeData as any).average_grade, // Cast if needed based on table schema
      };
    }
  }

  // Build estimation context
  const context = buildEstimationContext({
    userProfile: profile || {},
    activityPlan: {
      activity_category: planInput.activity_category as any,
      structure: planInput.structure,
      route_id: planInput.route_id ?? undefined,
    },
    route,
  });

  // Calculate estimation
  const estimation = estimateActivity(context);
  const metrics = estimateMetrics(estimation, context);

  return {
    estimated_tss: estimation.tss,
    estimated_duration_seconds: estimation.duration,
    intensity_factor: estimation.intensityFactor,
    estimated_distance_meters: metrics.distance || 0,
  };
}

/**
 * Calculate TSS and metrics for multiple activity plans
 * More efficient than calling addEstimationToPlan repeatedly
 */
export async function addEstimationToPlans(
  plans: Array<PublicActivityPlansRow | null | undefined>,
  input: SupabaseClient | EstimationReadStore,
  userId: string,
): Promise<ActivityPlanWithEstimation[]> {
  const normalizedPlans = plans.filter(
    (plan): plan is PublicActivityPlansRow => !!plan && typeof plan === "object",
  );

  if (normalizedPlans.length === 0) return [];

  const profile =
    "from" in input
      ? await getEstimationProfileInputs(input, userId)
      : await getEstimationProfileInputsFromStore(input, userId);

  // Collect all route IDs
  const routeIds = normalizedPlans
    .filter((p) => p.route_id)
    .map((p) => p.route_id)
    .filter((id): id is string => !!id)
    .filter((id, index, self) => self.indexOf(id) === index); // Unique

  // Fetch all routes at once
  let routesMap = new Map<string, any>();
  if (routeIds.length > 0) {
    if ("from" in input) {
      const { data: routes } = await input
        .from("activity_routes")
        .select("id, distance_meters:total_distance, total_ascent, total_descent")
        .in("id", routeIds);

      if (routes) {
        routesMap = new Map(routes.map((r) => [r.id, r]));
      }
    } else {
      routesMap = await getRoutesMapFromStore(input, userId, routeIds);
    }
  }

  // Calculate estimation for each plan
  const results: ActivityPlanWithEstimation[] = [];

  for (const plan of normalizedPlans) {
    try {
      const route = plan.route_id ? routesMap.get(plan.route_id) : undefined;

      const context = buildEstimationContext({
        userProfile: profile || {},
        activityPlan: {
          activity_category: plan.activity_category,
          structure: plan.structure,
          route_id: plan.route_id ?? undefined,
        },
        route,
      });

      const estimation = estimateActivity(context);
      const metrics = estimateMetrics(estimation, context);

      const zones: string[] = [];
      if (estimation.estimatedPowerZones) {
        estimation.estimatedPowerZones.forEach((secs, idx) => {
          if (secs > 60) zones.push(`Z${idx + 1}`);
        });
      } else if (estimation.estimatedHRZones) {
        estimation.estimatedHRZones.forEach((secs, idx) => {
          if (secs > 60) zones.push(`Z${idx + 1}`);
        });
      }

      results.push({
        ...plan,
        estimated_tss: estimation.tss,
        estimated_duration: estimation.duration,
        estimated_calories: metrics.calories,
        estimated_distance: metrics.distance,
        estimated_zones: [...new Set(zones)],
        intensity_factor: estimation.intensityFactor,
        confidence: estimation.confidence,
        confidence_score: estimation.confidenceScore,
      });
    } catch (error) {
      console.error(`Failed to estimate plan ${plan.id}:`, error);
      // Add with fallback values
      results.push({
        ...plan,
        estimated_tss: 50,
        estimated_duration: 3600,
        estimated_zones: [],
        intensity_factor: 0.7,
        confidence: "low",
        confidence_score: 0,
      });
    }
  }

  return results;
}

/**
 * Calculate TSS for a planned activity
 * Used when creating/viewing planned activities in the calendar
 */
export async function estimatePlannedActivity(
  activityPlanId: string,
  scheduledDate: Date,
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  estimated_tss: number;
  estimated_duration: number;
  estimated_calories?: number;
  fatigueImpact?: any;
}> {
  // Fetch activity plan
  const { data: plan } = await supabase
    .from("activity_plans")
    .select("activity_category, structure, route_id")
    .eq("id", activityPlanId)
    .single();

  if (!plan) {
    throw new Error("Activity plan not found");
  }

  const profile = await getEstimationProfileInputs(supabase, userId);

  // Fetch current fitness state
  const { data: fitnessData } = await supabase
    .from("fitness_snapshots")
    .select("ctl, atl, tsb, snapshot_date")
    .eq("profile_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();

  // Fetch route if referenced
  let route:
    | {
        distance_meters: number;
        total_ascent: number;
        total_descent: number;
        average_grade?: number;
      }
    | undefined;
  if (plan.route_id) {
    const { data: routeData } = await supabase
      .from("activity_routes")
      .select("*")
      .eq("id", plan.route_id)
      .single();
    if (routeData) {
      route = {
        distance_meters: routeData.total_distance,
        total_ascent: routeData.total_ascent || 0,
        total_descent: routeData.total_descent || 0,
      };
    }
  }

  // Build estimation context with fitness state
  const context = buildEstimationContext({
    userProfile: profile || {},
    fitnessState: fitnessData
      ? {
          ctl: fitnessData.ctl,
          atl: fitnessData.atl,
          tsb: fitnessData.tsb,
        }
      : undefined,
    activityPlan: {
      activity_category: plan.activity_category,
      structure: plan.structure,
      route_id: plan.route_id,
    },
    route,
    scheduledDate,
  });

  // Calculate estimation
  const estimation = estimateActivity(context);
  const metrics = estimateMetrics(estimation, context);

  return {
    estimated_tss: estimation.tss,
    estimated_duration: estimation.duration,
    estimated_calories: metrics.calories,
    fatigueImpact: estimation.fatigueImpact,
  };
}
