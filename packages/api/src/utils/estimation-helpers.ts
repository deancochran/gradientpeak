/**
 * Helper functions for integrating TSS estimation into tRPC endpoints
 */

import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import type { ActivityPlanRow, PublicActivityRoutesRow } from "@repo/db";
import type { EventReadRepository } from "../repositories";

type EstimationReadStore = {
  getEstimationInputs: EventReadRepository["getEstimationInputs"];
};

type EstimationActivityPlanInput = Pick<
  ActivityPlanRow,
  "id" | "profile_id" | "name" | "description" | "activity_category" | "structure" | "route_id"
> & {
  [key: string]: unknown;
};

type LegacyEstimationReadClient = {
  from: (...args: any[]) => any;
};

type PlannedActivityEstimationStore = EstimationReadStore & {
  getActivityPlanById(input: { activityPlanId: string }): Promise<{
    activity_category: string;
    route_id: string | null;
    structure: unknown;
  } | null>;
  getLatestFitnessSnapshot(profileId: string): Promise<{
    atl: number | null;
    ctl: number | null;
    tsb: number | null;
  } | null>;
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

function isLegacyEstimationReadClient(
  input: EstimationReadStore | LegacyEstimationReadClient,
): input is LegacyEstimationReadClient {
  return "from" in input;
}

async function getEstimationProfileInputs(
  legacyReader: LegacyEstimationReadClient,
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

  const { data: profile } = await legacyReader
    .from("profiles")
    .select("dob")
    .eq("id", userId)
    .single();

  const { data: efforts } = await legacyReader
    .from("activity_efforts")
    .select("effort_type, duration_seconds, value, unit, activity_category")
    .eq("profile_id", userId)
    .gte("recorded_at", ninetyDaysAgoIso)
    .in("effort_type", ["power", "speed"])
    .order("recorded_at", { ascending: false })
    .limit(300);

  const { data: metrics } = await legacyReader
    .from("profile_metrics")
    .select("metric_type, value, recorded_at")
    .eq("profile_id", userId)
    .in("metric_type", ["weight_kg", "resting_hr", "max_hr", "lthr"])
    .order("recorded_at", { ascending: false });

  let weightKg: number | null = null;
  let restingHr: number | null = null;
  let maxHr: number | null = null;
  let lthr: number | null = null;

  const legacyEfforts = (efforts || []) as Array<{
    effort_type: string;
    duration_seconds: number;
    value: number;
    unit: string;
    activity_category: string;
  }>;
  const legacyMetrics = (metrics || []) as Array<{
    metric_type: string;
    value: number;
    recorded_at: string;
  }>;

  const bikePower20mEffort = legacyEfforts
    .filter(
      (effort) =>
        effort.effort_type === "power" &&
        effort.activity_category === "bike" &&
        effort.duration_seconds === 1200,
    )
    .sort((a, b) => b.value - a.value)[0];

  const runSpeed20mEffort = legacyEfforts
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

  for (const metric of legacyMetrics) {
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
export type ActivityPlanWithEstimation<
  TPlan extends EstimationActivityPlanInput = EstimationActivityPlanInput,
> = TPlan & {
  // Dynamically calculated fields
  estimated_tss: number;
  estimated_duration: number;
  estimated_calories?: number;
  estimated_distance?: number;
  estimated_zones?: string[];
  intensity_factor: number;
  confidence: string;
  confidence_score: number;
};

/**
 * Calculate TSS and metrics for a single activity plan
 */
export async function addEstimationToPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  estimationReader: EstimationReadStore | LegacyEstimationReadClient,
  userId: string,
): Promise<ActivityPlanWithEstimation<TPlan>> {
  const profile = isLegacyEstimationReadClient(estimationReader)
    ? await getEstimationProfileInputs(estimationReader, userId)
    : await getEstimationProfileInputsFromStore(estimationReader, userId);

  // Fetch route if referenced
  let route: any = undefined;
  if (plan.route_id) {
    if (isLegacyEstimationReadClient(estimationReader)) {
      const { data: routeData } = await estimationReader
        .from("activity_routes")
        .select("distance_meters:total_distance, total_ascent, total_descent")
        .eq("id", plan.route_id)
        .single();
      route = routeData;
    } else {
      route = (await getRoutesMapFromStore(estimationReader, userId, [plan.route_id])).get(
        plan.route_id,
      );
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
  estimationReader: EstimationReadStore | LegacyEstimationReadClient,
  userId: string,
): Promise<{
  estimated_tss: number;
  estimated_duration_seconds: number;
  intensity_factor: number;
  estimated_distance_meters: number;
}> {
  const profile = isLegacyEstimationReadClient(estimationReader)
    ? await getEstimationProfileInputs(estimationReader, userId)
    : await getEstimationProfileInputsFromStore(estimationReader, userId);

  let route: any = undefined;
  if (planInput.route_id) {
    route = isLegacyEstimationReadClient(estimationReader)
      ? await estimationReader
          .from("activity_routes")
          .select("*")
          .eq("id", planInput.route_id)
          .single()
          .then(({ data }: { data: Record<string, any> | null }) =>
            data
              ? {
                  distance_meters: data.total_distance,
                  total_ascent: data.total_ascent,
                  total_descent: data.total_descent,
                  average_grade: (data as any).average_grade,
                }
              : undefined,
          )
      : (await getRoutesMapFromStore(estimationReader, userId, [planInput.route_id])).get(
          planInput.route_id,
        );
  }

  const context = buildEstimationContext({
    userProfile: profile || {},
    activityPlan: {
      activity_category: planInput.activity_category as any,
      structure: planInput.structure,
      route_id: planInput.route_id ?? undefined,
    },
    route,
  });

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
export async function addEstimationToPlans<TPlan extends EstimationActivityPlanInput>(
  plans: Array<TPlan | null | undefined>,
  estimationReader: EstimationReadStore | LegacyEstimationReadClient,
  userId: string,
): Promise<ActivityPlanWithEstimation<TPlan>[]> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");

  if (normalizedPlans.length === 0) return [];

  const profile = isLegacyEstimationReadClient(estimationReader)
    ? await getEstimationProfileInputs(estimationReader, userId)
    : await getEstimationProfileInputsFromStore(estimationReader, userId);

  // Collect all route IDs
  const routeIds = normalizedPlans
    .filter((p) => p.route_id)
    .map((p) => p.route_id)
    .filter((id): id is string => !!id)
    .filter((id, index, self) => self.indexOf(id) === index); // Unique

  // Fetch all routes at once
  let routesMap = new Map<string, any>();
  if (routeIds.length > 0) {
    if (isLegacyEstimationReadClient(estimationReader)) {
      const { data: routes } = await estimationReader
        .from("activity_routes")
        .select("id, distance_meters:total_distance, total_ascent, total_descent")
        .in("id", routeIds);

      if (routes) {
        routesMap = new Map((routes as Array<{ id: string }>).map((route) => [route.id, route]));
      }
    } else {
      routesMap = await getRoutesMapFromStore(estimationReader, userId, routeIds);
    }
  }

  // Calculate estimation for each plan
  const results: ActivityPlanWithEstimation<TPlan>[] = [];

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
  estimationStore: PlannedActivityEstimationStore,
  userId: string,
): Promise<{
  estimated_tss: number;
  estimated_duration: number;
  estimated_calories?: number;
  fatigueImpact?: any;
}> {
  // Fetch activity plan
  const plan = await estimationStore.getActivityPlanById({ activityPlanId });

  if (!plan) {
    throw new Error("Activity plan not found");
  }

  const profile = await getEstimationProfileInputsFromStore(estimationStore, userId);

  // Fetch current fitness state
  const fitnessData = await estimationStore.getLatestFitnessSnapshot(userId);

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
    const routeData = (await getRoutesMapFromStore(estimationStore, userId, [plan.route_id])).get(
      plan.route_id,
    );
    if (routeData) {
      route = {
        distance_meters: routeData.distance_meters ?? 0,
        total_ascent: routeData.total_ascent || 0,
        total_descent: routeData.total_descent || 0,
      };
    }
  }

  // Build estimation context with fitness state
  const context = buildEstimationContext({
    userProfile: profile || {},
    fitnessState:
      fitnessData &&
      fitnessData.ctl !== null &&
      fitnessData.atl !== null &&
      fitnessData.tsb !== null
        ? {
            ctl: fitnessData.ctl,
            atl: fitnessData.atl,
            tsb: fitnessData.tsb,
          }
        : undefined,
    activityPlan: {
      activity_category: plan.activity_category,
      structure: plan.structure,
      route_id: plan.route_id ?? undefined,
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
