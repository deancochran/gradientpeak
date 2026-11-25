import {
  coachingAssignments,
  coachingEngagements,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { and, asc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export function createOrganizationCoachAthleteRepository(db: DrizzleQueryExecutor) {
  return {
    async hasActiveCoachMembership(input: { organizationId: string; profileId: string }) {
      const [row] = await db
        .select({ membershipId: organizationMemberships.id })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
        .innerJoin(
          organizationMembershipRoleGrants,
          and(
            eq(
              organizationMembershipRoleGrants.organization_id,
              organizationMemberships.organization_id,
            ),
            eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            eq(organizationMembershipRoleGrants.role_key, "coach"),
            isNull(organizationMembershipRoleGrants.revoked_at),
            sql`${organizationMembershipRoleGrants.granted_at} <= transaction_timestamp()`,
          ),
        )
        .where(
          and(
            eq(organizationMemberships.organization_id, input.organizationId),
            eq(organizationMemberships.profile_id, input.profileId),
            isNull(organizationMemberships.suspended_at),
            isNull(organizationMemberships.ended_at),
            sql`${organizationMemberships.created_at} <= transaction_timestamp()`,
            isNull(organizations.suspended_at),
            isNull(organizations.closed_at),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    listAssigned(input: {
      organizationId: string;
      coachProfileId: string;
      limit: number;
      cursor: string | null;
      search: string | null;
      athleteProfileId?: string;
    }) {
      const assignmentPredicate = sql`exists (
        select 1 from ${organizationMemberships} coach_membership
        where coach_membership.organization_id = ${input.organizationId}::uuid
          and coach_membership.profile_id = ${input.coachProfileId}::uuid
          and coach_membership.suspended_at is null and coach_membership.ended_at is null
          and coach_membership.created_at <= transaction_timestamp()
          and exists (select 1 from ${organizationMembershipRoleGrants} coach_role
            where coach_role.organization_id = coach_membership.organization_id
              and coach_role.membership_id = coach_membership.id
              and coach_role.role_key = 'coach' and coach_role.revoked_at is null
              and coach_role.granted_at <= transaction_timestamp())
          and (
            exists (select 1 from ${coachingAssignments} direct_assignment
              where direct_assignment.organization_id = ${input.organizationId}::uuid
                and direct_assignment.engagement_id = ${coachingEngagements.id}
                and direct_assignment.coach_membership_id = coach_membership.id
                and direct_assignment.ended_at is null
                and direct_assignment.assigned_at <= transaction_timestamp())
            or exists (select 1 from ${organizationGroupAthletes} group_athlete
              inner join ${organizationGroups} assigned_group
                on assigned_group.organization_id = group_athlete.organization_id
               and assigned_group.id = group_athlete.group_id
               and assigned_group.archived_at is null
               and assigned_group.created_at <= transaction_timestamp()
              inner join ${organizationGroupCoachAssignments} group_coach
                on group_coach.organization_id = group_athlete.organization_id
               and group_coach.group_id = group_athlete.group_id
               and group_coach.coach_membership_id = coach_membership.id
               and group_coach.ended_at is null
               and group_coach.assigned_at <= transaction_timestamp()
              where group_athlete.organization_id = ${input.organizationId}::uuid
                and group_athlete.engagement_id = ${coachingEngagements.id}
                and group_athlete.ended_at is null
                and group_athlete.joined_at <= transaction_timestamp())
          )
      )`;
      return db
        .selectDistinct({
          profileId: profiles.id,
          displayName: profiles.full_name,
          username: profiles.username,
        })
        .from(coachingEngagements)
        .innerJoin(profiles, eq(profiles.id, coachingEngagements.athlete_profile_id))
        .innerJoin(organizations, eq(organizations.id, coachingEngagements.organization_id))
        .where(
          and(
            eq(coachingEngagements.organization_id, input.organizationId),
            isNull(coachingEngagements.paused_at),
            isNull(coachingEngagements.ended_at),
            sql`${coachingEngagements.created_at} <= transaction_timestamp()`,
            isNull(organizations.suspended_at),
            isNull(organizations.closed_at),
            ...(input.athleteProfileId ? [eq(profiles.id, input.athleteProfileId)] : []),
            ...(input.cursor ? [gt(profiles.id, input.cursor)] : []),
            ...(input.search
              ? [
                  or(
                    ilike(profiles.full_name, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`),
                    ilike(profiles.username, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`),
                  ),
                ]
              : []),
            assignmentPredicate,
          ),
        )
        .orderBy(asc(profiles.id))
        .limit(input.limit + 1);
    },
    /**
     * Batches only the current bounded directory page.  Every protected field
     * is guarded by the authoritative per-athlete, per-scope decision in the
     * same SQL statement that reads it; denied scopes return no private value.
     */
    async readVisualRosterFacts(input: {
      organizationId: string;
      coachProfileId: string;
      athleteProfileIds: string[];
    }) {
      if (input.athleteProfileIds.length === 0) return [];
      const result = await db.execute(sql`
        with selected as (
          select profile_id from (values ${sql.join(
            input.athleteProfileIds.map((id) => sql`(${id}::uuid)`),
            sql`, `,
          )}) as selected_values(profile_id)
        ), access as (
          select selected.profile_id,
            public.coaching_athlete_read_access_decision(
              ${input.coachProfileId}::uuid, ${input.organizationId}::uuid, selected.profile_id, 'metrics'
            ) = 'allow' as metrics_allowed,
            public.coaching_athlete_read_access_decision(
              ${input.coachProfileId}::uuid, ${input.organizationId}::uuid, selected.profile_id, 'activities'
            ) = 'allow' as activities_allowed,
            public.coaching_athlete_read_access_decision(
              ${input.coachProfileId}::uuid, ${input.organizationId}::uuid, selected.profile_id, 'goals'
            ) = 'allow' as goals_allowed
          from selected
        )
        select access.profile_id as "profileId",
          case
            when not access.metrics_allowed then 'unshared'
            when state.profile_id is null or state.computed_at is null then 'unavailable'
            when state.dirty_from_at is not null or state.source_revision <> state.published_revision
              then 'stale'
            else 'fresh'
          end as "metricsStatus",
          case when access.metrics_allowed and state.computed_at is not null
            then state.computed_at else null end as "publishedAt",
          case when access.activities_allowed then coalesce(history.points, '[]'::json) else '[]'::json end as "activityPoints",
          case when access.activities_allowed then profile.planning_timezone else null end as "planningTimezone",
          case when access.activities_allowed then history.range_start_date else null end as "rangeStartDate",
          case when access.activities_allowed then history.range_end_date else null end as "rangeEndDate",
          case
            when not access.activities_allowed then 'unshared'
            when coalesce(json_array_length(history.points), 0) = 0 then 'unavailable'
            else 'available'
          end as "activitiesStatus",
          case
            when not access.activities_allowed or coalesce(json_array_length(history.points), 0) = 0
              then 'unavailable'
            when activity_state.dirty_from_at is not null
              or activity_state.source_revision <> activity_state.published_revision then 'stale'
            when history.has_partial then 'partial'
            else 'fresh'
          end as "activitiesQualifier",
          case when access.goals_allowed then coalesce(goals.items, '[]'::json) else '[]'::json end as "goalItems",
          case
            when not access.goals_allowed then 'unshared'
            when coalesce(json_array_length(goals.items), 0) = 0 then 'unavailable'
            else 'available'
          end as "goalsStatus"
        from access
        left join profiles profile on profile.id = access.profile_id
        left join profile_athlete_state state
          on state.profile_id = access.profile_id and access.metrics_allowed
        left join profile_athlete_state activity_state
          on activity_state.profile_id = access.profile_id and access.activities_allowed
        left join lateral (
          select
            min(recent.planning_date) as range_start_date,
            max(recent.planning_date) as range_end_date,
            coalesce(bool_or(recent.coverage_status = 'partial'), false) as has_partial,
            json_agg(json_build_object(
            'date', recent.planning_date, 'dailyLoad', recent.common_load,
            'fitness', recent.fitness, 'fatigue', recent.fatigue, 'form', recent.form,
            'coverageStatus', recent.coverage_status, 'omittedActivityCount', recent.omitted_activity_count
          )
            order by recent.planning_date) as points
          from (
            select load.planning_date, load.common_load, load.fitness, load.fatigue, load.form,
              load.coverage_status, load.omitted_activity_count
            from daily_training_load load
            where load.profile_id = access.profile_id
              and load.source_revision = activity_state.published_revision
              and load.planning_date >= ((now() at time zone profile.planning_timezone)::date - 27)
              and load.planning_date <= (now() at time zone profile.planning_timezone)::date
            order by load.planning_date desc
            limit 28
          ) recent
        ) history on access.activities_allowed
        left join lateral (
          select json_agg(json_build_object(
            'id', recent.id, 'name', recent.title, 'targetDate', recent.target_date,
            'category', recent.activity_category, 'priority', recent.priority
          ) order by recent.created_at desc, recent.id desc) as items
          from (
            select goal.id, goal.title, goal.target_date, goal.activity_category, goal.priority, goal.created_at
            from profile_goals goal
            where goal.profile_id = access.profile_id
            order by goal.created_at desc, goal.id desc
            limit 3
          ) recent
        ) goals on access.goals_allowed
        order by access.profile_id
      `);
      return result.rows.map((row) => {
        const value = row as {
          profileId: string;
          metricsStatus: "fresh" | "stale" | "unavailable" | "unshared";
          publishedAt: Date | string | null;
          activitiesStatus: "available" | "unavailable" | "unshared";
          planningTimezone: string | null;
          rangeStartDate: string | null;
          rangeEndDate: string | null;
          activitiesQualifier: "fresh" | "stale" | "partial" | "unavailable";
          activityPoints: Array<{
            date: string;
            dailyLoad: number;
            fitness: number;
            fatigue: number;
            form: number;
            coverageStatus: "complete" | "partial";
            omittedActivityCount: number;
          }>;
          goalsStatus: "available" | "unavailable" | "unshared";
          goalItems: Array<{
            id: string;
            name: string;
            targetDate: string;
            category: string;
            priority: number;
          }>;
        };
        return {
          profileId: value.profileId,
          metrics: {
            status: (value.metricsStatus === "fresh" || value.metricsStatus === "stale"
              ? "available"
              : value.metricsStatus) as "available" | "unavailable" | "unshared",
            ...(value.metricsStatus === "fresh" || value.metricsStatus === "stale"
              ? {
                  freshness: value.metricsStatus,
                  ...(value.publishedAt
                    ? { publishedAt: new Date(value.publishedAt).toISOString() }
                    : {}),
                }
              : {}),
          },
          activities: {
            status: value.activitiesStatus,
            planningTimezone: value.planningTimezone,
            rangeStartDate: value.rangeStartDate,
            rangeEndDate: value.rangeEndDate,
            ...(value.activitiesStatus === "available"
              ? { qualifier: value.activitiesQualifier }
              : {}),
            points: value.activityPoints,
          },
          goals: { status: value.goalsStatus, items: value.goalItems },
        };
      });
    },
  };
}
