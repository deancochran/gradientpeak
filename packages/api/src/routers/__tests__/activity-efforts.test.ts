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
    segment_id: null,
    recorded_at: new Date("2026-03-01T10:00:00.000Z"),
    activity_category: "run" as const,
    effort_type: "speed" as const,
    duration_seconds: 600,
    start_offset: 30,
    unit: "meters_per_second",
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
  selectOneResults?: unknown[][];
  insertResult?: unknown[];
  updateResult?: unknown[];
  deleteResult?: unknown;
}) {
  const selectResult = options?.selectResult ?? [];
  const selectOneResult = options?.selectOneResult ?? [];
  const insertResult = options?.insertResult ?? [];
  const updateResult = options?.updateResult ?? [];
  const deleteResult = options?.deleteResult ?? [];

  let selectOneIndex = 0;
  const limit = vi.fn(async () =>
    options?.selectOneResults
      ? (options.selectOneResults[selectOneIndex++] ?? [])
      : selectOneResult,
  );
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

  it("rejects deletion of imported effort evidence", async () => {
    const imported = buildEffortRow({ source: "imported" });
    const { caller, spies } = createCaller({ selectOneResult: [imported] });

    await expect(caller.delete({ id: imported.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(spies.delete).not.toHaveBeenCalled();
  });

  it("rejects user update and delete mutations without touching storage", async () => {
    const { caller, spies } = createCaller();
    await expect(
      caller.update({ id: "22222222-2222-4222-8222-222222222222", value: 4.8 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.delete({ id: "22222222-2222-4222-8222-222222222222" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.delete).not.toHaveBeenCalled();
  });

  it("rejects malformed effort rows before returning them", async () => {
    const { caller } = createCaller({
      selectResult: [buildEffortRow({ id: "not-a-uuid" })],
    });

    await expect(caller.getForProfile()).rejects.toThrow();
  });
});
