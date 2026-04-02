import { randomUUID } from "node:crypto";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import type { CreateIcalFeedRepositoryOptions, IcalFeedRepository } from "../../repositories";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function createIcalFeedRepository({
  db,
}: CreateIcalFeedRepositoryOptions): IcalFeedRepository {
  return {
    async getExistingFeedEvents({ profileId, feedId }) {
      const rows = await db
        .select({
          id: schema.events.id,
          external_calendar_id: schema.events.external_calendar_id,
          external_event_id: schema.events.external_event_id,
          occurrence_key: schema.events.occurrence_key,
        })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.source_provider, "ical"),
            eq(schema.events.integration_account_id, feedId),
            eq(schema.events.event_type, "imported"),
          ),
        );

      return rows.map((row) => ({ ...row, occurrence_key: row.occurrence_key ?? "" }));
    },

    async listFeedRows(profileId) {
      const rows = await db
        .select({
          integration_account_id: schema.events.integration_account_id,
          external_calendar_id: schema.events.external_calendar_id,
          updated_at: schema.events.updated_at,
        })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.source_provider, "ical"),
            eq(schema.events.event_type, "imported"),
          ),
        );

      return rows.map((row) => ({
        integration_account_id: row.integration_account_id,
        external_calendar_id: row.external_calendar_id,
        updated_at: toIsoString(row.updated_at),
      }));
    },

    async listImportedEventIds({ profileId, feedId }) {
      const rows = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.source_provider, "ical"),
            eq(schema.events.integration_account_id, feedId),
            eq(schema.events.event_type, "imported"),
          ),
        );

      return rows.map((row) => row.id);
    },

    async removeImportedEvents({ profileId, feedId, ids }) {
      if (ids.length === 0) return;

      await db
        .delete(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.source_provider, "ical"),
            eq(schema.events.integration_account_id, feedId),
            inArray(schema.events.id, ids),
          ),
        );
    },

    async upsertImportedEvent({ profileId, feedId, feedUrl, event }) {
      await db
        .insert(schema.events)
        .values({
          id: randomUUID(),
          created_at: new Date(),
          updated_at: new Date(),
          profile_id: profileId,
          event_type: "imported",
          title: event.title,
          description: event.description,
          all_day: event.allDay,
          timezone: event.timezone || "UTC",
          starts_at: new Date(event.startsAt),
          ends_at: event.endsAt ? new Date(event.endsAt) : null,
          status: event.status,
          source_provider: "ical",
          integration_account_id: feedId,
          external_calendar_id: feedUrl,
          external_event_id: event.externalEventId,
          occurrence_key: event.occurrenceKey,
          recurrence_rule: event.recurrenceRule,
          recurrence_timezone: event.recurrenceTimezone,
        })
        .onConflictDoUpdate({
          target: [
            schema.events.profile_id,
            schema.events.source_provider,
            schema.events.integration_account_id,
            schema.events.external_calendar_id,
            schema.events.external_event_id,
            schema.events.occurrence_key,
          ],
          set: {
            title: event.title,
            description: event.description,
            all_day: event.allDay,
            timezone: event.timezone || "UTC",
            starts_at: new Date(event.startsAt),
            ends_at: event.endsAt ? new Date(event.endsAt) : null,
            status: event.status,
            recurrence_rule: event.recurrenceRule,
            recurrence_timezone: event.recurrenceTimezone,
            updated_at: new Date(),
          },
        });
    },
  };
}
