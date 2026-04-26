import { createHash } from "node:crypto";
import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import {
  type ActivityPlanDerivedMetricsCacheInsert,
  activityPlanDerivedMetricsCache,
  activityPlans,
  type DrizzleDbClient,
} from "@repo/db";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  type ActivityPlanRouteSummary,
  type ActivityPlanWithEstimation,
  buildEstimatedPlan,
  buildFailedEstimationPlan,
  type EstimationActivityPlanInput,
  type EstimationReadStore,
  getEstimationProfileInputsFromStore,
  getRoutesMapFromStore,
} from "./estimation-helpers";
import { getProfileEstimationState } from "./profile-estimation-state";

export const ESTIMATOR_VERSION = "2026-04-derived-metrics-v1";
export const ACTIVITY_PLAN_CACHE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
export const ACTIVITY_PLAN_CACHE_HOT_ACCESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type SupportedActivityPlan = EstimationActivityPlanInput & {
  updated_at: Date | string;
  version: string;
};

type ProjectionRow = typeof activityPlanDerivedMetricsCache.$inferSelect;

export type ActivityPlanWithDerivedMetrics<TPlan extends EstimationActivityPlanInput> =
  ActivityPlanWithEstimation<TPlan> & {
    estimate_computed_at: string | null;
    estimate_last_accessed_at: string | null;
    estimate_source: "cache" | "computed" | "failed";
    estimator_version: string;
  };

type ActivityPlanDerivedMetricsOptions = {
  forceRefreshPlanIds?: string[];
  now?: Date;
};

function buildFingerprint(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function buildActivityPlanProjectionFingerprint(
  plan: SupportedActivityPlan,
  route:
    | {
        distance_meters: number | null;
        total_ascent: number | null;
        total_descent: number | null;
        updated_at: string;
      }
    | undefined,
  estimationState: {
    metrics_revision: number;
    performance_revision: number;
    fitness_revision: number;
  },
) {
  return buildFingerprint({
    estimator_version: ESTIMATOR_VERSION,
    plan_updated_at:
      plan.updated_at instanceof Date ? plan.updated_at.toISOString() : String(plan.updated_at),
    plan_version: plan.version,
    route_id: plan.route_id ?? null,
    route_distance_meters: route?.distance_meters ?? null,
    route_total_ascent: route?.total_ascent ?? null,
    route_total_descent: route?.total_descent ?? null,
    route_updated_at: route?.updated_at ?? null,
    metrics_revision: estimationState.metrics_revision,
    performance_revision: estimationState.performance_revision,
    fitness_revision: estimationState.fitness_revision,
  });
}

function buildProjectionLookupKey(activityPlanId: string, fingerprint: string) {
  return `${activityPlanId}:${fingerprint}`;
}

function dedupeProjectionUpserts(rows: ActivityPlanDerivedMetricsCacheInsert[]) {
  const deduped = new Map<string, ActivityPlanDerivedMetricsCacheInsert>();

  for (const row of rows) {
    deduped.set(buildProjectionLookupKey(row.activity_plan_id, row.input_fingerprint), row);
  }

  return [...deduped.values()];
}

function toRoundedIntegerOrNull(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function toFiniteNumberOrNull(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeRouteForEstimation(
  route:
    | {
        distance_meters: number | null;
        total_ascent: number | null;
        total_descent: number | null;
      }
    | undefined,
) {
  if (!route) return undefined;

  return {
    distance_meters: route.distance_meters ?? 0,
    total_ascent: route.total_ascent ?? 0,
    total_descent: route.total_descent ?? 0,
  };
}

function buildRouteSummary(
  route:
    | {
        distance_meters: number | null;
        total_ascent: number | null;
        total_descent: number | null;
      }
    | undefined,
): ActivityPlanRouteSummary | null {
  if (!route) return null;

  if (
    route.distance_meters === null &&
    route.total_ascent === null &&
    route.total_descent === null
  ) {
    return null;
  }

  return {
    distance: route.distance_meters ?? undefined,
    ascent: route.total_ascent ?? undefined,
    descent: route.total_descent ?? undefined,
  };
}

function shouldUseRouteForSavedPlanMetrics(structure: unknown): boolean {
  if (!structure || typeof structure !== "object") {
    return true;
  }

  const intervals = (structure as { intervals?: unknown }).intervals;
  return !Array.isArray(intervals) || intervals.length === 0;
}

function buildCachedEstimatedPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  projection: ProjectionRow,
  routeSummary: ActivityPlanRouteSummary | null,
  options?: { isStale?: boolean },
): ActivityPlanWithDerivedMetrics<TPlan> {
  return {
    ...plan,
    estimated_calories: projection.estimated_calories ?? undefined,
    estimated_zones: Array.isArray(projection.estimated_zones)
      ? projection.estimated_zones.filter((value): value is string => typeof value === "string")
      : [],
    confidence: projection.confidence ?? "low",
    confidence_score: projection.confidence_score ?? 0,
    estimation_status: "estimated",
    estimation_warnings: [],
    counts_toward_aggregation: true,
    estimate_computed_at: projection.computed_at.toISOString(),
    estimate_last_accessed_at: projection.last_accessed_at.toISOString(),
    estimate_source: "cache",
    estimator_version: projection.estimator_version,
    authoritative_metrics: {
      estimated_tss: projection.estimated_tss ?? 0,
      estimated_duration: projection.estimated_duration_seconds ?? 0,
      intensity_factor: projection.intensity_factor ?? 0,
      estimated_distance: projection.estimated_distance_meters ?? undefined,
    },
    route: routeSummary,
  };
}

function buildProjectionUpsert<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  profileId: string,
  fingerprint: string,
  estimatedPlan: ActivityPlanWithEstimation<TPlan>,
  now: Date,
): ActivityPlanDerivedMetricsCacheInsert {
  return {
    activity_plan_id: plan.id,
    profile_id: profileId,
    estimator_version: ESTIMATOR_VERSION,
    input_fingerprint: fingerprint,
    estimated_tss: toRoundedIntegerOrNull(estimatedPlan.authoritative_metrics.estimated_tss),
    estimated_duration_seconds: toRoundedIntegerOrNull(
      estimatedPlan.authoritative_metrics.estimated_duration,
    ),
    intensity_factor: toFiniteNumberOrNull(estimatedPlan.authoritative_metrics.intensity_factor),
    estimated_calories: toRoundedIntegerOrNull(estimatedPlan.estimated_calories),
    estimated_distance_meters: toRoundedIntegerOrNull(
      estimatedPlan.authoritative_metrics.estimated_distance,
    ),
    estimated_zones: estimatedPlan.estimated_zones ?? [],
    confidence: estimatedPlan.confidence,
    confidence_score: toRoundedIntegerOrNull(estimatedPlan.confidence_score),
    computed_at: now,
    last_accessed_at: now,
    updated_at: now,
  };
}

function isProjectionStale(projection: ProjectionRow, now: Date) {
  return now.getTime() - projection.computed_at.getTime() > ACTIVITY_PLAN_CACHE_STALE_AFTER_MS;
}

function shouldRefreshHotProjection(projection: ProjectionRow, now: Date) {
  if (!isProjectionStale(projection, now)) return false;
  return (
    now.getTime() - projection.last_accessed_at.getTime() <=
    ACTIVITY_PLAN_CACHE_HOT_ACCESS_WINDOW_MS
  );
}

function buildProjectionTouchRow(
  projection: ProjectionRow,
  now: Date,
): ActivityPlanDerivedMetricsCacheInsert {
  return {
    activity_plan_id: projection.activity_plan_id,
    profile_id: projection.profile_id,
    estimator_version: projection.estimator_version,
    input_fingerprint: projection.input_fingerprint,
    estimated_tss: projection.estimated_tss,
    estimated_duration_seconds: projection.estimated_duration_seconds,
    intensity_factor: projection.intensity_factor,
    estimated_calories: projection.estimated_calories,
    estimated_distance_meters: projection.estimated_distance_meters,
    estimated_zones: projection.estimated_zones,
    confidence: projection.confidence,
    confidence_score: projection.confidence_score,
    computed_at: projection.computed_at,
    last_accessed_at: now,
    updated_at: projection.updated_at,
  };
}

async function listCachedActivityPlanProjections(
  db: DrizzleDbClient,
  profileId: string,
  planIds: string[],
) {
  if (planIds.length === 0) return [];

  return db
    .select()
    .from(activityPlanDerivedMetricsCache)
    .where(
      and(
        eq(activityPlanDerivedMetricsCache.profile_id, profileId),
        eq(activityPlanDerivedMetricsCache.estimator_version, ESTIMATOR_VERSION),
        inArray(activityPlanDerivedMetricsCache.activity_plan_id, planIds),
      ),
    );
}

async function upsertActivityPlanProjections(
  db: DrizzleDbClient,
  rows: ActivityPlanDerivedMetricsCacheInsert[],
) {
  if (rows.length === 0) return;

  const dedupedRows = dedupeProjectionUpserts(rows);

  await db
    .insert(activityPlanDerivedMetricsCache)
    .values(dedupedRows)
    .onConflictDoUpdate({
      target: [
        activityPlanDerivedMetricsCache.activity_plan_id,
        activityPlanDerivedMetricsCache.profile_id,
        activityPlanDerivedMetricsCache.estimator_version,
        activityPlanDerivedMetricsCache.input_fingerprint,
      ],
      set: {
        estimated_tss: sql`excluded.estimated_tss`,
        estimated_duration_seconds: sql`excluded.estimated_duration_seconds`,
        intensity_factor: sql`excluded.intensity_factor`,
        estimated_calories: sql`excluded.estimated_calories`,
        estimated_distance_meters: sql`excluded.estimated_distance_meters`,
        estimated_zones: sql`excluded.estimated_zones`,
        confidence: sql`excluded.confidence`,
        confidence_score: sql`excluded.confidence_score`,
        computed_at: sql`excluded.computed_at`,
        last_accessed_at: sql`excluded.last_accessed_at`,
        updated_at: sql`excluded.updated_at`,
      },
    });
}

export async function getActivityPlanDerivedMetrics<TPlan extends SupportedActivityPlan>(
  plan: TPlan,
  db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  userId: string,
): Promise<ActivityPlanWithDerivedMetrics<TPlan>> {
  const [estimatedPlan] = await getActivityPlansDerivedMetrics([plan], db, estimationStore, userId);
  if (!estimatedPlan) {
    const failed = buildFailedEstimationPlan(plan);
    return {
      ...failed,
      estimate_computed_at: null,
      estimate_last_accessed_at: null,
      estimate_source: "failed",
      estimator_version: ESTIMATOR_VERSION,
    };
  }
  return estimatedPlan;
}

export async function getActivityPlansDerivedMetrics<TPlan extends SupportedActivityPlan>(
  plans: Array<TPlan | null | undefined>,
  db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  userId: string,
  options?: ActivityPlanDerivedMetricsOptions,
): Promise<Array<ActivityPlanWithDerivedMetrics<TPlan>>> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");
  if (normalizedPlans.length === 0) return [];

  const estimationState = await getProfileEstimationState(db, userId);
  const routeIds = Array.from(
    new Set(
      normalizedPlans
        .map((plan) => plan.route_id)
        .filter((routeId): routeId is string => typeof routeId === "string" && routeId.length > 0),
    ),
  );
  const routesMap = await getRoutesMapFromStore(estimationStore, userId, routeIds);

  const planFingerprints = new Map<string, string>();
  for (const plan of normalizedPlans) {
    const route = plan.route_id ? routesMap.get(plan.route_id) : undefined;
    planFingerprints.set(
      plan.id,
      buildActivityPlanProjectionFingerprint(plan, route, estimationState),
    );
  }

  const cachedRows = await listCachedActivityPlanProjections(
    db,
    userId,
    normalizedPlans.map((plan) => plan.id),
  );
  const cachedProjectionMap = new Map(
    cachedRows.map((row) => [
      buildProjectionLookupKey(row.activity_plan_id, row.input_fingerprint),
      row,
    ]),
  );

  const results: Array<ActivityPlanWithDerivedMetrics<TPlan>> = [];
  const rowsToUpsert: ActivityPlanDerivedMetricsCacheInsert[] = [];
  const now = options?.now ?? new Date();
  const forceRefreshPlanIds = new Set(options?.forceRefreshPlanIds ?? []);

  let profileInputs: Awaited<ReturnType<typeof getEstimationProfileInputsFromStore>> | null = null;

  for (const plan of normalizedPlans) {
    const fingerprint = planFingerprints.get(plan.id);
    if (!fingerprint) continue;

    const routeForFacts = plan.route_id ? routesMap.get(plan.route_id) : undefined;
    const routeSummary = buildRouteSummary(routeForFacts);

    const cached = cachedProjectionMap.get(buildProjectionLookupKey(plan.id, fingerprint));
    if (cached) {
      if (!forceRefreshPlanIds.has(plan.id) && !shouldRefreshHotProjection(cached, now)) {
        rowsToUpsert.push(buildProjectionTouchRow(cached, now));
        results.push(
          buildCachedEstimatedPlan(plan, cached, routeSummary, {
            isStale: isProjectionStale(cached, now),
          }),
        );
        continue;
      }
    }

    const route = shouldUseRouteForSavedPlanMetrics(plan.structure)
      ? normalizeRouteForEstimation(routeForFacts)
      : undefined;

    try {
      if (!profileInputs) {
        profileInputs = await getEstimationProfileInputsFromStore(estimationStore, userId);
      }

      const context = buildEstimationContext({
        userProfile: profileInputs,
        activityPlan: {
          activity_category: plan.activity_category,
          structure: plan.structure,
          route_id: plan.route_id ?? undefined,
        },
        route,
      });

      const estimation = estimateActivity(context);
      const metrics = estimateMetrics(estimation, context);
      const estimatedPlan = buildEstimatedPlan(plan, estimation, metrics, { route: routeSummary });

      rowsToUpsert.push(buildProjectionUpsert(plan, userId, fingerprint, estimatedPlan, now));
      results.push({
        ...estimatedPlan,
        estimate_computed_at: now.toISOString(),
        estimate_last_accessed_at: now.toISOString(),
        estimate_source: "computed",
        estimator_version: ESTIMATOR_VERSION,
      });
    } catch (error) {
      console.error(`Failed to build derived metrics for activity plan ${plan.id}:`, error);
      const failed = buildFailedEstimationPlan(plan, { route: routeSummary });
      results.push({
        ...failed,
        estimate_computed_at: null,
        estimate_last_accessed_at: null,
        estimate_source: "failed",
        estimator_version: ESTIMATOR_VERSION,
      });
    }
  }

  await upsertActivityPlanProjections(db, rowsToUpsert);

  return results;
}

export async function listHotStaleActivityPlansForProfile(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    limit?: number;
    now?: Date;
  },
): Promise<SupportedActivityPlan[]> {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - ACTIVITY_PLAN_CACHE_STALE_AFTER_MS);
  const hotAfter = new Date(now.getTime() - ACTIVITY_PLAN_CACHE_HOT_ACCESS_WINDOW_MS);

  const rows = await db
    .select({ plan: activityPlans })
    .from(activityPlanDerivedMetricsCache)
    .innerJoin(
      activityPlans,
      eq(activityPlans.id, activityPlanDerivedMetricsCache.activity_plan_id),
    )
    .where(
      and(
        eq(activityPlanDerivedMetricsCache.profile_id, input.profileId),
        eq(activityPlanDerivedMetricsCache.estimator_version, ESTIMATOR_VERSION),
        lte(activityPlanDerivedMetricsCache.computed_at, staleBefore),
        gte(activityPlanDerivedMetricsCache.last_accessed_at, hotAfter),
      ),
    )
    .orderBy(desc(activityPlanDerivedMetricsCache.last_accessed_at))
    .limit(input.limit ?? 50);

  return rows.map((row) => row.plan as SupportedActivityPlan);
}

export async function refreshHotStaleActivityPlanDerivedMetricsForProfile(
  db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  userId: string,
  input?: {
    limit?: number;
    now?: Date;
  },
) {
  const now = input?.now ?? new Date();
  const plans = await listHotStaleActivityPlansForProfile(db, {
    profileId: userId,
    limit: input?.limit,
    now,
  });

  if (plans.length === 0) {
    return {
      refreshedCount: 0,
      planIds: [] as string[],
    };
  }

  await getActivityPlansDerivedMetrics(plans, db, estimationStore, userId, {
    forceRefreshPlanIds: plans.map((plan) => plan.id),
    now,
  });

  return {
    refreshedCount: plans.length,
    planIds: plans.map((plan) => plan.id),
  };
}
