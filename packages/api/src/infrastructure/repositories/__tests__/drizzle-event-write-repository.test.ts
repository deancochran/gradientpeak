import type { DrizzleDbClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { CreateOwnedEventInput } from "../../../repositories";
import { createEventWriteRepository } from "../drizzle-event-write-repository";

function storedEvent(id: string, activityPlanId: string) {
  const now = new Date("2026-07-13T10:00:00.000Z");
  return {
    activity_plan_id: activityPlanId,
    all_day: false,
    created_at: now,
    description: null,
    ends_at: new Date("2026-07-13T11:00:00.000Z"),
    event_type: "planned" as const,
    id,
    linked_activity_id: null,
    notes: null,
    occurrence_key: "",
    original_starts_at: null,
    profile_id: "profile-123",
    recurrence_rule: null,
    recurrence_timezone: null,
    route_id: null,
    scheduled_date: "2026-07-13",
    series_id: "series-123",
    source_provider: null,
    starts_at: now,
    status: "scheduled" as const,
    timezone: "UTC",
    title: "Atomic event",
    training_plan_id: null,
    updated_at: now,
  };
}

const validStructure = {
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              name: "Step",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
};

function eventInput(overrides: Partial<CreateOwnedEventInput> = {}): CreateOwnedEventInput {
  return {
    activityPlanId: null,
    allDay: false,
    description: null,
    endsAt: "2026-07-13T11:00:00.000Z",
    eventType: "custom",
    notes: null,
    profileId: "profile-123",
    recurrenceRule: null,
    recurrenceTimezone: null,
    routeId: null,
    sourceProvider: "trainingpeaks",
    scheduledDate: "2026-07-13",
    startsAt: "2026-07-13T10:00:00.000Z",
    status: "scheduled",
    timezone: "UTC",
    title: "Atomic event",
    trainingPlanId: null,
    ...overrides,
  };
}

function createTransactionalDb(failAtInsert?: number) {
  const committedValues: Record<string, unknown>[] = [];
  let insertCount = 0;

  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const stagedValues: Record<string, unknown>[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          stagedValues.push(values);
          return {
            returning: vi.fn(async () => {
              insertCount += 1;
              if (insertCount === failAtInsert) throw new Error("insert failed");
              return [{ id: values.id }];
            }),
          };
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              const values = stagedValues.at(-1);
              if (!values) return [];
              return [
                {
                  activity_plan_id: values.activity_plan_id,
                  all_day: values.all_day,
                  created_at: values.created_at,
                  description: values.description,
                  ends_at: values.ends_at,
                  event_type: values.event_type,
                  id: values.id,
                  linked_activity_id: null,
                  notes: values.notes,
                  occurrence_key: values.occurrence_key,
                  original_starts_at: values.original_starts_at,
                  profile_id: values.profile_id,
                  recurrence_rule: values.recurrence_rule,
                  recurrence_timezone: values.recurrence_timezone,
                  route_id: values.route_id,
                  series_id: values.series_id,
                  source_provider: values.source_provider,
                  starts_at: values.starts_at,
                  status: values.status,
                  timezone: values.timezone,
                  title: values.title,
                  training_plan_id: values.training_plan_id,
                  updated_at: values.updated_at,
                },
              ];
            }),
          })),
        })),
      })),
    };

    const result = await callback(tx);
    committedValues.push(...stagedValues);
    return result;
  });

  return {
    db: { transaction } as unknown as DrizzleDbClient,
    transaction,
    committedValues,
  };
}

describe("createEventWriteRepository", () => {
  it("bulk reloads a scoped update instead of loading each updated event", async () => {
    const planId = "11111111-1111-4111-8111-111111111111";
    const updated = [storedEvent("event-1", planId), storedEvent("event-2", planId)];
    const selectResults = [
      updated.map(({ id, activity_plan_id, linked_activity_id, status }) => ({
        id,
        activity_plan_id,
        linked_activity_id,
        status,
      })),
      [{ id: planId, structure: validStructure }],
      updated,
    ];
    let selectCount = 0;
    const orderBy = vi.fn();
    const query = (result: unknown) => ({
      for: vi.fn(async () => result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    });
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            const resultQuery = query(selectResults[selectCount++]);
            return {
              ...resultQuery,
              orderBy: vi.fn(() => {
                orderBy();
                return resultQuery;
              }),
            };
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => updated.map(({ id }) => ({ id }))),
          })),
        })),
      })),
    };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as DrizzleDbClient;

    const rows = await createEventWriteRepository(db).updateOwnedEventsForScope({
      anchorEvent: {
        id: "event-1",
        series_id: "series-123",
        starts_at: "2026-07-13T10:00:00.000Z",
      },
      eventUpdates: { title: "Bulk updated" },
      profileId: "profile-123",
      scope: "series",
    });

    expect(rows.map((row) => row.id)).toEqual(["event-1", "event-2"]);
    expect(selectCount).toBe(3); // locked scope, current-plan classification, one bulk reload
    expect(orderBy).toHaveBeenCalledTimes(1);
  });

  it("persists an entire series in one transaction without partial external identity", async () => {
    const { db, transaction, committedValues } = createTransactionalDb();
    const repository = createEventWriteRepository(db);

    const created = await repository.createOwnedEvents({
      anchor: eventInput({
        recurrenceRule: "FREQ=WEEKLY;COUNT=2",
        occurrenceKey: "2026-07-13",
        routeId: "route-123",
      }),
      occurrences: [
        eventInput({
          startsAt: "2026-07-20T10:00:00.000Z",
          endsAt: "2026-07-20T11:00:00.000Z",
          recurrenceRule: "FREQ=WEEKLY;COUNT=2",
          occurrenceKey: "2026-07-20",
          routeId: "route-123",
        }),
      ],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(2);
    expect(committedValues).toHaveLength(2);
    expect(committedValues.every((values) => !("source_provider" in values))).toBe(true);
    expect(committedValues.map((values) => values.route_id)).toEqual(["route-123", "route-123"]);
    expect(committedValues[1]?.series_id).toBe(created[0]?.id);
  });

  it("omits partial external identity for an ordinary single event", async () => {
    const { db, transaction, committedValues } = createTransactionalDb();
    const repository = createEventWriteRepository(db);

    await repository.createOwnedEvent(eventInput({ sourceProvider: "trainingpeaks" }));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(committedValues).toHaveLength(1);
    expect(committedValues[0]).not.toHaveProperty("source_provider");
  });

  it("rolls back the whole series when a middle insert fails", async () => {
    const { db, transaction, committedValues } = createTransactionalDb(2);
    const repository = createEventWriteRepository(db);

    await expect(
      repository.createOwnedEvents({
        anchor: eventInput(),
        occurrences: [eventInput(), eventInput()],
      }),
    ).rejects.toThrow("insert failed");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(committedValues).toEqual([]);
  });
});
