import { randomUUID } from "node:crypto";
import { schema } from "@repo/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { CreateIcalFeedRepositoryOptions, IcalFeedRepository } from "../../repositories";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

export function createIcalFeedRepository({
  db,
}: CreateIcalFeedRepositoryOptions): IcalFeedRepository {
  return {
    async getExistingFeedEvents({ profileId, feedId }) {
      const rows = await db
        .select({
          id: schema.events.id,
          external_calendar_id: schema.eventExternalLinks.external_calendar_id,
          external_event_id: schema.eventExternalLinks.external_event_id,
          occurrence_key: schema.eventExternalLinks.occurrence_key,
        })
        .from(schema.events)
        .innerJoin(
          schema.eventExternalLinks,
          eq(schema.eventExternalLinks.event_id, schema.events.id),
        )
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.eventExternalLinks.source_provider, "ical"),
            eq(schema.eventExternalLinks.integration_account_id, feedId),
            eq(schema.events.event_type, "imported"),
          ),
        );

      return rows.map((row) => ({ ...row, occurrence_key: row.occurrence_key ?? "" }));
    },

    async listFeedRows(profileId) {
      const rows = await db
        .select({
          integration_account_id: schema.eventExternalLinks.integration_account_id,
          external_calendar_id: schema.eventExternalLinks.external_calendar_id,
          updated_at: schema.events.updated_at,
        })
        .from(schema.events)
        .innerJoin(
          schema.eventExternalLinks,
          eq(schema.eventExternalLinks.event_id, schema.events.id),
        )
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.eventExternalLinks.source_provider, "ical"),
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
        .innerJoin(
          schema.eventExternalLinks,
          eq(schema.eventExternalLinks.event_id, schema.events.id),
        )
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.eventExternalLinks.source_provider, "ical"),
            eq(schema.eventExternalLinks.integration_account_id, feedId),
            eq(schema.events.event_type, "imported"),
          ),
        );

      return rows.map((row) => row.id);
    },

    async removeImportedEvents({ profileId, ids }) {
      if (ids.length === 0) return;

      await db
        .delete(schema.events)
        .where(and(eq(schema.events.profile_id, profileId), inArray(schema.events.id, ids)));
    },

    async upsertImportedEvent({ profileId, feedId, feedUrl, event }) {
      const existing = await db.execute(sql<{ event_id: string }>`
        select event_id
        from event_external_links
        where profile_id = ${profileId}::uuid
          and source_provider = 'ical'
          and integration_account_id = ${feedId}::uuid
          and external_calendar_id = ${feedUrl}
          and external_event_id = ${event.externalEventId}
          and occurrence_key = ${event.occurrenceKey ?? ""}
        limit 1
      `);
      const eventId = getSqlRows<{ event_id: string }>(existing)[0]?.event_id ?? randomUUID();

      await db
        .insert(schema.events)
        .values({
          all_day: event.allDay,
          created_at: new Date(),
          description: event.description,
          ends_at: event.endsAt ? new Date(event.endsAt) : null,
          event_type: "imported",
          id: eventId,
          profile_id: profileId,
          starts_at: new Date(event.startsAt),
          status: event.status,
          timezone: event.timezone || "UTC",
          title: event.title,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.events.id,
          set: {
            all_day: event.allDay,
            description: event.description,
            ends_at: event.endsAt ? new Date(event.endsAt) : null,
            starts_at: new Date(event.startsAt),
            status: event.status,
            timezone: event.timezone || "UTC",
            title: event.title,
            updated_at: new Date(),
          },
        });

      await db
        .insert(schema.eventExternalLinks)
        .values({
          event_id: eventId,
          external_calendar_id: feedUrl,
          external_event_id: event.externalEventId,
          integration_account_id: feedId,
          occurrence_key: event.occurrenceKey ?? "",
          profile_id: profileId,
          source_provider: "ical",
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.eventExternalLinks.event_id,
          set: {
            external_calendar_id: feedUrl,
            external_event_id: event.externalEventId,
            integration_account_id: feedId,
            occurrence_key: event.occurrenceKey ?? "",
            source_provider: "ical",
            updated_at: new Date(),
          },
        });

      await db
        .insert(schema.eventRecurrence)
        .values({
          event_id: eventId,
          occurrence_key: event.occurrenceKey ?? "",
          profile_id: profileId,
          recurrence_rule: event.recurrenceRule,
          recurrence_timezone: event.recurrenceTimezone,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.eventRecurrence.event_id,
          set: {
            occurrence_key: event.occurrenceKey ?? "",
            recurrence_rule: event.recurrenceRule,
            recurrence_timezone: event.recurrenceTimezone,
            updated_at: new Date(),
          },
        });
    },
  };
}
