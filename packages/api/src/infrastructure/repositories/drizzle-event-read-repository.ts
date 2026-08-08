import { getCalendarDateInIanaZone } from "@repo/core/calendar";
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
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  getCurrentPlanningWeek,
  getPlanningDateRange,
} from "../../application/training-plan/current-planning-week";
import { toActivityPlanExecutionDto } from "../../dto/activity-plan";
import type { EventReadRepository } from "../../repositories";

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

  const plan = toActivityPlanExecutionDto(activityPlan);
  return {
    ...plan,
    created_at: activityPlan.created_at.toISOString(),
    updated_at: activityPlan.updated_at.toISOString(),
  };
}

function serializeActivityRouteRow(
  activityRoute: typeof schema.activityRoutes.$inferSelect | null,
) {
  if (!activityRoute) return null;

  return {
    id: activityRoute.id,
    name: activityRoute.name,
    description: activityRoute.description,
    total_distance: activityRoute.total_distance,
    total_ascent: activityRoute.total_ascent,
    total_descent: activityRoute.total_descent,
  };
}

function requireCurrentEventField<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new Error(`Invalid event row: ${field} is required`);
  }
  return value;
}

function serializeEventRow(row: {
  activity_plan_id: string | null;
  route_id: string | null;
  activity_plan: typeof schema.activityPlans.$inferSelect | null;
  activity_route: typeof schema.activityRoutes.$inferSelect | null;
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
  scheduled_date: string;
  series_id: string | null;
  source_provider: string | null;
  starts_at: Date;
  status: "scheduled" | "completed" | "cancelled" | null;
  timezone: string | null;
  title: string | null;
  training_plan_id: string | null;
  updated_at: Date;
}) {
  const { activity_route: _activityRoute, ...event } = row;
  return {
    ...event,
    all_day: requireCurrentEventField(row.all_day, "all_day"),
    linked_activity_id: row.linked_activity_id,
    occurrence_key: requireCurrentEventField(row.occurrence_key, "occurrence_key"),
    recurrence_rule: row.recurrence_rule,
    recurrence_timezone: row.recurrence_timezone,
    series_id: row.series_id,
    source_provider: row.source_provider,
    status: requireCurrentEventField(row.status, "status"),
    timezone: requireCurrentEventField(row.timezone, "timezone"),
    title: requireCurrentEventField(row.title, "title"),
    training_plan_id: row.training_plan_id,
    created_at: row.created_at.toISOString(),
    starts_at: row.starts_at.toISOString(),
    scheduled_date: row.scheduled_date,
    ends_at: row.ends_at?.toISOString() ?? null,
    original_starts_at: row.original_starts_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
    activity_plan: serializeActivityPlanRow(row.activity_plan),
    route: serializeActivityRouteRow(row.activity_route),
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
  route_id: schema.events.route_id,
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
          recommendationEvents: [],
          recommendationSource: {
            scheduleBatchId: null,
            status: "complete" as const,
            trainingPlanId: null,
          },
          planningTimezone,
          resolvedRange: { startDate: null, endDate: null },
          sourceCounts: { activities: 0, events: 0 },
          sourceCoverage: { activities: null, scheduledItems: null },
        };
      }
      const { startDate, endDate } = range;
      const planningDate = getCalendarDateInIanaZone(asOf.toISOString(), planningTimezone);
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
      const activePlanEvent = await db
        .select({
          schedule_batch_id: schema.events.schedule_batch_id,
          training_plan_id: schema.events.training_plan_id,
        })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned"),
            isNotNull(schema.events.training_plan_id),
            gte(schema.events.scheduled_date, planningDate),
            or(isNull(schema.events.status), ne(schema.events.status, "cancelled")),
          ),
        )
        .orderBy(
          asc(schema.events.scheduled_date),
          asc(schema.events.starts_at),
          asc(schema.events.id),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);
      const activeTrainingPlanId = activePlanEvent?.training_plan_id ?? null;
      const activeScheduleBatchId = activePlanEvent?.schedule_batch_id ?? null;
      const recommendationQuery = activeTrainingPlanId
        ? db
            .select({
              ...eventColumns,
              activity_plan: schema.activityPlans,
              activity_route: schema.activityRoutes,
            })
            .from(schema.events)
            .leftJoin(
              schema.activityPlans,
              eq(schema.events.activity_plan_id, schema.activityPlans.id),
            )
            .leftJoin(schema.activityRoutes, eq(schema.events.route_id, schema.activityRoutes.id))
            .where(
              and(
                eq(schema.events.profile_id, profileId),
                eq(schema.events.event_type, "planned"),
                eq(schema.events.training_plan_id, activeTrainingPlanId),
                // Recommendation is the original applied prescription, not execution state.
                // Keep moved/completed/cancelled items here; effective composition handles status.
                activeScheduleBatchId
                  ? eq(schema.events.schedule_batch_id, activeScheduleBatchId)
                  : isNull(schema.events.schedule_batch_id),
              ),
            )
            .orderBy(
              asc(schema.events.scheduled_date),
              asc(schema.events.starts_at),
              asc(schema.events.id),
            )
            .limit(boundedLimit)
        : Promise.resolve([]);
      const [eventRows, activityRows, recommendationRows] = await Promise.all([
        db
          .select({
            ...eventColumns,
            activity_plan: schema.activityPlans,
            activity_route: schema.activityRoutes,
          })
          .from(schema.events)
          .leftJoin(
            schema.activityPlans,
            eq(schema.events.activity_plan_id, schema.activityPlans.id),
          )
          .leftJoin(schema.activityRoutes, eq(schema.events.route_id, schema.activityRoutes.id))
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
          .select({
            id: schema.activities.id,
            profile_id: schema.activities.profile_id,
            started_at: schema.activities.started_at,
            finished_at: schema.activities.finished_at,
            elapsed_ms: schema.activities.elapsed_ms,
            active_ms: schema.activities.active_ms,
            moving_ms: schema.activities.moving_ms,
            timing_coverage: schema.activities.timing_coverage,
            distance_meters: schema.activities.distance_meters,
            avg_heart_rate: schema.activities.avg_heart_rate,
            max_heart_rate: schema.activities.max_heart_rate,
          })
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
        recommendationQuery,
      ]);
      const activitiesStatus = activityRows.length === boundedLimit ? "partial" : "complete";
      const scheduledItemsStatus = eventRows.length === boundedLimit ? "partial" : "complete";
      const recommendationStatus =
        recommendationRows.length === boundedLimit ? "partial" : "complete";
      return {
        activities: activityRows.slice(0, boundedLimit - 1),
        events: eventRows.slice(0, boundedLimit - 1).map((row) => serializeEventRow(row)),
        recommendationEvents: recommendationRows
          .slice(0, boundedLimit - 1)
          .map((row) => serializeEventRow(row)),
        recommendationSource: {
          scheduleBatchId: activeScheduleBatchId,
          status: recommendationStatus,
          trainingPlanId: activeTrainingPlanId,
        },
        planningTimezone,
        resolvedRange: { startDate, endDate },
        sourceCounts: {
          activities: Math.min(activityRows.length, boundedLimit - 1),
          events: Math.min(eventRows.length, boundedLimit - 1),
        },
        sourceCoverage: {
          activities: { startDate, endDate, status: activitiesStatus },
          scheduledItems: { startDate, endDate, status: scheduledItemsStatus },
        },
      };
    },

    async getOwnedEventById({ eventId, profileId }) {
      const [row] = await db
        .select({
          ...eventColumns,
          activity_plan: schema.activityPlans,
          activity_route: schema.activityRoutes,
        })
        .from(schema.events)
        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .leftJoin(schema.activityRoutes, eq(schema.events.route_id, schema.activityRoutes.id))
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

    async listCalendarCompletedActivities({ limit, profileId, startedAtGte, startedAtLt }) {
      const rows = await db
        .select({
          active_ms: schema.activities.active_ms,
          distance_meters: schema.activities.distance_meters,
          elapsed_ms: schema.activities.elapsed_ms,
          id: schema.activities.id,
          name: schema.activities.name,
          started_at: schema.activities.started_at,
        })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, new Date(startedAtGte)),
            lt(schema.activities.started_at, new Date(startedAtLt)),
          ),
        )
        .orderBy(asc(schema.activities.started_at), asc(schema.activities.id))
        .limit(limit);

      return rows.map((row) => ({ ...row, started_at: row.started_at.toISOString() }));
    },

    async listCalendarGoals({ endDateExclusive, limit, profileId, startDate }) {
      return db
        .select({
          activity_category: schema.profileGoals.activity_category,
          id: schema.profileGoals.id,
          priority: schema.profileGoals.priority,
          profile_id: schema.profileGoals.profile_id,
          target_date: schema.profileGoals.target_date,
          target_payload: schema.profileGoals.target_payload,
          title: schema.profileGoals.title,
        })
        .from(schema.profileGoals)
        .where(
          and(
            eq(schema.profileGoals.profile_id, profileId),
            gte(schema.profileGoals.target_date, startDate),
            lt(schema.profileGoals.target_date, endDateExclusive),
          ),
        )
        .orderBy(asc(schema.profileGoals.target_date), asc(schema.profileGoals.id))
        .limit(limit);
    },

    async listCalendarGroupActivityPlans({ activityPlanIds }) {
      if (activityPlanIds.length === 0) return [];
      return db
        .select()
        .from(schema.activityPlans)
        .where(inArray(schema.activityPlans.id, activityPlanIds));
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

    async listOwnedPlannedEventsForDay({ date, limit, profileId }) {
      const boundedEvents = db.$with("bounded_planned_day_events").as(
        db
          .select({
            activity_plan_id: schema.events.activity_plan_id,
            id: schema.events.id,
            starts_at: schema.events.starts_at,
          })
          .from(schema.events)
          .where(
            and(
              eq(schema.events.profile_id, profileId),
              eq(schema.events.event_type, "planned"),
              eq(schema.events.scheduled_date, date),
              inArray(schema.events.status, ["scheduled", "completed"]),
            ),
          )
          .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
          .limit(limit),
      );
      const rows = await db
        .with(boundedEvents)
        .select({
          activity_plan_id: boundedEvents.activity_plan_id,
          id: boundedEvents.id,
          starts_at: boundedEvents.starts_at,
          activity_plan: {
            id: schema.activityPlans.id,
            profile_id: schema.activityPlans.profile_id,
            name: schema.activityPlans.name,
            description: schema.activityPlans.description,
            structure: schema.activityPlans.structure,
            gps_recording_enabled: schema.activityPlans.gps_recording_enabled,
            structure_hash: schema.activityPlans.structure_hash,
            updated_at: schema.activityPlans.updated_at,
          },
        })
        .from(boundedEvents)
        .leftJoin(schema.activityPlans, eq(boundedEvents.activity_plan_id, schema.activityPlans.id))
        .orderBy(asc(boundedEvents.starts_at), asc(boundedEvents.id));

      return rows.map((row) => ({
        ...row,
        starts_at: row.starts_at.toISOString(),
      }));
    },

    async getValidateConstraintsInputs({ activityPlanId, profileId, trainingPlanId }) {
      const [trainingPlan, activityPlan, profile, weightMetric] = await Promise.all([
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
            profile_id: schema.activityPlans.profile_id,
            name: schema.activityPlans.name,
            description: schema.activityPlans.description,
            gps_recording_enabled: schema.activityPlans.gps_recording_enabled,
            structure: schema.activityPlans.structure,
            structure_hash: schema.activityPlans.structure_hash,
            updated_at: schema.activityPlans.updated_at,
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
          })
          .from(schema.profileMetrics)
          .where(
            and(
              eq(schema.profileMetrics.profile_id, profileId),
              eq(schema.profileMetrics.metric_type, "weight_kg"),
            ),
          )
          .orderBy(desc(schema.profileMetrics.recorded_at), desc(schema.profileMetrics.id))
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
        weightMetric: weightMetric ? { value: weightMetric.value } : null,
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
          normalized_speed_mps: schema.activities.normalized_speed_mps,
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
          scheduled_date: item.scheduled_date,
          training_plan_id: item.training_plan_id,
          activity_plan: item.activity_plan,
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
        conditions.push(gte(schema.events.scheduled_date, scheduleDateFrom));
      }

      if (input.dateTo) {
        const scheduleDateTo = input.dateTo.slice(0, 10);
        conditions.push(lt(schema.events.scheduled_date, scheduleDateTo));
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
            segments: [{ activity_category: input.activityCategory }],
          })}::jsonb`,
        );
      }

      const rows = await db
        .select({
          ...eventColumns,
          activity_plan: schema.activityPlans,
          activity_route: schema.activityRoutes,
        })
        .from(schema.events)

        .leftJoin(schema.activityPlans, eq(activityPlanId, schema.activityPlans.id))
        .leftJoin(schema.activityRoutes, eq(schema.events.route_id, schema.activityRoutes.id))

        .where(and(...conditions))
        .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
        .limit(input.limit);

      return rows.map((row) => serializeEventRow(row));
    },
  };
}
