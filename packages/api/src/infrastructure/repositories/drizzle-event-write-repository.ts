import { randomUUID } from "node:crypto";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, gte, or } from "drizzle-orm";
import type { EventDeleteScope, EventWriteRepository } from "../../repositories";

function serializeCreatedEvent(row: {
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

function applyWriteScopeFilters(input: {
  anchorEvent: { id: string; series_id: string | null; starts_at: string };
  profileId: string;
  scope: EventDeleteScope;
}) {
  const baseConditions = [eq(schema.events.profile_id, input.profileId)];

  if (input.scope === "single") {
    return and(...baseConditions, eq(schema.events.id, input.anchorEvent.id));
  }

  const seriesId = input.anchorEvent.series_id;
  if (!seriesId) {
    throw new Error(`Mutation scope "${input.scope}" requires an event series`);
  }

  if (input.scope === "future") {
    return and(
      ...baseConditions,
      eq(schema.events.series_id, seriesId),
      gte(schema.events.starts_at, new Date(input.anchorEvent.starts_at)),
    );
  }

  return and(...baseConditions, eq(schema.events.series_id, seriesId));
}

export function createEventWriteRepository(db: DrizzleDbClient): EventWriteRepository {
  return {
    async getAccessibleActivityPlan({ activityPlanId, profileId }) {
      const [row] = await db
        .select({ id: schema.activityPlans.id })
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
        .limit(1);

      return row ?? null;
    },

    async getOwnedTrainingPlan({ profileId, trainingPlanId }) {
      const [row] = await db
        .select({ id: schema.trainingPlans.id })
        .from(schema.trainingPlans)
        .where(
          and(
            eq(schema.trainingPlans.id, trainingPlanId),
            eq(schema.trainingPlans.profile_id, profileId),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async createOwnedEvent(input) {
      const [row] = await db
        .insert(schema.events)
        .values({
          id: randomUUID(),
          created_at: new Date(),
          updated_at: new Date(),
          profile_id: input.profileId,
          event_type: input.eventType,
          title: input.title,
          all_day: input.allDay,
          timezone: input.timezone,
          starts_at: new Date(input.startsAt),
          ends_at: input.endsAt ? new Date(input.endsAt) : null,
          status: input.status,
          activity_plan_id: input.activityPlanId,
          training_plan_id: input.trainingPlanId,
          notes: input.notes,
          description: input.description,
          recurrence_rule: input.recurrenceRule,
          recurrence_timezone: input.recurrenceTimezone,
          source_provider: input.sourceProvider,
        })
        .returning({
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
        });

      if (!row) {
        throw new Error("Failed to create event");
      }

      return serializeCreatedEvent(row);
    },

    async updateOwnedEventsForScope({ anchorEvent, eventUpdates, profileId, scope }) {
      const rows = await db
        .update(schema.events)
        .set({
          ...eventUpdates,
          ...(eventUpdates.starts_at
            ? { starts_at: new Date(eventUpdates.starts_at as string) }
            : {}),
          ...(eventUpdates.ends_at !== undefined
            ? {
                ends_at: eventUpdates.ends_at ? new Date(eventUpdates.ends_at as string) : null,
              }
            : {}),
          updated_at: new Date(),
        })
        .where(applyWriteScopeFilters({ anchorEvent, profileId, scope }))
        .returning({
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
        });

      return rows.map(serializeCreatedEvent);
    },
  };
}
