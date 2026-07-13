import { type DrizzleDbClient, schema } from "@repo/db";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { EventCompletionRepository, EventDeleteScope } from "../../repositories";

function applyDeleteScopeFilters(input: {
  anchorEvent: { id: string; series_id: string | null; starts_at: string };
  profileId: string;
  scope: EventDeleteScope;
}) {
  const baseConditions = [eq(schema.events.profile_id, input.profileId)];

  if (input.scope === "single") {
    return and(...baseConditions, eq(schema.events.id, input.anchorEvent.id));
  }

  const seriesId = (input.anchorEvent.series_id ?? input.anchorEvent.id) as string;

  if (input.scope === "future") {
    return and(
      ...baseConditions,
      or(eq(schema.events.id, seriesId), eq(schema.events.series_id, seriesId)),
      gte(schema.events.starts_at, new Date(input.anchorEvent.starts_at)),
    );
  }

  return and(
    ...baseConditions,
    or(eq(schema.events.id, seriesId), eq(schema.events.series_id, seriesId)),
  );
}

const splitCompletionEventColumns = {
  id: schema.events.id,
  idx: schema.events.idx,
  profile_id: schema.events.profile_id,
  event_type: schema.events.event_type,
  title: schema.events.title,
  description: schema.events.description,
  all_day: schema.events.all_day,
  timezone: schema.events.timezone,
  notes: schema.events.notes,
  status: schema.events.status,
  created_at: schema.events.created_at,
  updated_at: schema.events.updated_at,
  starts_at: schema.events.starts_at,
  ends_at: schema.events.ends_at,
  activity_plan_id: schema.events.activity_plan_id,
  training_plan_id: schema.events.training_plan_id,
  linked_activity_id: schema.events.linked_activity_id,
  recurrence_rule: schema.events.recurrence_rule,
  recurrence_timezone: schema.events.recurrence_timezone,
  series_id: schema.events.series_id,
  source_provider: schema.events.source_provider,
  occurrence_key: schema.events.occurrence_key,
  original_starts_at: schema.events.original_starts_at,
};

function serializeCompletionRow(
  row: typeof splitCompletionEventColumns extends infer _T ? any : never,
) {
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

export function createEventCompletionRepository(db: DrizzleDbClient): EventCompletionRepository {
  return {
    async getOwnedActivityForCompletion({ activityId, profileId }) {
      const [row] = await db
        .select({ id: schema.activities.id })
        .from(schema.activities)
        .where(
          and(eq(schema.activities.id, activityId), eq(schema.activities.profile_id, profileId)),
        )
        .limit(1);

      return row ?? null;
    },

    async getOwnedEventForCompletion({ eventId, profileId }) {
      const [row] = await db
        .select({
          ...splitCompletionEventColumns,
        })
        .from(schema.events)

        .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, profileId)))
        .limit(1);

      if (!row) return null;

      return serializeCompletionRow(row);
    },

    async updateEventCompletionLink({ eventId, profileId, linkedActivityId, status }) {
      const now = new Date();
      const [row] = await db.transaction(async (tx) => {
        const [updatedEvent] = await tx
          .update(schema.events)
          .set({
            status,
            linked_activity_id: linkedActivityId,
            updated_at: now,
          })
          .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, profileId)))
          .returning({ id: schema.events.id });

        if (!updatedEvent) return [];

        return tx
          .select(splitCompletionEventColumns)
          .from(schema.events)
          .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, profileId)))
          .limit(1);
      });

      if (!row) return null;

      return serializeCompletionRow(row);
    },

    async listHistoricalActivitiesForReconciliation({
      dateFromInclusiveIso,
      dateToExclusiveIso,
      profileId,
    }) {
      const rows = await db
        .select({
          id: schema.activities.id,
          started_at: schema.activities.started_at,
          activity_plan_id: schema.activities.activity_plan_id,
        })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.profile_id, profileId),
            gte(schema.activities.started_at, new Date(dateFromInclusiveIso)),
            lt(schema.activities.started_at, new Date(dateToExclusiveIso)),
          ),
        )
        .orderBy(desc(schema.activities.started_at), asc(schema.activities.id));

      return rows.map((row) => ({
        id: row.id,
        started_at: row.started_at.toISOString(),
        activity_plan_id: row.activity_plan_id,
      }));
    },

    async listHistoricalEventsForReconciliation({
      dateFromInclusiveIso,
      dateToExclusiveIso,
      limit,
      profileId,
    }) {
      const rows = await db
        .select({
          id: schema.events.id,
          starts_at: schema.events.starts_at,
          activity_plan_id: schema.events.activity_plan_id,
          training_plan_id: schema.events.training_plan_id,
          status: schema.events.status,
          linked_activity_id: schema.events.linked_activity_id,
          event_type: schema.events.event_type,
        })
        .from(schema.events)

        .where(
          and(
            eq(schema.events.profile_id, profileId),
            inArray(schema.events.event_type, ["planned_activity", "race"]),
            isNull(schema.events.linked_activity_id),
            ne(schema.events.status, "cancelled"),
            gte(schema.events.starts_at, new Date(dateFromInclusiveIso)),
            lt(schema.events.starts_at, new Date(dateToExclusiveIso)),
          ),
        )
        .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
        .limit(limit);

      return rows.map((row) => ({
        id: row.id,
        activity_plan_id: row.activity_plan_id,
        training_plan_id: row.training_plan_id,
        status: row.status,
        linked_activity_id: row.linked_activity_id,
        event_type: row.event_type as "planned_activity" | "race",
        starts_at: row.starts_at.toISOString(),
      }));
    },

    async linkHistoricalCompletionIfEligible({ activityId, eventId, profileId }) {
      const now = new Date();
      const [row] = await db.transaction(async (tx) => {
        const [updatedEvent] = await tx
          .update(schema.events)
          .set({
            status: "completed",
            linked_activity_id: activityId,
            updated_at: now,
          })
          .where(
            and(
              eq(schema.events.id, eventId),
              eq(schema.events.profile_id, profileId),
              ne(schema.events.status, "cancelled"),
              isNull(schema.events.linked_activity_id),
            ),
          )
          .returning({
            id: schema.events.id,
            starts_at: schema.events.starts_at,
            updated_at: schema.events.updated_at,
          });

        if (!updatedEvent) return [];

        return tx
          .select({
            id: schema.events.id,
            training_plan_id: schema.events.training_plan_id,
            starts_at: schema.events.starts_at,
            updated_at: schema.events.updated_at,
          })
          .from(schema.events)
          .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, profileId)))
          .limit(1);
      });

      if (!row) return null;

      return {
        id: row.id,
        training_plan_id: row.training_plan_id,
        starts_at: row.starts_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    },

    async listOwnedEventsForDeleteScope({ anchorEvent, profileId, scope }) {
      const rows = await db
        .select({
          activity_plan_id: schema.events.activity_plan_id,
          id: schema.events.id,
          event_type: schema.events.event_type,
        })
        .from(schema.events)

        .where(applyDeleteScopeFilters({ anchorEvent, profileId, scope }));

      return rows;
    },

    async deleteOwnedEventsForScope({ anchorEvent, profileId, scope }) {
      const rows = await db.transaction(async (tx) => {
        const candidates = await tx
          .select({
            activity_plan_id: schema.events.activity_plan_id,
            id: schema.events.id,
            event_type: schema.events.event_type,
          })
          .from(schema.events)
          .where(applyDeleteScopeFilters({ anchorEvent, profileId, scope }));

        if (scope === "single" && anchorEvent.series_id === null) {
          await tx
            .update(schema.events)
            .set({ series_id: null, updated_at: new Date() })
            .where(
              and(
                eq(schema.events.profile_id, profileId),
                eq(schema.events.series_id, anchorEvent.id),
              ),
            );
        }

        await tx
          .delete(schema.events)
          .where(applyDeleteScopeFilters({ anchorEvent, profileId, scope }));

        return candidates;
      });

      return rows;
    },
  };
}
