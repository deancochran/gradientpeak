import { getCalendarDateInIanaZone, scheduledDateTimeToIsoInstant } from "@repo/core/calendar";
import { prescriptionResolutionManifestSchema } from "@repo/core/plan";
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

function activityPlanViewerAccessCondition(profileId: string) {
  return or(
    eq(schema.activityPlans.profile_id, profileId),
    eq(schema.activityPlans.is_system_template, true),
    eq(schema.activityPlans.content_visibility, "public"),
    sql`(${schema.activityPlans.content_visibility} = 'followers' and exists (
      select 1 from follows f
      where f.follower_id = ${profileId}::uuid
        and f.following_id = ${schema.activityPlans.profile_id}
        and f.status = 'accepted'
    ))`,
    sql`exists (
      select 1 from content_access_grants cag
      where cag.content_type = 'activity_plan'
        and cag.content_id = ${schema.activityPlans.id}
        and cag.grantee_profile_id = ${profileId}::uuid
        and cag.access_level = 'read'
        and cag.revoked_at is null
        and (cag.expires_at is null or cag.expires_at > now())
    )`,
  );
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
  route_id: string | null;
  activity_route: typeof schema.activityRoutes.$inferSelect | null;
  all_day: boolean | null;
  created_at: Date;
  description: string | null;
  ends_at: Date | null;
  event_type: "race_target" | "custom";
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
  starts_at: Date;
  status: "scheduled" | "completed" | "cancelled" | null;
  timezone: string | null;
  title: string | null;
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
    status: requireCurrentEventField(row.status, "status"),
    timezone: requireCurrentEventField(row.timezone, "timezone"),
    title: requireCurrentEventField(row.title, "title"),
    created_at: row.created_at.toISOString(),
    starts_at: row.starts_at.toISOString(),
    scheduled_date: row.scheduled_date,
    ends_at: row.ends_at?.toISOString() ?? null,
    original_starts_at: row.original_starts_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
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
  route_id: schema.events.route_id,
  recurrence_rule: schema.events.recurrence_rule,
  recurrence_timezone: schema.events.recurrence_timezone,
  series_id: schema.events.series_id,
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
          plannedSessions: [],
          recommendationPlannedSessions: [],
          recommendationSource: {
            status: "complete" as const,
            trainingPlanId: null,
          },
          planningTimezone,
          resolvedRange: { startDate: null, endDate: null },
          sourceCounts: { activities: 0, plannedSessions: 0 },
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
      const activePlanSession = await db
        .select({
          training_plan_id: schema.plannedSessions.training_plan_id,
          training_plan_revision: schema.plannedSessions.training_plan_revision,
        })
        .from(schema.plannedSessions)
        .where(
          and(
            eq(schema.plannedSessions.profile_id, profileId),
            eq(schema.plannedSessions.status, "scheduled"),
            isNotNull(schema.plannedSessions.training_plan_id),
            gte(schema.plannedSessions.planning_date, planningDate),
          ),
        )
        .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      const activeTrainingPlanId = activePlanSession?.training_plan_id ?? null;
      const activeTrainingPlanRevision = activePlanSession?.training_plan_revision ?? null;
      const recommendationQuery =
        activeTrainingPlanId && activeTrainingPlanRevision !== null
          ? db
              .select({
                id: schema.plannedSessions.id,
                planning_date: schema.plannedSessions.planning_date,
                original_target_date: schema.plannedSessions.original_target_date,
                status: schema.plannedSessions.status,
                completed_activity_id: schema.plannedSessions.completed_activity_id,
                training_plan_id: schema.plannedSessions.training_plan_id,
                training_plan_revision: schema.plannedSessions.training_plan_revision,
                resolution_manifest: schema.plannedSessions.resolution_manifest,
              })
              .from(schema.plannedSessions)
              .where(
                and(
                  eq(schema.plannedSessions.profile_id, profileId),
                  eq(schema.plannedSessions.training_plan_id, activeTrainingPlanId),
                  eq(schema.plannedSessions.training_plan_revision, activeTrainingPlanRevision),
                ),
              )
              .orderBy(
                asc(schema.plannedSessions.original_target_date),
                asc(schema.plannedSessions.id),
              )
              .limit(boundedLimit)
          : Promise.resolve([]);
      const [plannedSessionRows, activityRows, recommendationRows] = await Promise.all([
        db
          .select({
            id: schema.plannedSessions.id,
            planning_date: schema.plannedSessions.planning_date,
            original_target_date: schema.plannedSessions.original_target_date,
            status: schema.plannedSessions.status,
            completed_activity_id: schema.plannedSessions.completed_activity_id,
            training_plan_id: schema.plannedSessions.training_plan_id,
            training_plan_revision: schema.plannedSessions.training_plan_revision,
            resolution_manifest: schema.plannedSessions.resolution_manifest,
          })
          .from(schema.plannedSessions)
          .where(
            and(
              eq(schema.plannedSessions.profile_id, profileId),
              gte(schema.plannedSessions.planning_date, startDate),
              lte(schema.plannedSessions.planning_date, endDate),
            ),
          )
          .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
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
              isNull(schema.activities.superseded_by_activity_id),
              gte(schema.activities.started_at, envelopeStart),
              lt(schema.activities.started_at, envelopeEnd),
            ),
          )
          .orderBy(asc(schema.activities.started_at), asc(schema.activities.id))
          .limit(boundedLimit),
        recommendationQuery,
      ]);
      const activitiesStatus = activityRows.length === boundedLimit ? "partial" : "complete";
      const serializePlannedSession = (row: (typeof plannedSessionRows)[number]) => ({
        id: row.id,
        planningDate: row.planning_date,
        originalTargetDate: row.original_target_date,
        lifecycleStatus: row.status,
        completedActivityId: row.completed_activity_id,
        source: {
          trainingPlanId: row.training_plan_id,
          trainingPlanRevision: row.training_plan_revision,
        },
        resolutionManifest: prescriptionResolutionManifestSchema.parse(row.resolution_manifest),
      });
      const scheduledItemsStatus =
        plannedSessionRows.length === boundedLimit ? "partial" : "complete";
      const recommendationStatus =
        recommendationRows.length === boundedLimit ? "partial" : "complete";
      return {
        activities: activityRows.slice(0, boundedLimit - 1),
        plannedSessions: plannedSessionRows.slice(0, boundedLimit - 1).map(serializePlannedSession),
        recommendationPlannedSessions: recommendationRows
          .slice(0, boundedLimit - 1)
          .map(serializePlannedSession),
        recommendationSource: {
          status: recommendationStatus,
          trainingPlanId: activeTrainingPlanId,
        },
        planningTimezone,
        resolvedRange: { startDate, endDate },
        sourceCounts: {
          activities: Math.min(activityRows.length, boundedLimit - 1),
          plannedSessions: Math.min(plannedSessionRows.length, boundedLimit - 1),
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
          activity_route: schema.activityRoutes,
        })
        .from(schema.events)
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
            isNotNull(schema.activities.started_at),
            gte(schema.activities.started_at, new Date(startedAtGte)),
            lt(schema.activities.started_at, new Date(startedAtLt)),
          ),
        );

      return rows.flatMap((row) => {
        const startedAt = row.started_at;
        return startedAt === null
          ? []
          : [
              {
                activity_plan_id: row.activity_plan_id,
                id: row.id,
                started_at: startedAt.toISOString(),
              },
            ];
      });
    },

    async listCalendarCompletedActivities({
      limit,
      profileId,
      startedAtGte,
      startedAtLt,
      diaryDateGte,
      diaryDateLt,
    }) {
      const rows = await db
        .select({
          active_ms: schema.activities.active_ms,
          content_visibility: schema.activities.content_visibility,
          distance_meters: schema.activities.distance_meters,
          diary_date: schema.activities.diary_date,
          diary_timezone: schema.activities.diary_timezone,
          elapsed_ms: schema.activities.elapsed_ms,
          finished_at: schema.activities.finished_at,
          id: schema.activities.id,
          name: schema.activities.name,
          notes: schema.activities.notes,
          polyline: schema.activities.polyline,
          profile_id: schema.activities.profile_id,
          activity_category: sql<"run" | "bike" | "swim" | "strength" | "other" | null>`(
            select activity_category from ${schema.activitySegments}
            where ${schema.activitySegments.activity_id} = ${schema.activities.id}
              and ${schema.activitySegments.role} = 'activity'
            order by ${schema.activitySegments.ordinal}
            limit 1
          )`,
          started_at: schema.activities.started_at,
          profile_username: schema.profiles.username,
          profile_avatar_url: schema.profiles.avatar_url,
          likes_count: sql<number>`(
            select count(*) from ${schema.likes}
            where ${schema.likes.entity_type} = 'activity'
              and ${schema.likes.entity_id} = ${schema.activities.id}
          )`,
          comments_count: sql<number>`(
            select count(*) from ${schema.comments}
            where ${schema.comments.entity_type} = 'activity'
              and ${schema.comments.entity_id} = ${schema.activities.id}
          )`,
          has_liked: sql<boolean>`exists (
            select 1 from ${schema.likes}
            where ${schema.likes.entity_type} = 'activity'
              and ${schema.likes.entity_id} = ${schema.activities.id}
              and ${schema.likes.profile_id} = ${profileId}::uuid
          )`,
        })
        .from(schema.activities)
        .leftJoin(schema.profiles, eq(schema.profiles.id, schema.activities.profile_id))
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            isNull(schema.activities.superseded_by_activity_id),
            or(
              and(
                isNotNull(schema.activities.started_at),
                gte(schema.activities.started_at, new Date(startedAtGte)),
                lt(schema.activities.started_at, new Date(startedAtLt)),
              ),
              and(
                isNotNull(schema.activities.diary_date),
                gte(schema.activities.diary_date, diaryDateGte),
                lt(schema.activities.diary_date, diaryDateLt),
              ),
            ),
          ),
        )
        .orderBy(
          asc(
            sql`coalesce(${schema.activities.diary_date}, ${schema.activities.started_at}::date)`,
          ),
          asc(schema.activities.started_at),
          asc(schema.activities.id),
        )
        .limit(limit);

      return rows.map((row) => ({
        active_ms: row.active_ms,
        activity_category: row.activity_category,
        comments_count: Number(row.comments_count),
        content_visibility: row.content_visibility,
        distance_meters: row.distance_meters,
        diary_date: row.diary_date,
        diary_timezone: row.diary_timezone,
        elapsed_ms: row.elapsed_ms,
        finished_at: row.finished_at,
        has_liked: row.has_liked,
        id: row.id,
        likes_count: Number(row.likes_count),
        name: row.name,
        notes: row.notes,
        polyline: row.polyline,
        profile: { avatar_url: row.profile_avatar_url, username: row.profile_username },
        profile_id: row.profile_id,
        started_at: row.started_at?.toISOString() ?? null,
      }));
    },

    async listCalendarCompletedActivitiesByIds({ activityIds, profileId }) {
      if (activityIds.length === 0) return [];
      const rows = await db
        .select({
          active_ms: schema.activities.active_ms,
          content_visibility: schema.activities.content_visibility,
          distance_meters: schema.activities.distance_meters,
          diary_date: schema.activities.diary_date,
          diary_timezone: schema.activities.diary_timezone,
          elapsed_ms: schema.activities.elapsed_ms,
          finished_at: schema.activities.finished_at,
          id: schema.activities.id,
          name: schema.activities.name,
          notes: schema.activities.notes,
          polyline: schema.activities.polyline,
          profile_id: schema.activities.profile_id,
          activity_category: sql<"run" | "bike" | "swim" | "strength" | "other" | null>`(
            select activity_category from ${schema.activitySegments}
            where ${schema.activitySegments.activity_id} = ${schema.activities.id}
              and ${schema.activitySegments.role} = 'activity'
            order by ${schema.activitySegments.ordinal}
            limit 1
          )`,
          started_at: schema.activities.started_at,
          profile_username: schema.profiles.username,
          profile_avatar_url: schema.profiles.avatar_url,
          likes_count: sql<number>`(
            select count(*) from ${schema.likes}
            where ${schema.likes.entity_type} = 'activity'
              and ${schema.likes.entity_id} = ${schema.activities.id}
          )`,
          comments_count: sql<number>`(
            select count(*) from ${schema.comments}
            where ${schema.comments.entity_type} = 'activity'
              and ${schema.comments.entity_id} = ${schema.activities.id}
          )`,
          has_liked: sql<boolean>`exists (
            select 1 from ${schema.likes}
            where ${schema.likes.entity_type} = 'activity'
              and ${schema.likes.entity_id} = ${schema.activities.id}
              and ${schema.likes.profile_id} = ${profileId}::uuid
          )`,
        })
        .from(schema.activities)
        .leftJoin(schema.profiles, eq(schema.profiles.id, schema.activities.profile_id))
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            isNull(schema.activities.superseded_by_activity_id),
            inArray(schema.activities.id, activityIds),
          ),
        )
        .orderBy(
          asc(
            sql`coalesce(${schema.activities.diary_date}, ${schema.activities.started_at}::date)`,
          ),
          asc(schema.activities.started_at),
          asc(schema.activities.id),
        )
        .limit(activityIds.length);

      return rows.map((row) => ({
        active_ms: row.active_ms,
        activity_category: row.activity_category,
        comments_count: Number(row.comments_count),
        content_visibility: row.content_visibility,
        distance_meters: row.distance_meters,
        diary_date: row.diary_date,
        diary_timezone: row.diary_timezone,
        elapsed_ms: row.elapsed_ms,
        finished_at: row.finished_at,
        has_liked: row.has_liked,
        id: row.id,
        likes_count: Number(row.likes_count),
        name: row.name,
        notes: row.notes,
        polyline: row.polyline,
        profile: { avatar_url: row.profile_avatar_url, username: row.profile_username },
        profile_id: row.profile_id,
        started_at: row.started_at?.toISOString() ?? null,
      }));
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

    async listCalendarGroupActivityPlans({ activityPlanIds, profileId }) {
      if (activityPlanIds.length === 0) return [];
      return db
        .select()
        .from(schema.activityPlans)
        .where(
          and(
            inArray(schema.activityPlans.id, activityPlanIds),
            activityPlanViewerAccessCondition(profileId),
          ),
        );
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

      const plannedSessions = await db
        .select({
          starts_at: schema.plannedSessions.planning_date,
          scheduled_date: schema.plannedSessions.planning_date,
          training_plan_id: schema.plannedSessions.training_plan_id,
          activity_plan: schema.activityPlans,
        })
        .from(schema.plannedSessions)
        .leftJoin(
          schema.activityPlans,
          eq(schema.plannedSessions.activity_plan_id, schema.activityPlans.id),
        )
        .where(
          and(
            eq(schema.plannedSessions.profile_id, profileId),
            gte(schema.plannedSessions.planning_date, startDateIso.slice(0, 10)),
            lt(schema.plannedSessions.planning_date, endDateExclusiveIso.slice(0, 10)),
            ...(trainingPlanId
              ? [eq(schema.plannedSessions.training_plan_id, trainingPlanId)]
              : []),
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
            isNotNull(schema.activities.started_at),
            isNotNull(schema.activities.finished_at),
            gte(schema.activities.started_at, new Date(startDateIso)),
            lt(schema.activities.started_at, new Date(endDateExclusiveIso)),
          ),
        );
      return {
        trainingPlan,
        plannedActivities: plannedSessions.map((item) => ({
          starts_at: `${item.starts_at}T00:00:00.000Z`,
          scheduled_date: item.scheduled_date,
          training_plan_id: item.training_plan_id,
          activity_plan: item.activity_plan,
        })),
        actualActivities: actualActivities.flatMap((activity) => {
          const startedAt = activity.started_at;
          const finishedAt = activity.finished_at;
          return startedAt === null || finishedAt === null
            ? []
            : [
                {
                  ...activity,
                  started_at: startedAt.toISOString(),
                  finished_at: finishedAt.toISOString(),
                },
              ];
        }),
      };
    },

    async listOwnedEvents(input) {
      const conditions = [eq(schema.events.profile_id, input.profileId)];
      if (input.eventTypes && input.eventTypes.length > 0) {
        conditions.push(inArray(schema.events.event_type, input.eventTypes));
      }

      if (input.dateFrom) {
        const scheduleDateFrom = input.dateFrom.slice(0, 10);
        if (input.planningTimezone) {
          const startsAtFrom = new Date(
            scheduledDateTimeToIsoInstant({
              scheduledDate: scheduleDateFrom,
              time: "00:00",
              timeZone: input.planningTimezone,
            }),
          );
          const planningDateLowerBound = or(
            and(
              eq(schema.events.all_day, true),
              gte(schema.events.scheduled_date, scheduleDateFrom),
            ),
            and(eq(schema.events.all_day, false), gte(schema.events.starts_at, startsAtFrom)),
          );
          if (!planningDateLowerBound) throw new Error("Planning date lower bound is required");
          conditions.push(planningDateLowerBound);
        } else {
          conditions.push(gte(schema.events.scheduled_date, scheduleDateFrom));
        }
      }

      if (input.dateTo) {
        const scheduleDateTo = input.dateTo.slice(0, 10);
        if (input.planningTimezone) {
          const startsAtTo = new Date(
            scheduledDateTimeToIsoInstant({
              scheduledDate: scheduleDateTo,
              time: "00:00",
              timeZone: input.planningTimezone,
            }),
          );
          const planningDateUpperBound = or(
            and(eq(schema.events.all_day, true), lt(schema.events.scheduled_date, scheduleDateTo)),
            and(eq(schema.events.all_day, false), lt(schema.events.starts_at, startsAtTo)),
          );
          if (!planningDateUpperBound) throw new Error("Planning date upper bound is required");
          conditions.push(planningDateUpperBound);
        } else {
          conditions.push(lt(schema.events.scheduled_date, scheduleDateTo));
        }
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

      const rows = await db
        .select({
          ...eventColumns,
          activity_route: schema.activityRoutes,
        })
        .from(schema.events)

        .leftJoin(schema.activityRoutes, eq(schema.events.route_id, schema.activityRoutes.id))

        .where(and(...conditions))
        .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
        .limit(input.limit);

      return rows.map((row) => serializeEventRow(row));
    },
  };
}
