import { CRITICAL_POWER_CANONICAL_DURATIONS } from "@repo/core/calculations";
import { schema } from "@repo/db";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";
import type { ActivityAnalysisContextSnapshot, ActivityAnalysisStore } from "../../repositories";

const metricTypes = [
  "weight_kg",
  "ftp",
  "resting_hr",
  "max_hr",
  "lthr",
  "threshold_pace_seconds_per_km",
  "css_seconds_per_100m",
] as const;
const effortTypes = ["power", "speed"] as const;

function toNumber(value: string | number | null): number {
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

export function createActivityAnalysisStore(db: DrizzleQueryExecutor): ActivityAnalysisStore {
  const loadContextEvidence: NonNullable<ActivityAnalysisStore["loadContextEvidence"]> = async ({
    requests,
    evidenceScope,
  }) => {
    if (requests.length === 0) return new Map();

    const profileIds = [...new Set(requests.map((request) => request.profileId))];
    // One fixed upper bound keeps every in-memory as-of resolution on the same evidence window.
    const fixedAsOf = new Date(Math.max(...requests.map((request) => request.asOf.getTime())));
    const earliestAsOf = Math.min(
      ...requests.map((request) => (request.effortLookbackAsOf ?? request.asOf).getTime()),
    );
    const effortCutoff = new Date(earliestAsOf - 90 * 24 * 60 * 60 * 1000);
    const profileMetricBaseQuery = db
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
        // Preserve sport identity only for a single activity-role segment. Multisport parents,
        // including repeated same-category legs, remain unscoped rather than fabricating one sport.
        reference_activity_category: sql<string | null>`(
          select case
            when count(*) = 1
              then min(reference_segment.category)
            else null
          end
          from activity_segments as reference_segment
          where reference_segment.activity_id = ${schema.profileMetrics.reference_activity_id}
            and reference_segment.role = 'activity'
        )`,
      })
      .from(schema.profileMetrics);
    const profileMetricQuery = profileMetricBaseQuery;
    const [profiles, profileMetrics, recentEfforts] = await Promise.all([
      db
        .select({
          profile_id: schema.profiles.id,
          dob: schema.profiles.dob,
          gender: schema.profiles.gender,
        })
        .from(schema.profiles)
        .where(inArray(schema.profiles.id, profileIds)),
      profileMetricQuery
        .where(
          and(
            inArray(schema.profileMetrics.profile_id, profileIds),
            lte(schema.profileMetrics.recorded_at, fixedAsOf),
            inArray(
              schema.profileMetrics.metric_type,
              evidenceScope === "thresholds"
                ? ([
                    "ftp",
                    "lthr",
                    "threshold_pace_seconds_per_km",
                    "css_seconds_per_100m",
                  ] as const)
                : metricTypes,
            ),
          ),
        )
        .orderBy(desc(schema.profileMetrics.recorded_at), desc(schema.profileMetrics.id)),
      db
        .select({
          id: schema.activityEfforts.id,
          activity_id: schema.activityEfforts.activity_id,
          profile_id: schema.activityEfforts.profile_id,
          activity_category: schema.activityEfforts.activity_category,
          duration_seconds: schema.activityEfforts.duration_seconds,
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
            inArray(schema.activityEfforts.profile_id, profileIds),
            lte(schema.activityEfforts.recorded_at, fixedAsOf),
            inArray(schema.activityEfforts.effort_type, effortTypes),
            or(
              and(
                eq(schema.activityEfforts.activity_category, "bike"),
                eq(schema.activityEfforts.effort_type, "power"),
                inArray(
                  schema.activityEfforts.duration_seconds,
                  CRITICAL_POWER_CANONICAL_DURATIONS,
                ),
              ),
              and(
                inArray(schema.activityEfforts.activity_category, ["run", "swim"]),
                eq(schema.activityEfforts.effort_type, "speed"),
                eq(schema.activityEfforts.duration_seconds, 1200),
              ),
            ),
            or(
              gte(schema.activityEfforts.recorded_at, effortCutoff),
              eq(schema.activityEfforts.source, "manual"),
            ),
          ),
        )
        .orderBy(desc(schema.activityEfforts.recorded_at), desc(schema.activityEfforts.id)),
    ]);

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
        profileMetrics: profileMetrics
          .filter((metric) => metric.profile_id === profileId)
          .map((metric) => ({
            id: metric.id,
            metric_type: metric.metric_type as
              | "weight_kg"
              | "ftp"
              | "resting_hr"
              | "max_hr"
              | "lthr"
              | "threshold_pace_seconds_per_km"
              | "css_seconds_per_100m",
            recorded_at: metric.recorded_at,
            unit: metric.unit,
            value: toNumber(metric.value),
            source: metric.source,
            method: metric.method,
            calculation_version: metric.calculation_version,
            provenance: metric.provenance,
            reference_activity_id: metric.reference_activity_id,
            reference_activity_category: metric.reference_activity_category,
          })),
        recentEfforts: recentEfforts
          .filter((effort) => effort.profile_id === profileId)
          .map((effort) => ({
            id: effort.id,
            activity_id: effort.activity_id,
            activity_category: effort.activity_category,
            duration_seconds: effort.duration_seconds,
            effort_type: effort.effort_type,
            recorded_at: effort.recorded_at,
            unit: effort.unit,
            value: toNumber(effort.value),
            method: effort.method,
            calculation_version: effort.calculation_version,
            provenance: effort.provenance,
            source: effort.source,
          })),
      });
    }
    return evidenceByProfileId;
  };

  return {
    loadContextEvidence,
    async getContextSnapshot({ asOf, effortLookbackAsOf, profileId, evidenceScope }) {
      const evidence = await loadContextEvidence({
        requests: [
          {
            asOf,
            profileId,
            ...(effortLookbackAsOf !== undefined ? { effortLookbackAsOf } : {}),
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
