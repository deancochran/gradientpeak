import { describe, expect, it } from "vitest";
import { createEventReadRepository } from "../drizzle-event-read-repository";

function emptyReadDb() {
  const tables: string[] = [];
  const db = {
    select(selection?: Record<string, unknown>) {
      const table =
        "planningTimezone" in (selection ?? {})
          ? "profiles"
          : "resolution_manifest" in (selection ?? {})
            ? "planned_sessions"
            : "activities";
      if (table) tables.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of ["from", "where", "orderBy", "limit"]) builder[method] = () => builder;
      builder.then = (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(resolve(table === "profiles" ? [{ planningTimezone: "UTC" }] : []));
      return builder;
    },
  };
  return { db, tables };
}

describe("drizzle-event-read-repository effective Plan Load inputs", () => {
  it("reads bounded owner-scoped planned sessions, not events or group-event activity plans", async () => {
    const { db, tables } = emptyReadDb();
    const result = await createEventReadRepository(db as never).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      profileId: "profile-1",
    });
    expect(result).toMatchObject({
      sourceCounts: { activities: 0, plannedSessions: 0 },
      plannedSessions: [],
      recommendationPlannedSessions: [],
    });
    expect(tables).toContain("planned_sessions");
    expect(tables).not.toContain("events");
    expect(tables).not.toContain("group_events");
  });
});
