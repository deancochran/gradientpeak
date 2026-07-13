import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { createIcalFeedRepository } from "./drizzle-ical-feed-repository";

const dialect = new PgDialect();

describe("drizzle iCal feed repository", () => {
  it("serializes concurrent upserts for the same external occurrence identity", async () => {
    let release = Promise.resolve();
    let storedEventId: string | null = null;
    const insertedIds: string[] = [];
    const lockSql: string[] = [];

    const db = {
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const previous = release;
        let unlock = () => {};
        release = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await previous;

        let executeCount = 0;
        const tx = {
          execute: vi.fn(async (query: unknown) => {
            executeCount += 1;
            if (executeCount === 1) {
              lockSql.push(dialect.sqlToQuery(query as never).sql);
              return { rows: [{ pg_advisory_xact_lock: null }] };
            }
            return { rows: storedEventId ? [{ event_id: storedEventId }] : [] };
          }),
          insert: vi.fn(() => ({
            values: (values: { id: string }) => ({
              onConflictDoUpdate: async () => {
                insertedIds.push(values.id);
                storedEventId ??= values.id;
              },
            }),
          })),
        };

        try {
          await callback(tx);
        } finally {
          unlock();
        }
      }),
    };
    const repository = createIcalFeedRepository({ db: db as never });
    const input = {
      profileId: "11111111-1111-4111-8111-111111111111",
      feedId: "22222222-2222-4222-8222-222222222222",
      feedUrl: "https://calendar.example/feed.ics",
      event: {
        allDay: false,
        description: null,
        endsAt: "2026-07-12T09:00:00.000Z",
        externalEventId: "race@example.test",
        occurrenceKey: "2026-07-12T08:00:00.000Z",
        recurrenceRule: null,
        recurrenceTimezone: null,
        startsAt: "2026-07-12T08:00:00.000Z",
        status: "scheduled" as const,
        timezone: "UTC",
        title: "Race",
      },
    };

    await Promise.all([
      repository.upsertImportedEvent(input),
      repository.upsertImportedEvent({ ...input, event: { ...input.event, title: "Race update" } }),
    ]);

    expect(insertedIds).toHaveLength(2);
    expect(new Set(insertedIds).size).toBe(1);
    expect(lockSql).toHaveLength(2);
    expect(lockSql.every((statement) => statement.includes("pg_advisory_xact_lock"))).toBe(true);
  });
});
