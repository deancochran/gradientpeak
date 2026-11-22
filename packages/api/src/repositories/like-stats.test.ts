import { describe, expect, it, vi } from "vitest";
import { getLikeStats, loadLikeStats } from "./like-stats";

function fakeDb(rows: Array<{ entity_id: string; likes_count: number; has_liked: boolean }>) {
  const groupBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ groupBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as never, select, where, groupBy };
}

describe("loadLikeStats", () => {
  it("returns zero state without querying for an empty page", async () => {
    const fake = fakeDb([]);
    const result = await loadLikeStats(fake.db, {
      entityType: "activity",
      entityIds: [],
      viewerProfileId: "11111111-1111-4111-8111-111111111111",
    });
    expect(getLikeStats(result, "missing")).toEqual({ likes_count: 0, has_liked: false });
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("maps many grouped counts and viewer state in one query", async () => {
    const fake = fakeDb([
      { entity_id: "a", likes_count: 3, has_liked: true },
      { entity_id: "b", likes_count: 8, has_liked: false },
    ]);
    const result = await loadLikeStats(fake.db, {
      entityType: "route",
      entityIds: ["a", "b", "a"],
      viewerProfileId: "11111111-1111-4111-8111-111111111111",
    });
    expect(getLikeStats(result, "a")).toEqual({ likes_count: 3, has_liked: true });
    expect(getLikeStats(result, "b")).toEqual({ likes_count: 8, has_liked: false });
    expect(fake.groupBy).toHaveBeenCalledOnce();
  });

  it.each([
    "activity",
    "activity_plan",
    "route",
    "training_plan",
  ] as const)("keeps %s aggregation isolated to its requested entity type", async (entityType) => {
    const fake = fakeDb([{ entity_id: `${entityType}-id`, likes_count: 2, has_liked: true }]);
    const result = await loadLikeStats(fake.db, {
      entityType,
      entityIds: [`${entityType}-id`],
      viewerProfileId: "11111111-1111-4111-8111-111111111111",
    });

    expect(getLikeStats(result, `${entityType}-id`)).toEqual({
      likes_count: 2,
      has_liked: true,
    });
    expect(getLikeStats(result, "different-type-id")).toEqual({
      likes_count: 0,
      has_liked: false,
    });
    expect(fake.groupBy).toHaveBeenCalledOnce();
  });
});
