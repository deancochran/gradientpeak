import { getScheduledDateKey } from "@repo/core";
import { compileActivityPlanV3 } from "@repo/core/activity-plan";
import { type DrizzleDbClient, schema } from "@repo/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  getCurrentPlanningWeek,
  getPlanningDateRange,
} from "../../application/training-plan/current-planning-week";
import type { EventReadRepository } from "../../repositories";
import {
  filterSupersededProfileOverrides,
  isClearedProfileOverride,
  resolveLatestObservationsByKey,
} from "../../utils/profile-override-observations";

type EventReadDb = {
  execute: unknown;
  query: unknown;
  select: unknown;
};

function resolveDb(dbInput: EventReadDb | { db: EventReadDb }) {
  return "db" in dbInput ? dbInput.db : dbInput;
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function serializeActivityPlanRow(activityPlan: typeof schema.activityPlans.$inferSelect | null) {
  if (!activityPlan) {
    return null;
  }

  return {
    ...activityPlan,
    categories: compileActivityPlanV3(activityPlan.structure).categories,
    primary_category: compileActivityPlanV3(activityPlan.structure).primaryCategory,
    created_at: activityPlan.created_at.toISOString(),
    updated_at: activityPlan.updated_at.toISOString(),
  };
}

function serializeEventRow(row: {
  activity_plan_id: string | null;
  activity_plan: typeof schema.activityPlans.$inferSelect | null;
  all_day: boolean | null;
  created_at: Date;
  description: string | null;
  ends_at: Date | null;
  event_type: "planned" | "race_target" | "custom" | "imported";
  id: string;
  linked_activity_id: string | null;
  notes: string | null;
  occurrence_key: string | null;
  original_starts_at: Date | null;
  profile_id: string;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  scheduled_date: string | null;
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
    all_day: row.all_day ?? false,
    linked_activity_id: row.linked_activity_id,
    occurrence_key: row.occurrence_key ?? "",
    recurrence_rule: row.recurrence_rule,
    recurrence_timezone: row.recurrence_timezone,
    series_id: row.series_id,
    source_provider: row.source_provider,
    status: row.status ?? "scheduled",
    timezone: row.timezone ?? "UTC",
    title: row.title ?? "",
    training_plan_id: row.training_plan_id,
    created_at: row.created_at.toISOString(),
    starts_at: row.starts_at.toISOString(),
    scheduled_date:
      row.scheduled_date ?? getScheduledDateKey(row.starts_at.toISOString(), row.timezone),
    ends_at: row.ends_at?.toISOString() ?? null,
    original_starts_at: row.original_starts_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
    activity_plan: serializeActivityPlanRow(row.activity_plan),
  };
}

const eventColumns = {
  id: schema.events.id,
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
  scheduled_date: schema.events.scheduled_date,
  ends_at: schema.events.ends_at,
} as const;

export function createEventReadRepository(
  dbInput: EventReadDb | { db: EventReadDb },
): EventReadRepository {
  const db = resolveDb(dbInput) as DrizzleDbClient;

  return {
    async getEffectivePlanLoadInputs({
      asOf,
      endDate: requestedEndDate,
      profileId,
      startDate: requestedStartDate,
    }) {
      const profile = await db
        .select({ planningTimezone: schema.profiles.planning_timezone })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, profileId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      const planningTimezone = profile?.planningTimezone?.trim() || null;
      let range: ReturnType<typeof getPlanningDateRange> | null = null;
      if (requestedStartDate && requestedEndDate && planningTimezone) {
        try {
          range = getPlanningDateRange({
            startDate: requestedStartDate,
            endDate: requestedEndDate,
            timezone: planningTimezone,
          });
        } catch {
          // The application returns the profile-owned timezone failure without treating it as zero.
        }
      }
      if (!range && planningTimezone) {
        try {
          range = getCurrentPlanningWeek(asOf, planningTimezone);
        } catch {
          // The application returns the profile-owned timezone failure without treating it as zero.
        }
      }
      if (!range || !planningTimezone) {
        return {
          activities: [],
          events: [],
          planningTimezone,
          resolvedRange: { startDate: null, endDate: null },
          sourceCounts: { activities: 0, events: 0 },
          sourceCoverage: { activities: null, scheduledItems: null },
        };
      }
      const { startDate, endDate } = range;
      const envelopeStart = getPlanningDateRange({
        startDate: addCalendarDays(startDate, -1),
        endDate: addCalendarDays(startDate, -1),
        timezone: planningTimezone,
      }).startInstant;
      const envelopeEnd = getPlanningDateRange({
        startDate: addCalendarDays(endDate, 1),
        endDate: addCalendarDays(endDate, 1),
        timezone: planningTimezone,
      }).endExclusiveInstant;
      const boundedLimit = 10_001;
      const [eventRows, activityRows] = await Promise.all([
        db
          .select({ ...eventColumns, activity_plan: schema.activityPlans })
          .from(schema.events)
          .leftJoin(
            schema.activityPlans,
            eq(schema.events.activity_plan_id, schema.activityPlans.id),
          )
          .where(
            and(
              eq(schema.events.profile_id, profileId),
              eq(schema.events.event_type, "planned"),
              gte(schema.events.scheduled_date, startDate),
              lte(schema.events.scheduled_date, endDate),
            ),
          )
          .orderBy(
            asc(schema.events.scheduled_date),
            asc(schema.events.starts_at),
            asc(schema.events.id),
          )
          .limit(boundedLimit),
        db
          .select()
          .from(schema.activities)
          .where(
            and(
              eq(schema.activities.profile_id, profileId),
              gte(schema.activities.started_at, envelopeStart),
              lt(schema.activities.started_at, envelopeEnd),
            ),
          )
          .orderBy(asc(schema.activities.started_at), asc(schema.activities.id))
          .limit(boundedLimit),
      ]);
      const activitiesStatus = activityRows.length === boundedLimit ? "partial" : "complete";
      const scheduledItemsStatus = eventRows.length === boundedLimit ? "partial" : "complete";
      return {
        activities: activityRows.slice(0, boundedLimit - 1),
        events: eventRows.slice(0, boundedLimit - 1).map((row) => {
          if (row.scheduled_date === null) {
            throw new Error("Effective-plan scheduled event is missing scheduled_date.");
          }
          return {
            ...serializeEventRow(row),
            scheduled_date: row.scheduled_date,
          };
        }),
        planningTimezone,
        resolvedRange: range,
        sourceCounts: {
          activities: Math.min(activityRows.length, boundedLimit - 1),
          events: Math.min(eventRows.length, boundedLimit - 1),
        },
        sourceCoverage: {
          activities: { ...range, status: activitiesStatus },
          scheduledItems: { ...range, status: scheduledItemsStatus },
        },
      };
    },

    async getOwnedEventById({ eventId, profileId }) {
      const [row] = await db
        .select({
          ...eventColumns,
          activity_plan: schema.activityPlans,
        })
        .from(schema.events)
        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
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
        .select({
          activity_plan_id: schema.activities.activity_plan_id,
          id: schema.activities.id,
          started_at: schema.activities.started_at,
        })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, new Date(startedAtGte)),
            lt(schema.activities.started_at, new Date(startedAtLt)),
          ),
        );

      return rows.map((row) => ({
        activity_plan_id: row.activity_plan_id,
        id: row.id,
        started_at: row.started_at.toISOString(),
      }));
    },

    async listPlannedEventDatesInRange({ profileId, startsAtGte, startsAtLte }) {
      const rows = await db
        .select({ starts_at: schema.events.starts_at })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned"),
            gte(schema.events.starts_at, new Date(startsAtGte)),
            lte(schema.events.starts_at, new Date(startsAtLte)),
          ),
        )
        .orderBy(asc(schema.events.starts_at));

      return rows.map((row) => ({ starts_at: row.starts_at.toISOString() }));
    },

    async getValidateConstraintsInputs({ activityPlanId, profileId, trainingPlanId }) {
      const [trainingPlan, activityPlan, profile, lthrMetric, weightMetric] = await Promise.all([
        db
          .select({
            id: schema.trainingPlans.id,
            structure: schema.trainingPlans.structure,
          })
          .from(schema.trainingPlans)
          .where(eq(schema.trainingPlans.id, trainingPlanId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({
            id: schema.activityPlans.id,
            gps_recording_enabled: schema.activityPlans.gps_recording_enabled,
            structure: schema.activityPlans.structure,
            structure_hash: schema.activityPlans.structure_hash,
          })
          .from(schema.activityPlans)
          .where(eq(schema.activityPlans.id, activityPlanId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({ dob: schema.profiles.dob })
          .from(schema.profiles)
          .where(eq(schema.profiles.id, profileId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({
            value: schema.profileMetrics.value,
            method: schema.profileMetrics.method,
            provenance: schema.profileMetrics.provenance,
          })
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
          .select({
            value: schema.profileMetrics.value,
            method: schema.profileMetrics.method,
            provenance: schema.profileMetrics.provenance,
          })
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
        lthrMetric:
          lthrMetric && !isClearedProfileOverride(lthrMetric)
            ? {
                value: lthrMetric.value,
              }
            : null,
        weightMetric:
          weightMetric && !isClearedProfileOverride(weightMetric)
            ? {
                value: weightMetric.value,
              }
            : null,
      };
    },

    async getEstimationInputs({ asOfIso, effortCutoffIso, profileId, routeIds }) {
      const asOf = new Date(asOfIso);
      const [profile, efforts, metrics, routes] = await Promise.all([
        db
          .select({ dob: schema.profiles.dob })
          .from(schema.profiles)
          .where(eq(schema.profiles.id, profileId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({
            id: schema.activityEfforts.id,
            activity_id: schema.activityEfforts.activity_id,
            effort_type: schema.activityEfforts.effort_type,
            duration_seconds: schema.activityEfforts.duration_seconds,
            value: schema.activityEfforts.value,
            unit: schema.activityEfforts.unit,
            activity_category: schema.activityEfforts.activity_category,
            recorded_at: schema.activityEfforts.recorded_at,
            source: schema.activityEfforts.source,
            method: schema.activityEfforts.method,
            calculation_version: schema.activityEfforts.calculation_version,
            quality_score: schema.activityEfforts.quality_score,
            provenance: schema.activityEfforts.provenance,
          })
          .from(schema.activityEfforts)
          .where(
            and(
              eq(schema.activityEfforts.profile_id, profileId),
              gte(schema.activityEfforts.recorded_at, new Date(effortCutoffIso)),
              lte(schema.activityEfforts.recorded_at, asOf),
              inArray(schema.activityEfforts.effort_type, ["power", "speed"]),
            ),
          )
          .orderBy(desc(schema.activityEfforts.recorded_at))
          .limit(300),
        db
          .select({
            id: schema.profileMetrics.id,
            metric_type: schema.profileMetrics.metric_type,
            unit: schema.profileMetrics.unit,
            value: schema.profileMetrics.value,
            recorded_at: schema.profileMetrics.recorded_at,
            source: schema.profileMetrics.source,
            method: schema.profileMetrics.method,
            calculation_version: schema.profileMetrics.calculation_version,
            quality_score: schema.profileMetrics.quality_score,
            provenance: schema.profileMetrics.provenance,
          })
          .from(schema.profileMetrics)
          .where(
            and(
              eq(schema.profileMetrics.profile_id, profileId),
              lte(schema.profileMetrics.recorded_at, asOf),
              inArray(schema.profileMetrics.metric_type, [
                "weight_kg",
                "ftp",
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
                updated_at: schema.activityRoutes.updated_at,
              })
              .from(schema.activityRoutes)
              .where(
                and(
                  inArray(schema.activityRoutes.id, routeIds),
                  or(
                    eq(schema.activityRoutes.profile_id, profileId),
                    eq(schema.activityRoutes.is_public, true),
                    eq(schema.activityRoutes.is_system_template, true),
                    sql`exists (
                      select 1
                      from content_access_grants
                      where content_access_grants.content_type = 'activity_route'
                        and content_access_grants.content_id = ${schema.activityRoutes.id}
                        and content_access_grants.grantee_profile_id = ${profileId}::uuid
                        and content_access_grants.access_level in ('read', 'read_geometry')
                        and content_access_grants.revoked_at is null
                        and (content_access_grants.expires_at is null or content_access_grants.expires_at > ${asOf})
                    )`,
                  ),
                ),
              )
          : Promise.resolve([]),
      ]);

      return {
        profile: profile
          ? {
              dob: profile.dob ? profile.dob.toISOString() : null,
            }
          : null,
        efforts: filterSupersededProfileOverrides(
          efforts,
          (effort) =>
            `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}:${effort.unit}`,
        ).map((effort) => ({
          ...effort,
          recorded_at: effort.recorded_at.toISOString(),
        })),
        metrics: [
          ...resolveLatestObservationsByKey(metrics, (metric) => metric.metric_type).values(),
        ]
          .filter((metric) => metric !== null)
          .map((metric) => ({
            metric_type: metric.metric_type as
              | "weight_kg"
              | "ftp"
              | "resting_hr"
              | "max_hr"
              | "lthr",
            unit: metric.unit,
            value: metric.value,
            recorded_at: metric.recorded_at.toISOString(),
            source: metric.source,
            method: metric.method,
            calculation_version: metric.calculation_version,
            quality_score: metric.quality_score,
            provenance: metric.provenance,
          })),
        routes: routes.map((route) => ({
          ...route,
          updated_at: route.updated_at.toISOString(),
        })),
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
            .select({
              id: schema.trainingPlans.id,
              structure: schema.trainingPlans.structure,
            })
            .from(schema.trainingPlans)
            .where(
              and(
                eq(schema.trainingPlans.id, trainingPlanId),
                or(
                  eq(schema.trainingPlans.profile_id, profileId),
                  eq(schema.trainingPlans.content_visibility, "public"),
                  eq(schema.trainingPlans.is_system_template, true),
                  and(
                    eq(schema.trainingPlans.content_visibility, "followers"),
                    sql`exists (
                      select 1
                      from ${schema.follows}
                      where ${schema.follows.follower_id} = ${profileId}
                        and ${schema.follows.following_id} = ${schema.trainingPlans.profile_id}
                        and ${schema.follows.status} = 'accepted'
                    )`,
                  ),
                ),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : null;

      const plannedEvents = await db
        .select({
          starts_at: schema.events.starts_at,
          scheduled_date: schema.events.scheduled_date,
          training_plan_id: schema.events.training_plan_id,
          activity_plan: schema.activityPlans,
        })
        .from(schema.events)

        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned"),
            gte(schema.events.starts_at, new Date(startDateIso)),
            lt(schema.events.starts_at, new Date(endDateExclusiveIso)),
            ...(trainingPlanId ? [eq(schema.events.training_plan_id, trainingPlanId)] : []),
          ),
        );

      const actualActivities = await db
        .select({
          id: schema.activities.id,
          name: schema.activities.name,
          started_at: schema.activities.started_at,
          finished_at: schema.activities.finished_at,
          elapsed_ms: schema.activities.elapsed_ms,
          active_ms: schema.activities.active_ms,
          moving_ms: schema.activities.moving_ms,
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
          scheduled_date:
            item.scheduled_date ?? getScheduledDateKey(item.starts_at.toISOString(), "UTC"),
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
      const trainingPlanId = schema.events.training_plan_id;
      const activityPlanId = schema.events.activity_plan_id;
      const isPersistedDateAnchoredEvent = and(isNotNull(schema.events.scheduled_date));
      const isTimedOrLegacyEvent = isNull(schema.events.scheduled_date);

      if (input.eventTypes && input.eventTypes.length > 0) {
        conditions.push(inArray(schema.events.event_type, input.eventTypes));
      }

      if (input.trainingPlanId) {
        conditions.push(eq(trainingPlanId, input.trainingPlanId));
      } else if (!input.includeAdhoc) {
        conditions.push(isNotNull(trainingPlanId));
      }

      if (input.activityPlanId) {
        conditions.push(eq(activityPlanId, input.activityPlanId));
      }

      if (input.dateFrom) {
        const scheduleDateFrom = input.dateFrom.slice(0, 10);
        const dateFromCondition = or(
          and(isPersistedDateAnchoredEvent, gte(schema.events.scheduled_date, scheduleDateFrom)),
          and(isTimedOrLegacyEvent, gte(schema.events.starts_at, new Date(input.dateFrom))),
        );
        if (!dateFromCondition) throw new Error("Event date-from filter could not be constructed.");
        conditions.push(dateFromCondition);
      }

      if (input.dateTo) {
        const scheduleDateTo = input.dateTo.slice(0, 10);
        const dateToCondition = or(
          and(isPersistedDateAnchoredEvent, lt(schema.events.scheduled_date, scheduleDateTo)),
          and(isTimedOrLegacyEvent, lt(schema.events.starts_at, new Date(input.dateTo))),
        );
        if (!dateToCondition) throw new Error("Event date-to filter could not be constructed.");
        conditions.push(dateToCondition);
      }

      if (input.cursor) {
        const cursorDate = new Date(input.cursor.startsAt);
        const cursorCondition = or(
          gt(schema.events.starts_at, cursorDate),
          and(eq(schema.events.starts_at, cursorDate), gt(schema.events.id, input.cursor.id)),
        );
        if (!cursorCondition) throw new Error("Event cursor filter could not be constructed.");
        conditions.push(cursorCondition);
      }

      if (input.activityCategory) {
        conditions.push(
          sql`${schema.activityPlans.structure} @> ${JSON.stringify({
            segments: [{ category: input.activityCategory }],
          })}::jsonb`,
        );
      }

      const rows = await db
        .select({
          ...eventColumns,
          activity_plan: schema.activityPlans,
        })
        .from(schema.events)

        .leftJoin(schema.activityPlans, eq(activityPlanId, schema.activityPlans.id))

        .where(and(...conditions))
        .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
        .limit(input.limit);

      return rows.map((row) => serializeEventRow(row));
    },
  };
}
