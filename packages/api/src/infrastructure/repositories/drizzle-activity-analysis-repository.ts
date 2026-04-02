import { type DrizzleDbClient, schema } from "@repo/db";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { ActivityAnalysisStore } from "../../repositories";

const metricTypes = ["weight_kg", "resting_hr", "max_hr", "lthr"] as const;
const effortTypes = ["power", "speed"] as const;

function toNumber(value: string | number | null): number {
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

export function createActivityAnalysisStore(db: DrizzleDbClient): ActivityAnalysisStore {
  return {
    async getContextSnapshot({ asOf, profileId }) {
      const [profile, profileMetrics, recentEfforts] = await Promise.all([
        db.query.profiles.findFirst({
          columns: { dob: true, gender: true },
          where: eq(schema.profiles.id, profileId),
        }),
        db
          .select({
            metric_type: schema.profileMetrics.metric_type,
            recorded_at: schema.profileMetrics.recorded_at,
            value: schema.profileMetrics.value,
          })
          .from(schema.profileMetrics)
          .where(
            and(
              eq(schema.profileMetrics.profile_id, profileId),
              lte(schema.profileMetrics.recorded_at, asOf),
              inArray(schema.profileMetrics.metric_type, metricTypes),
            ),
          )
          .orderBy(desc(schema.profileMetrics.recorded_at)),
        db
          .select({
            activity_category: schema.activityEfforts.activity_category,
            duration_seconds: schema.activityEfforts.duration_seconds,
            effort_type: schema.activityEfforts.effort_type,
            recorded_at: schema.activityEfforts.recorded_at,
            value: schema.activityEfforts.value,
          })
          .from(schema.activityEfforts)
          .where(
            and(
              eq(schema.activityEfforts.profile_id, profileId),
              lte(schema.activityEfforts.recorded_at, asOf),
              inArray(schema.activityEfforts.effort_type, effortTypes),
            ),
          )
          .orderBy(desc(schema.activityEfforts.recorded_at))
          .limit(50),
      ]);

      return {
        profile: {
          dob: profile?.dob ?? null,
          gender:
            profile?.gender === "male" ||
            profile?.gender === "female" ||
            profile?.gender === "other"
              ? profile.gender
              : null,
        },
        profileMetrics: profileMetrics.map((metric) => ({
          metric_type: metric.metric_type as "weight_kg" | "resting_hr" | "max_hr" | "lthr",
          recorded_at: metric.recorded_at,
          value: toNumber(metric.value),
        })),
        recentEfforts: recentEfforts.map((effort) => ({
          activity_category: effort.activity_category,
          duration_seconds: effort.duration_seconds,
          effort_type: effort.effort_type,
          recorded_at: effort.recorded_at,
          value: toNumber(effort.value),
        })),
      };
    },
  };
}
