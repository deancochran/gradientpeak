import { describe, expect, it, vi } from "vitest";
import {
  MAX_TRENDS_DASHBOARD_ROWS,
  MAX_TRENDS_DASHBOARD_SEGMENTS,
} from "../../repositories/trends-dashboard-repository";
import { createDrizzleTrendsDashboardRepository } from "./drizzle-trends-dashboard-repository";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";

function row(id = activityId) {
  return {
    id,
    profile_id: profileId,
    name: "Ride",
    started_at: new Date("2026-04-01T07:00:00.000Z"),
    finished_at: null,
    elapsed_ms: 1,
    active_ms: 1,
    moving_ms: 1,
    timing_coverage: "complete",
    distance_meters: null,
    avg_heart_rate: null,
    max_heart_rate: null,
  };
}

function dbWith(results: unknown[]) {
  const calls: string[] = [];
  let index = 0;
  const builder: any = {
    from: vi.fn(() => (calls.push("from"), builder)),
    where: vi.fn(() => (calls.push("where"), builder)),
    orderBy: vi.fn(() => (calls.push("orderBy"), builder)),
    limit: vi.fn(() => (calls.push("limit"), builder)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(results[index++]).then(resolve),
  };
  return { calls, db: { select: vi.fn(() => (calls.push("select"), builder)) } };
}

describe("createDrizzleTrendsDashboardRepository", () => {
  it("selects owned range activities once, then ordered batched segments once", async () => {
    const { db, calls } = dbWith([[row()], []]);
    const result = await createDrizzleTrendsDashboardRepository(
      db as never,
    ).loadDashboardActivities({
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
    });
    expect(result).toEqual([{ ...row(), segments: [] }]);
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      "select",
      "from",
      "where",
      "orderBy",
      "limit",
      "select",
      "from",
      "where",
      "orderBy",
      "limit",
    ]);
  });

  it("adds the category predicate to the activity query without another select", async () => {
    const { db, calls } = dbWith([[row()], []]);
    await createDrizzleTrendsDashboardRepository(db as never).loadDashboardActivities({
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
      type: "bike",
    });
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(calls.filter((call) => call === "where")).toHaveLength(2);
  });

  it("groups large ordered segment sets without adding database queries", async () => {
    const segments = Array.from({ length: 10_000 }, (_, index) => ({
      activity_id: activityId,
      id: `segment-${index}`,
      ordinal: index,
    }));
    const { db } = dbWith([[row()], segments]);

    const result = await createDrizzleTrendsDashboardRepository(
      db as never,
    ).loadDashboardActivities({
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
    });

    expect(result).toEqual([{ ...row(), segments }]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("skips the segment query for no activities", async () => {
    const { db } = dbWith([[]]);
    await expect(
      createDrizzleTrendsDashboardRepository(db as never).loadDashboardActivities({
        profileId,
        startDate: new Date(),
        endDate: new Date(),
      }),
    ).resolves.toEqual([]);
    expect(db.select).toHaveBeenCalledOnce();
  });

  it("returns the typed row-limit failure rather than truncating", async () => {
    const { db } = dbWith([
      Array.from({ length: MAX_TRENDS_DASHBOARD_ROWS + 1 }, (_, index) => row(`${index}`)),
    ]);
    await expect(
      createDrizzleTrendsDashboardRepository(db as never).loadDashboardActivities({
        profileId,
        startDate: new Date(),
        endDate: new Date(),
      }),
    ).resolves.toEqual({ kind: "row_limit_exceeded" });
    expect(db.select).toHaveBeenCalledOnce();
  });

  it("returns the typed segment-limit failure rather than incomplete segment sets", async () => {
    const { db } = dbWith([
      [row()],
      Array.from({ length: MAX_TRENDS_DASHBOARD_SEGMENTS + 1 }, () => ({
        activity_id: activityId,
      })),
    ]);
    await expect(
      createDrizzleTrendsDashboardRepository(db as never).loadDashboardActivities({
        profileId,
        startDate: new Date(),
        endDate: new Date(),
      }),
    ).resolves.toEqual({ kind: "segment_limit_exceeded" });
  });
});
