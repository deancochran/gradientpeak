import { type DrizzleDbClient, schema } from "@repo/db";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, lt, lte, or } from "drizzle-orm";
import type { EventReadRepository } from "../../repositories";

function serializeEventRow(row: {
  activity_plan_id: string | null;
  all_day: boolean | null;
  created_at: Date;
  description: string | null;
  ends_at: Date | null;
  event_type: "planned_activity" | "rest_day" | "race" | "custom" | "imported";
  id: string;
  idx: number | null;
  linked_activity_id: string | null;
  notes: string | null;
  occurrence_key: string | null;
  original_starts_at: Date | null;
  profile_id: string;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  series_id: string | null;
  source_provider: string | null;
  starts_at: Date;
  status: "scheduled" | "completed" | "cancelled" | null;
  timezone: string | null;
  title: string | null;
  training_plan_id: string | null;
  updated_at: Date;
}) {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    starts_at: row.starts_at.toISOString(),
    ends_at: row.ends_at?.toISOString() ?? null,
    original_starts_at: row.original_starts_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
    activity_plan: null,
  };
}

const eventColumns = {
  id: schema.events.id,
  idx: schema.events.idx,
  profile_id: schema.events.profile_id,
  event_type: schema.events.event_type,
  title: schema.events.title,
  description: schema.events.description,
  all_day: schema.events.all_day,
  timezone: schema.events.timezone,
  activity_plan_id: schema.events.activity_plan_id,
  training_plan_id: schema.events.training_plan_id,
  recurrence_rule: schema.events.recurrence_rule,
  recurrence_timezone: schema.events.recurrence_timezone,
  series_id: schema.events.series_id,
  source_provider: schema.events.source_provider,
  occurrence_key: schema.events.occurrence_key,
  original_starts_at: schema.events.original_starts_at,
  notes: schema.events.notes,
  status: schema.events.status,
  linked_activity_id: schema.events.linked_activity_id,
  created_at: schema.events.created_at,
  updated_at: schema.events.updated_at,
  starts_at: schema.events.starts_at,
  ends_at: schema.events.ends_at,
} as const;

export function createEventReadRepository(db: DrizzleDbClient): EventReadRepository {
  return {
    async getOwnedEventById({ eventId, profileId }) {
      const [row] = await db
        .select(eventColumns)
        .from(schema.events)
        .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, profileId)))
        .limit(1);

      return row ? serializeEventRow(row) : null;
    },

    async countOwnedEventsInRange({ profileId, startsAtGte, startsAtLt }) {
      const [row] = await db
        .select({ value: count() })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            gte(schema.events.starts_at, new Date(startsAtGte)),
            lt(schema.events.starts_at, new Date(startsAtLt)),
          ),
        );

      return row?.value ?? 0;
    },

    async listCompletedActivitiesInRange({ profileId, startedAtGte, startedAtLt }) {
      const rows = await db
        .select({ id: schema.activities.id, started_at: schema.activities.started_at })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, new Date(startedAtGte)),
            lt(schema.activities.started_at, new Date(startedAtLt)),
          ),
        );

      return rows.map((row) => ({ id: row.id, started_at: row.started_at.toISOString() }));
    },

    async listPlannedEventDatesInRange({ profileId, startsAtGte, startsAtLte }) {
      const rows = await db
        .select({ starts_at: schema.events.starts_at })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned_activity"),
            gte(schema.events.starts_at, new Date(startsAtGte)),
            lte(schema.events.starts_at, new Date(startsAtLte)),
          ),
        )
        .orderBy(asc(schema.events.starts_at));

      return rows.map((row) => ({ starts_at: row.starts_at.toISOString() }));
    },

    async getValidateConstraintsInputs({
      activityPlanId,
      effortCutoffIso,
      profileId,
      trainingPlanId,
    }) {
      const [trainingPlan, activityPlan, profile, best20mPower, lthrMetric, weightMetric] =
        await Promise.all([
          db
            .select({ id: schema.trainingPlans.id, structure: schema.trainingPlans.structure })
            .from(schema.trainingPlans)
            .where(
              and(
                eq(schema.trainingPlans.id, trainingPlanId),
                eq(schema.trainingPlans.profile_id, profileId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null),
          db
            .select({
              id: schema.activityPlans.id,
              activity_category: schema.activityPlans.activity_category,
              structure: schema.activityPlans.structure,
              route_id: schema.activityPlans.route_id,
            })
            .from(schema.activityPlans)
            .where(
              and(
                eq(schema.activityPlans.id, activityPlanId),
                or(
                  eq(schema.activityPlans.profile_id, profileId),
                  eq(schema.activityPlans.is_system_template, true),
                ),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null),
          db
            .select({ dob: schema.profiles.dob })
            .from(schema.profiles)
            .where(eq(schema.profiles.id, profileId))
            .limit(1)
            .then((rows) => rows[0] ?? null),
          db
            .select({ value: schema.activityEfforts.value })
            .from(schema.activityEfforts)
            .where(
              and(
                eq(schema.activityEfforts.profile_id, profileId),
                eq(schema.activityEfforts.activity_category, "bike"),
                eq(schema.activityEfforts.effort_type, "power"),
                eq(schema.activityEfforts.duration_seconds, 1200),
                gte(schema.activityEfforts.recorded_at, new Date(effortCutoffIso)),
              ),
            )
            .orderBy(desc(schema.activityEfforts.value))
            .limit(1)
            .then((rows) => rows[0] ?? null),
          db
            .select({ value: schema.profileMetrics.value })
            .from(schema.profileMetrics)
            .where(
              and(
                eq(schema.profileMetrics.profile_id, profileId),
                eq(schema.profileMetrics.metric_type, "lthr"),
              ),
            )
            .orderBy(desc(schema.profileMetrics.recorded_at))
            .limit(1)
            .then((rows) => rows[0] ?? null),
          db
            .select({ value: schema.profileMetrics.value })
            .from(schema.profileMetrics)
            .where(
              and(
                eq(schema.profileMetrics.profile_id, profileId),
                eq(schema.profileMetrics.metric_type, "weight_kg"),
              ),
            )
            .orderBy(desc(schema.profileMetrics.recorded_at))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        ]);

      return {
        trainingPlan,
        activityPlan,
        profile: profile
          ? {
              dob: profile.dob ? profile.dob.toISOString() : null,
            }
          : null,
        best20mPower,
        lthrMetric: lthrMetric
          ? {
              value: lthrMetric.value,
            }
          : null,
        weightMetric: weightMetric
          ? {
              value: weightMetric.value,
            }
          : null,
      };
    },

    async getEstimationInputs({ effortCutoffIso, profileId, routeIds }) {
      const [profile, efforts, metrics, routes] = await Promise.all([
        db
          .select({ dob: schema.profiles.dob })
          .from(schema.profiles)
          .where(eq(schema.profiles.id, profileId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({
            effort_type: schema.activityEfforts.effort_type,
            duration_seconds: schema.activityEfforts.duration_seconds,
            value: schema.activityEfforts.value,
            unit: schema.activityEfforts.unit,
            activity_category: schema.activityEfforts.activity_category,
          })
          .from(schema.activityEfforts)
          .where(
            and(
              eq(schema.activityEfforts.profile_id, profileId),
              gte(schema.activityEfforts.recorded_at, new Date(effortCutoffIso)),
              inArray(schema.activityEfforts.effort_type, ["power", "speed"]),
            ),
          )
          .orderBy(desc(schema.activityEfforts.recorded_at))
          .limit(300),
        db
          .select({
            metric_type: schema.profileMetrics.metric_type,
            value: schema.profileMetrics.value,
            recorded_at: schema.profileMetrics.recorded_at,
          })
          .from(schema.profileMetrics)
          .where(
            and(
              eq(schema.profileMetrics.profile_id, profileId),
              inArray(schema.profileMetrics.metric_type, [
                "weight_kg",
                "resting_hr",
                "max_hr",
                "lthr",
              ]),
            ),
          )
          .orderBy(desc(schema.profileMetrics.recorded_at)),
        routeIds.length > 0
          ? db
              .select({
                id: schema.activityRoutes.id,
                distance_meters: schema.activityRoutes.total_distance,
                total_ascent: schema.activityRoutes.total_ascent,
                total_descent: schema.activityRoutes.total_descent,
              })
              .from(schema.activityRoutes)
              .where(inArray(schema.activityRoutes.id, routeIds))
          : Promise.resolve([]),
      ]);

      return {
        profile: profile
          ? {
              dob: profile.dob ? profile.dob.toISOString() : null,
            }
          : null,
        efforts,
        metrics: metrics.map((metric) => ({
          metric_type: metric.metric_type as "weight_kg" | "resting_hr" | "max_hr" | "lthr",
          value: metric.value,
          recorded_at: metric.recorded_at.toISOString(),
        })),
        routes,
      };
    },

    async getAccessibleTrainingPlanProjection({
      endDateExclusiveIso,
      profileId,
      startDateIso,
      trainingPlanId,
    }) {
      const trainingPlan = trainingPlanId
        ? await db
            .select({ id: schema.trainingPlans.id, structure: schema.trainingPlans.structure })
            .from(schema.trainingPlans)
            .where(
              and(
                eq(schema.trainingPlans.id, trainingPlanId),
                or(
                  eq(schema.trainingPlans.profile_id, profileId),
                  eq(schema.trainingPlans.is_public, true),
                ),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : null;

      const plannedEvents = await db
        .select({
          starts_at: schema.events.starts_at,
          training_plan_id: schema.events.training_plan_id,
          activity_plan: schema.activityPlans,
        })
        .from(schema.events)
        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned_activity"),
            gte(schema.events.starts_at, new Date(startDateIso)),
            lt(schema.events.starts_at, new Date(endDateExclusiveIso)),
            ...(trainingPlanId ? [eq(schema.events.training_plan_id, trainingPlanId)] : []),
          ),
        );

      const actualActivities = await db
        .select({
          id: schema.activities.id,
          type: schema.activities.type,
          started_at: schema.activities.started_at,
          finished_at: schema.activities.finished_at,
          duration_seconds: schema.activities.duration_seconds,
          moving_seconds: schema.activities.moving_seconds,
          distance_meters: schema.activities.distance_meters,
          avg_heart_rate: schema.activities.avg_heart_rate,
          max_heart_rate: schema.activities.max_heart_rate,
          avg_power: schema.activities.avg_power,
          max_power: schema.activities.max_power,
          avg_speed_mps: schema.activities.avg_speed_mps,
          max_speed_mps: schema.activities.max_speed_mps,
          normalized_power: schema.activities.normalized_power,
          normalized_speed_mps: schema.activities.normalized_speed_mps,
          normalized_graded_speed_mps: schema.activities.normalized_graded_speed_mps,
        })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, new Date(startDateIso)),
            lt(schema.activities.started_at, new Date(endDateExclusiveIso)),
          ),
        );

      return {
        trainingPlan,
        plannedActivities: plannedEvents.map((item) => ({
          starts_at: item.starts_at.toISOString(),
          scheduled_date: item.starts_at.toISOString().split("T")[0] ?? "",
          training_plan_id: item.training_plan_id,
          activity_plan: item.activity_plan as any,
        })),
        actualActivities: actualActivities.map((activity) => ({
          ...activity,
          started_at: activity.started_at.toISOString(),
          finished_at: activity.finished_at.toISOString(),
        })),
      };
    },

    async listOwnedEvents(input) {
      const conditions = [eq(schema.events.profile_id, input.profileId)];

      if (input.eventTypes && input.eventTypes.length > 0) {
        conditions.push(inArray(schema.events.event_type, input.eventTypes));
      }

      if (input.trainingPlanId) {
        conditions.push(eq(schema.events.training_plan_id, input.trainingPlanId));
      } else if (!input.includeAdhoc) {
        conditions.push(isNotNull(schema.events.training_plan_id));
      }

      if (input.activityPlanId) {
        conditions.push(eq(schema.events.activity_plan_id, input.activityPlanId));
      }

      if (input.dateFrom) {
        conditions.push(gte(schema.events.starts_at, new Date(input.dateFrom)));
      }

      if (input.dateTo) {
        conditions.push(lt(schema.events.starts_at, new Date(input.dateTo)));
      }

      if (input.cursor) {
        const cursorDate = new Date(input.cursor.startsAt);
        conditions.push(
          or(
            gt(schema.events.starts_at, cursorDate),
            and(eq(schema.events.starts_at, cursorDate), gt(schema.events.id, input.cursor.id)),
          )!,
        );
      }

      if (input.activityCategory) {
        conditions.push(eq(schema.activityPlans.activity_category, input.activityCategory));
      }

      const rows = await db
        .select(eventColumns)
        .from(schema.events)
        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(and(...conditions))
        .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
        .limit(input.limit);

      return rows.map((row) => serializeEventRow(row));
    },
  };
}
