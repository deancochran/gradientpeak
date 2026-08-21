import {
  CYCLING_DURATION_PERFORMANCE_POLICY,
  DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS,
} from "@repo/core";
import { schema } from "@repo/db";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  createAthletePerformanceModelReader,
  createAthletePerformanceTargetFactsBatchReader,
  createAthletePerformanceTargetFactsReader,
} from "../../application/performance-model/get-athlete-performance-model-as-of";
import type { DrizzleQueryExecutor } from "../../db";
import {
  ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_REQUEST_LIMIT,
  type ActivityAnalysisContextSnapshot,
  type ActivityAnalysisStore,
} from "../../repositories";
import { selectActivityAnalysisPerformanceTargets } from "../../repositories/activity-analysis-revision-repository";
import { createAthletePerformanceModelRepository } from "../../repositories/athlete-performance-model-repository";

const activityAnalysisMetricTypeSchema = z.enum(["weight_kg", "resting_hr", "max_hr"]);
const metricTypes = activityAnalysisMetricTypeSchema.options;
const effortTypes = ["power", "speed"] as const;
const CALIBRATION_CANDIDATE_LIMIT = 101;
const MAX_CONTEXT_EVIDENCE_PROFILES = 5;
const MAX_METRIC_DIMENSIONS_PER_PROFILE = 14;
const MAX_EFFORT_DIMENSIONS_PER_PROFILE = 5;
const MAX_CONTEXT_METRIC_EVIDENCE_ROWS = 25_000;
const MAX_CONTEXT_EFFORT_EVIDENCE_ROWS = 50_000;
const METRIC_PEER_ALIAS = "activity_analysis_metric_peer";
const EFFORT_PEER_ALIAS = "activity_analysis_effort_peer";

function toNumber(value: string | number | null): number {
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

export function createActivityAnalysisStore(db: DrizzleQueryExecutor): ActivityAnalysisStore {
  const performanceModelRepository = createAthletePerformanceModelRepository(
    db as Parameters<typeof createAthletePerformanceModelRepository>[0],
  );
  const readPerformanceModel = createAthletePerformanceModelReader(performanceModelRepository);
  const readPerformanceTargets = createAthletePerformanceTargetFactsReader(
    performanceModelRepository,
    db,
  );
  const readPerformanceTargetsBatch = createAthletePerformanceTargetFactsBatchReader(
    performanceModelRepository,
    db,
  );
  const loadContextEvidence: NonNullable<ActivityAnalysisStore["loadContextEvidence"]> = async ({
    requests,
    evidenceScope,
  }) => {
    if (requests.length === 0) return new Map();
    if (requests.length > ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_REQUEST_LIMIT) return new Map();

    const profileIds = [...new Set(requests.map((request) => request.profileId))];
    if (profileIds.length > MAX_CONTEXT_EVIDENCE_PROFILES) return new Map();
    const queryWindows = [
      ...new Map(
        requests.map((request) => [
          [
            request.profileId,
            request.asOf.toISOString(),
            request.effortLookbackAsOf?.toISOString() ?? "",
            request.activityIdToExclude ?? "",
          ].join("\u0000"),
          request,
        ]),
      ).values(),
    ];
    const metricTheoreticalLimit =
      queryWindows.length * CALIBRATION_CANDIDATE_LIMIT * MAX_METRIC_DIMENSIONS_PER_PROFILE;
    const effortTheoreticalLimit =
      queryWindows.length * CALIBRATION_CANDIDATE_LIMIT * MAX_EFFORT_DIMENSIONS_PER_PROFILE;
    const metricQueryLimit = Math.min(metricTheoreticalLimit, MAX_CONTEXT_METRIC_EVIDENCE_ROWS);
    const effortQueryLimit = Math.min(effortTheoreticalLimit, MAX_CONTEXT_EFFORT_EVIDENCE_ROWS);
    const metricPeer = alias(schema.profileMetrics, METRIC_PEER_ALIAS);
    const effortPeer = alias(schema.activityEfforts, EFFORT_PEER_ALIAS);
    const metricWindowPredicates = queryWindows.map((request) =>
      and(
        eq(schema.profileMetrics.profile_id, request.profileId),
        lte(schema.profileMetrics.recorded_at, request.asOf),
        request.activityIdToExclude === undefined
          ? undefined
          : sql`${schema.profileMetrics.reference_activity_id} is distinct from ${request.activityIdToExclude}`,
        sql`not exists (
          select 1
          from ${schema.profileMetrics} as ${sql.identifier(METRIC_PEER_ALIAS)}
          where ${metricPeer.profile_id} = ${schema.profileMetrics.profile_id}
            and ${metricPeer.metric_type} = ${schema.profileMetrics.metric_type}
            and ${metricPeer.recorded_at} <= ${request.asOf}
            and ${
              request.activityIdToExclude === undefined
                ? sql`true`
                : sql`${metricPeer.reference_activity_id} is distinct from ${request.activityIdToExclude}`
            }
            and (
              ${schema.profileMetrics.metric_type} <> 'max_hr'
              or (
                select case
                  when count(*) = 1 then min(peer_reference_segment.activity_category)
                  else null
                end
                from activity_segments as peer_reference_segment
                where peer_reference_segment.activity_id = ${metricPeer.reference_activity_id}
                  and peer_reference_segment.role = 'activity'
              ) is not distinct from (
                select case
                  when count(*) = 1 then min(current_reference_segment.activity_category)
                  else null
                end
                from activity_segments as current_reference_segment
                where current_reference_segment.activity_id = ${schema.profileMetrics.reference_activity_id}
                  and current_reference_segment.role = 'activity'
              )
            )
            and (
              ${metricPeer.recorded_at} > ${schema.profileMetrics.recorded_at}
              or (
                ${metricPeer.recorded_at} = ${schema.profileMetrics.recorded_at}
                and ${metricPeer.id} >= ${schema.profileMetrics.id}
              )
            )
          order by ${metricPeer.recorded_at} desc, ${metricPeer.id} desc
          offset ${CALIBRATION_CANDIDATE_LIMIT}
          limit 1
        )`,
      ),
    );
    const effortWindowPredicates = queryWindows.map((request) => {
      const lookbackAsOf = request.effortLookbackAsOf ?? request.asOf;
      const effortCutoff = new Date(
        lookbackAsOf.getTime() - DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS * 86_400_000,
      );
      return and(
        eq(schema.activityEfforts.profile_id, request.profileId),
        lte(schema.activityEfforts.recorded_at, request.asOf),
        gte(schema.activityEfforts.recorded_at, effortCutoff),
        request.activityIdToExclude === undefined
          ? undefined
          : sql`${schema.activityEfforts.activity_id} is distinct from ${request.activityIdToExclude}`,
        sql`not exists (
          select 1
          from ${schema.activityEfforts} as ${sql.identifier(EFFORT_PEER_ALIAS)}
          where ${effortPeer.profile_id} = ${schema.activityEfforts.profile_id}
            and ${effortPeer.activity_category} = ${schema.activityEfforts.activity_category}
            and ${effortPeer.effort_type} = ${schema.activityEfforts.effort_type}
            and ${effortPeer.duration_seconds} = ${schema.activityEfforts.duration_seconds}
            and ${effortPeer.recorded_at} <= ${request.asOf}
            and ${effortPeer.recorded_at} >= ${effortCutoff}
            and ${
              request.activityIdToExclude === undefined
                ? sql`true`
                : sql`${effortPeer.activity_id} is distinct from ${request.activityIdToExclude}`
            }
            and (
              ${effortPeer.recorded_at} > ${schema.activityEfforts.recorded_at}
              or (
                ${effortPeer.recorded_at} = ${schema.activityEfforts.recorded_at}
                and ${effortPeer.id} >= ${schema.activityEfforts.id}
              )
            )
          order by ${effortPeer.recorded_at} desc, ${effortPeer.id} desc
          offset ${CALIBRATION_CANDIDATE_LIMIT}
          limit 1
        )`,
      );
    });
    const profileMetricQuery = db
      .select({
        id: schema.profileMetrics.id,
        profile_id: schema.profileMetrics.profile_id,
        metric_type: schema.profileMetrics.metric_type,
        recorded_at: schema.profileMetrics.recorded_at,
        unit: schema.profileMetrics.unit,
        value: schema.profileMetrics.value,
        source: schema.profileMetrics.source,
        method: schema.profileMetrics.method,
        calculation_version: schema.profileMetrics.calculation_version,
        provenance: schema.profileMetrics.provenance,
        reference_activity_id: schema.profileMetrics.reference_activity_id,
        // Preserve activity-category identity only for a single activity-role segment. Multisport parents,
        // including repeated same-category legs, remain unscoped rather than fabricating one activity_category.
        reference_activity_category: sql<string | null>`(
            select case
              when count(*) = 1
                then min(reference_segment.activity_category)
              else null
            end
            from activity_segments as reference_segment
            where reference_segment.activity_id = ${schema.profileMetrics.reference_activity_id}
              and reference_segment.role = 'activity'
          )`.as("reference_activity_category"),
      })
      .from(schema.profileMetrics)
      .where(
        and(
          or(...metricWindowPredicates),
          inArray(
            schema.profileMetrics.metric_type,
            evidenceScope === "thresholds" ? (["max_hr"] as const) : metricTypes,
          ),
        ),
      )
      .orderBy(desc(schema.profileMetrics.recorded_at), desc(schema.profileMetrics.id))
      .limit(metricQueryLimit + (metricTheoreticalLimit > metricQueryLimit ? 1 : 0));
    // The historical reprocessor supplies canonical as-of targets explicitly.
    // Re-reading best-effort history cannot alter its target-based load result.
    const effortQuery =
      evidenceScope === "thresholds"
        ? Promise.resolve([])
        : db
            .select({
              id: schema.activityEfforts.id,
              activity_id: schema.activityEfforts.activity_id,
              profile_id: schema.activityEfforts.profile_id,
              activity_category: schema.activityEfforts.activity_category,
              duration_seconds: schema.activityEfforts.duration_seconds,
              distance_meters: schema.activityEfforts.distance_meters,
              effort_type: schema.activityEfforts.effort_type,
              recorded_at: schema.activityEfforts.recorded_at,
              unit: schema.activityEfforts.unit,
              value: schema.activityEfforts.value,
              method: schema.activityEfforts.method,
              calculation_version: schema.activityEfforts.calculation_version,
              provenance: schema.activityEfforts.provenance,
              source: schema.activityEfforts.source,
            })
            .from(schema.activityEfforts)
            .where(
              and(
                or(...effortWindowPredicates),
                inArray(schema.activityEfforts.effort_type, effortTypes),
                or(
                  and(
                    eq(schema.activityEfforts.activity_category, "bike"),
                    eq(schema.activityEfforts.effort_type, "power"),
                    inArray(
                      schema.activityEfforts.duration_seconds,
                      CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerFitDurationsSeconds,
                    ),
                  ),
                  and(
                    eq(schema.activityEfforts.activity_category, "run"),
                    eq(schema.activityEfforts.effort_type, "speed"),
                    eq(schema.activityEfforts.duration_seconds, 1200),
                  ),
                ),
              ),
            )
            .orderBy(desc(schema.activityEfforts.recorded_at), desc(schema.activityEfforts.id))
            .limit(effortQueryLimit + (effortTheoreticalLimit > effortQueryLimit ? 1 : 0));
    const [profiles, rawProfileMetrics, rawRecentEfforts] = await Promise.all([
      db
        .select({
          profile_id: schema.profiles.id,
          dob: schema.profiles.dob,
          gender: schema.profiles.gender,
        })
        .from(schema.profiles)
        .where(inArray(schema.profiles.id, profileIds))
        .limit(profileIds.length),
      profileMetricQuery,
      effortQuery,
    ]);
    const metricEvidenceTruncated = rawProfileMetrics.length > metricQueryLimit;
    const effortEvidenceTruncated = rawRecentEfforts.length > effortQueryLimit;
    const profileMetrics = rawProfileMetrics.slice(0, metricQueryLimit);
    const boundedRecentEfforts = rawRecentEfforts.slice(0, effortQueryLimit);

    const evidenceByProfileId = new Map<string, ActivityAnalysisContextSnapshot>();
    for (const profileId of profileIds) {
      const profile = profiles.find((candidate) => candidate.profile_id === profileId);
      evidenceByProfileId.set(profileId, {
        profile: {
          dob: profile?.dob ?? null,
          gender:
            profile?.gender === "male" ||
            profile?.gender === "female" ||
            profile?.gender === "other"
              ? profile.gender
              : null,
        },
        profileMetrics: profileMetrics.flatMap((metric) => {
          if (metric.profile_id !== profileId) return [];
          const metricType = activityAnalysisMetricTypeSchema.safeParse(metric.metric_type);
          if (!metricType.success) return [];
          return [
            {
              id: metric.id,
              metric_type: metricType.data,
              recorded_at: metric.recorded_at,
              unit: metric.unit,
              value: toNumber(metric.value),
              source: metric.source,
              method: metric.method,
              calculation_version: metric.calculation_version,
              provenance: metric.provenance,
              reference_activity_id: metric.reference_activity_id,
              reference_activity_category: metric.reference_activity_category,
            },
          ];
        }),
        recentEfforts: boundedRecentEfforts
          .filter((effort) => effort.profile_id === profileId)
          .map((effort) => ({
            id: effort.id,
            activity_id: effort.activity_id,
            activity_category: effort.activity_category,
            duration_seconds: effort.duration_seconds,
            distance_meters: effort.distance_meters,
            effort_type: effort.effort_type,
            recorded_at: effort.recorded_at,
            unit: effort.unit,
            value: toNumber(effort.value),
            method: effort.method,
            calculation_version: effort.calculation_version,
            provenance: effort.provenance,
            source: effort.source,
          })),
        ...(metricEvidenceTruncated || effortEvidenceTruncated
          ? { calibrationTruncated: true }
          : {}),
      });
    }
    return evidenceByProfileId;
  };

  return {
    getPerformanceModelAsOf: ({ asOf, profileId, activityIdToExclude }) =>
      readPerformanceModel({
        actorProfileId: profileId,
        asOf,
        ...(activityIdToExclude === undefined ? {} : { excludedActivityId: activityIdToExclude }),
      }),
    getPerformanceTargetsAsOf: ({ asOf, profileId, activityIdToExclude }) =>
      readPerformanceTargets({
        actorProfileId: profileId,
        asOf,
        ...(activityIdToExclude === undefined ? {} : { excludedActivityId: activityIdToExclude }),
      }),
    getPerformanceTargetsForRequests: ({ requests }) =>
      readPerformanceTargetsBatch(
        requests.map((request) => ({
          actorProfileId: request.profileId,
          asOf: request.asOf,
          ...(request.activityIdToExclude === undefined
            ? {}
            : { excludedActivityId: request.activityIdToExclude }),
        })),
      ),
    getPerformanceTargetSelectionsForActivities: ({ profileId, activities }) =>
      selectActivityAnalysisPerformanceTargets(db, { profileId, activities }),
    loadContextEvidence,
    async getContextSnapshot({
      asOf,
      effortLookbackAsOf,
      profileId,
      activityIdToExclude,
      evidenceScope,
    }) {
      const evidence = await loadContextEvidence({
        requests: [
          {
            asOf,
            profileId,
            ...(effortLookbackAsOf !== undefined ? { effortLookbackAsOf } : {}),
            ...(activityIdToExclude !== undefined ? { activityIdToExclude } : {}),
          },
        ],
        ...(evidenceScope !== undefined ? { evidenceScope } : {}),
      });
      return (
        evidence.get(profileId) ?? {
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }
      );
    },
  };
}
