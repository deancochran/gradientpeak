import { randomUUID } from "node:crypto";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, gte, or, sql } from "drizzle-orm";
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
    idx: row.idx ?? 0,
    all_day: row.all_day ?? false,
    occurrence_key: row.occurrence_key ?? "",
    status: row.status ?? "scheduled",
    timezone: row.timezone ?? "UTC",
    title: row.title ?? "",
    created_at: row.created_at.toISOString(),
    starts_at: row.starts_at.toISOString(),
    ends_at: row.ends_at?.toISOString() ?? null,
    original_starts_at: row.original_starts_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
    activity_plan: null,
  };
}

function serializeSplitEventRow(row: {
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
  return serializeCreatedEvent(row);
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

  const seriesId = (input.anchorEvent.series_id ?? input.anchorEvent.id) as string;

  if (input.scope === "future") {
    return and(
      ...baseConditions,
      or(
        eq(schema.events.id, seriesId),
        sql`exists (
          select 1
          from event_recurrence
          where event_recurrence.event_id = ${schema.events.id}
            and event_recurrence.profile_id = ${schema.events.profile_id}
            and event_recurrence.series_id = ${seriesId}::uuid
        )`,
      ),
      gte(schema.events.starts_at, new Date(input.anchorEvent.starts_at)),
    );
  }

  return and(
    ...baseConditions,
    or(
      eq(schema.events.id, seriesId),
      sql`exists (
        select 1
        from event_recurrence
        where event_recurrence.event_id = ${schema.events.id}
          and event_recurrence.profile_id = ${schema.events.profile_id}
          and event_recurrence.series_id = ${seriesId}::uuid
      )`,
    ),
  );
}

const splitEventReturningColumns = {
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
  activity_plan_id: schema.eventScheduleLinks.activity_plan_id,
  training_plan_id: schema.eventScheduleLinks.training_plan_id,
  linked_activity_id: schema.eventScheduleLinks.linked_activity_id,
  recurrence_rule: schema.eventRecurrence.recurrence_rule,
  recurrence_timezone: schema.eventRecurrence.recurrence_timezone,
  series_id: schema.eventRecurrence.series_id,
  occurrence_key: schema.eventRecurrence.occurrence_key,
  original_starts_at: schema.eventRecurrence.original_starts_at,
  source_provider: schema.eventExternalLinks.source_provider,
};

async function loadSplitEvent(db: any, eventId: string, profileId: string) {
  const [row] = await db
    .select(splitEventReturningColumns)
    .from(schema.events)
    .leftJoin(schema.eventScheduleLinks, eq(schema.events.id, schema.eventScheduleLinks.event_id))
    .leftJoin(schema.eventRecurrence, eq(schema.events.id, schema.eventRecurrence.event_id))
    .leftJoin(schema.eventExternalLinks, eq(schema.events.id, schema.eventExternalLinks.event_id))
    .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, profileId)))
    .limit(1);

  if (!row) {
    throw new Error("Failed to load event");
  }

  return serializeSplitEventRow(row);
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
      const eventId = randomUUID();
      const now = new Date();

      const [row] = await db.transaction(async (tx) => {
        const [eventRow] = await tx
          .insert(schema.events)
          .values({
            id: eventId,
            created_at: now,
            updated_at: now,
            profile_id: input.profileId,
            event_type: input.eventType,
            title: input.title,
            all_day: input.allDay,
            timezone: input.timezone,
            starts_at: new Date(input.startsAt),
            ends_at: input.endsAt ? new Date(input.endsAt) : null,
            status: input.status,
            notes: input.notes,
            description: input.description,
          })
          .returning({ id: schema.events.id });

        if (!eventRow) return [];

        if (input.activityPlanId || input.trainingPlanId) {
          await tx.insert(schema.eventScheduleLinks).values({
            event_id: eventId,
            profile_id: input.profileId,
            activity_plan_id: input.activityPlanId,
            training_plan_id: input.trainingPlanId,
            created_at: now,
            updated_at: now,
          });
        }

        if (
          input.recurrenceRule ||
          input.recurrenceTimezone ||
          input.seriesId ||
          input.occurrenceKey ||
          input.originalStartsAt
        ) {
          await tx.insert(schema.eventRecurrence).values({
            event_id: eventId,
            profile_id: input.profileId,
            recurrence_rule: input.recurrenceRule,
            recurrence_timezone: input.recurrenceTimezone,
            series_id: input.seriesId ?? null,
            occurrence_key: input.occurrenceKey ?? "",
            original_starts_at: input.originalStartsAt ? new Date(input.originalStartsAt) : null,
            created_at: now,
            updated_at: now,
          });
        }

        return tx
          .select(splitEventReturningColumns)
          .from(schema.events)
          .leftJoin(
            schema.eventScheduleLinks,
            eq(schema.events.id, schema.eventScheduleLinks.event_id),
          )
          .leftJoin(schema.eventRecurrence, eq(schema.events.id, schema.eventRecurrence.event_id))
          .leftJoin(
            schema.eventExternalLinks,
            eq(schema.events.id, schema.eventExternalLinks.event_id),
          )
          .where(and(eq(schema.events.id, eventId), eq(schema.events.profile_id, input.profileId)))
          .limit(1);
      });

      if (!row) {
        throw new Error("Failed to create event");
      }

      return serializeSplitEventRow(row);
    },

    async listOwnedEventsForSeries({ anchorEvent, profileId }) {
      const seriesId = (anchorEvent.series_id ?? anchorEvent.id) as string;
      const rows = await db
        .select(splitEventReturningColumns)
        .from(schema.events)
        .leftJoin(
          schema.eventScheduleLinks,
          eq(schema.events.id, schema.eventScheduleLinks.event_id),
        )
        .leftJoin(schema.eventRecurrence, eq(schema.events.id, schema.eventRecurrence.event_id))
        .leftJoin(
          schema.eventExternalLinks,
          eq(schema.events.id, schema.eventExternalLinks.event_id),
        )
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            or(eq(schema.events.id, seriesId), eq(schema.eventRecurrence.series_id, seriesId)),
          ),
        );

      return rows.map(serializeSplitEventRow);
    },

    async updateOwnedEventsForScope({ anchorEvent, eventUpdates, profileId, scope }) {
      const now = new Date();
      const eventType = eventUpdates["event_type"];
      const notes = eventUpdates["notes"];
      const status = eventUpdates["status"];
      const title = eventUpdates["title"];
      const description = eventUpdates["description"];
      const allDay = eventUpdates["all_day"];
      const timezone = eventUpdates["timezone"];
      const startsAt = eventUpdates["starts_at"];
      const endsAt = eventUpdates["ends_at"];
      const activityPlanId = eventUpdates["activity_plan_id"] as string | null | undefined;
      const trainingPlanId = eventUpdates["training_plan_id"] as string | null | undefined;
      const linkedActivityId = eventUpdates["linked_activity_id"] as string | null | undefined;
      const recurrenceRule = eventUpdates["recurrence_rule"] as string | null | undefined;
      const recurrenceTimezone = eventUpdates["recurrence_timezone"] as string | null | undefined;
      const eventUpdateValues = {
        ...(eventType !== undefined
          ? { event_type: eventType as typeof schema.events.$inferInsert.event_type }
          : {}),
        ...(notes !== undefined ? { notes: notes as string | null } : {}),
        ...(status !== undefined
          ? { status: status as typeof schema.events.$inferInsert.status }
          : {}),
        ...(title !== undefined ? { title: title as string } : {}),
        ...(description !== undefined ? { description: description as string | null } : {}),
        ...(allDay !== undefined ? { all_day: allDay as boolean } : {}),
        ...(timezone !== undefined ? { timezone: timezone as string } : {}),
        ...(startsAt ? { starts_at: new Date(startsAt as string) } : {}),
        ...(endsAt !== undefined ? { ends_at: endsAt ? new Date(endsAt as string) : null } : {}),
        updated_at: now,
      };

      const rows = await db.transaction(async (tx) => {
        const updatedEvents = await tx
          .update(schema.events)
          .set(eventUpdateValues)
          .where(applyWriteScopeFilters({ anchorEvent, profileId, scope }))
          .returning({ id: schema.events.id });

        for (const updatedEvent of updatedEvents) {
          if (
            activityPlanId !== undefined ||
            trainingPlanId !== undefined ||
            linkedActivityId !== undefined
          ) {
            await tx
              .insert(schema.eventScheduleLinks)
              .values({
                event_id: updatedEvent.id,
                profile_id: profileId,
                activity_plan_id: activityPlanId === undefined ? null : activityPlanId,
                training_plan_id: trainingPlanId === undefined ? null : trainingPlanId,
                linked_activity_id: linkedActivityId === undefined ? null : linkedActivityId,
                created_at: now,
                updated_at: now,
              })
              .onConflictDoUpdate({
                target: schema.eventScheduleLinks.event_id,
                set: {
                  ...(activityPlanId !== undefined ? { activity_plan_id: activityPlanId } : {}),
                  ...(trainingPlanId !== undefined ? { training_plan_id: trainingPlanId } : {}),
                  ...(linkedActivityId !== undefined
                    ? { linked_activity_id: linkedActivityId }
                    : {}),
                  updated_at: now,
                },
              });
          }

          if (recurrenceRule !== undefined || recurrenceTimezone !== undefined) {
            await tx
              .insert(schema.eventRecurrence)
              .values({
                event_id: updatedEvent.id,
                profile_id: profileId,
                recurrence_rule: recurrenceRule,
                recurrence_timezone: recurrenceTimezone,
                occurrence_key: "",
                created_at: now,
                updated_at: now,
              })
              .onConflictDoUpdate({
                target: schema.eventRecurrence.event_id,
                set: {
                  ...(recurrenceRule !== undefined ? { recurrence_rule: recurrenceRule } : {}),
                  ...(recurrenceTimezone !== undefined
                    ? { recurrence_timezone: recurrenceTimezone }
                    : {}),
                  updated_at: now,
                },
              });
          }
        }

        return Promise.all(updatedEvents.map((event) => loadSplitEvent(tx, event.id, profileId)));
      });

      return rows;
    },
  };
}
