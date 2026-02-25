/**
 * Helper functions for integrating TSS estimation into tRPC endpoints
 */

import type {
  PublicActivityPlansRow,
  PublicActivityRoutesRow
} from "@repo/supabase";
import {
  buildEstimationContext,
  estimateActivity,
  estimateMetrics,
} from "@repo/core/estimation";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Activity plan with estimation added
 */
export interface ActivityPlanWithEstimation extends PublicActivityPlansRow {
  // Dynamically calculated fields
  estimated_tss: number;
  estimated_duration: number;
  estimated_calories?: number;
  estimated_distance?: number;
  intensity_factor: number;
  confidence: string;
  confidence_score: number;
}

/**
 * Calculate TSS and metrics for a single activity plan
 */
export async function addEstimationToPlan(
  plan: PublicActivityPlansRow,
  supabase: SupabaseClient,
  userId: string,
): Promise<ActivityPlanWithEstimation> {
  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("ftp, threshold_hr, max_hr, resting_hr, weight_kg, dob")
    .eq("id", userId)
    .single();

  // Fetch route if referenced
  let route: any = undefined;
  if (plan.route_id) {
    const { data: routeData } = await supabase
      .from("routes")
      .select("distance_meters, total_ascent, total_descent, average_grade")
      .eq("id", plan.route_id)
      .single();
    route = routeData;
  }

  // Build estimation context
  const context = buildEstimationContext({
    userProfile: profile || {},
    activityPlan: {
      activity_category: plan.activity_category,
      activity_location: plan.activity_location,
      structure: plan.structure,
      route_id: plan.route_id ?? undefined,
    },
    route,
  });

  // Calculate estimation
  const estimation = estimateActivity(context);
  const metrics = estimateMetrics(estimation, context);

  return {
    ...plan,
    estimated_tss: estimation.tss,
    estimated_duration: estimation.duration,
    estimated_calories: metrics.calories,
    estimated_distance: metrics.distance,
    intensity_factor: estimation.intensityFactor,
    confidence: estimation.confidence,
    confidence_score: estimation.confidenceScore,
  };
}

/**
 * Calculate TSS and metrics for multiple activity plans
 * More efficient than calling addEstimationToPlan repeatedly
 */
export async function addEstimationToPlans(
  plans: PublicActivityPlansRow[],
  supabase: SupabaseClient,
  userId: string,
): Promise<ActivityPlanWithEstimation[]> {
  if (plans.length === 0) return [];

  // Fetch user profile once
  const { data: profile } = await supabase
    .from("profiles")
    .select("ftp, threshold_hr, max_hr, resting_hr, weight_kg, dob")
    .eq("id", userId)
    .single();

  // Collect all route IDs
  const routeIds = plans
    .filter((p) => p.route_id)
    .map((p) => p.route_id)
    .filter((id, index, self) => self.indexOf(id) === index); // Unique

  // Fetch all routes at once
  let routesMap = new Map<string, any>();
  if (routeIds.length > 0) {
    const { data: routes } = await supabase
      .from("routes")
      .select("id, distance_meters, total_ascent, total_descent, average_grade")
      .in("id", routeIds);

    if (routes) {
      routesMap = new Map(routes.map((r) => [r.id, r]));
    }
  }

  // Calculate estimation for each plan
  const results: ActivityPlanWithEstimation[] = [];

  for (const plan of plans) {
    try {
      const route = plan.route_id ? routesMap.get(plan.route_id) : undefined;

      const context = buildEstimationContext({
        userProfile: profile || {},
        activityPlan: {
          activity_category: plan.activity_category,
          activity_location: plan.activity_location,
          structure: plan.structure,
          route_id: plan.route_id ?? undefined,
        },
        route,
      });

      const estimation = estimateActivity(context);
      const metrics = estimateMetrics(estimation, context);

      results.push({
        ...plan,
        estimated_tss: estimation.tss,
        estimated_duration: estimation.duration,
        estimated_calories: metrics.calories,
        estimated_distance: metrics.distance,
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
    .select("activity_category, activity_location, structure, route_id")
    .eq("id", activityPlanId)
    .single();

  if (!plan) {
    throw new Error("Activity plan not found");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("ftp, threshold_hr, max_hr, resting_hr, weight_kg, dob")
    .eq("id", userId)
    .single();

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
      activity_location: plan.activity_location,
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
