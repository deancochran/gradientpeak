import { describe, expect, it, vi } from "vitest";

const { randomUuidState } = vi.hoisted(() => ({
  randomUuidState: {
    next: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
}));

vi.mock("node:crypto", () => ({
  randomUUID: () => randomUuidState.next,
}));

import { createRouterCaller } from "../../test/router";
import { activityEffortsRouter } from "../activity-efforts";

const userId = "11111111-1111-4111-8111-111111111111";

function buildEffortRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    created_at: new Date("2026-03-03T00:00:00.000Z"),
    updated_at: null,
    profile_id: userId,
    activity_id: null,
    recorded_at: new Date("2026-03-01T10:00:00.000Z"),
    activity_category: "run" as const,
    effort_type: "speed" as const,
    duration_seconds: 600,
    start_offset: 30,
    unit: "m/s",
    value: 4.2,
    source: null,
    method: null,
    calculation_version: null,
    quality_score: null,
    provenance: null,
    ...overrides,
  };
}

function createCaller(options?: {
  selectResult?: unknown;
  selectOneResult?: unknown[];
  insertResult?: unknown[];
  updateResult?: unknown[];
  deleteResult?: unknown;
}) {
  const selectResult = options?.selectResult ?? [];
  const selectOneResult = options?.selectOneResult ?? [];
  const insertResult = options?.insertResult ?? [];
  const updateResult = options?.updateResult ?? [];
  const deleteResult = options?.deleteResult ?? [];

  const limit = vi.fn(async () => selectOneResult);
  const orderBy = vi.fn(async () => selectResult);
  const whereForSelect = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ where: whereForSelect }));
  const select = vi.fn(() => ({ from }));

  const returning = vi.fn(async () => insertResult);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const updateReturning = vi.fn(async () => updateResult);
  const whereForUpdate = vi.fn(() => ({ returning: updateReturning }));
  const set = vi.fn(() => ({ where: whereForUpdate }));
  const update = vi.fn(() => ({ set }));

  const whereForDelete = vi.fn(async () => deleteResult);
  const del = vi.fn(() => ({ where: whereForDelete }));

  const db = {
    select,
    insert,
    update,
    delete: del,
  };

  const caller = createRouterCaller(activityEffortsRouter, { db, userId });

  return {
    caller,
    db,
    spies: {
      select,
      from,
      whereForSelect,
      limit,
      orderBy,
      insert,
      values,
      returning,
      update,
      set,
      whereForUpdate,
      updateReturning,
      delete: del,
      whereForDelete,
    },
  };
}

describe("activityEffortsRouter", () => {
  it("gets the current profile's efforts", async () => {
    const efforts = [buildEffortRow()];
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
      start_offset: 30,
      recorded_at: "2026-03-02T12:34:56.000Z",
    };
    const insertedRow = buildEffortRow({
      id: randomUuidState.next,
      ...input,
      created_at: new Date("2026-03-03T00:00:00.000Z"),
      recorded_at: new Date(input.recorded_at),
    });
    const { caller, spies } = createCaller({ insertResult: [insertedRow] });

    const result = await caller.create(input);

    expect(result).toEqual(insertedRow);
    expect(spies.insert).toHaveBeenCalledOnce();
    expect(spies.values).toHaveBeenCalledOnce();
    expect(spies.returning).toHaveBeenCalledOnce();

    const insertedPayload = (spies.values.mock.calls as any[][])[0]?.[0];
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

  it("updates an owned effort and normalizes timestamps", async () => {
    const oldRecordedAt = new Date("2026-03-01T10:00:00.000Z");
    const newRecordedAt = "2026-03-02T12:34:56.000Z";
    const updatedRow = buildEffortRow({
      value: 4.8,
      recorded_at: new Date(newRecordedAt),
      updated_at: new Date("2026-03-03T01:02:03.000Z"),
    });
    const { caller, spies } = createCaller({
      selectOneResult: [buildEffortRow({ recorded_at: oldRecordedAt })],
      updateResult: [updatedRow],
    });

    const result = await caller.update({
      id: updatedRow.id,
      value: 4.8,
      recorded_at: newRecordedAt,
    });

    expect(result).toEqual(updatedRow);
    expect(spies.select).toHaveBeenCalledOnce();
    expect(spies.limit).toHaveBeenCalledOnce();
    expect(spies.update).toHaveBeenCalledOnce();
    expect(spies.set).toHaveBeenCalledOnce();
    expect(spies.whereForUpdate).toHaveBeenCalledOnce();
    expect(spies.updateReturning).toHaveBeenCalledOnce();

    const updatePayload = (spies.set.mock.calls as any[][])[0]?.[0];
    expect(updatePayload).toMatchObject({ value: 4.8 });
    expect(updatePayload.unit).toBe("m/s");
    expect(updatePayload.recorded_at).toBeInstanceOf(Date);
    expect(updatePayload.recorded_at.toISOString()).toBe(newRecordedAt);
    expect(updatePayload.updated_at).toBeInstanceOf(Date);
  });

  it("returns null for update when the effort is not owned or not found", async () => {
    const { caller, spies } = createCaller({
      selectOneResult: [],
      updateResult: [],
    });

    const result = await caller.update({
      id: "22222222-2222-4222-8222-222222222222",
      value: 4.8,
    });

    expect(result).toBeNull();
    expect(spies.select).toHaveBeenCalledOnce();
    expect(spies.limit).toHaveBeenCalledOnce();
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.updateReturning).not.toHaveBeenCalled();
  });

  it("returns a success payload after deleting an owned effort", async () => {
    const existing = buildEffortRow();
    const { caller, spies } = createCaller({ selectOneResult: [existing] });
    const id = "22222222-2222-4222-8222-222222222222";

    const result = await caller.delete({ id });

    expect(result).toEqual({ success: true, deletedId: id });
    expect(spies.delete).toHaveBeenCalledOnce();
    expect(spies.whereForDelete).toHaveBeenCalledOnce();
  });

  it("returns idempotent success for delete when the effort is not owned or not found", async () => {
    const { caller, spies } = createCaller({ selectOneResult: [] });
    const id = "22222222-2222-4222-8222-222222222222";

    const result = await caller.delete({ id });

    expect(result).toEqual({ success: true, deletedId: id });
    expect(spies.delete).toHaveBeenCalledOnce();
    expect(spies.whereForDelete).toHaveBeenCalledOnce();
  });

  it("rejects unexpected create input keys at the router boundary", async () => {
    const { caller, spies } = createCaller();

    await expect(
      caller.create({
        activity_id: null,
        activity_category: "run",
        duration_seconds: 600,
        effort_type: "speed",
        value: 4.2,
        start_offset: 30,
        recorded_at: "2026-03-02T12:34:56.000Z",
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("rejects malformed effort rows before returning them", async () => {
    const { caller } = createCaller({
      selectResult: [buildEffortRow({ id: "not-a-uuid" })],
    });

    await expect(caller.getForProfile()).rejects.toThrow();
  });
});
