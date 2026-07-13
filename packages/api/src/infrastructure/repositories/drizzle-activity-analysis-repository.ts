import { type DrizzleDbClient, schema } from "@repo/db";
import { and, desc, inArray, lte } from "drizzle-orm";
import type { ActivityAnalysisContextSnapshot, ActivityAnalysisStore } from "../../repositories";

const metricTypes = ["weight_kg", "ftp", "resting_hr", "max_hr", "lthr"] as const;
const effortTypes = ["power", "speed"] as const;

function toNumber(value: string | number | null): number {
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

export function createActivityAnalysisStore(db: DrizzleDbClient): ActivityAnalysisStore {
  const loadContextEvidence: NonNullable<ActivityAnalysisStore["loadContextEvidence"]> = async ({
    requests,
  }) => {
    if (requests.length === 0) return new Map();

    const profileIds = [...new Set(requests.map((request) => request.profileId))];
    // One fixed upper bound keeps every in-memory as-of resolution on the same evidence window.
    const fixedAsOf = new Date(Math.max(...requests.map((request) => request.asOf.getTime())));
    const [profiles, profileMetrics, recentEfforts] = await Promise.all([
      db
        .select({
          profile_id: schema.profiles.id,
          dob: schema.profiles.dob,
          gender: schema.profiles.gender,
        })
        .from(schema.profiles)
        .where(inArray(schema.profiles.id, profileIds)),
      db
        .select({
          id: schema.profileMetrics.id,
          profile_id: schema.profileMetrics.profile_id,
          metric_type: schema.profileMetrics.metric_type,
          recorded_at: schema.profileMetrics.recorded_at,
          unit: schema.profileMetrics.unit,
          value: schema.profileMetrics.value,
          method: schema.profileMetrics.method,
          provenance: schema.profileMetrics.provenance,
        })
        .from(schema.profileMetrics)
        .where(
          and(
            inArray(schema.profileMetrics.profile_id, profileIds),
            lte(schema.profileMetrics.recorded_at, fixedAsOf),
            inArray(schema.profileMetrics.metric_type, metricTypes),
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
          provenance: schema.activityEfforts.provenance,
          source: schema.activityEfforts.source,
        })
        .from(schema.activityEfforts)
        .where(
          and(
            inArray(schema.activityEfforts.profile_id, profileIds),
            lte(schema.activityEfforts.recorded_at, fixedAsOf),
            inArray(schema.activityEfforts.effort_type, effortTypes),
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
              | "lthr",
            recorded_at: metric.recorded_at,
            unit: metric.unit,
            value: toNumber(metric.value),
            method: metric.method,
            provenance: metric.provenance,
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
            provenance: effort.provenance,
            source: effort.source,
          })),
      });
    }
    return evidenceByProfileId;
  };

  return {
    loadContextEvidence,
    async getContextSnapshot({ asOf, profileId }) {
      const evidence = await loadContextEvidence({ requests: [{ asOf, profileId }] });
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
