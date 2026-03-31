import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationsRouter } from "../integrations";

type EventRow = {
  id: string;
  profile_id: string;
  event_type: "imported" | "planned_activity" | "rest_day" | "race" | "custom";
  title: string;
  description: string | null;
  all_day: boolean;
  timezone: string;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "completed" | "cancelled" | "skipped" | "rescheduled";
  source_provider: string | null;
  integration_account_id: string | null;
  external_calendar_id: string | null;
  external_event_id: string | null;
  occurrence_key: string;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  updated_at: string;
};

function createEventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    profile_id: "profile-123",
    event_type: "imported",
    title: "Imported Event",
    description: null,
    all_day: false,
    timezone: "UTC",
    starts_at: "2026-03-01T10:00:00.000Z",
    ends_at: "2026-03-01T11:00:00.000Z",
    status: "scheduled",
    source_provider: "ical",
    integration_account_id: "11111111-1111-4111-8111-111111111111",
    external_calendar_id: "https://example.com/calendar.ics",
    external_event_id: "uid-1",
    occurrence_key: "2026-03-01T10:00:00.000Z",
    recurrence_rule: null,
    recurrence_timezone: null,
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function createSupabaseMock(initialEvents: EventRow[] = []) {
  const state = {
    events: [...initialEvents],
  };
  let eventIdCounter = 100;

  const client = {
    from: (table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let mode: "select" | "delete" = "select";

      const builder: any = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters.push((row) => row[field] === value);
          return builder;
        },
        in: (field: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[field]));
          return builder;
        },
        order: () => builder,
        upsert: (payload: any, options: { onConflict: string }) => {
          if (table !== "events") {
            return Promise.resolve({ data: null, error: null });
          }

          const conflictFields = options.onConflict.split(",").map((field) => field.trim());
          const current = state.events.find((row) =>
            conflictFields.every((field) => row[field as keyof EventRow] === payload[field]),
          );
          const updatedAt = new Date().toISOString();

          if (current) {
            Object.assign(current, payload, { updated_at: updatedAt });
          } else {
            state.events.push({
              ...createEventRow({
                id: `evt-${eventIdCounter++}`,
              }),
              ...payload,
              updated_at: updatedAt,
            });
          }

          return Promise.resolve({ data: null, error: null });
        },
        delete: () => {
          mode = "delete";
          return builder;
        },
        then: (onFulfilled: (result: { data: any; error: null }) => unknown) => {
          if (table !== "events") {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled);
          }

          const filtered = state.events.filter((row) =>
            filters.every((predicate) => predicate(row)),
          );

          if (mode === "delete") {
            const idsToDelete = new Set(filtered.map((row) => row.id));
            state.events = state.events.filter((row) => !idsToDelete.has(row.id));
            return Promise.resolve({ data: null, error: null }).then(onFulfilled);
          }

          return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
        },
      };

      return builder;
    },
  };

  return { client, state };
}

function createCaller(initialEvents: EventRow[] = []) {
  const { client, state } = createSupabaseMock(initialEvents);

  const caller = integrationsRouter.createCaller({
    supabase: client as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, state };
}

const ICS_BASE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-1
DTSTART:20260310T140000Z
DTEND:20260310T150000Z
SUMMARY:Threshold Ride
DESCRIPTION:Warmup and intervals
END:VEVENT
END:VCALENDAR`;

describe("integrationsRouter iCal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("addFeed imports rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(ICS_BASE, { status: 200 }));

    const { caller, state } = createCaller();

    const result = await caller.ical.addFeed({
      url: "https://example.com/my.ics",
    });

    expect(result.feed_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.feed_url).toBe("https://example.com/my.ics");
    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.synced_at).toBeTruthy();

    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.event_type).toBe("imported");
    expect(state.events[0]?.source_provider).toBe("ical");
  });

  it("second sync updates not duplicates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(ICS_BASE, { status: 200 }));

    const ICS_UPDATED = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-1
DTSTART:20260310T140000Z
DTEND:20260310T153000Z
SUMMARY:Threshold Ride Updated
DESCRIPTION:Updated session
END:VEVENT
END:VCALENDAR`;

    fetchMock.mockResolvedValueOnce(new Response(ICS_UPDATED, { status: 200 }));

    const { caller, state } = createCaller();
    const first = await caller.ical.addFeed({
      url: "https://example.com/a.ics",
    });
    const second = await caller.ical.updateFeed({
      feed_id: first.feed_id,
      url: "https://example.com/a.ics",
    });

    expect(second.imported).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.removed).toBe(0);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.title).toBe("Threshold Ride Updated");
    expect(state.events[0]?.description).toBe("Updated session");
  });

  it("removeFeed purges rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(ICS_BASE, { status: 200 }));

    const { caller, state } = createCaller();
    const synced = await caller.ical.addFeed({
      url: "https://example.com/a.ics",
    });

    const removed = await caller.ical.removeFeed({
      feed_id: synced.feed_id,
    });

    expect(removed.success).toBe(true);
    expect(removed.removed_events).toBe(1);
    expect(state.events).toHaveLength(0);
  });

  it("listFeeds aggregation works", async () => {
    const feedA = "11111111-1111-4111-8111-111111111111";
    const feedB = "22222222-2222-4222-8222-222222222222";

    const { caller } = createCaller([
      createEventRow({
        id: "evt-a1",
        integration_account_id: feedA,
        external_calendar_id: "https://example.com/a.ics",
        updated_at: "2026-03-01T10:00:00.000Z",
      }),
      createEventRow({
        id: "evt-a2",
        integration_account_id: feedA,
        external_calendar_id: "https://example.com/a.ics",
        external_event_id: "uid-2",
        occurrence_key: "2026-03-02T10:00:00.000Z",
        updated_at: "2026-03-02T10:00:00.000Z",
      }),
      createEventRow({
        id: "evt-b1",
        integration_account_id: feedB,
        external_calendar_id: "https://example.com/b.ics",
        updated_at: "2026-02-01T10:00:00.000Z",
      }),
      createEventRow({
        id: "evt-other",
        source_provider: "wahoo",
        integration_account_id: "not-ical",
        external_calendar_id: "https://ignore.example.com",
      }),
    ]);

    const feeds = await caller.ical.listFeeds({});

    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual({
      feed_id: feedA,
      feed_url: "https://example.com/a.ics",
      event_count: 2,
      last_event_updated_at: "2026-03-02T10:00:00.000Z",
    });
    expect(feeds[1]).toEqual({
      feed_id: feedB,
      feed_url: "https://example.com/b.ics",
      event_count: 1,
      last_event_updated_at: "2026-02-01T10:00:00.000Z",
    });
  });
});
