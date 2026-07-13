/**
 * Helper functions for integrating TSS estimation into tRPC endpoints
 */

import type { CanonicalSport } from "@repo/core";
import {
  resolveCanonicalThresholds,
  type ThresholdActivityEffortObservation,
} from "@repo/core/athlete-inputs";
import type { EstimationActivityPlanInput as CoreEstimationActivityPlanInput } from "@repo/core/estimation";
import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import type { ActivityPlanRow } from "@repo/db";
import type { EventReadRepository } from "../repositories";
import {
  filterObservationsAfterLatestTombstone,
  filterSupersededProfileOverrides,
  resolveLatestObservationsByKey,
} from "./profile-override-observations";

function shouldUseRouteForSavedPlanMetrics(structure: unknown): boolean {
  if (!structure || typeof structure !== "object") {
    return true;
  }

  const intervals = (structure as { intervals?: unknown }).intervals;
  return !Array.isArray(intervals) || intervals.length === 0;
}

export type EstimationReadStore = {
  getEstimationInputs: EventReadRepository["getEstimationInputs"];
};

export type EstimationActivityPlanInput = Pick<
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

export function toEstimationActivityPlan(input: {
  activity_category: unknown;
  route_id?: string | null;
  structure: unknown;
}): CoreEstimationActivityPlanInput {
  return {
    activity_category: input.activity_category as CanonicalSport,
    structure: input.structure as CoreEstimationActivityPlanInput["structure"],
    route_id: input.route_id ?? undefined,
  };
}

export type ActivityPlanRouteSummary = {
  distance?: number;
  ascent?: number;
  descent?: number;
};

export type EstimationSnapshot = Readonly<{
  /**
   * Fixes metric/effort freshness, age, and access-expiry evaluation for this request.
   * Route facts are current because route history is not versioned. The snapshot is internally
   * consistent for this load; it is not a reconstruction of historical route state.
   */
  asOf: Date;
  profile: Awaited<ReturnType<typeof getEstimationProfileInputsFromData>>;
  getRoute(id: string): Readonly<Record<string, any>> | undefined;
  getRouteSummary(id: string): Readonly<ActivityPlanRouteSummary> | undefined;
}>;

function buildRouteSummary(
  route:
    | {
        distanceMeters?: number;
        distance_meters?: number;
        totalAscent?: number;
        total_ascent?: number;
        totalDescent?: number;
        total_descent?: number;
      }
    | undefined,
): ActivityPlanRouteSummary | null {
  if (!route) return null;

  const distanceMeters = route.distanceMeters ?? route.distance_meters;
  const totalAscentMeters = route.totalAscent ?? route.total_ascent;
  const totalDescentMeters = route.totalDescent ?? route.total_descent;

  if (
    distanceMeters === undefined &&
    totalAscentMeters === undefined &&
    totalDescentMeters === undefined
  ) {
    return null;
  }

  return {
    distance: distanceMeters,
    ascent: totalAscentMeters,
    descent: totalDescentMeters,
  };
}

function getEstimationProfileInputsFromData(
  data: Awaited<ReturnType<EstimationReadStore["getEstimationInputs"]>>,
  asOf: Date,
) {
  let weightKg: number | null = null;
  let restingHr: number | null = null;
  let maxHr: number | null = null;
  let lthr: number | null = null;
  const thresholds = resolveEstimationThresholds(data.efforts, data.metrics, asOf.toISOString());
  for (const metric of data.metrics) {
    if (metric.metric_type === "weight_kg" && weightKg === null) weightKg = Number(metric.value);
    else if (metric.metric_type === "resting_hr" && restingHr === null)
      restingHr = Number(metric.value);
    else if (metric.metric_type === "max_hr" && maxHr === null) maxHr = Number(metric.value);
    else if (metric.metric_type === "lthr" && lthr === null) lthr = Number(metric.value);
  }
  return {
    ftp: thresholds.cycling_ftp.value === null ? null : Math.round(thresholds.cycling_ftp.value),
    dob: data.profile?.dob ?? null,
    max_hr: maxHr,
    threshold_hr: lthr,
    resting_hr: restingHr,
    weight_kg: weightKg,
    threshold_pace_seconds_per_km:
      thresholds.running_threshold_pace.value === null
        ? null
        : Math.round(thresholds.running_threshold_pace.value),
  };
}

export async function loadEstimationSnapshot(
  store: EstimationReadStore,
  profileId: string,
  routeIds: string[],
  asOf: Date,
): Promise<EstimationSnapshot> {
  const data = await store.getEstimationInputs({
    asOfIso: asOf.toISOString(),
    effortCutoffIso: new Date(asOf.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    profileId,
    routeIds: [...new Set(routeIds)],
  });
  const routes = new Map(
    data.routes.map((route) => [route.id, Object.freeze({ ...route })] as const),
  );
  const routeSummaries = new Map(
    data.routes.flatMap((route) => {
      const summary = buildRouteSummary({
        distance_meters: route.distance_meters ?? undefined,
        total_ascent: route.total_ascent ?? undefined,
        total_descent: route.total_descent ?? undefined,
      });
      return summary ? [[route.id, Object.freeze(summary)] as const] : [];
    }),
  );
  return Object.freeze({
    asOf: new Date(asOf),
    profile: Object.freeze(getEstimationProfileInputsFromData(data, asOf)),
    getRoute: (id: string) => routes.get(id),
    getRouteSummary: (id: string) => routeSummaries.get(id),
  });
}

export async function getEstimationProfileInputsFromStore(
  store: EstimationReadStore,
  userId: string,
  asOf = new Date(),
) {
  return (await loadEstimationSnapshot(store, userId, [], asOf)).profile;
}

function isLegacyEstimationReadClient(
  input: EstimationReadStore | LegacyEstimationReadClient,
): input is LegacyEstimationReadClient {
  return "from" in input;
}

async function getEstimationProfileInputs(
  legacyReader: LegacyEstimationReadClient,
  userId: string,
  asOf: Date,
): Promise<{
  ftp?: number | null;
  dob?: string | null;
  max_hr?: number | null;
  threshold_hr?: number | null;
  resting_hr?: number | null;
  weight_kg?: number | null;
  threshold_pace_seconds_per_km?: number | null;
}> {
  const ninetyDaysAgoIso = new Date(asOf.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profile } = await legacyReader
    .from("profiles")
    .select("dob")
    .eq("id", userId)
    .single();

  const { data: efforts } = await legacyReader
    .from("activity_efforts")
    .select(
      "id, activity_id, effort_type, duration_seconds, value, unit, activity_category, recorded_at, source, method, provenance",
    )
    .eq("profile_id", userId)
    .gte("recorded_at", ninetyDaysAgoIso)
    .lte("recorded_at", asOf.toISOString())
    .in("effort_type", ["power", "speed"])
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);

  const { data: metrics } = await legacyReader
    .from("profile_metrics")
    .select("id, metric_type, unit, value, recorded_at, source, method, provenance")
    .eq("profile_id", userId)
    .lte("recorded_at", asOf.toISOString())
    .in("metric_type", ["weight_kg", "ftp", "resting_hr", "max_hr", "lthr"])
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false });

  let weightKg: number | null = null;
  let restingHr: number | null = null;
  let maxHr: number | null = null;
  let lthr: number | null = null;

  const legacyEfforts = (efforts || []) as Array<{
    id: string;
    activity_id: string | null;
    effort_type: string;
    duration_seconds: number;
    value: number;
    unit: string;
    activity_category: string;
    recorded_at: string;
    source: string | null;
    method: string | null;
    provenance: unknown;
  }>;
  const legacyMetrics = (metrics || []) as Array<{
    id: string;
    metric_type: string;
    unit?: string;
    value: number;
    recorded_at: string;
    source: string | null;
    method: string | null;
    provenance: unknown;
  }>;

  const currentEfforts = filterSupersededProfileOverrides(
    legacyEfforts,
    (effort) =>
      `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}:${effort.unit}`,
  );
  const currentMetrics = filterObservationsAfterLatestTombstone(
    legacyMetrics,
    (metric) => metric.metric_type,
  );

  const thresholds = resolveEstimationThresholds(
    currentEfforts,
    currentMetrics,
    asOf.toISOString(),
  );

  const latestMetrics = resolveLatestObservationsByKey(
    legacyMetrics,
    (metric) => metric.metric_type,
  );
  for (const metric of latestMetrics.values()) {
    if (!metric) continue;
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
    }
  }

  return {
    ftp: thresholds.cycling_ftp.value === null ? null : Math.round(thresholds.cycling_ftp.value),
    dob: profile?.dob ?? null,
    max_hr: maxHr,
    threshold_hr: lthr,
    resting_hr: restingHr,
    weight_kg: weightKg,
    threshold_pace_seconds_per_km:
      thresholds.running_threshold_pace.value === null
        ? null
        : Math.round(thresholds.running_threshold_pace.value),
  };
}

function resolveEstimationThresholds(
  efforts: Array<{
    effort_type: string;
    duration_seconds: number;
    value: number;
    unit: string;
    activity_category: string;
  }>,
  metrics: Array<{ metric_type: string; unit?: string; value: number; recorded_at?: string }>,
  now: string,
) {
  return resolveCanonicalThresholds({
    now,
    freshnessWindowMs: 90 * 24 * 60 * 60 * 1000,
    directMetrics: metrics.flatMap((metric) =>
      metric.metric_type === "ftp" && metric.unit === "W" && Number.isFinite(Number(metric.value))
        ? [
            {
              threshold: "cycling_ftp" as const,
              value: Number(metric.value),
              observedAt: metric.recorded_at ?? now,
              source: "provider" as const,
            },
          ]
        : [],
    ),
    activityEfforts: efforts.flatMap((effort): ThresholdActivityEffortObservation[] => {
      const value = normalizeThresholdEffortValue(effort.value, effort.unit);
      if (value === null || effort.duration_seconds !== 1200) return [];
      if (effort.activity_category === "bike" && effort.effort_type === "power") {
        return [
          {
            sport: "bike" as const,
            metric: "power" as const,
            value,
            durationSeconds: 1200,
            observedAt: now,
            observationKind: "actual" as const,
          },
        ];
      }
      if (
        effort.effort_type === "speed" &&
        (effort.activity_category === "run" || effort.activity_category === "swim")
      ) {
        return [
          {
            sport: effort.activity_category,
            metric: "speed" as const,
            value,
            durationSeconds: 1200,
            observedAt: now,
            observationKind: "actual" as const,
          },
        ];
      }
      return [];
    }),
  });
}

function normalizeThresholdEffortValue(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === "W" || unit === "watts") return value;
  if (unit === "km_per_hour") return value / 3.6;
  if (unit === "meters_per_second" || unit === "m/s") return value;
  return null;
}

/**
 * Activity plan with estimation added
 */
export type ActivityPlanWithEstimation<
  TPlan extends EstimationActivityPlanInput = EstimationActivityPlanInput,
> = TPlan & {
  estimated_calories?: number;
  estimated_zones?: string[];
  confidence: string;
  confidence_score: number;
  estimation_status: "estimated" | "failed";
  estimation_warnings: string[];
  counts_toward_aggregation: boolean;
  authoritative_metrics: {
    estimated_tss: number;
    estimated_duration: number;
    intensity_factor: number;
    estimated_distance?: number;
    provenance: {
      estimated_tss: "estimated";
      estimated_duration: "estimated";
      intensity_factor: "estimated";
      estimated_distance: "estimated";
    };
  };
  route: ActivityPlanRouteSummary | null;
};

export function buildEstimatedPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  estimation: ReturnType<typeof estimateActivity>,
  metrics: ReturnType<typeof estimateMetrics>,
  options?: { route?: ActivityPlanRouteSummary | null },
): ActivityPlanWithEstimation<TPlan> {
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
    estimated_calories: metrics.calories,
    estimated_zones: [...new Set(zones)],
    confidence: estimation.confidence,
    confidence_score: estimation.confidenceScore,
    estimation_status: "estimated",
    estimation_warnings: estimation.warnings ?? [],
    counts_toward_aggregation: true,
    authoritative_metrics: {
      estimated_tss: estimation.tss,
      estimated_duration: estimation.duration,
      intensity_factor: estimation.intensityFactor,
      estimated_distance: metrics.distance,
      provenance: {
        estimated_tss: "estimated",
        estimated_duration: "estimated",
        intensity_factor: "estimated",
        estimated_distance: "estimated",
      },
    },
    route: options?.route ?? null,
  };
}

export function buildFailedEstimationPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  options?: { route?: ActivityPlanRouteSummary | null },
): ActivityPlanWithEstimation<TPlan> {
  return {
    ...plan,
    estimated_zones: [],
    confidence: "low",
    confidence_score: 0,
    estimation_status: "failed",
    estimation_warnings: ["Estimation failed and was excluded from scheduled load."],
    counts_toward_aggregation: false,
    authoritative_metrics: {
      estimated_tss: 0,
      estimated_duration: 0,
      intensity_factor: 0,
      provenance: {
        estimated_tss: "estimated",
        estimated_duration: "estimated",
        intensity_factor: "estimated",
        estimated_distance: "estimated",
      },
    },
    route: options?.route ?? null,
  };
}

/**
 * Calculate TSS and metrics for a single activity plan
 */
export async function addEstimationToPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  estimationReader: EstimationReadStore | LegacyEstimationReadClient,
  userId: string,
  asOf = new Date(),
): Promise<ActivityPlanWithEstimation<TPlan>> {
  if (!isLegacyEstimationReadClient(estimationReader)) {
    const [result] = await addEstimationToPlans([plan], estimationReader, userId, asOf);
    return result ?? buildFailedEstimationPlan(plan);
  }
  const profile = await getEstimationProfileInputs(estimationReader, userId, asOf);

  // Fetch route if referenced
  let route: any;
  if (plan.route_id && shouldUseRouteForSavedPlanMetrics(plan.structure)) {
    const { data: routeData } = await estimationReader
      .from("activity_routes")
      .select("distance_meters:total_distance, total_ascent, total_descent")
      .eq("id", plan.route_id)
      .single();
    route = routeData;
  }

  // Build estimation context
  const context = buildEstimationContext({
    asOf,
    userProfile: profile || {},
    activityPlan: toEstimationActivityPlan(plan),
    route,
  });

  // Calculate estimation
  const estimation = estimateActivity(context);
  const metrics = estimateMetrics(estimation, context);

  return buildEstimatedPlan(plan, estimation, metrics, { route: buildRouteSummary(route) });
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
  asOf = new Date(),
): Promise<{
  estimated_tss: number;
  estimated_duration_seconds: number;
  intensity_factor: number;
  estimated_distance_meters: number;
}> {
  const snapshot = !isLegacyEstimationReadClient(estimationReader)
    ? await loadEstimationSnapshot(
        estimationReader,
        userId,
        planInput.route_id ? [planInput.route_id] : [],
        asOf,
      )
    : null;
  const profile =
    snapshot?.profile ??
    (await getEstimationProfileInputs(
      estimationReader as LegacyEstimationReadClient,
      userId,
      asOf,
    ));

  let route: any;
  if (planInput.route_id && shouldUseRouteForSavedPlanMetrics(planInput.structure)) {
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
      : snapshot?.getRoute(planInput.route_id);
  }

  const context = buildEstimationContext({
    asOf,
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
  asOf = new Date(),
): Promise<ActivityPlanWithEstimation<TPlan>[]> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");

  if (normalizedPlans.length === 0) return [];

  // Collect all route IDs
  const routeIds = normalizedPlans
    .filter((p) => p.route_id)
    .map((p) => p.route_id)
    .filter((id): id is string => !!id)
    .filter((id, index, self) => self.indexOf(id) === index); // Unique

  const snapshot = !isLegacyEstimationReadClient(estimationReader)
    ? await loadEstimationSnapshot(estimationReader, userId, routeIds, asOf)
    : null;
  const profile =
    snapshot?.profile ??
    (await getEstimationProfileInputs(
      estimationReader as LegacyEstimationReadClient,
      userId,
      asOf,
    ));

  // Fetch all routes at once
  let routesMap = new Map<string, any>();
  if (snapshot) {
    routesMap = new Map(
      routeIds.flatMap((routeId) => {
        const route = snapshot.getRoute(routeId);
        return route ? [[routeId, route] as const] : [];
      }),
    );
  } else if (routeIds.length > 0) {
    if (isLegacyEstimationReadClient(estimationReader)) {
      const { data: routes } = await estimationReader
        .from("activity_routes")
        .select("id, distance_meters:total_distance, total_ascent, total_descent")
        .in("id", routeIds);

      if (routes) {
        routesMap = new Map((routes as Array<{ id: string }>).map((route) => [route.id, route]));
      }
    }
  }

  // Calculate estimation for each plan
  const results: ActivityPlanWithEstimation<TPlan>[] = [];
  const estimateMemo = new Map<
    string,
    { estimation: ReturnType<typeof estimateActivity>; metrics: ReturnType<typeof estimateMetrics> }
  >();

  for (const plan of normalizedPlans) {
    const route = plan.route_id ? routesMap.get(plan.route_id) : undefined;

    try {
      const authoritativeRoute = shouldUseRouteForSavedPlanMetrics(plan.structure)
        ? route
        : undefined;

      const memoKey = JSON.stringify({
        activity_category: plan.activity_category,
        structure: plan.structure,
        route: authoritativeRoute,
      });
      let estimated = estimateMemo.get(memoKey);
      if (!estimated) {
        const context = buildEstimationContext({
          asOf,
          userProfile: profile || {},
          activityPlan: toEstimationActivityPlan(plan),
          route: authoritativeRoute,
        });
        const estimation = estimateActivity(context);
        estimated = { estimation, metrics: estimateMetrics(estimation, context) };
        estimateMemo.set(memoKey, estimated);
      }

      results.push(
        buildEstimatedPlan(plan, estimated.estimation, estimated.metrics, {
          route: buildRouteSummary(route),
        }),
      );
    } catch (error) {
      console.error(`Failed to estimate plan ${plan.id}:`, error);
      results.push(buildFailedEstimationPlan(plan, { route: buildRouteSummary(route) }));
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
  asOf = new Date(),
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

  const snapshot = await loadEstimationSnapshot(
    estimationStore,
    userId,
    plan.route_id ? [plan.route_id] : [],
    asOf,
  );
  const profile = snapshot.profile;

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
    const routeData = snapshot.getRoute(plan.route_id);
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
    asOf,
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
      ...toEstimationActivityPlan(plan),
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
