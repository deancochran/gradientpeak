import { describe, expect, it, vi } from "vitest";

const { randomUuidState } = vi.hoisted(() => ({
  randomUuidState: {
    next: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
}));

vi.mock("node:crypto", () => ({
  randomUUID: () => randomUuidState.next,
}));

import { activityEffortsRouter } from "../activity-efforts";

const userId = "11111111-1111-4111-8111-111111111111";

function createCaller(options?: {
  selectResult?: unknown;
  insertResult?: unknown[];
  deleteResult?: unknown;
}) {
  const selectResult = options?.selectResult ?? [];
  const insertResult = options?.insertResult ?? [];
  const deleteResult = options?.deleteResult ?? [];

  const orderBy = vi.fn(async () => selectResult);
  const whereForSelect = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where: whereForSelect }));
  const select = vi.fn(() => ({ from }));

  const returning = vi.fn(async () => insertResult);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const whereForDelete = vi.fn(async () => deleteResult);
  const del = vi.fn(() => ({ where: whereForDelete }));

  const db = {
    select,
    insert,
    delete: del,
  };

  const caller = activityEffortsRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return {
    caller,
    db,
    spies: {
      select,
      from,
      whereForSelect,
      orderBy,
      insert,
      values,
      returning,
      delete: del,
      whereForDelete,
    },
  };
}

describe("activityEffortsRouter", () => {
  it("gets the current profile's efforts", async () => {
    const efforts = [
      {
        id: "effort-1",
        profile_id: userId,
        activity_category: "run",
        effort_type: "speed",
        recorded_at: new Date("2026-03-01T10:00:00.000Z"),
      },
    ];
    const { caller, spies } = createCaller({ selectResult: efforts });

    const result = await caller.getForProfile();

    expect(result).toEqual(efforts);
    expect(spies.select).toHaveBeenCalledOnce();
    expect(spies.from).toHaveBeenCalledOnce();
    expect(spies.whereForSelect).toHaveBeenCalledOnce();
    expect(spies.orderBy).toHaveBeenCalledOnce();
  });

  it("creates an effort for the current profile and normalizes timestamps", async () => {
    const input = {
      activity_id: null,
      activity_category: "run" as const,
      duration_seconds: 600,
      effort_type: "speed" as const,
      value: 4.2,
      unit: "m/s",
      start_offset: 30,
      recorded_at: "2026-03-02T12:34:56.000Z",
    };
    const insertedRow = {
      id: randomUuidState.next,
      ...input,
      profile_id: userId,
      created_at: new Date("2026-03-03T00:00:00.000Z"),
      recorded_at: new Date(input.recorded_at),
    };
    const { caller, spies } = createCaller({ insertResult: [insertedRow] });

    const result = await caller.create(input);

    expect(result).toEqual(insertedRow);
    expect(spies.insert).toHaveBeenCalledOnce();
    expect(spies.values).toHaveBeenCalledOnce();
    expect(spies.returning).toHaveBeenCalledOnce();

    const insertedPayload = (spies.values.mock.calls as any[][])[0]![0];
    expect(insertedPayload).toMatchObject({
      id: randomUuidState.next,
      profile_id: userId,
      activity_id: null,
      activity_category: "run",
      duration_seconds: 600,
      effort_type: "speed",
      value: 4.2,
      unit: "m/s",
      start_offset: 30,
    });
    expect(insertedPayload.created_at).toBeInstanceOf(Date);
    expect(insertedPayload.recorded_at).toBeInstanceOf(Date);
    expect(insertedPayload.recorded_at.toISOString()).toBe(input.recorded_at);
  });

  it("returns a success payload after deleting an owned effort", async () => {
    const { caller, spies } = createCaller();
    const id = "22222222-2222-4222-8222-222222222222";

    const result = await caller.delete({ id });

    expect(result).toEqual({ success: true, deletedId: id });
    expect(spies.delete).toHaveBeenCalledOnce();
    expect(spies.whereForDelete).toHaveBeenCalledOnce();
  });
});
