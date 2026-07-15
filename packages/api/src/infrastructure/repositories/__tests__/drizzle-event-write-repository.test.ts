import type { DrizzleDbClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { CreateOwnedEventInput } from "../../../repositories";
import { createEventWriteRepository } from "../drizzle-event-write-repository";

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
