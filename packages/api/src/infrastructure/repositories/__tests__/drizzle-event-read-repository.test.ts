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
      const builder = Object.assign(
        Promise.resolve(table === "profiles" ? [{ planningTimezone: "UTC" }] : []),
        {
          from: () => builder,
          leftJoin: () => builder,
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
        },
      );
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

  it("keeps a new reference-based row's absent legacy provenance nullable", async () => {
    const newRow = {
      id: "session-1",
      planning_date: "2026-07-20",
      original_target_date: "2026-07-20",
      status: "scheduled" as const,
      completed_activity_id: null,
      training_plan_id: null,
      training_plan_revision: null,
      activity_plan_id: "plan-1",
      activity_plan_revision: null,
      resolution_manifest: null,
      prescription_captured_at: null,
      current_plan_name: "Current run",
      current_plan_structure: { version: 5, activity_category: "run", items: [] },
      current_plan_updated_at: new Date("2026-07-20T12:00:00.000Z"),
    };
    const db = {
      select(selection?: Record<string, unknown>) {
        const result =
          "planningTimezone" in (selection ?? {})
            ? [{ planningTimezone: "UTC" }]
            : "resolution_manifest" in (selection ?? {})
              ? [newRow]
              : [];
        const builder = Object.assign(Promise.resolve(result), {
          from: () => builder,
          leftJoin: () => builder,
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
        });
        return builder;
      },
    };

    const result = await createEventReadRepository(db as never).getEffectivePlanLoadInputs({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      profileId: "profile-1",
    });

    expect(result.plannedSessions).toEqual([
      expect.objectContaining({
        id: "session-1",
        currentPlan: expect.objectContaining({ id: "plan-1", name: "Current run" }),
        resolutionManifest: null,
      }),
    ]);
  });
});
